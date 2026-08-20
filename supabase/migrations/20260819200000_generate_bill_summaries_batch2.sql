/*
  # Generate real bill summaries: second production batch (25 PA bills)

  1. Purpose
    - Second production run of `.claude/skills/generate-bill-summary/SKILL.md`,
      continuing the effort started by batch 1 (`20260819150000_generate_bill_
      summaries_batch1.sql`, PR #24). Batch 1's 25 bills are now
      `status = 'pending_review'` in the live database (confirmed by spot-check
      below), so this batch's scoping query naturally excluded them without
      needing a manual exclusion list.
    - Scope: PA House/Senate bills that are `status = 'active'`,
      `reported_from_committee_at IS NOT NULL` (the votable-today set), whose
      current `summary` fails the real format gate (`parseSummaryIntoSections`
      in `src/lib/billUtils.ts`), AND `superseded_at IS NULL` (that column now
      exists live, unlike at batch 1's scope-check time), sorted by
      `introduced_date DESC` and taking the top 25.
    - Live query results at scope time: 545 bills matched the base filter
      (status/committee/format-gate); 3 were excluded for having
      `superseded_at` already set, leaving 542 eligible; the top 25 by
      `introduced_date DESC` came out 19 House / 6 Senate. Spot-checked that
      HB1239, HB2558, and HB2146 (three of batch 1's bills) are absent from
      the live "active, needs-summary" pool, confirming batch 1's migration
      was actually applied before this batch ran.
    - Legislative body ids used below (from a live query against this
      project's Supabase instance):
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be

  2. Data-quality finding: `introduced_date` is wrong for every one of these
     25 bills in the live database
    - For all 25 bills, the live `bills.introduced_date` value matches
      LegiScan's `status_date` (the date of the bill's most recent status
      change), not the true "Introduced" event date from LegiScan's own
      `progress` array (event type 1). This is exactly the pre-fix bug
      documented in `CLAUDE.md`'s "LegiScan sync + committee vote gate"
      section ("Rows synced before this fix may still hold a wrong
      `introduced_date`... a one-time backfill... was flagged as a captain
      decision, not applied automatically"). All 25 of this batch's bills
      appear to be such rows.
    - Practical effect on scoping: this batch's "most recently introduced
      first" ordering was computed using the DB's (buggy) `introduced_date`
      column, per this task's explicit brief instructions and matching
      batch 1's own method — it is therefore actually closest to "most
      recent status activity first," not true introduction date. Real
      LegiScan introduction dates for these 25 bills range from 2025-01-14
      (HB75/HB76) to 2026-06-22 (HB2649), not the tight
      2026-06-22-to-2026-06-24 band the DB column shows for all 25.
    - Since this run fetched each bill's real LegiScan data anyway (required
      for grounding the summary), every bill below has its `introduced_date`
      corrected to the true value from LegiScan's `progress` array and is
      INCLUDED in `DO UPDATE SET` for that column — a real, evidenced
      correction, not a re-derived guess, per the skill's own SQL-template
      guidance ("Only include introduced_date in DO UPDATE SET when this
      run's source genuinely shows it and you are confident in the value").
    - Recommendation: the captain-flagged systematic introduced_date backfill
      (CLAUDE.md) would fix this for the full ~3,900-bill table; this
      migration only fixes the 25 rows it touches as a side effect of doing
      the research anyway.

  3. Supersession research (Step 6.5, run for every bill)
    - All 25 bills: NOT superseded. Every bill is progressing normally
      through its own chamber-to-chamber path (or, for two bills, has a
      stalled same-chamber companion bill that is itself not enacted either —
      not supersession, since neither vehicle has resolved the question).
    - One finding worth flagging even though it did not meet the
      supersession bar: SB1377 (PA Turnpike Commission "design build best
      value" procurement) has a House companion, HB1608, carrying the
      identical policy. A secondary news source (MyChesCo) claimed this
      policy was already "enacted through Act 21 of 2026," which would have
      been a genuine supersession case — but that claim was checked directly
      against the authoritative palegis.us bill-status page for HB1608
      (still stalled in Senate Transportation Committee since 2025-10-03,
      no act number assigned) and against the official Act 21 of 2026 record
      (which shows it originated from an unrelated bill, SB146, and is a
      Fiscal Code omnibus covering COVID funding/child care staff/veterans
      trust fund grants — no connection to Turnpike procurement). The
      secondary source's claim was rejected as unreliable rather than acted
      on; SB1377's `superseded_*` columns below are NULL. See SB1377's
      `[[READ MORE]]` section for the citizen-facing note on the stalled
      House companion.
    - No entries were added to `data/uvote-superseded-bills-log.md` (firstmate
      home) this run, since no bill was found superseded.

  4. Rubric self-scores (full 9-criterion self-report per bill is in this
     batch's PR description/final report; all 25 bills passed all 9 criteria
     except where a genuinely complex or contested bill's core ran over the
     120-180 word soft target under Criterion 9's explicit override of
     Criterion 7 — HB2650, SB730, HB133, HB2224, and HB2632 — each of those
     five moved the most granular procedural/dollar-figure detail into an
     expandable `[[READ MORE]]` section rather than padding or truncating the
     mandatory four-part core; the core alone still satisfies all 9 criteria
     for those five bills). All 25 bills passed the real format gate
     (`scripts/format_gate.mjs`, importing `parseSummaryIntoSections` from
     `src/lib/billUtils.ts` directly) on the first or second attempt.

  5. Standard batch conventions (same as batch 1)
    - Every bill's `status` is set to `'pending_review'`, never
      `active`/`passed` directly, per the skill's hard contract. If any of
      these 25 `bill_id`s already exist with `status = 'active'` (populated
      by `legiscan-sync`), running this migration will downgrade that live
      status to `pending_review` — correct per the skill's contract, but the
      human reviewer must restore each bill's true status (and re-confirm
      `reported_from_committee_at`-gated votability) after approving the
      content, not leave it at `pending_review` indefinitely.
    - No `category` value is written anywhere in this migration, per the
      skill's hard contract.
    - `superseded_at`/`superseded_by`/`superseded_reason` are NULL for all
      25 bills (none found superseded) and are deliberately excluded from
      every `DO UPDATE SET` clause below, matching the skill's template —
      a prior run's real determination should never be silently clobbered
      by this run's NULL.
    - Unlike batch 1, `introduced_date` IS included in every `DO UPDATE SET`
      clause below — see Finding 2 above for why this run has high-confidence
      corrected values for all 25 bills, unlike the general case the
      template's default exclusion guidance is written for.

  6. Preconditions before running this migration by hand
    - `ON CONFLICT (legislative_body_id, bill_number)` requires the
      `UNIQUE (legislative_body_id, bill_number)` constraint added by
      `20260810090000_fix_bills_bill_number_constraint_scope.sql`. Confirm
      that migration has actually been applied to the live database before
      running this one (batch 1 already required and presumably confirmed
      this same precondition).
    - `short_description` requires
      `20260815130000_add_bills_short_description.sql` to be applied
      (nullable, so this is a safe-if-missing ordering mistake).
    - `superseded_at`/`superseded_by`/`superseded_reason` require
      `20260817090000_add_bills_superseded_and_vote_gate.sql` — confirmed
      live and applied at this batch's scope-query time (unlike at batch 1's
      time), so this precondition is already satisfied as of this writing.

  7. IMPORTANT — merging this PR to `main` does NOT apply this migration to
     the live database. Per this project's own documented convention (no CI
     step or linked `supabase` CLI project), every migration in this repo,
     including this one, is applied by hand via the Supabase Dashboard SQL
     editor. A human must run this file directly against the live database
     after reviewing its content; merging alone changes nothing live.
*/

