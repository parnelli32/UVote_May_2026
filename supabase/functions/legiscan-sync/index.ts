// LegiScan sync job — PA House + PA Senate, built together per the feasibility
// report (Section 5, step 2): both chambers are one LegiScan session (the PA
// General Assembly covers both), differentiated per-bill by bill-number prefix
// (HB/HR = House, SB/SR = Senate), so there is one pipeline, not two.
//
// Cadence: intended to run on a schedule (see supabase/config.toml
// `[functions.legiscan-sync]`), polling getMasterList and diffing change_hash
// before spending quota on getBill/getRollCall — see report Section 1's cadence
// math (well within the 30,000 query/month free-tier limit at a 4-6hr cadence).
//
// LIVE-VERIFIED (2026-08-09) against the real API with a captain-provided key:
// getSessionList/getMasterList/getBill/getRollCall/getSessionPeople response
// shapes all match the types in _shared/legiscanClient.ts exactly, against
// real PA session 2192 (2025-2026 Regular Session) data. Two real bugs were
// found and fixed by that verification, not just a hypothetical:
//   - LegiScan zero-pads Senate district numbers ("SD-029") but not House
//     ones ("HD-171") — districtNumberFromLegiscanDistrict now normalizes.
//   - A bill's `votes` array includes every roll call across its whole
//     lifecycle (committee votes in both chambers, floor votes in both
//     chambers on crossover) — not just one, so naively upserting rep_votes
//     for every entry would silently overwrite with whichever roll call
//     happened to sync last, since rep_votes has one row per (rep, bill).
//     selectFloorVote picks only the floor vote in the bill's own
//     originating chamber.
//
// BATCHED (2026-08-10, live-verified TWICE): a real cold-start invocation
// hit WORKER_RESOURCE_LIMIT at ~1m49s processing all ~3,750 changed bills in
// one call. A first fix added a `limit` on the bill-processing loop —
// redeployed and re-invoked with limit:25, and it STILL hit the resource
// limit, now at ~71s. That second failure is the real finding: this
// function had TWO independent per-row-round-trip bottlenecks that a
// bill-count `limit` alone doesn't touch, because both ran in full on every
// single invocation regardless of how small the bill batch was:
//   1. syncPeople processed each of the ~260 real PA House/Senate people
//      with up to 5 SEQUENTIAL awaited Supabase calls each (select district,
//      insert/update district, select rep ref, insert/update rep, insert
//      rep ref) — up to ~1,300 round trips, unconditionally, before a
//      single bill was touched. This is almost certainly what consumed most
//      of the 71 seconds on its own.
//   2. upsertRollCallVotes did one SELECT + one UPSERT *per individual vote*
//      on a roll call — up to ~400 round trips for a single bill with a full
//      House floor vote recorded (verified live: real HB17 final-passage
//      vote had 203 votes cast). Even after fixing (1), a handful of bills
//      in a small `limit` batch that happen to have floor votes could
//      independently blow the budget.
// Both are now bulk operations: syncPeople does one bulk fetch of existing
// districts/rep-refs, then bulk INSERTs for everything new (a cold sync goes
// from ~1,300 round trips to roughly 5-6); upsertSponsors and
// upsertRollCallVotes now take a pre-fetched people_id->representative_id
// map (fetched ONCE per invocation, not per vote/sponsor) and do a single
// bulk .upsert() call each instead of one round trip per row. Districts
// still can't use Postgres ON CONFLICT for the insert path — see the note
// on districts_legislative_body_id_district_number_key below — but since
// new-vs-existing is now determined in memory from the bulk fetch, the
// INSERT itself is a plain (non-upsert) multi-row insert, not one row at a
// time.
//
// Also added: `phase` in the request body ("people" | "bills" | "all",
// default "all") so a caller can run the (now fast, but still nonzero)
// people sync once and then call bills-only batches repeatedly, rather than
// re-running people sync on every single bill batch — representatives
// rarely change mid-session. And per-phase timing logged via console.log so
// future resource-limit failures can be diagnosed from the logs directly
// instead of guessed at.
//
// THIRD ROUND (2026-08-10) — real Supabase platform logs (not another guess):
// captain downloaded the actual failing-invocation logs and they showed the
// literal error event "CPU Time exceeded" — a DISTINCT budget from
// wall-clock/network-wait time. Deno Edge Runtime CPU-time limits generally
// don't count time spent awaiting network I/O, only actual synchronous
// compute. This matters because the bulk-round-trip fixes above reduce wall
// time and TLS/serialization overhead, but NOT the cost of JSON-parsing each
// bill's own LegiScan payload (getBill's response is deeply nested —
// sponsors carry full bio/social/capitol_address/links sub-objects; a real
// House floor vote's getRollCall response can have ~200 vote records) —
// that per-bill parsing cost scales with the number of bills processed per
// invocation, which is exactly what DEFAULT_BILL_BATCH_LIMIT/
// MAX_BILL_BATCH_LIMIT below now default much lower (was 25/100, now 5/25),
// since round-trip count and CPU time turned out not to be the same lever.
// Two more things the real logs revealed, both fixed here:
//   - "Failed to insert bill HB99... duplicate key value violates unique
//     constraint bills_bill_number_key" — repeating identically across 5
//     separate real invocations, on the same handful of bill numbers. Root
//     cause: bills.bill_number carries a unique constraint that exists in
//     production but isn't in any migration file in this repo (verified:
//     grepped every migration — pre-existing schema drift, the same
//     category the feasibility report already flagged for bill_priorities).
//     "CPU Time exceeded" is an abrupt worker termination, not a catchable
//     JS exception — nothing after the kill point runs, including this
//     function's own try/catch — so if the kill lands between a successful
//     `bills` insert and the bill_external_refs write that marks it synced,
//     the bill is orphaned: it exists in `bills` (blocking future INSERT via
//     the unique constraint) but is invisible to the "already synced" check
//     (which only looks at bill_external_refs), so every future invocation
//     re-attempts the same doomed insert forever. Fixed: on a bill_number
//     conflict specifically, look the bill up by number, adopt its
//     bill_id, and continue syncing it (self-healing) instead of just
//     logging and skipping.
//   - The logs' `syncPeople: N districts, N representatives upserted`
//     message format is from an OLDER deployed version (the batching-only
//     fix, before the bulk-operations fix above) — proof these specific
//     captured failures predate this file's current phase-gating logic
//     entirely, not evidence that `phase` is being ignored by the code
//     that's actually live now. Worth confirming directly (check the
//     deployed function's logs for this run's actual syncPeople line format)
//     rather than assuming either way.
//
// FOURTH ROUND (2026-08-10) — a captain review caught a real correctness gap
// in the self-heal fix above: it originally looked up the existing bill by
// bill_number ALONE, which is correct for the same-body orphan case actually
// observed (HB/SB prefixes keep House/Senate apart, so today's real
// collisions are always same-body), but is unsafe in general — bill_number
// was never unique on its own in the real world, only within a body, so a
// bill_number-only lookup could silently adopt/merge a genuinely different
// body's bill into the wrong row if two bodies ever produced a coincidentally
// matching number. Two things fixed together, not just the app-code
// workaround alone:
//   - The self-heal lookup (see the comment right above the `.eq('bill_number', ...)`
//     call below) now also filters on `legislative_body_id`, so it can only
//     ever recover a genuine same-body orphan.
//   - 20260810090000_fix_bills_bill_number_constraint_scope.sql drops the
//     undocumented bills_bill_number_key and replaces it with
//     UNIQUE (legislative_body_id, bill_number) — the database now enforces
//     the actual real-world invariant directly, rather than relying on
//     application code alone to avoid the corruption a wrongly-scoped
//     constraint invited.
//
// The district-upsert logic does NOT use Postgres ON CONFLICT for existing
// rows either — districts_legislative_body_id_district_number_key is a
// *partial* unique index (excludes Philadelphia City Council's at-large
// seats, which share the non-geographic label "At-Large"), and Postgres
// only honors ON CONFLICT (cols) DO UPDATE against a *non-partial* unique
// index on exactly those columns. Verified live against real Postgres: the
// obvious `.upsert(..., { onConflict: 'legislative_body_id,district_number' })`
// fails with "no unique or exclusion constraint matching the ON CONFLICT
// specification" against that index, even for a brand-new district.

