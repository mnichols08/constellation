# Story candidates

Developer Semantic Graph v1 can produce three bounded story views:

- **Projects** keeps project names prominent and removes automatically derived group abstraction while retaining user-authored families as evidence-backed links between visible projects.
- **Technical Shape** projects existing evidence-backed groups and relationships.
- **Journey** uses the existing temporal stack when at least six projects span three or more years, with three populated periods and changing language/topic evidence. Otherwise it is unavailable with a plain reason.

The candidate set is capped at three views and project selection at 12 representatives. Explicit `curatedRole` values are considered before marginal language/topic evidence; project names break ties deterministically. Repository count and stars do not establish importance. The Projects view is the fallback when themes do not differentiate the available evidence.

The Studio displays story names in plain language. Graph Quality scores remain developer-facing and are not shown to normal users. No candidate makes claims about skills, job titles, seniority, or professional growth.

Each candidate composes a bounded subset of project-to-project connections from
existing language/topic evidence, authored families, and explicit project
relationships. See [Story Composition v1](story-composition.md) for evidence,
ranking, diagnostics, and static SVG line semantics.