-- HB2555: This bill requires Pennsylvania horse dealers to test every horse they sell for a serious 
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2555',
  'In domestic animals, further providing for definitions and providing for requirements for equines sold by dealer.',
  '1. This bill sets new rules for licensed horse dealers in Pennsylvania. It updates the legal definition of "dealer" to include internet sales, and requires any horse a dealer sells to have tested negative for equine infectious anemia, a serious, incurable blood disease, within the past year, with proof given to the buyer. Dealers must also check for a microchip, tattoo, or brand, and keep sale records for two years. 2. This affects licensed horse dealers, who take on new testing and recordkeeping duties, and buyers, who gain assurance a horse from a dealer has been tested and is traceable. A foal under six months with its already-tested mother is exempt. 3. If it passes, dealers statewide must test and document every horse sale starting 90 days after the bill becomes law. 4. If it doesn''t pass, dealers would not be specifically required to test horses or keep these records at sale, though other rules on moving horses across state lines stay unchanged. No significant opposition has been identified - the bill passed the House 194-8.',
  '(1) Updates the definition of "dealer" in the state''s animal-dealer law to explicitly include buying, selling, or exchanging horses over the internet or similar online platforms. (2) Requires any horse sold by a dealer to have a negative equine infectious anemia test within the past year, with proof provided at the time of sale, unless the horse is a foal under six months traveling with its already-tested mother. (3) Requires dealers to determine whether a sold horse has a microchip, tattoo, or brand, and record its identification details. (4) Requires dealers to keep sale records, including test proof and identification details, for at least two years. (5) The act takes effect 90 days after becoming law.',
  'Other',
  'This bill requires Pennsylvania horse dealers to test every horse they sell for a serious blood disease and keep sale and identification records for two years.',
  '2026-05-29',
  'pending_review',
  'Laura Frances Hanbidge',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2621: This bill creates a state-run survey program at the Department of Health to collect data o
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2621',
  'In powers and duties of the Department of Health and its departmental administrative and advisory boards, establishing the Pennsylvania Maternal and Infant Outcome Measures Survey Program.',
  '1. This bill creates a new state survey program, run by the Department of Health, called the Pennsylvania Maternal and Infant Outcome Measures Survey Program. It replaces an existing state law section on a similar federal survey and directs the department to survey people who recently gave birth in Pennsylvania about their health, behaviors, and experiences before, during, and after pregnancy. 2. This affects new parents in Pennsylvania, who may be asked to take the survey, and researchers and health officials, who gain population-level data on maternal and infant health. Personally identifying data stays confidential; the department may publish and share only de-identified data for research. 3. If it passes, the department will run this survey using available funding, including federal money, and may contract with outside groups to help, starting 60 days after the bill becomes law. 4. If it doesn''t pass, Pennsylvania would continue without this dedicated state-level maternal and infant survey program. No significant opposition has been identified - the bill passed the House 190-12.',
  '(1) Establishes the Pennsylvania Maternal and Infant Outcome Measures Survey Program within the Department of Health, replacing a prior state law section that referenced a similar federal survey system. (2) Directs the department to survey people who recently had a live birth in Pennsylvania to gather data on preconception, pregnancy, and postpartum behaviors, attitudes, and experiences. (3) Allows the department to use available funding, including federal appropriations, and to contract with outside entities to run the survey. (4) Allows the department to share identifiable data with researchers only if confidentiality is maintained, and permits publishing or sharing de-identified data for public reports and research. (5) Takes effect 60 days after becoming law.',
  'Health',
  'This bill creates a state-run survey program at the Department of Health to collect data on maternal and infant health outcomes from Pennsylvanians who recently gave birth.',
  '2026-06-09',
  'pending_review',
  'Melissa Shusterman',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2162: This bill clarifies Pennsylvania's licensing rules for drug and medical device manufacture
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2162',
  'Further providing for definitions and for license application.',
  '1. This bill updates Pennsylvania''s licensing rules for companies that manufacture or distribute prescription drugs and medical devices. It refines the legal definition of "virtual manufacturer" (a PA-based company that makes or distributes a drug or device but never physically holds it in the state) and renames the state''s "conditional license" to a "temporary license," which lets a manufacturer keep operating while its product awaits final FDA approval. 2. This affects drug and device manufacturers, especially smaller or newer companies awaiting FDA approval, and virtual manufacturers who never physically handle the product. A temporary license does not mean state approval of the product, and it expires automatically if the FDA denies the application. 3. If it passes, the Department of Health will issue temporary licenses under clearer rules: they expire after one year unless renewed, applicants must report FDA decisions or business changes within five business days, and a company can renew only once. 4. If it doesn''t pass, Pennsylvania would keep its current, less precise "conditional license" language rather than this clarified version. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Refines the legal definition of "virtual manufacturer" under the Wholesale Prescription Drug Distributors License Act to cover a Pennsylvania-based business that manufactures and distributes a drug or medical device, holds the relevant FDA approval or has a pending FDA application, and never physically possesses the product in the state. (2) Renames the act''s "conditional license" to a "temporary license" for manufacturers and virtual manufacturers whose drug or device has not yet received final FDA approval. (3) Sets rules for temporary licenses: they expire one year after issuance unless renewed, expire automatically if the FDA denies or the applicant withdraws its approval application, do not authorize commercial distribution beyond what federal law allows, and cannot be renewed more than once for the same applicant. (4) Requires temporary licensees to notify the department within five business days of an FDA decision or a material change in manufacturing/distribution arrangements, and requires the department to convert a temporary license into a full license within 30 days once all licensing conditions are met. (5) Takes effect 60 days after becoming law.',
  'Health',
  'This bill clarifies Pennsylvania''s licensing rules for drug and medical device manufacturers awaiting final FDA approval, renaming the state''s "conditional license" to a "temporary license."',
  '2026-01-28',
  'pending_review',
  'Lisa Borowski',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2650: This bill replaces Pennsylvania's current data center tax exemption with a new "GRID" cert
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2650',
  'In tax credit and tax benefit administration, further providing for definitions; in computer data center equipment incentive program, providing for certification prohibition; providing for Governor''s Responsible Infrastructure Development certification and standards; and imposing duties.',
  '1. This bill replaces Pennsylvania''s current, less-regulated sales-tax exemption for computer data centers with a new certification program called GRID (Governor''s Responsible Infrastructure Development), run by the Department of Revenue, and immediately stops the state from approving new data centers under the old program. To get GRID certified, and the tax exemption that comes with it, a developer must commit to a large minimum investment and job count, a rising share of Pennsylvania clean energy over time, public meetings, and a formal community benefit agreement with its host community. 2. This affects data center developers seeking the tax exemption, who take on these new commitments; construction and permanent workers at qualifying projects, who get prevailing-wage and above-average-wage jobs; and host and neighboring communities, who gain public meetings, a negotiated benefit agreement, and compliance reports, with extra protections for communities near sensitive watersheds or already burdened by pollution. 3. If it passes, new projects go through this GRID review instead of the old exemption, with no new certifications allowed after December 31, 2032; a project that misses its job, energy, or community commitments can lose certification and have its tax break clawed back. 4. If it doesn''t pass, the current, simpler exemption program - which this bill''s text halts new approvals under regardless - keeps operating without GRID''s clean-energy targets, community agreements, or public reporting. It passed the House on a bipartisan vote as one of three data-center bills sent to the Senate together; coverage frames it as balancing the state''s push to attract data centers against strain on the power grid and water systems, with the thresholds themselves the main point of contention.

