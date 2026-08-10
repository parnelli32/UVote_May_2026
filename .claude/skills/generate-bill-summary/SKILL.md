---
name: generate-bill-summary
description: Use this skill whenever a UVote bill (Philadelphia City Council or PA House/Senate) needs a citizen-facing summary/bill_text/topic generated or regenerated from its real source text — the reusable replacement for hand-writing a bill summary in an ad hoc Claude Code chat. Always consult this skill before drafting a bill's `summary` field by hand, and before writing any SQL that touches `bills.summary`/`bill_text`/`topic`. Never generates a summary from a bill's title alone — if real extracted source text isn't available, the correct behavior is to skip the bill and flag it for a human, not guess.
---

# UVote bill summary generation

This skill produces a citizen-facing bill `summary` (the four-part format), a plain-language `bill_text` restatement, an explicit `topic`, and a ready-to-run SQL upsert block for one bill — the same output a human currently produces by hand in a Claude Code chat (see `current-manual-process.md`), just unattended and reusable across Philadelphia City Council and PA House/Senate.

**The skill never writes to the database itself.** It emits SQL for a human to review and run through the Supabase Dashboard SQL editor, matching this project's existing "migrations are always applied by hand" convention (see `CLAUDE.md`). This is deliberate and indefinite (C1 write-back mode), not a placeholder — see "Why this matters" below.

## Why this matters

