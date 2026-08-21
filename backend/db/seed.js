const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const geojson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fire_stations.geojson'), 'utf8')
);

const HQ_CLASSES = new Set([
  'DIVISIONAL HQ', 'DISTRICT HQ - WEST', 'DISTRICT HQ - NORTH',
  'DISTRICT HQ - EAST', 'FIRE SERVICE HEAD OFFICE',
]);

function unitsForClass(cls) {
  if (HQ_CLASSES.has(cls)) {
    return [
      { name: 'Engine 1',  unit_type: 'fire_engine' },
      { name: 'Ladder 1',  unit_type: 'ladder_truck' },
      { name: 'Rescue 1',  unit_type: 'rescue_vehicle' },
    ];
  }
  return [{ name: 'Engine 1', unit_type: 'fire_engine' }];
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM status_history');
    await client.query('DELETE FROM units');
    await client.query('DELETE FROM stations');

    let sc = 0, uc = 0;
    for (const feature of geojson.features) {
      const { FIRE_STN_NAME, FIRE_STN_CODE, FIRE_STN_CLASS } = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;

      const { rows } = await client.query(
        `INSERT INTO stations (name, location)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)) RETURNING id`,
        [FIRE_STN_NAME, lng, lat]
      );
      const stationId = rows[0].id; sc++;

      for (const unit of unitsForClass(FIRE_STN_CLASS)) {
        await client.query(
          `INSERT INTO units (name, unit_type, status, current_location, station_id)
           VALUES ($1, $2, 'available', ST_SetSRID(ST_MakePoint($3, $4), 4326), $5)`,
          [`${FIRE_STN_CODE} ${unit.name}`, unit.unit_type, lng, lat, stationId]
        );
        uc++;
      }
    }
    await client.query('COMMIT');
    console.log(`✅ Seeded ${sc} real Cape Town stations with ${uc} units.`);
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