[[READ MORE]]
To qualify, a project must commit to at least $250 million in cumulative investment, 200 prevailing-wage construction jobs, 50 permanent jobs paying at least 125% of the statewide average wage by the fourth year after certification, and annual compensation of at least $1.5 million to on-site employees after that. Its share of electricity from new Pennsylvania clean energy sources (nuclear, hydro, geothermal, solar, wind, batteries, or clean hydrogen) must reach at least 10% starting in 2027, 14.5% by 2030, and 32% by 2035, or the project must pay an alternative compliance fee instead. Developers must also submit water usage plans and, in some cases, hydrogeological studies; they cannot be certified in watersheds designated as "Exceptional Value," and must file noise and vibration mitigation plans. The tax exemption does not apply to crypto-currency mining operations, telecommunications providers'' internal-use data centers, or centers that resell more than 5% of the electricity they generate. If a project fails a community benefit commitment, the department must give written notice and at least 60 days to submit a corrective action plan before revoking certification; other violations can result in immediate revocation and repayment of the tax exemption already received.',
  '(1) Bars the Department of Revenue from certifying any new computer data center under the existing data center equipment tax-incentive program as of this act''s effective date. (2) Creates a new "Governor''s Responsible Infrastructure Development" (GRID) certification program in its place, administered by the department. (3) Requires a GRID applicant to submit a detailed application covering ownership, site, energy plan, community outreach plan, community benefit plan (minimum $250 million investment, 200 prevailing-wage construction jobs, 50 permanent jobs at 125%+ of the statewide average wage by year four), regional benefits plan, sustainability plan, water plan, and noise/vibration mitigation plan. (4) Requires certified projects to source a rising share of electricity from new Pennsylvania clean energy sources - 10% from 2027, 14.5% from 2030, 32% from 2035 - or pay an alternative compliance fee to the Pennsylvania Energy Development Authority. (5) Grants a sales-and-use tax exemption on data center equipment to GRID-certified owners/operators and qualified tenants for up to ten years, excluding crypto-mining operations, internal-use telecom data centers, and centers reselling more than 5% of their generated electricity. (6) Requires annual compliance reporting, public posting of certain compliance data, and lets nearby municipalities submit comments on compliance; the department must revoke certification (and recapture the tax exemption) for unmet requirements, with a 60-day corrective-action-plan opportunity specifically for community benefit shortfalls. (7) Bars new GRID certifications after December 31, 2032, and preserves existing municipal zoning authority. (8) Takes effect immediately.',
  'Economic Development',
  'This bill replaces Pennsylvania''s current data center tax exemption with a new "GRID" certification requiring developers to meet investment, jobs, clean-energy, and community-benefit standards.',
  '2026-06-16',
  'pending_review',
  'Joseph Webster',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2551: This bill bans Pennsylvania state agencies from texting people about unpaid fines, fees, o
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2551',
  'In powers and duties in general, providing for certain text-based communications prohibited.',
  '1. This bill bans Pennsylvania state agencies, including the PA Turnpike Commission, from texting people to collect or warn about an unpaid fine, fee, toll, or other charge, unless the person has specifically agreed to get such texts. Agencies could still text free general information about state services. "Text-based communication" covers texts, instant messages, and social media messages, but not email. 2. This affects Pennsylvania residents who receive texts claiming to be from a state agency about an unpaid toll or fine, and state agencies like the Turnpike Commission and PennDOT, who would have to stop sending debt-related texts unless someone opted in. It responds to a wave of scam texts impersonating state agencies over fake unpaid tolls. 3. If it passes, a text demanding payment for an unpaid fine or toll could no longer legitimately come from a state agency, making the law itself a tool residents can use to recognize scam texts on sight. 4. If it doesn''t pass, state agencies could keep sending fine, fee, and toll texts, and residents would have to keep guessing whether a "pay now" text is real or a scam. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Prohibits a Commonwealth agency from using a text-based communication to collect, or notify someone about, an unpaid fine, fee, toll, or other charge owed to that agency, unless the individual has given explicit consent, or the message is free informational content about a state service that benefits the recipient. (2) Defines "text-based communication" as a text message, instant message, social media message, or other written communication sent or received on an interactive mobile device (a phone, tablet, or similar device); email is excluded. (3) Takes effect 60 days after becoming law.',
  'Public Safety',
  'This bill bans Pennsylvania state agencies from texting people about unpaid fines, fees, or tolls unless they''ve opted in, to help residents spot scam texts impersonating the state.',
  '2026-05-28',
  'pending_review',
  'Mary Isaacson',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB76: This bill updates outdated licensing-board terminology in Pennsylvania's Medical Practice 
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB76',
  'Further providing for definitions.',
  '1. This bill updates two definitions in Pennsylvania''s Medical Practice Act of 1985, the law governing medical doctors. It fixes an outdated reference to the "State Board of Osteopathic Medical Examiners," correcting it to the board''s current name, the State Board of Osteopathic Medicine, and tightens the definition of "primary supervising physician" (the doctor responsible for overseeing a physician assistant) to require that doctor be licensed by the board, not just registered. 2. This affects physician assistants and their supervising physicians, since it clarifies who legally qualifies for that supervisory role, and osteopathic doctors, whose licensing board is now correctly named in the law. It is a companion bill to HB75, which makes the matching fix on the osteopathic side of the law. 3. If it passes, Pennsylvania''s medical-doctor and osteopathic-doctor licensing laws will use the same, current terminology for who can supervise a physician assistant, closing a wording gap between the two related laws. 4. If it doesn''t pass, the Medical Practice Act would keep referencing the licensing board''s old name and a looser "registered" standard, out of step with the board''s actual current name and its companion law. No significant opposition has been identified - the bill advanced through committee as amended.',
  '(1) Corrects the Medical Practice Act of 1985''s definition of "doctor of osteopathy or osteopathic doctor" to reference the State Board of Osteopathic Medicine (the board''s current name) and cite the Osteopathic Medical Practice Act by name. (2) Amends the definition of "primary supervising physician" to require that the supervising medical doctor or osteopathic doctor be licensed by the applicable board, removing an outdated reference to being merely "registered" with the board. (3) Takes effect 180 days after becoming law.',
  'Health',
  'This bill updates outdated licensing-board terminology in Pennsylvania''s Medical Practice Act, clarifying that a doctor supervising a physician assistant must be licensed, not just registered.',
  '2025-01-14',
  'pending_review',
  'Arvind Venkat',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB75: This bill updates Pennsylvania's Osteopathic Medical Practice Act to require that a doctor
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB75',
  'Further providing for definitions.',
  '1. This bill updates the definition of "primary supervising physician" in Pennsylvania''s Osteopathic Medical Practice Act, the law governing osteopathic doctors. It requires that an osteopathic physician overseeing a physician assistant be licensed by the State Board of Osteopathic Medicine, or that a medical doctor in that role be licensed by the State Board of Medicine, replacing an older reference to being merely registered. 2. This affects physician assistants and their supervising physicians, since it clarifies who legally qualifies for that supervisory role. It is a companion bill to HB76, which makes the matching fix in the state''s separate Medical Practice Act. 3. If it passes, Pennsylvania''s osteopathic and medical-doctor licensing laws will use the same, current "licensed" standard for who can supervise a physician assistant, closing a wording gap between the two related laws. 4. If it doesn''t pass, the Osteopathic Medical Practice Act would keep the older "registered" standard, out of step with its companion law and current licensing practice. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Amends the Osteopathic Medical Practice Act''s definition of "primary supervising physician" to require that the supervising osteopathic physician be licensed by the State Board of Osteopathic Medicine, or that a supervising medical doctor be licensed by the State Board of Medicine, removing an outdated reference to being merely "registered." (2) Takes effect 180 days after becoming law.',
  'Health',
  'This bill updates Pennsylvania''s Osteopathic Medical Practice Act to require that a doctor supervising a physician assistant be licensed, not just registered, matching its companion law.',
  '2025-01-14',
  'pending_review',
  'Arvind Venkat',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB469: This bill lets current and retired Pennsylvania law enforcement officers buy resident hunt
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB469',
  'In fishing licenses, providing for law enforcement; and, in hunting and furtaking licenses, further providing for resident license and fee exemptions and for license costs and fees.',
  '1. This bill lets current and retired Pennsylvania law enforcement officers buy a resident hunting license and a resident fishing license each year for $1 each, instead of the regular price (currently about $21 for hunting and $28 for fishing). 2. This affects a broad range of officers defined in the bill - municipal police, state troopers, corrections officers, county sheriffs and deputies, campus and university police, railroad and airport police, and county park police - along with retirees from those roles, all of whom become eligible for the $1 licenses. The state''s Fish and Boat Commission and Game Commission administer the discount. 3. If it passes, eligible officers statewide will be able to buy discounted hunting and fishing licenses starting 60 days after the bill becomes law, saving roughly $20 to $27 per license compared to standard resident rates. 4. If it doesn''t pass, law enforcement officers and retirees would keep paying the standard resident license fees for hunting and fishing, with no officer-specific discount in state law. No significant opposition has been identified - the bill passed the Senate unanimously and moved to the House.',
  '(1) Creates a $1 resident fishing license for any person employed or formerly employed as a law enforcement officer in Pennsylvania, covering municipal police, state police, corrections officers, county sheriffs and deputies, campus/university police, railroad and street railway police, airport authority police, and county park police. (2) Creates a matching $1 resident hunting license ("law enforcement hunting license") for the same group of current and retired officers. (3) Sets the license cost for this category at $1 in the state''s hunting license fee schedule. (4) Takes effect 60 days after becoming law.',
  'Public Safety',
  'This bill lets current and retired Pennsylvania law enforcement officers buy resident hunting and fishing licenses for $1 each instead of the standard fee.',
  '2025-03-18',
  'pending_review',
  'Wayne Langerholc',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2234: This bill, the "Brews to Barns Act," gives Pennsylvania breweries a tax credit for donatin
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2234',
  'In malt beverage tax, further providing for limited tax credits and providing for spent grain donation tax credit.',
  '1. This bill, known as the "Brews to Barns Act," creates a new state tax credit for Pennsylvania breweries that donate their leftover spent grain, a byproduct of brewing, to nearby farms for agricultural use. Breweries get 16 cents per dry pound of grain donated, up to $30,000 in credit per brewery each year, with a $5 million statewide cap on total credits given out annually. 2. This affects Pennsylvania breweries, which gain a financial incentive to donate spent grain instead of paying to dispose of it, and nearby farms within 100 miles of a brewery, which can receive that grain for livestock feed or other agricultural use at no cost. The state''s general fund absorbs the cost of the credits, up to $5 million a year. 3. If it passes, breweries can start applying for the credit for grain donated in tax years beginning after December 31, 2025, giving them a direct financial reason to partner with local farms instead of trucking spent grain to a landfill. 4. If it doesn''t pass, breweries would keep donating or disposing of spent grain without a dedicated state tax credit. No significant opposition has been identified - the bill passed the House 196-6.

