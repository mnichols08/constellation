# Hierarchical scenes

A node may reference another compiled scene or an explicit scene definition. Constellation does not infer repository architecture: supply the repository, technology, contributor or component data that supports each child view.

```js
import { createHierarchy, createScene } from '@constellation/core';
const options = { referenceDate: '2026-09-01T00:00:00Z' };
const root = createScene('example', repositories, options);
const scene = createHierarchy({ root: 'account', scenes: [
  { id: 'account', title: 'Projects', scene: root,
    links: [{ nodeId: 'example/compiler', target: 'compiler' }] },
  { id: 'compiler', title: 'Compiler technologies',
    definition: { account: 'example', records: suppliedTechnologies, options } },
] });
```

Every entry has a unique ID, title, and either a compiled `scene` or a declarative `definition` (`account`, `records`, `options`). Links name a node ID and a target scene ID; compilation stores the reference in `node.interaction.childScene`. Definitions use the existing transforms, mappings and Rust/WASM layouts. No executable module is loaded from a reference.

The serializable `hierarchy.version: 1` catalog contains scenes sorted by ID and a root ID. The enclosing scene is a copy of that root and provides ordinary static SVG fallback. Inputs are isolated, links must resolve, cycles are rejected, and compilation respects cancellation. Catalogs are bounded to 64 scenes, 16 levels and 16,384 aggregate nodes, including temporal frames.

Hierarchy datasets use the programmatic API or scene JSON rather than embedding large record collections into v6 share configurations. This keeps scene navigation distinct from source loading and preserves the existing config size/security boundary.
