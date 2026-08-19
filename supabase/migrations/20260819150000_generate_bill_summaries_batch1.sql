/*
  # Generate real bill summaries: first production batch (25 PA bills)

  1. Purpose
    - First production run of `.claude/skills/generate-bill-summary/SKILL.md`
      after a scope-check (`/Users/ianparnell/firstmate/data/uvote-bill-
      summary-scope-check/report.md`, firstmate home) found 3,951 of 3,993
      bills (every PA House/Senate bill) still showing LegiScan's raw
      one-line `description` instead of a real four-part `summary`.
    - Scope: PA House/Senate bills that are `status = 'active'`,
      `reported_from_committee_at IS NOT NULL` (the votable-today set),
      and whose current `summary` fails the real format gate
      (`parseSummaryIntoSections` in `src/lib/billUtils.ts`), sorted by
      `introduced_date DESC` and taking the top 25. That eligible pool
      was 570 bills (432 House / 138 Senate) at query time; this batch's
      top-25-by-recency split came out 16 House / 9 Senate.
    - `bills.superseded_at` does not exist on the live database yet (the
      scope-check's Finding 0, still unresolved as of this migration) —
      no `superseded_at`-based exclusion was applied to the scoping
      query. All 25 `superseded_at`/`superseded_by`/`superseded_reason`
      values below are NULL; none of these 25 bills was found superseded
      during Step 6.5 research (every bill is progressing normally
      through its own chamber-to-chamber path). One real, sourced
      cross-bill relationship was flagged for citizen context even
      though it does not meet the skill's supersession bar: HB2359
      (transparency conditions on the existing data-center tax
      incentive) and HB2198 (full repeal of that same incentive) both
      address the same underlying tax program from competing directions;
      neither is enacted, so neither supersedes the other under the
      skill's working definition, but each bill's `summary` notes the
      other's existence for an informed vote.
    - Legislative body ids used below (from a live query against this
      project's Supabase instance):
        Pennsylvania Senate: 474bb689-6767-4a56-8429-c09c20bc715c
        Pennsylvania House:  3b6dee71-7cbd-41f1-95d0-3f997cf035be

  2. Changes
    - Data-only: 25 `INSERT ... ON CONFLICT (legislative_body_id,
      bill_number) DO UPDATE` upserts populating `summary`, `bill_text`,
      `topic`, `short_description`, `introduced_date`, `status`, and
      `primary_sponsor` for 16 PA House and 9 PA Senate bills, following
      the skill's own SQL template exactly.
    - Every bill's `status` is set to `'pending_review'`, never
      `active`/`passed` directly, per the skill's hard contract (a
      human must review the generated content before a bill becomes
      votable with it). If any of these 25 `bill_id`s already exist
      with `status = 'active'` (populated by `legiscan-sync`), running
      this migration will downgrade that live status to
      `pending_review` — correct per the skill's contract, but the
      human reviewer must restore each bill's true status (and
      re-confirm `reported_from_committee_at`-gated votability) after
      approving the content, not leave it at `pending_review`
      indefinitely.
    - No `category` value is written anywhere in this migration, per
      the skill's hard contract (that field is dead in the live
      product and being formally dropped in a separate migration).
    - `introduced_date` and the (currently all-NULL)
      `superseded_at`/`superseded_by`/`superseded_reason` columns are
      deliberately excluded from every `DO UPDATE SET` clause below,
      matching the skill's template exactly — see that template's own
      comments for why (a prior run's real value should never be
      silently clobbered by a NULL or a re-derived date on re-run).

  3. Preconditions before running this migration by hand
    - `ON CONFLICT (legislative_body_id, bill_number)` requires the
      `UNIQUE (legislative_body_id, bill_number)` constraint added by
      `20260810090000_fix_bills_bill_number_constraint_scope.sql`. That
      migration file exists in this repo, but per this project's
      documented convention, a merged migration file is NOT the same as
      an applied one — confirm it has actually been run against the
      live database before running this one. If it hasn't, Postgres
      will reject every statement below with "no unique or exclusion
      constraint matching the ON CONFLICT specification," which is the
      signal to apply that migration first.
    - `short_description` requires
      `20260815130000_add_bills_short_description.sql` to be applied
      (nullable, so this is a safe-if-missing ordering mistake, not a
      destructive one).
    - `superseded_at`/`superseded_by`/`superseded_reason` require
      `20260817090000_add_bills_superseded_and_vote_gate.sql`. All three
      values below are NULL, so this migration itself does not depend
      on that column existing yet at write time in the narrow sense
      that every value is NULL - but the INSERT's column list still
      names all three columns explicitly, so this migration DOES
      require those columns to already exist. Per the scope-check
      (Finding 0), that schema migration had not been applied to the
      live database as of this batch's research; confirm it has been
      applied before running this migration, or remove the three
      `superseded_*` columns/values from every statement below.

  4. IMPORTANT — merging this PR to `main` does NOT apply this
     migration to the live database. Per this project's own documented
     convention (no CI step or linked `supabase` CLI project), every
     migration in this repo, including this one, is applied by hand via
     the Supabase Dashboard SQL editor. A human must run this file
     directly against the live database after reviewing its content;
     merging alone changes nothing live.
*/

-- HB1239: Solar rights for condo/HOA-owned detached roofs
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB1239',
  'In general provisions relating to condominiums, further providing for definitions; in management of the condominium, further providing for powers of unit owners'' association; in general provisions relating to planned communities, further providing for definitions; and, in management of planned communities, further providing for power of unit owners'' association.',
  '1. This bill stops condo and homeowners'' association (HOA) boards from banning solar panels on a roof that belongs to just one owner, not a roof the association maintains or counts as shared property. Associations can still require that panels meet safety and electrical codes, be certified, be painted to blend in, and that the owner cover any damage the installation causes. The rule doesn''t cover freestanding panels set up on land the association itself owns. 2. This affects households living in Pennsylvania''s condos and HOA-governed planned communities. It benefits owners who want solar panels but have been blocked by association rules; boards keep oversight of safety and appearance but lose the power to ban panels outright. 3. If the Senate passes it and the Governor signs it, associations statewide would have 60 days to update their rules and could no longer prohibit solar panels on an owner''s own roof. 4. No organized opposition has been identified in available coverage. The House vote was close, 109-93, suggesting some lawmakers had concerns about limiting HOA boards'' authority over a community''s appearance and maintenance, though no group has made that case publicly.',
  'This bill adds a "detached roof" definition to Pennsylvania''s condominium and planned-community law: a roof owned solely by one unit owner and not maintained by the association or counted as shared property. It then bars associations from prohibiting solar energy systems on that kind of roof, while still letting them require: (a) compliance with state and local safety permits; (b) national certification for solar water heaters; (c) compliance with electrical safety codes for solar-electricity systems; (d) paint or color matching for panels, brackets, and visible wiring; (e) an owner indemnification agreement covering installation damage; and (f) other reasonable rules to preserve a community''s appearance. The restriction does not apply to freestanding solar installations on land the association itself owns. The same changes are made in parallel to both the condominium law and the planned-community law in Title 68. The act takes effect 60 days after becoming law.',
  'Housing',
  'Bars condo and HOA boards from banning solar panels on an owner''s own roof, while still letting them set reasonable safety and appearance rules.',
  '2025-04-21',
  'pending_review',
  'Liz Hanbidge',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1182: Dealer-franchise and consumer/dealer data protection overhaul (Board of Vehicles Act)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1182',
  'Further providing for title of act; in preliminary provisions, further providing for definitions; and, in vehicles, further providing for license to engage in business, for reimbursement for all parts and service required by the manufacturer or distributor and reimbursement audits, for unlawful acts by manufacturers or distributors and for manufacturer or distributor repurchase of inventory and equipment and providing for consumer data protection.',
  '1. This bill rewrites Pennsylvania''s law on car dealership franchises. It bars vehicle manufacturers from owning or controlling their own dealerships, with a narrow exception for up to five electric-vehicle-only stores, and requires manufacturers to pay dealers a fair "retail rate" for warranty repairs. It also adds new data protections: manufacturers and outside vendors can''t access a dealer''s data systems, sell or misuse customer data dealers collect, or charge a fee for that access, without the dealer''s written consent. 2. This affects Pennsylvania''s roughly 1,000 franchised new-vehicle dealers and their customers. It benefits dealers, who get stronger protection from manufacturer pressure and clearer control of customer data; manufacturers keep the data they need for recalls, warranty claims, and required legal notices. 3. If the House and Governor approve it, the new ownership limits, reimbursement rules, and data protections would take effect 60 days later, statewide. 4. No opposition specific to this bill was identified, and the Senate passed it 50-0; it''s backed by the Pennsylvania Automotive Association, representing the state''s franchised dealers. Nationally, automakers'' trade groups have pushed back on similar dealer-protection and data-access laws elsewhere, so opposition could still surface as this bill moves through the House.

