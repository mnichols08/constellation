# Changelog

## 3.2.0 — 2026-09-29

- Add direct GitHub token sign-in to the hosted Studio, verify account identity, and start guided setup automatically.
- Enable hosted live pinned-repository previews and authenticated public-data requests without a local server.
- Keep tokens only in page memory, with sign-out, rejected-token handling, cancellation and credential confinement to GitHub's API.
- Preserve anonymous browsing and local `.env` authentication. Hosting remains GitHub-only; OAuth redirect sign-in is deferred pending an external backend.
- Rebuild Core and web-component packages at 3.2.0.

## 3.1.2 — 2026-09-29

- Fix temporal SVG previews and exports silently becoming static when ring, floating and perspective animation periods have a long shared cycle.
- Use a bounded forward-and-back SVG loop for those combinations while interactive HTML retains continuous motion; preserve reduced-motion and animation-off behavior.
- Verify automatic movement in the Studio browser preview and standalone SVG, loop continuity and the existing offline motion controls.
- Rebuild Core and web-component packages at 3.1.2.

## 3.1.1 — 2026-09-29

- Start guided setup immediately from account entry, including accounts with an existing draft, without overwriting the saved design.
- Make the Guided setup button usable from the sample Studio and show loading progress and retry errors immediately.
- Load repository metadata first and fetch language details only for selected projects when continuing.
- Move title, save, fullscreen and library controls below the preview; keep the header compact and the mobile workspace bounded.
- Validate 299 JavaScript tests, including real pointer clicks, draft preservation, deferred language loading and mobile preview controls.

## 3.1.0 — 2026-09-29

- Introduce onboarding-first setup with project recommendations, language/topic choices, optional activity and history, constrained regeneration, export and full Studio customization.
- Add Temporal Universe stacks and true 3D forms, ring placement, temporal motion and compatible SVG, interactive HTML and component rendering.
- Add seeded v6 temporal design recipes while preserving previous recipe formats and config v7 compatibility.
- Restore background stars and classic dust in temporal scenes; keep the project credit visible independently of annotation visibility and opacity.
- Preserve account drafts, shared views and repository discovery; load guided activity on demand with recoverable failures and no fabricated account data.
- Rebuild Core and web-component packages at 3.1.0 and document guided setup and temporal geometry.
- Add fullscreen previews, editable constellation titles and a local library of named designs; default contribution discovery to all organizations.
- Make returning visits guided by default, keep customization opt-in and make skipping topics clear its filter and advance.
- Validate 298 JavaScript tests, including browser onboarding, export, temporal rendering and external package consumers.

## 3.0.0 — 2026-09-27

- Declare the scene-based platform stable: Scene/Renderer/Layout/Web Component/Story v1, Plugin/Source v2, Theme v2 and config v7.
- Ship rebuilt core/component 3.0.0 packages and additive source-json/themes 1.1.0 releases with explicit package boundaries and no runtime npm dependencies in core.
- Preserve v6/legacy configuration, recipe and SVG compatibility; document required WASM and the complete v2 → v3 migration.
- Keep the final v2 release at 2.9.3 and introduce v3/3.0.0 Action tags. No new features beyond the release candidate.
- Verify 234 JavaScript tests, 34 Rust tests, seven scaling benchmarks, external package consumers and unchanged original SVG gallery artifacts.

## 2.9.3 — 2026-09-27

- Finalize config v7 and idempotent v2 → v3 workflow/config migration while preserving v6 and legacy recipes.
- Stabilize Scene/Renderer/Layout/Component/Story v1, Plugin/Source v2 and Theme v2 contracts, retaining legacy source/theme adapters.
- Require bundled Rust/WASM and report accessible startup failures; remove deprecated JavaScript computational fallbacks.
- Harden composed scene limits and source validation; add migration, external source, missing-WASM browser/Node checks and a Story benchmark.
- Complete architecture, extension, accessibility, security and v3 migration guides.

## 2.9.2 — 2026-09-27