[[READ MORE]]
The bill also separately amends the state''s existing malt beverage tax credit (for capital equipment purchases): it extends that credit''s carryforward period from three to five years and, for the first time, lets a brewery sell or assign that credit to another Pennsylvania brewery, subject to Department of Revenue approval. Applicants for the new spent-grain credit must be current on state tax filings and payments, and the department must consult the Liquor Control Board to verify a brewery''s eligibility. The department reports annually to the legislature''s Appropriations and Finance committees on credit usage and the amount of grain donated.',
  '(1) Creates a spent grain donation tax credit: a Pennsylvania brewery ("qualified taxpayer") that donates spent grain byproduct to an eligible agricultural operation within 100 miles gets a credit of 16 cents per dry-weight pound donated, capped at $30,000 per brewery per year and $5 million total statewide per year. (2) Requires an annual application to the Department of Revenue, which consults the Liquor Control Board to verify eligibility, and requires applicants to be current on state taxes. (3) Allows unused credit to carry forward up to five taxable years, with no carryback or refund. (4) Separately amends the state''s existing malt beverage tax credit (for capital equipment purchases) to extend its carryforward period from three to five years and to allow a brewery to sell or assign that credit to another Pennsylvania brewery, subject to Department of Revenue approval. (5) Requires the department to report annually to the legislature''s Appropriations and Finance committees on credit usage and the amount of grain donated. (6) Applies to taxable years beginning after December 31, 2025; takes effect 60 days after becoming law.',
  'Economic Development',
  'This bill, the "Brews to Barns Act," gives Pennsylvania breweries a tax credit for donating spent grain to nearby farms, capped at $5 million statewide per year.',
  '2026-02-20',
  'pending_review',
  'Ryan Bizzarro',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB1127: This bill lets Pennsylvania join a multi-state compact allowing dentists and dental hygien
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB1127',
  'Authorizing the Commonwealth of Pennsylvania to join the Dentist and Dental Hygienist Compact; and providing for the form of the compact.',
  '1. This bill lets Pennsylvania join the Dentist and Dental Hygienist Compact, a multi-state agreement that lets a dentist or dental hygienist already licensed in one member state get a "Compact Privilege" to practice in Pennsylvania without a full separate state license. Participating states share licensing and disciplinary records through a joint database, and a provider must pass a national criminal background check to use the privilege. 2. This affects dentists and dental hygienists licensed in other compact-member states who want to practice in Pennsylvania, and Pennsylvania-licensed providers who want to practice elsewhere in the compact, along with military spouses in dental professions, who the compact aims to help relocate without new licensing delays. Pennsylvania patients, especially in underserved areas, could see more providers become available. 3. If it passes, once enough states join to activate the compact''s governing commission, a dentist or hygienist licensed elsewhere in the compact could start practicing in Pennsylvania under a Compact Privilege, while still following Pennsylvania''s own scope-of-practice rules. 4. If it doesn''t pass, out-of-state dentists and hygienists would still need Pennsylvania''s own full license to practice here, and Pennsylvania providers would still need a separate license in each state where they want to work. No significant organized opposition to the compact concept has been identified, though the bill passed narrowly, 136-66.

[[READ MORE]]
A separate, identically-titled Senate bill (SB81) proposing the same compact has been stalled in the Senate Consumer Protection & Professional Licensure Committee since January 22, 2025, with no further action. This House bill is the version that has actively advanced: it failed two earlier floor votes 100-102 in June 2026 before passing 136-66 after further amendment, then cleared the Appropriations Committee 37-0 and won final House passage the same day. It now moves to the Senate.',
  '(1) Authorizes the Governor to execute, on Pennsylvania''s behalf, the Dentist and Dental Hygienist Compact with other participating states. (2) Requires participating states to share licensing, examination, and disciplinary information through a joint data system and to require a criminal background check for a provider seeking a Compact Privilege. (3) Establishes a Compact Privilege allowing a dentist or dental hygienist licensed in one participating state to practice in another participating state without obtaining a separate full license there, while remaining subject to that state''s scope-of-practice and disciplinary rules. (4) Creates the Dentist and Dental Hygienist Compact Commission, a joint multi-state body that administers the compact and sets its rules. (5) Preserves each state''s existing licensure requirements and does not override state law on the practice of dentistry or dental hygiene within its borders.',
  'Health',
  'This bill lets Pennsylvania join a multi-state compact allowing dentists and dental hygienists licensed in other member states to practice here without a separate full Pennsylvania license.',
  '2025-04-03',
  'pending_review',
  'Kyle Mullins',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB730: This bill creates a formal, statewide "POLST" medical order that lets seriously ill Pennsy
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB730',
  'In health care, further providing for applicability, for definitions, for criminal penalties, for emergency medical services, for definitions, for orders, bracelets and necklaces, for revocation, for absence of order, bracelet or necklace and for emergency medical services, repealing provisions relating to advisory committee and providing for discontinuance and for Pennsylvania orders for life-sustaining treatment.',
  '1. This bill creates a formal legal category in Pennsylvania law for "Pennsylvania Orders for Life-Sustaining Treatment," or POLST, alongside the state''s existing out-of-hospital do-not-resuscitate orders. Unlike a general advance directive, a POLST is a signed medical order, based on a conversation between a patient and their doctor, spelling out exactly which life-sustaining treatments a seriously ill patient does or doesn''t want, so emergency responders and other providers follow it immediately across any care setting. 2. This affects patients with a diagnosed life-limiting, irreversible illness - the bill explicitly says a POLST is not for people who are healthy or have a stable chronic condition - along with their families and surrogate decision-makers, and doctors, hospitals, nursing homes, and EMS providers, who must honor a valid POLST. Health insurers are barred from requiring, rewarding, or penalizing anyone based on whether they have one. 3. If it passes, the Department of Health, advised by a new POLST Advisory Committee representing doctors, hospitals, home care and hospice groups, disability advocates, and bioethicists, will create a standard statewide POLST form and make it public; falsifying, forging, or destroying someone''s POLST without consent becomes a crime, the same as it already is for existing DNR orders. 4. If it doesn''t pass, Pennsylvania would keep relying only on its existing out-of-hospital DNR order and general advance directives, which cover a narrower set of treatment decisions and don''t carry the same binding order status across every care setting. No significant opposition has been identified - the bill passed the Senate unanimously.

[[READ MORE]]
A POLST can only be completed after a physician confirms in writing, using reasonable medical judgment, that the patient has a diagnosed life-limiting and irreversible condition - it may not be used simply because someone is seriously ill, and the bill states explicitly that nothing in it supports euthanasia or assisted suicide. No POLST is valid without the voluntary consent of the patient or their surrogate decision-maker, and a health care provider or facility cannot make having a POLST a condition of admission or continued care, or offer any financial incentive tied to consenting to one. The 12-member POLST Advisory Committee must include representatives from the Pennsylvania Medical Society, the Hospital and Healthsystem Association of Pennsylvania, the Pennsylvania Homecare Association, the Pennsylvania Bar Association, patient and disability-rights advocates, and both secular and faith-based bioethicists. The Department of Health must keep the POLST form and educational materials in plain, understandable language and coordinate with the Departments of Aging and Human Services on the needs of older adults and people with disabilities.',
  '(1) Creates "Pennsylvania Orders for Life-Sustaining Treatment" (POLST) as a new, legally recognized medical order alongside the existing out-of-hospital do-not-resuscitate (OOH-DNR) order framework. (2) Limits POLST eligibility to patients with a physician-confirmed, diagnosed life-limiting and irreversible condition; bars its use for stable or merely seriously ill patients; and states it does not support euthanasia or assisted suicide. (3) Requires voluntary patient or surrogate consent for any POLST, and bars health insurers, providers, and facilities from requiring, incentivizing, or penalizing based on whether someone has one. (4) Creates a POLST Advisory Committee, appointed by the Secretary of Health with representatives from named medical, legal, home care, disability-rights, and bioethics organizations, to advise the Department of Health. (5) Requires the department to adopt a standard statewide POLST form and educational materials, publish them online in plain language, and coordinate with the Departments of Aging and Human Services. (6) Extends the existing criminal penalties for falsifying, concealing, or tampering with an advance directive or DNR order to cover POLST documents as well. (7) Provides that the current OOH-DNR subchapter continues operating until the department adopts an initial POLST form, at which point transition/discontinuance provisions take effect.',
  'Health',
  'This bill creates a formal, statewide "POLST" medical order that lets seriously ill Pennsylvania patients specify which life-sustaining treatments they want, binding across every care setting.',
  '2025-05-12',
  'pending_review',
  'Gene Yaw',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB1585: This bill makes it a crime to charge people money to remove their booking photo from a web
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB1585',
  'In theft and related offenses, further providing for the offense of theft by extortion; and, in criminal history record information, providing for request and removal of the dissemination of booking photographs.',
  '1. This bill makes "mugshot extortion" a crime in Pennsylvania: if someone publishes a person''s police booking photo online and then charges that person money to remove, hide, or change it, that counts as theft by extortion. It also gives people a right to demand that a company publishing booking photos (a "noncriminal justice agency," like a mugshot website) take down and destroy their photo, if their case ended without a conviction or was sealed, expunged, vacated, or pardoned. 2. This affects people whose booking photo was published online commercially, especially by mugshot websites that profit from posting photos and then charging a fee to remove them, and site operators, who must post removal-request contact information and act on qualifying requests within seven days. 3. If it passes, mugshot sites operating in Pennsylvania must post removal contact information, honor qualifying takedown requests within a week or face a $100-per-day civil penalty, and anyone caught charging a fee to remove a mugshot faces criminal extortion charges and a separate consumer-protection-law violation. 4. If it doesn''t pass, mugshot extortion would remain legal in Pennsylvania, and people whose cases were dismissed, expunged, or pardoned would have no legal right to demand a commercial site take down their booking photo. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Adds soliciting or accepting payment to remove, destroy, or refrain from publishing a booking photograph to the definition of theft by extortion under Title 18, with each payment counted as a separate violation. (2) Requires any "noncriminal justice agency" that publishes or disseminates booking photographs to post an active email address, phone number, and mailing address for removal requests. (3) Requires such an agency to remove and destroy an individual''s booking photograph within seven calendar days of a documented request, if the underlying charge ended without a conviction, is under a court-ordered limited-access seal, received Clean Slate limited access, or was expunged, vacated, or pardoned. (4) Sets a $100-per-day civil penalty for each day an agency fails to comply with a valid removal request past the seven-day deadline, in addition to other available civil remedies. (5) Also makes commercial-use publication of a booking photograph a second-degree misdemeanor when tied to a fee-for-removal scheme, and treats that conduct as a separate violation of the Unfair Trade Practices and Consumer Protection Law. (6) Takes effect 60 days after becoming law.',
  'Public Safety',
  'This bill makes it a crime to charge people money to remove their booking photo from a website, and lets people whose cases were dismissed, sealed, or expunged demand removal.',
  '2025-06-10',
  'pending_review',
  'Aaron Bernstine',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB362: This bill makes stealing someone's SNAP or public-assistance benefits through card skimmin
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB362',
  'In public assistance, further providing for false statements, investigations and penalty.',
  '1. This bill creates new criminal penalties for "EBT skimming" - stealing a public assistance recipient''s benefit card information using scanning devices or "reencoders" to clone the card and drain their SNAP or cash benefits. A first offense is a third-degree felony; a second or later offense is a second-degree felony, and anyone convicted must repay the stolen benefits. 2. This affects SNAP and other public-assistance recipients, who gain stronger legal protection against having their benefit cards skimmed - state officials reported more than 5,100 skimming cases and about $2.5 million stolen statewide between January and May 2026 alone. It also affects people who commit this fraud, who now face felony charges instead of a lesser one. 3. If it passes, EBT skimming becomes a felony statewide, prosecutors get an extra year (five instead of four) to bring charges, and courts can order restitution paid back over a longer period than the standard rule normally allows. 4. If it doesn''t pass, EBT skimming would continue to be prosecuted under weaker or less specific existing law, without the felony grading, restitution powers, or extended statute of limitations this bill adds. No significant opposition has been identified - the bill passed the Senate unanimously, 49-0.

