/*
  # Backfill superseded-bill data from the retroactive backlog log

  1. Changes
    - Data-only: populates `bills.superseded_at`/`superseded_by`/
      `superseded_reason` (added, still all-null, by
      `20260817090000_add_bills_superseded_and_vote_gate.sql`) for all 48
      PA bills confirmed as superseded by
      `data/uvote-superseded-bills-log.md` (firstmate home) as of its
      2026-08-17 state, across that log's 24 confirmed sections.
    - Each UPDATE is matched on (bill_number, legislative_body_id) to
      avoid any cross-body collision between a House and Senate bill
      sharing a number. Every UPDATE is preceded by a comment citing the
      exact log section it came from, so a future reader can trace the
      write back to its source reasoning without re-reading the whole
      log file.
    - Legislative body ids used below (from a live query against this
      project's Supabase instance, 2026-08-17):
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be

  2. Dates resolved via direct LegiScan research (not in the log itself)
    - 33 of the 48 bills had a clean day-level date already cited in the
      log (an Act number + signing date). The remaining 15 - SB1000, the
      13-bill "PA General Fund appropriation placeholders" class, and
      SB186 - shared a superseding vehicle the log describes only by
      month ("July 2026" for SB160; "November 2025" for SB186's vehicle).
      Per a captain decision (see the firstmate status log for this task,
      key `superseded-bills-ambiguous-dates`), pinned the exact dates via
      LegiScan's own `getBill` progress/history/text data for the real
      bills, not general web search (a web search on SB160 turned up
      real-world facts - different vote tallies, a different fiscal year
      - that conflict with the log's own narrative, confirming LegiScan's
      bill-specific data as the authoritative source here instead):
        - SB160 (PA's real FY2025-26 General Appropriation Act, LegiScan
          bill_id 2020034): `history` shows "Approved by the Governor" /
          "Act No. 1A of 2025" on 2025-11-12 - not "July 2026" as the log
          states (that date appears to describe the following year's
          FY2026-27 budget instead, a different bill). Used for SB1000 and
          the 13-bill placeholder class below.
        - SB186's actual superseding vehicle: the log names no single bill
          for this one ("separate legislation... state budget agreement").
          SB186 itself (LegiScan bill_id 1941471) carries no cross-reference
          to what mooted it, so searched every bill enacted in the same
          2025-11-12 budget-package window (PA session 2192) for RGGI/CO2
          Budget Trading Program language and found it: HB416 (the Fiscal
          Code bill, Act No. 45 of 2025, signed 2025-11-12, LegiScan
          bill_id 1946034), Section 47(2) of its enacted text: "THE
          PROVISIONS OF 25 PA. CODE CH. 145 SUBCH. E (RELATING TO CO2
          BUDGET TRADING PROGRAM) ARE ABROGATED" - the exact DEP
          regulation SB186 targeted, in the same budget package as SB160.
          Used HB416 (Act 45 of 2025) as SB186's `superseded_by` in place
          of the log's generic citation, since a precise bill number is
          now available.
*/

-- ─── SB153 (PA Senate) — log section "## SB153 (PA Senate)" ────────────────
-- HB274, signed as Act 55 of 2025 on 2025-12-22, independently resolved the
-- same "ghosting" unemployment-compensation eligibility question SB153 never
-- got past committee on.
UPDATE bills
SET superseded_at = '2025-12-22T00:00:00Z',
    superseded_by = 'HB274 (Act 55 of 2025)',
    superseded_reason = 'SB153 would have made certain unemployment-compensation claimants ineligible for benefits under a "ghosting" (no-show) rule. Its own text never became law, but the same substantive policy question was independently resolved through HB274, signed by Gov. Shapiro as Act 55 of 2025 on 2025-12-22, while SB153 itself sat untouched in committee since January 2025.'
WHERE bill_number = 'SB153' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB1017 (PA Senate) — log section "## SB1017 (PA Senate)" ──────────────
-- HB103, signed as Act 28 of 2025 on 2025-07-07, is the identical-title
-- companion that reached the Governor before SB1017 was even referred to
-- committee.
UPDATE bills
SET superseded_at = '2025-07-07T00:00:00Z',
    superseded_by = 'HB103 (Act 28 of 2025)',
    superseded_reason = 'SB1017 and HB103 carry the identical title amending Title 30 (Fish), providing for at-risk, derelict and abandoned boats. HB103 passed both chambers and was signed as Act 28 of 2025 on 2025-07-07, before SB1017 was even referred to committee on 2025-09-19 — SB1017''s own text can never change the real-world outcome, since the policy is already in effect.'
