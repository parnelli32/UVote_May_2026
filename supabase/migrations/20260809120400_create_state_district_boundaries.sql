/*
  # Add PostGIS boundary tables for PA House / PA Senate district resolution

  1. Why
    Report Section 2: self-host point-in-polygon lookups against PennDOT's
    official PA House/Senate boundary GeoJSON, run server-side (the combined
    GeoJSON is ~20MB, verified directly against
    https://www.pasda.psu.edu/json/PaHouse2024_03.geojson (13.9MB) and
    https://www.pasda.psu.edu/json/PaSenatorial2024_03.geojson (6.2MB) —
    must never ship to the browser). PostGIS is a native Postgres extension,
    so this is one `ST_Contains` query per lookup, not a separate GIS service.

  2. Changes
    - Enable the `postgis` extension.
    - New tables `pa_house_boundaries` / `pa_senate_boundaries`: one row per
      district polygon (district_number + geometry), loaded by the
      `resolve-state-districts` Edge Function's one-time `load-boundaries`
      mode, not by this migration — the migration only creates the shape.
      Kept as two separate tables (rather than one table with a body_id
      column) because the two source GeoJSON files are maintained
      independently by PennDOT on independent update cycles.

  3. Security
    - RLS enabled, no anon/authenticated read policy — boundary geometry is
      only ever queried server-side by the SECURITY DEFINER resolution
      function below, never fetched by a client. Writes happen via the
      service-role Edge Function, which bypasses RLS.
    - `resolve_user_state_districts(p_lat, p_lng)`: SECURITY DEFINER RPC that
      resolves a single lat/lng against both boundary tables and returns the
      matched (legislative_body_id, district_id) pairs — never the raw
      boundary geometry — so it can safely be called with the anon/
      authenticated key from the signup flow without a broad table grant.
*/

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS pa_house_boundaries (
  district_number text PRIMARY KEY,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pa_senate_boundaries (
  district_number text PRIMARY KEY,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pa_house_boundaries_geom_idx ON pa_house_boundaries USING GIST (geom);
CREATE INDEX IF NOT EXISTS pa_senate_boundaries_geom_idx ON pa_senate_boundaries USING GIST (geom);

ALTER TABLE pa_house_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pa_senate_boundaries ENABLE ROW LEVEL SECURITY;
-- Deliberately no SELECT/INSERT/UPDATE/DELETE policy for authenticated/anon —
-- only the service role (sync/load job) and SECURITY DEFINER functions below
-- ever touch these tables directly.

-- ── Resolution function ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_user_state_districts(p_lat double precision, p_lng double precision)
RETURNS TABLE (legislative_body_id uuid, district_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_point geometry;
  v_house_district_number text;
  v_senate_district_number text;
BEGIN
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  SELECT hb.district_number INTO v_house_district_number
  FROM pa_house_boundaries hb
  WHERE ST_Contains(hb.geom, v_point)
  LIMIT 1;

  SELECT sb.district_number INTO v_senate_district_number
  FROM pa_senate_boundaries sb
  WHERE ST_Contains(sb.geom, v_point)
  LIMIT 1;

  IF v_house_district_number IS NOT NULL THEN
    RETURN QUERY
      SELECT d.legislative_body_id, d.district_id
      FROM districts d
      WHERE d.legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be'
        AND d.district_number = v_house_district_number;
  END IF;

  IF v_senate_district_number IS NOT NULL THEN
    RETURN QUERY
      SELECT d.legislative_body_id, d.district_id
      FROM districts d
      WHERE d.legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c'
        AND d.district_number = v_senate_district_number;
  END IF;
END;
$$;

-- Callable by anon (signup, before a session exists) and authenticated
-- (bulk backfill triggers this per-user, and a user could theoretically
-- re-resolve their own districts later e.g. after moving).
GRANT EXECUTE ON FUNCTION resolve_user_state_districts(double precision, double precision) TO anon, authenticated;

-- ── Boundary load helper ──────────────────────────────────────────────────────
-- Upserts one district's polygon, converting GeoJSON geometry text (as sent by
-- the resolve-state-districts Edge Function's load-boundaries mode) into a
-- PostGIS geometry. The Supabase JS client has no way to express
-- ST_GeomFromGeoJSON(...) inline through .insert(), so this does the
-- conversion server-side. p_table is validated against a fixed allowlist
-- rather than interpolated directly, since it ultimately drives a dynamic
-- EXECUTE — never widen this allowlist without keeping that check.
CREATE OR REPLACE FUNCTION load_boundary_row(p_table text, p_district_number text, p_geometry_geojson text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table NOT IN ('pa_house_boundaries', 'pa_senate_boundaries') THEN
    RAISE EXCEPTION 'load_boundary_row: unsupported table %', p_table;
  END IF;

  EXECUTE format(
    'INSERT INTO %I (district_number, geom, loaded_at)
     VALUES ($1, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), now())
     ON CONFLICT (district_number)
     DO UPDATE SET geom = EXCLUDED.geom, loaded_at = EXCLUDED.loaded_at',
    p_table
  ) USING p_district_number, p_geometry_geojson;
END;
$$;

-- Only the service-role Edge Function calls this — never grant to anon/authenticated.
REVOKE ALL ON FUNCTION load_boundary_row(text, text, text) FROM anon, authenticated;
