# Layout interface

`layoutScene(scene, options, context)` places scene nodes through the existing
engine. Nodes need stable `id` and repository-compatible `metadata` records.
The result contains `positions`, keyed by node ID, and the accompanying Rust
relationship result (`edges` with input-node indices and `total`). Returned
coordinates and edges are isolated from engine caches.

```js
import { createScene, layoutScene } from '@constellation/core';
const scene = createScene('example', [
  { full_name: 'example/core', name: 'core', language: 'Rust' },
], { referenceDate: '2026-09-01T00:00:00Z' });
const layout = layoutScene(scene, { arrangement: 'galaxy' });
console.log(layout.positions['example/core']);
```

Built-ins retain field, rings, orbital, force, galaxy, solar-system and organization
arrangements. The existing `nodeCap > 100` mode uses stable large-graph overview
coordinates. Existing artifact/organization adapters provide their coordinates to
the same Rust relationship engine; no Rust algorithms have been replaced by JS.

Context can supply an account, seed, reference timestamp, abort signal and the
pre-layout graph during compilation. Existing manual positions override generated
positions. Ring rotation, snapping, graph mode, selected relationship basis and
large-graph settings retain their current semantics. The compiler calls this
interface before refinement and scene serialization; SVG rendering does not
rerun layout. The deprecated non-WASM field fallback remains in the compatibility
compiler until its planned removal.

`layoutCapabilities(id, options)` reports the effective layout, requested layout,
maximum node count, manual-position, ring-snapping, deterministic-seed, animation,
refinement and WASM capabilities. Regular repository layouts support 100 nodes;
membership graphs support 256; stable overview supports 2,048. A node cap above
100 selects stable overview without changing the established compatibility rule.
Snapping metadata distinguishes initial layout snapping from editing/refinement.

`diagnoseLayout(scene, options, context)` returns capabilities and diagnostics.
Execution reports automatic overview selection and rejects unsupported graph sizes
or unavailable required WASM before computation. Metadata is returned as isolated
data. This remains the transitional 2.x contract; explicit host registration and
execution hardening follow before the stable 3.0 contract is declared.
