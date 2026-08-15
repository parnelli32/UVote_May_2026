/*
  # Seed legislative_bodies rows for PA House and PA Senate

  1. Changes
    - Insert one `legislative_bodies` row each for the PA House of Representatives
      (203 districts, all single-member) and the PA Senate (50 districts, all
      single-member) — using fixed, explicit UUIDs rather than gen_random_uuid()
      so the frontend can reference them as stable constants, the same way
      `PHILLY_COUNCIL_BODY_ID` is a hardcoded literal in
      `src/data/legislativeGuides.ts`. No existing row (Philadelphia City
      Council) is touched.
    - No `districts`/`representatives` rows are created here — those are
      populated by the LegiScan sync job's `getSessionPeople` pass (report
      Section 5, step 2), not hand-seeded in a migration, since PA House/Senate
      district data changes only on a decade-scale redistricting cycle but the
      actual member-to-district assignments should come from the same
      authoritative source (LegiScan) the bill data does, not be duplicated
      here by hand.

  2. Notes
    - `ON CONFLICT DO NOTHING` keyed on the primary key makes this migration
      safe to have run more than once (idempotent-safe to re-read later,
      matching this project's migration convention).
*/

INSERT INTO legislative_bodies (legislative_body_id, name, total_reps, total_districts, total_atlarge)
VALUES
  ('3b6dee71-7cbd-41f1-95d0-3f997cf035be', 'Pennsylvania House of Representatives', 203, 203, 0),
  ('474bb689-6767-4a56-8429-c09c20bc715c', 'Pennsylvania Senate', 50, 50, 0)
ON CONFLICT (legislative_body_id) DO NOTHING;
