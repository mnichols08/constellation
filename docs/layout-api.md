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

This is the transitional 2.x interface. Capability declarations, trusted host
registration and additional execution hardening follow in the remaining 2.4
patches before the stable 3.0 contract is declared.