- Add an optional Studio Story tab to capture current scenes, duplicate/rename/reorder/remove chapters and edit narration.
- Preview from the active chapter in an isolated iframe; export standalone HTML or scene JSON and import saved stories.
- Keep ordinary constellation controls separate and load HTML export assets on demand; test editing, sandboxed player execution and JSON round trips in Chromium.

## 2.9.1 — 2026-09-27

- Interpolate shared node positions, sizes, colors and opacity between story chapters while retaining node groups.
- Animate camera changes, cancel superseded transitions, and finish immediately when reduced motion is requested.
- Preserve manual chapter controls and accessible narration/focus; test identity, camera completion and reduced-motion behavior.

## 2.9.0 — 2026-09-27

- Introduce Story format v1 with ordered declarative chapters, scene references/definitions and validated camera, selection/path, filter, timeline, theme, annotations and layer state.
- Compile chapter layout changes through the existing Rust-backed pipeline; escape annotations and narration.
- Add offline HTML/component story controls and static first-scene fallback, with compilation and browser tests.

## 2.8.3 — 2026-09-27

- Harden cycle and maximum-depth validation across shared branches and temporal child references.
- Bound remembered scene view state to eight entries, restore camera/filter/theme/selection, and delegate navigation handlers to avoid listener accumulation.
- Validate malformed deep links, retain accessible breadcrumb focus, and add hierarchy export benchmarks and a runnable organization demo.

## 2.8.2 — 2026-09-27

- Add interactive child-scene exploration, breadcrumbs, Back/Home and shared-node scene transitions.
- Serialize navigation paths into shareable URL fragments and restore them on reload/browser history navigation.
- Keep embedded history opt-in and namespaced by element ID; validate custom styling across child scenes and preserve generic category tooltips.

## 2.8.1 — 2026-09-27

- Build organization → repository detail scenes from already-loaded project, language, topic, dependency and contributor metadata.
- Bound child generation, preserve scan-coverage notes, exclude private repository references, and make no additional API requests.
- Test verified contributor/technology membership and document honest scope/provenance.

## 2.8.0 — 2026-09-27

- Introduce declarative hierarchical scene catalogs with node-to-child references and supplied scene definitions.
- Compile children through existing pipelines/layouts, preserve static root SVG fallback, and serialize deterministic catalogs.
- Validate references, cycles, size bounds and cancellation; document data provenance and programmatic authoring.

## 2.7.3 — 2026-09-27

- Add bounded, observable per-host timeline caching with cloned results, cancellation and custom-layout bypass.
- Support canonical record inputs and supplied activity snapshots; enforce 64 frames and 16,384 aggregate frame nodes.
- Test sparse/empty history, large frame counts, eviction and abort behavior; validate embedded CSS across every frame.
- Add a runnable timeline example and cache/export-size benchmark; document historical evidence and scaling limits.

## 2.7.2 — 2026-09-27

- Add labelled date scrubbing, Then/Now shortcuts and nearest-snapshot date selection.
- Compare the selected date beside a static Now view with synchronized camera, responsive layout and explicit added/removed counts.
- Expose timeline navigation/comparison through the component and test evidence-aware comparison in offline HTML.

## 2.7.1 — 2026-09-27

- Interpolate shared-node positions and sizes between precompiled timeline scenes while preserving node DOM identity.
- Fade arriving/departing nodes, refresh relationships/styles, and retain camera, filter, theme and valid selection state.
- Cancel transitions on navigation/disposal and immediately honor reduced-motion changes; test identity and motion behavior in the browser.

## 2.7.0 — 2026-09-27

- Introduce a versioned temporal scene model with explicit reference dates, supplied historical snapshots and labelled current-metadata creation-date views.
- Expose reliable created/updated/release metadata without inventing historical metrics; bound and validate frame dates.
- Add offline Previous/Next date controls to HTML and component runtimes, static latest-scene SVG fallback, config integration and deterministic timeline tests.

## 2.6.3 — 2026-09-27

