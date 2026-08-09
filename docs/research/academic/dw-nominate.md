# DW-NOMINATE and Data-Derived Ideological Scaling

UVote's existing Constituent/District/Representation scores compare a representative's votes directly against constituent votes on the same bills. This is a separate, complementary idea: political scientists have a decades-old, widely used method for placing legislators on a data-derived ideological "map" using nothing but their voting records - no party label required. This file covers what that method is, its real limitations, whether it can be replicated, and how (and how cautiously) it might apply to UVote.

---

## 1. What DW-NOMINATE actually is

**Foundational citation:** Poole, K. T., & Rosenthal, H. (1985). "A Spatial Model for Legislative Roll Call Analysis." *American Journal of Political Science*, 29(2), 357-384.

**Dynamic version citation:** Poole, K. T., & Rosenthal, H. (1997). *Congress: A Political-Economic History of Roll Call Voting*. Oxford University Press.

**Plain-language explanation:** Take every recorded yes/no vote every member of a legislature has ever cast. NOMINATE ("Nominal Three-Step Estimation") is an algorithm that finds the small number of underlying dimensions - usually just one or two - that best predict who voted with whom, across every single roll call at once. It doesn't ask anyone their opinion or read party labels; it works backward purely from voting behavior to infer where each legislator and each vote "sits" in an abstract ideological space. Legislators who habitually vote together end up placed close together on the map, regardless of what party they belong to. The "DW" prefix (Dynamic, Weighted) refers to the version that lets a legislator's position move gradually over a multi-decade career rather than assuming it's fixed.

**What the two dimensions mean in practice:** The first dimension - which alone explains the large majority of a legislator's voting choices - lines up closely with the conventional liberal-conservative axis, largely driven by attitudes toward government intervention in the economy. The second dimension has meant different things in different eras (historically: slavery, then race, then at various points currency policy, civil rights, or abortion) - it picks up whichever issue currently cuts across the main party divide rather than tracking a fixed concept.

