// Minimal typed client for the LegiScan Pull API (free tier, 30,000 queries/month —
// see report at /Users/ianparnell/firstmate/data/uvote-pa-bills-plan/report.md
// Section 1, sourced directly from the LegiScan API User Manual v1.91).
//
// LIVE-VERIFIED (2026-08-09): every type below was diffed against real
// responses from getSessionList('PA'), getMasterList(2192), getBill(1905489),
// getRollCall(1594322), and getSessionPeople(2192) using a captain-provided
// key — all fields match exactly (real responses carry additional fields
// this client doesn't type, which is fine; nothing this client reads was
// missing or shaped differently than assumed). See legiscan-sync/index.ts's
// header comment for the two real bugs that verification pass caught.

const LEGISCAN_BASE_URL = 'https://api.legiscan.com/';

function apiKey(): string {
  const key = Deno.env.get('LEGISCAN_API_KEY');
  if (!key) throw new Error('LEGISCAN_API_KEY is not set');
  return key;
}

async function callLegiscan<T>(op: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(LEGISCAN_BASE_URL);
  url.searchParams.set('key', apiKey());
  url.searchParams.set('op', op);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`LegiScan ${op} returned HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.status !== 'OK') {
    throw new Error(`LegiScan ${op} returned status ${json.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json as T;
}

export type LegiscanSession = {
  session_id: number;
  session_name: string;
  year_start: number;
  year_end: number;
  special: number;
  sine_die: number;
  prior: number;
};

export async function getSessionList(state: 'PA'): Promise<LegiscanSession[]> {
  const json = await callLegiscan<{ sessions: LegiscanSession[] }>('getSessionList', { state });
  return json.sessions;
}

export type LegiscanMasterListEntry = {
  bill_id: number;
  number: string;
  change_hash: string;
  url: string;
  status_date: string;
  status: number;
  last_action_date: string;
  last_action: string;
  title: string;
  description: string;
};

// getMasterList returns an object keyed by array index (plus a "session" key) —
// normalize it to a plain array of entries here so callers never deal with the
// raw object shape.
export async function getMasterList(sessionId: number): Promise<LegiscanMasterListEntry[]> {
  const json = await callLegiscan<{ masterlist: Record<string, LegiscanMasterListEntry | LegiscanSession> }>(
    'getMasterList',
    { id: String(sessionId) }
  );
  return Object.entries(json.masterlist)
    .filter(([key]) => key !== 'session')
    .map(([, entry]) => entry as LegiscanMasterListEntry);
}

export type LegiscanSponsor = {
  people_id: number;
  party: string;
  role: string;
  name: string;
  first_name: string;
  last_name: string;
  district: string;
  sponsor_type_id: number; // 1 = primary/sponsor, 2 = co-sponsor (per manual)
};

export type LegiscanBillVoteSummary = {
  roll_call_id: number;
  date: string;
  desc: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  chamber: string;
};

export type LegiscanBill = {
  bill_id: number;
  session_id: number;
  status: number;
  status_date: string;
  title: string;
  description: string;
  state_link: string;
  sponsors: LegiscanSponsor[];
  votes: LegiscanBillVoteSummary[];
  progress: { date: string; event: number }[];
  // Tracks the bill's CURRENT committee across chamber crossover, not just
  // its first committee stop (live-verified 2026-08-20: a bill that passed
  // the House and was re-referred to the Senate had both fields update to
  // the Senate's committee). The manual documents `committee.committee_name`,
  // but the real live response uses `committee.name` - verified directly
  // against a live getBill() response, see
  // supabase/migrations/20260820130000_add_bills_source_url_and_pending_committee.sql.
  pending_committee_id?: number;
  committee?: { committee_id: number; chamber: string; chamber_id: number; name: string };
};

export async function getBill(billId: number): Promise<LegiscanBill> {
  const json = await callLegiscan<{ bill: LegiscanBill }>('getBill', { id: String(billId) });
  return json.bill;
}

export type LegiscanRollCallVote = {
  people_id: number;
  vote_id: number;
  vote_text: 'Yea' | 'Nay' | 'NV' | 'Absent';
};

export type LegiscanRollCall = {
  roll_call_id: number;
  bill_id: number;
  date: string;
  yea: number;
  nay: number;
  nv: number;
  absent: number;
  total: number;
  passed: number;
  votes: LegiscanRollCallVote[];
};

export async function getRollCall(rollCallId: number): Promise<LegiscanRollCall> {
  const json = await callLegiscan<{ roll_call: LegiscanRollCall }>('getRollCall', { id: String(rollCallId) });
  return json.roll_call;
}

export type LegiscanPerson = {
  people_id: number;
  party: string;
  role: string; // "Rep" | "Sen"
  name: string;
  first_name: string;
  last_name: string;
  district: string; // e.g. "HD-181" / "SD-1"
  person_hash: string;
};

export async function getSessionPeople(sessionId: number): Promise<LegiscanPerson[]> {
  const json = await callLegiscan<{ sessionpeople: { people: LegiscanPerson[] } }>('getSessionPeople', {
    id: String(sessionId),
  });
  return json.sessionpeople.people;
}