[[READ MORE]]
The bill also separately tightens an existing rule for recipients who lie to get benefits (not the skimming crime above): a conviction for benefits fraud costs someone their cash-assistance eligibility for six months on a first offense, twelve months on a second, and permanently on a third. It also updates that provision''s outdated program references, replacing the former Aid to Families with Dependent Children and General Assistance programs with the current Temporary Assistance for Needy Families program.',
  '(1) Creates a new criminal offense for knowingly using a scanning device or "reencoder" to access, copy, or use a public-assistance recipient''s benefit card ("access device") information without authorization - grading a first offense as a third-degree felony and a second or subsequent offense as a second-degree felony, counting prior convictions from Pennsylvania, other states, or federal courts. (2) Requires anyone convicted of this or the existing benefits-fraud offense to pay restitution, which a court may order paid over a period longer than the standard maximum sentence if it finds that reasonable and in the interests of justice. (3) Extends the statute of limitations for these offenses from four years to five years. (4) Updates the cash-assistance eligibility penalty for a benefits-fraud conviction (six months ineligible on a first conviction, twelve months on a second, permanent on a third) to apply to Temporary Assistance for Needy Families, replacing outdated references to the former Aid to Families with Dependent Children and General Assistance programs. (5) Takes effect 60 days after becoming law.',
  'Public Safety',
  'This bill makes stealing someone''s SNAP or public-assistance benefits through card skimming a felony in Pennsylvania and extends how long prosecutors have to bring charges.',
  '2025-02-28',
  'pending_review',
  'Lisa Boscola',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB1377: This bill lets the Pennsylvania Turnpike Commission choose highway and bridge contractors 
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1377',
  'In transportation infrastructure, providing for design build best value.',
  '1. This bill lets the Pennsylvania Turnpike Commission pick highway and bridge contractors using "design build best value" - cost, quality, and technical approach - instead of simply awarding to the lowest bidder, when a project is especially complex, needs specialized equipment, or faces real time pressure. 2. This affects the Turnpike Commission, which gains more flexibility choosing contractors, and construction firms bidding on Turnpike projects, some of which may now be evaluated on more than price alone. It also affects Turnpike drivers and taxpayers, who are the audience for the commission''s required public reporting on which projects use this method and why. 3. If it passes, the commission can use this method for four years after the law takes effect, though contracts signed within that window stay valid up to eight years; the commission must post project details online and publicly report its cost-benefit case for each one. 4. If it doesn''t pass, the Turnpike Commission would keep using its current process, generally required to select the lowest responsible bidder, without this added flexibility. No significant opposition has been identified.

[[READ MORE]]
A nearly identical House bill (HB1608), proposing the same design-build-best-value authority for the Turnpike Commission, passed the House 191-12 in October 2025 but has been stalled in the Senate Transportation Committee since, with no further action as of this writing. This Senate bill (SB1377) is a separate, newer vehicle carrying the same underlying policy forward through the Senate; it is not a case of one bill resolving the other, since neither has yet been signed into law.',
  '(1) Authorizes the Pennsylvania Turnpike Commission to use "design build best value," an alternative contractor-selection method for highway and bridge design-and-construction projects, instead of standard competitive sealed bidding or proposals. (2) Allows the commission to use this method when a project''s complexity, potential for innovation, need for specialized equipment, risk, schedule, or other factors would benefit from it. (3) Allows the commission to offer a limited stipend to shortlisted offerors in certain two-step procurements, subject to restrictions. (4) Requires the commission to post project information related to design build best value on its public website and prepare a report describing each approved project, including a cost-benefit comparison against normal procurement. (5) Limits the commission''s authority to use this method to four years after the law''s effective date, though contracts fully signed within eight years of that date remain valid.',
  'Transportation',
  'This bill lets the Pennsylvania Turnpike Commission choose highway and bridge contractors based on overall value rather than only the lowest bid, for up to four years.',
  '2026-06-09',
  'pending_review',
  'Judith Ward',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB426: This bill requires Pennsylvania state agencies to prioritize native, insecticide-free plan
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB426',
  'Providing for duties of Commonwealth agencies regarding native plants and for duties of Department of Conservation and Natural Resources regarding pollinator habitats and native plants.',
  '1. This bill, the "Native Habitats at Commonwealth Facilities Act," directs Pennsylvania state agencies to prioritize planting native, insecticide-free plants instead of non-native ones whenever they build or maintain landscaping at a state-owned facility, where schedule and plant supply allow. Agencies must also consider turning unused lawn areas into native plantings or pollinator meadows, and update their own landscaping design standards to reflect this priority. 2. This affects state agencies generally, which take on new landscaping duties, and especially the Department of Conservation and Natural Resources, which must maintain or create pollinator habitat at its own resource centers and state parks, publish guidance for other agencies, and write a native-pollinator conservation plan updated every five years. It also affects pollinators like monarch butterflies and Pennsylvanians who visit state land. 3. If it passes, this becomes a standing preference, not an absolute mandate, for native plants on new or renovated state landscaping starting immediately, with the department''s specific habitat and planning duties phased in over 18 months. 4. If it doesn''t pass, state agencies would keep making landscaping choices without any statewide preference for native, insecticide-free plants, and the department would have no dedicated pollinator-habitat or conservation-planning duties. No significant opposition has been identified - the bill passed the House nearly unanimously, 198-4.

