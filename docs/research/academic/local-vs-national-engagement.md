# Local vs. National Civic Engagement

UVote launches with Philadelphia City Council, not Congress. This theme covers why local/hyperlocal engagement is structurally lower than national engagement, and what the literature says actually raises it - which bears directly on the multi-jurisdiction rollout sequencing (city council → state legislature → Congress) already reflected in the codebase's `legislative_body_id` design.

---

## Election timing alone explains roughly half the variance in local turnout

**Citation:** Hajnal, Z. L., & Lewis, P. G. (2003). "Municipal Institutions and Voter Turnout in Local Elections." *Urban Affairs Review*, 38(5), 645-668. https://journals.sagepub.com/doi/10.1177/1078087403038005002

**Summary:** Surveying California cities, the authors find that moving a local election on-cycle (concurrent with state/national elections) is associated with turnout roughly 25-36 percentage points higher than holding it off-cycle, and election timing alone explains about half the variance in municipal turnout across cities studied. Institutional design - not just civic apathy - is a primary driver of who shows up to vote locally.

**How this supports UVote:** Since Philadelphia (like most U.S. cities) holds municipal elections off-cycle, formal Election Day turnout for city council will structurally be low and is not a fair benchmark for civic interest in local governance. This supports measuring and pitching UVote's success by *continuous, off-cycle engagement* (bill-by-bill voting activity year-round) rather than by comparison to Election Day turnout figures, since the literature shows the two are driven by largely different (institutional, not attitudinal) forces.

---

## Off-cycle, low-turnout local elections structurally amplify organized minorities over the general public

**Citation:** Anzia, S. F. (2013). *Timing and Turnout: How Off-Cycle Elections Favor Organized Groups*. University of Chicago Press. https://press.uchicago.edu/ucp/books/book/chicago/T/bo16956602.html

**Summary:** Anzia shows that the majority of the 500,000+ elected officials in the U.S. are elected in off-cycle contests with low turnout, which structurally amplifies the electoral influence of well-organized interest groups (who reliably turn out regardless of timing) relative to the general public. She traces how election timing itself has historically been a contested policy lever, not a neutral administrative choice.

**How this supports UVote:** Provides the academic grounding for UVote's structural framing of the problem: between elections, local governance decisions are made continuously, but organized, well-resourced groups already have a persistent channel (direct advocacy, lobbying, mobilization) to make their preferences known, while the general public does not. This supports positioning UVote explicitly as a documented, low-effort advocacy channel for the general public, filling the same continuous-influence role for ordinary citizens that organized groups already have through other means - directly relevant to the "Individual citizens" section of the business/pitch narrative.

---

## Lack of local information, not apathy, is the primary reason cited for skipping local elections

**Citation:** Knight Foundation & Lake Research Partners. (2015). *Local Voter Drop-Off*. https://knightfoundation.org/features/votelocal/

**Summary:** Based on focus groups with "drop-off" voters (people who voted in the last national election but not in recent local elections) in Akron, Miami, and Philadelphia, the report finds the lack of accessible news and information about local candidates and issues is the top self-reported reason for not voting locally - ahead of apathy or distrust. Many participants were unsure which everyday services (schools, transit) even fall under local government's control.

**How this supports UVote:** This study specifically included Philadelphia in its focus-group cities and directly validates the pilot market choice and the core product bet: the stated barrier to local participation is an information/legibility gap, which is precisely what plain-language bill summaries and rep-matching are designed to close. It's a strong, citable data point for the pitch deck's problem statement, and it's a rare case where the underlying research sample geographically overlaps with UVote's actual launch market.

---

## Local news collapse depresses local political knowledge and turnout specifically (distinct from national engagement)

**Citation:** Hayes, D., & Lawless, J. L. (2021). *News Hole: The Demise of Local Journalism and Political Engagement*. Cambridge University Press. https://www.amazon.com/News-Hole-Journalism-Engagement-Communication/dp/1108834779

**Summary:** See full summary in `legislative-information-access-and-trust.md`. The relevant finding here: as citizens increasingly get news from national or international-focused outlets (cable, online), their engagement with and knowledge of *local* politics specifically declines, even as national political engagement or attention may stay flat or rise. This is a divergence, not a uniform decline in civic attention.

**How this supports UVote:** Supports treating local and national civic engagement as substantively different problems requiring different solutions, not a single "civic engagement" market - reinforcing the product's multi-jurisdiction architecture (separate alignment scores per legislative body) as the right design rather than a single blended engagement score. It also supports the rollout sequencing argument in the pitch deck: since the local information gap is measurably worse than the national one, starting with city council (rather than starting with the already better-served federal layer) is where the intervention has the most headroom to matter.