WHERE bill_number = 'SB1017' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── HB1836 (PA House) — log section "## HB1836 (PA House)" ────────────────
-- SB1036, signed as Act 7 of 2026 on 2026-02-11, is the Senate's identical
-- companion that passed unanimously after the House laid HB1836 on the
-- table the same day it was reported.
UPDATE bills
SET superseded_at = '2026-02-11T00:00:00Z',
    superseded_by = 'SB1036 (Act 7 of 2026)',
    superseded_reason = 'HB1836 and SB1036 carry the identical title consolidating the First Class Township Code (Title 73). HB1836 cleared committee unanimously (26-0) but was laid on the table the same day, 2025-11-19; the Senate''s identical companion SB1036 passed both chambers unanimously and was signed as Act 7 of 2026 on 2026-02-11. HB1836''s own passage or failure no longer changes anything.'
WHERE bill_number = 'HB1836' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── SB847 (PA Senate) — log section "## SB847 (PA Senate)" ────────────────
-- SB862, signed as Act 9 of 2026 on 2026-04-01, is the same-chamber
-- duplicate that actually passed.
UPDATE bills
SET superseded_at = '2026-04-01T00:00:00Z',
    superseded_by = 'SB862 (Act 9 of 2026)',
    superseded_reason = 'SB847 and SB862 carry the identical title (Title 8, Boroughs and Incorporated Towns) on filling vacancies in elective borough offices — same-chamber duplication, not a cross-chamber companion. SB862 passed both chambers and was signed as Act 9 of 2026 on 2026-04-01, while SB847 sat untouched in committee since June 2025.'
WHERE bill_number = 'SB847' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── HB427 (PA House) — log section "## HB427 (PA House)" ──────────────────
-- SB130, signed as Act 42 of 2026 on 2026-07-20, is the Senate's identical
-- companion that passed after the House laid HB427 on the table.
UPDATE bills
SET superseded_at = '2026-07-20T00:00:00Z',
    superseded_by = 'SB130 (Act 42 of 2026)',
    superseded_reason = 'HB427 and SB130 carry the identical title on Department of Military and Veterans Affairs burial-benefit provisions (Title 51). HB427 cleared committee 26-0 but was laid on the table the same day, 2025-02-04; the Senate''s companion SB130 passed both chambers and was signed as Act 42 of 2026 on 2026-07-20. HB427''s own passage or failure no longer changes anything.'
WHERE bill_number = 'HB427' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB365 (PA House) — log section "## HB365 (PA House)" ──────────────────
-- SB331, signed as Act 43 of 2026 on 2026-07-20, is the companion bill that
-- created the same interstate cosmetology licensure compact.
UPDATE bills
SET superseded_at = '2026-07-20T00:00:00Z',
    superseded_by = 'SB331 (Act 43 of 2026)',
    superseded_reason = 'HB365 and SB331 carry the identical title authorizing Pennsylvania to join the Cosmetology Licensure Compact. HB365 sat untouched in committee since January 2025, while SB331 passed both chambers and was signed as Act 43 of 2026 on 2026-07-20. Pennsylvania''s participation in the compact is already law under a different bill number.'
WHERE bill_number = 'HB365' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB1080 (PA House) — log section "## HB1080 (PA House)" ────────────────
-- SB349, signed as Act 44 of 2026 on 2026-07-20, is the companion bill on
-- decommissioning solar energy facilities.
UPDATE bills
SET superseded_at = '2026-07-20T00:00:00Z',
    superseded_by = 'SB349 (Act 44 of 2026)',
    superseded_reason = 'HB1080 and SB349 carry the identical description amending Title 27 (Environmental Resources), providing for decommissioning of solar energy facilities. HB1080 sat untouched in committee since April 2025, while SB349 passed both chambers and was signed as Act 44 of 2026 on 2026-07-20. HB1080''s own passage or failure no longer changes anything.'