[[READ MORE]]
"Commonwealth agency" is defined broadly to include executive offices, boards, commissions, and Commonwealth-affiliated entities such as the Turnpike Commission, the Pennsylvania Housing Finance Agency, and community colleges. It excludes courts, the legislature and its own agencies (like the Legislative Reference Bureau), and "state-related" universities that receive some state funding but operate independently - Penn State, Pitt, Temple, and Lincoln University.',
  '(1) Directs Commonwealth agencies, when conducting a landscaping project at a state facility, to prioritize native plants untreated with systemic insecticides over non-native plants, as feasible with schedule and supply, and to consider converting unused turfgrass/lawn areas to native plantings or pollinator meadows. (2) Requires agencies with their own facility design or landscaping standards to update those standards to reflect this native-plant priority. (3) Requires the Department of Conservation and Natural Resources to maintain or establish pollinator meadows or gardens at its resource management centers and state park offices as public demonstration areas. (4) Requires the department to publish guidance for other agencies on using and maintaining native plants, and to draft (and revise every five years) a native pollinator conservation plan covering pollinator status, risks, and mitigation best practices, with implementing regulations specifying which plants are covered. (5) Excludes courts, the legislature and its agencies, and state-related universities (Penn State, Pitt, Temple, Lincoln) from the definition of covered "Commonwealth agency." (6) The agency-duties provisions take effect immediately; the department''s pollinator-habitat and conservation-plan duties take effect in 18 months.',
  'Environment',
  'This bill requires Pennsylvania state agencies to prioritize native, insecticide-free plants in landscaping projects and directs the state''s conservation department to build pollinator habitat.',
  '2025-01-31',
  'pending_review',
  'Christopher Pielli',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2207: This bill raises the maximum Pennsylvania small-business capital development loan from $40
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2207',
  'In small business first, further providing for capital development loans.',
  '1. This bill raises the maximum size of a state "capital development loan" for small businesses in Pennsylvania, from $400,000 to $2 million, or 50% of the total project cost, whichever is less. These loans, made through the state''s Small Business First program, help small businesses buy land, buildings, machinery, and equipment. 2. This affects small businesses applying for this state loan program, who can now finance much larger capital projects than before, and the state authority that reviews and approves these loans, which continues reviewing applications within 30 days as it does today. 3. If it passes, a small business seeking a large equipment or facility purchase could get up to $2 million in state loan support, five times today''s cap, starting 60 days after the bill becomes law. 4. If it doesn''t pass, the loan cap stays at $400,000, which for a large capital project like a new building or major equipment purchase may cover a much smaller share of total costs than a business actually needs. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Raises the maximum amount of a capital development loan under the state''s Small Business First program from $400,000 to $2,000,000, capped at 50% of total capital development project costs, whichever is less, for financing land, buildings, machinery, and equipment. (2) Leaves unchanged the authority''s existing 30-day review timeline for completed loan applications. (3) Takes effect 60 days after becoming law.',
  'Economic Development',
  'This bill raises the maximum Pennsylvania small-business capital development loan from $400,000 to $2 million.',
  '2026-02-09',
  'pending_review',
  'Paul Friel',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2473: This bill repeals a handful of outdated, no-longer-used Pennsylvania insurance laws withou
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2473',
  'Repealing obsolete laws related to insurance.',
  '1. This bill repeals two outdated pieces of Pennsylvania insurance law that are no longer needed: the 1996 Flood Insurance Education and Information Act, and three specific, obsolete sections of the state''s 1921 Insurance Company Law. 2. This is a housekeeping bill that doesn''t change how insurance works for consumers or companies today - it removes old statutory language the legislature has determined is expired or no longer applicable, so it affects the state''s statute books rather than anyone''s actual insurance coverage or rights. 3. If it passes, these obsolete provisions come off the books immediately, tidying up Pennsylvania''s insurance statutes without changing any current insurance rule, right, or requirement. 4. If it doesn''t pass, these unused, outdated provisions would simply remain on the books without any practical effect. No significant opposition has been identified - the bill passed the House unanimously, 202-0.',
  '(1) Repeals the act of July 11, 1996, known as the Flood Insurance Education and Information Act. (2) Repeals sections 635.1(d), 635.6(c), and 2194 of the act of May 17, 1921, known as The Insurance Company Law of 1921. (3) Takes effect immediately upon becoming law.',
  'Government Operations',
  'This bill repeals a handful of outdated, no-longer-used Pennsylvania insurance laws without changing any current insurance rule or requirement.',
  '2026-04-29',
  'pending_review',
  'Jennifer Mazzocco',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB1352: This bill lets well-performing, nationally accredited Pennsylvania drug and alcohol treatm
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1352',
  'In departmental powers and duties as to licensing, providing for issuance of licenses by Department of Drug and Alcohol Programs.',
  '1. This bill lets well-performing drug and alcohol treatment providers in Pennsylvania get a two-year state license instead of the standard one-year license. To qualify, a provider must have been in good standing, not on provisional status, for at least two years and hold current multiyear accreditation from a national accrediting organization that already reviews the same quality standards. 2. This affects licensed substance-use-disorder treatment providers, who get reduced paperwork and inspection burden if they qualify, and the Department of Drug and Alcohol Programs, which does one inspection per two-year period instead of annually for these providers, though that inspection must still be as thorough as a normal one-year inspection. It doesn''t limit the department''s ability to inspect any provider in response to a complaint at any time. 3. If it passes, qualifying providers can start getting two-year licenses and less frequent routine inspections starting 60 days after the bill becomes law, while a provider who loses its accreditation and doesn''t report that within 14 days falls back to standard annual licensing. 4. If it doesn''t pass, all providers, regardless of track record or national accreditation, would keep going through annual licensing inspections. Unlike many bills in this batch, this one did not pass unanimously - it cleared the Senate 45-5.',
  '(1) Requires the Department of Drug and Alcohol Programs to issue a two-year license, instead of the standard one-year license, to a treatment provider that has been in good standing (not provisional) for at least two consecutive years and holds current multiyear accreditation from a national accrediting body whose review process covers the same quality standards the department would otherwise inspect for. (2) Limits the department to one licensing inspection per two-year period for these providers, of equivalent scope and depth to a standard annual inspection, though it may use representative sampling of records rather than reviewing everything. (3) Requires a provider that loses its accreditation to notify the department within 14 days; failure to notify subjects the provider to standard one-year licensing and inspection at the next renewal. (4) Preserves the department''s authority to conduct complaint-based or other inspections at any time, regardless of a provider''s two-year license status. (5) Takes effect 60 days after becoming law.',
  'Health',
  'This bill lets well-performing, nationally accredited Pennsylvania drug and alcohol treatment providers get a two-year state license instead of renewing every year.',
  '2026-06-04',
  'pending_review',
  'Michele Brooks',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2544: This bill requires Pennsylvania school districts to negotiate pay and benefits agreements 
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2544',
  'In professional employees, further providing for compensation plans for school administrators.',
  '1. This bill updates the rules for how Pennsylvania school districts set pay and benefits for school administrators - principals, vice principals, and other administrative staff who aren''t part of a union. It renames the district''s "compensation plan" an "agreement," explicitly confirms this covers principals and assistant/vice principals, and requires districts to meet and discuss pay, evaluations, and benefits with administrators in good faith before adopting an agreement, without administrators first having to formally request it. 2. This affects school administrators, who gain mandatory negotiation-style protections, including a formal complaint and mediation process for disputes and new representation rights at disciplinary meetings. It also affects school boards and district leadership, who must follow this more structured process. 3. If it passes, districts statewide must negotiate these agreements in good faith, and administrators gain a defined path - meeting with the superintendent, then the school board, then optional mediation - to resolve pay or treatment disputes. 4. If it doesn''t pass, districts keep the current, more limited process, where meet-and-discuss rights only apply if a majority of administrators formally request it. The bill passed the House on a contested vote, 141-61, after a related floor amendment failed 97-105 - real opposition exists, though the specific arguments made against it were not found in available coverage.

