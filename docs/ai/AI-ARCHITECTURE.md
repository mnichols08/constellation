# AI semantic architecture and trust boundary

> **The AI describes the universe; Rust builds the universe; the Web presents the universe.**

A language model is one optional way to author a [`ConstellationSpec`](../constellation-spec.md). It is never the validator, the graph engine, the layout engine or a source of facts. Everything in this document works with no model, no network and no API key; try the [offline demo](../../examples/ai-offline-demo.html) (run `npm run preview`, then open `/examples/ai-offline-demo.html`).

## Flow

```text
 person                      "Put my Rust projects near the centre,
   |                          experiments on the outskirts"
   v
 Studio: Describe your sky ------------------------------------- HTML/CSS
   |                                                              presents, never decides
   v
 describeConstellation()  src/ai/describe.mjs ------------------ JavaScript
   |        ^                                                     orchestration only
   |        |  tool results, diagnostics                          bounded turns, tools, repairs
   v        |
 model adapter  { generate(request) }  <-- the only provider-specific code
   |        ^                                 (your module, or the built-in phrase matcher)
   |  ......|.................................................... TRUST BOUNDARY
   |        |   everything below treats model output as untrusted data
   v        |
 tool call (name, JSON)          submitted spec (JSON)
   |                                   |
   v                                   v
 ConstellationEngine.callTool    parse -> validate -> resolve -> compile ---- Rust/WASM
   read-only, bounded              RawConstellationSpec -> ConstellationSpec   constellation-spec
   answers from evidence           structured diagnostics on any failure
                                       |
                                       v
                                 compiled plan: groups + reasons, bands,
                                 edges, ring positions, scene options
                                       |
                 person reviews the plan and presses Apply
                                       |
                                       v
                                 options.constellationSpec (one Undo step)
                                       |
                                       v
                                 existing scene pipeline -> SVG / HTML / <constellation-view>
```

## Who owns what

| Layer | Owns | Never does |
| --- | --- | --- |
| Model (optional) | reading fuzzy language; proposing a spec; revising it from diagnostics | positions, validity, facts about a developer, running code |
| JavaScript | calling the model; passing tool calls and results; enforcing turn, tool and repair limits; Studio state and Undo | deciding whether a spec is valid or what it matches |
| Rust (`constellation-spec`) | typed spec, validation, bounds, evidence matching with reasons, bands, edges, ring geometry, diagnostics | DOM, network, clock, randomness, provider concepts |
| HTML/CSS | the dialog, the plan, accessible status and errors | — |

## Trust boundary

Model output is hostile input until Rust has accepted it.

- **Nothing is executed.** A model returns JSON: tool calls or a spec. There is no `eval`, no generated code path, no template that reaches the DOM as markup. Text is set with `textContent`.
- **Only published tools run.** A tool name is dispatched only if it is in the published list. Anything else is answered with an `unknown_tool` diagnostic without reaching the engine. Every tool is read-only.
- **Every value is bounded and typed.** Spec size, list lengths, string lengths, filter depth, numeric ranges and diagnostics count all have explicit limits in Rust. Unknown fields are errors, so a model cannot smuggle coordinates or styles through.
- **References are checked against evidence.** An unknown repository id is an error. A language or topic nobody uses is a warning that lists real ones.
- **Nothing changes until a person applies it.** `describeConstellation` and `compileSpec` are pure. The Studio shows the plan first; Cancel leaves the map untouched; Apply is one Undo step.
- **The loop is bounded.** At most 2 repairs, 12 tool calls (6 per turn) and 12 model turns per request. Callers can lower these, not remove them. Hitting a limit fails with a reason and changes nothing.
- **Secrets stay in the adapter.** Credentials live in the adapter's own closure. They are never passed to the engine or WASM, never put in a spec, config, scene, share link or export, and never appear in progress events. A provider error is returned to the caller as an `Error` and is not logged or shown; the Studio shows a fixed sentence instead.
- **Interpretation is labelled.** The plan says it is a reading of the request. Matches cite observed repository data or the developer's own declared roles (`source: "observed"` or `"declared"`). The model's wording is never presented as a fact about a person.

Rust tests fuzz the validator, the compiler, the tools and the evidence loader with deterministic generators: arbitrary JSON, mutated valid specs, raw bytes and truncated documents. See `rust/constellation-spec/src/tests.rs`.

## Example: prompt, spec, scene

Prompt:

> Make my constellation feel like a solar system. Put my most important Rust projects near the center, cluster similar projects together, and place old experiments toward the outskirts.

1. The model calls `list_languages` and `list_topics`. The engine answers from the loaded repositories: Rust is used by 4.
2. It calls `preview_group` for `{ "match": { "role": "experimental" } }`. The engine reports 3 members and why each matched.
3. It submits a spec with `"layout": { "kind": "solar-system-rings" }` and a `positions` array. Rust rejects it:

   ```json
   { "ok": false, "diagnostics": [
     { "code": "unknown_field", "path": "positions", "allowed": ["schema_version", "focus", "groups", "relationships", "layout", "ranking", "style"] },
     { "code": "invalid_value", "path": "layout.kind", "allowed": ["radial", "clustered", "solar_system", "web", "timeline"], "received": "solar-system-rings" }
   ] }
   ```

4. It submits the corrected spec shown at the top of the [reference](../constellation-spec.md). Rust accepts it and compiles:
   - focus: 4 Rust repositories; the three not claimed by a placed group go to the `center` band;
   - group `experiments`: 3 repositories, band `outer`, each with the reason `curated role: experimental` (declared);
   - scene options: `arrangement: "rings"`, `connectionBasis: "both"`, `connectionWeight: "topics"`.
5. The person applies it. The scene pipeline asks the engine for ring positions and renders through the normal SVG, HTML and `<constellation-view>` paths.

`examples/ai-offline-demo.mjs` replays exactly this with prerecorded turns, and `test/ai-offline-demo.test.mjs` asserts each step.

## In the Studio

**Describe** in the top bar, or **Describe your sky** in the Layout tab, opens the flow:

1. Type a description, or pick an example.
2. Read the plan: what sits at the centre, each group with the projects that matched and why, what the lines mean, and the layout. For a follow-up it also lists what changes.
3. **Apply**, **Change the description**, or close. Closing changes nothing.

Applying is one Undo step. A follow-up request revises the current plan and keeps what you did not mention. Manual controls keep working on a described map, and **Remove this plan** returns to settings alone.

With no model connected, descriptions are read by a built-in phrase matcher. It is pattern matching over a small vocabulary plus the language and topic names the engine reports, and the dialog says so. It exists so the feature works, and is testable, without a model. To connect a real model see [Provider integration](PROVIDER-INTEGRATION.md).

The spec engine and prompt layer load on first use. A visitor who never opens Describe, and has no saved plan, downloads neither.

## Using a spec without AI

Write the JSON yourself and pass it to `createConstellationEngine(...).compileSpec(spec)`, store it as `constellationSpec` in a configuration file for the CLI or GitHub Action, or generate it from your own form or script. See the [reference](../constellation-spec.md#use-it-from-javascript). The prompt layer (`src/ai/`) is not imported by any of those paths.

## Files

| Path | Role |
| --- | --- |
| `rust/constellation-spec/` | types, validator, evidence indexes, compiler, engine, schema generator, tests |
| `src/constellation-spec.mjs` | thin JS adapter over the WASM module |
| `src/spec-host.mjs`, `src/spec-register.mjs` | registration seam so core never imports the engine |
| `src/ai/describe.mjs` | provider-neutral orchestration and limits |
| `src/ai/fake-model.mjs` | scripted model for tests and demos; built-in phrase matcher |
| `src/ai/plan.mjs` | compiled plan to plain sentences |
| `src/app/views/dialogs/describe.mjs` | Studio dialog |
| `schemas/` | generated JSON Schema and tool definitions |
| `examples/specs/`, `examples/ai-offline-demo.*` | examples and the offline demo |

Design decisions are recorded in [ADR-0001](../architecture/decisions/ADR-0001-AI-SEMANTIC-BOUNDARY.md) and [ADR-0010](../architecture/decisions/ADR-0010-CONSTELLATION-SPEC-ENGINE.md).

## Readers that ship

The flow above is the same whoever proposes the spec. Four ways exist today:

- the built-in phrase matcher (no model, no network);
- Claude through the site's function, for signed-in visitors ([Hosted Claude](HOSTED-AI.md));
- Claude with the visitor's own key, sent from their browser;
- the visitor's own assistant through the local [MCP server](../mcp.md), which calls the same engine tools.

Provider code lives only in `src/ai/providers/`. Keys never enter the engine, a spec, a configuration, a scene, an export or an event. See [ADR-0011](../architecture/decisions/ADR-0011-HOSTED-AI-AND-MCP.md).