**Current home:** The project lives at **Voteview** (https://voteview.com), hosted at UCLA. Confirmed current maintainers, per the project's own citation: Jeffrey B. Lewis (UCLA Professor of Political Science), Adam Boche (Lead Database Developer), Aaron Rudkin, and Luke Sonnet (Lead Developers), continuing the infrastructure originally built by Keith Poole and Howard Rosenthal.
**Citation:** Lewis, J. B., Poole, K., Rosenthal, H., Boche, A., Rudkin, A., & Sonnet, L. (2018). "The new Voteview.com: preserving and continuing Keith Poole's infrastructure for scholars, students and observers of Congress." *Public Choice*, 176(1). https://link.springer.com/article/10.1007/s11127-018-0546-0

---

## 2. Where the research has actually arrived

**Coverage today:** Voteview publishes DW-NOMINATE scores continuously from the 1st Congress (1789) through the present, covering roughly 113,000+ roll calls and 26 million+ individual votes cast by close to 13,000 members of Congress, updated after each new Congress convenes.

**Known limitations and critiques, honestly stated:**
- **What the dimensions actually mean is contested.** The more neutral, technically correct term in the literature is "ideal point," not "ideology" - DW-NOMINATE scores are a statistical summary of revealed voting behavior, not a direct measurement of belief. When party polarization runs along more than one underlying issue at once, the "first dimension" can become a composite of several distinct issues rather than one clean concept, which complicates any simple "this rep is a 0.4 on a liberal-to-conservative scale" interpretation.
- **A direct, citable critique - and a notable connection to this folder:** Bateman, D. A., & Lapinski, J. S. (2016). "Ideal Points and American Political Development: Beyond DW-NOMINATE." *Studies in American Political Development*, 30(2), 147-171. The paper argues DW-NOMINATE's assumption of smooth, linear ideological movement, its collapsing of distinct policy areas into one score, and its indifference to historical/institutional context all limit what the scores can support on their own. Notably, the co-author is **John S. Lapinski**, the Penn political scientist already profiled in `relevant-academics.md` as a plausible academic partner for UVote - he has direct, published expertise specifically critiquing this exact method's limitations.
- **A real methodological alternative exists:** Clinton, J., Jackman, S., & Rivers, D. (2004). "The Statistical Analysis of Roll Call Data." *American Political Science Review*, 98(2), 355-370. This introduced a Bayesian Item Response Theory (IRT) approach to the same underlying problem, which is more flexible for small or irregular legislatures and produces honest uncertainty estimates (credible intervals) rather than a single point position - a meaningfully important property for any legislature, like Philadelphia City Council, with far fewer recorded votes than Congress.

**Is there a state-legislature equivalent?** Yes, and it is the directly relevant precedent for UVote's PA House/Senate expansion, since DW-NOMINATE itself only covers the U.S. Congress.
**Citation:** Shor, B., & McCarty, N. (2011). "The Ideological Mapping of American Legislatures." *American Political Science Review*, 105(3), 530-551.
**What it did:** State legislatures don't share any common roll-call votes with each other or with Congress, so their voting records alone can't be placed on one shared scale the way NOMINATE does for a single continuous Congress. Shor and McCarty solved this "bridging" problem using a common survey instrument (Project Vote Smart's National Political Awareness Test) completed by candidates across states, which lets legislators from different state chambers - and Congress - be placed on one directly comparable ideological scale. The resulting dataset now covers 1993-2020, roughly 24,716 individual state legislators, and is freely downloadable from Harvard Dataverse.
**Genuine gap worth flagging honestly:** No comparable common-space scaling exists yet for city councils. This is very likely because most city councils are small, often formally nonpartisan, and don't have the sustained, structured roll-call recording history that made Congress and state legislatures tractable for this method. UVote's Philadelphia City Council data would be a genuinely novel application, not an existing off-the-shelf model to simply run.

---

## 3. Can it be replicated?

**Yes, the method and tooling are genuinely open**, not proprietary:
- Voteview publishes its full underlying roll-call vote data for download.
- **`wnominate`** (R, on CRAN, authored by Poole, Lewis, Lo, and Carroll) implements the static W-NOMINATE method.
- **`oc`** (R, on CRAN, same author group) implements Poole's Optimal Classification, a related nonparametric scaling method.
- **`dwnominate`** (R, community package by wmay on GitHub) provides an interface to run the original dynamic DW-NOMINATE program.
- **`pynominate`** (https://github.com/voteview/pynominate) is a Python implementation maintained directly by the Voteview team itself.

**The honest data-volume answer:** NOMINATE-style scaling needs many legislators casting many recorded votes over enough time to produce stable, non-noisy position estimates - it was built for and validated against a chamber of 100-435 members casting many hundreds of roll calls per two-year term, accumulated across decades for the dynamic version. Philadelphia City Council has 17 members. A young, still-accumulating dataset of the council's recorded votes is a fundamentally smaller and sparser input than what this method was designed for, and running it prematurely risks producing unstable or misleading positions - a real risk given UVote's own "rigor over sentiment" design principle. **This is a "not yet, but plausible in a few years" answer for Philadelphia City Council specifically**, once several years and multiple council sessions of `rep_votes` data have accumulated.

The Pennsylvania General Assembly (203-member House, 50-member Senate) is a meaningfully larger, more Congress-like dataset, and - critically - the Shor-McCarty precedent above already demonstrates the exact bridging methodology needed to place PA legislators on a scale comparable across states and to Congress. **The state-legislature expansion, not the city council pilot, is the more plausible near-term target for this kind of analysis.**

---

## 4. How this might apply to UVote specifically

**The idea, concretely:** Once enough roll-call data exists (state legislature first, city council later), UVote could compute an independent, data-derived ideological position for each representative - a complement to, not a replacement for, the existing Constituent/District/Representation alignment scores. Where those scores answer "does this rep's voting record match their district," a NOMINATE-style score would answer a different question: "purely from the pattern of their votes, where does this rep actually sit relative to every other legislator in their chamber" - independent of the party label printed next to their name.

**What it would add:**
- **Product:** A pitch-deck-ready claim along the lines of "we don't just track whether your rep agrees with you - we can show where they actually sit on a data-derived ideological spectrum, the same method political scientists use to study Congress," which no comparable civic tech tool (per the `civic-tech-ux-patterns.md` gap analysis - no evaluated equivalent of POPVOX or Countable does this) currently offers.
- **Design-principle reinforcement:** Because the score is derived purely from voting behavior rather than assigned from party affiliation, it fits naturally with UVote's "non-partisan by architecture" principle - it's a genuinely independent signal, not a repackaged party label.

**The risk, stated plainly and not undersold:** This is a materially more advanced undertaking than anything else in this research folder, for two concrete reasons:
1. **It requires a real quantitative methodologist, not just an engineer.** Correctly specifying, estimating, and validating a spatial voting model - handling identification issues, sparse-data instability, and communicating honest uncertainty rather than a falsely precise single number - is itself a nontrivial research problem, the kind of work reflected in the Clinton/Jackman/Rivers and Bateman/Lapinski critiques above. Building this credibly in-house without that expertise risks shipping a number that looks authoritative but is actually noise, which would directly undermine trust in the platform's other, better-evidenced scores.
2. **It is realistically a multi-year, partnership-dependent roadmap item, not a near-term feature.** The most credible path is a genuine academic collaboration - the researchers already profiled in `relevant-academics.md` (Marc Meredith or John Lapinski at Penn, both election/Congress-data specialists, with Lapinski having directly published on this exact method's limitations) are the most plausible starting point, rather than an internal build from scratch.

---

**Sourcing note:** Every citation above was independently verified against the publishing journal, the publisher's own page, Voteview's own citation of its maintainers, or the relevant CRAN/GitHub package page - none was included from recollection alone.