- Verify the web component and core from an isolated external-consumer directory, including WASM/module loading and strict imported styling.
- Assert accessible controls in Chromium, keyboard operation, package manifests and package-size budgets.
- Complete bundler/import-map deployment, package responsibility and accessibility documentation; rebuild extensions and check HTML size budgets in CI.

## 2.6.2 — 2026-09-27

- Support lazy component initialization with IntersectionObserver and responsive runtime ResizeObserver cleanup.
- Cancel superseded/disconnected JSON loads and let explicit property updates supersede a source URL.
- Bound per-instance source caches, expose cache statistics/reload, clear computational caches on disconnect, and restore views on reconnect.
- Test two-instance isolation, lazy visibility, abort races and lifecycle disposal in Chromium.

## 2.6.1 — 2026-09-27

- Expose component selection, clear, fit/reset, filtering, theme, setConfig and loadScene methods.
- Emit scene-ready only once the imperative API is usable, scene-change on replacement, and composed selection/hover/error events.
- Validate strict configuration styling before updates and test API/event behavior across independent elements.

## 2.6.0 — 2026-09-27

- Add the browser-only @constellation/web-component package and `<constellation-view>` custom element.
- Accept JSON configuration, records and compiled scenes through properties, attributes and HTTP(S) JSON loading.
- Reuse the scene SVG renderer and interactive runtime inside Shadow DOM; add an import-map demo and browser tests.

## 2.5.3 — 2026-09-27

- Add a deterministic hash-based Content Security Policy to offline HTML; disallow network connections and injected scripts/handlers while permitting bundled WASM.
- Validate imported scene palettes, graph presentation and geometry bounds; escape activity attributes defensively.
- Report HTML/runtime/scene/WASM sizes and benchmark 45, 256 and 2,048 nodes. Expand browser escaping, CSP, keyboard and reduced-motion checks.

## 2.5.2 — 2026-09-27

- Add local text/language filters and original, midnight and light theme switching to interactive exports.
- Keep keyboard targets and Rust path traversal aligned with visible nodes; clear selections hidden by filtering.
- Observe responsive canvas sizes and reduced-motion changes, including pausing SVG animation; clean up observers on disposal.

## 2.5.1 — 2026-09-27

- Add node details, safe project links, and explicit selection/path state to interactive exports.
- Shift-click or Shift-Enter traces shortest paths using the bundled Rust/WASM engine; ordinary selection reveals neighbours.
- Embed WASM and bindings for offline traversal; test links, escaping, highlighting and keyboard controls in Chromium.

## 2.5.0

- Add self-contained interactive HTML export from compiled scenes and CLI `build --format html`.
- Support pan, cursor-centred zoom, hover, selection, click-to-focus, fit/reset and keyboard controls.
- Add offline browser and CLI tests, escaped embedded data, and a runnable HTML example. Static SVG remains the default.


## Unreleased

## 2.4.3 — 2026-09-27

- Add bounded, observable per-host caches for deterministic registered layouts; bypass retention for nondeterministic/non-JSON inputs and isolate all returned positions.
- Check cancellation across diagnostics, callbacks and WASM boundaries. Document synchronous preemption limits and expose existing engine cache counts.
- Add layout stage benchmarks, 2,048-node/manual-position regressions, cancellation/cache tests and external-consumer checks. Package the layout author guide.

## 2.4.2 — 2026-09-27

- Add per-host trusted layout registration with snapshotted callbacks/capabilities and isolated scene/options inputs.
- Allow declarative layout references and options while rejecting module URLs and requiring explicit registration at render time.
- Validate complete finite position results and capability requests, preserve manual overrides, and retain Rust relationship construction/refinement. Add working extension docs and registration tests.

## 2.4.1 — 2026-09-27

- Expose layout capability metadata for graph sizes, manual positioning, ring snapping, deterministic seeds, animation, refinement and WASM requirements.
- Diagnose effective stable-overview selection and reject unsupported graph sizes before invoking the engine.
- Add capability isolation, mode-boundary and diagnostic tests; document capability semantics without changing layout defaults.

## 2.4.0 — 2026-09-27

