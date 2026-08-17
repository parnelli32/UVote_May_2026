/*
  # Backfill superseded-bill data from the no-title-match verification pass

  1. Changes
    - Data-only: populates `bills.superseded_at`/`superseded_by`/
      `superseded_reason` (same columns backfilled for 48 bills by
      `20260817100000_backfill_superseded_bills_from_log.sql`) for the 7
      additional PA bills confirmed as superseded by
      `data/uvote-superseded-bills-log.md` (firstmate home)'s "No-title-match
      shortlist verification (7 new confirmed, 21 rejected)" section, added
      as a follow-up to that log's original 24 confirmed sections.
    - This is the final backfill for the superseded-bills backlog effort:
      both the title-matched shortlist (245 bills, cleared across batches
      1-9, backfilled in the prior migration) and the no-title-match
      shortlist (28 bills, cleared by this one verification pass) are now
      fully reviewed. See `data/uvote-no-title-match-verification-batch/report.md`
      for the full research trail behind these 7 bills.
    - Each UPDATE is matched on (bill_number, legislative_body_id), same
      convention as the prior migration, to avoid any cross-body collision
      between a House and Senate bill sharing a number. Every UPDATE is
      preceded by a comment citing the exact log entry it came from.
    - Legislative body ids used below (same values as the prior migration,
      from a live query against this project's Supabase instance,
      2026-08-17):
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be

  2. Dates
    - All 7 dates below are real Act signing dates pulled directly from
      LegiScan's `history` field by the verification pass (not inferred
      or placeholder), per that pass's report.
    - HB1594 is a new supersession sub-pattern for this log: its practical
      goal (keeping the Multimodal Transportation Fund's sunset clause
      from lapsing) was achieved through two successive date-extension
      bills rather than one companion enacting identical text - HB416
      (Act 45 of 2025, signed 2025-11-12) extended the deadline first,
      then SB146 (Act 21 of 2026, signed 2026-07-12) extended it again.
      `superseded_at` uses SB146's later date, since that is the vehicle
      that most recently and currently keeps HB1594's own repeal proposal
      from changing the real-world outcome.
*/

-- ─── SB697 (PA Senate) — log section "### SB697 (PA Senate)" ──────────────
-- Two of SB697's three provisions (the §9756(c.2) determinate-sentence
-- option and the §1543(b)(1)(i)/(ii) ARD license-suspension amendment) are
-- word-for-word identical to HB1615's enacted text, confirmed via bill-text
-- PDF comparison. HB1615's own ignition-interlock change touches a
-- different subsection than SB697's third provision, which remains
-- unresolved, but the two core provisions are enacted verbatim.
UPDATE bills
SET superseded_at = '2025-12-22T00:00:00Z',
    superseded_by = 'HB1615 (Act 58 of 2025)',
    superseded_reason = 'SB697 proposed three changes to Titles 42 and 75 (a determinate-sentence option for summary offenses, a reduced mandatory-minimum for a first ARD license-suspension offense, and an ignition-interlock vendor-notice requirement). Bill-text comparison shows HB1615''s enacted text is word-for-word identical to SB697''s first two provisions, down to matching dollar fines and day counts; only the third, minor, severable provision remains unresolved. HB1615 was signed as Act 58 of 2025 on 2025-12-22, while SB697 was referred to Transportation on 2025-04-30 and never advanced.'
WHERE bill_number = 'SB697' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB571 (PA Senate) — log section "### SB571 (PA Senate)" ──────────────
-- SB571 and HB482 are both the "Interstate Occupational Therapy Licensure
-- Act," amended in the same Senate committee on the same date; bill-text
-- comparison shows the ~950-line compact text is identical apart from
-- trivial wording differences.
UPDATE bills
SET superseded_at = '2026-07-20T00:00:00Z',
    superseded_by = 'HB482 (Act 28 of 2026)',
    superseded_reason = 'SB571 and HB482 are both titled the "Interstate Occupational Therapy Licensure Act," authorizing Pennsylvania to join the same interstate compact, and were amended in the same Senate committee on the same date, 2026-02-04. Bill-text comparison shows the roughly 950-line compact text is identical apart from trivial wording differences. SB571 never reached a floor vote; HB482 passed both chambers and was signed as Act 28 of 2026 on 2026-07-20.'
WHERE bill_number = 'SB571' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB773 (PA Senate) — log section "### SB773 (PA Senate)" ──────────────
-- SB773's narrower §202-A Fiscal Code proposal was folded verbatim into
-- HB1425's broader cigarette-tax omnibus, confirmed via bill-text PDF
-- comparison.
UPDATE bills
SET superseded_at = '2025-12-22T00:00:00Z',
    superseded_by = 'HB1425 (Act 57 of 2025)',
    superseded_reason = 'SB773 and HB1425 both amend the "Cost of the Retailer" definition in §202-A of the Fiscal Code (the cigarette retail-cost presumption used in the state''s cigarette minimum-markup law). Bill-text comparison shows HB1425''s §202-A amendment is word-for-word identical to SB773''s proposed text. HB1425 was a broader cigarette-tax omnibus bill, signed as Act 57 of 2025 on 2025-12-22, while SB773 was referred to Finance on 2025-05-22 and never advanced.'
