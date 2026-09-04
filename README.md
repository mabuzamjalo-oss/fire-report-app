# 🚒 Fire Incident Reporting & Dispatch System

A full-stack, real-time incident-to-dispatch pipeline built for the South African fire service context: a citizen reports a fire from their phone, it appears instantly on a dispatcher's live map, the dispatcher assigns a fire unit, and a responder updates status from the field until the incident is resolved — all four pieces talking to one backend in real time.

**Built by [Sinemihlali Mjalo] (https://github.com/mabuzamjalooss)** — final-year BEng Technology Honours (Computer Engineering), Cape Peninsula University of Technology.

---

## Why this exists

South Africa's municipal fire services face a well-documented set of pressures: ageing infrastructure, unreliable water supply, and critically a lack of integrated data systems for reporting and dispatch. In 2022 alone, South Africa recorded over 32,000 fires across 36 municipal fire services, resulting in R4.2 billion in losses and 485 fatalities. Every minute a dispatcher spends interpreting a panicked phone call instead of seeing a precise location and category on a map is a minute a fire has to grow.

This project is a working prototype of what a modern reporting-to-dispatch pipeline could look like: GPS-precise, category-structured, and live — not a phone call and a paper log.

## System Architecture

```
┌───────────────────┐      REST API       ┌────────────────────────┐
│    Citizen App     │ ──────────────────> │                        │
│ (React Native /    │                     │      Backend API       │
│    Expo)           │                     │  (Node.js + Express)   │
└───────────────────┘                      │                        │
                                            │  PostgreSQL + PostGIS  │
┌───────────────────┐   Socket.IO (live)   │   (geospatial data)    │
│    Dispatcher       │ <──────────────────>│                        │
│    Dashboard        │                     │      Socket.IO         │
│  (React + Leaflet)  │                     │   (real-time push)     │
└───────────────────┘                      └────────────────────────┘
                                                       ^
┌───────────────────┐          REST API +             │
│   Responder App     │ ──────────────────────────────┘
│  (React, mobile-    │
│   friendly web)     │
└───────────────────┘
```

| Component | Stack | Role |
|---|---|---|
| **Backend** | Node.js, Express, PostgreSQL, PostGIS, Socket.IO | API, geospatial storage, real-time event broadcasting |
| **Citizen App** | React Native, Expo SDK 54 | GPS-tagged incident reporting with photo capture |
| **Dispatcher Dashboard** | React, Vite, Leaflet | Live incident map, unit assignment |
| **Responder App** | React, Vite | Field status updates (En Route → On Scene → Contained → Cleared) |

## Demo Flow

1. A citizen opens the mobile app, selects an incident category (structure fire, veld fire, vehicle fire, informal settlement fire, hazmat), captures their GPS location, optionally attaches a photo, and submits.
2. The report appears **instantly** on the dispatcher's live map — no refresh — pushed via Socket.IO.
3. The dispatcher clicks the incident and assigns an available fire unit from a live roster.
4. The responder (in the field) sees the assignment appear on their app and advances the incident through its lifecycle.
5. Every status change reflects live back on the dispatcher's dashboard.

## Key Engineering Decisions

- **PostGIS for geospatial queries** — incidents, units, and stations are stored as real geography points, enabling proper distance-based queries (`/api/units/nearest`) rather than naive lat/lng math.
- **Server-enforced status flow** — the incident lifecycle (`reported → assigned → en_route → on_scene → contained → cleared`) is validated server-side, so no client can skip steps.
- **Transactional unit assignment** — assigning a unit uses a database transaction with row-level locking, preventing two dispatchers from double-booking the same fire engine.
- **Real-time via Socket.IO, not polling** — the dashboard and responder app react to server-pushed events (`incident:new`, `incident:statusUpdate`, `incident:assigned`) instead of repeatedly asking "anything new?"
- **`type: fire | police` from day one** — the schema is deliberately shaped to support adding police incident reporting later without a database migration.
- **Web apps for dispatcher/responder, not more mobile apps** — a deliberate choice: these roles use issued devices/browsers, not app-store downloads, which also sidesteps mobile app-store version-lag entirely.

## Getting Started

Each of the four components has its own setup instructions:

- [`backend/README.md`](./backend/README.md) — API setup, database schema, seeding sample fire units
- [`citizen-app/SETUP.md`](./citizen-app/SETUP.md) — running the mobile app via Expo Go
- `dispatcher-dashboard/` — `npm install && npm run dev`
- `responder-app/` — `npm install && npm run dev`

Quick start, in order:

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env   # then fill in your PostgreSQL credentials
npm run db:init
npm run db:seed
npm run dev

# 2. Dispatcher dashboard
cd ../dispatcher-dashboard
npm install
npm run dev

# 3. Citizen app (update api.js with your local IP first)
cd ../citizen-app
npm install
npm start

# 4. Responder app
cd ../responder-app
npm install
npm run dev
```

## Known Limitations / Roadmap

- No authentication yet — dispatcher/responder roles aren't login-gated (planned next).
- Responder app shows all active incidents rather than filtering by the responder's assigned unit.
- Nearest-unit auto-suggestion exists at the API level (`GET /api/units/nearest`) but isn't yet surfaced in the dashboard UI.
- No production deployment yet — currently runs locally against a local PostgreSQL instance.
- Police incident type is schema-ready but not yet built out on the frontend.

## Tech Stack Summary

`Node.js` · `Express` · `PostgreSQL` · `PostGIS` · `Socket.IO` · `React` · `React Native` · `Expo` · `Vite` · `Leaflet`

## License

This is a personal portfolio/academic project. Feel free to explore the code for learning purposes.