WHERE bill_number = 'HB1080' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB1195 (PA House) — log section "## HB1195 (PA House)" ────────────────
-- SB862 (Act 9 of 2026, signed 2026-04-01) — the same vehicle already used
-- for SB847 above; HB1195 is a second, independently-found stale bill on
-- the same borough-vacancy policy.
UPDATE bills
SET superseded_at = '2026-04-01T00:00:00Z',
    superseded_by = 'SB862 (Act 9 of 2026)',
    superseded_reason = 'HB1195 carries the same description as SB847/SB862 (Title 8, filling vacancies in elective borough offices) — a second, independently-found stale bill superseded by the same enacted vehicle SB862, signed as Act 9 of 2026 on 2026-04-01. HB1195 was reported from committee 26-0, then laid on the table the same day, 2025-05-07.'
WHERE bill_number = 'HB1195' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB1237 (PA House) — log section "## HB1237 (PA House)" ────────────────
-- SB475, signed as Act 38 of 2025 on 2025-07-21, is the companion bill on
-- problem-solving courts and probation modification/revocation.
UPDATE bills
SET superseded_at = '2025-07-21T00:00:00Z',
    superseded_by = 'SB475 (Act 38 of 2025)',
    superseded_reason = 'HB1237 and SB475 carry the identical description amending Title 42 (Judiciary and Judicial Procedure) on problem-solving courts and modification/revocation of probation orders. HB1237 sat untouched in committee since April 2025, while SB475 passed both chambers and was signed as Act 38 of 2025 on 2025-07-21.'
WHERE bill_number = 'HB1237' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB1410 (PA House) — log section "## HB1410 (PA House)" ────────────────
-- SB719, signed as Act 27 of 2025 on 2025-06-30, resolved the CPA Law
-- policy question the day before HB1410 was even introduced.
UPDATE bills
SET superseded_at = '2025-06-30T00:00:00Z',
    superseded_by = 'SB719 (Act 27 of 2025)',
    superseded_reason = 'HB1410 and SB719 carry the identical description (CPA Law amendments — definitions, board powers, examination/certificate requirements, licensing/discipline). SB719 passed both chambers and was signed as Act 27 of 2025 on 2025-06-30 — the day before HB1410 was even introduced, so its underlying policy question was already resolved before its own first committee referral.'
WHERE bill_number = 'HB1410' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── HB1727 (PA House) — log section "## HB1727 (PA House)" ────────────────
-- SB972, signed as Act 25 of 2026 on 2026-07-12, is a word-for-word
-- identical companion (confirmed via bill-text PDF comparison).
UPDATE bills
SET superseded_at = '2026-07-12T00:00:00Z',
    superseded_by = 'SB972 (Act 25 of 2026)',
    superseded_reason = 'HB1727 and SB972 are word-for-word identical bills amending Section 1538 of the Second Class Township Code ("Care of Memorials"), confirmed by comparing actual bill-text PDFs. SB972 passed both chambers and was signed as Act 25 of 2026 on 2026-07-12, while HB1727 was laid on the table in the House the same day it was reported from committee, 2025-10-29.'
WHERE bill_number = 'HB1727' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── SB162 (PA Senate) — log section "## SB162 (PA Senate)" ────────────────
-- HB1334, signed as Act 3A of 2025 on 2025-06-27, carried the same
-- Workmen's Compensation Administration Fund appropriation.
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1334 (Act 3A of 2025)',
    superseded_reason = 'SB162 and HB1334 both make appropriations from the Workmen''s Compensation Administration Fund for FY2025-26; bill-text comparison shows the statutory citations, purpose, and $550,000 Office of Small Business Advocate carve-out are word-for-word identical, differing only in the negotiated headline appropriation total. HB1334 passed and was signed as Act 3A of 2025 on 2025-06-27, while SB162 was re-committed to Appropriations and never advanced.'
