---
name: supabase-schema-change
description: Use this skill whenever a change to UVote's Supabase database is needed — adding or altering a table/column, or adding/changing a Row Level Security (RLS) policy in supabase/migrations/. Always consult this skill before writing a migration SQL file by hand, and before touching anything in src/lib/types.ts related to the Database type. This project has already shipped two production bugs from getting RLS policies subtly wrong (silent write failures with no client-side error), so treat any raw migration or policy edit as high-risk until it follows this checklist.
---

# UVote Supabase schema changes

This repo's schema lives entirely in `supabase/migrations/` (timestamped SQL files, applied in order) and is mirrored by hand in `src/lib/types.ts` (there is no `supabase gen types` codegen step). Every schema change therefore has two places that must agree, plus RLS policies that are easy to get subtly wrong in ways Postgres and Supabase won't warn you about.

## Why this is worth a checklist

Two migrations in this repo's history exist purely to fix RLS mistakes that shipped to production:

- `20260528233654_add_admin_write_policies.sql` — `bills`/`districts`/`representatives` had SELECT policies but no INSERT/UPDATE/DELETE policies. The admin panel showed "saved" but nothing persisted, because **the Supabase JS client returns no error when RLS blocks a write — it just reports 0 rows affected.**
- `20260528234206_fix_bill_sponsors_rls_write_policies.sql` — a `FOR ALL` policy had a `USING` clause but no `WITH CHECK` clause. Postgres requires `WITH CHECK` for INSERT/UPDATE; without it, inserts on `bill_sponsors` (co-sponsors) silently vanished on save.

Both bugs compiled fine, passed lint and typecheck, and looked correct in the UI until someone noticed data wasn't actually saving. That's the failure mode this checklist exists to prevent.

## The checklist

For any schema change, do all of these in the same pass — don't split them across separate commits, since a migration without its `types.ts` mirror or its write policies is a half-finished change that will misbehave in ways that are hard to notice.

### 1. Write the migration file

New file in `supabase/migrations/`, named `<timestamp>_<snake_case_description>.sql` (match the existing files' timestamp format). Open with a comment header describing what and why — follow the existing convention:

```sql
/*
  # <Short title>

  1. Changes
    - <bullet list of what this migration does>

  2. Notes
    - <anything a future reader needs to know, e.g. security implications>
*/
```

If you're modifying an existing policy rather than adding a new one, `DROP POLICY IF EXISTS "<name>" ON <table>;` before recreating it — policy names must be unique per table, and this makes the migration idempotent-safe to re-read later.

### 2. Add RLS policies — explicit, one per operation, always with WITH CHECK

**Never use `FOR ALL`.** Write separate `FOR SELECT` / `FOR INSERT` / `FOR UPDATE` / `FOR DELETE` policies. `FOR ALL` with only a `USING` clause silently no-ops every INSERT and UPDATE — that's exactly what broke `bill_sponsors`.

**INSERT and UPDATE policies must have both `USING` and `WITH CHECK`** (identical conditions). Postgres uses `WITH CHECK` to validate the row being written; omitting it on an INSERT/UPDATE policy blocks the write with no error, not just no security effect.

The canonical admin-write pattern in this codebase (used by `bills`, `bill_sponsors`, `districts`, `representatives`) is:

```sql
CREATE POLICY "Admins can insert <table>"
  ON <table> FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE user_id = auth.uid()
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update <table>"
  ON <table> FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can delete <table>"
  ON <table> FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND is_admin = true)
  );
```

Use the `EXISTS (SELECT 1 FROM users WHERE ... AND is_admin = true)` form, not `(SELECT is_admin FROM users WHERE ...) = true` — an earlier migration used the latter and had to be dropped (`20260527205304_drop_admin_rls_policies.sql`) after it conflicted with public-read policies and broke the bill feed for non-admin users. `EXISTS` is the pattern that's actually stuck.

If the table needs to be readable by everyone (not just admins), add a public/anon read policy separately — this app is public-facing for bill browsing, so most tables have one:

```sql
CREATE POLICY "read_<table>_anon"
  ON <table> FOR SELECT
  TO anon
  USING (true);
```

Decide anon vs. authenticated deliberately per table: `user_votes` individual rows stay protected even though aggregate tallies are public (see `bill_vote_tallies` view in `20260526210716_add_public_read_policies.sql`) — don't default to `USING (true)` on a table just because it's convenient.

If a feature needs a cross-user aggregate read (e.g. "how many people in this district voted X"), don't add a broad SELECT policy to expose the raw rows — that recreates the exact bug fixed in `20260602020500_tighten_user_votes_select_policy.sql`, where a policy meant to enable aggregate tallies also let any authenticated user read every individual row. Instead add a narrowly-scoped `SECURITY DEFINER` function that resolves its own membership set server-side (from a district/rep/block id or `auth.uid()`, never a client-supplied user_id array) and returns only aggregate counts, following `member_bill_tallies` and its public callers in `20260602020000_add_alignment_score_and_tally_functions.sql`.

### 3. Update `src/lib/types.ts` in the same pass

Mirror the migration into the hand-maintained `Database['public']` type. For a new or changed table under `Tables`, add/adjust the `Row` shape and update `Insert`, `Update` (typically `Partial<Insert>`), and `Relationships` (an array of foreign-key descriptors, or `[]` if none) — follow the existing per-table shape in that file, e.g. `Insert` is typically `Omit<Row, 'id_field' | 'created_at'> & { id_field?: string; created_at?: string }`. For a new view, add it under `Views` (`Row` + `Relationships`); for a new RPC, add it under `Functions` (`Args` + `Returns`).

**Every table needs all four of `Row`/`Insert`/`Update`/`Relationships`, and every view needs `Row`/`Relationships`, or the whole `Database` type stops satisfying `@supabase/postgrest-js`'s `GenericSchema` constraint.** When that happens there's no type error at the call site — every `.from()`/`.rpc()` call across the *entire app* silently types as `never` instead, which suppresses real type errors project-wide rather than just around the table you changed. `npm run typecheck` passing is not sufficient evidence the type is correct; if a change to this file is large, diff the typecheck error count before/after to confirm it didn't silently drop coverage.

### 4. Verify the write path actually persists — don't trust green typecheck/lint

Because RLS failures are silent at the client level, `npm run typecheck` and `npm run lint` passing tells you nothing about whether the policy is correct. After applying the migration, actually exercise the path end-to-end as the relevant role would: sign in as an admin (or whatever role the policy targets) and perform the real insert/update/delete through the UI (or a one-off query), then re-fetch and confirm the row actually changed. This is the step both historical bugs would have been caught by immediately.

### 5. Flag if this needs admin UI or route changes

Adding a new table that should be manageable from the admin panel is a separate, larger piece of work (a new tab following the `AdminShared.tsx` + per-tab CRUD pattern used by `BillsTab.tsx` / `DistrictsRepsTab.tsx` / `RepVotesTab.tsx`) — this skill covers the database side only. Mention it to the user rather than assuming it's in scope.
