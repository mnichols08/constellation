# Performance Budgets

Track what matters; avoid accidental regressions.

## Metrics

### Package
- core package size;
- Web Component entry size;
- raw `.wasm`;
- compressed `.wasm`.

### Startup
- module import/init;
- WASM instantiation;
- first scene compute;
- first render.

### Computation
Use fixed fixtures such as 25, 100, 500, and upper-supported node counts.

Measure graph construction, semantic compile, layout, refinement, pathfinding, repeated neighbors, and group preview.

### Memory
Watch retained engine memory, duplicated JS/WASM copies, caches, scene copies, and spatial indexes.

## Optimization order

1. eliminate repeated work;
2. improve algorithmic complexity;
3. retain indexes/state;
4. reduce boundary copies;
5. move work off main thread;
6. tune numeric representation;
7. consider SIMD/threads.

Optimization PRs should include before/after measurements.
