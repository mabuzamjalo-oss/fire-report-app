const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/stations - all 32 real Cape Town fire stations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name,
              ST_Y(location::geometry) AS latitude,
              ST_X(location::geometry) AS longitude
       FROM stations ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching stations:', err.message);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

module.exports = router;
