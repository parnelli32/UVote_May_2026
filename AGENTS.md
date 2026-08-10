## About This Project

### What UVote Is

UVote is a private, for-profit civic technology company that adds a missing layer to how citizens engage with the legislative process: a continuous, bill-specific, and aggregated record of constituent sentiment that can be compared directly against how their representative actually voted, across every level of government that represents them, from city council to the state legislature to Congress. Citizens vote on active legislation in their district, and by doing so, make their opinion known in a way that is inherently a form of advocacy, one that is documented, timestamped, and impossible for a representative to claim they never heard. This gives citizens a structured way to make their voice heard between elections, alongside the tools they already use (calls, petitions, town halls, organizing), and gives them a transparent record of whether their representative actually listened.

### The Core Problem

Turnout in local and municipal elections regularly falls below 20%. Even when citizens do vote, an election selects a person, not a position: it gives no guarantee that an official's actual votes in office will track what the electorate wanted on any specific piece of legislation. Once elected, an official can vote however they choose for years, with no standardized way for constituents to register whether that behavior still reflects their will.

The tools available to citizens in between elections (calls, emails, petitions, town halls) require disproportionate effort for uncertain impact and produce no lasting, comparable record. Approval ratings describe perception, not alignment.

Pennsylvania compounds this structurally: the state has no citizen initiative or referendum mechanism at any level of government. UVote's Philadelphia pilot doesn't compete with an existing civic channel, it fills a documented structural absence.

### Who UVote Serves

**Individual citizens** have no low-effort way to register a position on specific legislation and know it counted, and no way to see, in concrete terms, how well their own representative actually represents them. UVote gives them that missing layer directly: a vote on an active bill that's timestamped, aggregated with their district, and comparable against how their representative voted, an act of advocacy with a permanent record. That same comparison also runs in the citizen's favor: they can see exactly how often their representative's votes matched their own, turning a vague sense of "my rep doesn't listen to me" into a specific, checkable number.

**Elected officials** have no standardized signal of whether their votes track their district's sentiment, only proxies like approval polling or whoever calls their office loudest. UVote replaces that guesswork with a direct constituent channel and an alignment score: a measure of how often their votes matched the district majority, with a built-in prompt to explain any vote that didn't.

**First-time and challenger candidates** have no voting record to run on, a structural disadvantage against incumbents. UVote lets them stake out public positions on real, active legislation before they ever hold office, building a record voters can hold them to later.

**Organizations** (unions, neighborhood associations, issue-based advocacy groups, student groups, faith communities) already organize members around legislative positions but have no way to make that collective position visible and tied to electoral geography. UVote gives them exactly that: for example, a breakdown showing that 47 members of a neighborhood association live in District 1, and 89% of them support a given bill, a level of specificity a council office can't ignore.

### Core Product Mechanic

Citizens vote support/oppose on active bills moving through their legislative body, informed by a plain-language, Grade 8 reading level summary of the bill's actual impact. Every vote contributes to a live, district-level majority/minority position and to the citizen's own permanent voting record.

This data produces three distinct alignment scores, each answering a different question:

- **Constituent score**: does my representative's voting record match the district's majority? (rep vs. district)
- **District score**: am I voting with my own community? (citizen vs. district)
- **Representation score**: how often does my representative actually vote the way I do? (citizen vs. rep)

The Constituent score is the platform's core accountability mechanic: when a representative's vote diverges from their district's majority, that divergence is surfaced publicly and triggers a structured prompt for the official to explain their reasoning. The District and Representation scores give citizens the same kind of visibility, but pointed at themselves: how aligned they are with their neighbors, and how aligned they are with their own representative. The same transparency the platform demands of officials is available to citizens about themselves.

Because citizens are represented by multiple legislative bodies at once, local, state, and federal, this same mechanic runs independently at each level: a citizen holds separate alignment scores with their city council member, their state legislator, and eventually their member of Congress. This lets them see not just how one representative compares, but how their representation holds up across every level of government at once.

### Design Principles

- **Accessibility is a first-class constraint, not an afterthought.** Digital civic tools can replicate existing socioeconomic participation gaps rather than closing them. Every feature decision should be evaluated against whether it widens or narrows that gap.
- **Non-partisan by architecture.** How party affiliation, sponsor identity, and framing are displayed materially changes expressed sentiment (identical policies poll differently depending on the party label attached). UVote's presentation choices must never advantage a side.
- **Never gate core civic participation.** The free tier must always be fully functional: voting on bills, reading plain-language bill summaries, following a representative, and seeing all three alignment scores. Monetization lives in power-user features (historical trends, cross-district comparison, notifications) and the official/B2B tier, never in access to core participation.
- **No vote without context.** A vote only counts as meaningful advocacy if the citizen casting it was actually informed. Every bill must carry a plain-language, honest summary before a vote is allowed: what it does, who it affects, and an honest account of what happens if it doesn't pass. This protects the integrity of what goes into the platform, one vote at a time.
- **Alignment, never judgment.** Scores are described only as "alignment," never "grade," "rating," or "performance." This is a vocabulary rule with real weight: it keeps the platform read as a communication tool rather than a scorecard, for both officials and citizens.
- **Rigor over sentiment.** Once votes are aggregated, the resulting alignment scores must remain statistically fair: minimum vote thresholds before a score displays, abstentions excluded rather than counted against an official, and resistance to manipulation as engagement scales. This protects the integrity of what comes out of the platform, at the score level.

