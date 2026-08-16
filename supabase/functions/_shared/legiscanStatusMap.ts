// Table-driven mapping from LegiScan's numeric bill.status onto the subset of
// UVote's bills.status values a sync can produce (active | passed | failed |
// tabled — see BillCard.tsx). bills.status also allows a fifth value,
// pending_review, but that's exclusively the generate-bill-summary skill's
// output for generated-but-unreviewed content (see that skill's SKILL.md) —
// legiscan-sync never writes it, so it's deliberately absent from this map.
//
// LegiScan's documented top-level status codes (LegiScan API User Manual v1.91,
// revision 20250317, "Bill Status Codes" table), cross-checked live (2026-08-09)
// against the real PA 2025-2026 session (4,899 bills, id 2192):
//   0 = N/A / not yet classified — LIVE-VERIFIED as PA's "tabled" mechanism:
//       4 of the 5 status=0 entries in the real master list had last_action
//       "Laid on the table (Pursuant to House Rule 71)". This directly
//       resolves what an earlier version of this file flagged as an
//       unverified gap ("LegiScan has no top-level status for tabled") — it
//       turns out it does, just not under a dedicated status code.
//   1 = Introduced         (3,929 of 4,899 real bills — the modal status)
//   2 = Engrossed           (passed its chamber of origin — 524 real bills)
//   3 = Enrolled            (passed both chambers, sent to the governor —
//                            no real example seen yet in this session)
//   4 = Passed              (signed into law / adopted — 440 real bills,
//                            confirmed via last_action "Act No. X of 2026")
//   5 = Vetoed
//   6 = Failed              ("Failed" or "Dead" — died in committee, missed a
//                            legislative deadline, or was otherwise abandoned)
//
// This table is deliberately the ONLY place that mapping lives (per report R4:
// "should be table-driven, not hardcoded if/else, so PA-specific status quirks
// are easy to patch"). One judgment call remains, to be revisited once a real
// enrolled bill (status 3) shows up in sync data:
//   - Enrolled (3) maps to "active" rather than "passed": a bill sent to the
//     governor isn't law yet, and UVote's product framing ("compare a citizen's
//     vote against how their representative actually voted") is about the
//     legislative vote, which has already happened by this point — but a citizen
//     casting a fresh vote on an enrolled bill is voting on something whose
//     legislative outcome is already settled. Worth a product-copy decision,
//     not guessed here.
export const LEGISCAN_STATUS_MAP: Record<number, 'active' | 'passed' | 'failed' | 'tabled'> = {
  0: 'tabled', // N/A — live-verified as PA's "laid on the table" mechanism
  1: 'active', // Introduced
  2: 'active', // Engrossed
  3: 'active', // Enrolled — see note above, not yet signed into law
  4: 'passed', // Passed
  5: 'failed', // Vetoed
  6: 'failed', // Failed / Dead
};

export const DEFAULT_UVOTE_STATUS: 'active' | 'passed' | 'failed' | 'tabled' = 'active';

export function mapLegiscanStatus(legiscanStatus: number | null | undefined): 'active' | 'passed' | 'failed' | 'tabled' {
  if (legiscanStatus == null) return DEFAULT_UVOTE_STATUS;
  return LEGISCAN_STATUS_MAP[legiscanStatus] ?? DEFAULT_UVOTE_STATUS;
}