// COMMITTEE VOTE GATE (2026-08-15): UVote's `bills.status` is too coarse to
// tell "still in committee" apart from "reported out and on the floor
// calendar" — both show `active`. Per LegiScan API User Manual v1.91's
// Status/Progress table, `getBill().progress` (not the coarse top-level
// `status` field) carries the real signal: event 9 = Refer (committee
// referral), event 10 = Report Pass (reported out of committee favorably),
// event 11 = Report DNP (died in committee, "Did Not Pass"). Voting is now
// gated (see the migration adding `bills.reported_from_committee_at` and
// `legislative_bodies.requires_committee_report`) to bills that have a
// Report Pass event in their progress history — computeCommitteeStatus
// below derives that from the raw progress array, used both by the normal
// per-bill sync path and by the one-time backfillCommitteeStatus pass for
// bills synced before this field existed.
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import {
  getSessionList,
  getSessionPeople,
  getMasterList,
  getBill,
  getRollCall,
  type LegiscanSponsor,
  type LegiscanPerson,
} from '../_shared/legiscanClient.ts';
import { mapLegiscanStatus } from '../_shared/legiscanStatusMap.ts';
import type { LegiscanBillVoteSummary } from '../_shared/legiscanClient.ts';

const PA_HOUSE_BODY_ID = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';
const PA_SENATE_BODY_ID = '474bb689-6767-4a56-8429-c09c20bc715c';

function bodyIdForBillNumber(number: string): string | null {
  if (/^HB/i.test(number)) return PA_HOUSE_BODY_ID;
  if (/^SB/i.test(number)) return PA_SENATE_BODY_ID;
  // HR/SR (chamber resolutions) and anything else are deliberately skipped —
  // UVote's `bills` table models legislation, not procedural resolutions.
  return null;
}

function bodyIdForRole(role: string): string | null {
  if (role === 'Rep') return PA_HOUSE_BODY_ID;
  if (role === 'Sen') return PA_SENATE_BODY_ID;
  return null;
}

// "HD-181" -> "181", "SD-1" -> "1", "SD-029" -> "29" (verified live: LegiScan
// zero-pads Senate district numbers — "SD-029" — but not House ones —
// "HD-171" — so this strips leading zeros to normalize both to the same
// unpadded form the PostGIS boundary loader also normalizes to, since a
// silent format mismatch between the two sources would mean districts never
// match).
function districtNumberFromLegiscanDistrict(district: string): string | null {
  const match = district.match(/(\d+)/);
  if (!match) return null;
  return String(parseInt(match[1], 10));
}