[[READ MORE]]
Beyond the core meeting process, the bill gives an administrator the right to bring another covered administrator as a representative to any meeting where discipline, termination, or working conditions may be discussed, and the right to reschedule a meeting until obtaining their own legal representation if the district''s attorney will be present. Agreements must run one to five school years and cover salary, benefits, a performance-evaluation process consistent with existing state evaluation law, and a complaint process. An adopted agreement becomes binding once entered into the school board''s minutes, and a prior agreement stays in effect until a new one is ratified.',
  '(1) Renames school districts'' administrator "compensation plans" as "agreements" and clarifies the definition of "school administrator" to explicitly include principals, assistant principals, and vice principals (removing a prior exclusion of principals). (2) Requires school employers to meet and discuss compensation, performance evaluations, and benefits with school administrators in good faith before adopting an agreement, removing the prior requirement that a majority of administrators first request it. (3) Requires written agreements lasting one to five school years, covering salary, benefits, a performance-evaluation process, a complaint process, and a nonbinding mediation option through the Pennsylvania Bureau of Mediation for unresolved disputes. (4) Provides administrators a formal appeal process for performance or rights disputes: a meeting with the superintendent, then with the school board or a board committee, with the right to bring another covered administrator as a representative. (5) Gives an administrator the right to representation at any disciplinary or working-conditions meeting, and the right to reschedule a meeting until obtaining legal representation if the district''s attorney will be present. (6) Provides that an adopted agreement is binding once entered into the board''s minutes, and that a prior agreement stays in effect until a new one is ratified. (7) Takes effect 60 days after becoming law.',
  'Education',
  'This bill requires Pennsylvania school districts to negotiate pay and benefits agreements with principals and other school administrators, adding new representation and dispute-resolution rights.',
  '2026-05-27',
  'pending_review',
  'Paul Takac',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- SB1183: This bill raises the donation-amount thresholds that trigger mandatory financial audits fo
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1183',
  'Further providing for registration of charitable organizations, financial reports, fees and failure to file.',
  '1. This bill raises the annual-donation thresholds that determine how much financial review a Pennsylvania-registered charity must get. Charities raising $1 million or more a year, up from $750,000, need a full independent audit; those raising $500,000 to $1 million, up from $250,000-$750,000, need a review or audit; those raising $150,000 to $500,000, up from $100,000-$250,000, need at least a compilation; and charities under $150,000, up from $100,000, face no mandatory review at all. 2. This affects charitable organizations registered to solicit donations in Pennsylvania, especially small and mid-size nonprofits that currently fall just above the old thresholds and could save on accounting costs by dropping to a lighter review requirement. It doesn''t change anything for the state''s largest charities, which still need a full audit above $1 million. 3. If it passes, these updated thresholds apply to donations received starting the first calendar year after the law takes effect, 120 days after enactment, giving many nonprofits real relief from audit costs that these dollar figures haven''t reflected since 2017. 4. If it doesn''t pass, Pennsylvania''s charitable-audit thresholds stay at their 2017 levels, meaning a growing number of smaller nonprofits keep facing full audit or review requirements as inflation pushes their revenue past outdated dollar lines. No significant opposition has been identified - the bill passed the Senate unanimously, 50-0.',
  '(1) Raises the annual-contribution threshold requiring a full independent audit for a registered charitable organization from $750,000 to $1,000,000. (2) Raises the threshold requiring a review or audit from the $250,000-$750,000 range to the $500,000-$1,000,000 range. (3) Raises the threshold requiring at least a compilation, review, or audit from the $100,000-$250,000 range to the $150,000-$500,000 range. (4) Leaves compilation/review/audit optional for organizations receiving less than $150,000 annually (up from $100,000). (5) Applies to contributions received in calendar years beginning after the effective date. (6) Takes effect 120 days after becoming law.',
  'Government Operations',
  'This bill raises the donation-amount thresholds that trigger mandatory financial audits for Pennsylvania charities, unchanged since 2017.',
  '2026-02-13',
  'pending_review',
  'Lynda Schlegel Culver',
  '474bb689-6767-4a56-8429-c09c20bc715c',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB133: This bill creates a legal process letting Pennsylvania children in foster care, or their f
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB133',
  'In proceedings prior to petition to adopt, further providing for relinquishment to adult intending to adopt child, for alternative procedure for relinquishment and for petition for involuntary termination; and providing for reinstatement of parental rights.',
  '1. This bill creates a new legal process in Pennsylvania to reinstate parental rights that were previously terminated by a court, for children who are still in foster care and haven''t been adopted. It lets the child-welfare agency, the former parent, or the child themselves (if 14 or older) petition a court to restore the parent''s legal rights, if the child hasn''t found a permanent adoptive family. 2. This affects children in foster care whose parents'' rights were terminated but who were never adopted, who could gain a path back to a legal parent instead of aging out of foster care with no legal family, and their former parents, who get a chance to have rights restored if circumstances have genuinely changed. It''s not available in the most severe cases: rights terminated over certain serious crimes against the child stay terminated permanently. 3. If it passes, a reinstatement petition can only move forward once specific conditions are met, including a waiting period and the child still lacking a permanent adoptive home. 4. If it doesn''t pass, Pennsylvania children whose parental rights were terminated but who were never adopted would have no legal path to regain a parent, even if circumstances genuinely changed. The bill passed the House 191-11 as part of a broader child-welfare reform package alongside a companion bill, HB138.

[[READ MORE]]
To qualify, the original termination must have come from an agency''s petition (not a private one), the termination order must be final, and at least 15 months must have passed since that order, or the child must be at least 17. In addition, at least one of several conditions must apply: the child remains in agency custody unadopted with no pending adoption petition, an adoptive placement has broken down and reunification with the adoptive parent isn''t imminent, or a related adoption-petition circumstance applies. The bill also sets venue rules (the child''s county of residence, the placing agency''s county, or with court permission the child''s former county) and requires a hearing before any reinstatement order can be granted.',
  '(1) Creates a new Chapter 30 in Pennsylvania''s domestic relations law establishing a formal reinstatement-of-parental-rights process. (2) Allows the child-welfare agency, the child (if at least 14) or their attorney, or the former parent (or their attorney) to file a petition to reinstate parental rights previously terminated by an agency petition. (3) Bars reinstatement if the prior termination was for certain serious grounds involving the child''s safety, such as specified violent or sexual crimes against the child. (4) Requires the termination order to be final and at least 15 months to have passed since it was entered (or the child to be at least 17), plus at least one of several conditions: the child remains in agency custody unadopted with no pending adoption petition, an adoptive placement has broken down and reunification isn''t imminent, or a related adoption petition circumstance applies. (5) Sets venue rules (the child''s county of residence, the placing agency''s county, or with court permission the child''s former county) and requires a hearing before any reinstatement order. (6) Also allows a petition confirming a parent''s consent to reinstatement, and revises the existing voluntary-relinquishment and involuntary-termination petition processes to cross-reference the new reinstatement framework.',
  'Other',
  'This bill creates a legal process letting Pennsylvania children in foster care, or their former parents, petition to reinstate parental rights that were previously terminated but never led to adoption.',
  '2025-09-17',
  'pending_review',
  'Rick Krajewski',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2224: This bill eliminates Pennsylvania's 6% tax on electric bills (saving ratepayers an estimat
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2224',
  'In rates and distribution systems, providing for return on equity; in service and facilities, further providing for billing procedures; and, in restructuring of electric utility industry, further providing for revenue-neutral reconciliation.',
  '1. This bill makes two major changes to Pennsylvania electric utility regulation. First, it permanently eliminates the state''s 6% Gross Receipts Tax currently added to electric bills and requires utilities to pass 100% of that savings to customers, projected to cut a typical bill by about 6.5% and save ratepayers an estimated $1.69 billion a year statewide. Second, it caps the default profit rate ("return on equity") utilities can earn for setting rates, using a market-based formula tied to the 10-year U.S. Treasury yield plus 2%, reset every year, replacing today''s case-by-case process for arguing a higher rate. 2. This affects every customer of Pennsylvania''s investor-owned electric, gas, and water/wastewater utilities, who should see lower bills from the tax elimination and, over time, a lower profit margin built into rates. It also affects the utility companies and their shareholders, who face this formula-based cap unless they can justify a higher return through a new market auction process. A utility that doesn''t pass the full tax savings to customers faces a real civil penalty. 3. If it passes, the tax elimination takes effect July 1, 2026 or immediately, whichever is later, and the new return-on-equity rules apply as utilities'' rates come up for reset, with changes reflected in customer bills within 90 days. 4. If it doesn''t pass, Pennsylvania keeps the 6% tax on electric bills and the current profit-rate-setting process, without this bill''s formula-based cap or mandatory pass-through. No significant opposition has been identified - the bill passed the House unanimously, 202-0, combining a Democratic return-on-equity proposal with a Republican-offered tax-elimination amendment.