[[READ MORE]]
The bill also changes how manufacturers can sell vehicle features remotely: if a manufacturer activates a paid feature, option, or upgrade over the air, it must offer that same feature to all its franchised dealers on equal terms, and must pay the dealer that originally sold the vehicle at least 12% of the revenue from a remote sale made within five years of the original sale. Manufacturers must reimburse dealers in full for loaner or rental vehicles provided during warranty service. The consumer-data provisions require manufacturers and data vendors to use industry-standard security protocols (STAR standards), let a dealer switch data vendors and get its data transferred securely, and let a dealer revoke consent to share its data with 30 to 60 days'' notice. A manufacturer that causes a data breach involving dealer-collected customer data must indemnify the dealer for resulting claims or damages. Manufacturers and distributors keep an unrestricted right to data required by law, such as for safety recalls or verifying a sale.',
  'This bill amends the Board of Vehicles Act. It generally prohibits a manufacturer, distributor, or their affiliates from owning an interest in or operating/controlling a licensed vehicle dealership, with a narrow, time-limited exception letting a manufacturer own up to five dealerships that sell only electric vehicles, subject to conditions including that the manufacturer has offered EVs for at least 12 months and does not also hold an ownership interest in another manufacturer that sells through independent franchised dealers. It sets a formula for calculating a dealer''s "retail rate" for warranty parts and labor reimbursement, based on the dealer''s actual non-warranty customer charges over a 90-180 day sample period, with a dispute/hearing process if a manufacturer disputes the declared rate. It bars manufacturers from forcing dealers to buy from a designated vendor without a comparable alternative option, and requires manufacturers to reimburse dealers in full for loaner/rental vehicles during warranty service. It adds a new "Consumer data protection" section: manufacturers and third parties cannot access a dealer''s data system, or access, share, sell, or use "protected dealer data" beyond what''s legally required, without the dealer''s prior written consent, which the dealer can revoke with 30-60 days'' notice; they cannot engage in "cyber ransom" or block a dealer from using its own data; dealer data vendors must support open, standardized data-sharing (STAR standards) so dealers can switch vendors and transfer their data securely. The act takes effect 60 days after passage.',
  'Economic Development',
  'Limits manufacturer control over car dealerships and gives dealers new legal protection over the customer data they collect.',
  '2026-02-13',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2146: Sunshine Act meeting-notice tightening after Supreme Court ruling
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2146',
  'In open meetings, further providing for notification of agency business required and exceptions.',
  '1. This bill tightens Pennsylvania''s open-meetings "Sunshine Act" notice rules after a State Supreme Court ruling let agencies add last-minute agenda items by majority vote alone. It limits unlisted business to three situations: genuine 24-hour emergencies, truly minor no-spending matters, and a new list of narrow "minor administrative approvals" that require a public legal opinion first. A majority vote can still add an item, but only if it fits one of those categories. 2. This affects anyone who attends or follows local government, school board, or state agency meetings in Pennsylvania. It benefits the public''s ability to know in advance what a body will vote on, while still letting officials act quickly on genuinely minor or time-sensitive matters. 3. If the Senate and Governor approve it, agencies statewide would lose the broad "add anything by majority vote" option the Court opened up, limited instead to the bill''s specific categories, each requiring public disclosure. 4. The bill passed the House 193-9, but only after the sponsor added the "minor administrative approvals" exception as a compromise, since township supervisors'' groups warned a stricter version would slow routine local government business. Transparency advocates could still argue the new list creates carve-outs agencies might stretch.

