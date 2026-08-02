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

## Architecture

**Stack**: Vite + React 18 + TypeScript + Tailwind, Supabase as the sole backend (Postgres + Auth + RLS). No server-side code in this repo — all data access goes straight from the browser to Supabase via `src/lib/supabase.ts`.

**Routing**: No router library. `App.tsx` hand-rolls routing with a `Route` union type, `window.history.pushState`, and `parseInitialRoute()` reading `window.location.pathname` on load. Adding a route means: add a variant to the `Route` type, a case in `parseInitialRoute`, a `pushState` branch in the effect, a `navigateToX` function, and a render branch in `AppInner`. `netlify.toml` rewrites all paths to `/index.html` so this client-side routing works on refresh/direct links.

**Auth & profile**: `src/context/AuthContext.tsx` wraps the app, holding the Supabase `User`/`Session`, the app-level `users` row (`profile`), and the user's `districtName`/`districtUserIds` (used to compare a user's votes against others in their district). Pages read this via `useAuth()`. Bill detail pages are the one route that's reachable without auth.

**Data model** (`src/lib/types.ts`, hand-maintained Supabase `Database` type — not generated): `legislative_bodies` → `districts` → `representatives`, `bills` (with `bill_sponsors` join table), `users`, `user_votes`, `rep_votes`, `error_logs`. Migrations live in `supabase/migrations/` as timestamped SQL files (RLS policies are iterated on directly in migrations — several exist purely to add/fix/drop RLS policies).

**Multi-jurisdiction design**: the schema and `src/data/legislativeGuides.ts` are built around `legislative_body_id` so the app isn't hardcoded to one city, but only Philadelphia City Council (`PHILLY_COUNCIL_BODY_ID`) is populated today. `legislativeGuides.ts` defines the "how a bill becomes law" onboarding content per legislative body.

**District lookup**: `src/lib/ais.ts` calls Philadelphia's public AIS API (`api.phila.gov/ais/v1/addresses/...`) to resolve a street address to a council district during signup/address-entry (`AddressInput.tsx`, `usePlacesAutocomplete.ts`).

**Client-side caching**: `src/lib/cache.ts` is a simple in-memory `Map`-based TTL cache (`getCache`/`setCache`/`bustCache`), not persisted or React-integrated — used to avoid re-fetching bills/dashboard/user-stats data on tab switches within a session. `bustCache(prefix)` is called after mutations (e.g. after a user votes) to invalidate related keys.

**Error logging**: `src/lib/errorLogger.ts` writes failures to the `error_logs` Supabase table (viewable in `pages/admin/ErrorLogsTab.tsx`); logging failures are swallowed intentionally so logging itself can never break the app.

**Admin**: `pages/AdminPage.tsx` + `pages/admin/*Tab.tsx` is a separate authenticated area for managing bills, districts/reps, rep votes, and viewing error logs — gated only by the `admin` route, not by a role check visible in `App.tsx` (check `AdminPage`/RLS policies if changing access control).

## Deployment

Hosted on Netlify (site `uvote-may2026`), auto-deploying on every push to `main` via a GitHub App integration — set up through the Netlify dashboard's "Link repository" + GitHub OAuth flow (API-based linking produced a broken SSH deploy key and doesn't work). Live at `uvotephilly.com` / `www.uvotephilly.com` (GoDaddy DNS: `www` CNAME to `uvote-may2026.netlify.app`, apex forwards to `www`). Originally built/hosted on Bolt.new; that integration has been fully retired.

