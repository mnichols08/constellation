# ADR-0012: A tech stack that reads without explanation

- Status: Accepted
- Date: 2026-11-14
- Owners: Mikey Nichols
- Related: [ADR-0009](ADR-0009-TECH-STACK-VIEW.md), [Tech stack maps](../../tech-stack.md), [Recruiter evidence](../../recruiter-evidence.md)

## Context

The tech stack map is the view most useful to someone matching a profile against a list of technologies, but it showed only counts. A reader could not tell whether "React in 9 repositories" was current, sustained, or a starter-kit default, could not see which technologies went together without decoding line thickness, and could not get from a technology to a project. A README image also arrives without the sheet's tables and notes.

## Decision

1. **Derive evidence from the scan already made** (`src/tech-stack/evidence.mjs`). No new requests: each repository's creation and last-push dates are already listed.
2. **Time.** A technology's years run from the first declaring repository's creation to the last push to any of them. It is "current" if one was pushed to within 365 days of the scan.
3. **Stacks from the data.** Combinations of frontend, backend and data technologies declared together are counted per repository (two to four items, at most six considered per repository), reduced to those not contained in an equally common larger one, and the top four non-overlapping are shown. Accounts with fewer than six such repositories may show a single repository's stack.
4. **Order by sustained, current work.** A repository whose first and last activity are at least 30 days apart counts as worked on over time. Current first, then sustained count, then total.
5. **Examples.** Up to two repositories per entry: the developer's featured ones first, then live, sustained, most starred.
6. **Tooling apart.** Test runners and build tools are listed on one line and never name a stack.
7. **Two README artifacts.** A static summary card (`renderTechStackCardSVG`, now the default image) and a Markdown block with links between marker comments (`renderTechStackMarkdown`). The star map remains available (`tech-stack-style: map`).

## Consequences

- The default README image for `tech-stack: 'true'` changes from the star map to the card. The feature had not been released under a version tag.
- Dates are repository dates, not per-technology commit history: a technology added to an old repository last month shows that repository's whole span. The view says how dates are derived.
- The Markdown list is a snapshot pasted by hand. The Action does not edit a README on the default branch.
- Nothing here measures ability. Wording avoids "experience", "skill" and "years of".

## Alternatives considered

- **Per-technology commit history.** More exact, but one or more extra requests per manifest per repository; rejected for the request budget.
- **Have the Action rewrite the README.** Deferred: it means committing to the default branch on a schedule, which deserves its own opt-in and review.
- **Weight by code size.** Language byte counts include generated and vendored files and say nothing about frameworks.
- **Keep the fixed list of named stacks.** It only fit web stacks someone had thought of in advance. The older table of common combinations stays below the map.
