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