[[READ MORE]]
The ruling that prompted this bill came after a Lehigh County school board approved a labor contract with no advance public notice, then relied on the Sunshine Act''s "or" language, which the Court read 4-3 as allowing majority-vote agenda additions independent of any other exception. The bill''s new "minor administrative approvals" category covers seven narrow situations: personnel actions after a closed personnel session; time-sensitive legal filings; small purchases under the state''s advertised bidding threshold to repair property damage or to buy property at auction with a deadline; grant applications facing an imminent deadline; small borrowing paperwork already approved in an open meeting; and minor sewer-module permit approvals. Before acting under this category, the agency''s own lawyer must give a public opinion, at the meeting or in writing, on whether the situation actually qualifies.',
  'This bill amends Section 712.1 of the Sunshine Act (Title 65). It keeps the existing rule that an agency generally cannot act on a matter not listed on its public meeting notice, and keeps the existing 24-hour emergency exception (a matter arising within 24 hours of the meeting that involves no spending or contracts) unchanged. It adds a new subsection, "Minor Administrative Approvals," listing seven specific situations where an agency may act on an unlisted, hardship-causing item: (1) personnel actions following a closed personnel session; (2) time-sensitive legal filings authorized after a closed litigation session; (3) small property-damage-repair purchases under the state''s advertised bidding threshold; (4) small auction purchases facing an imminent deadline; (5) grant applications facing an imminent deadline; (6) small borrowing or tax-anticipation-note paperwork already approved in an open meeting; and (7) minor sewer-module permit approvals. Before acting under this new category, the agency must obtain and publicly disclose a written or in-meeting legal opinion from its solicitor confirming the item qualifies. It also revises the "changes to agenda" provision so a majority vote can only add an item that already fits one of the bill''s specific exception categories, removing the broader reading a 2026 State Supreme Court ruling had allowed. The act takes effect 60 days after passage.',
  'Government Operations',
  'Narrows when local governments and state agencies can skip the 24-hour public meeting notice requirement, closing a loophole a court ruling had opened.',
  '2026-01-22',
  'pending_review',
  'Robert Freeman',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2558: Ban on broadcast-industry non-compete clauses
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2558',
  'Prohibiting enforcement of covenants not to compete in broadcast employment agreements.',
  '1. This bill makes non-compete clauses illegal in Pennsylvania''s broadcast industry, covering TV, radio, and platforms like streaming and podcasts. It voids any contract clause stopping a broadcast employee from moving to another employer or working in the same area after they leave, whether they quit or are let go. Separate confidentiality or trade-secret agreements aren''t affected. It applies to contracts signed or renewed after the law takes effect. 2. This affects on-air talent and other broadcast employees at Pennsylvania TV and radio stations, plus newer platforms covered by the bill. It benefits workers, who could move to a competing station without a contract clause blocking them; it removes a tool stations use today to retain talent and limit competition for viewers and listeners. 3. If the Senate passes it and the Governor signs it, existing and future non-compete clauses in broadcast contracts would become void, 60 days after enactment for new and renewed contracts. 4. The House vote was close, initially failing 100-102 before passing 103-99 the next day, showing real, split opposition, though no specific opposing group was named in available coverage. The likely concern is that stations could lose on-air talent they''ve trained, since a competitor could hire that person away right after they leave.',
  'This bill, titled the "Broadcast Freemarket Agreement Act," defines a "broadcast employee" as anyone working under an agreement with a broadcast employer (TV, radio, cable, internet/satellite, or new media outlets that transmit news, weather, sports, or entertainment). It declares any "covenant not to compete" in a broadcast employment contract void and unenforceable to the extent it restricts an employee from moving to another employer or working in the same geographic area after leaving, whether the departure is voluntary or not. Any attempt to waive this protection is also void. The bill does not limit separate confidentiality or trade-secret provisions covering the length of time or geographic area information must stay confidential. It applies only to contracts entered into or renewed after the act takes effect, 60 days after passage. A companion Senate bill (SB142) covering the same subject was tabled by the Senate on the same day this bill had its first House floor vote.',
  'Economic Development',
  'Bans non-compete clauses that stop TV and radio broadcast employees from taking a new job or moving to a competitor after leaving.',
  '2026-06-01',
  'pending_review',
  'Benjamin Waxman',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1334: New state licensure for medical imaging professionals
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1334',
  'Further providing for definitions, for respiratory therapists, for perfusionist, for genetic counselor and for prosthetists, orthotists, pedorthists and orthotic fitters; providing for medical imaging professionals, radiation therapists, radiologist assistants and trainees; further providing for licenses and certificates and general qualification; repealing provisions relating to radiologic procedures and education and training required; and making a repeal.',
  '1. This bill creates Pennsylvania''s first state license for medical imaging workers: people who operate X-ray, MRI, CT, ultrasound, and nuclear medicine equipment, plus radiation therapists and radiologist assistants. Starting two years after the law takes effect, it becomes illegal to perform these procedures without a license, which requires being 18 or older, completing accredited training, and passing a national certification exam in that type of imaging. Current workers can get licensed through a grandfather process using their existing national certification. 2. This affects imaging technologists and radiation therapists working in Pennsylvania hospitals and imaging centers, and the patients who receive these procedures. It benefits patients, who gain assurance that whoever operates this equipment meets a verified education and competency standard; Pennsylvania is currently one of only four states without this kind of licensure. 3. If the House and Governor approve it, Pennsylvania would join 46 other states in licensing these roles, phased in over two years so current workers can be grandfathered in. 4. No opposition has been identified, and the Senate passed it 45-5. The sponsor specifically noted the bill adds no new exam or extra schooling beyond existing national certification, suggesting she anticipated concern about a new cost or paperwork burden, even though no group has raised that concern publicly.',
  'This bill amends the Medical Practice Act of 1985. It defines the medical imaging modalities covered (diagnostic medical sonography, limited x-ray operations, magnetic resonance imaging, nuclear medicine technology, and radiography) and creates three new license types: "medical imaging professional" (for the modalities above), "radiation therapist" (who delivers radiation treatments as prescribed by a physician), and "radiologist assistant" (who performs advanced diagnostic imaging procedures under a supervising radiologist''s written clinical protocols, but may not interpret images, diagnose, or prescribe). Each license requires the applicant to be at least 18, hold a high school diploma, complete accredited training in the relevant modality, and pass a national certification exam from a board-approved certifying organization. Beginning two years after the law takes effect, performing these procedures without a license becomes unlawful. Anyone already working in one of these roles can be licensed under a grandfather provision if, within that same two-year window, they hold current national certification. The bill also updates the "good moral character" licensing standard for several existing license types (respiratory therapists, perfusionists, genetic counselors, and prosthetists/orthotists) to require an individualized review of any criminal conviction rather than an automatic disqualification, and repeals older, narrower provisions on radiologic procedures and training that this new licensing structure replaces.',
  'Health',
  'Creates Pennsylvania''s first state license for X-ray, MRI, ultrasound, and radiation-therapy technologists, closing a gap 46 other states have already closed.',
  '2026-05-20',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2455: Collective bargaining rights for Pittsburgh Public Schools administrators
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2455',
  'In powers and duties of the Department of Public Instruction and its departmental administrative boards and commissions, further providing for collective bargaining.',
  '1. This bill gives Pittsburgh Public Schools administrators, including principals and vice principals, the legal right to unionize and bargain collectively over pay, hours, benefits, and working conditions, the same right Philadelphia''s school administrators have had since 1996. It sets a required bargaining timeline starting at least six months before the district''s fiscal year, and creates a binding arbitration process, with no court appeal, if the district and administrators can''t reach an agreement. 2. This affects Pittsburgh Public Schools'' principals, vice principals, and other administrators, plus the district and its taxpayers. It benefits administrators, who gain a formal channel to negotiate pay and working conditions as their jobs have grown to cover school safety, building maintenance, staffing, budgets, discipline, and student mental health; the district takes on a binding-arbitration process it must fund and follow if talks fail. 3. The bill takes effect immediately if the Senate passes it and the Governor signs it, giving Pittsburgh administrators the same bargaining structure Philadelphia''s administrators already use. 4. No organized opposition has been identified in available coverage. The House vote was somewhat close, 106-96, suggesting some lawmakers had reservations, likely about extending a binding, non-appealable arbitration process the district must fund to another major school district, though no group has made that argument publicly.',
  'This bill amends Section 1321 of the Administrative Code of 1929. That section already gives school administrators in "cities of the first class" (Philadelphia) the right to organize and bargain collectively through a designated representative chosen by at least 50% of administrators, over compensation, hours, working conditions, retirement, and other benefits, with the Pennsylvania Labor Relations Board resolving disputes the same way it does under the state''s general public-sector bargaining law. This bill extends that identical right to "school districts of the first class A," which under Pennsylvania''s district-classification system means Pittsburgh Public Schools. It also codifies procedural rules: bargaining must begin at least six months before the district''s fiscal year starts, and any request for binding arbitration must be made at least 110 days before the fiscal year starts. An arbitration panel''s decision is final, binding on both the district and the administrators, not appealable to any court, and constitutes a mandate the superintendent must carry out administratively. Each side pays for its own arbitrator; the district covers the cost of the panel''s third, neutral arbitrator and related expenses. These rights apply even if the city or district has adopted a home rule charter. The act takes effect immediately upon passage.',
  'Education',
  'Gives Pittsburgh Public Schools principals and administrators the same right to unionize and bargain collectively that Philadelphia''s school administrators have had since 1996.',
  '2026-04-24',
  'pending_review',
  'Jen Mazzocco',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2499: SWIF equity investment authority (up to 20%)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2499',
  'In State Workers'' Insurance Fund, further providing for investments by board.',
  '1. This bill lets the board that runs Pennsylvania''s State Workers'' Insurance Fund, a state-owned workers'' compensation insurer, invest up to 20% of the fund''s surplus and reserve money in stocks. Today the fund can only invest in the conservative options savings banks use, mainly bonds. Stock investments must follow the "prudent investor rule," a legal standard requiring careful, diversified decisions, and securities stay held and tracked by the State Treasurer. 2. This affects the State Workers'' Insurance Fund, which insures workers'' compensation claims for employers private insurers often won''t cover, and indirectly the injured workers whose claims it pays. It benefits the fund''s long-term finances if stocks perform well, but exposes part of its reserves to market risk it doesn''t carry today. 3. If the Senate and Governor approve it, the fund''s board could begin investing up to a fifth of its assets in stocks 60 days after enactment. 4. No organized opposition has been identified. The House vote, 173-29, was lopsided but not unanimous, suggesting some lawmakers were wary of exposing a fund that pays injured workers to stock-market risk, even with the 20% cap and prudent-investor safeguard, though no group has made that case publicly.',
  'This bill amends Section 1512 of the Workers'' Compensation Act, which governs how the State Workers'' Insurance Fund (SWIF) board may invest the fund''s surplus and reserve money. Currently the board may only invest in securities permitted for savings banks. This bill adds authority to invest up to 20% of the fund''s assets in equity investments (stocks), overriding several other statutes that would otherwise restrict this. Equity investments must comply with Pennsylvania''s "prudent investor rule" (20 Pa.C.S. § 7203), a fiduciary standard requiring diversification and reasonable care in investment decisions. As with the fund''s existing investments, all securities purchased are held in custody by the State Treasurer, who collects principal and interest payments and pays them into the fund; purchases and sales require a certified board resolution. The act takes effect 60 days after passage.',
  'Budget',
  'Lets Pennsylvania''s state-run workers'' compensation insurance fund invest up to 20% of its reserves in stocks, instead of bonds only.',
  '2026-05-08',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1372: Carbon monoxide alarms mandatory in PA child care facilities
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1372',
  'In general powers and duties of the Department of Human Services, providing for annual report of children facilities and payments; in children and youth, providing for carbon monoxide alarm standards in child care facilities; and, in departmental powers and duties as to licensing, further providing for right to enter and inspect.',
  '1. This bill requires child care centers, family and group child care homes, and children''s residential facilities in Pennsylvania to install a working carbon monoxide alarm within 18 months if the building uses a fossil-fuel heater, fireplace, or has an attached garage. The state can refuse to issue or renew a facility''s license if it doesn''t comply. 2. This affects every licensed child care facility in Pennsylvania that burns fossil fuel for heat or has an attached garage, and the children and staff inside them. It benefits children and staff by requiring an early-warning system for a gas that''s invisible and odorless; facilities without alarms already installed bear the installation cost and could lose their license if they don''t comply. 3. If the House passes it and the Governor signs it, the alarm requirement takes effect 90 days after enactment, with facilities given 18 months after that to install alarms. 4. No opposition has been identified, and the Senate passed it 50-0. The bill follows a 2022 incident at a Happy Smiles Learning Center in Allentown, where carbon monoxide in the building sickened 27 children and 8 staff members, all taken to hospitals for monitoring.

