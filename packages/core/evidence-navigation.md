# Evidence Navigation

Evidence Navigation v1 answers which projects relate to a selected project and why, using only the evidence already recorded in Semantic Graph v1. Static SVG is unchanged.

## What counts as a relationship

Navigation explains only facts already recorded in [Semantic Graph v1](semantic-graph.md). The vocabulary is closed and matches [Story Composition](story-composition.md):

| Type | Evidence | Shown as |
| --- | --- | --- |
| `explicit-relationship` | a user-authored `project-relationship` edge | Explicitly related by the author |
| `authored-family` | both projects are `member-of` the same user-authored project family | Same project family (defined by the author) |
| `shared-language` | both projects `uses-language` the same primary language | Shared primary language |
| `shared-topic` | both projects `has-topic` the same repository topic | Shared repository topic |

Derived repository-owner groups describe a namespace, not a relationship, so they never create connections; navigation reports them as an informational diagnostic instead. Shared metadata is not presented as a dependency, collaboration, or chronology, and navigation produces no score or ranking of a developer. Connection order (more relationship types first, then canonical project ID) is a stable presentation order, not a judgment.

Every relationship carries evidence references: the shared node ID and label (language, topic, or family) when there is one, the semantic edge IDs that support it, and their provenance categories (`source`, `user`, `derived`).

## Core API

```js
import { evidenceNavigationGraphFromScene, createEvidenceNavigator, navigateEvidence } from '@constellation/core';
const graph = evidenceNavigationGraphFromScene(scene); // null when the scene has no portable semantic truth
const navigator = createEvidenceNavigator(graph);       // retained Rust index; build once per graph
const result = navigator.navigate('octo/compiler', 2);  // depth 1 (default) or 2
navigator.destroy();
```

`evidenceNavigationGraph(semanticGraph)` adapts any Semantic Graph v1 directly. It keeps identities, labels, provenance, and the four supporting edge kinds; descriptions, URLs, and evidence payloads stay in the source graph. `navigateEvidence(graph, projectId, { depth })` is the one-shot form. Navigation never modifies the graph, Scene, or config.

A result contains `version`, `status` (`ok` or `unavailable`), `project`, `depth`, `connections` (each with `projectId`, `label`, `path`, `relationshipTypes`, and `relationships[].evidence`), `secondDegree` (each with `via`, `viaCount`, a canonical `path` through the lexicographically first intermediate project, and the relationship types of both `hops`), `truncated`, and `diagnostics`. Diagnostics use stable codes: `unknown-project`, `not-a-project`, `no-supported-relationships`, `derived-groups-not-relationships`, `edges-without-supported-endpoints`, `connections-truncated`, `second-degree-truncated`, and `traversal-budget-exhausted`. Malformed input, unsupported request fields, invalid depths, and invalid IDs are errors; an unknown project is an `unavailable` result, not an exception.

## Determinism and limits

Results are independent of node and edge order. Graph input is bounded to 4 MB, 4,096 nodes, and 16,384 edges; requests to 8 KiB and depth 1–2. Each degree returns at most 256 projects, each relationship type at most 32 evidence references, and each second-degree project at most 16 listed intermediates (with the full `viaCount`). Second-degree traversal stops after 262,144 hub-member visits and reports `traversal-budget-exhausted`. The navigator caches at most 64 recent results.
