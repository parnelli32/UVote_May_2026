// Two service-role-only operations that can't be done from the client:
//   - mode "load-boundaries": one-time (re-run only when PennDOT publishes new
//     maps) load of the PA House/Senate boundary GeoJSON into PostGIS tables.
//   - mode "backfill": bulk-resolve PA House/Senate districts for every
//     existing user's already-stored street_address, without waiting for them
//     to log back in (report Section 3). Needs service-role because it writes
//     user_districts rows for users other than the caller — RLS on
//     user_districts only allows a user to write their own row.
//
// The per-signup single-address case does NOT go through this function — it
// calls the resolve_user_state_districts(lat, lng) SECURITY DEFINER RPC
// directly from SignUpPage.tsx, since that RPC is deliberately grantable to
// anon/authenticated (it returns only matched body/district ids, never raw
// boundary geometry) and a client RPC call avoids an extra network hop through
// an Edge Function for the common, latency-sensitive path.
//
// NOT LIVE-TESTED against PostGIS/ST_Contains itself — the actual boundary
// load and point-in-polygon matching have not been run against a live
// database. Captain approved verifying this against the real production
// Supabase project (same rigor as the census-blocks migration), but this
// environment has no Supabase access token / service-role key / DB password
// to actually deploy or invoke it with — that credential gap is the
// remaining blocker, not missing approval.
//
// The GeoJSON parsing this function does *was* verified live: downloaded
// both real PASDA files directly (2026-08-09) and confirmed LEG_DISTRI is
// the actual district-number property on every feature (50/50 Senate
// districts numbered 1-50, 203/203 House districts numbered 1-203, both as
// plain unpadded integers — no zero-padding quirk on this side, unlike
// LegiScan's Senate districts, see legiscan-sync/index.ts) and that both
// files mix Polygon and MultiPolygon geometry types, confirming the
// ST_Multi() wrap in load_boundary_row (20260809120400_create_state_
// district_boundaries.sql) is load-bearing, not defensive-only.

import { createAdminClient } from '../_shared/supabaseAdmin.ts';
// Reuses the same AIS client the browser signup flow uses (no browser-specific
// APIs in that file — just fetch — so it runs unmodified under Deno).
import { lookupAddressDistrict } from '../../../src/lib/ais.ts';

const PA_HOUSE_GEOJSON_URL = 'https://www.pasda.psu.edu/json/PaHouse2024_03.geojson';
const PA_SENATE_GEOJSON_URL = 'https://www.pasda.psu.edu/json/PaSenatorial2024_03.geojson';

type GeoJsonFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
};

// LEG_DISTRI is the confirmed real property (verified live against both
// PASDA files — see header comment). The other candidates are kept as a
// defensive fallback only, in case PennDOT renames the field in a future
// republish of these files.
function extractDistrictNumber(properties: Record<string, unknown>): string | null {
  const candidateKeys = ['LEG_DISTRI', 'DISTRICT', 'district', 'district_number', 'LEGDIST', 'HOUSE_ID', 'SENATE_ID'];
  for (const key of candidateKeys) {
    const value = properties[key];
    if (value != null && String(value).trim() !== '') {
      // Normalize away any leading zeros (verified live: LegiScan zero-pads
      // Senate district numbers — "SD-029" — but not House ones; PennDOT's
      // property naming/padding is unverified, so normalize defensively on
      // both sides — see the matching comment in legiscan-sync/index.ts).
      const raw = String(value).trim();
      const numeric = parseInt(raw, 10);
      return Number.isNaN(numeric) ? raw : String(numeric);
    }
  }
  return null;
}

async function loadBoundaryTable(
  admin: ReturnType<typeof createAdminClient>,
  url: string,
  table: 'pa_house_boundaries' | 'pa_senate_boundaries'
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const geojson = (await res.json()) as { features: GeoJsonFeature[] };

  let loaded = 0;
  let skipped = 0;
  for (const feature of geojson.features) {
    const districtNumber = extractDistrictNumber(feature.properties);
    if (!districtNumber) {
      skipped++;
      continue;
    }

    // load_boundary_row (see 20260809120400_create_state_district_boundaries.sql)
    // does the GeoJSON -> PostGIS geometry conversion and MultiPolygon
    // normalization server-side — the JS client has no way to express
    // ST_GeomFromGeoJSON(...) through .insert().
    const { error } = await admin.rpc('load_boundary_row', {
      p_table: table,
      p_district_number: districtNumber,
      p_geometry_geojson: JSON.stringify(feature.geometry),
    });
    if (error) {
      console.error(`Failed to load boundary row for district ${districtNumber} into ${table}:`, error);
      skipped++;
      continue;
    }
    loaded++;
  }
  return { loaded, skipped, total: geojson.features.length };
}

async function backfillExistingUsers(admin: ReturnType<typeof createAdminClient>) {
  const { data: users, error } = await admin
    .from('users')
    .select('user_id, street_address')
    .not('street_address', 'is', null);
  if (error) throw error;

  let resolved = 0;
  let failed = 0;

  for (const user of users ?? []) {
    if (!user.street_address) continue;
    try {
      const ais = await lookupAddressDistrict(user.street_address);
      if (!ais.success || ais.lat == null || ais.lng == null) {
        failed++;
        continue;
      }
      const { data: matches, error: rpcErr } = await admin.rpc('resolve_user_state_districts', {
        p_lat: ais.lat,
        p_lng: ais.lng,
      });
      if (rpcErr || !matches) {
        failed++;
        continue;
      }
      for (const match of matches as { legislative_body_id: string; district_id: string }[]) {
        await admin.from('user_districts').upsert(
          {
            user_id: user.user_id,
            legislative_body_id: match.legislative_body_id,
            district_id: match.district_id,
          },
          { onConflict: 'user_id,legislative_body_id' }
        );
      }
      resolved++;
    } catch (err) {
      console.error(`Backfill failed for user ${user.user_id}:`, err);
      failed++;
    }
  }

  return { resolved, failed, total: (users ?? []).length };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const mode = body.mode;

  try {
    if (mode === 'load-boundaries') {
      const house = await loadBoundaryTable(admin, PA_HOUSE_GEOJSON_URL, 'pa_house_boundaries');
      const senate = await loadBoundaryTable(admin, PA_SENATE_GEOJSON_URL, 'pa_senate_boundaries');
      return new Response(JSON.stringify({ ok: true, house, senate }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'backfill') {
      const result = await backfillExistingUsers(admin);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: 'mode must be "load-boundaries" or "backfill"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('resolve-state-districts failed:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