[[READ MORE]]
The same bill also requires the Department of Human Services to publish a public annual report on inspections, violations, enforcement actions, and subsidized child care payments at licensed child care and residential facilities, due each January 1st. It clarifies that existing fire-alarm testing at child care centers and family child care homes must happen once a month, with documentation kept alongside fire-drill logs. These reporting and fire-alarm-testing provisions take effect 60 days after enactment, separate from the 90-day carbon monoxide alarm timeline.',
  'This bill amends the Human Services Code in three parts. First, it requires the Department of Human Services to publish, by January 1 of each year, a public report covering the prior fiscal year''s inspections, violations, enforcement actions (including operating without a license), complaints, and subsidized child care payment data for child care centers, group and family child care homes, and children''s residential/day treatment facilities, broken out statewide and by region, and sent to the relevant House and Senate committee chairs. Second, it adds a new carbon monoxide alarm requirement: any building housing a licensed child care facility that has a fossil-fuel-burning heater, appliance, fireplace, or attached garage must install an approved, operational carbon monoxide alarm near the fuel source and in every residential-style unit on the same floor, within 18 months of the requirement taking effect; the state may deny or refuse to renew a license for noncompliance, though a limited provisional-license option exists for one facility type. Third, it clarifies that child care centers'' and family child care homes'' existing fire detection systems must be manually tested once a month (replacing the prior "every thirty days" phrasing) with written records kept alongside fire-drill logs. The carbon monoxide provision takes effect 90 days after enactment; the rest of the act takes effect in 60 days.',
  'Public Safety',
  'Requires Pennsylvania child care facilities with fossil-fuel heat or an attached garage to install carbon monoxide alarms, after a 2022 Allentown daycare poisoning sickened 35 people.',
  '2026-06-08',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2359: Transparency/community-protection conditions on data center tax incentive
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2359',
  'Amending the act of March 4, 1971 (P.L.6, No.2), entitled "An act relating to tax reform and State taxation..." in computer data center equipment incentive program, further providing for definitions, for application for certification, for eligibility requirements relating to sales and use tax refund program, for notification, for eligibility requirements relating to sales and use tax exemption program and for notification and records.',
  '1. This bill adds public-transparency requirements to Pennsylvania''s tax break for large computer data centers. To keep qualifying for the sales-tax refund or exemption, an owner must complete a "community protection plan": notify the local municipality, hold a public meeting, and consult elected officials before construction, plus report the project''s size, water use, and energy use. Owners must also certify they haven''t signed a nondisclosure agreement with a government agency to hide project details from the public. 2. This affects companies building large data centers to claim the state''s tax incentive, and the municipalities and residents near those projects. It benefits nearby communities, who get guaranteed advance notice and a public meeting before construction, plus visibility into water and power use; it adds compliance steps for developers. 3. If the Senate and Governor approve it, a data center owner seeking the tax incentive would have to complete these steps within a year of certification or risk losing eligibility. 4. The House passed this 171-31, with every "no" vote from Republicans; no specific opposing group was identified. The bill follows an incident in the sponsor''s district where a data center developer asked a township to sign a nondisclosure agreement; the township declined. It''s one part of a larger House package of data-center oversight bills.