WHERE bill_number = 'SB162' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB163 (PA Senate) — log section "## SB163 (PA Senate)" ────────────────
-- HB1335, signed as Act 4A of 2025 on 2025-06-27, carried the same Office
-- of Small Business Advocate appropriation. (A same-title FY2026-27
-- re-introduction, HB2405/Act 4A of 2026, was investigated and rejected —
-- see the log's SB163 entry and its "recurring annual appropriation
-- bills" calibration addendum.)
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1335 (Act 4A of 2025)',
    superseded_reason = 'SB163 and HB1335 both make an appropriation from a restricted revenue account to the Office of Small Business Advocate for FY2025-26. HB1335 passed and was signed as Act 4A of 2025 on 2025-06-27, while SB163 was re-committed to Appropriations and never advanced. A same-title candidate, HB2405 (Act 4A of 2026), was checked and rejected: it appropriates for the following fiscal year (2026-27), a next-year re-introduction of the same recurring bill, not the vehicle that mooted SB163.'
WHERE bill_number = 'SB163' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB164 (PA Senate) — log section "## SB164 (PA Senate)" ────────────────
-- HB1420, signed as Act 10A of 2025 on 2025-06-27, carried the same Office
-- of Consumer Advocate appropriation.
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1420 (Act 10A of 2025)',
    superseded_reason = 'SB164 and HB1420 both make an appropriation from a restricted revenue account to the Office of Consumer Advocate for FY2025-26. HB1420 passed and was signed as Act 10A of 2025 on 2025-06-27, while SB164 was re-committed to Appropriations and never advanced. A same-title candidate, HB2406 (Act 5A of 2026), was checked and rejected as the following fiscal year''s re-introduction, not the vehicle that mooted SB164.'
WHERE bill_number = 'SB164' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB165 (PA Senate) — log section "## SB165 (PA Senate)" ────────────────
-- HB1336, signed as Act 5A of 2025 on 2025-06-27, carried the same PSERS
-- appropriation.
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1336 (Act 5A of 2025)',
    superseded_reason = 'SB165 and HB1336 both make appropriations from the Public School Employees'' Retirement Fund and PSERS Defined Contribution Fund for FY2025-26; bill-text comparison shows identical statutory citations and structure, differing only in the two negotiated headline dollar figures. HB1336 passed and was signed as Act 5A of 2025 on 2025-06-27, while SB165 was re-committed to Appropriations and never advanced.'
WHERE bill_number = 'SB165' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── Second wave: PA restricted-fund appropriations series, batch 6 ────────
-- log section "## Second wave: PA restricted-fund appropriations series,
-- Acts 2A-11A of 2025 (batch 6) — SB166, SB168, SB169, SB170, SB281,
-- SB282, SB283, SB284, SB285, SB286, SB287, SB288, SB289"
-- Sen. Hughes (2025-02-26) and Sen. Martin (2025-04-03) each independently
-- introduced a near-complete duplicate slate of the same restricted-fund
-- appropriation bills the House's own May 6, 2025 companions (J. Harris,
-- House Appropriations chair) ultimately carried into law. Every pairing
-- below was confirmed via actual bill-text PDF comparison, not just
-- title/description, per the log's batch-6 discipline.

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1337 (Act 6A of 2025)',
    superseded_reason = 'SB166 (introduced by Martin, 2025-04-03) makes the same State Employees'' Retirement Fund / SERS Defined Contribution Fund appropriation as the enacted HB1337, same fund/board/fiscal-year structure, differing only in the negotiated dollar split between the two sections. HB1337 was signed as Act 6A of 2025 on 2025-06-27; SB166 was re-committed to Appropriations 2025-05-13 and never advanced.'
WHERE bill_number = 'SB166' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1337 (Act 6A of 2025)',
    superseded_reason = 'SB281 (introduced by Hughes, 2025-02-26, roughly six weeks before Martin''s SB166 duplicate above) makes the same State Employees'' Retirement Fund / SERS Defined Contribution Fund appropriation; its dollar figures are byte-identical to the enacted HB1337 text. HB1337 was signed as Act 6A of 2025 on 2025-06-27; SB281 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB281' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1339 (Act 8A of 2025)',
    superseded_reason = 'SB168 (introduced by Martin, 2025-04-03) makes the same PUC restricted revenue account / federal augmentation appropriation as the enacted HB1339, same fund/agency/fiscal-year structure, differing only in the negotiated headline total. HB1339 was signed as Act 8A of 2025 on 2025-06-27; SB168 was re-committed to Appropriations 2025-05-13 and never advanced.'
WHERE bill_number = 'SB168' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1339 (Act 8A of 2025)',
    superseded_reason = 'SB286 (introduced by Hughes, 2025-02-26) makes the same PUC restricted revenue account / federal augmentation appropriation as the enacted HB1339, same fund/agency/fiscal-year structure, differing only in the negotiated headline total. HB1339 was signed as Act 8A of 2025 on 2025-06-27; SB286 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB286' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1340 (Act 9A of 2025)',
    superseded_reason = 'SB169 (introduced by Martin, 2025-04-03) makes the same Gaming Control Appropriation Act of 2025 line items (Attorney General / Dept. of Revenue / State Police / Gaming Control Board across the State Gaming Fund, Fantasy Contest Fund, and Video Gaming Fund) as the enacted HB1340, same structure, an earlier and lower negotiated round of the same figures. HB1340 was signed as Act 9A of 2025 on 2025-06-27; SB169 was re-committed to Appropriations 2025-05-13 and never advanced.'
