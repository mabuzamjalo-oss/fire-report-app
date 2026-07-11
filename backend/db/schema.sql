-- Fire Incident Reporting & Dispatch System
-- Database schema (PostgreSQL + PostGIS)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============ ENUMS ============

CREATE TYPE incident_type AS ENUM ('fire', 'police');

CREATE TYPE incident_category AS ENUM (
  'structure_fire',
  'veld_fire',
  'vehicle_fire',
  'informal_settlement_fire',
  'hazmat',
  'other'
);

CREATE TYPE incident_status AS ENUM (
  'reported',
  'assigned',
  'en_route',
  'on_scene',
  'contained',
  'cleared'
);

CREATE TYPE user_role AS ENUM ('citizen', 'dispatcher', 'responder', 'admin');

CREATE TYPE unit_status AS ENUM ('available', 'dispatched', 'unavailable');

-- ============ TABLES ============

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120),
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(150) UNIQUE,
  password_hash TEXT,               -- NULL allowed for anonymous citizen accounts
  role user_role NOT NULL DEFAULT 'citizen',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,        -- e.g. "Engine 3"
  unit_type VARCHAR(60) NOT NULL,    -- fire_engine, ladder_truck, rescue_vehicle
  status unit_status NOT NULL DEFAULT 'available',
  current_location GEOGRAPHY(POINT, 4326),
  station_id UUID REFERENCES stations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type incident_type NOT NULL DEFAULT 'fire',
  category incident_category NOT NULL,
  status incident_status NOT NULL DEFAULT 'reported',
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  description TEXT,
  photo_urls TEXT[] DEFAULT '{}',
  reporter_id UUID REFERENCES users(id),   -- NULL = anonymous report
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id),
  dispatcher_id UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status incident_status NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INDEXES ============

-- Speeds up "find nearest unit/station" queries
CREATE INDEX idx_units_location ON units USING GIST (current_location);
CREATE INDEX idx_stations_location ON stations USING GIST (location);
CREATE INDEX idx_incidents_location ON incidents USING GIST (location);

-- Speeds up dispatcher dashboard queries (active incidents feed)
CREATE INDEX idx_incidents_status ON incidents (status);
CREATE INDEX idx_incidents_created_at ON incidents (created_at DESC);

-- ============ TRIGGER: auto-update updated_at ============

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_incidents_updated_at
BEFORE UPDATE ON incidents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
