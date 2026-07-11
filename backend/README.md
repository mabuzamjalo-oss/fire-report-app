# Fire Incident Reporting & Dispatch — Backend

Phase 1 of the build: Node.js/Express API + PostgreSQL/PostGIS database,
with Socket.IO for real-time push to the dispatcher dashboard.

## Prerequisites

- Node.js (v18+)
- PostgreSQL (v14+) with the PostGIS extension available
- On macOS: `brew install postgresql postgis`
- On Ubuntu: `sudo apt install postgresql postgresql-contrib postgis`

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create the database:
   ```
   createdb fire_report_db
   ```

3. Copy the environment file and fill in your local DB credentials:
   ```
   cp .env.example .env
   ```

4. Initialize the schema (creates tables, enums, indexes):
   ```
   npm run db:init
   ```

5. Start the dev server (auto-restarts on file changes):
   ```
   npm run dev
   ```

6. Confirm it's running:
   ```
   curl http://localhost:4000/health
   ```
   Should return `{"status":"ok"}`.

## API Endpoints (v1)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/incidents | Citizen submits a new fire report |
| GET | /api/incidents | List incidents (dispatcher feed). Supports `?status=` and `?category=` filters |
| GET | /api/incidents/:id | Single incident with full status history |
| PATCH | /api/incidents/:id/status | Responder/dispatcher advances incident status |
| GET | /api/units | List all units. Supports `?status=` filter |
| GET | /api/units/nearest?lat=&lng= | Nearest *available* units to a point (for auto-suggest) |
| POST | /api/units/:id/assign | Dispatcher assigns a unit to an incident |

## Real-time events (Socket.IO)

The dispatcher dashboard should connect and listen for:
- `incident:new` — fresh report comes in
- `incident:statusUpdate` — a responder changed status
- `incident:assigned` — a unit was assigned to an incident

## Design notes

- **Status flow is enforced server-side** (see `STATUS_FLOW` in `routes/incidents.js`)
  so a client can't skip straight from "reported" to "cleared".
- **Anonymous reporting is supported** — `reporter_id` is nullable.
- **`type` field on incidents is already `fire | police`** — this is the hook
  for adding police reporting later without changing the schema.
- **Unit assignment uses a DB transaction** so a unit can't be double-booked
  if two dispatchers click at the same time.

## Next steps (later phases)

- Phase 2: Citizen mobile app (React Native)
- Phase 3: Wire Socket.IO events into a live dispatcher dashboard
- Phase 4: Dispatcher dashboard (React web) with map view
- Phase 5: Responder app for field status updates
- Phase 6: Deploy to AWS, write up architecture for portfolio
