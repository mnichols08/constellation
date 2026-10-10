# Performance Budgets

Track what matters; avoid accidental regressions.

## Metrics

### Package
- core package size;
- Web Component entry size;
- raw `.wasm`;
- compressed `.wasm`.

The root build keeps `src/wasm/constellation_core_bg.wasm` as the Rust/WASM
build artifact and generates `src/wasm/inline.mjs` from that exact binary. The
Core package uses the inline artifact for both engine startup and standalone
HTML generation, so it does not ship a second raw copy of the same WASM bytes.
`node scripts/build-rust.mjs` regenerates both artifacts and
`node scripts/build-core.mjs` refreshes the package copy.

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

## Visual Storytelling composition baseline

Measured locally on Node.js 22.12.0 with the generated Rust/WASM engine, using
`scripts/benchmark-story-composition.mjs` (five iterations per size):

| Projects | Mean composition | Input | Output |
|---:|---:|---:|---:|
| 6 | 0.24 ms | 1,048 B | 3,135 B |
| 12 | 0.71 ms | 1,932 B | 10,178 B |
| 128 | 34.7 ms | 16,371 B | 90,650 B |
| 512 | 442.1 ms | 64,360 B | 292,068 B |

The 512-project stress case hits the 32,768 family-pair generation-work bound;
its latency is a stress bound, not the expected Profile Story workload. The
12-project candidate SVG in the benchmark was 34,430 bytes with 24 composed
edges. Current raw WASM is 545,123 bytes (748,281 bytes as base64 inline); the
previous main baseline raw WASM was 450,637 bytes. The Core package measures
1,741,608 bytes after removing the duplicate raw WASM copy. Browser startup cost
was not measured in the baseline, so no before/after startup claim is made.