- Route all existing arrangements and stable large-graph overview through a scene-based layout interface returning ID-keyed positions.
- Move artifact/organization/temporal position adapters to the layout boundary while retaining the canonical Rust graph engine, manual overrides and all defaults.
- Isolate returned layout data from engine caches and test built-in determinism, manual positioning and original SVG parity. Document the transitional layout contract.

## 2.3.3 — 2026-09-27

- Add explicitly owned normalization/transform caches bounded by entries and estimated bytes, with isolated results, observable hit/miss accounting and clear operations.
- Expose stage counts and cache diagnostics through CLI scene inspection; add pipeline details to advanced `--explain` output while preserving the ordinary filter report.
- Benchmark normalization, transforms, graph and scene/layout separately. Test eviction, oversized/non-JSON inputs, cancellation and independent hosts.
- Preserve source records whose metadata uses a `type` field, retain derived metrics, and document pipeline authoring and measured costs.

## 2.3.2 — 2026-09-27

- Add declarative size, color, glow and opacity mappings with simple stars/language/activity/age forms and safe field/expression forms.
- Support bounded numeric scales, categorical hex colors and explicit missing-value fallbacks; keep manual node color precedence and pass mapped sizes to Rust refinement.
- Preserve derived metrics through transforms, isolate historical metadata, and keep invisible mapped nodes out of keyboard interaction. Add mapping validation and parity tests.

## 2.3.1 — 2026-09-27

- Add deterministic declarative filter, sort, limit, derive, group, map and deduplicate transforms with isolated outputs and stage reports.
- Add a bounded data-expression tree for safe field access and arithmetic/text operations, rejecting executable values and prototype paths.
- Preserve privacy/fork exclusions before transforms and historical evidence before frame transformations. Studio now inspects the compiled scene's actual graph.
- Test config round trips, grouping, ordering, mutation isolation and unsafe input rejection; document working transform examples.

## 2.3.0 — 2026-09-27

- Route scene compilation through isolated normalized data records with stable IDs, labels, kinds, metrics, source provenance and preserved metadata.
- Keep source API 1 loaders working; add normalized plugin-host loading and a compatibility adapter to the existing graph interface.
- Report rejected records and pipeline counts, prevent ID collisions, and test rendering parity, isolation and cancellation. Document the data pipeline.

## 2.2.3 — 2026-09-27

- Apply annotation visibility/opacity to time-lapse captions and honor disabled highlights during Studio keyboard selection while retaining node details.
- Omit zero-opacity layer markup to avoid invisible interactive targets; report visibility consistently in scene statistics.
- Harden layer config/share/workflow round trips and escaping, add temporal and browser regressions, and ship a runnable layered gallery example.

## 2.2.2 — 2026-09-27

- Add a focused Studio Layers inspector with native keyboard selection, scene counts, per-layer visibility/opacity/order, reset and links to relevant existing settings.
- Compile the Studio preview through the scene interface and preserve layer settings when restoring configs, sharing and exporting workflows.
- Keep the first-visit landing and simple Look workflow unchanged. Browser tests cover layer editing, invalid-order recovery, focus navigation and exports.

## 2.2.1 — 2026-09-27

- Add declarative v6 layer visibility, opacity and ordering controls, preserving all defaults and coordinates.
- Validate order constraints around backgrounds, connections, nodes and labels; preserve deterministic tie ordering and fixed camera phases. Selection supports visibility without inventing a separate opacity behavior.
- Preserve controls through scene/config/workflow export and test malformed controls, ordering and unchanged node geometry.

## 2.2.0 — 2026-09-27

- Render scenes through ordered background, effects, starfield, rings, connections, nodes, labels, annotations and selection layers.
- Preserve camera and historical-animation semantics through fixed composition phases; logical starfield/annotation layers can contribute to multiple phases.
- Validate and serialize layer type/phase records, add composition tests and document the layer architecture. Default SVG bytes remain unchanged.

## 2.1.3 — 2026-09-27

