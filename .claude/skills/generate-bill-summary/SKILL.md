---
name: generate-bill-summary
description: Use this skill whenever a UVote bill (Philadelphia City Council or PA House/Senate) needs a citizen-facing summary/bill_text/topic/short_description generated or regenerated from its real source text — the reusable replacement for hand-writing a bill summary in an ad hoc Claude Code chat. Always consult this skill before drafting a bill's `summary` field by hand, and before writing any SQL that touches `bills.summary`/`bill_text`/`topic`/`short_description`. Never generates a summary from a bill's title alone — if real extracted source text isn't available, the correct behavior is to skip the bill and flag it for a human, not guess.
---

# UVote bill summary generation

This skill produces a citizen-facing bill `summary` (the five-part format — mechanism, who it affects, if it passes, if it doesn't pass, and Key Question(s)), a plain-language `bill_text` restatement, an explicit `topic`, a one-sentence `short_description`, and a ready-to-run SQL upsert block for one bill — the same output a human currently produces by hand in a Claude Code chat (see `current-manual-process.md`), just unattended and reusable across Philadelphia City Council and PA House/Senate.

**The skill never writes to the database itself.** It emits SQL for a human to review and run through the Supabase Dashboard SQL editor, matching this project's existing "migrations are always applied by hand" convention (see `CLAUDE.md`). This is deliberate and indefinite (C1 write-back mode), not a placeholder — see "Why this matters" below.

## Why this matters

- **`CLAUDE.md`'s core product principle**: *"No vote without context... Every bill must carry a plain-language, honest summary before a vote is allowed."* A summary generated from a title alone, or from unsanitized source text, or that silently fails to parse on the bill detail page, breaks this principle directly.
- **The frontend contract is real, narrow, and already shipped** — not a suggestion. `src/lib/billUtils.ts`'s `parseSummaryIntoSections` is the *entire* parsing logic for `summary`. It requires the inline `1. text 2. text 3. text 4. text 5. text` shape (regex-matched on the literal markers `1.`–`5.`), is hard-capped at exactly five sections in the code itself (`SECTION_LABELS` has four fixed entries plus a computed 5th label; both parse paths `.slice(0, 5)`), and silently collapses anything it can't parse into a single "What this bill does" section with the rest rendering empty. **This is exactly what happens to every PA bill synced today** — `legiscan-sync.ts` writes `summary: fullBill.description` (LegiScan's one-line description, no structure), so PA bills collapse into one section on the live site right now, not hypothetically.
- **Even full human authorship doesn't self-enforce quality.** A captain-commissioned rubric evaluation (`report.md` §12) of 8 real, live Council summaries — not cherry-picked, just the 8 most recent at query time — found every Policy-category bill overshot the product's own 120–180 word target by 26–69%, and a real structural pattern: Part 4 ("if it doesn't pass") repeatedly fell back to generic filler while Part 3 carried all the sourced, specific detail, even stranding a real, sourced, named opposition coalition's argument in Part 2 instead of surfacing it in Part 4 where a reader would look for it. Both bills read smoothly and would likely pass an unaided skim — which is exactly why they weren't caught. This is why the rubric below is scored explicitly, not eyeballed.
- **Extraction is a real document-borne security surface, not a hypothetical one.** A human reading a bill PDF visually cannot be misled by an invisible character — it renders as nothing. An LLM ingesting extracted text as generation input can act on hidden instructions a human reviewer would never think to check for (zero-width characters, bidi-override "Trojan Source" characters per CVE-2021-42574, Unicode Tag-block smuggled ASCII payloads). This is why sanitization (Step 4 below) is a hard requirement independent of everything else in this skill, not a nice-to-have.
- **Passage does not always mean enactment.** Pennsylvania constitutional amendments require identical passage in two separate consecutive legislative sessions, never go to the Governor, and only take effect via voter referendum. A generic Part 3/4 template ("if it passes, this becomes law") is factually wrong for that bill type — a direct violation of "no vote without context," since a citizen voting under a false premise about what their vote even means isn't informed at all. This is why Axis C (Step 6 below) is a correctness check, not a style nuance.
- **Supersession is a real, recurring pattern in PA's large backlog, and no LegiScan field flags it.** Three confirmed cases (see `data/uvote-superseded-bills-log.md` in the firstmate home) each had their substantive policy question resolved by a wholly different bill — a budget-placeholder bill superseded by the real budget bill, a stalled Senate bill superseded by a House bill signed into law, a passed chamber bill whose target program was ended by an unrelated budget-deal rider — none mechanically detectable from LegiScan history/status data. A citizen voting on a bill whose real-world outcome was already decided elsewhere isn't casting meaningful advocacy, which is exactly why Step 6.5 makes this check deliberate, run for every bill, rather than something noticed only incidentally.

## Hard contract — read before doing anything else

1. **Grounding is mandatory.** Never draft `summary`/`bill_text` from a bill's title or metadata alone. If real source text can't be extracted (unsupported/corrupt document, unreadable `mime`), **stop, do not generate, and flag the bill for a human.** Do not "do your best" from the title.
2. **Sanitize extracted text before it reaches any generation prompt.** Run every extracted document through `scripts/sanitize.mjs` first — no exceptions, independent of source or perceived trustworthiness.
3. **Output format is fixed by today's shipped frontend, not by this skill's judgment.** `summary` must be the inline `1. ... 2. ... 3. ... 4. ... 5. ...` format, exactly five non-empty sections (the original four-part core plus Part 5, Key Question(s) — see Step 7.5), validated against the *real* parser (`scripts/format_gate.mjs`) before the bill is considered done. No markdown, no bullets, no headers — those remain real future improvements (see "Explicitly out of scope") but require a frontend change this skill does not make. The `[[READ MORE]]`-delimited expandable-detail suffix, rendered by `BillDetailPage.tsx`'s own expand/collapse toggle, is still supported exactly as before (see Step 7's Length rule) — it is not a section and is split off before the five-part parser ever sees it; Key Question(s) is mandatory core content and must never be pushed into it. **Deployment precondition**: do not use this skill to generate real 5-section summaries against production until the frontend parser change in `src/lib/billUtils.ts` (the `[1-5]` regex and `.slice(0, 5)` change that ships in this same PR) has actually been deployed. Before that deploy, the live parser only recognizes `[1-4]` markers — a `5.` marker would not fail loudly, it would be silently absorbed into Part 4's text (the same swallowing behavior a stray `6.` marker has against the shipped 5-section parser today), a silent content bug rather than a visible failure. Confirm the deploy has gone out before running this skill for real.
4. **Never write a `category` value.** The field is dead in the live product (not in any migration, not in the hand-maintained `Database` type, not in the admin form, not read by any frontend code) and is being formally dropped in a separate migration. Do not carry it forward in any output, including the SQL block.
5. **`bill_text` is a hand-written plain-language restatement, grounded in the real extracted source text — never the raw extracted text itself.** Storing full legal text for thousands of PA bills was rejected on database-size grounds; the convention is restatement, project-wide.
6. **`topic` must be explicitly assigned from `BILL_TOPICS` for every bill, every body.** Today `topic` is `null` on every sampled bill in production, Council included — every bill card is rendering off the weaker `TOPIC_RULES` keyword fallback. Explicit assignment is a real, free improvement available immediately.
7. **Write-back is C1 only: emit SQL, never execute it.** This skill must never run a write against Supabase itself, in any mode. Moving to C2 (automated direct write) is gated on two preconditions or bills the captain owns, not on this skill's output looking good — see "Write-back mode" below.
8. **A generated-but-unreviewed bill must not reach a votable state.** Set `status = 'pending_review'` — a real, dedicated `bills.status` value (added via `supabase/migrations/20260815140000_add_bills_status_check_and_pending_review.sql`, enforced by a CHECK constraint) meaning exactly "generated by this skill, not yet reviewed by a human." It is excluded from `isBillVotable` and from `HomeTab`'s default `active`/`passed` feed filters by construction, since it isn't `active` or `passed`. Do not reuse `'tabled'` or invent another ad hoc stand-in — see the SQL template's status handling below.
9. **Every bill must be checked for supersession before the SQL block is emitted.** Has this bill's substantive policy question already been resolved by a genuinely different bill or legislative vehicle (Step 6.5, Axis F)? This is real, deliberate web research run for every bill — not something acted on only if stumbled onto while researching Axis A opposition. A positive finding never blocks or replaces drafting the summary — the full citizen-facing content still gets written — it adds `superseded_at`/`superseded_by`/`superseded_reason` to the SQL template and a log entry, per Step 6.5.

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
| 7 | **Reading load** | Can I actually process this before I vote, across a session where I'm voting on several bills? | Does the summary respect the product's own displayed length target (120–180 words, `BillsTab.tsx`'s Summary field label), or does length quietly trade "informed" for "exhausting"? |
| 8 | **Self-relevance** | Am I in the group this affects? | After reading, can a reader place themselves (or someone they know) in an affected/benefited/burdened group, not just infer that *some* group somewhere is affected? |
| 9 | **Proportionality** | Does this summary's length and gravity match what's actually at stake? | Does a genuinely low-stakes bill (technical correction, uncontested procedural item) get an honestly brief, proportionate treatment rather than padded weight — and does a genuinely high-stakes bill get the space it actually needs rather than being truncated to match a one-size-fits-all target? **Criterion 9 is the tiebreaker over Criterion 7 when they conflict**: never truncate a summary to hit the 120–180 word target if that would cut real, load-bearing content (a genuine dispute, several distinct provisions, a specific dollar/vote figure). For a non-trivial, multi-provision, or contested bill, running well past 180 words while passing Criterion 9 is the *normal*, expected outcome, not a rare exception — score it as a PASS-9/FAIL-7 pair honestly rather than either compressing away real content or reframing the FAIL as a pass. The 120–180 range remains the default target for straightforward bills, not a hard cap. (The shipped `short_description` field is the scannable, at-a-glance version for a reader who doesn't want the full five-part depth on a long summary — this doesn't require any new section or column.) |

## Input contract

The caller (a human, a scheduled dispatch, or a firstmate crewmate task) provides:

- A bill identifier: `legislative_body_id` + `bill_number`, or an existing `bill_id` UUID.
- Available source material: for Philadelphia City Council, a `phila.legistar.com` bill PDF URL (search `https://phila.legistar.com/Legislation.aspx` by bill number if not already known — see "Extraction" below for the real, verified path); for PA House/Senate, a LegiScan `bill_id` (numeric) to call `getBill` against, which in turn drives `getBillText`/`getAmendment`/`getSupplement` per Step 2.

The skill resolves its **own** enrichment tier and content axes from bill metadata during Steps 2–6.5 below — the caller does not need to pre-classify the bill.

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

**PA House/Senate**: call LegiScan's `getBill` (`https://api.legiscan.com/?key=$LEGISCAN_API_KEY&op=getBill&id=<bill_id>`) to get the bill's metadata, its `texts` array (each entry has a `doc_id`, `type`, and `mime`), and its `supplements` array (each entry has a `supplement_id`, `type`, and `mime`). **`LEGISCAN_API_KEY` must be present in the environment** — if it isn't, this is an extraction failure per the hard grounding requirement: stop and flag for a human, do not proceed on metadata alone.

- **Co-sponsorship memorandum**: also check for a PA co-sponsorship memorandum for the bill — PA's legislature publishes these, and it's the sponsor's own filed rationale for introducing the bill, not a third-party summary. When one exists, fetch and sanitize it the same as any other source document (Steps 3-4); it's a direct, primary-source input to the sponsor-statement research in Step 6 below, feeding Axis A/B and, especially, Step 7.5's Key Question(s) drafting.

- **Bill text**: from `texts[]`, prefer the most recent **Amended** entry over **Introduced** when both exist — an amended bill's operative text has changed since introduction, and grounding the summary in a stale as-introduced version would misdescribe what the bill currently does. Call `getBillText` (`op=getBillText&id=<doc_id>`) for the chosen entry. If LegiScan is tracking the amendment as a distinct document rather than a full replacement text, call `getAmendment` (`op=getAmendment&id=<amendment_id>`) instead. Either way, the fetched document goes through the same base64+MIME extraction (Step 3) and sanitization (Step 4) as any other bill text.
- **Fiscal/impact supplement**: from `supplements[]`, check for a fiscal-relevant `type` — **Fiscal Note**, **Analysis**, **Fiscal Note/Analysis**, **Local Mandate**, or **Corrections Impact**. (LegiScan also returns non-fiscal supplement types — Vote Image, Veto Letter, Miscellaneous — which are out of scope here.) When a fiscal-relevant supplement exists, call `getSupplement` (`op=getSupplement&id=<supplement_id>`) to fetch it — the same base64+MIME document pattern as `getBillText`, so it runs through the same extraction (Step 3) and sanitization (Step 4) pipeline. When it contains a specific, substantive figure (a real dollar amount, an affected-party count, a per-unit cost), prefer it over general web research for those Part 3/4 stakes claims (Step 7) — an official fiscal note is a primary source, not an inference (a real strengthening of Criterion 4). **A thin or routine note — a bare "$0 impact" or "indeterminate" with no further detail — does not satisfy the research requirement on its own.** The pilot found this is common for non-appropriations bills: roughly half of Tier 2 bills' fiscal notes carried no usable narrative content, and the real stakes material still had to come from LegiScan's vote/history metadata and general web research, same as before this feature existed — do the same web-research effort Tier 2 bills required either way, and only lean on the fiscal note in place of that research when it actually has something specific to say. Per the hard contract's restate-don't-store rule, never store the raw supplement document — fold its figures into the summary's prose with inline attribution (e.g. "the official fiscal note estimates...") exactly like `bill_text`'s existing restatement convention.

### Step 3 — Extract text, dispatched on `mime`

This dispatch applies uniformly to bill text, amendment documents, and fiscal/impact supplements — LegiScan returns all three as the same base64-encoded-document-plus-`mime` shape, just fetched via different operations (`getBillText`/`getAmendment`/`getSupplement`, see Step 2).

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

**Tier 2 trigger** (bills likely to actually have real coverage worth researching): recorded floor votes, budget/fiscal subject matter, a topic match against `TOPIC_RULES`-style relevance keywords, or — regardless of what the keyword check finds — a real fiscal-relevant supplement attached (Step 2). A bill significant enough to get an official fiscal note is, by definition, worth the extra research effort, so this last trigger always upgrades to Tier 2 even when the keyword-based checks alone wouldn't have caught it. Everything else stays Tier 1 — grounded in the bill's own text and structured metadata only, no web research. This is still strictly better than today's PA baseline (a bare one-line LegiScan description), and honest about what's achievable at PA's ~3,750-bill-per-session scale.

### Step 6 — Resolve the content axes (finalizes what Step 5 started, before drafting Parts 3/4)

These require the same research the summary itself needs, so they're resolved here, per bill, not pre-decided from a title:

- **Primary-sponsor statements (skill-wide, not scoped to one axis).** `primary_sponsor` is treated only as metadata today (a name for the SQL template) — this skill has never researched what the sponsor actually said about *why* they introduced the bill, even though that's a real, direct source for "why this bill exists." Actively search for the primary sponsor's own public statements — press releases, floor/committee remarks, a co-sponsorship memo (Step 2), statements to press — about the problem the bill addresses. This is one input alongside the existing opposition/fiscal-note/general research below, not a replacement for Axis A's balance requirement: a sponsor's own framing never excuses omitting real organized opposition, and Criterion 5 (non-manipulation) still governs how sponsor rationale gets folded into neutral prose. This research feeds Axis A/B directly below, Part 1/2 drafting (Step 7), and especially Step 7.5's Key Question(s) drafting — it applies across the whole skill, not just one step.
- **Axis A — Real opposition.** If organized opposition exists (an advocacy coalition, a named organization's public statement), it belongs specifically in **Part 4**, not stranded in Part 2 as stakeholder color. If no organized opposition was found, Part 4 says so explicitly and honestly ("No significant opposition has been identified in available coverage; the main practical question raised has been [X], not the policy goal itself") — never manufacture a counter-argument for a bill that genuinely doesn't have one (a park renaming does not need invented opposition).
- **Axis B — Actual stakes.** High for major fiscal/contested-policy bills — Part 4 needs to be as substantive as Part 3. Low for genuinely minor procedural/technical bills — and for these, padding the summary to sound weighty is its own rubric failure (Criterion 9), the mirror image of manufacturing opposition.
- **Axis C — What does passage in this vote actually mean? (Correctness check, not style.)** Before drafting Parts 3/4, determine whether passage in this specific chamber vote *is* enactment (the ordinary case for a regular ordinance/bill) or is a procedural step toward something else. **Verified, concrete example**: Pennsylvania constitutional amendments (title pattern: "A Joint Resolution proposing an amendment to the Constitution of the Commonwealth of Pennsylvania...") require identical-language passage in two separate consecutive legislative sessions, never go to the Governor (amendments bypass gubernatorial veto by design), and only take effect via voter referendum. A generic "if it passes, this becomes law" is factually wrong for that bill type. If a bill's title or LegiScan metadata suggests it isn't an ordinary up-or-down enactment vote, verify the actual mechanism (web search against a source like Spotlight PA, WHYY, or Ballotpedia for PA-specific procedural questions) before writing Part 3/4 — do not assume the ordinary case.
- **Axis D — Realistic path to a vote.** Only state directly checkable procedural facts (no committee action since introduction, session nearing its end) if used at all. Never predict whether a bill will pass — that's a one-sided judgment call the platform's non-partisan-by-architecture principle exists to prevent.
- **Axis E — Time pressure.** Council's `passed_by_suspension` field is already surfaced to citizens today (`BillDetailPage.tsx`) as a real signal about *how* a bill passed, not just what it does. Extend the same instinct to noting an unusually fast timeline generally, as neutral context, never editorializing.

Do not build a new fixed bill-type taxonomy or persist these axes as a schema column — they're generation-time judgment, re-resolved per bill, the same category of mistake `category` already was if made permanent.

### Step 6.5 — Check for supersession (Axis F)

Before drafting Parts 3/4, deliberately check: has this bill's substantive policy question already been resolved by a different bill or legislative vehicle? This is real, targeted web research, run for every bill — not something acted on only if it happens to surface while researching Axis A opposition (the research method is similar — general web search — but the question is different and needs its own deliberate pass). **LegiScan's own history/status fields cannot answer this** — none of the three confirmed cases below were mechanically detectable from LegiScan data; the resolving vehicle is, by definition, a different bill number LegiScan won't cross-reference for you.

**Working definition (captain-confirmed, use exactly this):** A bill is superseded when its practical policy question has already been resolved — enacted or foreclosed — by a separate bill or legislative vehicle, such that the original bill's own passage or failure no longer changes the real-world outcome. **This is never a single bill progressing normally through its own House-to-Senate-to-Governor path under one bill number** — that's just a bill succeeding, and remains the most relevant bill to show a citizen. Only a genuinely different bill number or vehicle accomplishing the same substantive outcome counts.

**Calibration — three confirmed cases** (full detail and the source of this table format: `data/uvote-superseded-bills-log.md` in the firstmate home):

| Bill | What happened to it | What actually mooted it |
|---|---|---|
| SB1000 (Senate) | Budget placeholder, funding one line item, never advanced past committee referral | PA's real 2025-26 budget was enacted through **SB160** — a different Senate bill, same chamber |
| SB153 (Senate) | Passed committee (7-4, then 29-20), referred onward, inactive since Jan 2025 | Its substantive policy became law via **HB274 (Act 55 of 2025)** — a different bill, House-originated |
| SB186 (Senate) | Actually passed the Senate 31-18, awaiting House action, tied up in pending litigation | The program it targets (RGGI) was independently ended through **separate legislation folded into the Nov. 2025 state budget deal** |

Note the range: supersession isn't limited to bills that stalled — SB186 genuinely passed its own chamber and is, per the definition above, still potentially superseded by something else entirely, decoupled from how far the bill itself progressed.

**How to check**: search for the bill's actual subject matter plus "Pennsylvania" and terms like "enacted," "signed into law," "Act," "budget deal," or the specific program/agency name — not just the bill number (the whole point is that the resolving vehicle carries a different number). Give particular scrutiny to: budget-placeholder bills (a single line item, introduced early in a budget cycle, meant to be filled in by amendment later); any bill whose subject is also touched by an omnibus or state-budget deal; and a same-subject bill sitting inactive in one chamber while a related bill is actively moving in the other.

**If positive:**
- Still draft the full five-part `summary`, `bill_text`, `topic`, and `short_description` exactly as normal — the finding adds information, it never replaces or skips the citizen-facing content. It stays captured, not discarded.
- Set `superseded_at = now()`, `superseded_by = '<citation>'` (e.g. `'SB160'`, `'HB274 (Act 55 of 2025)'`, or a general citation like `'Nov. 2025 state budget agreement'` when there's no single clean bill number), and `superseded_reason = '<freeform explanation>'` in the SQL template (Step 12).
- Immediately after the Step 13 self-report, output the finding using the exact same table + reasoning-paragraph format as the calibration table above and `data/uvote-superseded-bills-log.md`: a two-column table (bill / what happened to it / what actually mooted it) followed by a short prose paragraph giving the full reasoning.
- Append that same entry, matching every existing entry's exact structure in `/Users/ianparnell/firstmate/data/uvote-superseded-bills-log.md` — an `## <bill number> (<body>)` heading, the table, the prose paragraph, a `Source:` line citing where the finding came from, and a trailing `---` — placed above the file's `<!-- Append new entries above this line -->` marker. This file lives in the firstmate home, not this repo — that is expected, not a mistake.

**If negative** (the ordinary case): note `Supersession check: not superseded` in the self-report and leave `superseded_at`/`superseded_by`/`superseded_reason` NULL in the SQL template. A bill still working through its own normal chamber-to-chamber path, however far along, is not superseded.

### Step 7 — Draft Parts 1-4 of the `summary`

Grade 8 reading level, plain prose, no markdown/bullets/headers (the renderer displays `section.text` as a literal React text child — markdown syntax would show as literal asterisks/dashes on screen). Authoring rules, all enforced here:

- **Part 1 (What this bill does)**: the concrete mechanism, not an abstraction. For a bill with multiple discrete provisions, use inline enumeration within the plain-string format — real production `bill_text` already does this informally ("(a) 24-hour on-site security guard... (b) HD video surveillance... (c) key-controlled exterior door access"): "This bill does three things: first...; second...; third..." is available today with zero frontend changes.
- **Part 2 (Who it affects)**: beneficiaries, burden-bearers, and scale where researchable. Any organized opposition's *existence* can be mentioned here, but its actual argument belongs in Part 4 (Axis A).
- **Part 3 (If it passes)**: the concrete real-world outcome — respecting Axis C's determination of what "passes" actually means for this bill. For an already-passed bill, past tense, reflecting the actual outcome. **Every bill's Part 3 must also include a short, concrete clause naming when the bill would take effect, stated relative to passage/enactment** (e.g. "immediately upon the Mayor's signature," "60 days after becoming law," "the start of the next fiscal year," or a specific date the bill itself names) — this is not conditional on bill type; every bill gets the clause, only its content varies. Ground it in this priority order:
  1. **The bill's own text, if it states an explicit effective-date/enactment clause** — use that directly. Philadelphia Council ordinances routinely carry one of these as their own final section (the single most common boilerplate is "This Ordinance shall become effective immediately," but a specific day count — e.g. "ninety (90) days after enactment" — or a named date also appears); PA bill text sometimes carries an explicit effective-date section too. Prefer the bill's own stated language over either default below whenever it's present.
  2. **Otherwise, the verified statutory default for the bill's own legislative body** (do not re-derive these — verified against primary sources for this skill):
     - **PA House/Senate**: absent a stated effective date, a Pennsylvania statute takes effect **60 days after final enactment** (1 Pa.C.S. § 1701, the Statutory Construction Act of 1972) — *except* appropriation statutes or statutes affecting a political subdivision's budget, which take effect **the following July 1 (the start of PA's fiscal year), or immediately if enacted after July 1** (1 Pa.C.S. § 1702).
     - **Philadelphia City Council**: absent a stated effective date, an ordinance takes effect **on the date the Mayor signs it** — or, if the Mayor neither signs nor vetoes it by Council's next scheduled meeting held at least ten days after presentment, **automatically on that date as if the Mayor had signed it** (Philadelphia Home Rule Charter § 2-202). An ordinance passed over a mayoral veto takes effect on the date of the override vote, absent a stated date.
  3. **Stay consistent with Axis C's own finding (Step 6).** For a bill where ordinary passage isn't the same as enactment — most concretely, a PA constitutional amendment, which never goes to the Governor and only takes effect via a subsequent voter referendum after identical second-session passage — the effective-date clause must describe what happens after that actual triggering event (the referendum), never imply this vote alone puts the bill into effect.

  A good, natural default is to place this clause at the end of Part 3's text, after the real-world-outcome description — it then reads as a closing detail rather than interrupting the outcome description. This is a default, not a mandated fixed position; write it wherever it reads most naturally for a given bill.
- **Part 4 (If it doesn't pass)**: per Axis A/B — the single strongest bill-specific argument against passage, with comparable specificity to Part 3, or an explicit honest "no significant opposition identified" for bills that genuinely have none. Never generic "status quo continues" filler when a real counter-argument exists in the source material.
- **Jargon**: gloss any term of art inline the first time it's used. Real positive example already in production: "floor area ratio bonus... meaning they can build more square footage." Real negative example to avoid: using "Class II offense" or "Class III offense" with no dollar/consequence translation anywhere in the summary.
- **Grounding vs. inference (Criterion 4)**: where a claim is the writer's researched inference rather than a bill-text fact, attribute it inline with different confidence than a bill-text fact ("suggesting potential alignment with..." / "a March 2026 report found...") rather than stating it with the same unhedged confidence as what the bill itself says.
- **Length**: 120–180 words is the soft target for Parts 1–4 specifically (matches `BillsTab.tsx`'s own displayed guidance) — Part 5 (Key Question(s), drafted next in Step 7.5) is additional mandatory core content layered on top and is deliberately excluded from this word-count target (see `format_gate.mjs`'s scoping). The five-part core as a whole must satisfy all 9 rubric criteria; a citizen who reads only the core must still come away genuinely informed.
- **Expandable detail (`[[READ MORE]]`)**: for a genuinely complex or contested bill (multi-provision appropriations, itemized line items, extended sourcing/attribution, real two-sided opposition with more than one citable position) where the honest mechanism/distributional information doesn't fit Parts 1-4's soft target, do not inflate them to absorb it. Instead, once the full five-part core (Parts 1-4 plus Step 7.5's Key Question(s)) is complete, append the literal marker `[[READ MORE]]` followed by the supplementary detail as plain prose (`BillDetailPage.tsx` renders this behind its own expand/collapse toggle, split off before the five-part parser ever sees it — see `splitSummaryCoreAndDetail` in `src/lib/billUtils.ts`). What belongs in the core versus in expandable detail follows Step 6's axes: the core mechanism (Part 1) and the single strongest counter-argument (Part 4, Axis A) always go in the core; itemized appropriations lines, the long tail of stakeholder detail, and extended source attribution belong in expandable detail. Most bills — anything genuinely simple — need no `[[READ MORE]]` suffix at all; do not add one just to pad a bill that doesn't need it (Criterion 9 again). Never place the marker inside a section's text or before Part 5 — it must come only after the complete, well-formed five-part core.
- For a genuinely simple bill with nothing that warrants expandable detail, a shorter-than-180-word Parts-1-4 block with no `[[READ MORE]]` suffix at all is the correct, honest output — do not manufacture a "More detail" toggle a citizen would tap into and find nothing of substance.
- If Parts 1-4 themselves, on their own, are complex enough that dropping content to hit 180 words would cut real mechanism/distributional information (and moving that content to expandable detail genuinely isn't appropriate — e.g. it's core-level material, not supplementary), letting them run over the soft target remains acceptable, same as before this convention existed. This is Criterion 9 overriding Criterion 7 by design (see the rubric above).
- **Avoid vote-tally phrasing that looks like a section marker**: never write a committee/floor vote as `8 to 3.` (or any `N. ` for N = 1–5) in the summary prose — `parseSummaryIntoSections`'s inline regex treats a bare `N. ` anywhere in the text as a Part-boundary marker, so `3.` gets misread as the start of Part 3 and silently truncates the real content after it. Write it as `8-3` (hyphen, no trailing period) instead. This exact bug was caught by the format gate in the pilot batch (`SB10`) and required a regeneration — catch it before Step 10, not after.

### Step 7.5 — Draft `Key Question(s)` (Part 5, mandatory core content)

Not a recap of facts already stated in Parts 1-4. Key Question(s) distills the bill down to the actual judgment call(s) a citizen needs to answer to reach a position — the reasoning fork the bill creates, grounded in why the bill exists and the issue it's trying to solve (this is exactly where the sponsor-statement research from Step 6 pays off — a sponsor's own stated rationale is often the clearest signal of what the real fork actually is). Renders as the 5th and final section, after "If it doesn't pass" — a synthesis step that only makes sense once the reader already has the mechanism, stakeholders, and both sides' stakes in hand from Parts 1-4.

A concrete, checkable procedure, mirroring the 9-criterion rubric's "concrete test, not a value statement" style:

1. **Enumerate every distinct axis of judgment the bill's *actual* content presents**, drawn from what Steps 6/7 already resolved — do not invent axes that aren't really there. Candidate axes: the core mechanism tradeoff; asymmetric winners/burden-bearers (Part 2); the strongest real counterargument (Part 4/Axis A, only when one genuinely exists); each materially separate provision for a multi-provision bill (Part 1's enumeration); any Axis C procedural nuance that changes what a "yes" vote actually accomplishes (e.g. a constitutional amendment needing a second passage).
2. **Draft one question** covering the single most load-bearing axis.
3. **Self-grade scope coverage**: `(axes a drafted question forces the reader to weigh) / (axes identified in step 1) × 10`. This is a distinct check from the 9-criterion rubric — it grades coverage of the question set, not summary readability.
4. **If under 10/10**, add exactly one more question addressing a genuinely distinct uncovered axis (never a reworded restatement of an existing question) and re-grade. Repeat until 10/10.
5. **Hard ceiling: 5 questions. Typical case: 1-2.** A genuinely simple bill legitimately reaching 10/10 on one question is the expected, correct outcome — padding a simple bill with extra questions is the same Criterion-9-style failure as padding prose.
6. **Neutrality constraint** (extends Criterion 5 to this section): no leading/rhetorical phrasing; where the bill has genuine two-sided disagreement, phrase the question so a reasonable supporter and a reasonable opponent would both see it as a fair framing of what's actually contested.
7. **Anti-pattern**: a question must be a judgment call, not a comprehension check — "What does this bill do?" restates Part 1 and does not belong here.

Same format rules as Parts 1-4 apply: Grade 8 reading level, plain prose, no markdown/bullets/headers, jargon glossed inline. Each question must be an actual question (contains a literal `?`) — `format_gate.mjs` warns if Section 5 has zero `?` (malformed) or more than 5 (ceiling violation).

### Step 7.6 — Write `short_description`

A short, plain-English, one-sentence description of what the bill does. No fixed word cap, but it must genuinely read as one sentence, not a second summary — if it needs more than a sentence to say what the bill does, that content belongs in Part 1 above, not here. This is distinct from Part 1 of the five-part `summary`: Part 1 is grounded in the full rubric/format contract (jargon glossed inline, multi-provision enumeration where needed, scored against Criterion 1 as part of the five-part structure); `short_description` is closer to what a citizen skimming a list of bills would want to read at a glance before tapping in for the full summary. Draft it fresh from the same grounded understanding of the bill used for Part 1 — do not derive it by truncating Part 1's text, since a mechanically cut-off sentence reads as clipped, not as a considered one-liner.

### Step 8 — Write `bill_text`

A hand-written plain-language restatement of the bill's real operative provisions — grounded in the sanitized extracted text, never a copy of it. Enumerate distinct provisions where the bill has them (matching the existing informal convention already in production).

### Step 9 — Assign `topic`

Pick exactly one value from `BILL_TOPICS` (`src/lib/billUtils.ts`): `Housing`, `Public Safety`, `Budget`, `Education`, `Infrastructure`, `Transportation`, `Health`, `Environment`, `Economic Development`, `Government Operations`, `Other`. Base this on the bill's actual subject matter as understood from the real source text — do this for every bill, every body; do not leave it null and rely on the `TOPIC_RULES` keyword fallback, which is strictly weaker (title/summary keyword matching only, no real subject-matter judgment).

### Step 10 — Run the format gate

```bash
node --experimental-strip-types .claude/skills/generate-bill-summary/scripts/format_gate.mjs "$SUMMARY_TEXT"
```

This imports and runs the **real** `parseSummaryIntoSections` (and `splitSummaryCoreAndDetail`) from `src/lib/billUtils.ts` directly (Node 22's `--experimental-strip-types` loads the `.ts` file with no build step) — it is never a re-description of the parser's behavior, it *is* the parser's behavior. If a `[[READ MORE]]` suffix is present, the gate splits it off first and validates only the mandatory core (the frontend does the same split before parsing — see Step 7's Length rule) — `hasDetail`/`detailWordCount` in the gate's output report the expandable detail, if any, separately. Exit code 0 + `"pass": true` means exactly five non-empty core sections (Parts 1-4 plus Step 7.5's Key Question(s)). The gate also warns (without failing) if Section 5 has zero `?` or more than 5. If it fails: **regenerate once.** If it still fails: stop, flag for a human, do not write SQL for this bill.

### Step 11 — Self-check against the rubric

Score all 9 criteria explicitly (pass/fail + one line of reasoning each) against the drafted `summary`. Any failing criterion either gets fixed and re-gated (back to Step 10), or — if fixing it would require information genuinely not available in the source material — gets flagged in the self-report rather than silently shipped.

### Step 12 — Emit the SQL upsert block (never execute it)

Use the template below. Present it to the human reviewer; do not run it.

### Step 13 — Produce the self-report

Alongside the SQL block, output:

```
Bill: <legislative_body_id short name> <bill_number> — <title>
Format gate: PASS | FAIL (regenerated: yes/no)
Parts 1-4 word count: <n> (target 120–180; note if intentionally outside range and why)
Expandable detail: none | <n> words — <one line on what it holds and why it's not in the core>
Sources cited: <list of named sources actually used, or "none — Tier 1, grounded in bill text + metadata only">
Extraction: <mime type, method used, sanitize.mjs findings if any>
Axis C check: <ordinary enactment | procedural exception found: <what and why> | not applicable>
Supersession check (Step 6.5): not superseded | SUPERSEDED — see table below
Key question(s) coverage: <n> questions, scope grade 10/10 — <axes covered>
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
  bill_number, title, summary, bill_text, topic, short_description,
  introduced_date, status, primary_sponsor,
  legislative_body_id, superseded_at, superseded_by, superseded_reason
)
VALUES (
  '[bill_number]',
  '[title]',
  '[summary — five-part inline plain prose, including Key Question(s)]',
  '[bill_text — plain-language restatement, not raw extracted text]',
  '[one of BILL_TOPICS]',
  '[short_description — one plain-English sentence]',
  '[introduced_date as YYYY-MM-DD, or NULL if unknown]',
  'pending_review',  -- see status note below
  '[Councilmember Name | Parker Administration | NULL]',
  '[legislative_body_id from the table above]',
  NULL,  -- superseded_at — NULL unless Step 6.5 found supersession, then now()
  NULL,  -- superseded_by — citation, e.g. 'SB160', only when superseded_at is set
  NULL   -- superseded_reason — freeform explanation, only when superseded_at is set
)
ON CONFLICT (legislative_body_id, bill_number) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  bill_text = EXCLUDED.bill_text,
  topic = EXCLUDED.topic,
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  primary_sponsor = EXCLUDED.primary_sponsor;
  -- introduced_date is intentionally excluded from DO UPDATE SET when
  -- already set in the DB from a prior session — a Certified Copy PDF does
  -- not repeat the intro date, so overwriting it with NULL would be
  -- destructive. Only include introduced_date in DO UPDATE SET when this
  -- run's source genuinely shows it and you are confident in the value.
  -- superseded_at/superseded_by/superseded_reason are excluded from DO
  -- UPDATE SET for the same reason: a prior run of this skill, or the
  -- separate retroactive backlog scout, may have already determined this
  -- bill is superseded, and blindly overwriting with this run's NULL would
  -- silently un-supersede it. Only add these three columns to DO UPDATE SET
  -- when Step 6.5 found supersession this run, or when intentionally
  -- reversing a prior determination with the caller's confirmation.
```

**Notes for the human running this:**

- **`ON CONFLICT (legislative_body_id, bill_number)` requires migration A7** (`deployment-package.md` Part A7, dropping the undocumented global `bills_bill_number_key` and adding `UNIQUE (legislative_body_id, bill_number)`). As of this skill's construction, A7's own deployment doc states production had not yet had it applied, and it is not present in this repo's `supabase/migrations/`. **Confirm A7 is applied before running this block** — if it isn't, Postgres will reject the statement with `no unique or exclusion constraint matching the ON CONFLICT specification`, which is the signal to apply A7 first, not to fall back to the old `bill_number`-only conflict target (that constraint is the wrong shape — see A7's own rationale).
- **No `category` column appears above, deliberately** — see the hard contract.
- **`short_description` requires migration `20260815130000_add_bills_short_description.sql`** to be applied before running this block, same as any other column this skill writes. It's nullable, so a bill upserted before that migration lands just gets `short_description = NULL` and `BillCard.tsx` falls back to its existing derived-preview behavior — this is a safe ordering mistake, not a destructive one, but confirm the column exists first to avoid a wasted regeneration.
- **A 5-section `summary` (with Key Question(s), Step 7.5) requires the `src/lib/billUtils.ts` parser change in this same PR to have actually been deployed** — unlike `short_description`'s nullable-column safety, this is not a safe ordering mistake. Before that deploy, the live `parseSummaryIntoSections` only recognizes `[1-4]` markers, so a `5.` marker in a `summary` written against pre-deploy production would be silently absorbed into Part 4's text rather than rejected — a silent content bug, not a loud failure. Confirm the deploy has shipped before running this skill to generate real 5-section summaries.
- **`superseded_at`/`superseded_by`/`superseded_reason` require migration `20260817090000_add_bills_superseded_and_vote_gate.sql`.** All three are nullable and NULL by default, matching a bill whose policy question hasn't been superseded — see Step 6.5 for when to set them, and its note on why they're excluded from `DO UPDATE SET` by default.
- **`district_id`** is a real, live column on `bills` (confirmed directly against production) but is essentially unused today (2 non-null rows across the entire table at time of writing) and is not addressed by any of the captain's four resolved decisions or by this skill's authorized scope. This skill deliberately does not assign it. If district-specific bill targeting becomes a priority, that's a separate scoped decision, not something to bolt onto this skill's output silently.
- **Status and the review gate**: use `status = 'pending_review'` for every bill this skill drafts — a real, dedicated value (added via `supabase/migrations/20260815140000_add_bills_status_check_and_pending_review.sql`, CHECK-constrained alongside `active | passed | failed | tabled`) meaning "generated, not yet human-reviewed." It is excluded from `isBillVotable` and from `HomeTab`'s default `active`/`passed` feed filters by construction. Do not reuse `'tabled'` (factually wrong for a bill that isn't actually tabled) or invent another ad hoc placeholder. **Re-run/update caveat**: if the `bill_id` already exists in the DB (e.g. `legiscan-sync` already created the row with `status = 'active'`), running this upsert will downgrade its live status to `pending_review` — correct per the hard contract, but the human reviewer must restore the bill's true status (and re-check `reported_from_committee_at`-gated votability, which this skill does not touch) after approving the content, not leave it at `pending_review` indefinitely.

## Write-back mode: why C1, and what would change it

This skill only ever emits SQL — it never calls Supabase to write. This is the captain-approved architecture decision (Option C generation engine, C1 write-back, `decision-architecture-choice.md`), and it stays that way **indefinitely**, gated on two concrete preconditions rather than a timer:

1. A rubric-scored (not casual-skim) review track record — real Council summaries already showed that an unaided human skim misses real structural gaps (the Part 3/4 imbalance above) in bills that read smoothly. C2 is only on the table once the self-report's rubric scoring has a demonstrated track record, not once output "looks fine."
2. Extraction sanitization built and independently verified — done in this skill (`scripts/sanitize.mjs`), but the precondition is about the *human relying on C1's review step no longer being the last line of defense against document-borne injection*, which is a bigger bar than "the script exists."

Neither precondition is this skill's call to declare met. If asked to write directly to Supabase, decline and point back to this section.

## Explicitly out of scope

- **Bill discovery/ingestion.** Council stays human-initiated (`phila.gov`/Legistar was deliberately not made into an automated scraper — see `current-manual-process.md`). PA stays `legiscan-sync`'s existing job. This skill only generates content for a bill identifier it's given.
- **The `category` column drop migration.** A separate, already-decided follow-up (`decision-category-field-fate.md`) — do not bundle a schema migration into a run of this skill.
- **Any further frontend change** — markdown rendering, per-bill-type `BillCard` styling. Expand/collapse progressive disclosure (report `§19`–`§21` item 3) is shipped (`BillDetailPage.tsx`'s `[[READ MORE]]`-driven toggle, see Step 7/Step 10 above), and the Key Question(s) 5th section (report `§19`–`§22`'s "Sourcing & Confidence" recommendation's sibling, decided as its own captain-scoped feature rather than living inside the expandable-detail area) is now shipped too — see Step 7.5 and the parser change (`[1-4]` → `[1-5]`, both `.slice(0, 4)` → `.slice(0, 5)` caps) in `src/lib/billUtils.ts`. A future "Sourcing & Confidence" section remains out of scope — it would most naturally live as its own labeled block inside the expandable-detail area rather than as a real 6th `SECTION_LABELS`-equivalent entry, but building that is still a separate, scoped, not-yet-authorized change.
- **`district_id` assignment** — see the SQL template note above.
