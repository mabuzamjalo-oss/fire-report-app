/**
 * AI Dispatcher Service
 *
 * When a new incident comes in, this service:
 *   1. Queries PostGIS for the closest available units (ordered by real distance)
 *   2. Sends incident details + candidate units to Claude
 *   3. Claude decides HOW MANY units to send and WHICH ONE(S) based on severity
 *   4. The service auto-assigns those units and advances the incident to 'assigned'
 *   5. Emits socket events so every dashboard updates live
 *
 * This means zero human dispatcher needed for routine incidents.
 * The dispatcher dashboard still shows everything in real time and can
 * override any AI decision manually.
 */

const pool = require('../config/db');

// ─── Claude API call ──────────────────────────────────────────────────────────

async function askClaude(systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content.map((b) => b.text || '').join('');
}

// ─── Find nearest available units via PostGIS ─────────────────────────────────

async function getNearestUnits(incidentLat, incidentLng, limit = 5) {
  const result = await pool.query(
    `SELECT
       u.id,
       u.name,
       u.unit_type,
       u.status,
       s.name AS station_name,
       ST_Y(u.current_location::geometry) AS latitude,
       ST_X(u.current_location::geometry) AS longitude,
       ROUND(
         ST_Distance(
           u.current_location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         )::numeric
       ) AS distance_meters
     FROM units u
     LEFT JOIN stations s ON u.station_id = s.id
     WHERE u.status = 'available'
     ORDER BY u.current_location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
     LIMIT $3`,
    [incidentLng, incidentLat, limit]
  );
  return result.rows;
}

// ─── Assign a unit to an incident (same logic as the manual route) ───────────

async function assignUnitToIncident(unitId, incidentId, client) {
  const assignment = await client.query(
    `INSERT INTO assignments (incident_id, unit_id, dispatcher_id)
     VALUES ($1, $2, NULL)
     RETURNING id, assigned_at`,
    [incidentId, unitId]
  );

  await client.query(`UPDATE units SET status = 'dispatched' WHERE id = $1`, [unitId]);

  return assignment.rows[0];
}

// ─── Main dispatcher function ─────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI fire dispatch controller for the City of Cape Town Fire & Rescue Service.

When you receive a new fire incident report with a list of nearby available units, you must:

1. Assess the severity of the incident from its category and description.
2. Decide how many units to dispatch (usually 1 for minor fires, 2-3 for structure fires or large incidents).
3. Select the best unit(s) from the list, prioritising the closest units first, but also matching unit type to the incident (e.g. prefer a ladder_truck for multi-storey structure fires, a rescue_vehicle for hazmat).
4. Write a short professional dispatch message that will be sent to the responder(s).

Respond ONLY with a valid JSON object — no explanation, no markdown fences. Format:
{
  "severity": "low" | "medium" | "high" | "critical",
  "units_to_dispatch": ["unit_id_1"],
  "reasoning": "One sentence explaining your choice.",
  "dispatch_message": "The message sent to the responding unit(s)."
}`;

async function autoDispatch(incident, io) {
  console.log(`🤖 AI Dispatcher: processing incident ${incident.id} (${incident.category})`);

  try {
    // 1. Find the nearest available units
    const nearbyUnits = await getNearestUnits(incident.latitude, incident.longitude, 5);

    if (nearbyUnits.length === 0) {
      console.warn('⚠️  AI Dispatcher: no available units found — cannot auto-dispatch.');
      return null;
    }

    // 2. Build the prompt for Claude
    const unitList = nearbyUnits
      .map(
        (u, i) =>
          `${i + 1}. ID: ${u.id} | Name: ${u.name} | Type: ${u.unit_type} | Station: ${u.station_name} | Distance: ${u.distance_meters}m`
      )
      .join('\n');

    const userMessage = `
NEW INCIDENT REPORT:
- Category: ${incident.category.replace(/_/g, ' ')}
- Description: ${incident.description || 'No additional description provided.'}
- Location: ${incident.latitude}, ${incident.longitude}

AVAILABLE UNITS (ordered by proximity to incident):
${unitList}

Dispatch the most appropriate unit(s) now.`.trim();

    // 3. Ask Claude to decide
    const rawResponse = await askClaude(SYSTEM_PROMPT, userMessage);
    let decision;
    try {
      decision = JSON.parse(rawResponse.replace(/```json|```/g, '').trim());
    } catch {
      console.error('AI Dispatcher: failed to parse Claude response:', rawResponse);
      return null;
    }

    console.log(`🤖 AI Decision — severity: ${decision.severity} | reasoning: ${decision.reasoning}`);

    if (!decision.units_to_dispatch || decision.units_to_dispatch.length === 0) {
      console.warn('AI Dispatcher: Claude returned no units to dispatch.');
      return null;
    }

    // Validate that all chosen unit IDs are in our nearby list (safety check so
    // Claude can't hallucinate a unit that doesn't exist).
    const validIds = new Set(nearbyUnits.map((u) => u.id));
    const chosenIds = decision.units_to_dispatch.filter((id) => validIds.has(id));

    if (chosenIds.length === 0) {
      // Fallback: just pick the closest unit ourselves
      console.warn('AI Dispatcher: Claude returned invalid unit IDs — falling back to closest unit.');
      chosenIds.push(nearbyUnits[0].id);
    }

    // 4. Assign the chosen unit(s) inside a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const unitId of chosenIds) {
        await assignUnitToIncident(unitId, incident.id, client);
      }

      // Advance incident status to 'assigned'
      await client.query(
        `UPDATE incidents SET status = 'assigned' WHERE id = $1`,
        [incident.id]
      );
      await client.query(
        `INSERT INTO status_history (incident_id, status, changed_by)
         VALUES ($1, 'assigned', NULL)`,
        [incident.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // 5. Build rich result object and emit to dashboard
    const assignedUnits = nearbyUnits.filter((u) => chosenIds.includes(u.id));
    const dispatchResult = {
      incident_id: incident.id,
      severity: decision.severity,
      reasoning: decision.reasoning,
      dispatch_message: decision.dispatch_message,
      assigned_units: assignedUnits.map((u) => ({
        id: u.id,
        name: u.name,
        unit_type: u.unit_type,
        station_name: u.station_name,
        distance_meters: u.distance_meters,
      })),
      dispatched_at: new Date().toISOString(),
    };

    io?.emit('ai:dispatched', dispatchResult);
    io?.emit('incident:statusUpdate', { id: incident.id, status: 'assigned' });
    io?.emit('incident:assigned', { incident_id: incident.id });

    console.log(
      `✅ AI Dispatcher: assigned ${assignedUnits.map((u) => u.name).join(', ')} to incident ${incident.id}`
    );

    return dispatchResult;
  } catch (err) {
    console.error('❌ AI Dispatcher error:', err.message);
    return null;
  }
}

module.exports = { autoDispatch };