WHERE bill_number = 'SB169' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1340 (Act 9A of 2025)',
    superseded_reason = 'SB288 (introduced by Hughes, 2025-02-26) makes the same Gaming Control Appropriation Act of 2025 line items as the enacted HB1340; its figures are byte-identical to HB1340''s enacted (Senate-amended) text section-by-section. HB1340 was signed as Act 9A of 2025 on 2025-06-27; SB288 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB288' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-19T00:00:00Z',
    superseded_by = 'HB1421 (Act 11A of 2025)',
    superseded_reason = 'SB170 (introduced by Martin, 2025-04-03) makes the same State-Aided University Nonpreferred Appropriation Act of 2025 line items (Penn State, Pitt, Temple, Lincoln, Penn) as the enacted HB1421; most figures match exactly, with a few differing between SB170''s introduced version and HB1421''s later-amended enacted version — the normal in-flight negotiation pattern. HB1421 was signed as Act 11A of 2025 on 2025-11-19; SB170 was referred to Appropriations 2025-04-03 and never advanced.'
WHERE bill_number = 'SB170' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1336 (Act 5A of 2025)',
    superseded_reason = 'SB282 (introduced by Hughes, 2025-02-26) is a second, independent Senate duplicate of SB165 above, making the same PSERS Fund / PSERS Defined Contribution Fund appropriation as the enacted HB1336; bill-text comparison shows byte-identical operative text including both dollar figures. HB1336 was signed as Act 5A of 2025 on 2025-06-27; SB282 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB282' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1333 (Act 2A of 2025)',
    superseded_reason = 'SB283 (introduced by Hughes, 2025-02-26) makes the same Professional Licensure Augmentation Account appropriation as the enacted HB1333; bill-text comparison shows byte-identical operative text across all five line items. HB1333 was signed as Act 2A of 2025 on 2025-06-27; SB283 was referred to Appropriations 2025-02-26 and never advanced. A same-title FY2026-27 candidate, HB2403 (Act 2A of 2026), was checked and rejected as next year''s re-introduction (all five dollar figures differ, fiscal year reads July 2026-June 2027).'
WHERE bill_number = 'SB283' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1420 (Act 10A of 2025)',
    superseded_reason = 'SB284 (introduced by Hughes, 2025-02-26) is a second, independent Senate duplicate of SB164 above, making the same Office of Consumer Advocate appropriation as the enacted HB1420; bill-text comparison shows byte-identical operative text ($7,252,000). HB1420 was signed as Act 10A of 2025 on 2025-06-27; SB284 was referred to Appropriations 2025-02-26 and never advanced. The same HB2406 (Act 5A of 2026) FY2026-27 decoy already rejected for SB164 was re-checked and re-rejected here.'
WHERE bill_number = 'SB284' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1335 (Act 4A of 2025)',
    superseded_reason = 'SB285 (introduced by Hughes, 2025-02-26) is a second, independent Senate duplicate of SB163 above, making the same Office of Small Business Advocate appropriation as the enacted HB1335; bill-text comparison shows byte-identical operative text ($2,243,000). HB1335 was signed as Act 4A of 2025 on 2025-06-27; SB285 was referred to Appropriations 2025-02-26 and never advanced. The same HB2405 (Act 4A of 2026) FY2026-27 decoy already rejected for SB163 was re-checked and re-rejected here.'
WHERE bill_number = 'SB285' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1334 (Act 3A of 2025)',
    superseded_reason = 'SB287 (introduced by Hughes, 2025-02-26) is a second, independent Senate duplicate of SB162 above, making the same Workmen''s Compensation Administration Fund appropriation as the enacted HB1334; bill-text comparison shows byte-identical operative text, matching SB162''s own figures exactly. HB1334 was signed as Act 3A of 2025 on 2025-06-27; SB287 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB287' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1338 (Act 7A of 2025)',
    superseded_reason = 'SB289 (introduced by Hughes, 2025-02-26) makes the same Philadelphia Taxicab and Limousine Regulatory Fund appropriation to the Philadelphia Parking Authority as the enacted HB1338; bill-text comparison shows byte-identical operative text ($2,193,000). HB1338 was signed as Act 7A of 2025 on 2025-06-27; SB289 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB289' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB577 (PA Senate) — log section "## SB577 (PA Senate)" ────────────────