[[READ MORE]]
These transparency requirements only apply to larger data centers, those with at least 10 megawatts of peak electric demand; smaller projects are exempt. The required footprint report must include the facility''s total square footage, any on-site or off-site power generation added to reduce strain on the electric grid, estimated peak-hour energy use and its source, and estimated daily, monthly, and annual water consumption and discharge. A separate bill in this same batch, HB2198, would repeal the underlying tax incentive program this bill amends and replace it with a different data-center tax structure. Neither bill has been enacted as of this writing, so this is not a case of one bill superseding the other, but a citizen following both should know they address the same incentive program from different directions.',
  'This bill amends the Tax Reform Code''s "Computer Data Center Equipment Incentive Program," which gives qualifying data centers a sales and use tax refund or exemption on equipment purchases. It adds a new "community protection plan" requirement for owners/operators: within one year of certification, they must document that they notified the host municipality, held at least one accessible public meeting, and consulted the municipality''s chief elected official before construction, and must file a "project footprint report" covering the facility''s square footage, on-site/off-site power generation plans, peak-hour energy demand and its source, and daily/monthly/annual water consumption and discharge. Owners must also certify they have not entered a nondisclosure agreement with a government agency restricting public disclosure about the project. These requirements apply only to data centers with at least 10 megawatts of peak electric demand and do not apply retroactively to projects that began construction, or held certification, before the relevant provision''s effective date. The changes apply in parallel to both of the program''s two certification tracks (the sales/use tax refund track and the sales/use tax exemption track).',
  'Economic Development',
  'Requires large data centers to hold a public meeting, notify local officials, and disclose water/energy use before they can qualify for Pennsylvania''s data center tax break.',
  '2026-04-06',
  'pending_review',
  'Joseph Ciresi',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2529: Medetomidine scheduled as controlled substance (xylazine-like street drug)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2529',
  'Further providing for schedules of controlled substances and for secure storage of xylazine; and adding provisions relating to medetomidine.',
  '1. This bill makes medetomidine, a powerful veterinary sedative now showing up in the illegal drug supply, a Schedule III controlled substance in Pennsylvania, the same restricted category as xylazine, or "tranq." It stays legal for its real purpose: prescribing, giving, or making it for animals under normal veterinary and pharmacy rules. It also requires veterinarians to securely store medetomidine, the same storage rule already in place for xylazine since 2024. 2. This affects veterinarians and pharmacies, who must follow secure-storage rules for the drug, and everyone affected by Pennsylvania''s overdose crisis, since medetomidine is increasingly mixed into street fentanyl. It benefits public health and law enforcement by giving prosecutors the same legal tools already used against xylazine trafficking; legitimate veterinary use is preserved through specific exemptions. 3. If the Senate passes it and the Governor signs it, the law takes effect immediately, making unauthorized possession, sale, or distribution of medetomidine a controlled-substance crime and requiring vets to store it securely. 4. No opposition has been identified, and the House passed it 198-4. The bill follows Pennsylvania''s 2024 law scheduling xylazine, after state data found medetomidine, up to 200 times more potent than xylazine, now appears in roughly 80% of fentanyl samples tested in the state.',
  'This bill amends The Controlled Substance, Drug, Device and Cosmetic Act. It adds medetomidine to Schedule III, the same schedule as xylazine, defining it broadly to include any compound, mixture, or preparation containing it. It then carves out explicit exemptions preserving legitimate veterinary use: dispensing, prescribing, or administering an FDA-approved or federally authorized medetomidine animal drug; manufacturing or distributing medetomidine as an active pharmaceutical ingredient for an approved or investigational animal drug; pharmacy compounding by a licensed pharmacist or veterinarian; and any other federally approved or state-law-permissible use. Separately, it extends the state''s existing secure-storage requirement for xylazine (added in 2024 under Act 17) to also cover medetomidine, requiring veterinarians to follow the Pharmacy Act''s storage and protection standards for both substances. The act takes effect immediately upon passage.',
  'Public Safety',
  'Classifies medetomidine, a veterinary sedative now common in street fentanyl, as a controlled substance in Pennsylvania, mirroring the state''s 2024 xylazine law.',
  '2026-05-22',
  'pending_review',
  'Gregory Scott',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2460: Optional hunter-trapper education program for grades 6-12 schools
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2460',
  'In terms and courses of study, providing for hunting and trapping education; and imposing duties on the Pennsylvania Game Commission.',
  '1. This bill directs the Pennsylvania Game Commission, with the Department of Education, to create by July 2027 an optional hunter-trapper education program schools can offer to grades 6-12, including firearm safety instruction taught by a certified instructor. No firearms or ammunition would ever enter the school building; students would learn firearm handling, safety, hunting techniques, and wildlife conservation. Schools could offer it as an elective, and any parent can excuse their child without penalty. 2. This affects public, charter, and parochial schools that choose to offer the program, and the students who take it. It benefits participating students, who would automatically satisfy the state''s hunter-trapper education requirement for a hunting license; the Game Commission may reimburse schools for costs. 3. If the Senate and Governor approve it, the law takes effect immediately, and the Game Commission has until July 1, 2027 to build the program schools can then choose to adopt. 4. No organized opposition has been identified; the bill has been praised by the Game Commission and sportsmen''s groups. The House vote was 180-22, so a meaningful minority voted no, likely reflecting discomfort with firearm instruction in schools even under these safeguards, though no specific objection was reported.',
  'This bill adds Section 1529 to the Public School Code of 1949. It requires the Pennsylvania Game Commission, in consultation with the Department of Education, to develop by July 1, 2027 a model hunting and trapping education program, including firearm safety instruction, for students in grades 6-12. The firearm safety component must follow the Commission''s basic hunter-trapper education course standards, be taught only by a Commission-certified hunter education instructor, and cover firearm usage/handling, cleaning and maintenance, types of firearms, safe hunting practices, and the history of wildlife conservation; firearms and ammunition may never be brought into a school building for this instruction. A school entity may offer the firearm safety portion as an optional extracurricular class or folded into an existing recreation-focused course, and any parent or guardian can have their child excused without academic penalty. A student who completes the school program is deemed to have completed the Commission''s hunter-trapper education course required to obtain a PA hunting license. Costs a school incurs may be reimbursed by the Commission, and related staff training hours count toward existing continuing-education requirements. The act takes effect immediately upon passage.',
  'Education',
  'Lets Pennsylvania schools offer an optional hunter-trapper education elective for grades 6-12, including certified firearm safety instruction with no firearms allowed in the building.',
  '2026-04-27',
  'pending_review',
  'Anita Kulik',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1303: Braille Flag monument at the State Capitol (commemorative)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1303',
  'Providing for the placement of a monument of the Braille Flag at the State Capitol Building as a tribute to honor and remember those who have served in the line of duty and those left behind.',
  '1. This bill puts a bronze monument of the Braille Flag, honoring blind military veterans, in the East Wing of the State Capitol Building. The monument includes the Pledge of Allegiance written in braille. The state''s Department of General Services will coordinate with The Moose, the fraternal organization installing it, to pick the exact spot and handle the installation. 2. This affects visitors to the State Capitol and honors blind veterans and veterans who lost their eyesight in service. It benefits veterans and their families by giving the Braille Flag, already installed at Arlington National Cemetery since 2008, a permanent home at Pennsylvania''s Capitol; the bill specifically states it creates no other duties or costs for the state beyond coordinating the placement. 3. If the House passes it and the Governor signs it, the law takes effect immediately, and the state would begin working with The Moose to place the monument. 4. No opposition has been identified, and the Senate passed it unanimously, 50-0. This is a low-stakes commemorative bill with no identified counter-argument; it doesn''t affect any other program, funding, or policy.',
  'This bill directs that a bronze monument of the "Braille Flag," a memorial design created by Randolph Cabral in honor of his blind WWII-veteran father and first installed at Arlington National Cemetery in April 2008, be placed in the East Wing of the Pennsylvania State Capitol Building. The monument must include the Pledge of Allegiance written in braille. The bill directs the Department of General Services to coordinate with The Moose (a fraternal service organization with more than one million members) on site selection, preparation, and installation, and explicitly states it imposes no other duties on the department. The act takes effect immediately upon passage.',
  'Other',
  'Places a bronze Braille Flag monument honoring blind veterans in the State Capitol''s East Wing, coordinated with the Moose fraternal organization at no other cost to the state.',
  '2026-04-23',
  'pending_review',
  'Scott Martin',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2512: Ban on device-based "surveillance pricing" for rideshare fares
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2512',
  'In transportation network service, further providing for rates and forms of compensation.',
  '1. This bill bans Pennsylvania rideshare companies like Uber and Lyft from charging you a different fare based on your phone itself: your battery level, what apps you have installed, or your device''s hardware. It still allows the normal reasons prices change: real-time demand ("surge pricing") in your area, genuine cost differences by location, taxes and fees, and discounts or promotions that lower your price. 2. This affects everyone who books a ride through a rideshare app in Pennsylvania, and the companies that operate them. It benefits riders, who are protected from having their fare quietly raised based on signals like a low phone battery that suggest they''re more desperate or willing to pay; rideshare companies keep the ability to use legitimate demand-based and location-based pricing. 3. If the Senate passes it and the Governor signs it, the ban on device-based pricing takes effect 60 days after enactment, statewide. 4. No organized opposition has been identified in available coverage, and the House passed it 198-4 with bipartisan support. No group has publicly argued against the ban, though a rideshare company relying on device-signal pricing today would lose that specific pricing tool.',
  'This bill amends Section 2607 of Title 66 (Public Utilities), which governs transportation network company (rideshare) fares. It adds a "prohibition on surveillance prices" barring a rideshare company from basing any part of a fare on: a rider''s device hardware or hardware state (such as battery life, number of wireless connections, or data retained/erased on restart); whether particular software is present on the device; or the device''s geolocation data. Geolocation-based pricing remains allowed in specific, legitimate cases: real cost or demand differences between locations, real-time or historical demand-based surge pricing (as long as the price is disclosed immediately on request), price differences from state or local taxes/fees, and promotions or discounts that lower the price. The bill defines "online device" broadly (laptop, desktop, tablet, smartphone, or other connected smart hardware) and "hardware state" to include battery life, wireless connections detected, and device age. The act takes effect 60 days after passage.',
  'Transportation',
  'Bans Uber, Lyft, and similar apps from pricing your ride based on your phone''s battery level or other device signals, while still allowing normal surge and location-based pricing.',
  '2026-05-13',
  'pending_review',
  'Andre Carroll',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2014: Expanded hours and vehicle-riding rules for junior volunteer firefighters
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2014',
  'Further providing for minors serving in volunteer emergency service organizations.',
  '1. This bill lets 14- and 15-year-old junior volunteer firefighters train and take part in other permitted fire-company activities until 10 p.m. year-round, with written parental consent, expanding a rule that previously only covered firefighting activities. It also lets a minor at least 14 years old ride in an official emergency vehicle to a fire or emergency scene to take part in activities they''re already authorized to do, as long as the ride follows federal rules for transporting minors. 2. This affects volunteer fire companies statewide, especially in rural areas that rely heavily on junior firefighter programs, and the young volunteers who join them. It benefits volunteer fire departments working to rebuild their ranks amid a long-running statewide decline in volunteer firefighters, and gives junior members more training time and the ability to actually respond alongside their company. 3. If the Senate passes it and the Governor signs it, the expanded hours and vehicle-riding rules take effect 60 days after enactment, statewide. 4. No opposition has been identified, and the House passed it unanimously, 202-0. The bill still requires parental consent and keeps existing safeguards, like federal minor-transportation rules and the 10 p.m. cutoff, in place, which likely explains the lack of opposition.',
  'This bill amends Section 7(d) of the Child Labor Act. Previously, 14- and 15-year-old volunteer fire company members could engage only in "firefighting activities" until 10 p.m. before a school day, with parental consent. This bill broadens that to "other activities permitted under subsection (b)(1)" generally, meaning a wider range of authorized fire-company activities (not only active firefighting itself) can now happen until 10 p.m. year-round, still requiring the minor to be a volunteer fire company member with written parental consent. It also adds a new provision letting a minor at least 14 years old ride in an official emergency vehicle to the scene of a fire or other emergency response, for the purpose of engaging in already-authorized activities, provided the transportation complies with federal regulations governing the transportation of minors engaged in employment. The act takes effect 60 days after passage.',
  'Public Safety',
  'Lets 14- and 15-year-old junior volunteer firefighters train later and ride to emergency scenes, part of an effort to rebuild Pennsylvania''s shrinking volunteer fire ranks.',
  '2025-11-06',
  'pending_review',
  'Gregory Scott',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2037: Ban on officials self-dealing in digital assets/crypto
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2037',
  'In ethics standards and financial disclosure, further providing for definitions and for restricted activities.',
  '1. This bill bars top Pennsylvania officials, the Governor, Attorney General, legislators, and other statewide officeholders, along with their spouse and minor children, from creating, sponsoring, endorsing, or promoting a cryptocurrency, meme coin, NFT, or similar digital asset they have a financial stake in while in office. It doesn''t ban simply owning crypto. Anyone who already holds such a stake has 90 days to sell it once the law takes effect. 2. This affects Pennsylvania''s top elected and appointed officials and their immediate families. It benefits the public by closing a gap that would otherwise let an official personally profit by launching or promoting their own digital asset while in office. 3. If the Senate and Governor approve it, the ban and 90-day divestment window take effect 60 days after enactment. Violating it carries a civil penalty of up to $50,000. 4. No specific opposition argument has been identified, though the House vote, 131-71, shows real, meaningful opposition. The sponsor described it as closing a conflict-of-interest loophole around new digital assets; the bill doesn''t ban owning cryptocurrency, only personally profiting off one an official creates or promotes.

