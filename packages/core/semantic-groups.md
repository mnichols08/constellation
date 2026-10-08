# Semantic Groups

Semantic Groups adds a reversible project-level overview. A group is a view over existing project nodes; the canonical scene and its project evidence remain available for expansion.

## Levels and exports

The independent levels are `overview`, `groups`, and `projects`. `overview` and `groups` currently use the same grouped projection. They do not depend on camera scale, and v3.12.0 does not automatically change levels while zooming.

Set `semanticZoom` in Config v7 to choose a grouped static render:

```json
{
  "semanticZoom": { "enabled": true, "level": "groups" }
}
```

Pass `{ semanticLevel: 'groups' }` to `renderSceneSVG` or `renderSceneHTML` for an explicit grouped export. Use `projects` for full project detail. A grouped SVG shows a distinct hexagon, its family/derived type and project count. Its accessible title identifies the compressed members.

## Project families

Add an optional `projectFamilies` object to config. Authored IDs are stable and remain unchanged by labels or style:

```json
{
  "projectFamilies": {
    "open-tooling": {
      "label": "Open Tooling",
      "members": ["owner/open.release", "owner/open.text", "owner/open.slug"]
    }
  }
}
```

Core emits `group:user:open-tooling`. Members absent from a filtered scene are ignored; a family is projected only when at least two members are present. A project cannot belong to more than one family in a projection. The authored label is preserved. Group evidence says “Defined by you.”

## Derived groups and trust

The v3.12.0 derived rule groups repositories with the same repository owner. Repository-owner grouping means repositories share the same owner namespace. It does not assert that the owner is a GitHub Organization. It requires at least two selected projects, must cover no more than 75% of the scene, and runs only through 256 projects. Derived repository-owner group identity is based on normalized owner identity, not the currently visible project membership. Its basis is `repository-owner:<owner>`; names, language similarity, topics and contributor overlap do not independently create groups. Scenes above 256 projects use authored families only. Weak metadata similarity stays ungrouped.

## Core API

`buildSemanticHierarchy(scene, options?)` returns the source scene, stable group records and project IDs. `projectSemanticLevel(scene, level, { hierarchy, expanded })` returns a separate scene projection. `expandGroup(scene, hierarchy, groupId)` and `collapseGroup(...)` return a new projection while retaining original project IDs and geometry. `explainGroup(hierarchy, groupId)` returns provenance, basis and bounded member summaries.

Inter-group edges are created only from real scene edges whose endpoints project to different visible nodes. Aggregate edges retain up to 256 source edge IDs while preserving the complete underlying relationship count. Explanations report truncation from the total relationship count versus retained IDs. Shared language/topic reasons are included only when every represented edge carries that reason. Internal relationships are not drawn as self-loops.

The Core computations are deterministic JavaScript domain logic; they need no DOM, network, AI, or Rust computation. Existing WASM remains responsible for graph layout and traversal. Manual project geometry remains on the canonical scene; group positions use the member centroid and expanded members recover their original coordinates. No generated project record is written to source data.

## Evidence and interaction

Scene Evidence v1 accepts group subjects while keeping existing node attachments valid. The projected group has a user fact or bounded derived basis fact. `explainEdge` reports aggregate counts and underlying edge references. Group SVG labels do not rely on color to indicate their type.

The Web Component exposes `semanticLevel`, `expandGroup(id)`, and `collapseGroup(id)`. Group selection provides a keyboard reachable inspector with “Why grouped?”, provenance, basis, member names and an expand/collapse button. The component keeps its canonical source scene while it rebuilds a projection.

Grouped `renderSceneHTML` is a self-contained offline artifact with inline runtime/WASM and the existing CSP. It supports individual group expand/collapse when the source scene has at most 256 projects, is at most 256 KiB, has at most 32 groups, and the precomputed SVG states fit within a 4 MiB bound. Larger exports keep the selected grouped view and explanations but omit expansion controls to bound artifact growth. Manual wheel zoom does not switch semantic level.

## Bounds and compatibility

- 2,048 source projects per scene (existing Scene API v1 bound).
- 256 family definitions and 256 total projected groups.
- 2,048 members per family and 32,768 configured member references in total.
- Derived repository-owner grouping disabled above 256 projects.
- 256 edge references per aggregate; full relationship count retained.
- Config remains v7; Scene API, Evidence and Web Component APIs remain version 1.

No repository file tree, dependency parsing, source nodes, AI grouping, or project-purpose inference is part of this release.

## Benchmark snapshot

`node scripts/benchmark-semantic-groups.mjs` measures hierarchy build, projection, expand/collapse, JSON sizes and offline HTML size on this implementation. One local run produced:

| Projects | Groups | Hierarchy | Projection | Expand | Collapse | Source JSON | Grouped JSON | Offline HTML |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | 8 | 4.30 ms | 4.28 ms | 1.86 ms | 1.16 ms | 31,997 B | 19,284 B | 1,131,945 B |
| 256 | 8 | 1.56 ms | 4.73 ms | 5.47 ms | 4.32 ms | 173,491 B | 40,789 B | 1,838,356 B |
| 2,048 | 1 authored | 14.01 ms | 47.13 ms | 54.49 ms | 44.79 ms | 1,390,886 B | 1,438,516 B | 4,180,789 B |

The 2,048 project case deliberately disables derived grouping; the benchmark uses one authored family. Timings are a single local run and are diagnostic, not performance guarantees. At that maximum scene size a single partial family does not reduce serialized size, so grouped export should be chosen when the family meaningfully compresses the visible graph.
