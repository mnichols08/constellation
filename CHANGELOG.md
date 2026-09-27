# Changelog

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
