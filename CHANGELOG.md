# Changelog

## 1.9.0 — 2026-09-27

- Add an opt-in stable overview with configurable node caps up to 2048, sparse relationships and bounded automatic labels. Existing configs retain their original layouts and limits.
- Compute overview coordinates in Rust by account/seed and node ID, caching each node independently so style/filter changes reuse unaffected coordinates without history-dependent output.
- Cache plugin source snapshots separately from view settings, with explicit refresh and stale pending-load rejection.
- Extend projection, ring geometry, graph exploration and refinement bounds for larger graphs; regenerate WASM.

## 1.8.3 — 2026-09-27

- Ship an executable offline plugin example using separately packaged source and theme modules, two source instances and a custom diamond renderer.
- Add package READMEs and author guidance for metadata, cancellation, errors, credentials, deterministic fixtures and host integration.

## 1.8.2 — 2026-09-27

- Preserve independently bumped extension package versions during builds; the themes package is now 1.0.1 while unchanged pack content remains 1.0.0.
- Reject ambiguous release versions and non-styling theme payload fields. Fix resolution of an external theme pack named `custom`.
- Regression coverage checks exact versions, styling-only payloads and external theme resolution.

## 1.8.1 — 2026-09-27

- Snapshot registered source callbacks and source-instance config before asynchronous loading so caller mutations cannot change IDs or implementations mid-load.
- Reject graph ID collisions when combining plugin and application data; clone returned metadata and honor cancellation before each loader.
- Regression coverage exercises a paused load, caller mutation, duplicate merged IDs and cancellation.

## 1.8.0 — 2026-09-27

- Add isolated source registries, namespaced source instances, duplicate-ID errors and a working JSON-feed source for the core and CLI/Action.
- Package existing Look presets as independent 1.0.0 theme packs, with exact references or portable embedded presets.
- Add node-renderer hooks for custom SVG paths while retaining node metadata and hit targets.
- Document the source authoring contract, JSON-feed example and GitLab extension point. Preserve plugin and theme config in existing exports.

## 1.7.3 — 2026-09-27

- Add `--help`, `-h`, and `--version`; clarify package-engine recovery errors.
- Document package installation, CLI exit status, JSON output, offline fixtures, dry-run effects and exclusion reasons.
- Preserve actionable errors for primitive refinement settings instead of leaking an `in`-operator TypeError.

## 1.7.2 — 2026-09-27

- Report malformed node-color IDs, invalid ring arrays (including sparse arrays), and non-integer/out-of-range refinement intensity with specific field paths.
- Return multiple independent validation errors together; preserve category IDs containing spaces and valid angle endpoints.

## 1.7.1 — 2026-09-27

- Isolate returned projection data from the engine cache so API consumers cannot corrupt later renders by editing category members.
- Check the packaged engine actually used by the CLI instead of loading a second source-tree engine to report availability.
- Add a cache-mutation regression through the standalone package API.

## 1.7.0 — 2026-09-27

- Build a standalone, versioned `@constellation/core` ESM package with its complete dependency closure and WASM. The CLI/Action consumes that package internally.
- Add programmatic config validation, actionable config load failures, and the offline `validate --config` command.
- Add `--dry-run` and JSON `--explain`; expose the same filter report in the studio's summary data.

## 1.6.3 — 2026-09-27

- Clarify refinement limits, off-ring reservations, and the distinction between dragging locks and saved manual placements.
- Browser regressions verify focus, button labels, Enter/Space activation and Escape on every displayed sample node, plus visible keyboard focus.
- Test documented refinement defaults and intensity endpoints.

## 1.6.2 — 2026-09-27

- Cache collision rectangles inside Rust refinement and update them only when a pair moves, preserving candidate order and costs.
- Add `node scripts/benchmark-refinement.mjs`: uncached WASM timings for 64, 128 and 256 nodes, with snapping on/off and determinism checks. Timings depend on the host; use the same host for comparisons.

## 1.6.1 — 2026-09-27

- Reserve ring anchors for locked pairs as well as hidden nodes when their saved position is off-ring. This also protects pairs pinned by hidden labels.
- Skip assignment to fixed JavaScript nodes and labels entirely, preserving read-only objects and exact saved values.
- Regression coverage: off-ring locked anchor reservations and frozen fixed pairs.

## 1.6.0 — 2026-09-27

- Ship the existing deterministic Rust/WASM refinement pass and studio toggle with intensity 0–10. Manual and hidden node/label pairs remain fixed; ring snapping constrains candidates. Settings survive JSON, share links, SVG and workflow generation.
- Give keyboard-selected studio nodes an explicit focus outline, including when glow is disabled. Node buttons support Enter, Space, Escape and Shift-selection.
- Report omitted labels and their reasons in the studio filter summary. Rendering callers can receive `label-omitted` diagnostics through the fourth argument's `onDiagnostic` callback without changing SVG output.
- Retain default SVG output when refinement is disabled.