### Related Documents

- Pricing, tiers, and monetization: `docs/business-model.md`
- Geographic rollout, product roadmap, moat, and long-term vision: `docs/scaling-and-growth.md`

## Commands

```bash
nvm use 22          # system default Node is old; switch first (see below)
npm run dev          # start Vite dev server
npm run build        # production build to dist/
npm run preview      # serve the production build locally
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
```

There is no test suite/script in this repo currently — `lint` and `typecheck` are the available correctness checks.

Node must be ≥18 (ideally 22). The machine's system default Node is much older and will silently break Vite/tooling with confusing errors — always `nvm use 22` before running any of the above.

## Environment

Local dev needs a `.env` (gitignored) with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Same two values are also set in Netlify's env vars (all contexts) so Netlify's own builds don't depend on this machine.

`supabase/migrations/*.sql` files are not auto-applied anywhere — there is no CI step or linked `supabase` CLI project in this repo. Every migration has always been run by hand against the hosted project via the Supabase Dashboard SQL editor. Plan any "verify this migration live" step around a human doing that step; a session holding only `VITE_SUPABASE_ANON_KEY` can query/exercise RLS and RPCs as an end user but cannot apply schema DDL.

## Architecture

**Stack**: Vite + React 18 + TypeScript + Tailwind, Supabase as the sole backend (Postgres + Auth + RLS). No server-side code in this repo — all data access goes straight from the browser to Supabase via `src/lib/supabase.ts`.

**Routing**: No router library. `App.tsx` hand-rolls routing with a `Route` union type, `window.history.pushState`, and `parseInitialRoute()` reading `window.location.pathname` on load. Adding a route means: add a variant to the `Route` type, a case in `parseInitialRoute`, a `pushState` branch in the effect, a `navigateToX` function, and a render branch in `AppInner`. `netlify.toml` rewrites all paths to `/index.html` so this client-side routing works on refresh/direct links.

**Auth & profile**: `src/context/AuthContext.tsx` wraps the app, holding the Supabase `User`/`Session`, the app-level `users` row (`profile`), and the user's `districtName`/`districtUserIds` (used to compare a user's votes against others in their district). Pages read this via `useAuth()`. Bill detail pages and the Election Center are the only routes reachable without auth.

**Data model** (`src/lib/types.ts`, hand-maintained Supabase `Database` type — not generated): `legislative_bodies` → `districts` → `representatives`, `bills` (with `bill_sponsors` join table), `users`, `user_votes`, `rep_votes`, `bill_priorities`, `error_logs`, `voting_blocks`/`voting_block_members`, `user_demographics`. Migrations live in `supabase/migrations/` as timestamped SQL files (RLS policies are iterated on directly in migrations — several exist purely to add/fix/drop RLS policies). The hand-maintained type must satisfy `@supabase/postgrest-js`'s `GenericSchema`/`GenericTable`/`GenericView` shape (every table needs `Row`/`Insert`/`Update`/`Relationships`, every view needs `Row`/`Relationships`) or every `.from()`/`.rpc()` call silently types as `never` — this is easy to get subtly wrong when adding a table by hand instead of via `supabase gen types`.

**Voting blocks** (`voting_blocks`/`voting_block_members`, admin-created groups joined via a shared code): the load-bearing product rule is that no one — including fellow members and block-level admins — can ever see the roster of who else is in a block, only aggregate member count, a district/legislative-body breakdown, and per-bill positions. That's why `voting_block_members` has no general SELECT policy (only "read your own row" + "platform admin reads everything"), and why every cross-member read (join, revive, add-admin-by-username, the two position/breakdown tallies) is a `SECURITY DEFINER` RPC rather than a client-side join — a client-side tally (the pattern district-majority scores already use) would leak the member list to the browser even if the UI never rendered it. Block-level admin is a per-membership `is_admin` flag (multi-admin, not a single `created_by` owner); a block with zero admins goes `is_active = false` automatically via a trigger on `voting_block_members`, and any member can revive it.

