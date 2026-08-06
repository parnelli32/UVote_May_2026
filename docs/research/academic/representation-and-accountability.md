# Descriptive vs. Substantive Representation and Accountability

UVote's central accountability mechanic is the **Constituent Score**: does a representative's actual vote match the district's aggregated position, and does that divergence get surfaced and require an explanation? This theme covers what political science actually knows about whether representatives respond to constituent-opinion information, and about the risk that identity-based ("descriptive") representation can substitute for and mask a lack of policy alignment ("substantive" representation).

---

## Giving legislators real, district-specific constituent opinion data changes how they vote

**Citation:** Butler, D. M., & Nickerson, D. W. (2011). "Can Learning Constituency Opinion Affect How Legislators Vote? Results from a Field Experiment." *Quarterly Journal of Political Science*, 6(1), 55-83. https://www.nowpublishers.com/article/Details/QJPS-11019

**Summary:** The authors surveyed 10,690 New Mexico residents on a governor's spending proposals, then shared district-specific results with a randomly selected half of the state legislature ahead of a vote. Legislators who received their district's actual opinion data were significantly more likely to vote in line with that opinion than legislators who did not. This is a genuine field experiment with random assignment, not a correlational survey - it demonstrates a causal effect of information, not just a correlation between representative behavior and constituent alignment.

**How this supports UVote:** This is the single strongest piece of causal evidence available that UVote's core mechanic - surfacing aggregated, district-level constituent sentiment directly to (or about) elected officials - can plausibly change actual legislative behavior, not just create a public record after the fact. It supports building and marketing a direct-to-official product surface (e.g., a "district sentiment" view an official or staffer can check before a vote), not only the public-facing accountability score, as a distinct value proposition in the B2B/official tier.

---

## Representatives systematically misjudge what their district wants - the accountability gap is an information gap

**Citation:** Broockman, D. E., & Skovron, C. (2018). "Bias in Perceptions of Public Opinion among Political Elites." *American Political Science Review*, 112(3), 542-563. https://www.cambridge.org/core/journals/american-political-science-review/article/abs/bias-in-perceptions-of-public-opinion-among-political-elites/2EF080E04D3AAE6AC1C894F52642E706

**Summary:** See full summary in `legislative-information-access-and-trust.md`. The relevant finding here: officials' misperception of constituent opinion is large and systematic, driven substantially by who chooses to contact them (a self-selected, unrepresentative sample), rather than by officials deliberately ignoring their district.

**How this supports UVote:** Reframes the Constituent Score not as an adversarial "gotcha" mechanic but as filling a real informational vacancy most officials already suffer from. This distinction matters directly for UVote's stated design principle that alignment scores are described as "alignment," never "grade" or "performance" - the research supports treating divergence as most often a signal of missing information rather than willful misrepresentation, which should shape both the product's tone (a structured prompt to explain, not a public shaming mechanic) and the sales pitch to officials (a tool that helps them represent better, not a scorecard used against them).

---

## Sharing identity with a representative can reduce accountability for how that representative actually votes

**Citation:** Jones, P. E. (2016). "Constituents' Responses to Descriptive and Substantive Representation in Congress." *Social Science Quarterly*, 97(3), 682-698. https://onlinelibrary.wiley.com/doi/10.1111/ssqu.12243

**Summary:** In an experiment where Black, Hispanic, and white respondents evaluated a fictitious member of Congress whose race/ethnicity and policy positions were independently randomized, respondents perceived greater substantive (policy) representation from a legislator who shared their race, regardless of that legislator's actual voting record. In other words, identity match caused people to give a legislator credit for representing their views even when the actual voting record didn't support it.

**How this supports UVote:** This is a direct caution relevant to UVote's non-partisan-by-architecture principle: identity and affiliation cues (party label, and by extension photos, endorsements, or other identity signals) can distort how citizens judge whether a representative "actually" represents them, independent of the representative's real voting record. It supports keeping the Constituent Score computation and its public display strictly tied to recorded votes vs. district sentiment, and continuing to avoid surfacing party affiliation or other identity cues in ways that could substitute for, rather than complement, the actual vote-based alignment data.

---

## Representatives who share constituents' identity do more constituent-facing casework - but this is a different channel from floor votes

**Citation:** Lowande, K., Ritchie, M., & Lauterbach, E. (2019). "Descriptive and Substantive Representation in Congress: Evidence from 80,000 Congressional Inquiries." *American Journal of Political Science*, 63(3), 644-659. (Winner, AJPS 2019 Best Article Award.) https://onlinelibrary.wiley.com/doi/abs/10.1111/ajps.12443

**Summary:** Analyzing roughly 80,000 constituent casework inquiries to Congress, the authors find that women, racial/ethnic minorities, and veterans in Congress are more likely to substantively act on behalf of constituents who share their identity - but this effect shows up in casework and constituent service, a largely invisible legislative channel, not necessarily in floor votes, which are the one legislative behavior that is already public and comparable across officials.

**How this supports UVote:** Reinforces the product decision to build the Constituent Score specifically around recorded floor/committee votes rather than harder-to-observe representational behaviors like casework - votes are the one legislative activity that is already public, comparable across officials and districts, and directly matchable against a district's aggregated position, which is exactly the kind of structured, comparable record this literature says is otherwise largely invisible to constituents.
