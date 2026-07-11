const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/units - list all units (dispatcher uses this to see what's available)
router.get('/', async (req, res) => {
  const { status } = req.query;
  const whereClause = status ? 'WHERE status = $1' : '';
  const values = status ? [status] : [];

  try {
    const result = await pool.query(
      `SELECT id, name, unit_type, status, station_id,
              ST_Y(current_location::geometry) AS latitude,
              ST_X(current_location::geometry) AS longitude
       FROM units ${whereClause}
       ORDER BY name`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching units:', err.message);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// GET /api/units/nearest?lat=..&lng=..&limit=5
// Stretch-goal building block: returns units ordered by distance to a point.
// Dispatcher dashboard can call this to get auto-suggestions, then still
// requires a manual click to confirm the assignment.
router.get('/nearest', async (req, res) => {
  const { lat, lng, limit } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng query params are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, name, unit_type, status,
              ST_Y(current_location::geometry) AS latitude,
              ST_X(current_location::geometry) AS longitude,
              ST_Distance(current_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
       FROM units
       WHERE status = 'available'
       ORDER BY current_location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       LIMIT $3`,
      [lng, lat, limit || 5]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching nearest units:', err.message);
    res.status(500).json({ error: 'Failed to fetch nearest units' });
  }
});

// POST /api/units/:id/assign - dispatcher assigns a unit to an incident
router.post('/:id/assign', async (req, res) => {
  const { incident_id, dispatcher_id } = req.body;
  const unitId = req.params.id;

  if (!incident_id) {
    return res.status(400).json({ error: 'incident_id is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const unitCheck = await client.query('SELECT status FROM units WHERE id = $1 FOR UPDATE', [unitId]);
    if (unitCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Unit not found' });
    }
    if (unitCheck.rows[0].status !== 'available') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Unit is not available' });
    }

    const assignment = await client.query(
      `INSERT INTO assignments (incident_id, unit_id, dispatcher_id)
       VALUES ($1, $2, $3) RETURNING id, assigned_at`,
      [incident_id, unitId, dispatcher_id || null]
    );

    await client.query(`UPDATE units SET status = 'dispatched' WHERE id = $1`, [unitId]);
    await client.query(`UPDATE incidents SET status = 'assigned' WHERE id = $1`, [incident_id]);
    await client.query(
      `INSERT INTO status_history (incident_id, status, changed_by) VALUES ($1, 'assigned', $2)`,
      [incident_id, dispatcher_id || null]
    );

    await client.query('COMMIT');

    req.app.get('io')?.emit('incident:assigned', {
      incident_id,
      unit_id: unitId,
      assignment_id: assignment.rows[0].id,
    });

    res.status(201).json(assignment.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error assigning unit:', err.message);
    res.status(500).json({ error: 'Failed to assign unit' });
  } finally {
    client.release();
  }
});

module.exports = router;