- Add separate scene compile/serialize/parse/render benchmarks and a forced-GC retained-memory check for repeated 2,048-node processing.
- Test large-scene references, label bounds and isolation, every existing example config, and scene API consumption outside the repository.
- Include scene documentation in the distributable core package and document measured performance and memory costs. Existing SVG byte fixtures remain unchanged.

## 2.1.2 — 2026-09-27

- Add CLI `--scene` statistics/diagnostics and `--scene-json` inspection without SVG, cache writes or Action outputs. Support explicit JSON output paths and dry runs.
- Add `--reference-date` for reproducible CLI generation, `sceneStatistics` for hosts, and plugin-host scene compilation retaining custom icons and themes.
- Test offline inspection, exact fixed-date repeatability, mutually exclusive output modes and dry-run/Action output boundaries.

## 2.1.1 — 2026-09-27

- Canonicalize scene JSON key ordering and add a fixed-date scene snapshot alongside original SVG parity fixtures.
- Validate scene IDs, edge references, geometry, style, labels, ordered layers and temporal frames. Reject cycles, executable records, unsafe keys and non-finite numbers before serialization/rendering.
- Expose diagnostic validation and bounded scene parsing; test determinism across cache state and record property ordering.

## 2.1.0 — 2026-09-27

- Introduce isolated, serializable scenes with node/edge IDs, geometry, styling, interaction metadata, labels and layer identities. Keep Rust/WASM as the layout engine.
- Split scene compilation from SVG rendering, preserving the existing rendering entry point and source icon callbacks. Historical crossfade renders precomputed scene frames.
- Add original-renderer byte fixtures and scene round-trip tests; preserve the generated gallery byte for byte. Document baseline architecture and the transitional scene contract.

- Restore the original landing layout on the first browser visit, open the studio directly on later visits and shared links, and hide the landing-to-studio loading flash.

- Add a searchable repository picker in the Projects panel, with explicit selection, bulk controls and automatic selection. Preserve chosen repositories in configs, presets, share links and workflow exports.

- Load missing project data when applying built-in presets, and restore the previous design if loading fails or the preset renders no visible nodes. Only report success after updating the graph and exports.

- Preserve curved connections during ring and floating animation, keeping endpoints attached across independent motion speeds.

- Add adaptive Chingu and Code the Dream themes to the studio, core and theme packs, using their public brand palettes.
- Freeze the v5 recipe theme choices so adding themes preserves previously shared designs.

## 2.0.0 — 2026-09-27

- Export a single v6 config format incorporating refinement, plugins, theme packs and node-cap settings. Automatically read legacy version-1/unversioned configs, frozen v1:–v5: recipes and old share links.
- Add offline `migrate --config`, `--from` and `--workflow` commands with a complete migration guide. Preserve resolved appearance and manual/hidden-node settings; keep legacy recipe seeds as provenance.
- Commit to source API version 1 and the documented theme contract throughout core 2.x.
- Explicitly deprecate the non-WASM browser fallback with a load-time warning; removal is deferred to the next major. CLI/Action WASM requirements remain unchanged.
- Update Action/Marketplace metadata, generated workflows and README quick-start to v2. No new visualization features are introduced.

## 1.9.3 — 2026-09-27

- Bound source-cache retention by an 8 MiB estimated serialization budget as well as entry count; oversized snapshots remain usable without being retained.
- Add cache accounting and a repeatable forced-GC profiling script. Twelve 2048-node metadata-heavy snapshots previously retained about 43 MiB on the development host.
- Test budget eviction and full accounting reset on clear.

## 1.9.2 — 2026-09-27

- Cache source responses only after validating every node, so malformed feeds can be retried without a forced refresh.
- Reject responses completed after cancellation even when a custom loader ignores its signal.
- Regression tests prove a late pre-refresh response cannot replace the new snapshot, and invalid/cancelled loads do not become cached data.

## 1.9.1 — 2026-09-27

- Replace repeated all-node ring-occupancy scans in large overviews with a spatial index, preserving exact distance tests and node order.
- Add a 2048-node style-change benchmark with ring snapping on/off and computed-node counters. Add boundary-equivalence regression tests.

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