// Bulk-fetches every existing legiscan representative_external_refs row into
// a Map (people_id -> representative_id). Shared by syncPeople (to tell new
// vs. existing reps apart), upsertSponsors, and upsertRollCallVotes — all
// three previously did this lookup with one .select() per row (per person,
// per sponsor, per vote), which is exactly the N+1-round-trip pattern that
// produced the WORKER_RESOURCE_LIMIT failures. The table has at most ~260
// rows (one per PA House/Senate legislator), so a full unfiltered fetch is
// always cheap.
async function fetchAllLegiscanRepRefs(
  admin: ReturnType<typeof createAdminClient>
): Promise<Map<string, string>> {
  const refs = new Map<string, string>();
  const pageSize = 1000; // supabase/config.toml's api.max_rows default
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('representative_external_refs')
      .select('representative_id, external_people_id')
      .eq('source', 'legiscan')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      refs.set(row.external_people_id, row.representative_id);
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return refs;
}

async function syncPeople(admin: ReturnType<typeof createAdminClient>, sessionId: number) {
  const t0 = Date.now();
  const people = await getSessionPeople(sessionId);
  const tFetchedPeople = Date.now();

  // Bulk-fetch existing districts for both PA bodies in one query — replaces
  // one .select() per person. Cold start: returns ~0 rows. Every sync after
  // the first: returns essentially everything, so the insert path below has
  // ~nothing to do either.
  const { data: existingDistrictRows, error: districtFetchErr } = await admin
    .from('districts')
    .select('district_id, district_number, legislative_body_id')
    .in('legislative_body_id', [PA_HOUSE_BODY_ID, PA_SENATE_BODY_ID]);
  if (districtFetchErr) throw districtFetchErr;
  const districtMap = new Map<string, string>(); // `${bodyId}:${districtNumber}` -> district_id
  for (const d of existingDistrictRows ?? []) {
    if (d.legislative_body_id && d.district_number) {
      districtMap.set(`${d.legislative_body_id}:${d.district_number}`, d.district_id);
    }
  }

  const repRefsMap = await fetchAllLegiscanRepRefs(admin);
  const tBulkFetch = Date.now();

  type ValidPerson = { person: LegiscanPerson; bodyId: string; districtNumber: string };
  const validPeople: ValidPerson[] = [];
  const newDistrictKeys = new Set<string>();
  const newDistrictRows: { legislative_body_id: string; district_number: string; name: string }[] = [];

  for (const person of people) {
    const bodyId = bodyIdForRole(person.role);
    if (!bodyId) continue;
    const districtNumber = districtNumberFromLegiscanDistrict(person.district);
    if (!districtNumber) {
      console.warn(`Could not parse district number from "${person.district}" for people_id ${person.people_id}`);
      continue;
    }
    validPeople.push({ person, bodyId, districtNumber });
    const key = `${bodyId}:${districtNumber}`;
    if (!districtMap.has(key) && !newDistrictKeys.has(key)) {
      newDistrictKeys.add(key);
      newDistrictRows.push({
        legislative_body_id: bodyId,
        district_number: districtNumber,
        name: `${bodyId === PA_HOUSE_BODY_ID ? 'House' : 'Senate'} District ${districtNumber}`,
      });
    }
  }

  // Plain multi-row INSERT, not .upsert() — these are already confirmed new
  // against districtMap above, and the partial unique index on districts
  // can't be targeted by supabase-js's ON CONFLICT shorthand anyway (see
  // header comment).
  if (newDistrictRows.length > 0) {
    const { data: inserted, error: insertErr } = await admin
      .from('districts')
      .insert(newDistrictRows)
      .select('district_id, district_number, legislative_body_id');
    if (insertErr) throw insertErr;
    for (const d of inserted ?? []) {
      if (d.legislative_body_id && d.district_number) {
        districtMap.set(`${d.legislative_body_id}:${d.district_number}`, d.district_id);
      }
    }
  }
  const tDistricts = Date.now();

  // Split people into "new representative" (bulk insert) vs. "existing
  // representative" (individual update — rare after the first sync, since
  // party/name/title/district essentially never change mid-session; this is
  // exactly why `phase: "people"` exists as its own callable mode below —
  // call it rarely, not on every bill-batch invocation).
  const newRepRows: {
    first_name: string;
    last_name: string;
    party: string;
    district_id: string;
    legislative_body_id: string;
    title: string;
  }[] = [];
  const newRepPeopleIds: number[] = []; // parallel to newRepRows, for matching inserted rows back to people_id
  const existingRepUpdates: { representativeId: string; person: LegiscanPerson; bodyId: string; districtId: string }[] = [];

  for (const { person, bodyId, districtNumber } of validPeople) {
    const districtId = districtMap.get(`${bodyId}:${districtNumber}`);
    if (!districtId) {
      console.error(`No district_id resolved for ${bodyId}/${districtNumber} (people_id ${person.people_id}) — skipping`);
      continue;
    }
    const existingRepId = repRefsMap.get(String(person.people_id));
    if (existingRepId) {
      existingRepUpdates.push({ representativeId: existingRepId, person, bodyId, districtId });
    } else {
      newRepRows.push({
        first_name: person.first_name,
        last_name: person.last_name,
        party: person.party,
        district_id: districtId,
        legislative_body_id: bodyId,
        title: person.role === 'Rep' ? 'State Representative' : 'State Senator',
      });
      newRepPeopleIds.push(person.people_id);
    }
  }

  // Bulk-insert new representatives, then bulk-insert their external_refs.
  // A single non-conflicting multi-row INSERT...VALUES RETURNING preserves
  // input order in Postgres/PostgREST, so zipping newRepRows[i] with the
  // i-th returned row by index is safe here (there's no ON CONFLICT and this
  // function runs one invocation at a time, not concurrently with itself).
  let repsInserted = 0;
  if (newRepRows.length > 0) {
    const { data: insertedReps, error: repInsertErr } = await admin
      .from('representatives')
      .insert(newRepRows)
      .select('representative_id');
    if (repInsertErr) throw repInsertErr;
    repsInserted = insertedReps?.length ?? 0;
    const refRows = (insertedReps ?? []).map((r, i) => ({
      representative_id: r.representative_id,
      source: 'legiscan' as const,
      external_people_id: String(newRepPeopleIds[i]),
    }));
    if (refRows.length > 0) {
      const { error: refInsertErr } = await admin.from('representative_external_refs').insert(refRows);
      if (refInsertErr) throw refInsertErr;
    }
  }
  const tNewReps = Date.now();

  let repsUpdated = 0;
  for (const { representativeId, person, bodyId, districtId } of existingRepUpdates) {
    const { error: updateErr } = await admin
      .from('representatives')
      .update({
        first_name: person.first_name,
        last_name: person.last_name,
        party: person.party,
        district_id: districtId,
        legislative_body_id: bodyId,
        title: person.role === 'Rep' ? 'State Representative' : 'State Senator',
      })
      .eq('representative_id', representativeId);
    if (updateErr) {
      console.error(`Failed to update representative ${representativeId} (people_id ${person.people_id}):`, updateErr);
      continue;
    }
    repsUpdated++;
  }
  const tDone = Date.now();

  console.log(
    `syncPeople timing: getSessionPeople=${tFetchedPeople - t0}ms, bulk-fetch=${tBulkFetch - tFetchedPeople}ms, ` +
    `districts=${tDistricts - tBulkFetch}ms, new-reps=${tNewReps - tDistricts}ms, ` +
    `existing-rep-updates(${existingRepUpdates.length})=${tDone - tNewReps}ms, total=${tDone - t0}ms`
  );
  console.log(
    `syncPeople: ${people.length} people fetched, ${newDistrictRows.length} districts inserted, ` +
    `${repsInserted} representatives inserted, ${repsUpdated} representatives updated`
  );

  return {
    peopleCount: people.length,
    districtsInserted: newDistrictRows.length,
    repsInserted,
    repsUpdated,
  };
}

