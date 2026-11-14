# ADR-0010: ConstellationSpec engine as a separate Rust/WASM module

- Status: Accepted
- Date: 2026-11-13
- Owners: Mikey Nichols
- Related: [ADR-0001](ADR-0001-AI-SEMANTIC-BOUNDARY.md), [ConstellationSpec](../../constellation-spec.md), [AI architecture](../../ai/AI-ARCHITECTURE.md), epic #54

## Context

Epic #54 asks for a semantic contract (`ConstellationSpec`), a Rust validator and compiler, a persistent engine with retained indexes, provider-neutral tools, a bounded model loop, and a Studio flow. [ADR-0001](ADR-0001-AI-SEMANTIC-BOUNDARY.md) already decided that models author intent and Rust owns validity and geometry.

Two enforced budgets constrained where the engine could live:

- the standalone HTML runtime, which embeds the core WASM binary, must stay under 1 MiB (`test/interactive-html.test.mjs`); on `main` it was 138 bytes under;
- `@constellation/core` must stay under 2 MiB (`test/web-component-consumer.test.mjs`); on `main` it was about 47 KB under.

Built into `constellation-core`, the engine added 239 KB of WASM at first and 120 KB after size work (shared sort instantiation, vector-backed indexes, hand-written evidence parsing, schema text moved out of the binary). Either figure fails both budgets, and every standalone export would carry an engine it never calls.

## Decision

1. **A second crate, `rust/constellation-spec`, built to its own WASM module** (`src/wasm/constellation_spec_bg.wasm`, about 240 KB). `constellation-core` is unchanged and does not link it.
2. **A registration seam in core** (`src/spec-host.mjs`, about 1 KB). Core never imports the engine. Configuration validation and layout call a registered host when present. Without one, `constellationSpec` is size-checked inert data.
3. **`constellationSpec` is an optional configuration field.** `CONFIG_VERSION` stays 7: the field is additive and older readers drop it.
4. **Rust returns existing scene options plus ring positions.** A compiled spec maps to `arrangement`, `connectionBasis`, `connectionWeight`, `sortBy`, `maxRepos`, `orbitShape` and `identityRing`. Only ring placement, which no option can express, is requested from the engine during layout.
5. **A separate package, `@constellation/spec`,** carries the engine, the generated schema and the optional prompt layer (`./ai`).
6. **The Studio loads the engine on first use**: when Describe opens, or when a design that carries a spec is rendered.
7. **The schema is generated natively, not shipped in WASM.** `schemas/*.json` and `src/constellation-spec-schema.mjs` come from the Rust vocabularies; a test fails when they are stale.

## Why this layer?

- **Rust** owns the typed spec, validation of untrusted input, evidence matching, bands, edges and ring geometry. These are correctness and computation, and the same code serves a person, a script or a model.
- **JavaScript** owns model networking, the bounded orchestration loop, mapping GitHub records to evidence, and Studio state.
- **HTML/CSS** own the dialog and the plan.
- The engine has no DOM, network, clock or randomness. No provider concept appears in Rust or in the tool definitions.

## Alternatives considered

- **Add the engine to `constellation-core`.** Rejected: fails both size budgets and taxes every standalone export.
- **Raise the budgets.** Rejected: they protect README and export consumers, and the engine is optional for them.
- **One crate with a cargo feature, built twice.** Rejected: the package would ship two copies of the core binary, or exports and the Studio would disagree about which binary they embed.
- **Run `wasm-opt` to make room.** Not adopted here: it changes the build toolchain for every artifact and would need more than an 11% reduction just to break even. It remains an option for the whole project.
- **Make the spec its own layout engine id (`layoutEngine`).** Rejected: specs should compose with every existing arrangement, export and manual control rather than replace them.
- **Store derived star positions in `starPositions` on apply.** Rejected: it would mark every star as hand-moved and go stale when the shown projects change. Positions are recomputed from the spec at render time instead; real manual moves still win.
- **Let the model emit options or coordinates directly.** Rejected by ADR-0001.

## Consequences

### Positive
- Core binary, standalone exports and both budgets are untouched. Visitors who never author a spec download nothing new.
- One contract for people, scripts, configuration files and models, with machine-readable diagnostics.
- The whole flow is testable offline; CI needs no provider credentials.

### Negative / tradeoffs
- The spec module duplicates the Rust runtime that core already carries (allocator, `serde_json`, formatting), so it is larger on its own than the 120 KB it would add inside core.
- Hosts must call `registerSpecHost` (or import `src/spec-register.mjs`) before rendering a configuration that carries a spec. The CLI and Studio do this automatically.
- The lines drawn on the map come from existing connection settings derived from the spec; the engine's weighted edges are used for discovery and review, not rendering.
- Layout asks the engine for ring positions on each layout pass. Measured locally: about 0.5 ms for 25 projects, 1.4 ms for 100 and 40 ms at the 2,048 limit. This path skips relationship scoring.

### Compatibility
- Additive. No existing configuration, share link, scene or export changes. Removing the field restores previous behaviour exactly.
- `schema_version` governs the spec's own evolution; see the [compatibility rules](../../constellation-spec.md#compatibility).

## Validation

- Rust: `cargo test --manifest-path rust/constellation-spec/Cargo.toml` (validation, resolution, compilation, engine, tools, schema drift, deterministic fuzzing). `test/rust-spec.test.mjs` runs it inside `npm test`, so existing CI covers it.
- Node: `test/constellation-spec.test.mjs`, `test/ai-describe.test.mjs`, `test/ai-offline-demo.test.mjs`.
- Benchmark: `npm run benchmark:spec` (timings at 25 to 2,048 projects, with budgets).
- Browser: `e2e/describe.spec.mjs` (plan before apply, Cancel, Undo/Redo exactness, follow-ups, failing and self-correcting adapters, axe, lazy loading).