[[READ MORE]]
The ban covers the Governor, Lieutenant Governor, Attorney General, Auditor General, State Treasurer, members of the General Assembly, and executive department secretaries, plus their spouse or minor/unemancipated child. Moving a digital asset into a trust the official still controls or benefits from doesn''t count as divesting; only a genuinely blind trust, where the official can''t direct investments or learn what''s held, is exempt. Officials must also disclose the exact dollar value of any digital asset holding over $1,000 on their annual financial-interest statement, a stricter disclosure standard than most other assets require.',
  'This bill amends Pennsylvania''s Public Officers ethics code (Title 65). It defines "digital asset" broadly to include cryptocurrency, meme coins, NFTs, and stablecoins, and adds a new restricted activity: a covered public official, or their spouse or minor/unemancipated child, may not issue, create, sponsor, endorse, or promote a digital asset in which they have a financial interest or receive a financial benefit, during the official''s term. "Public official" is defined as the Governor, Lieutenant Governor, Attorney General, Auditor General, State Treasurer, a member of the General Assembly, or a secretary of a Commonwealth executive department. Anyone already holding such an interest, whether at the bill''s effective date or the start of a term, has 90 days to divest. A financial interest held through a trust counts toward the ban if the official is a trustee, beneficiary, can direct the trust''s investments, or may receive a distribution from it; transferring the asset into such a trust does not satisfy the divestment requirement. A qualified blind trust, where the official cannot control or learn of specific holdings, is exempt. Financial-interest disclosure statements must now list the exact dollar amount of any digital asset holding over $1,000, unlike most other disclosed assets, which don''t require a specific amount. Violating the digital-asset restriction carries a civil penalty of up to $50,000, separate from the existing felony penalty (up to $10,000 fine or 5 years) for other restricted-activities violations. The act takes effect 60 days after passage.',
  'Government Operations',
  'Bars the Governor, legislators, and other top PA officials from profiting off a cryptocurrency or NFT they create or promote while in office.',
  '2025-11-17',
  'pending_review',
  'Benjamin Waxman',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1133: State Board of Pharmacy expansion (adds pharmacy technician seat)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1133',
  'Further providing for State Board of Pharmacy.',
  '1. This bill adds a licensed pharmacy technician as a new voting member of Pennsylvania''s State Board of Pharmacy, the body that regulates pharmacists and pharmacies statewide. It also grows the board''s pharmacist seats from five to six, adding a second seat for pharmacists who work in hospital or acute-care settings. The technician must have at least five years of experience and can only serve one six-year term, unlike other board members, who can serve two. 2. This affects the State Board of Pharmacy itself and the pharmacy technicians, pharmacists, and pharmacies it regulates. It benefits pharmacy technicians, who gain a direct voice in shaping the rules that govern their own profession for the first time; the board''s other seats, including two public members and two seats each for chain and independent retail pharmacists, stay unchanged. 3. If the House passes it and the Governor signs it, the expanded board takes effect 60 days after enactment, with new appointments made by the Governor and confirmed by the Senate as seats open up. 4. No opposition has been identified, and the Senate passed it unanimously, 50-0. This is a routine board-composition update with no identified counter-argument.',
  'This bill amends Section 6 of the Pharmacy Act, governing the State Board of Pharmacy''s composition. The board currently consists of the Commissioner of Professional and Occupational Affairs, the Director of the Bureau of Consumer Protection (or designee), two public-at-large members, and five licensed pharmacists. This bill increases the pharmacist seats to six and adds one new seat for a registered pharmacy technician. Pharmacist seats remain allocated as: two from independent retail pharmacies, two who are employees of chain pharmacies operating five or more Pennsylvania locations, and two (up from one) from separate acute-care institutional pharmacies; each pharmacist appointee must have been registered at least five years. The new pharmacy technician seat requires either five years registered with the board or an attesting licensed pharmacist confirming five years of Pennsylvania pharmacy technician experience. All professional, technician, and public members are appointed by the Governor with Senate confirmation, serve six-year terms, and may generally serve up to two consecutive terms, except the pharmacy technician seat, which is limited to one six-year term. The act takes effect 60 days after passage.',
  'Government Operations',
  'Adds a pharmacy technician seat to Pennsylvania''s State Board of Pharmacy for the first time, and grows the board''s pharmacist seats from five to six.',
  '2026-01-09',
  'pending_review',
  'Frank Farry',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2644: $4.8B bridge capital budget supplement (2,272 itemized bridge projects)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2644',
  'A Supplement to the act of December 8, 1982 (P.L.848, No.235), known as the Highway-Railroad and Highway Bridge Capital Budget Act for 1982-1983, itemizing additional State and local bridge projects.',
  '1. This bill authorizes Pennsylvania to spend and borrow about $4.8 billion on bridge repair, replacement, and rehabilitation projects, itemizing more than 2,270 specific bridge projects across 66 of the state''s 67 counties. About $3.8 billion goes to state-owned bridges built by PennDOT; the remaining roughly $960 million funds grants covering up to 80% of the cost for local, municipality-owned bridges. 2. This affects drivers and communities near any of the more than 2,270 listed bridges, and the state''s overall debt load, since much of this is financed by borrowing. It benefits communities with aging or deficient bridges by funding specific, named repair and replacement projects; it also requires contractors to prefer domestically manufactured steel where available, actively recruit Pennsylvania-based firms, and encourage participation by minority- and women-owned businesses. 3. If the Senate passes it and the Governor signs it, the law takes effect immediately, adding this authorization to the state''s ongoing bridge capital budget program first established in 1982. 4. No opposition has been identified in available coverage, and the House passed it unanimously, 202-0. This is a routine capital budget supplement itemizing specific, already-planned bridge projects rather than a new or contested policy.',
  'This bill, the "Highway-Railroad and Highway Bridge Capital Budget Supplemental Act for 2026-2027," supplements Pennsylvania''s 1982 bridge capital budget act. It sets a total authorization of $4,766,821,816 for bridge projects financed from current revenue or new debt: $3,804,519,537 for state highway and forestry/state-park bridge projects built by PennDOT or the Department of Conservation and Natural Resources, and $962,302,279 for non-state (local/municipal) bridge projects, funded by grants covering up to 80% of the non-federal cost share. The bulk of the act (Sections 5 through 78) itemizes more than 2,270 individual bridge projects county by county across 66 of Pennsylvania''s 67 counties, each listing the specific route, waterway or feature crossed, township, project type (replacement, rehabilitation, restoration, or preservation), a bridge key/project ID, and a dollar allocation broken into base project cost, land acquisition, and design/contingency amounts. The act also declares Commonwealth policy favoring job creation and rehiring of unemployed Pennsylvanians on these projects, requires contractors to solicit Pennsylvania-based firms and use U.S.-manufactured steel and products unless the Secretary of Transportation certifies insufficient domestic supply (published in the Pennsylvania Bulletin), and encourages substantial minority- and women-owned business participation. Debt incurred is repaid from the Highway Bridge Improvement Restricted Account, and this authorization adds to the cumulative debt/authorization total under the original 1982 act. The act takes effect immediately upon passage.',
  'Infrastructure',
  'Authorizes about $4.8 billion to repair or replace more than 2,270 specific bridges across nearly every Pennsylvania county.',
  '2026-06-16',
  'pending_review',
  'Ed Neilson',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1212: Closes discretionary loophole in rape kit "awaiting testing" definition
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1212',
  'Further providing for definitions.',
  '1. This bill closes a loophole in how Pennsylvania defines a rape kit as "awaiting testing." Under current law, a kit only counts as awaiting testing if local police also decide it "should" be tested, meaning some untested kits weren''t officially counted as backlogged at all. This bill removes that discretion: any sexual assault evidence that''s been collected but hasn''t had DNA or forensic testing now automatically counts as awaiting testing, no local judgment call required. 2. This affects every local law enforcement agency in Pennsylvania that collects sexual assault evidence, and survivors whose kits may currently go untracked because of how their jurisdiction interpreted the old definition. It benefits survivors and victim advocates by making the state''s rape kit backlog numbers accurate and consistent statewide, ending inconsistency the Pennsylvania Commission on Crime and Delinquency found between jurisdictions. 3. If the House passes it and the Governor signs it, the change takes effect immediately, applying the same, non-discretionary definition to every police department in the state going forward. 4. No opposition has been identified, and the Senate passed it unanimously, 50-0. The bill responds to a specific finding by the state''s own crime commission that the old, discretionary definition was creating uneven treatment of untested kits between jurisdictions.',
  'This bill amends the definitions section of the Sexual Assault Testing and Evidence Collection Act. It replaces the current four-part definition of "awaiting testing" evidence, which required the evidence to be collected and in local law enforcement''s possession, not yet forensically tested, tied to a case without final disposition, AND affirmatively determined by local law enforcement as needing testing, with a simple, non-discretionary standard: evidence that has been collected and has not received DNA or other appropriate forensic analysis. This removes local law enforcement''s discretion to decide a collected-but-untested kit doesn''t need testing and therefore doesn''t count toward the state''s tracked "awaiting testing" backlog. The act takes effect immediately upon passage.',
  'Public Safety',
  'Removes police discretion over which untested rape kits officially count as "awaiting testing," closing a gap that let some kits go untracked statewide.',
  '2026-03-12',
  'pending_review',
  'Tracy Pennycuick',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2198: Full repeal of data center tax incentive program ($188M-$517M fiscal impact)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2198',
  'Repealing provisions relating to Computer Data Center Equipment Incentive Program; and, in general provisions, providing for data centers.',
  '1. This bill repeals Pennsylvania''s sales and use tax break for large computer data centers entirely, eliminating the exemption and refund program for data center equipment purchases. It also blocks data centers not already certified under the old program from qualifying for tax benefits under other state incentive programs, closing an alternate route to a similar break. 2. This affects large technology companies operating or planning data centers in Pennsylvania, including firms like Amazon, Microsoft, and Alphabet named by the bill''s sponsor, and the state''s tax revenue. It benefits the state budget: the sponsor estimates the existing tax break would cost Pennsylvania $188.4 million in the 2026-27 fiscal year, growing to $517 million by 2030. 3. If the Senate and Governor approve it, the repeal takes effect immediately, closing the incentive to new applicants right away. 4. No organized opposition has been identified; the House passed it 197-5, a near-unanimous, bipartisan vote. A related bill in this same batch, HB2359, would instead keep this program alive with new transparency requirements rather than repeal it; the two represent competing directions for the same policy, and neither has been enacted as of this writing.

