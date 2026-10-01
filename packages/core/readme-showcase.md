# README Showcase

**GitHub activity tells Constellation what exists. You decide what represents you.**

Project roles let you give your own work a clear place in a README constellation. They describe how you want a project presented; they are not GitHub metadata and do not replace stars, activity, archive state, forks or topics.

## Project roles

- **Featured** projects act as visual anchors. Their nodes and labels receive priority, their real connections are easier to see, and their shared languages/topics can stay visible when the output is reduced.
- **Supporting** projects retain normal importance and can fill out a featured project's ecosystem.
- **Experimental** projects receive lighter emphasis.
- **Historical** projects remain present but are visually subdued.

Featured order is an explicit, bounded priority. Set roles in the onboarding curation step or Studio's **Showcase** section. Use the order field or Move up/Move down controls; dragging is never required. Recommendations help choose repositories, but never assign a role without your action. Repositories without roles keep the existing behavior.

For example, roles can be stored with a config:

```json
{
  "projectShowcase": {
    "owner/sprout": { "role": "featured", "priority": 1 },
    "owner/kitchen-inventory": { "role": "supporting" },
    "owner/old-prototype": { "role": "historical" }
  }
}
```

Roles and priority are account/repository scoped and survive config export/import, share links, workflow generation and daily regeneration. If a repository becomes private, disappears or is unavailable, it is skipped and reported; its saved role remains so it can return with the project. Randomize and Generate another preserve roles and featured ordering.

## README presentation

Choose a presentation in **Showcase**. These modes derive a view from the same selected projects, roles and visual settings.

- **Recruiter · project orrery** makes the exported SVG the complete artifact. See the encodings and evidence limits below.
- **Full universe** keeps the broad selected graph and gives Featured projects extra emphasis.
- **Featured work** focuses on Featured and Supporting projects when those roles are available; their real language/topic relationships remain the source of connections.
- **Current focus** orders projects using a supplied public activity snapshot. Without one, it keeps the existing order and explains that activity data is missing. It never invents recency.
- **Technology identity** uses the existing combined project/language/topic graph to show real membership around Featured work.
- **Project journey** gives Featured and Historical roles context from available creation dates and configured historical data. It does not create historical star counts or dates.

## Rings and treatment

**Organize rings by** supports Identity / automatic, Project importance, Activity and Manual. Project importance assigns available identity-ring anchors to Featured, Supporting, Experimental and Historical projects in that order. Ring capacities remain deterministic; projects that do not fit their preferred ring use remaining anchors. Saved manual node coordinates are not changed when switching modes.

**Featured project treatment** offers Star only, Star + prominent label and Compact spotlight. Spotlights show bounded repository description and technology text, escape all metadata, and show at most three well-spaced projects. Crowded and small outputs fall back to stars and labels.

## Output profiles

- **Hero:** 900 × 560 for the full composition.
- **Wide README:** 900 × 320 with reduced label and background density.
- **Compact:** 900 × 180, retaining higher-priority labels and reducing background decoration.
- **Square:** 480 × 480 for documentation and side-by-side layouts.

Profiles change composition budgets, not the saved project selection. A smaller export can omit lower-priority labels without removing roles or repositories from your config. Reduced motion and current SVG/HTML accessibility behavior continue to apply.

## Recruiter project orrery

Select **Showcase → README presentation → Recruiter · project orrery**. This presentation uses a fixed 1200 × 940 canvas, scalable to README widths of 800–1200 pixels, in place of compact export geometry. Themes and animation preferences remain available. Positions, size, color and the permanent key have fixed data meanings; manual positioning, category graphs, perspective, decorative motion and profile scores do not apply to this presentation. Other presentations retain their settings.

| Visual | Evidence |
| --- | --- |
| Distance from developer | Latest non-future `pushed_at` or observed push, pull-request or release event. Bands: under 30 days, under roughly 6 months, under roughly 18 months, older. Unknown dates are explicitly labeled on the outer band. Repository recency is not necessarily the developer's own recent activity. |
| Planet radius | Distinct calendar months with loaded commits or work events, in four buckets: 1–2, 3–8, 9–23, 24+. No stars, commit volume or repository-age sizing. `+` marks a lower bound from partial history. Hollow planets mean history unavailable, not brief work. |
| Planet color and language counts | Primary repository language; counts cover displayed projects, not skill levels. |
| Moons | Distinct loaded contributor logins excluding the profile owner. Up to six, with overflow. Capped scans use `+` lower bounds. Missing scans say “contributors unknown”; no moons alone does not establish solo work. |
| Bold project name | Explicit `projectShowcase` Featured role, independent of radius. |
| CONTRIB / EXT | An external repository with observed account participation / external ownership with participation unverified. Contributor login, commit author login or account work events establish participation; ownership alone does not. |
| Segmented arc | Active quarters over the last three years, oldest to newest clockwise, only when complete loaded branch commit history is available, and only for featured or substantial projects. Gaps describe that branch history, not all work across all branches. |
| Quiet connection | Explicitly curated pair in `projectRelationships`; never inferred from shared languages or topics. |

Projects use existing selection and filters, capped at twelve, prioritized by authored roles/order then repository push recency. Other loaded public repositories are counted separately, including those outside the current filters. This is not an account-wide total when discovery is partial. Short names in labels retain full names in SVG titles. Only contributor moons and recent featured outlines animate; reduced-motion and static exports retain every signal.

Add related pairs in Showcase, one `owner/repo ↔ owner/repo` per line, up to six. Both endpoints must be displayed for a connection to appear. Example config fields:

```json
{
  "readmePresentation": "recruiter",
  "projectShowcase": {
    "alice/atlas": { "role": "featured", "priority": 1 },
    "alice/atlas-mobile": { "role": "supporting" }
  },
  "projectRelationships": [["alice/atlas", "alice/atlas-mobile"]]
}
```

The renderer reuses `historyData`, `commitHistoryData`, `commitFieldData` and `organizationData` snapshots already supplied by the application or API. Selecting the presentation performs no network enrichment. Public metadata alone cannot establish sustained history or contributor counts. Authenticated activity/commit/contributor loading remains explicit in the existing Studio controls. Config/share links preserve curation, not runtime snapshots: another device or a daily workflow must reload evidence. GitHub's recent event feed and capped commit samples cannot establish lifetime continuity; absent periods in these samples are never rendered as inactivity gaps. Counts describe observed repository work, not a measure of personal effort or quality.

[Example SVG](../examples/recruiter.svg) uses explicitly synthetic offline test data. Browser regressions save normal, static and key-hidden previews under `.cache/recruiter/` at 800, 1000 and 1200 pixels. Real-user testing should check understanding of lower bounds, hollow unknown-history planets, external participation markers and the distinction between repository activity and individual work.
