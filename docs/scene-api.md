# Scene pipeline

Inspect scenes without producing SVG:

```sh
node src/cli.mjs --username example --fixture repos.json --scene --explain
node src/cli.mjs --username example --fixture repos.json --scene-json --reference-date 2026-09-01T00:00:00Z --output scene.json
```

`--scene` reports counts, layer IDs, omitted-label diagnostics and, with
`--explain`, filter counts. `--scene-json` emits canonical scene JSON. Both default
to stdout; explicit `--output` writes JSON, and `--dry-run` forces stdout. Neither
writes SVG, organization cache files or Action outputs. Fixture mode stays offline
unless configuration explicitly includes network source plugins. `--reference-date`
fixes the generation clock. `sceneStatistics(scene)` provides the same counts to
host applications; `pluginHost.createScene(...)` preserves registered source icons
and theme resolution without rendering.

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
Layer records drive phased composition; see [Scene layers](layers.md).
Config v6 layer controls provide visibility, opacity and constrained ordering.

Time-lapse scenes contain a latest scene and historical frames for crossfade.
The SVG time-lapse adapter renders these precomputed frames without rerunning
layout. Existing growth/orbit semantics and reduced-motion fallbacks are preserved.
Historical values retain their existing evidence limitations.

`createScene` takes the same arguments and runtime callbacks as
`renderConstellation`. Icon callbacks run during compilation, and their data
descriptors survive serialization. Compilation isolates the returned data from
the caller's records. Supply a fixed `referenceDate` for reproducible fixtures;
the compatibility default still uses the current time.

`serializeScene` writes canonical JSON with sorted object keys and preserves the
semantic array order. `parseScene` reads that format and rejects invalid versions,
duplicate IDs, dangling edges, malformed geometry, invalid ordering, cycles,
non-finite values and executable/non-JSON records. `validateScene` returns
`{ valid, errors }` without throwing. Rendering validates the scene boundary too.
Identical inputs, seed and reference date produce stable IDs, ordering and
geometry regardless of engine cache state. The compatibility wrapper's implicit
current clock is intentionally not a reproducibility guarantee.

At this stage scenes are internal trusted records. JSON serialization is for
fixtures and debugging, not a new untrusted configuration import boundary.
Continue using config parsing/migration for user-provided settings. The SVG
renderer preserves XML escaping and the constrained source-icon renderer.

The regression fixture `test/fixtures/scene-svg-v2.json` stores SHA-256 hashes
captured from the original 2.0 renderer for nine fixed-date configurations. Tests
compare those bytes after scene JSON round trips, including motion, selection,
manual coordinates, refinement, hidden nodes and historical crossfade/growth.

## Scaling and memory

Run `node --expose-gc scripts/benchmark-scene.mjs` to measure compilation,
serialization, parsing and SVG rendering separately for 2,048 nodes. It reports
cold and warm timings, JSON/SVG byte counts, and retained heap after twelve
iterations and forced GC. Retention above 16 MiB fails the check; timing is
reported rather than used as a machine-dependent pass/fail threshold.

On the Windows/Node 22.12 development host, warm medians were approximately
33 ms compilation, 34 ms serialization, 21 ms parsing and 42 ms rendering. The
fixture produced 2.42 MB JSON and 1.80 MB SVG and retained about 0.29 MB after GC.
These are observations, not performance promises. Scenes intentionally copy
metadata for isolation; retain only the scenes an application actually needs.
The existing engine/source caches retain their bounded policies.

Large-scene regression tests check all 2,048 nodes, edge references, label bounds,
mutation isolation and round trips. Every example JSON config is also compiled
and round-tripped through a fixed-date offline scene. The external-consumer test
exercises scene APIs with the packaged WASM outside this repository.