[[READ MORE]]
The blocked alternate programs are named in the bill as Article XVIII-C, Article XIX-B, and the Keystone Opportunity Zone, Keystone Opportunity Expansion Zone and Keystone Opportunity Improvement Zone Act. A data center certified under the old incentive program before February 3, 2026 remains eligible for those other programs; one certified afterward, or never certified at all, is not. This tax break began in 2016 as a capped refund and was expanded into a broader, uncapped sales tax exemption in the 2021 state budget deal.',
  'This bill repeals Article XXIX-D of the Tax Reform Code of 1971 in full, the Computer Data Center Equipment Incentive Program, which had given qualifying data centers a sales and use tax refund or, later, a broader uncapped sales and use tax exemption on equipment purchases (generators, cooling systems, servers, networking equipment, security systems, and related infrastructure). Enacted in 2016 as a capped refund program and expanded into an uncapped exemption in the 2021 state budget, the sponsor cited estimates that the program would cost the Commonwealth $188.4 million in the 2026-27 fiscal year, rising to $517 million by 2030. In place of the repealed article, the bill adds a new provision (Section 3003.26) stating that unless a computer data center was certified under the old Article XXIX-D program before February 3, 2026, it is not eligible for tax benefits under Article XVIII-C, Article XIX-B, or the Keystone Opportunity Zone, Keystone Opportunity Expansion Zone and Keystone Opportunity Improvement Zone Act, closing off those other tax-incentive programs as an alternate route to a similar benefit. The act takes effect immediately upon passage.',
  'Budget',
  'Repeals Pennsylvania''s sales tax break for large data centers, projected to save the state up to $517 million a year by 2030.',
  '2026-02-05',
  'pending_review',
  'Gregory Vitali',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2388: Mandatory cash-total rounding to the nearest nickel (post-penny)
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2388',
  'Providing for rounding of certain payment sums paid by physical legal tender.',
  '1. This bill requires Pennsylvania businesses, utilities, and government agencies that accept in-person cash payments to round the total to the nearest nickel, following the federal government''s move away from producing new pennies. A total ending in 1, 2, 6, or 7 cents rounds down; one ending in 3, 4, 8, or 9 cents rounds up. It doesn''t apply to debit, credit, checks, or digital payments, or when a business can give exact change. 2. This affects anyone who pays cash in Pennsylvania, and every business, utility, or government office that accepts it. It benefits consumers: rounding up credits the extra amount to the customer''s account, and rounding down adds any shortfall to the next bill rather than treating it as a late payment. It doesn''t change how sales tax is calculated. 3. If the Senate and Governor approve it, the law takes effect immediately, and covered businesses and agencies have up to one year to put the rounding procedure in place. 4. No organized opposition has been identified, and the House passed it 187-15. The bill responds to the federal government''s move away from producing new pennies; the sponsor said states need clear, simple rules once the federal government changes course.

[[READ MORE]]
Very small cash transactions under 5 cents always round up to a nickel, rather than following the standard up/down rule. The bill also gives covered entities legal protection: using this rounding procedure does not count as a violation of Pennsylvania''s Unfair Trade Practices and Consumer Protection Law.',
  'This bill, the "Pennsylvania Common Cents Act," requires every Commonwealth agency, business entity, public utility, municipal authority, and political subdivision that accepts face-to-face cash payment to round the grand total (after tax, discounts, and fees) to the nearest five cents: totals ending in 1, 2, 6, or 7 cents round down; totals ending in 3, 4, 8, or 9 cents round up. "Microtransactions" (grand totals under 5 cents) always round up to a nickel. The rule does not apply to non-cash payment methods (checks, cards, digital/contactless payment, gift cards) or when the customer pays with exact physical change. When a total rounds up, the entity must credit the extra amount to the customer''s or ratepayer''s account; when a total rounds down, the resulting shortfall is deemed part of the bill "paid in full" for that billing cycle and must instead be added to the customer''s next bill, and cannot by itself be treated as a delinquent amount that triggers service termination, a late fee, or collection activity. The act does not affect how sales tax itself is computed, only the post-tax cash total. Using this rounding procedure does not violate the Unfair Trade Practices and Consumer Protection Law. Covered entities have up to one year after the effective date to implement the procedure; the act itself takes effect immediately.',
  'Other',
  'Requires Pennsylvania cash transactions to round to the nearest nickel, with consumer protections, as the U.S. phases out minting new pennies.',
  '2026-04-16',
  'pending_review',
  'Nathan Davidson',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1206: Temporary state license for drug manufacturers pending FDA approval
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1206',
  'An act amending the act of December 14, 1992 (P.L.1116, No.145), entitled "An act providing minimum standards, terms and conditions for the licensing of persons who engage in wholesale distributions in interstate commerce of prescription drugs; and making a repeal," further providing for definitions and for license application.',
  '1. This bill lets pharmaceutical and medical device manufacturers apply for a Pennsylvania distribution license while their product is still awaiting final FDA approval, instead of waiting until after approval to start the state process. A company can get a temporary, one-year license by showing an active FDA application and supply-chain compliance documents; it converts to a normal license within 30 days once FDA approval and all state requirements are met. 2. This affects pharmaceutical and medical device manufacturers, including "virtual manufacturers" that never physically handle their product in Pennsylvania, looking to distribute in the state. It benefits Pennsylvania''s competitiveness for life-sciences jobs and investment, since other states could otherwise move faster to capture that business while a company waited on the old, sequential process. 3. If the House and Governor approve it, the temporary license option takes effect 60 days after enactment. 4. No opposition has been identified, and the Senate passed it unanimously, 50-0. The bill doesn''t relax any drug-safety standard or change federal approval requirements; it only changes when a manufacturer can start the state licensing process.

[[READ MORE]]
A temporary license doesn''t authorize actually selling the product commercially unless federal law separately permits that, and it expires automatically if the FDA denies, or the applicant withdraws, the approval application. It can only be renewed once, and the licensee must notify the state within five business days of any FDA decision or material change to its manufacturing or distribution arrangements.',
  'This bill amends the Wholesale Prescription Drug Distributors License Act. It broadens the definition of "virtual manufacturer" (a Pennsylvania-based manufacturer that never physically possesses the drug/device in the Commonwealth) to also cover a company with a pending FDA submission, not just one already holding FDA approval. It adds a new "temporary license" the Department may issue to a manufacturer or virtual manufacturer whose drug or device has not yet received final FDA approval, if the applicant submits documentation of an active FDA application (new drug application, abbreviated new drug application, biologics license application, device identification number, 510(k) premarket notification, or similar), identifies any contract manufacturing organization involved, and demonstrates compliance with federal pharmaceutical supply-chain security requirements. A temporary license expires one year after issuance unless renewed (renewable only once), expires automatically if the FDA denies, withdraws, or refuses the application, does not itself authorize commercial distribution unless otherwise permitted under federal law, and creates no property interest, meaning it can be suspended or revoked for noncompliance. The applicant must notify the department within five business days of any FDA decision or material change to its manufacturing/distribution arrangements, and the department must convert the temporary license into a full license within 30 days once all licensure conditions are satisfactorily proven. Issuance of a temporary or full license is not to be construed as Commonwealth approval or endorsement of the drug or device. The act takes effect 60 days after passage.',
  'Economic Development',
  'Lets drug and medical device makers start Pennsylvania''s state licensing process before final FDA approval, so the state can compete faster for life-sciences investment.',
  '2026-03-30',
  'pending_review',
  'Tracy Pennycuick',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2437: Broadens eligible use of gas-well-fee bridge funds beyond "at-risk" bridges
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2437',
  'In unconventional gas well fee, further providing for Statewide initiatives.',
  '1. This bill loosens how counties can spend their share of Pennsylvania''s natural-gas drilling impact fee revenue set aside for bridge repair. Today, that money can only fund "at-risk deteriorated" bridges. This bill lets counties use it to improve any county- or municipal-owned bridge, not just deteriorated ones, and lets Pennsylvania''s largest counties, Philadelphia and Allegheny, also use it for bridges owned by a public transportation authority, like SEPTA. 2. This affects all 67 Pennsylvania counties that receive Marcellus Legacy Fund bridge money, funded by fees on unconventional (fracking) gas wells; the fund received about $89.2 million in 2026. It benefits counties by giving them more flexibility to use this bridge money where it''s actually needed, rather than only on bridges that already meet a formal "at-risk" designation; PennDOT still has to approve each county''s spending plan before releasing funds. 3. If the Senate passes it and the Governor signs it, the broader eligibility rules take effect 60 days after enactment, applying to the next round of bridge distributions. 4. No opposition has been identified in available coverage, and the House passed it unanimously, 202-0. This is a routine funding-flexibility change to an existing bridge program, not a new tax or fee.',
  'This bill amends Section 2315 of Title 58 (Oil and Gas), which governs "Statewide initiatives" funded by Pennsylvania''s unconventional (shale) gas well impact fee under Act 13 of 2012. Of the fee revenue deposited into the Marcellus Legacy Fund, 25% is distributed to counties, proportionate to population, through the Highway Bridge Improvement Restricted Account. Currently that money may only be used to repair or replace "at-risk deteriorated" locally owned bridges; this bill removes that limitation, allowing counties to use the funds to improve any county or municipal bridge, regardless of federal-aid eligibility, as long as the county''s plan includes funding for replacement or repair and is approved by the Department of Transportation. It also lets a county of the first or second class (Philadelphia and Allegheny County) use its share to improve bridges owned by a public transportation authority, removing the prior "at-risk deteriorated" restriction on that use as well. The act takes effect 60 days after passage.',
  'Infrastructure',
  'Lets counties spend their share of natural-gas drilling fee revenue on any bridge repair, not just already-designated "at-risk" bridges.',
  '2026-04-21',
  'pending_review',
  'Nathan Davidson',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB482: Requires LIFE program disclosure before Medicaid managed care assignment
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB482',
  'In public assistance, further providing for definitions, for administration of assistance programs and for regulations for protection of information; in the aged, further providing for Life Program; and making a repeal.',
  '1. This bill requires Pennsylvania''s Medicaid enrollment process to tell eligible seniors about the LIFE program, home- and community-based elder care that lets nursing-home-eligible seniors stay in their own homes, before assigning them to a managed care plan. The state can no longer place someone into Medicaid managed care until they''ve first been assessed for home- and community-based services. 2. This affects Pennsylvania seniors going through Medicaid long-term-care enrollment, and the LIFE program providers and managed care organizations that compete to serve them. It benefits seniors by ensuring they learn about the LIFE program before being defaulted into standard managed care; LIFE providers gain more visibility and a role in shaping enrollment materials. 3. If the House and Governor approve it, the enrollment process changes take effect 60 days after enactment. 4. No specific opposition argument has been identified, but the Senate vote, 27-23, shows real, close opposition. A likely concern, based on the bill''s content, is that giving LIFE providers direct input into enrollment materials and requiring an assessment delay before managed care assignment could tilt the playing field against competing managed care organizations, though no group has made that argument publicly.