async function upsertSponsors(
  admin: ReturnType<typeof createAdminClient>,
  billId: string,
  sponsors: LegiscanSponsor[],
  repRefsMap: Map<string, string>
) {
  const rows = sponsors
    .map((sponsor) => {
      const representativeId = repRefsMap.get(String(sponsor.people_id));
      if (!representativeId) return null; // rep not yet synced (syncPeople should have run first) — skip, will pick up next cycle
      return {
        bill_id: billId,
        representative_id: representativeId,
        sponsor_type: (sponsor.sponsor_type_id === 1 ? 'primary' : 'cosponsor') as 'primary' | 'cosponsor',
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  // One bulk upsert instead of one SELECT + one upsert per sponsor —
  // bill_sponsors' unique constraint is a plain (non-partial) one, so
  // ON CONFLICT works normally here.
  const { error } = await admin.from('bill_sponsors').upsert(rows, { onConflict: 'bill_id,representative_id' });
  if (error) console.error(`Failed to upsert sponsors for bill ${billId}:`, error);

  const primary = rows.find((r) => r.sponsor_type === 'primary');
  if (primary) {
    await admin.from('bills').update({ primary_sponsor_id: primary.representative_id }).eq('bill_id', billId);
  }
}

// rep_votes has one row per (representative_id, bill_id) — but a bill's
// `votes` array from getBill covers every roll call across its whole
// lifecycle: committee votes in both chambers, plus a floor vote in each
// chamber once it crosses over (verified live against real HB17 data: 6
// roll calls — 2 House committee, 1 House floor, 2 Senate committee, 1
// Senate floor). The vote that matters for constituent accountability is the
// floor vote in the bill's own originating chamber (matching bodyId).
function selectFloorVote(votes: LegiscanBillVoteSummary[], bodyId: string): LegiscanBillVoteSummary | null {
  const chamber = bodyId === PA_HOUSE_BODY_ID ? 'H' : bodyId === PA_SENATE_BODY_ID ? 'S' : null;
  if (!chamber) return null;
  const floorVotes = votes.filter((v) => v.chamber === chamber && v.desc.toLowerCase().includes('floor'));
  if (floorVotes.length === 0) return null;
  return floorVotes.reduce((latest, v) => (v.date > latest.date ? v : latest));
}

// Derives the committee vote gate from a bill's raw `progress` array (see
// header comment). Looks for event 10 (Report Pass) SPECIFICALLY, not just
// "is the latest event a 10" — `progress` is a cumulative history, so a bill
// that has since moved past committee (floor vote, passage, etc.) still
// carries its earlier Report Pass entry; only using "latest entry is 10"
// would wrongly re-lock a bill that already cleared committee once it
// progresses further. "Died in committee" is narrower: true only when the
// most recent event overall is 11 (Report DNP) with nothing later — a bill
// re-referred and reported a second time (11 followed by a later 10) is not
// treated as dead, since the later Report Pass supersedes it.
function computeCommitteeStatus(
  progress: { date: string; event: number }[] | undefined
): { reportedFromCommitteeAt: string | null; diedInCommittee: boolean } {
  if (!progress || progress.length === 0) {
    return { reportedFromCommitteeAt: null, diedInCommittee: false };
  }
  const reportPassEntries = progress.filter((p) => p.event === 10);
  const latestReportPass =
    reportPassEntries.length > 0
      ? reportPassEntries.reduce((latest, p) => (p.date > latest.date ? p : latest))
      : null;
  const latestOverall = progress.reduce((latest, p) => (p.date > latest.date ? p : latest));

  return {
    reportedFromCommitteeAt: latestReportPass?.date ?? null,
    diedInCommittee: latestOverall.event === 11,
  };
}

// INTRODUCED-DATE BUG (2026-08-16): the original insert path wrote
// `entry.status_date` from getMasterList as `bills.introduced_date`. Per the
// same Status/Progress table referenced above, `status_date` (both on the
// master-list entry and on getBill's own top-level field) is the date of the
// bill's LATEST status change, not its introduction - for a bill that has
// since moved further, that's whatever event is currently most recent (floor
// passage, Act-signing, etc.), never the introduction date once a bill has
// progressed past being introduced. Confirmed against real HB77/HB324 data
// (`uvote-bill-summary-confirmation-pilot` report, Finding 3): both bills'
// stored `introduced_date` exactly matched a later status event (HB77's
// House floor passage date; HB324's Governor-signing date) while their own
// printed PDF headers gave a different, earlier true introduction date.
// event 1 = Introduced is the correct event to read instead - like
// `computeCommitteeStatus` above, this reads the specific event off the
// cumulative `progress` array rather than trusting a coarse status field.
function getIntroducedDate(progress: { date: string; event: number }[] | undefined): string | null {
  if (!progress || progress.length === 0) return null;
  return progress.find((p) => p.event === 1)?.date ?? null;
}

async function upsertRollCallVotes(
  admin: ReturnType<typeof createAdminClient>,
  billId: string,
  rollCallId: number,
  repRefsMap: Map<string, string>
) {
  const rollCall = await getRollCall(rollCallId);

  // One bulk upsert for the whole roll call instead of one SELECT + one
  // upsert per individual vote — a real House floor vote can have ~200
  // legislators voting (verified live: HB17's final passage had 195 yea + 8
  // nay = 203 votes), so this was up to ~400 round trips for a single bill
  // before this fix, independent of any bill-count `limit`.
  const rows = rollCall.votes
    .map((vote) => {
      // NV (no vote) / Absent are abstentions — UVote's rigor principle
      // ("abstentions excluded rather than counted against an official," per
      // CLAUDE.md) means these should not be written as support/oppose rows.
      let mapped: 'support' | 'oppose' | null = null;
      if (vote.vote_text === 'Yea') mapped = 'support';
      else if (vote.vote_text === 'Nay') mapped = 'oppose';
      if (!mapped) return null;
      const representativeId = repRefsMap.get(String(vote.people_id));
      if (!representativeId) return null;
      return { bill_id: billId, representative_id: representativeId, vote: mapped as 'support' | 'oppose' };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  const { error } = await admin.from('rep_votes').upsert(rows, { onConflict: 'bill_id,representative_id' });
  if (error) console.error(`Failed to upsert roll call votes for bill ${billId}:`, error);
}

// LOWERED (2026-08-10, live-verified via real Supabase logs, not guessed):
// even the bulk-round-trip-reduction fix (previous commit) still hit "CPU
// Time exceeded" at limit:25 — a genuinely different budget than wall-clock
// time. Deno Edge Runtime CPU-time limits do not count time spent awaiting
// network I/O, only actual synchronous compute (JSON parsing, object
// construction, etc.) — reducing round-trip COUNT mainly saves wall time and
// TLS/serialization CPU overhead, not the cost of parsing each bill's own
// LegiScan payload, which is what dominates per-bill CPU cost: getBill's
// response is a deeply nested object (sponsors carry full bio/social/
// capitol_address/links sub-objects — see legiscanClient's LegiscanSponsor
// type) and getRollCall's can have ~200 vote records for a real House floor
// vote. That per-bill parsing cost scales with the NUMBER of bills
// processed, which `limit` already controls — so the fix here is a much
// more conservative default, not new architecture. Start low and raise it
// only if logs (see the timing lines below) show comfortable headroom.
export const DEFAULT_BILL_BATCH_LIMIT = 5;
export const MAX_BILL_BATCH_LIMIT = 25;

// Bulk-fetches every existing legiscan bill_external_refs row into a Map, so
// syncBills can determine what's changed with ONE paginated read (a few
// requests at most, even at ~3,750 real PA HB/SB bills) instead of one
// .select() per master-list entry.
async function fetchExistingLegiscanBillRefs(
  admin: ReturnType<typeof createAdminClient>
): Promise<Map<string, { bill_id: string; change_hash: string | null }>> {
  const refs = new Map<string, { bill_id: string; change_hash: string | null }>();
  const pageSize = 1000; // supabase/config.toml's api.max_rows default
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from('bill_external_refs')
      .select('bill_id, external_bill_id, change_hash')
      .eq('source', 'legiscan')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      refs.set(row.external_bill_id, { bill_id: row.bill_id, change_hash: row.change_hash });
    }
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return refs;
}

// Batched: `limit` caps how many *changed* bills a single invocation
// actually processes (getBill + possibly getRollCall + several writes
// each); the caller re-invokes with the same request until the response's
// `remaining` reaches 0. Self-resuming with no cursor/offset to track: every
// invocation re-determines "changed" from the current change_hash state, so
// a bill processed in a prior batch (or one that failed and is still stale)
// is picked up correctly without any client-side bookkeeping.
async function syncBills(admin: ReturnType<typeof createAdminClient>, sessionId: number, limit: number) {
  const t0 = Date.now();
  const masterList = await getMasterList(sessionId);
  const tMasterList = Date.now();
  const existingRefs = await fetchExistingLegiscanBillRefs(admin);
  const repRefsMap = await fetchAllLegiscanRepRefs(admin);
  const tBulkFetch = Date.now();

  let skippedResolutions = 0;
  const changedEntries: typeof masterList = [];
  for (const entry of masterList) {
    const bodyId = bodyIdForBillNumber(entry.number);
    if (!bodyId) {
      skippedResolutions++;
      continue;
    }
    const existing = existingRefs.get(String(entry.bill_id));
    if (existing && existing.change_hash === entry.change_hash) {
      continue; // unchanged since last sync — skip the expensive getBill call
    }
    changedEntries.push(entry);
  }
  const tFiltered = Date.now();

  const batch = changedEntries.slice(0, limit);
  const remaining = changedEntries.length - batch.length;

  let changed = 0;
  let failures = 0;

  for (const entry of batch) {
    const bodyId = bodyIdForBillNumber(entry.number)!; // already filtered above
    const existingRef = existingRefs.get(String(entry.bill_id));

    try {
      const fullBill = await getBill(entry.bill_id);
      const { reportedFromCommitteeAt, diedInCommittee } = computeCommitteeStatus(fullBill.progress);
      // Report DNP is authoritative regardless of LegiScan's coarse top-level
      // status — that's the whole reason this signal is worth reading from
      // `progress` at all (see header comment): a bill that died in
      // committee has no guarantee LegiScan's own `status` field ever moves
      // off "Introduced" to reflect that.
      const status = diedInCommittee ? 'failed' : mapLegiscanStatus(fullBill.status);

      let billId = existingRef?.bill_id;
      if (billId) {
        await admin
          .from('bills')
          .update({
            title: fullBill.title,
            summary: fullBill.description,
            status,
            legislative_body_id: bodyId,
            bill_number: entry.number,
            reported_from_committee_at: reportedFromCommitteeAt,
            last_status_change_at: fullBill.status_date,
            source_url: fullBill.state_link,
            pending_committee_id: fullBill.pending_committee_id ?? null,
            pending_committee_name: fullBill.committee?.name ?? null,
          })
          .eq('bill_id', billId);
      } else {
        const { data: newBill, error: billErr } = await admin
          .from('bills')
          .insert({
            title: fullBill.title,
            summary: fullBill.description,
            status,
            legislative_body_id: bodyId,
            bill_number: entry.number,
            introduced_date: getIntroducedDate(fullBill.progress),
            reported_from_committee_at: reportedFromCommitteeAt,
            last_status_change_at: fullBill.status_date,
            source_url: fullBill.state_link,
            pending_committee_id: fullBill.pending_committee_id ?? null,
            pending_committee_name: fullBill.committee?.name ?? null,
          })
          .select('bill_id')
          .single();
        if (billErr || !newBill) {
          // Self-heal: a bill_number unique-constraint violation here means
          // the bill was already inserted in a PRIOR invocation, but that
          // invocation was killed (CPU Time exceeded is an abrupt worker
          // termination, not a catchable JS exception — nothing after the
          // kill point runs, including this function's own try/catch) before
          // it reached the bill_external_refs write below. Without this,
          // every future invocation would re-attempt the same insert forever
          // — confirmed live: 5 separate real invocations all failed
          // identically on the same handful of bill numbers (HB99, HB78,
          // HB72, HB33).
          //
          // The lookup below is scoped to (bill_number AND legislative_body_id)
          // together, matching the fixed constraint in
          // 20260810090000_fix_bills_bill_number_constraint_scope.sql — a
          // captain review caught that an earlier version of this fix looked
          // up by bill_number alone, which was correct for the same-body
          // orphan case actually observed (HB/SB prefixes keep House/Senate
          // apart, so today's real collisions are always same-body) but
          // unsafe in general: bill_number was never unique on its own in
          // the real world, only within a body, so a bill_number-only lookup
          // could silently adopt/merge a genuinely different body's bill —
          // e.g. an unrelated future body producing a coincidentally
          // matching number — into the wrong row. Scoping the lookup the
          // same way the constraint itself is now scoped means this can only
          // ever recover a genuine same-body orphan, never cross a body
          // boundary, regardless of what conflict error text Postgres
          // happens to report.
          if (billErr?.code === '23505' && billErr.message?.includes('bill_number')) {
            const { data: existingByNumber, error: lookupErr } = await admin
              .from('bills')
              .select('bill_id')
              .eq('bill_number', entry.number)
              .eq('legislative_body_id', bodyId)
              .maybeSingle();
            if (lookupErr || !existingByNumber) {
              console.error(
                `Bill ${entry.number} hit a bill_number conflict but couldn't be found in body ${bodyId} to self-heal ` +
                `(if it exists under a DIFFERENT body, that's a genuine bill_number collision across bodies, not an ` +
                `orphan — do not adopt it):`,
                lookupErr
              );
              failures++;
              continue;
            }
            console.warn(`Self-healed orphaned bill ${entry.number}: adopting existing bill_id ${existingByNumber.bill_id}`);
            billId = existingByNumber.bill_id;
            await admin
              .from('bills')
              .update({
                title: fullBill.title,
                summary: fullBill.description,
                status,
                legislative_body_id: bodyId,
                reported_from_committee_at: reportedFromCommitteeAt,
              })
              .eq('bill_id', billId);
          } else {
            console.error(`Failed to insert bill ${entry.number} (legiscan bill_id ${entry.bill_id}):`, billErr);
            failures++;
            continue;
          }
        } else {
          billId = newBill.bill_id;
        }
      }

      await upsertSponsors(admin, billId, fullBill.sponsors, repRefsMap);

      const floorVote = selectFloorVote(fullBill.votes, bodyId);
      if (floorVote) {
        await upsertRollCallVotes(admin, billId, floorVote.roll_call_id, repRefsMap);

        // Consistency check only - not a second source of truth. `status` above is
        // derived from the bill's coarse top-level LegiScan status (cross-referenced
        // against `progress` for the committee-DNP override); `floorVote.passed` is
        // LegiScan's own authoritative per-roll-call outcome flag. They should always
        // agree when `status` has resolved to passed/failed; a mismatch means one of
        // the two derivations has a bug worth investigating, so it's logged to
        // error_logs for admin review rather than silently trusted either way.
        if (status === 'passed' || status === 'failed') {
          const legiscanPassed = floorVote.passed === 1;
          const uvotePassed = status === 'passed';
          if (legiscanPassed !== uvotePassed) {
            const mismatchMessage =
              `Bill ${entry.number} (legiscan bill_id ${entry.bill_id}): floor roll call ` +
              `${floorVote.roll_call_id} has LegiScan passed=${floorVote.passed} but UVote derived status='${status}'`;
            console.error(mismatchMessage);
            const { error: logErr } = await admin.from('error_logs').insert({
              action: 'legiscan_vote_status_mismatch',
              user_id: null,
              error_message: mismatchMessage,
              error_code: null,
              resolved: false,
            });
            if (logErr) console.error(`Failed to log vote status mismatch for bill ${entry.number}:`, logErr);
          }
        }
      }

      // Only mark change_hash as synced after every write above has succeeded —
      // per report R5, a bill must never be marked "synced" if a step failed,
      // or it silently never gets retried.
      await admin.from('bill_external_refs').upsert(
        {
          bill_id: billId,
          source: 'legiscan',
          external_bill_id: String(entry.bill_id),
          external_session_id: String(sessionId),
          change_hash: entry.change_hash,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'bill_id' }
      );

      changed++;
    } catch (err) {
      console.error(`Failed to sync bill ${entry.number} (legiscan bill_id ${entry.bill_id}):`, err);
      failures++;
      // Deliberately do not touch bill_external_refs here — change_hash stays
      // stale so this bill is retried next cycle instead of silently dropped.
    }
  }
  const tDone = Date.now();

  console.log(
    `syncBills timing: getMasterList=${tMasterList - t0}ms, bulk-fetch=${tBulkFetch - tMasterList}ms, ` +
    `filter(${masterList.length}->${changedEntries.length})=${tFiltered - tBulkFetch}ms, ` +
    `batch-processing(${batch.length})=${tDone - tFiltered}ms, total=${tDone - t0}ms`
  );
  console.log(
    `syncBills: ${changed}/${batch.length} bills synced this batch, ${failures} failures, ` +
    `${remaining} changed bills remaining (of ${changedEntries.length} total changed), ` +
    `${skippedResolutions} resolutions skipped`
  );

  return { changed, failures, remaining, totalChanged: changedEntries.length, skippedResolutions };
}

// One-time pass: every bill synced before `reported_from_committee_at`
// existed needs its committee status back-computed from LegiScan, not just
// bills that happen to change_hash-change going forward. Deliberately
// separate from `phase: "bills"` (which only re-fetches CHANGED bills) —
// this instead re-fetches every already-synced bill exactly once, tracked
// via `bill_external_refs.committee_backfilled_at` rather than
// `reported_from_committee_at IS NULL`, because a bill that's genuinely
// still sitting in committee (no Report Pass event yet) would have
// `reported_from_committee_at` stay null forever — using that as the
// resume cursor would mean every invocation re-selects the same
// still-pending bills and this "one-time" pass would never converge to 0
// remaining. `committee_backfilled_at` is set on every processed bill
// regardless of outcome, so it always converges.
//
// Same conservative batching posture as DEFAULT_BILL_BATCH_LIMIT /
// MAX_BILL_BATCH_LIMIT above (start low, raise only with log evidence of
// headroom) — this does one getBill call per candidate, lighter than the
// full bills-sync path (no sponsor/roll-call upserts), but not assumed
// cheaper without a real invocation's timing log to back that up.
export const DEFAULT_BACKFILL_BATCH_LIMIT = 5;
export const MAX_BACKFILL_BATCH_LIMIT = 25;

async function backfillCommitteeStatus(admin: ReturnType<typeof createAdminClient>, limit: number) {
  const t0 = Date.now();

  const { count: totalRemaining, error: countErr } = await admin
    .from('bill_external_refs')
    .select('bill_id', { count: 'exact', head: true })
    .eq('source', 'legiscan')
    .is('committee_backfilled_at', null);
  if (countErr) throw countErr;

  const { data: candidates, error: candErr } = await admin
    .from('bill_external_refs')
    .select('bill_id, external_bill_id')
    .eq('source', 'legiscan')
    .is('committee_backfilled_at', null)
    .order('external_bill_id', { ascending: true })
    .limit(limit);
  if (candErr) throw candErr;
  const tCandidates = Date.now();

  let updated = 0;
  let failures = 0;

  for (const ref of candidates ?? []) {
    try {
      const fullBill = await getBill(Number(ref.external_bill_id));
      const { reportedFromCommitteeAt, diedInCommittee } = computeCommitteeStatus(fullBill.progress);

      const billUpdate: Record<string, unknown> = {
        reported_from_committee_at: reportedFromCommitteeAt,
        last_status_change_at: fullBill.status_date,
        source_url: fullBill.state_link,
        pending_committee_id: fullBill.pending_committee_id ?? null,
        pending_committee_name: fullBill.committee?.name ?? null,
      };
      if (diedInCommittee) billUpdate.status = 'failed';

      const { error: billUpdateErr } = await admin.from('bills').update(billUpdate).eq('bill_id', ref.bill_id);
      if (billUpdateErr) throw billUpdateErr;

      const { error: refUpdateErr } = await admin
        .from('bill_external_refs')
        .update({ committee_backfilled_at: new Date().toISOString() })
        .eq('bill_id', ref.bill_id);
      if (refUpdateErr) throw refUpdateErr;

      updated++;
    } catch (err) {
      console.error(`Backfill failed for bill_id ${ref.bill_id} (legiscan bill_id ${ref.external_bill_id}):`, err);
      failures++;
      // Deliberately do not set committee_backfilled_at on failure — retried next invocation.
    }
  }
  const tDone = Date.now();

  // Failures stay in the candidate set (committee_backfilled_at untouched),
  // so only successes shrink what's remaining.
  const remaining = Math.max((totalRemaining ?? 0) - updated, 0);

  console.log(
    `backfillCommitteeStatus timing: count+candidates=${tCandidates - t0}ms, ` +
    `batch-processing(${candidates?.length ?? 0})=${tDone - tCandidates}ms, total=${tDone - t0}ms`
  );
  console.log(
    `backfillCommitteeStatus: ${updated}/${candidates?.length ?? 0} bills backfilled, ${failures} failures, ` +
    `${remaining} remaining (of ${totalRemaining ?? 0} total)`
  );

  return { updated, failures, remaining, totalRemaining: totalRemaining ?? 0 };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const tStart = Date.now();
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const phase: 'people' | 'bills' | 'backfill' | 'all' =
      body.phase === 'people' || body.phase === 'bills' || body.phase === 'backfill' ? body.phase : 'all';

    // `backfill` is separate, one-time work (see backfillCommitteeStatus's
    // header comment) — it doesn't touch getSessionList/getMasterList at
    // all, so it's handled entirely on its own rather than falling through
    // the session-lookup path the other phases share.
    if (phase === 'backfill') {
      const requestedLimit = typeof body.limit === 'number' ? Math.floor(body.limit) : DEFAULT_BACKFILL_BATCH_LIMIT;
      const limit = Math.min(Math.max(requestedLimit, 1), MAX_BACKFILL_BATCH_LIMIT);
      const backfillResult = await backfillCommitteeStatus(admin, limit);
      console.log(`legiscan-sync total: phase=backfill, wall=${Date.now() - tStart}ms`);
      return new Response(JSON.stringify({ ok: true, phase, limit, ...backfillResult }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const requestedLimit = typeof body.limit === 'number' ? Math.floor(body.limit) : DEFAULT_BILL_BATCH_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_BILL_BATCH_LIMIT);

    const sessions = await getSessionList('PA');
    const tSessionList = Date.now();
    const currentSession = sessions.find((s) => s.prior === 0 && s.sine_die === 0) ?? sessions[0];
    if (!currentSession) {
      throw new Error('No PA session found via getSessionList');
    }

    const result: Record<string, unknown> = { ok: true, session_id: currentSession.session_id, phase };

    if (phase === 'people' || phase === 'all') {
      const peopleResult = await syncPeople(admin, currentSession.session_id);
      result.people = peopleResult;
    }

    if (phase === 'bills' || phase === 'all') {
      const billsResult = await syncBills(admin, currentSession.session_id, limit);
      result.limit = limit;
      Object.assign(result, billsResult);
    }

    console.log(
      `legiscan-sync total: phase=${phase}, getSessionList=${tSessionList - tStart}ms, wall=${Date.now() - tStart}ms`
    );

    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('legiscan-sync failed:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
