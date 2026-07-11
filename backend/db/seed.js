// Run with: npm run db:seed
// Populates sample Cape Town fire stations and units so the dispatcher
// dashboard has real units to assign during testing/demos.

const pool = require('../config/db');

// (Coordinates are approximate, for demo purposes only.)
const STATIONS_FIXED = [
  { name: 'Cape Town Central Fire Station', lat: -33.9258, lng: 18.4232 },
  { name: 'Bellville Fire Station', lat: -33.9, lng: 18.6292 },
  { name: 'Belhar Fire Station', lat: -33.9425, lng: 18.6389 },
  { name: 'Milnerton Fire Station', lat: -33.8697, lng: 18.5006 },
];

const UNIT_TYPES_PER_STATION = [
  { name: 'Engine 1', unit_type: 'fire_engine' },
  { name: 'Ladder 1', unit_type: 'ladder_truck' },
  { name: 'Rescue 1', unit_type: 'rescue_vehicle' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const station of STATIONS_FIXED) {
      const stationResult = await client.query(
        `INSERT INTO stations (name, location)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326))
         RETURNING id`,
        [station.name, station.lng, station.lat]
      );
      const stationId = stationResult.rows[0].id;

      for (const unit of UNIT_TYPES_PER_STATION) {
        await client.query(
          `INSERT INTO units (name, unit_type, status, current_location, station_id)
           VALUES ($1, $2, 'available', ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)`,
          [
            `${station.name.split(' ')[0]} ${unit.name}`,
            unit.unit_type,
            station.lng,
            station.lat,
            stationId,
          ]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seeded 4 stations with 3 units each (12 units total).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