[[READ MORE]]
New required enrollment materials include a comparison chart between LIFE and standard managed care, contact information for the senior''s local LIFE provider, and a signed attestation form confirming they understood what LIFE offers, developed with input from LIFE program providers. The state must also report county-level long-term-care enrollment data quarterly to the relevant House and Senate aging and human services committees.',
  'This bill amends the Human Services Code''s public assistance and "LIFE Program" (Living Independence For the Elderly) provisions. It formally defines "LIFE program" and adds a definition for "older adult daily living center." It requires that, immediately after an applicant is referred for a functional eligibility determination, the Department must provide LIFE program organizations and older adult daily living centers the information needed to determine eligibility, and must ensure the applicant receives information about those programs. Critically, the department may not assign an applicant to a Medicaid managed care option until the applicant has first received an assessment for home- and community-based services; if an applicant doesn''t choose a managed care option, the department must assign proportionately among eligible placement options rather than defaulting them in. It expands the required LIFE program informational materials (used by the department and the Independent Enrollment Broker) to include an FAQ list developed with LIFE program provider input, a comparison between LIFE and Community Health Choices managed care, contact information for the individual''s assigned local LIFE provider, and a signed attestation form (also developed with LIFE provider input) confirming the individual''s understanding of LIFE services. It requires continued Independent Enrollment Broker training on the LIFE program to ensure equal access, and a new quarterly report to four specific legislative committees tracking county-level long-term-care enrollment and compliance. A related Fiscal Code section governing this same reporting requirement is repealed and continued under this act''s new Section 602 provisions, with existing contracts, orders, and agreements unaffected. The act takes effect 60 days after passage.',
  'Health',
  'Requires Pennsylvania to inform Medicaid-eligible seniors about the LIFE in-home elder care program before enrolling them in standard managed care.',
  '2025-03-20',
  'pending_review',
  'Daniel Laughlin',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- HB2496: Municipal 180-day pause on new data center zoning applications
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'HB2496',
  'In general provisions, providing for pause on data center proposals.',
  '1. This bill lets any Pennsylvania municipality vote to pause new data center zoning applications for up to 180 days, giving local officials time to write or update zoning rules before deciding on pending projects. During the pause, a municipality can change its data center zoning rules, and any new application has to follow whatever rules exist once the pause ends. 2. This affects Pennsylvania municipalities weighing data center proposals, and the companies seeking to build them. It benefits local officials, who get breathing room to update zoning before a major project locks in under outdated rules; it doesn''t add any new restriction on data centers beyond what a municipality already has power to adopt, since it''s a delay tool, not a moratorium. 3. If the Senate and Governor approve it, municipalities statewide could immediately adopt a data center pause by public resolution. 4. The House passed this nearly unanimously, 201-1, but real opposition exists outside the legislature: Food & Water Watch, which organized residents who rallied at the Capitol, calls this bill a "performative baby-step" that adds no real new power, since municipalities can already pause applications under existing law; they''re instead pushing a proposed three-year statewide moratorium, arguing this bill distracts from that stronger measure.

[[READ MORE]]
A municipality can''t use this pause tool again for 18 months after one ends. The pause doesn''t apply to applications already submitted before it takes effect, and it doesn''t limit a municipality''s separate, existing power to adopt zoning, environmental, water-consumption, or utility-infrastructure rules.',
  'This bill adds Section 111, "Pause on Data Center Proposals," to the Pennsylvania Municipalities Planning Code. It lets a municipality''s governing body adopt a resolution at a public meeting to pause acceptance of new land development applications for data center developments, for up to 180 days, retroactive to the date public notice of the meeting was given. Time limits the municipality must otherwise meet for reviewing, hearing, and deciding an application are suspended during the pause and resume once it ends. A municipality may not use its existing "add to the agenda by majority vote" authority to circumvent the pause for a data center application. During the pause, the municipality may adopt, amend, or repeal data-center-related land use ordinance provisions; any application submitted during the pause is deemed received the day after the pause ends and is governed by whatever ordinance is then in effect. The pause does not apply to applications submitted before its effective date, which continue under the zoning law that existed when they were received. A municipality that uses this pause procedure may not use it again for 18 months after the pause formally expires or is repealed. The bill explicitly does not preempt or limit a municipality''s existing authority under the Municipalities Planning Code or a home rule charter, including its power to adopt zoning, subdivision, stormwater, environmental, public safety, water-consumption, utility-infrastructure-impact, buffering, landscaping, lighting, or noise ordinances.',
  'Environment',
  'Lets Pennsylvania towns pause new data center zoning applications for up to 180 days to update local rules, though critics call it too weak compared to a proposed statewide moratorium.',
  '2026-05-08',
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
  primary_sponsor = EXCLUDED.primary_sponsor;

-- SB1273: Turnpike toll-data sharing exception for Amber Alert/missing person cases
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  'SB1273',
  'In turnpike, further providing for electronic toll collection.',
  '1. This bill lets the Pennsylvania Turnpike Commission share electronic toll (E-ZPass) data with law enforcement specifically to help find abducted children and missing people considered at special risk of harm, cases flagged through Pennsylvania''s Amber Alert System or Missing Endangered Person Advisory System. It adds this as one more listed exception to the Turnpike''s existing toll-data privacy protections, which otherwise limit who can access a driver''s toll records. 2. This affects anyone who drives the Pennsylvania Turnpike with an E-ZPass or similar electronic toll transponder, and law enforcement investigating an Amber Alert or missing-person case. It benefits public safety by giving investigators faster access to a real-time trail of where a suspect''s or missing person''s vehicle has passed through tolls; it narrows driver privacy protections in this one specific circumstance. 3. If the House passes it and the Governor signs it, the new law enforcement exception takes effect 60 days after enactment. 4. No specific opposition argument has been identified in available coverage, and the Senate passed it 48-2, a small but real minority voting no, which may reflect general concern about narrowing driver privacy protections on toll data, even for this specific, sympathetic purpose.',
  'This bill amends Section 8117(d)(2) of Title 74 (Transportation), which lists exceptions to the Pennsylvania Turnpike''s duty to keep electronic toll collection data private. It adds a new exception allowing the provision of toll information to law enforcement officials specifically to assist in recovering abducted children and missing persons identified as being at special risk of harm through the Pennsylvania Amber Alert System or the Missing Endangered Person Advisory System (or any successor system established by law). This exception is added alongside whatever other exceptions already exist in that same subsection. The act takes effect 60 days after passage.',
  'Public Safety',
  'Lets the PA Turnpike share E-ZPass toll data with police to help find abducted children and missing people under Amber Alerts.',
  '2026-04-17',
  'pending_review',
  'Camera Bartolotta',
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
  primary_sponsor = EXCLUDED.primary_sponsor;