-- HB797, signed as Act 11 of 2026 on 2026-05-06, is the identical companion
-- confirmed via bill-text PDF comparison.
UPDATE bills
SET superseded_at = '2026-05-06T00:00:00Z',
    superseded_by = 'HB797 (Act 11 of 2026)',
    superseded_reason = 'SB577 and HB797 carry the identical title and description amending the Second Class City Firemen Relief Law (membership requirements, married persons and pensions to surviving spouses). Bill-text comparison confirms the operative sections are word-for-word identical apart from bill number and sponsor line. HB797 passed and was signed as Act 11 of 2026 on 2026-05-06, while SB577 sat untouched in committee since April 2025.'
WHERE bill_number = 'SB577' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB767 (PA Senate) — log section "## SB767 (PA Senate)" ────────────────
-- HB1103, signed as Act 16 of 2025 on 2025-06-30, is the identical
-- companion confirmed via bill-text PDF comparison.
UPDATE bills
SET superseded_at = '2025-06-30T00:00:00Z',
    superseded_by = 'HB1103 (Act 16 of 2025)',
    superseded_reason = 'SB767 and HB1103 carry the identical title and description amending Title 7 (Banks and Banking) mortgage loan industry licensing and consumer protection. Bill-text comparison shows both amend the same two sections of Title 7 and repeal the same two sections of the Loan Interest and Protection Law, differing only in minor in-flight amendment wording. HB1103 passed and was signed as Act 16 of 2025 on 2025-06-30, while SB767 sat untouched in committee since May 2025.'
WHERE bill_number = 'SB767' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB870 (PA Senate) — log section "## SB870 (PA Senate)" ────────────────
-- SB870's own text was folded verbatim into HB865 via a Senate floor
-- amendment, confirmed clause-by-clause against SB870's bill text.
UPDATE bills
SET superseded_at = '2025-07-07T00:00:00Z',
    superseded_by = 'HB865 (Act 32 of 2025)',
    superseded_reason = 'SB870''s substantive text (Title 51, Educational Assistance Program and Military Family Education Program amendments) was folded verbatim into HB865 via a Senate floor amendment, confirmed clause-by-clause against SB870''s own bill text. HB865 was signed as Act 32 of 2025 on 2025-07-07 carrying SB870''s content, while SB870 itself sat untouched in committee since June 2025.'
WHERE bill_number = 'SB870' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB1140 (PA Senate) — log section "## SB1140 (PA Senate)" ──────────────
-- HB1286, signed as Act 31 of 2026 on 2026-07-20, is the identical
-- companion confirmed via bill-text PDF comparison.
UPDATE bills
SET superseded_at = '2026-07-20T00:00:00Z',
    superseded_by = 'HB1286 (Act 31 of 2026)',
    superseded_reason = 'SB1140 and HB1286 carry the identical title and description amending the National Human Trafficking Resource Center Hotline Notification Act. Bill-text comparison shows identical new definitions, training-requirement structure, and enforcement/penalty amendments, with HB1286''s enacted version adding a few in-flight amendment clauses SB1140 lacks. HB1286 passed and was signed as Act 31 of 2026 on 2026-07-20, while SB1140 sat untouched in committee since January 2026.'
WHERE bill_number = 'SB1140' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB1156 (PA Senate) — log section "## SB1156 (PA Senate)" ──────────────
-- HB710, signed as Act 3 of 2026 on 2026-02-11, is the identical companion
-- confirmed via bill-text PDF comparison.
UPDATE bills
SET superseded_at = '2026-02-11T00:00:00Z',
    superseded_by = 'HB710 (Act 3 of 2026)',
    superseded_reason = 'SB1156 and HB710 carry the identical title and description amending Title 75 financial-responsibility and online-verification provisions. Bill-text comparison shows identical amended subsections and an identical new §1786.1 online verification system, differing only in minor negotiated detail. HB710 passed and was signed as Act 3 of 2026 on 2026-02-11, while SB1156 sat untouched in committee since January 2026.'
