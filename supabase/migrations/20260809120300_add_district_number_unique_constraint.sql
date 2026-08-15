/*
  # Add a partial UNIQUE index on districts, excluding at-large seats

  1. Why
    The LegiScan sync job (Phase 2 of the PA House/Senate rollout) needs to
    upsert `districts` idempotently by (legislative_body_id, district_number)
    every sync cycle — without a unique target to conflict on, a naive
    "insert if not found" upsert is a check-then-act race and re-running the
    sync could create duplicate district rows for the same real-world seat.

  2. Real production error this replaces
    A plain `UNIQUE (legislative_body_id, district_number)` constraint (this
    migration's first version) failed to apply in production: ERROR 23505,
    key (a7792d73-3d93-4184-b5a9-600fc363caab [Philadelphia City Council],
    'At-Large') duplicated. Philadelphia City Council has 7 at-large
    (non-geographic, citywide) seats, and "At-Large" is not a real per-seat
    district number the way "1" through "10" are — it's a shared label, and
    at least two `districts` rows carry it. This is consistent with the rest
    of the app: `RepProfilePage.tsx:74`'s `isAtLarge = !rep?.district_id`
    and `SignUpPage.tsx:102`'s `.not('district_number', 'eq', 'At-Large')`
    both already treat "At-Large" as a non-unique, non-geographic sentinel
    rather than a real district identity — a plain UNIQUE constraint was
    wrong to assume every `district_number` is unique per body, not a data
    problem to "clean up". (Whether every at-large representative's
    `district_id` actually points to one of these rows, or they're
    unreferenced bookkeeping rows, wasn't resolved and doesn't need to be —
    the fix below works either way.)

  3. Fix
    A partial unique index — unique everywhere EXCEPT rows literally labeled
    "At-Large" — preserves the original goal without touching or
    reinterpreting the existing City Council at-large data model. PA
    House/Senate have no at-large seats at all (report: "all single-member"),
    so every row the LegiScan sync job ever upserts satisfies this index's
    predicate and gets the same idempotency guarantee as a plain unique
    constraint would have given it.
*/

CREATE UNIQUE INDEX IF NOT EXISTS districts_legislative_body_id_district_number_key
  ON districts (legislative_body_id, district_number)
  WHERE district_number <> 'At-Large';
