# BillTrack50 Deep Dive: Cost, API, and Comparison to LegiScan

**Purpose:** BillTrack50 appears in `competitive-landscape.md` as a professional/lobbyist-oriented legislative tracking tool, not a citizen-facing competitor. This document goes one level deeper on a different question: could BillTrack50 be a viable **data source** for UVote's bill/vote pipeline (an alternative or complement to LegiScan, which `/Users/ianparnell/firstmate/data/uvote-pa-bills-plan/report.md` recommends as the primary source for the PA House/Senate expansion)?

All facts below were fetched directly from BillTrack50's own pricing and API-documentation pages on 2026-08-04 (not paraphrased from search snippets), except where explicitly marked otherwise.

---

## Cost: pricing tiers

Source: [billtrack50.com/info/pricing](https://www.billtrack50.com/info/pricing), fetched directly.

### Free tier: "Citizen"

> "Yes, our Citizen tier is free - just sign up. The Citizen tier allows you to search legislation in current sessions from all 50 states, D.C. and Congress and read the bills. You can also search all current legislators across the country and see the bills they have sponsored and their voting record. Finally, you can search for committees across the country and see the membership and bills in the committee. It also includes some AI tools such as bill summaries and the similar bills feature. **It DOES NOT allow you to save and track legislation, get alerts, use our sharing tools, or create legislator scorecards.**"

Critically for a data-pipeline use case: the free tier is a **search-and-read UI feature**, not an API entitlement. The API is documented separately as a paid-subscriber benefit (see Technical Integration section below) — there is no evidence the Citizen tier includes API access at all.

### Paid tiers (exact pricing, from the live pricing table)

| Product | Per state or Congress | All states + Congress/Federal (max) |
|---|---|---|
| **Legislation tracking** — annual | $1,000/year | $5,000/year |
| **Legislation tracking** — monthly | $84/month | $420/month |
| **Regulation tracking** — annual | $500/year | $2,500/year |
| **Regulation tracking** — monthly | $42/month | $210/month |

Direct quote confirming the incremental structure:
> "Single-state legislation tracking starts at $1,000/year or $84/month. Each additional state costs $1,000/year until you reach the maximum of $5,000 which is the cost for the full national tracking service."

All paid subscriptions include: search + save bills, search legislators/committees, daily email alerts, collaboration tools, embeddable website tools, custom reports, mobile app push alerts, and legislator scorecards. Billing is annual-only in structure (paid either monthly or in a lump sum) — **partial-year subscriptions are not available**, and there is no discount for nonprofits, government agencies, or startups: *"We keep our pricing low for everyone; we don't offer special pricing for certain organizations."* A 30-day free trial is offered with no credit card required.

---

## Technical integration: API and data access

Source: [billtrack50.com/documentation/webservices](https://www.billtrack50.com/documentation/webservices), fetched directly.

### Access model

The API is explicitly gated behind a **paid company subscription**, not the free Citizen tier:
> "This is a service to our paying subscribers to provide legislative searching directly into their applications, and websites."

Access requires an `apikey`, requested through BillTrack50's contact form, tied to a company account (not a per-user key), sent via an `Authorization: apikey $API_KEY` header over HTTPS. It is a REST API returning JSON.

### Rate limits

> "The service will only allow **5 requests per second**, and a maximum of **5,000 requests per 24-hour period**." Exceeding either returns HTTP 429.

This is meaningfully tighter than LegiScan's documented free-tier allowance of 30,000 queries/month (per the PA bills plan report, sourced from LegiScan's API User Manual PDF) — roughly comparable on a daily basis (5,000/day here vs. LegiScan's ~1,000/day average budget) but with no equivalent free tier at all: BillTrack50's 5,000-requests/24hr limit only applies once you are already a paying subscriber.

### What data UVote would actually get

The documented REST endpoints cover the same core entities UVote's schema needs:

- **`/sessions/{stateCode}`** — legislative sessions per state, with `currentSession` flag.
- **`/bills`** and **`/bills/{billID}`** — bill search and detail: `billName`, `summary` (state-provided) and `aiSummary` (BillTrack50-generated), `sponsors`, `sponsorCount`, `billProgress` (Introduced / In Committee / Crossed Over / Passed / Dead / Vetoed / Veto Override / Signed-Adopted-Enacted), `passedFlag`, `lastAction`/`actionDate`, `versions`, `votes` count, `changes` count (for incremental sync), `officialDocument` (link to the state's own bill page).
- **`/bills/{billID}/votes`** — per-roll-call **aggregate** counts only (`yesVotes`, `noVotes`, `absentVotes`, `abstainVotes`, `motion`, `voteDate`) — not individual legislator votes at this endpoint.
- **`/votes/{voteID}`** — the individual-legislator breakdown, nested one level deeper: a `legislatorVotes` array of `{legislatorID, name, party, district, vote}` (vote is "Yea, Nay, Absent or Abstain"). **This is the endpoint that maps directly onto UVote's `rep_votes` table** — functionally equivalent in shape to LegiScan's `getRollCall` response described in the PA bills plan.
- **`/bills/{billID}/action-history`** and **`/bills/{billID}/events`** — action/status history and hearing/event schedule.
- **`/legislators`** — search by name and state, returning role (e.g., "State Senator"/"State Representative") and state.

**Verdict on data richness:** functionally comparable to LegiScan for UVote's actual needs (bill text/status/sponsors/roll-call votes by individual legislator). Neither API's public documentation, as fetched, exposes full bill text as base64 documents the way LegiScan's `getBill` does (per the PA bills plan) — BillTrack50's bill detail response was not fully enumerated in this pass, but the AI-generated `aiSummary` field suggests full text is processed server-side even if the raw text isn't the primary API payload; this would need a follow-up call to confirm before relying on it for UVote's plain-language-summary pipeline.

### Licensing terms for a consumer product (the open question)

The API documentation contains one directly relevant restriction:
> "**Commercial Usage**: This is a service to our paying subscribers to provide legislative searching directly into their applications, and websites. **Selling the legislative data to a third party is not allowed** and a violation of our usage guidelines. If you are unsure if your service qualifies as selling data, or if you want to discuss a commercial usage partnership, please contact us for more information."

This is the same category of open question already flagged as a captain decision for LegiScan in the PA bills plan (`uvote-pa-bills-plan-decision-legiscan-commercial-tos`): UVote is a for-profit product with paid tiers, built in part on redistributed legislative data. Whether powering UVote's bill feed and vote comparisons counts as "selling the legislative data to a third party" under BillTrack50's guidelines is not resolved by the public documentation — it would need a direct conversation with BillTrack50 before this could become a system of record, exactly as recommended for LegiScan's ToS.

Local caching is explicitly permitted for up to 24 hours: *"Information retrieved from the web service can be stored and cached for a period of 24 hours."* (LegiScan's Local Storage terms were not independently re-verified in this pass; treat as a separate open item if BillTrack50 is pursued further.)

---

## Coverage scope: state-by-state vs. bundled

Confirmed directly from the pricing FAQ:
> "What states does BillTrack50 cover? For bills, we cover all 50 states, **DC City Council**, and Congress with historical data back to 2011. For regulations, we cover all 50 states and federal. Our regulation data is from 2024 onwards."

Pricing is **per-jurisdiction, not one flat national plan**: each state (or "Congress," billed the same as a state) costs $1,000/year individually, capping at $5,000/year once five or more jurisdictions are purchased — at which point it functions as an "All States and Congress" bundle. There is no smaller bundle between single-state and the $5,000 full-national tier.

**Municipal coverage — the disqualifying gap for UVote specifically:** BillTrack50's own coverage statement names only "all 50 states, DC City Council, and Congress." **Philadelphia City Council is not listed, and no evidence was found anywhere on BillTrack50's site of coverage for any municipal legislative body other than DC's (which functions as a state-equivalent for BillTrack50's purposes, not as a general municipal-tracking capability).** This means BillTrack50 could, at best, only ever serve UVote's **PA House + PA Senate** data needs — never Philadelphia City Council, which is UVote's current, anchor legislative body. LegiScan's own coverage (per the PA bills plan) is the same "50 states + DC + Congress" scope, so this is not a LegiScan-specific weakness relative to BillTrack50; it simply means neither vendor solves UVote's municipal-level data problem, and that gap must continue to be solved the way it is today — hand-entry through the existing admin tooling (`src/pages/admin/BillsTab.tsx`, `DistrictsRepsTab.tsx`, `RepVotesTab.tsx`), as the PA bills plan already assumes.

---

## Pricing Comparison: BillTrack50 vs. LegiScan

| | BillTrack50 | LegiScan |
|---|---|---|
| **Free tier exists?** | Yes ("Citizen") — search/read only, **no API access, no save/track, no alerts** | Yes — full Pull API access, **30,000 queries/month**, mirrors the "OneVote" public tracking service |
| **Cost to get PA House + PA Senate via API** | $1,000/year minimum (must subscribe just to receive an `apikey` at all) | $0 — fits well within the free tier per the PA bills plan's sync-cadence math (~1,440 queries/month for change-detection polling alone, leaving ~28,000/month headroom) |
| **Cost for full national (all 50 states + Congress)** | $5,000/year (annual) or $420/month | Not applicable in the same way — the free Pull API tier is quota-based (30,000 queries/month), not jurisdiction-gated; a paid **Push API** (real-time webhook delivery, 15 min–4 hr) exists as an upgrade path, but no public price for it was located in this or the prior research pass |
| **Municipal (Philadelphia City Council) coverage** | No | No |
| **Individual legislator roll-call votes** | Yes, via `/votes/{voteID}` → `legislatorVotes[]` | Yes, via `getRollCall` |
| **Rate limit (paid tier)** | 5 req/sec, 5,000 req/24hr | 30,000 queries/month (free tier) |
| **Commercial redistribution restriction** | "Selling the legislative data to a third party is not allowed" — unresolved how this applies to a for-profit consumer product | ToS text itself returned HTTP 403 to automated fetch in the PA bills plan's research; marketing copy states the API "can be used to power commercial and public product offerings," but the actual ToS was never read — also unresolved |

---

## Recommendation

**BillTrack50 is not a viable primary alternative to LegiScan for UVote, and is a weak complement at best.** The core problem is economic and structural, not data quality: BillTrack50's roll-call vote data (via `/votes/{voteID}`) is genuinely comparable in shape to LegiScan's `getRollCall`, so there's no technical reason to prefer LegiScan on data richness alone — but BillTrack50 requires a minimum **$1,000/year paid subscription just to receive API credentials at all**, while LegiScan's free Pull API tier (30,000 queries/month) already comfortably covers the PA House + PA Senate sync volume the PA bills plan projects, at zero cost. Neither vendor covers Philadelphia City Council, so BillTrack50 could never replace the hand-entry admin workflow UVote already uses for its anchor legislative body — it could only ever be a paid alternative for the PA-state layer specifically, where LegiScan is already free. The one scenario where BillTrack50 is worth revisiting is as a **paid cross-check/QA source** once UVote has revenue to spend and wants a second data vendor to catch LegiScan sync errors — not as a day-one dependency, and not before the same commercial-licensing question already flagged for LegiScan (can this data legally power a for-profit consumer product?) is separately resolved with BillTrack50 directly, since its own documentation raises an equivalent, unresolved "selling the data to a third party" restriction.

---

## Sources

- [BillTrack50 Pricing](https://www.billtrack50.com/info/pricing) — fetched directly 2026-08-04; Citizen tier scope, exact per-state/national pricing table, FAQ on coverage and billing terms.
- [BillTrack50 Web Services API Documentation](https://www.billtrack50.com/documentation/webservices) — fetched directly 2026-08-04; access model, rate limits, commercial-usage restriction, endpoint schemas (`/sessions`, `/bills`, `/bills/{billID}`, `/bills/{billID}/votes`, `/votes/{voteID}`, `/bills/{billID}/action-history`, `/bills/{billID}/events`, `/legislators`).
- `/Users/ianparnell/firstmate/data/uvote-pa-bills-plan/report.md` — LegiScan free-tier figures (30,000 queries/month), sync-cadence math, and the unresolved LegiScan commercial-ToS question, cited here for direct comparison.
