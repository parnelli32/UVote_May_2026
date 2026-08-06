# Competitive Landscape: Address-Matched, Multi-Body Bill Voting

**Research question:** Does a product already exist that (1) matches a citizen to their specific elected representatives by address, (2) shows live bills across multiple legislative bodies (e.g., city + state + federal at once), (3) lets the citizen cast a non-binding vote/opinion on each bill, and (4) compares citizen sentiment against how their rep actually voted?

**Bottom line up front:** No product found combines all four elements. Several products have one or two of the four pieces (most often address-matching alone, or bill-tracking alone). The closest partial analogs are LegiScan's OneVote and VoteSpotter, and both are missing the automatic address-to-district matching, the multi-body simultaneous view, and the public rep-vs-district alignment score. Full detail and sourcing per product below.

---

## BillTrack50

- **What it does:** A legislative and regulation tracking platform covering all 50 states, DC, and Congress. Search engine over bill text, AI-generated summaries, bill sheets for organizing tracked legislation, and email/RSS alerts on hearings and bill status changes.
- **Who it targets:** Primarily professional users — lobbyists, government affairs teams, advocacy organizations, risk managers tracking regulation. A free "Citizen" tier exists for search and reading.
- **Address-to-rep matching:** No.
- **Citizen vote vs. rep vote comparison:** No. There is no mechanism for a citizen to cast an opinion on a bill, let alone compare it to how their representative voted.
- **Why it isn't UVote:** It's a research/monitoring tool built for professionals who already know which bills and jurisdictions they care about. It has no concept of "your bills, your reps, your district" and no citizen-facing advocacy mechanic at all.
- **Source:** [billtrack50.com/info](https://www.billtrack50.com/info/)

## LegiScan (public site / "OneVote")

- **What it does:** Tracks legislation across all 50 states, DC, and Congress, indexing roughly 175,000 bills a year. Its free "OneVote" account lets a user build a personal bill-tracking list, follow the sponsorship and voting record of officials they choose to track, and — notably — **cast a support/oppose vote on legislative matters**, with the ability to form private or public discussion groups around bills.
- **Who it targets:** A mix of professional trackers and self-selecting engaged citizens who already know which officials and bills they want to follow.
- **Address-to-rep matching:** No. A user manually selects a home state and the officials/bills they want to track; there is no automatic address-to-district resolution that determines who represents them.
- **Citizen vote vs. rep vote comparison:** Partial. Users can vote their opinion on a bill, but there is no aggregated, public district-level majority position, and no structured "how often did your rep vote with you" score. The free tier is also capped (50 bills, one state + Congress).
- **Why it isn't UVote:** This is the single closest analog found in this research — it has an actual citizen-vote-on-a-bill feature. But it lacks automatic hyper-local address matching (the core onboarding mechanic UVote is built around), has no simultaneous multi-body district view, and produces no public accountability artifact (an alignment score, or a divergence prompt to the official) — voting is a personal-tracking feature, not a district-level accountability mechanic.
- **Source:** [legiscan.com](https://legiscan.com/), [legiscan.com/onevote-zips](https://legiscan.com/onevote-zips)

## Countable

- **What it does:** Historically (2013–2024) let users track Congressional bills and votes by topic, see representative info, send video messages to reps, and vote support/oppose on issues — votes were aggregated and shown to congressional offices as constituent sentiment.
- **Who it targets:** Was a consumer-facing civic engagement app.
- **Address-to-rep matching:** Yes, historically, for Congress only.
- **Citizen vote vs. rep vote comparison:** Partial, historically — it surfaced sentiment to offices but did not publish a structured "your rep voted X, your community said Y" alignment score.
- **Why it isn't UVote:** Countable was acquired by EV3 Global in June 2024 and the platform has been repositioned as an enterprise community-engagement tool for businesses, not a live consumer civic-engagement app. It also only ever covered federal Congress — no state legislature or municipal council layer, and no cross-level alignment view.
- **Sources:** [Tracxn company profile](https://tracxn.com/d/companies/countable/__dU66qPi5WBpgwj-EZFfvsuu_i4IWN_G6yfpj9pQaObs), [CREDO Mobile blog, 2017](https://blog.credo.com/2017/07/12/mobile-app-of-the-month-countable/)

## POPVOX / POPVOX Foundation

- **What it does:** POPVOX, Inc. (founded 2010) was a platform letting the public read bill summaries and register support/oppose positions directly to Congress. POPVOX Foundation, a separate nonprofit founded in 2021, is now the active entity — but it is focused on helping legislatures (not citizens directly) modernize legislative workflows and open-data infrastructure, through publications, prototypes, and technical assistance to public servants.
- **Who it targets:** POPVOX Foundation's audience is legislatures and legislative staff, not the general public as a voting citizen base.
- **Address-to-rep matching:** Not part of POPVOX Foundation's current mission; unclear whether original POPVOX.com consumer product is still actively maintained as a citizen tool.
- **Citizen vote vs. rep vote comparison:** No, as currently constituted.
- **Why it isn't UVote:** The organization has pivoted from a citizen-facing advocacy product to a legislature-facing modernization nonprofit. It is not a live, consumer address-matched, multi-body voting product today.
- **Source:** [popvox.org/about-us](https://www.popvox.org/about-us)

## Resistbot

- **What it does:** A chatbot (SMS/iMessage/WhatsApp/Messenger) that, once given a name and address, identifies a user's U.S. senators, House representative, governor, and state legislators, then converts a user's message into a letter, fax, or email and delivers it to all of them at once.
- **Who it targets:** General public wanting a low-friction way to contact any level of their elected officials.
- **Address-to-rep matching:** Yes — and notably it does span local, state, and federal levels for the "who represents you" step.
- **Citizen vote vs. rep vote comparison:** No. It is a message-delivery tool, not a bill-specific vote/opinion ledger. It doesn't track bills, doesn't record a persistent voting record for the citizen, and has no concept of how the official actually voted on the matter raised.
- **Why it isn't UVote:** It solves "contact your rep" well, including the multi-level matching UVote also needs, but has no bill-tracking, no vote casting, no aggregation, and no accountability/alignment layer.
- **Source:** [resist.bot](https://resist.bot/), [Wikipedia: Resistbot](https://en.wikipedia.org/wiki/Resistbot)

## iCitizen

- **What it does:** A now largely dormant app (most coverage dates to 2013–2016) that let users track issues and lawmakers, and ran its own polls on current topics (in collaboration with the Rochester Institute of Technology), delivering results to elected officials.
- **Who it targets:** General public, framed as politically neutral.
- **Address-to-rep matching:** Partial — it surfaced federal and state lawmaker info, but coverage found does not describe an automatic address-to-district resolution flow.
- **Citizen vote vs. rep vote comparison:** No. Its polls were topic-based sentiment surveys, not votes on specific pending bills, and there's no evidence of a rep-vs-citizen alignment score.
- **Why it isn't UVote:** Beyond lacking the comparison mechanic, iCitizen shows no evidence of ongoing active development or a current live product — coverage is a decade old.
- **Source:** [Business Wire, 2016 relaunch announcement](https://www.businesswire.com/news/home/20160107006348/en/Civic-Engagement-Solution-icitizen-Officially-Relaunches)

## Ballotpedia

- **What it does:** A nonpartisan encyclopedia of American politics — 674,000+ articles on candidates, elected officials, elections, and ballot measures. Includes a "Who represents me" address-based lookup tool, a sample-ballot lookup tool, and an election-legislation tracker with daily bill summaries.
- **Who it targets:** General public researching candidates, officials, and elections; also journalists and researchers.
- **Address-to-rep matching:** Yes, via its "Who represents me" tool.
- **Citizen vote vs. rep vote comparison:** No. Ballotpedia is a reference resource — it has no voting or opinion-casting mechanic anywhere on the site.
- **Why it isn't UVote:** It's the closest thing to a "look up your reps" utility in this list combined with real editorial bill coverage, but it is architecturally a reference encyclopedia, not an engagement platform. There is no way for a citizen to register a position on anything, so there is nothing to compare against a representative's vote.
- **Source:** [ballotpedia.org/Who_represents_me](https://ballotpedia.org/Who_represents_me), [Ballotpedia:About](https://ballotpedia.org/Ballotpedia:About)

## Represent (OpenNorth / Represent API)

- **What it does:** An open-data REST API matching a postal code or address to elected officials and electoral boundaries, built to let developers build "email your representative" tools.
- **Who it targets:** Developers and civic-tech organizations building their own advocacy tools on top of the API.
- **Address-to-rep matching:** Yes — this is its entire purpose, and it does it well.
- **Citizen vote vs. rep vote comparison:** No — it's a boundary/representative-lookup data service, not a consumer product, and has no bill or voting layer at all.
- **Why it isn't UVote:** Two disqualifying issues: it is a backend API/infrastructure layer, not a consumer-facing app, and it covers **Canadian** elected officials and electoral districts only — it has no U.S. or Philadelphia coverage.
- **Source:** [represent.opennorth.ca](https://represent.opennorth.ca/)

## 5 Calls

- **What it does:** Uses the user's location to auto-identify their House member, senators, and (in some markets) local officials, and provides curated call scripts and background on specific current issues so users can quickly phone their reps.
- **Who it targets:** General public wanting fast, low-friction phone advocacy; over 10 million calls made through the app to date.
- **Address-to-rep matching:** Yes.
- **Citizen vote vs. rep vote comparison:** No. It is a call-facilitation tool tied to issues/campaigns, not bill-specific vote casting, and has no persistent citizen voting record or comparison to how a rep actually voted.
- **Why it isn't UVote:** Strong on the "contact your rep easily" use case, but has no bill-level voting mechanic, no multi-body simultaneous bill feed, and no alignment scoring.
- **Source:** [App Store listing](https://apps.apple.com/us/app/5-calls-contact-your-congress/id1202558609)

## GovTrack

- **What it does:** Tracks U.S. Congress — bill status and full legislative history, the complete roll-call vote database back to 1789, member profiles with statistical analyses (e.g., ideology scores, leadership scores), and customizable alerts.
- **Who it targets:** Researchers, journalists, students, and politically engaged citizens who want deep Congressional data.
- **Address-to-rep matching:** No dedicated address lookup flow described in current documentation; users track members and bills they select.
- **Citizen vote vs. rep vote comparison:** No. GovTrack shows how members of Congress voted, and lets users see that against statistical peer benchmarks, but has no mechanism for a citizen to cast their own vote on a bill or compare it to their rep's actual vote.
- **Why it isn't UVote:** GovTrack is federal-only (no state or municipal layer) and is a one-way information/analysis tool — Congress's actions flow to the user, but nothing flows back from the citizen.
- **Source:** [govtrack.us/about](https://www.govtrack.us/about)

## Voatz (and similar mobile e-voting apps)

- **What it does:** A mobile app for casting an actual, binding vote in an official election or organizational vote, using facial recognition/biometrics and a permissioned blockchain to record and verify ballots. Used for overseas/military absentee voting (West Virginia, 2018) and some party conventions.
- **Who it targets:** Election administrators and organizations running official votes.
- **Address-to-rep matching:** Not applicable — different problem domain entirely.
- **Citizen vote vs. rep vote comparison:** Not applicable — Voatz casts official ballots in elections for candidates/measures; it has nothing to do with ongoing bill-by-bill sentiment or comparing citizens to sitting officials' votes.
- **Why it isn't UVote:** Different category of product altogether — official ballot infrastructure, not civic sentiment/advocacy. Also worth noting for any adjacent security framing: an independent USENIX Security '20 analysis found significant security vulnerabilities in Voatz's implementation.
- **Sources:** [voatz.com](https://voatz.com/), [USENIX Security '20 analysis](https://www.usenix.org/conference/usenixsecurity20/presentation/specter)

## VoteSpotter

- **What it does:** Built by the Mackinac Center for Public Policy. A user enters their address once; the app identifies their state senator and state representative, then pushes alerts on key votes with a neutral plain-English description of each bill, and lets the user send instant approve/disapprove feedback (call or email) to the legislator's office, or post their reaction to social media.
- **Who it targets:** General public wanting lightweight, ongoing state-legislature accountability.
- **Address-to-rep matching:** Yes — this is close to UVote's own onboarding mechanic.
- **Citizen vote vs. rep vote comparison:** Partial. The citizen reacts *after* the official has already voted (approve/disapprove of a completed vote), rather than casting a position that is then compared against the outcome. There is no aggregated public district-level majority, no persistent personal voting record across bills, and no formal alignment score.
- **Why it isn't UVote:** This is the second-closest analog found. It nails single-level address matching and plain-English bill descriptions, but it's state-legislature-only (no city council or federal layer, so no cross-level comparison), and its feedback loop is a one-off reaction rather than a structured, aggregated, publicly visible district sentiment record.
- **Sources:** [Mackinac Center announcement](https://www.mackinac.org/19763), [Wikipedia: VoteSpotter](https://en.wikipedia.org/wiki/VoteSpotter)

## CivicPlus / "Engage"-style municipal engagement platforms

- **What it does:** CivicPlus sells an integrated municipal website + engagement suite to city/county governments: 311-style service requests, public records requests, notification/alert centers, and a configurable mobile app that can include municipality-run polls or "vote on city issues" widgets.
- **Who it targets:** Local governments (B2G) as the paying customer; residents of whichever municipality has purchased and configured it.
- **Address-to-rep matching:** No inherent concept of "your representative" — it's a single municipality's own website/app, not a cross-jurisdiction rep-matching tool.
- **Citizen vote vs. rep vote comparison:** No. Any polling feature is a generic, per-municipality tool for gauging opinion on local topics (e.g., a park redesign) — it isn't tied to actual legislative bill text, isn't standardized across jurisdictions, and has no mechanism comparing citizen sentiment to how an elected council member voted.
- **Why it isn't UVote:** It's an enterprise software product one city buys and configures for itself, not a resident-facing product that spans multiple governments and multiple levels at once. There's no bill-specific voting record, no representative alignment scoring, and no portability if a resident is represented by several different bodies.
- **Source:** [civicplus.com/tools/civicplus-mobile](https://www.civicplus.com/tools/civicplus-mobile/)

## Philadelphia-specific civic tech

- **Legistar (phila.legistar.com / legislation.phila.gov):** Philadelphia City Council's official legislative information system — the authoritative record of bill text, legislative history, and committee action. It is a government archive/records system: no address matching, no citizen voting or opinion mechanic, no representative-comparison layer. It is the *source of record* UVote's own bill data ultimately traces back to, not a competing engagement product.
  - **Source:** [phila.legistar.com](https://phila.legistar.com/)
- **Philly311:** The city's service-request app (potholes, graffiti, downed limbs, abandoned vehicles, etc.), routing reports to the correct city department and tracking them to resolution. This is municipal *service delivery*, not legislative engagement — it has nothing to do with bills, votes, or representatives at all.
  - **Source:** [phila.gov/departments/philly311](https://www.phila.gov/departments/philly311/)

---

## The Gap UVote Fills

Across every product examined, the four defining elements of UVote's mechanic never appear together:

| Product | Address→rep match | Multi-body live bills | Citizen votes on a bill | Citizen-vs-rep comparison |
|---|---|---|---|---|
| BillTrack50 | No | Yes (tracking, not comparison) | No | No |
| LegiScan / OneVote | No (manual) | Yes | **Yes** | No (no aggregation/score) |
| Countable (defunct as consumer app) | Yes (federal only, historically) | No (Congress only) | Yes (historically) | No |
| POPVOX Foundation | No | N/A (legislature-facing now) | No | No |
| Resistbot | Yes (multi-level) | No (messaging only) | No | No |
| iCitizen | Partial | Partial | No (topic polls only) | No |
| Ballotpedia | Yes | No (reference only) | No | No |
| Represent API (Canada) | Yes (Canada only) | No | No | No |
| 5 Calls | Yes | No (call scripts only) | No | No |
| GovTrack | No | No (federal only) | No | No |
| Voatz | N/A (official ballots) | N/A | N/A | N/A |
| VoteSpotter | Yes (state only) | No (single level) | Partial (react after the fact) | No |
| CivicPlus/Engage | No | No (single municipality) | Partial (generic polls) | No |
| Philly Legistar / 311 | No | No | No | No |

No product in this landscape lets a Philadelphia resident type in their address once and see, in one place, the live bills in front of *every* body that represents them (City Council today, PA House/Senate as UVote expands), cast a recorded vote/opinion on each one informed by a plain-language summary, and then see — publicly, on an ongoing basis — whether their representative's actual vote matched what their district said. LegiScan's OneVote comes closest on the "citizen casts a vote" piece; VoteSpotter comes closest on the "one address, ongoing plain-English alerts" piece; Resistbot and 5 Calls come closest on effortless multi-level rep matching. None combines all of it, and none turns the result into a standing, public, per-representative accountability score.

**Why UVote's combination is differentiated, not just additive:** the value of each piece compounds with the others. Address matching alone (Ballotpedia, Represent, 5 Calls) tells you who represents you but gives you nothing to do about it. Bill tracking alone (BillTrack50, GovTrack) gives professionals data but no citizen voice. Contacting your rep alone (Resistbot, 5 Calls, VoteSpotter's reaction step) is a single unlogged action with no lasting record. Only by fusing hyper-local address matching with a persistent, aggregated citizen vote *and* a direct comparison to the rep's actual recorded vote does the platform produce something none of these products do: a standing, checkable answer to "does my representative actually vote the way my district does" — repeated at every level of government that represents a single citizen at once.