**Census-category system blocks** (`voting_blocks.is_system`/`system_category`/`system_value`, `user_demographics`, `submit_demographics` RPC, added in `20260809180000_create_user_demographics_and_system_blocks.sql`): a second, silent way `voting_block_members` rows get created, alongside the join-code flow above. `user_demographics` has no platform-admin read policy at all (a deliberate one-off exception to the admin-read pattern everywhere else in this app) — no one but the user themselves can ever read their own census answers. `submit_demographics` is the only path that may write `user_demographics` or create/join a system block; it always upserts the caller's full row (the two UI call sites, `DemographicsPrompt.tsx` and the Demographics section in `UserProfilePage.tsx`, always submit complete form state, so a plain upsert is correct — a sparse/partial RPC call from some other caller would null out unset fields, since there's no way to distinguish "no opinion on this call" from "clear this field" once both are SQL NULL). System blocks have zero admins forever, so the `is_active`-sync trigger has a `WHERE NOT is_system` guard to keep them permanently active. A system block under `census_block_reveal_threshold()` members (25, hardcoded like `SPOTLIGHT_VOTE_THRESHOLD` in `DashboardTab.tsx`) must not appear via any read path — `voting_blocks_public`, `get_voting_block_bill_positions`, `get_voting_block_geo_breakdown`, `get_bill_voting_block_positions` — for any caller including its own members; any new voting-block read path needs the same gate. The visible block-browsing UI is still deferred (see `docs/scaling-and-growth.md`) — a system block that crosses threshold renders through the existing, unmodified `VotingBlockPage.tsx`.

**Alignment scores**: the three scores named in the product docs above (Constituent, District, Representation) are computed by canonical SQL functions in `supabase/migrations/20260602020000_add_alignment_score_and_tally_functions.sql` (`constituent_score`, `city_constituent_score`, `district_score`, `representation_score`), called via `supabase.rpc(...)` — not hand-aggregated client-side per page. The same migration adds `member_bill_tallies` (an internal, non-PostgREST-exposed primitive that aggregates `user_votes` for an arbitrary bill/member set) plus two public callers of it, `rep_district_bill_history` and `my_district_bill_tallies`, which power per-bill district tally displays (bill history rows, "matched majority" filters) without exposing raw cross-user vote rows. `user_votes`'s SELECT policy is own-row-only (tightened in the following migration) — any new feature needing a cross-user vote aggregate should add a narrowly-scoped SECURITY DEFINER RPC that resolves its own membership set server-side (from a district/rep/block id or `auth.uid()`), never a client-supplied arbitrary user_id list, following the pattern in that migration's functions.

**Multi-jurisdiction design**: the schema and `src/data/legislativeGuides.ts` are built around `legislative_body_id` so the app isn't hardcoded to one city, but only Philadelphia City Council (`PHILLY_COUNCIL_BODY_ID`) is populated today. `legislativeGuides.ts` defines the "how a bill becomes law" onboarding content per legislative body.

**District lookup**: `src/lib/ais.ts` calls Philadelphia's public AIS API (`api.phila.gov/ais/v1/addresses/...`) to resolve a street address to a council district during signup/address-entry (`AddressInput.tsx`, `usePlacesAutocomplete.ts`).

**Bill summary generation**: `.claude/skills/generate-bill-summary/SKILL.md` is a reusable skill that produces a citizen-facing `summary`/`bill_text`/`topic` plus a ready-to-run SQL upsert for one bill (Council or PA), replacing the ad hoc "human in a Claude Code chat" process — see the skill file for the full contract. It never writes to Supabase itself (C1 mode: emits SQL for a human to review and run via the Dashboard SQL editor, same as every other migration in this project). `scripts/format_gate.mjs` validates a candidate `summary` against the *real* `parseSummaryIntoSections` in `billUtils.ts` by importing that file directly (Node 22's `--experimental-strip-types` runs `.ts` with no build step) — useful more broadly any time frontend parsing logic needs testing without a build step. `scripts/sanitize.mjs` strips invisible/bidi-control/Unicode-tag-block characters from extracted source documents before they reach a generation prompt.

**Client-side caching**: `src/lib/cache.ts` is a simple in-memory `Map`-based TTL cache (`getCache`/`setCache`/`bustCache`), not persisted or React-integrated — used to avoid re-fetching bills/dashboard/user-stats data on tab switches within a session. `bustCache(prefix)` is called after mutations (e.g. after a user votes) to invalidate related keys.

**Error logging**: `src/lib/errorLogger.ts` writes failures to the `error_logs` Supabase table (viewable in `pages/admin/ErrorLogsTab.tsx`); logging failures are swallowed intentionally so logging itself can never break the app.

**Admin**: `pages/AdminPage.tsx` + `pages/admin/*Tab.tsx` is a separate authenticated area for managing bills, districts/reps, rep votes, voting blocks, and viewing error logs — gated only by the `admin` route, not by a role check visible in `App.tsx` (check `AdminPage`/RLS policies if changing access control).

## Deployment

Hosted on Netlify (site `uvote-may2026`), auto-deploying on every push to `main` via a GitHub App integration — set up through the Netlify dashboard's "Link repository" + GitHub OAuth flow (API-based linking produced a broken SSH deploy key and doesn't work). Live at `uvotephilly.com` / `www.uvotephilly.com` (GoDaddy DNS: `www` CNAME to `uvote-may2026.netlify.app`, apex forwards to `www`). Originally built/hosted on Bolt.new; that integration has been fully retired.


## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
