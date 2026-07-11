const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Valid forward transitions for incident status.
// Keeping this here (not just relying on the enum) stops a dispatcher
// or a buggy client from skipping straight from "reported" to "cleared".
const STATUS_FLOW = {
  reported: ['assigned'],
  assigned: ['en_route'],
  en_route: ['on_scene'],
  on_scene: ['contained'],
  contained: ['cleared'],
  cleared: [],
};

// POST /api/incidents - citizen submits a new report
router.post('/', async (req, res) => {
  const { category, latitude, longitude, description, photo_urls, reporter_id } = req.body;

  if (!category || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'category, latitude, and longitude are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO incidents (type, category, location, description, photo_urls, reporter_id)
       VALUES ('fire', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6)
       RETURNING id, type, category, status, description, photo_urls, created_at,
                 ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude`,
      [category, longitude, latitude, description || null, photo_urls || [], reporter_id || null]
    );

    const incident = result.rows[0];

    // Log the initial status into history for audit trail
    await pool.query(
      `INSERT INTO status_history (incident_id, status, changed_by) VALUES ($1, 'reported', $2)`,
      [incident.id, reporter_id || null]
    );

    // Broadcast to any connected dispatcher dashboards in real time
    req.app.get('io')?.emit('incident:new', incident);

    res.status(201).json(incident);
  } catch (err) {
    console.error('Error creating incident:', err.message);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// GET /api/incidents - list incidents (dispatcher feed), newest first
// Optional query params: ?status=reported&category=structure_fire
router.get('/', async (req, res) => {
  const { status, category } = req.query;
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT id, type, category, status, description, photo_urls, created_at, updated_at,
              ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
       FROM incidents
       ${whereClause}
       ORDER BY created_at DESC`,
      values
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching incidents:', err.message);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// GET /api/incidents/:id - single incident, with status history and assignment
router.get('/:id', async (req, res) => {
  try {
    const incidentResult = await pool.query(
      `SELECT id, type, category, status, description, photo_urls, created_at, updated_at,
              ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
       FROM incidents WHERE id = $1`,
      [req.params.id]
    );

    if (incidentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const historyResult = await pool.query(
      `SELECT status, changed_by, changed_at FROM status_history
       WHERE incident_id = $1 ORDER BY changed_at ASC`,
      [req.params.id]
    );

    res.json({ ...incidentResult.rows[0], history: historyResult.rows });
  } catch (err) {
    console.error('Error fetching incident:', err.message);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// PATCH /api/incidents/:id/status - responder or dispatcher updates status
router.patch('/:id/status', async (req, res) => {
  const { status: newStatus, changed_by } = req.body;

  if (!newStatus) {
    return res.status(400).json({ error: 'status is required' });
  }

  try {
    const current = await pool.query('SELECT status FROM incidents WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const currentStatus = current.rows[0].status;
    const allowedNext = STATUS_FLOW[currentStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      return res.status(400).json({
        error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
        allowed_next: allowedNext,
      });
    }

    const updateResult = await pool.query(
      `UPDATE incidents SET status = $1 WHERE id = $2
       RETURNING id, status, updated_at`,
      [newStatus, req.params.id]
    );

    await pool.query(
      `INSERT INTO status_history (incident_id, status, changed_by) VALUES ($1, $2, $3)`,
      [req.params.id, newStatus, changed_by || null]
    );

    const updated = updateResult.rows[0];
    req.app.get('io')?.emit('incident:statusUpdate', updated);

    res.json(updated);
  } catch (err) {
    console.error('Error updating incident status:', err.message);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

module.exports = router;