WHERE bill_number = 'SB1156' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB1000 (PA Senate) — log section "## SB1000 (PA Senate)" ─────────────
-- SB160 (real FY2025-26 General Appropriation Act) signed as Act 1A of
-- 2025 on 2025-11-12 per LegiScan's own progress/history data for
-- bill_id 2020034 ("Approved by the Governor" / "Act No. 1A of 2025",
-- both dated 2025-11-12) — see this migration's header note on why this
-- date supersedes the log's own vaguer "July 2026" citation.
UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'SB1000 is the standard procedural placeholder Pennsylvania''s Senate Appropriations Committee introduces early in a budget cycle, funding only one line item ($144,138,000 for Dept. of Education career/technical education); it never advanced past its September 2025 committee referral. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12. SB1000 was superseded before ever reaching a floor vote, not defeated on its merits.'
WHERE bill_number = 'SB1000' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── PA General Fund appropriation placeholders (2025-26 cycle) ───────────
-- log section "## PA General Fund appropriation placeholders (2025-26
-- cycle) — SB280, SB427, SB428, SB429, SB430, SB1001, SB1002, SB1003,
-- SB1004, HB1330, HB1977, HB1978, HB1979"
-- All superseded by SB160 (Act 1A of 2025, signed 2025-11-12 — see the
-- SB1000 UPDATE above and this migration's header note for sourcing).
-- SB1001 and HB1330 were individually confirmed against palegis.us by
-- the log; SB1002-1004, SB427-430, SB280, and HB1977-1979 were included
-- by exact title/text match to SB1001/HB1330 (same boilerplate "General
-- Appropriation Act" placeholder text), per the log's own caveat that
-- these were pattern-matched rather than each individually re-verified.

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Standard "General Appropriation Act" placeholder bill for the 2025-26 PA budget cycle (same boilerplate text as SB1000), referred to Appropriations 2025-09-08 with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB1001' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB1002' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB1003' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB1004' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB427' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB428' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB429' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB430' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate "General Appropriation Act" placeholder text as SB1001/SB1000 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'SB280' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Companion "General Appropriation Act" placeholder bill for the 2025-26 PA budget cycle; HB1330 itself passed the House 105-97 (2025-07-14), was reported to Senate Appropriations, then re-committed 2025-07-17 with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12 — the vehicle that actually carried the budget.'
WHERE bill_number = 'HB1330' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate placeholder text as HB1330 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'HB1977' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate placeholder text as HB1330 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'HB1978' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'SB160 (Act 1A of 2025)',
    superseded_reason = 'Same boilerplate placeholder text as HB1330 (title/pattern-matched, not individually re-verified against LegiScan/palegis), referred to committee with no further action. Pennsylvania''s actual FY2025-26 budget was enacted through a different bill, SB160, signed as Act 1A of 2025 on 2025-11-12.'
WHERE bill_number = 'HB1979' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';

-- ─── SB186 (PA Senate) — log section "## SB186 (PA Senate)" ───────────────
-- The log names no single superseding bill for SB186 ("separate
-- legislation... state budget agreement"). SB186 itself (LegiScan
-- bill_id 1941471) carries no cross-reference to what mooted it, so
-- every bill enacted in the same 2025-11-12 budget-package window (PA
-- session 2192) was searched for RGGI/CO2 Budget Trading Program
-- language: HB416 (the Fiscal Code bill, Act 45 of 2025, signed
-- 2025-11-12, LegiScan bill_id 1946034) is the match — Section 47(2) of
-- its enacted text explicitly abrogates "25 Pa. Code Ch. 145 Subch. E
-- (relating to CO2 Budget Trading Program)," the exact DEP regulation
-- SB186 targeted. See this migration's header note for the full trail.
UPDATE bills
SET superseded_at = '2025-11-12T00:00:00Z',
    superseded_by = 'HB416 (Act 45 of 2025)',
    superseded_reason = 'SB186 would repeal by statute the DEP regulation letting Pennsylvania participate in the Regional Greenhouse Gas Initiative (RGGI), a multi-state carbon-pricing program; it passed the Senate 31-18 on 2025-02-04 and remained pending in the House. Pennsylvania''s RGGI participation was independently ended by Section 47(2) of HB416 (the Fiscal Code bill, signed as Act 45 of 2025 on 2025-11-12, part of the same budget package as SB160/Act 1A), which explicitly abrogates "25 Pa. Code Ch. 145 Subch. E (relating to CO2 Budget Trading Program)" — the exact regulation SB186 targeted. SB186''s own practical effect is already resolved regardless of what happens to the bill itself.'
WHERE bill_number = 'SB186' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';
