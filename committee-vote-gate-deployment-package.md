# UVote committee vote gate — manual deployment instructions

Everything below is Supabase Dashboard (SQL editor + Edge Functions) and
`curl` only, no Supabase CLI or access token needed. This doc is
instructions and pointers only — it does not embed a duplicated copy of
the migration SQL or the `legiscan-sync` source; check those files
directly in this repo for the real, current contents.

## What this ships

1. `bills.reported_from_committee_at` — set by `legiscan-sync` from
   LegiScan's `getBill().progress` array (event 10 = Report Pass, event 11 =
   Report DNP). A bill still sitting in committee can no longer be voted on.
2. `legislative_bodies.requires_committee_report` — `true` only for PA
   House/Senate, so Philadelphia City Council's admin-entered bills stay
   votable exactly as before this gate existed.
3. Tightened `user_votes` INSERT/UPDATE RLS so the gate is enforced
   server-side, not just hidden from lists client-side.
4. `bill_external_refs.committee_backfilled_at` — a one-time-pass
   completion tracker for the new `phase: "backfill"` below.
5. `supabase/functions/legiscan-sync` needs a full redeploy — the normal
   `phase: "bills"` sync path also now writes `reported_from_committee_at`
   on every changed bill going forward, and event 11 (Report DNP) now maps
   `status` to `'failed'` instead of leaving it `'active'` forever. Gains a
   one-time `phase: "backfill"` to back-compute committee status for bills
   already synced before this field existed.

`supabase/functions/legiscan-sync` and its schema (`bills`,
`legislative_bodies`, `bill_external_refs`, `representative_external_refs`,
etc.) were brought into this repo's `main` branch by the legislative-body-
switcher PR (#8) — this package builds directly on top of that, it does not
duplicate it. The one migration below is additive only: 3 new columns plus
the RLS gate.

## Step 1 — run the migration

Source of truth: `supabase/migrations/20260815100000_add_bills_reported_from_committee_at_and_vote_gate.sql`

Open that file in this repo, copy its full contents, and run it via the
Supabase Dashboard SQL editor. It's additive-only (3 new columns) plus a
`DROP POLICY IF EXISTS` / `CREATE POLICY` pair on `user_votes`, so it's
safe to re-run if a prior attempt partially failed.

## Step 2 — redeploy the `legiscan-sync` Edge Function

Source of truth: `supabase/functions/legiscan-sync/index.ts` (the full,
current file — paste it in whole via the Dashboard's Edge Function editor
to replace whatever is currently deployed at that function slot).
`CRON_SECRET` and `LEGISCAN_API_KEY` are unchanged — this is a redeploy of
the same function, not a new one.

Before deploying, a human should diff what's currently live against this
repo's copy, focusing on what this change actually added:

- `computeCommitteeStatus` (`supabase/functions/legiscan-sync/index.ts:449-466`)
  — derives `reportedFromCommitteeAt` / `diedInCommittee` from a bill's raw
  `progress` array.
- The three `reported_from_committee_at` writes inside `syncBills`
  (`supabase/functions/legiscan-sync/index.ts:607`, `:620`, `:678`) — the
  update path, the insert path, and the self-heal/orphan-recovery update
  path.
- `backfillCommitteeStatus` (`supabase/functions/legiscan-sync/index.ts:759-822`)
  — the one-time pass, paginated via `bill_external_refs.committee_backfilled_at`.
- The `phase: "backfill"` wiring in the `Deno.serve` handler
  (`supabase/functions/legiscan-sync/index.ts:824-849`) — routes a
  `{"phase": "backfill"}` request to `backfillCommitteeStatus` before the
  normal people/bills session-lookup path runs.

## Step 3 — run the one-time backfill

Function secrets (`CRON_SECRET`, `LEGISCAN_API_KEY`) are unchanged — this is
a redeploy of the same function slot, nothing new needs to be set.

**Normal sync is unchanged** — the existing cron schedule (or manual
`{{"phase": "people"}}` / `{{"phase": "bills", "limit": N}}` calls) now also
populates `reported_from_committee_at` on every bill it touches, with no
different invocation shape.

**New: one-time committee-status backfill**, for bills already synced
before this field existed:

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/legiscan-sync' \
  -H 'x-cron-secret: <the CRON_SECRET you set>' \
  -H 'Content-Type: application/json' \
  -d '{{"phase": "backfill", "limit": 5}}'
```

Response:
```json
{{"ok":true,"phase":"backfill","limit":5,"updated":5,"failures":0,"remaining":3988,"totalRemaining":3993}}
```

`remaining` is how many still-unchecked bills are left. Loop until it's `0`:

```bash
while true; do
  RESPONSE=$(curl -s -X POST 'https://<project-ref>.supabase.co/functions/v1/legiscan-sync' \
    -H 'x-cron-secret: <the CRON_SECRET you set>' \
    -H 'Content-Type: application/json' \
    -d '{{"phase": "backfill", "limit": 5}}')
  echo "$RESPONSE"
  REMAINING=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('remaining', -1))" 2>/dev/null)
  if [ "$REMAINING" = "0" ]; then
    echo "Backfill complete."
    break
  fi
  if [ -z "$REMAINING" ] || [ "$REMAINING" = "-1" ]; then
    echo "Could not parse remaining from response — stopping, check the response above for an error."
    break
  fi
  sleep 2
done
```

At `limit: 5` and roughly 3,993 total bills, expect on the order of ~800
calls — one `getBill` call per bill (well within LegiScan's 30,000/month
free-tier limit), each call otherwise lightweight (no sponsor/roll-call
upserts, just the committee-status computation). Failures stay in the
candidate set (retried automatically next call) rather than being silently
skipped.

## Verification (do this after Step 3 completes, or on a sample partway through)

Pick a handful of real bills already confirmed to have `rep_votes` rows
(definitely out of committee — a bill only gets a `rep_votes` row from an
actual floor vote) and a handful with none, and check:

```sql
select b.bill_id, b.bill_number, b.status, b.reported_from_committee_at,
       exists (select 1 from rep_votes rv where rv.bill_id = b.bill_id) as has_rep_votes
from bills b
join legislative_bodies lb on lb.legislative_body_id = b.legislative_body_id
where lb.requires_committee_report = true
order by b.bill_number
limit 20;
```

Bills with `has_rep_votes = true` should essentially always have a non-null
`reported_from_committee_at` (a floor vote can't happen before committee).
Cross-check a few against LegiScan's own bill page (`getBill`'s `progress`
array, or the public LegiScan UI) to confirm the specific date/event lines
up.

Then confirm the vote gate is real, not just a client-side hide — as an
authenticated non-admin role, attempt an insert against a bill with
`reported_from_committee_at IS NULL` and `requires_committee_report = true`;
it should be rejected by RLS (`new row violates row-level security
policy`), not silently accepted.