- **`CLAUDE.md`'s core product principle**: *"No vote without context... Every bill must carry a plain-language, honest summary before a vote is allowed."* A summary generated from a title alone, or from unsanitized source text, or that silently fails to parse on the bill detail page, breaks this principle directly.
- **The frontend contract is real, narrow, and already shipped** — not a suggestion. `src/lib/billUtils.ts`'s `parseSummaryIntoSections` is the *entire* parsing logic for `summary`. It requires the inline `1. text 2. text 3. text 4. text` shape (regex-matched on the literal markers `1.`–`4.`), is hard-capped at exactly four sections in the code itself (`SECTION_LABELS` has four entries; both parse paths `.slice(0, 4)`), and silently collapses anything it can't parse into a single "What this bill does" section with sections 2–4 rendering empty. **This is exactly what happens to every PA bill synced today** — `legiscan-sync.ts` writes `summary: fullBill.description` (LegiScan's one-line description, no structure), so PA bills collapse into one section on the live site right now, not hypothetically.
- **Even full human authorship doesn't self-enforce quality.** A captain-commissioned rubric evaluation (`report.md` §12) of 8 real, live Council summaries — not cherry-picked, just the 8 most recent at query time — found every Policy-category bill overshot the product's own 120–180 word target by 26–69%, and a real structural pattern: Part 4 ("if it doesn't pass") repeatedly fell back to generic filler while Part 3 carried all the sourced, specific detail, even stranding a real, sourced, named opposition coalition's argument in Part 2 instead of surfacing it in Part 4 where a reader would look for it. Both bills read smoothly and would likely pass an unaided skim — which is exactly why they weren't caught. This is why the rubric below is scored explicitly, not eyeballed.
- **Extraction is a real document-borne security surface, not a hypothetical one.** A human reading a bill PDF visually cannot be misled by an invisible character — it renders as nothing. An LLM ingesting extracted text as generation input can act on hidden instructions a human reviewer would never think to check for (zero-width characters, bidi-override "Trojan Source" characters per CVE-2021-42574, Unicode Tag-block smuggled ASCII payloads). This is why sanitization (Step 4 below) is a hard requirement independent of everything else in this skill, not a nice-to-have.
- **Passage does not always mean enactment.** Pennsylvania constitutional amendments require identical passage in two separate consecutive legislative sessions, never go to the Governor, and only take effect via voter referendum. A generic Part 3/4 template ("if it passes, this becomes law") is factually wrong for that bill type — a direct violation of "no vote without context," since a citizen voting under a false premise about what their vote even means isn't informed at all. This is why Axis C (Step 6 below) is a correctness check, not a style nuance.

## Hard contract — read before doing anything else

1. **Grounding is mandatory.** Never draft `summary`/`bill_text` from a bill's title or metadata alone. If real source text can't be extracted (unsupported/corrupt document, unreadable `mime`), **stop, do not generate, and flag the bill for a human.** Do not "do your best" from the title.
2. **Sanitize extracted text before it reaches any generation prompt.** Run every extracted document through `scripts/sanitize.mjs` first — no exceptions, independent of source or perceived trustworthiness.
3. **Output format is fixed by today's shipped frontend, not by this skill's judgment.** `summary` must be the inline `1. ... 2. ... 3. ... 4. ...` format, exactly four non-empty sections, validated against the *real* parser (`scripts/format_gate.mjs`) before the bill is considered done. No 5th section, no markdown, no bullets, no headers — those are real future improvements (see "Explicitly out of scope") but require a frontend change this skill does not make.
4. **Never write a `category` value.** The field is dead in the live product (not in any migration, not in the hand-maintained `Database` type, not in the admin form, not read by any frontend code) and is being formally dropped in a separate migration. Do not carry it forward in any output, including the SQL block.
5. **`bill_text` is a hand-written plain-language restatement, grounded in the real extracted source text — never the raw extracted text itself.** Storing full legal text for thousands of PA bills was rejected on database-size grounds; the convention is restatement, project-wide.
6. **`topic` must be explicitly assigned from `BILL_TOPICS` for every bill, every body.** Today `topic` is `null` on every sampled bill in production, Council included — every bill card is rendering off the weaker `TOPIC_RULES` keyword fallback. Explicit assignment is a real, free improvement available immediately.
7. **Write-back is C1 only: emit SQL, never execute it.** This skill must never run a write against Supabase itself, in any mode. Moving to C2 (automated direct write) is gated on two preconditions or bills the captain owns, not on this skill's output looking good — see "Write-back mode" below.
8. **A generated-but-unreviewed bill must not reach a votable state.** Set `status` so the bill does not appear as `active` in the citizen feed until a human has reviewed it against the rubric below (see the SQL template's status handling).

## The 9-criterion "informed enough to vote" rubric

This is the actual review bar — copy it into every self-report verbatim so a human reviewer never has to re-derive it. Each criterion is a concrete, checkable test, not a value statement.

| # | Criterion | Citizen question | Concrete test |
|---|---|---|---|
| 1 | **Mechanism** | What does this bill actually *do*? | Could a reader restate, in their own words, the one concrete action/change the bill makes, from Part 1 alone, without consulting the bill text? Fails on abstraction ("improves oversight" without saying what the oversight mechanism is). |
| 2 | **Stakes both ways** | What changes if it passes — and if it doesn't? | Are Parts 3 and 4 *comparably concrete and bill-specific*, or does Part 4 fall back to generic "status quo continues" filler while Part 3 carries all the specific, sourced detail? |
| 3 | **Distributional clarity** | Who wins, who bears the cost, and roughly how many people? | Can a reader identify beneficiaries, burden-bearers, and rough scale without inferring it from buried details? |
| 4 | **Grounding vs. inference distinguishability** | Which claims are directly verifiable from the bill's own text, and which are the writer's researched context or interpretation? | Can a reader tell a bill-text fact (a penalty amount, an effective date) apart from an inference or enrichment claim (e.g. "suggesting potential support from the Mayor's office")? |
| 5 | **Non-manipulation / balance** | Is this summary trying to persuade me, or inform me? | Would a reasonable supporter *and* a reasonable opponent both feel their side's strongest point is represented, or does one side's framing dominate? |
| 6 | **No unexplained jargon cliff** | Can I get through this without hitting a term I don't know? | Grade-8 sentences containing an unexplained term of art (an offense class, a zoning term, a procedural term) still fail comprehension even if every sentence parses at a Grade-8 level. |
| 7 | **Reading load** | Can I actually process this before I vote, across a session where I'm voting on several bills? | Does the summary respect the product's own displayed length target (120–180 words, `BillsTab.tsx:244`), or does length quietly trade "informed" for "exhausting"? |
| 8 | **Self-relevance** | Am I in the group this affects? | After reading, can a reader place themselves (or someone they know) in an affected/benefited/burdened group, not just infer that *some* group somewhere is affected? |
| 9 | **Proportionality** | Does this summary's length and gravity match what's actually at stake? | Does a genuinely low-stakes bill (technical correction, uncontested procedural item) get an honestly brief, proportionate treatment rather than padded weight — and does a genuinely high-stakes bill get the space it actually needs rather than being truncated to match a one-size-fits-all target? |

## Input contract

The caller (a human, a scheduled dispatch, or a firstmate crewmate task) provides:

- A bill identifier: `legislative_body_id` + `bill_number`, or an existing `bill_id` UUID.
- Available source material: for Philadelphia City Council, a `phila.legistar.com` bill PDF URL (search `https://phila.legistar.com/Legislation.aspx` by bill number if not already known — see "Extraction" below for the real, verified path); for PA House/Senate, a LegiScan `bill_id` (numeric) to call `getBill`/`getBillText` against.

The skill resolves its **own** enrichment tier and content axes from bill metadata during Steps 2–6 below — the caller does not need to pre-classify the bill.

**Known legislative body IDs** (from `src/data/legislativeGuides.ts` and `legiscan-sync.ts` — verify these still match `legislative_bodies` before relying on them, schema drift is real in this project):

| Body | `legislative_body_id` | Bill number prefix |
|---|---|---|
| Philadelphia City Council | `a7792d73-3d93-4184-b5a9-600fc363caab` | numeric, e.g. `260565` |
| PA House | `3b6dee71-7cbd-41f1-95d0-3f997cf035be` | `HB` |
| PA Senate | `474bb689-6767-4a56-8429-c09c20bc715c` | `SB` |

`HR`/`SR` (chamber resolutions) are deliberately out of scope, matching `legiscan-sync.ts`'s own `bodyIdForBillNumber` — UVote's `bills` table models legislation, not procedural resolutions.

## Procedure

### Step 1 — Resolve the bill and confirm it isn't already current

Look up the bill by `bill_id` or `(legislative_body_id, bill_number)` via a read-only query (the public `sb_publishable_...` anon key has `read_bills_anon` access — the same read any citizen's browser already has). If it already has a `summary` that passes the format gate and a recent `bill_text`/`topic`, confirm with the caller whether this is an intentional regeneration before proceeding.

### Step 2 — Fetch source material

**Philadelphia City Council**: search `https://phila.legistar.com/Legislation.aspx` by bill number (this is a dynamic ASP.NET page — a scripted GET request against it will not work; drive it with a real browser session, e.g. `chrome-devtools-axi`, fill the search box, submit, then follow the result's `LegislationDetail.aspx` link to find the actual bill PDF under `View.ashx?M=F&ID=...`). For a bill with status `passed`, prefer the **CertifiedCopy** attachment over the original introduced version if both exist — it carries the certification page (Council President + Mayor sign-off with dates), which both confirms `passed` status and gives you the real passage date.

**PA House/Senate**: call LegiScan's `getBill` (`https://api.legiscan.com/?key=$LEGISCAN_API_KEY&op=getBill&id=<bill_id>`) to get the bill's metadata and its `texts` array (each entry has a `doc_id` and `mime`). Call `getBillText` (`op=getBillText&id=<doc_id>`) for the most recent entry to get the base64-encoded document and its `mime` type. **`LEGISCAN_API_KEY` must be present in the environment** — if it isn't, this is an extraction failure per the hard grounding requirement: stop and flag for a human, do not proceed on metadata alone.

### Step 3 — Extract text, dispatched on `mime`

- **`application/pdf`** (the common case for both Council and LegiScan): decode/save to a temp file and read it with the `Read` tool directly — it natively reads PDFs, including multi-page documents. No bespoke PDF library needed; this was verified directly against real bill PDFs (see the skill's test log).
- **`application/rtf`** (LegiScan sometimes returns this for amendments): **do not feed raw RTF markup into the `Read` tool or a generation prompt** — it's control-word/group markup, not prose, and `Read`'s PDF handling doesn't apply to it. Use a proper RTF extractor: check for the `striprtf` Python package (`python3 -c "import striprtf"`); if missing, install it (`pip3 install --user striprtf`) and extract via `from striprtf.striprtf import rtf_to_text`. If `striprtf` can't be installed or errors on the document, that is an extraction failure — **stop and flag for a human**, do not hand-roll a fragile regex-based RTF stripper as a substitute (a naive stripper can silently corrupt hex-escaped/Unicode-escaped content in ways that are worse than failing loudly).
- **Any other or missing `mime`**: extraction failure. Stop, flag for a human.

### Step 4 — Sanitize (hard requirement, always, regardless of source)

Run the extracted text through `scripts/sanitize.mjs` before it touches any generation prompt:

```bash
node --experimental-strip-types .claude/skills/generate-bill-summary/scripts/sanitize.mjs --file /path/to/extracted.txt > /path/to/clean.txt
```

It strips zero-width/invisible format characters, bidi-control "Trojan Source" characters (CVE-2021-42574), and Unicode Tag-block smuggled payloads, and reports what (if anything) it found. **If it reports stripped characters, note that explicitly in the self-report** — it's a signal worth a human's attention even though the pipeline handles it automatically.

### Step 5 — Stage 1 pre-triage (cheap, mechanical, before research)

Using only what's already in hand (no web research yet), set a starting enrichment tier and length budget:

- **Length/complexity proxy**: word or page count of the extracted, sanitized text. A 1-page bill and a 40-page omnibus bill are structurally different problems before a word of research happens.
- **Procedural metadata already fetched**: for PA, sponsor count and `votes`/floor-vote presence from `getBill`'s response; for Council, the `passed_by_suspension` field (already a real, populated column — see `BillDetailPage.tsx`/`BillsTab.tsx`) and a title-pattern check for commemorative bills (`/designat|renam|proclaim|recogniz/i` against titles like "An Ordinance Designating May 21st as..." — a low-risk heuristic in the same spirit as `TOPIC_RULES`' existing keyword fallback, not a new permanent classification field).
- **Output**: an initial Tier 1 (grounded in bill text + metadata only) vs. Tier 2 (adds researched enrichment) call, and an initial sense of whether this bill is short/simple or long/complex. This is a starting point Step 6 can override, not a final verdict — do not persist it as a new schema column (that repeats `category`'s exact mistake: a fixed classification, decided once, that goes stale).

**Tier 2 trigger** (bills likely to actually have real coverage worth researching): recorded floor votes, budget/fiscal subject matter, or a topic match against `TOPIC_RULES`-style relevance keywords. Everything else stays Tier 1 — grounded in the bill's own text and structured metadata only, no web research. This is still strictly better than today's PA baseline (a bare one-line LegiScan description), and honest about what's achievable at PA's ~3,750-bill-per-session scale.

### Step 6 — Resolve the content axes (finalizes what Step 5 started, before drafting Parts 3/4)

These require the same research the summary itself needs, so they're resolved here, per bill, not pre-decided from a title:

- **Axis A — Real opposition.** If organized opposition exists (an advocacy coalition, a named organization's public statement), it belongs specifically in **Part 4**, not stranded in Part 2 as stakeholder color. If no organized opposition was found, Part 4 says so explicitly and honestly ("No significant opposition has been identified in available coverage; the main practical question raised has been [X], not the policy goal itself") — never manufacture a counter-argument for a bill that genuinely doesn't have one (a park renaming does not need invented opposition).
- **Axis B — Actual stakes.** High for major fiscal/contested-policy bills — Part 4 needs to be as substantive as Part 3. Low for genuinely minor procedural/technical bills — and for these, padding the summary to sound weighty is its own rubric failure (Criterion 9), the mirror image of manufacturing opposition.
- **Axis C — What does passage in this vote actually mean? (Correctness check, not style.)** Before drafting Parts 3/4, determine whether passage in this specific chamber vote *is* enactment (the ordinary case for a regular ordinance/bill) or is a procedural step toward something else. **Verified, concrete example**: Pennsylvania constitutional amendments (title pattern: "A Joint Resolution proposing an amendment to the Constitution of the Commonwealth of Pennsylvania...") require identical-language passage in two separate consecutive legislative sessions, never go to the Governor (amendments bypass gubernatorial veto by design), and only take effect via voter referendum. A generic "if it passes, this becomes law" is factually wrong for that bill type. If a bill's title or LegiScan metadata suggests it isn't an ordinary up-or-down enactment vote, verify the actual mechanism (web search against a source like Spotlight PA, WHYY, or Ballotpedia for PA-specific procedural questions) before writing Part 3/4 — do not assume the ordinary case.
- **Axis D — Realistic path to a vote.** Only state directly checkable procedural facts (no committee action since introduction, session nearing its end) if used at all. Never predict whether a bill will pass — that's a one-sided judgment call the platform's non-partisan-by-architecture principle exists to prevent.
- **Axis E — Time pressure.** Council's `passed_by_suspension` field is already surfaced to citizens today (`BillDetailPage.tsx`) as a real signal about *how* a bill passed, not just what it does. Extend the same instinct to noting an unusually fast timeline generally, as neutral context, never editorializing.

Do not build a new fixed bill-type taxonomy or persist these axes as a schema column — they're generation-time judgment, re-resolved per bill, the same category of mistake `category` already was if made permanent.

### Step 7 — Draft the four-part `summary`

Grade 8 reading level, plain prose, no markdown/bullets/headers (the renderer displays `section.text` as a literal React text child — markdown syntax would show as literal asterisks/dashes on screen). Authoring rules, all enforced here:

- **Part 1 (What this bill does)**: the concrete mechanism, not an abstraction. For a bill with multiple discrete provisions, use inline enumeration within the plain-string format — real production `bill_text` already does this informally ("(a) 24-hour on-site security guard... (b) HD video surveillance... (c) key-controlled exterior door access"): "This bill does three things: first...; second...; third..." is available today with zero frontend changes.
- **Part 2 (Who it affects)**: beneficiaries, burden-bearers, and scale where researchable. Any organized opposition's *existence* can be mentioned here, but its actual argument belongs in Part 4 (Axis A).
- **Part 3 (If it passes)**: the concrete real-world outcome — respecting Axis C's determination of what "passes" actually means for this bill. For an already-passed bill, past tense, reflecting the actual outcome.
- **Part 4 (If it doesn't pass)**: per Axis A/B — the single strongest bill-specific argument against passage, with comparable specificity to Part 3, or an explicit honest "no significant opposition identified" for bills that genuinely have none. Never generic "status quo continues" filler when a real counter-argument exists in the source material.
- **Jargon**: gloss any term of art inline the first time it's used. Real positive example already in production: "floor area ratio bonus... meaning they can build more square footage." Real negative example to avoid: using "Class II offense" or "Class III offense" with no dollar/consequence translation anywhere in the summary.
- **Grounding vs. inference (Criterion 4)**: where a claim is the writer's researched inference rather than a bill-text fact, attribute it inline with different confidence than a bill-text fact ("suggesting potential alignment with..." / "a March 2026 report found...") rather than stating it with the same unhedged confidence as what the bill itself says.
- **Length**: 120–180 words is the soft target for a typical bill (matches `BillsTab.tsx`'s own displayed guidance). A genuinely complex bill (e.g. multi-provision appropriations) may honestly need more — do not truncate and drop real mechanism/distributional information to hit the number (Criterion 9). A genuinely simple bill should be honestly short, not padded to look substantial.

### Step 8 — Write `bill_text`

A hand-written plain-language restatement of the bill's real operative provisions — grounded in the sanitized extracted text, never a copy of it. Enumerate distinct provisions where the bill has them (matching the existing informal convention already in production).

### Step 9 — Assign `topic`

Pick exactly one value from `BILL_TOPICS` (`src/lib/billUtils.ts`): `Housing`, `Public Safety`, `Budget`, `Education`, `Infrastructure`, `Transportation`, `Health`, `Environment`, `Economic Development`, `Government Operations`, `Other`. Base this on the bill's actual subject matter as understood from the real source text — do this for every bill, every body; do not leave it null and rely on the `TOPIC_RULES` keyword fallback, which is strictly weaker (title/summary keyword matching only, no real subject-matter judgment).

### Step 10 — Run the format gate

```bash
node --experimental-strip-types .claude/skills/generate-bill-summary/scripts/format_gate.mjs "$SUMMARY_TEXT"
```

This imports and runs the **real** `parseSummaryIntoSections` from `src/lib/billUtils.ts` directly (Node 22's `--experimental-strip-types` loads the `.ts` file with no build step) — it is never a re-description of the parser's behavior, it *is* the parser's behavior. Exit code 0 + `"pass": true` means exactly four non-empty sections. If it fails: **regenerate once.** If it still fails: stop, flag for a human, do not write SQL for this bill.

### Step 11 — Self-check against the rubric

Score all 9 criteria explicitly (pass/fail + one line of reasoning each) against the drafted `summary`. Any failing criterion either gets fixed and re-gated (back to Step 10), or — if fixing it would require information genuinely not available in the source material — gets flagged in the self-report rather than silently shipped.

### Step 12 — Emit the SQL upsert block (never execute it)

Use the template below. Present it to the human reviewer; do not run it.

### Step 13 — Produce the self-report

Alongside the SQL block, output:

```
Bill: <legislative_body_id short name> <bill_number> — <title>
Format gate: PASS | FAIL (regenerated: yes/no)
Word count: <n> (target 120–180; note if intentionally outside range and why)
Sources cited: <list of named sources actually used, or "none — Tier 1, grounded in bill text + metadata only">
Extraction: <mime type, method used, sanitize.mjs findings if any>
Axis C check: <ordinary enactment | procedural exception found: <what and why> | not applicable>
Rubric:
  1. Mechanism            PASS/FAIL — <one line>
  2. Stakes both ways      PASS/FAIL — <one line>
  3. Distributional clarity PASS/FAIL — <one line>
  4. Grounding vs inference PASS/FAIL — <one line>
  5. Non-manipulation      PASS/FAIL — <one line>
  6. No jargon cliff       PASS/FAIL — <one line>
  7. Reading load          PASS/FAIL — <one line>
  8. Self-relevance        PASS/FAIL — <one line>
  9. Proportionality       PASS/FAIL — <one line>
```

## SQL upsert template

```sql
INSERT INTO public.bills (
  bill_number, title, summary, bill_text, topic,
  introduced_date, status, primary_sponsor,
  legislative_body_id
)
VALUES (
  '[bill_number]',
  '[title]',
  '[summary — four-part inline plain prose]',
  '[bill_text — plain-language restatement, not raw extracted text]',
  '[one of BILL_TOPICS]',
  '[introduced_date as YYYY-MM-DD, or NULL if unknown]',
  '[active | passed]',  -- see status note below
  '[Councilmember Name | Parker Administration | NULL]',
  '[legislative_body_id from the table above]'
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor;
  -- introduced_date is intentionally excluded from DO UPDATE SET when
  -- already set in the DB from a prior session — a Certified Copy PDF does
  -- not repeat the intro date, so overwriting it with NULL would be
  -- destructive. Only include introduced_date in DO UPDATE SET when this
  -- run's source genuinely shows it and you are confident in the value.
```

**Notes for the human running this:**

- **`ON CONFLICT (legislative_body_id, bill_number)` requires migration A7** (`deployment-package.md` Part A7, dropping the undocumented global `bills_bill_number_key` and adding `UNIQUE (legislative_body_id, bill_number)`). As of this skill's construction, A7's own deployment doc states production had not yet had it applied, and it is not present in this repo's `supabase/migrations/`. **Confirm A7 is applied before running this block** — if it isn't, Postgres will reject the statement with `no unique or exclusion constraint matching the ON CONFLICT specification`, which is the signal to apply A7 first, not to fall back to the old `bill_number`-only conflict target (that constraint is the wrong shape — see A7's own rationale).
- **No `category` column appears above, deliberately** — see the hard contract.
- **`district_id`** is a real, live column on `bills` (confirmed directly against production) but is essentially unused today (2 non-null rows across the entire table at time of writing) and is not addressed by any of the captain's four resolved decisions or by this skill's authorized scope. This skill deliberately does not assign it. If district-specific bill targeting becomes a priority, that's a separate scoped decision, not something to bolt onto this skill's output silently.
- **Status and the review gate**: per the resolved human-review-transition decision, a generated-but-unreviewed bill must not reach a votable state. If this skill is run in a mode where the caller wants bills held out of the feed until reviewed, use a status other than `active` (or coordinate with the caller on the review-gate mechanism in use) until a human has scored the self-report above and approved the bill.

## Write-back mode: why C1, and what would change it

This skill only ever emits SQL — it never calls Supabase to write. This is the captain-approved architecture decision (Option C generation engine, C1 write-back, `decision-architecture-choice.md`), and it stays that way **indefinitely**, gated on two concrete preconditions rather than a timer:

1. A rubric-scored (not casual-skim) review track record — real Council summaries already showed that an unaided human skim misses real structural gaps (the Part 3/4 imbalance above) in bills that read smoothly. C2 is only on the table once the self-report's rubric scoring has a demonstrated track record, not once output "looks fine."
2. Extraction sanitization built and independently verified — done in this skill (`scripts/sanitize.mjs`), but the precondition is about the *human relying on C1's review step no longer being the last line of defense against document-borne injection*, which is a bigger bar than "the script exists."

Neither precondition is this skill's call to declare met. If asked to write directly to Supabase, decline and point back to this section.

## Explicitly out of scope

- **Bill discovery/ingestion.** Council stays human-initiated (`phila.gov`/Legistar was deliberately not made into an automated scraper — see `current-manual-process.md`). PA stays `legiscan-sync`'s existing job. This skill only generates content for a bill identifier it's given.
- **The `category` column drop migration.** A separate, already-decided follow-up (`decision-category-field-fate.md`) — do not bundle a schema migration into a run of this skill.
- **Any frontend change** — a 5th "Sourcing & Confidence" section, expand/collapse progressive disclosure, markdown rendering, per-bill-type `BillCard` styling. All real, recommended future improvements (see `report.md` §19–§22) but each needs its own scoped, separately-authorized change; this skill works entirely within today's shipped renderer.
- **`district_id` assignment** — see the SQL template note above.
