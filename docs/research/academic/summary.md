# Academic Research Digest: Synthesis for UVote Business Model & Pitch Deck

This is a one-page synthesis of the strongest, most directly citable findings from the full digest (see the theme files in this folder for complete citations and summaries). Each entry states the specific product or business-model argument it backs.

---

### 1. Legislators change their votes when given real district-opinion data
**Butler & Nickerson (2011), *Quarterly Journal of Political Science*** - a field experiment found legislators who received their district's actual constituent-opinion survey results were significantly more likely to vote in line with that opinion than those who didn't.
**Backs:** The Constituent Score isn't just a transparency report card - it's evidence the underlying mechanism (giving officials accurate constituent signal) can causally change legislative behavior. Supports building a direct-to-official product surface as a distinct, sellable B2B feature.

### 2. Officials are structurally bad at guessing what their district actually wants
**Broockman & Skovron (2018), *American Political Science Review*** - surveying ~3,765 officials found systematic, large misperception of constituent opinion, driven by who happens to contact them.
**Backs:** Frames UVote as solving a genuine information deficiency for officials, not just imposing accountability on them - strengthens the B2B pitch and justifies the "alignment, never judgment" tone requirement.

### 3. Sharing a representative's identity can make constituents give them credit for representation they didn't earn
**Jones (2016), *Social Science Quarterly*** - experiment found voters perceived greater substantive representation from same-race legislators regardless of actual voting record.
**Backs:** The "non-partisan by architecture" design principle - keeps the case for excluding party/identity cues from alignment score displays grounded in real measured bias, not just brand caution.

### 4. Social comparison to peers is one of the largest known turnout levers
**Gerber, Green & Larimer (2008), *American Political Science Review*** - large field experiment: showing people their own and neighbors' turnout raised turnout 8.1 points.
**Backs:** Prioritizing the District Score (citizen vs. their own community) as a prominent, visible engagement mechanic on the voting screen itself, not a secondary stats page.

### 5. Emphasize rising participation, never low participation, in UI copy
**Gerber & Rogers (2009), *The Journal of Politics*** - messages emphasizing high expected turnout outperform "turnout is low" messaging, especially for infrequent participants.
**Backs:** A specific, testable UX-copy rule: any participation stat shown in-product should be framed positively ("X have voted"), never as a shortfall - directly actionable for the bill-detail and dashboard UI.

### 6. Local news collapse measurably shrinks local political knowledge and turnout - a Philadelphia-inclusive finding
**Knight Foundation & Lake Research Partners (2015), *Local Voter Drop-Off*** - focus groups (including Philadelphia) found lack of local information, not apathy, is the top reason people skip local elections.
**Backs:** The core problem statement in the pitch deck - directly validates that the target market (drop-off voters in UVote's own launch city) cites the exact gap the product fills.

### 7. Off-cycle local elections structurally suppress and skew turnout - so Election Day isn't the right success metric
**Hajnal & Lewis (2003), *Urban Affairs Review***, and Anzia (2013), *Timing and Turnout* (Univ. of Chicago Press) - election timing alone explains roughly half the variance in local turnout, and off-cycle elections structurally favor organized minorities over the general public.
**Backs:** Measuring and pitching UVote's success via continuous, year-round bill-by-bill engagement rather than Election Day turnout - and framing UVote as giving ordinary citizens the same persistent-influence channel organized groups already have.

### 8. A local participatory civic action measurably increased later formal voter turnout, most for low-propensity groups
**Johnson, Carlson & Reynolds (2021), *Political Behavior*** - NYC participatory budgeting participants were 8.4 points more likely to vote in later elections, with the largest effects among young, lower-income, and Black voters.
**Backs:** The strongest available causal evidence that UVote's core loop (recurring, low-effort local civic action) can function as a turnout multiplier for formal elections, not merely a parallel activity - and an argument for prioritizing outreach to lower-propensity users rather than optimizing only for already-engaged ones.

### 9. A mature, open method already exists for placing legislators on a data-derived ideological map, independent of party label
**Poole & Rosenthal (1985, 1997), Voteview (Lewis, Boche, Rudkin, Sonnet et al., UCLA)** - DW-NOMINATE scales members of Congress on ideological dimensions purely from their voting records, with 200+ years of coverage; Shor & McCarty (2011, *APSR*) extended a comparable common-space method to state legislatures, the direct precedent for PA House/Senate. See `dw-nominate.md` for the full explanation, open tooling (`wnominate`, `oc`, `pynominate`), and known critiques.
**Backs:** A future, complementary ideological-position score for representatives - "not just whether your rep agrees with you, but where they sit on a data-derived spectrum, the same method political scientists use for Congress" - a differentiator no comparable civic tech tool currently offers. Stated plainly as a multi-year, methodologist-dependent roadmap item, not a near-term feature: Philadelphia City Council's vote volume is very likely too small today, and this needs a real quantitative methodologist (ideally a research partnership, not an in-house build) to do credibly. See `lapinski-deep-dive.md` for a full reading of Bateman & Lapinski's (2016) direct critique of this method and a prioritized, concrete plan for engaging Lapinski specifically (not just as a generic "plausible partner").

### Bonus: civic tech's dominant failure mode is business-model sustainability, not lack of engagement
**Bracy & Berkowitz (2017), *Scaling Civic Tech*, Knight Foundation** - a study of ~50 civic tech orgs, including POPVOX and Countable, found consistent user engagement but consistent struggle to build sustainable revenue when the core product must stay free.
**Backs:** Validates UVote's monetization design principle - revenue from power-user features and the official/B2B tier, never from gating core participation - using comparable-company evidence rather than assumption.

---

## What's notably absent from the literature

No peer-reviewed, published outcome evaluation of POPVOX, Countable, or a directly comparable rep-matching/bill-tracking tool's effect on turnout, trust, or accountability was found despite extensive searching (see `civic-tech-ux-patterns.md`). This is a genuine gap, not an oversight - and a potential differentiator: UVote could be the first tool in its category to pursue a real, independent academic evaluation of its alignment-score mechanic, which would itself be a credible, citable claim in a future pitch.

## Sourcing note

Every citation in this digest folder is a real, independently verifiable paper, book, or institutional report with an author, publication venue, and (where available) a DOI or direct URL. No finding here was included on recollection alone without a confirming search; where a detail could not be independently confirmed, it was either excluded or explicitly flagged as unverified in the relevant theme file.