WHERE bill_number = 'SB773' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB167 (PA Senate) — log section "### Third wave: PA restricted-fund
-- appropriations series duplicates — SB167, SB290, SB161" ─────────────────
-- A fourth independent Senate duplicate (after SB289, batch 6) of the
-- already-confirmed Philadelphia Taxicab and Limousine Regulatory Fund
-- appropriation that became HB1338.
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1338 (Act 7A of 2025)',
    superseded_reason = 'SB167 (introduced by Martin, 2025-04-03) makes the same Philadelphia Taxicab and Limousine Regulatory Fund appropriation to the Philadelphia Parking Authority as the enacted HB1338 - the same vehicle already confirmed against SB289 (batch 6) - appropriating $2,269,000 against HB1338''s enacted $2,193,000 for the identical fund/agency/fiscal-year. HB1338 was signed as Act 7A of 2025 on 2025-06-27; SB167 was re-committed to Appropriations 2025-05-13 and never advanced further.'
WHERE bill_number = 'SB167' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB290 (PA Senate) — log section "### Third wave: PA restricted-fund
-- appropriations series duplicates — SB167, SB290, SB161" ─────────────────
-- A second independent Senate duplicate (after SB170, batch 6) of the
-- already-confirmed State-Aided University Nonpreferred Appropriation Act
-- that became HB1421.
UPDATE bills
SET superseded_at = '2025-11-19T00:00:00Z',
    superseded_by = 'HB1421 (Act 11A of 2025)',
    superseded_reason = 'SB290 (introduced by Hughes, 2025-02-26) makes the same State-Aided University Nonpreferred Appropriation Act line items (Penn State, Pitt, Temple, Lincoln, Penn) as the enacted HB1421 - the same vehicle already confirmed against SB170 (batch 6) - with per-university figures byte-identical to HB1421''s enacted text apart from one differing line. HB1421 was signed as Act 11A of 2025 on 2025-11-19; SB290 was referred to Appropriations 2025-02-26 and never advanced.'
WHERE bill_number = 'SB290' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── SB161 (PA Senate) — log section "### Third wave: PA restricted-fund
-- appropriations series duplicates — SB167, SB290, SB161" ─────────────────
-- A fourth independent Senate duplicate (after SB283, batch 6) of the
-- already-confirmed Professional Licensure Augmentation Account
-- appropriation that became HB1333; also resolves the shortlist's own
-- flagged fiscal-year ambiguity in favor of HB1333 over HB2403.
UPDATE bills
SET superseded_at = '2025-06-27T00:00:00Z',
    superseded_by = 'HB1333 (Act 2A of 2025)',
    superseded_reason = 'SB161 (introduced by Martin, 2025-04-03) makes the same Professional Licensure Augmentation Account appropriation as the enacted HB1333 - the same vehicle already confirmed against SB283 (batch 6). SB161 explicitly appropriates for fiscal year 2025-26, confirming it is HB1333''s vehicle rather than the later FY2026-27 HB2403, with figures tracking HB1333''s enacted amounts closely enough to confirm the match. HB1333 was signed as Act 2A of 2025 on 2025-06-27; SB161 was re-committed to Appropriations 2025-05-13 and never advanced further.'
WHERE bill_number = 'SB161' AND legislative_body_id = '474bb689-6767-4a56-8429-c09c20bc715c';

-- ─── HB1594 (PA House) — log section "### HB1594 (PA House)" ─────────────
-- A different supersession sub-pattern: HB1594's goal (preventing
-- §1798.3-E's Multimodal Transportation Fund from lapsing) was achieved
-- through repeated date-extension by two successive bills, not by
-- HB1594's own proposed repeal of the sunset clause.
UPDATE bills
SET superseded_at = '2026-07-12T00:00:00Z',
    superseded_by = 'HB416 (Act 45 of 2025) then SB146 (Act 21 of 2026)',
    superseded_reason = 'HB1594 proposed striking §1798.3-E(d)''s December 31, 2025 expiration clause outright, permanently removing the sunset. It never advanced past its June 2025 committee referral. Instead of repeal, the General Assembly kept the fund alive by extending the same expiration date piecemeal: HB416 (signed 2025-11-12 as Act 45 of 2025) pushed the deadline to December 31, 2026, then SB146 (signed 2026-07-12 as Act 21 of 2026, itself amending HB416''s already-amended version) pushed it further to December 31, 2027. HB1594''s own passage or failure no longer changes the real-world outcome - the fund has not lapsed either way. Same reasoning precedent as this log''s SB186 entry (a goal achieved by separate means, regardless of the original bill''s own fate).'
WHERE bill_number = 'HB1594' AND legislative_body_id = '3b6dee71-7cbd-41f1-95d0-3f997cf035be';
