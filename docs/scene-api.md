# Scene pipeline

Constellation 2.1 introduces a serializable internal scene between graph/layout
computation and rendering. The existing `renderConstellation` API composes
`createScene` and `renderSceneSVG`, so CLI, Action, Studio and source plugins retain
their existing behavior. Rust/WASM still computes layout and refinement.

```js
import { createScene, renderSceneSVG, serializeScene } from '@constellation/core';

const scene = createScene('example', [
  { full_name: 'example/core', name: 'core', language: 'Rust', stargazers_count: 42 },
], { referenceDate: '2026-09-01T00:00:00.000Z', animate: false });
const fixture = serializeScene(scene);
const svg = renderSceneSVG(JSON.parse(fixture));
```

Scene records include version, kind, account/seed/reference-date metadata,
viewport, nodes, edges, labels, layers and identity geometry. Nodes own their
coordinates, radius, resolved color/glow/shape, source metadata, visibility and
optional trusted source icon descriptor. Edges reference node IDs and carry
relationship metadata, geometry and emphasis. Labels have plain text and computed
coordinates. These records contain no markup or executable callbacks.

The `presentation` record carries resolved legacy styling, graph summary and
temporal decoration data while rendering is extracted incrementally. It is an
internal compatibility detail, not the final stable Scene API v1 contract.
Layer records currently identify the intended composition; layer controls arrive
in 2.2. Do not treat editing layer order as a supported operation yet.

Time-lapse scenes contain a latest scene and historical frames for crossfade.
The SVG time-lapse adapter renders these precomputed frames without rerunning
layout. Existing growth/orbit semantics and reduced-motion fallbacks are preserved.
Historical values retain their existing evidence limitations.

`createScene` takes the same arguments and runtime callbacks as
`renderConstellation`. Icon callbacks run during compilation, and their data
descriptors survive serialization. Compilation isolates the returned data from
the caller's records. Supply a fixed `referenceDate` for reproducible fixtures;
the compatibility default still uses the current time.

At this stage scenes are internal trusted records. JSON serialization is for
fixtures and debugging, not a new untrusted configuration import boundary.
Continue using config parsing/migration for user-provided settings. The SVG
renderer preserves XML escaping and the constrained source-icon renderer.

The regression fixture `test/fixtures/scene-svg-v2.json` stores SHA-256 hashes
captured from the original 2.0 renderer for nine fixed-date configurations. Tests
compare those bytes after scene JSON round trips, including motion, selection,
manual coordinates, refinement, hidden nodes and historical crossfade/growth.