[[READ MORE]]
A utility that fails to pass through the full benefit of the tax elimination faces a civil penalty of $1,000 to $5,000 per violation, plus any additional relief a court orders. On the return-on-equity side, a utility that believes the Treasury-plus-2% default return is too low bears the burden of proving that in a new "competitive equity auction" process rather than a traditional rate case, and any resulting rate change must reach customer bills within 90 days. The bill also updates the state''s existing consumer-billing-procedure statute (covering itemized bills, minimum payment windows, and fuel-adjustment-charge calculations) alongside these changes, though the specific substantive change to that section beyond technical renumbering could not be independently confirmed from the extracted bill text and is noted here for completeness rather than asserted with confidence.',
  '(1) Sets a new default "return on equity" (the profit rate regulators allow a utility to earn) for investor-owned electric, gas, and water/wastewater utilities, equal to the 10-year U.S. Treasury yield plus 2%, reset annually each January 1. (2) Places the burden of proof on the utility to show this default return is insufficient, rebuttable only through a new "competitive equity auction" - a commission-run, market-based process for setting a different return - rather than a traditional rate case. (3) Requires the Public Utility Commission to reflect any authorized-return change in customer rates within 90 days, and allows utilities to recover the cost of third-party risk insurance and use capped performance-based rate adjustments. (4) Eliminates Pennsylvania''s Gross Receipts Tax and a related state tax surcharge on electric utility bills (setting both rates to zero mills), effective July 1, 2026 or immediately, whichever is later. (5) Requires the entire value of that tax elimination to be passed through to consumers as a visible bill reduction, backed by a $1,000-$5,000 civil penalty per violation for a utility that doesn''t comply. (6) Guarantees a minimum annual transfer of funds to the state''s Alternative Fuels Incentive Act program at no less than the 2025-2026 fiscal year level. (7) Also amends the state''s existing consumer billing-procedures statute (itemization, payment windows, fuel-adjustment-charge calculation). (8) Effective dates are staggered: the tax elimination and related sections take effect July 1, 2026 or immediately if later; the billing-procedures amendment takes effect in 60 days; the remainder takes effect immediately.',
  'Infrastructure',
  'This bill eliminates Pennsylvania''s 6% tax on electric bills (saving ratepayers an estimated $1.69 billion a year) and caps utility profit margins using a market-based formula.',
  '2026-05-20',
  'pending_review',
  'Elizabeth Fiedler',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB138: This bill protects incarcerated Pennsylvania parents from having their parental rights ter
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB138',
  'In proceedings prior to petition to adopt, further providing for grounds for involuntary termination; and, in juvenile matters, further providing for disposition of dependent child.',
  '1. This bill strengthens legal protections for incarcerated parents in Pennsylvania''s child welfare system. It confirms incarceration alone cannot be used to terminate a parent''s rights, except in the most serious cases involving specific violent or sexual crimes against the child. It also lets a county agency treat a parent''s incarceration over 15 months as a valid reason to hold off filing for termination, as long as the parent genuinely tries to stay involved in the child''s case, and termination isn''t otherwise necessary for the child''s safety. 2. This affects incarcerated parents, who gain stronger protection against losing their rights based on incarceration alone; their children in foster care, who may see reunification considered instead of immediate termination; and county agencies, which gain explicit legal grounds to delay termination in these cases. 3. If it passes, agencies statewide must weigh a parent''s genuine efforts during incarceration, not just the incarceration itself, before moving to terminate parental rights. 4. If it doesn''t pass, courts and agencies would keep the current, less protective standard, where incarceration could count more heavily against a parent even when it wasn''t for an offense against the child. The bill passed the House 200-2, alongside its companion bill HB133.',
  '(1) Amends Pennsylvania''s grounds-for-termination law to confirm that a parent''s rights cannot be terminated based solely on incarceration, unless the termination is sought under specific serious grounds involving crimes against the child. (2) Amends the juvenile-court permanency-hearing process so that a county agency''s documented "compelling reason" not to file for termination may include a parent''s incarceration exceeding 15 months, unless that incarceration was for one of those same serious offenses against the child, as long as the parent makes feasible efforts to comply with the family service plan and stay involved in the child''s life, and termination isn''t otherwise necessary for the child''s welfare. (3) Takes effect 60 days after becoming law.',
  'Other',
  'This bill protects incarcerated Pennsylvania parents from having their parental rights terminated based on incarceration alone, if they stay engaged with their child''s case.',
  '2025-09-04',
  'pending_review',
  'Rick Krajewski',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2632: This bill replaces Pennsylvania's EITC and Opportunity Scholarship school tax-credit progr
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2632',
  'In educational tax credits, further providing for limitations and providing for termination of authority; providing for education options tax credits; establishing the Accountability for Diverted Tax Dollars Restricted Account; providing for scholarship granting organizations, for application by eligible contributors, for scholarships, for educational improvement programs, for low-achieving schools, for school participation in program and for original jurisdiction; and imposing duties on the Department of Community and Economic Development, the Department of Education, the Department of Revenue, the Auditor General, the Independent Fiscal Office and the State Treasurer.',
  '1. This bill replaces Pennsylvania''s two existing school-scholarship tax-credit programs (the scholarship portion of EITC and the Opportunity Scholarship Tax Credit) with a new program called "Education Options Tax Credits," starting with the 2027-2028 fiscal year - this year''s and next year''s programs are unchanged. Businesses that donate to scholarship organizations still get a state tax credit, but the new program adds real accountability requirements: regular Auditor General audits of scholarship organizations and participating schools, and new reporting on which students receive scholarships and how their schools perform. It also expands eligible uses to cover early childhood and childcare programs, not just K-12. 2. This affects the roughly 100,000 Pennsylvania students currently using these scholarships, the businesses that donate for the credit, the scholarship organizations and private schools receiving the money, and state agencies newly tasked with auditing the program. 3. If it passes, current programs keep running unchanged through the 2026-2027 fiscal year, then the new program with its audit and reporting requirements takes over in 2027-2028. 4. If it doesn''t pass, Pennsylvania''s existing programs continue with no mandatory state audits of scholarship organizations and no public data on which students benefit or how well their schools perform. This is genuinely contested, not a consensus bill: it passed the House narrowly, 105-97. One advocacy group calls it a needed transparency measure; another says it would cut overall scholarship funding by about $102 million and lower the donor tax credit from 90% to 75%, potentially affecting an estimated 30,000 students who currently receive scholarships.

[[READ MORE]]
Supporters, including the bill''s sponsor, argue current programs have no public data on who receives scholarships, how well their schools educate them, or how many students a private school turns away, and that regular Auditor General audits and disclosure of large donors funneling money through pass-through entities would close that gap. Opponents counter that the bill would impose a new 2% tax on scholarship organizations, add new reporting requirements on private schools, and tie future student income-eligibility limits to legislative action on the minimum wage, which they argue adds red tape and reduces the number of students the program can serve. Both figures - $102 million in funding cuts and the accountability provisions - come from the two sides'' own characterizations rather than a neutral fiscal analysis.',
  '(1) Freezes the current EITC scholarship/educational-improvement program and Opportunity Scholarship Tax Credit program in their present form through the 2026-2027 fiscal year, with no new tax credits approved under the current program for 2027-2028 or later. (2) Creates a new "Education Options Tax Credits" program (Article XX-B.1) taking over starting the 2027-2028 fiscal year, covering scholarship-granting organizations, eligible business contributors, and eligible K-12 and early-childhood/childcare students. (3) Establishes the Accountability for Diverted Tax Dollars Restricted Account and requires regular Auditor General audits of participating scholarship organizations and schools. (4) Requires new reporting on scholarship recipients, participating-school performance and admission/rejection rates, and public disclosure of large donors contributing through pass-through entities. (5) Redirects program targeting toward students in low-income areas and underperforming schools. (6) Imposes new duties on the Department of Community and Economic Development, Department of Education, Department of Revenue, Auditor General, Independent Fiscal Office, and State Treasurer to administer and oversee the new program. (7) Takes effect immediately, though the new program itself does not apply until the 2027-2028 fiscal year.',
  'Education',
  'This bill replaces Pennsylvania''s EITC and Opportunity Scholarship school tax-credit programs starting in 2027-2028 with a new program that adds audits and public reporting requirements.',
  '2026-06-12',
  'pending_review',
  'Nikki Rivera',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;

-- HB2649: This bill requires Pennsylvania health insurers to cover egg, sperm, and ovarian tissue fr
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2649',
  'In casualty insurance, providing for coverage for certain fertility preservation services.',
  '1. This bill requires Pennsylvania health insurance plans to cover fertility preservation services - egg, sperm, and ovarian tissue retrieval and freezing - for a patient whose medically necessary treatment, most commonly cancer treatment like chemotherapy, radiation, or surgery, may cause infertility as a side effect. Coverage must include at least three years of storage at an in-network facility, and an insurer may set a lifetime benefit cap, but not lower than $100,000 per person. 2. This affects patients facing cancer or other treatments that risk their fertility, who would no longer have to pay out of pocket, often thousands of dollars, to preserve their ability to have children before treatment starts, and health insurers, who must add this coverage to individual and group health plans. 3. If it passes, the requirement applies to health plans with a rate or form filed 180 days after the law takes effect, giving patients facing fertility-threatening treatment a guaranteed insurance benefit going forward. 4. If it doesn''t pass, Pennsylvania patients would keep facing coverage gaps for fertility preservation, often paying significant out-of-pocket costs before starting cancer treatment or other fertility-threatening care. No significant opposition has been identified - the bill has moved through committee and a floor amendment vote unanimously, 202-0.

[[READ MORE]]
The mandate does not apply to limited-benefit policy types, such as dental-only, vision-only, or workers'' compensation coverage. A religious employer may request an exemption if the coverage conflicts with its bona fide religious beliefs, but must give affected employees written notice if it opts out, and those employees can still buy their own supplemental fertility-preservation coverage at their own expense. An insurer may also limit the coverage period to three years after the triggering treatment or until the person loses coverage under the policy, whichever comes first.',
  '(1) Requires an insurer offering, issuing, or renewing a health insurance policy in Pennsylvania to cover fertility preservation services (egg retrieval, sperm retrieval, ovarian tissue retrieval, and cryopreservation) for a covered person facing iatrogenic infertility - fertility loss caused directly or indirectly by a medically necessary treatment, most commonly for cancer. (2) Requires coverage to include at least three years of in-network storage, extending the in-network requirement if no in-network facility is available. (3) Allows an insurer to set a lifetime maximum benefit no lower than $100,000 per covered person and to limit the coverage period to three years after treatment or until the person loses coverage under the policy, whichever comes first. (4) Allows a religious employer to request an exemption if the coverage conflicts with its bona fide religious beliefs, provided it gives written notice to affected employees, who may still buy supplemental coverage on their own. (5) Excludes limited-benefit policy types (dental-only, vision-only, workers'' compensation, and similar) from the requirement. (6) Applies to policies with a rate or form first filed, issued, or renewed 180 days after the effective date; takes effect immediately.',
  'Health',
  'This bill requires Pennsylvania health insurers to cover egg, sperm, and ovarian tissue freezing for patients whose cancer treatment or other medical care may cause infertility.',
  '2026-06-22',
  'pending_review',
  'Bridget Kosierowski',
  '3b6dee71-7cbd-41f1-95d0-3f997cf035be',
  NULL,
  NULL,
  NULL
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor,
  introduced_date = EXCLUDED.introduced_date;
