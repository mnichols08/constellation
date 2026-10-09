# Developer Atlas

Developer Atlas is a navigation layer over Semantic Graph v1. It keeps three concerns separate:

- **Semantic Graph** records what exists, including stable IDs, relationships, provenance, and Evidence v1.
- **Atlas State v1** records which developer, group, project, or structural node is open.
- **Scene v1** is the deterministic projection rendered for the current state.

Navigation does not write to the graph. Its fingerprint, canonical JSON, provenance, Evidence v1, and Semantic Markdown remain stable. Atlas state also stays separate from camera position and semantic zoom.

## Navigation

The levels are `developer`, `group`, `project`, and `structure`. Groups and projects are resolved by canonical IDs in the active graph. A project entered from a group keeps that group in its breadcrumb. A project opened directly from Developer has no invented group parent. Structural nodes use the IDs and parent relationships from an already available Project Constellation graph.

Back history is bounded to 32 entries. Breadcrumbs use labels only for display and retain canonical IDs for navigation. `serializeAtlasState` returns a small URLSearchParams value with `v=1`; it does not include graph contents, camera geometry, credentials, or source text. `parseAtlasState` falls back to the nearest valid parent when a referenced entity is unavailable.

## Context and evidence

Group context exposes the canonical group label, provenance, basis, members, relationships, and existing evidence. `user` groups remain user-authored and `derived` groups remain derived. Project context uses only metadata and relationships present in the graph. Structural context reports the existing structural node and edge facts. No job role, architectural importance, or other unsupported interpretation is inferred.

## Imported and offline graphs

Developer, group, and project navigation works from an imported Semantic Graph without GitHub access. A graph without Project Constellation data shows that structural detail is not included. It does not fetch structure automatically. Live structure acquisition remains a separate explicit bounded scan flow.

Project paths are displayed as text. Raw source is not exposed. Private-source warnings already associated with Semantic Graph exports continue to apply.

## Web Component

For developer Semantic Graph inputs, `<constellation-view>` exposes the additive `atlasState`, `atlasBreadcrumbs`, `atlasContext`, `atlasShareState`, `navigateAtlasGroup(id)`, `navigateAtlasProject(id)`, `navigateAtlasStructure(projectGraph, nodeId)`, `atlasBack()`, `atlasForward()`, and `loadAtlasShareState(value, projectGraph?)` APIs. It emits `atlas-change` after successful navigation. Existing Scene/config inputs keep their existing behavior.

## Limits

Atlas is not Semantic Graph v2. It adds no semantic node or edge kinds, AI service, AST/function analysis, or call graph. Standalone export navigation and browser URL history are not required for the Studio/Web Component navigation contract.
