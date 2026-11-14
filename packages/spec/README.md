# ConstellationSpec

A `ConstellationSpec` describes the constellation you want as **intent**: what to put at the centre, which groups exist, what connects projects, and what kind of layout to use. It never contains coordinates, forces, code or styles. The Rust engine validates it, matches it against real repository data, and computes every position.

It does not need AI. The same document can be written by hand, produced by JavaScript, stored in a configuration file, or proposed by a language model through the [optional prompt layer](ai/AI-ARCHITECTURE.md).

```json
{
  "schema_version": 1,
  "focus": { "kind": "language", "value": "Rust" },
  "groups": [
    { "name": "Experiments", "match": { "role": "experimental" }, "placement": "outer" }
  ],
  "relationships": [
    { "basis": "shared_topic", "strength": 1.0 },
    { "basis": "shared_language", "strength": 0.6 }
  ],
  "layout": { "kind": "radial", "cluster_by": ["topic", "language"] }
}
```

More examples are in [`examples/specs/`](../examples/specs). The machine-readable contract is [`schemas/constellation-spec.v1.schema.json`](../schemas/constellation-spec.v1.schema.json) (JSON Schema 2020-12).

## Intent versus computed data

| You write (intent) | Rust computes |
| --- | --- |
| `focus`: a language, topic, role, repository or group | which repositories match, and which sit in the centre band |
| `groups[].match`: a filter | the members of each group, each with the reasons it matched |
| `groups[].placement`: `center`, `inner`, `middle`, `outer` | the ring radius and angle of every star |
| `relationships`: a basis and a strength from 0 to 1 | weighted edges, bounded per repository |
| `layout.kind`, `layout.cluster_by` | which existing layout runs, and which stars sit side by side |
| `ranking`, `style` | ordering, the number shown, motion and orbit options |

The output of compilation is a separate object (`compiled`). A spec that contains `x`, `y`, `position` or any other unknown field is rejected, not ignored.

## Fields

| Field | Values | Default |
| --- | --- | --- |
| `schema_version` | `1` (required) | — |
| `focus` | `{ kind, value }`; `kind` is `language`, `topic`, `role`, `repository` or `group` | none |
| `groups` | up to 32 of `{ id?, label? (or name), match, placement? }` | `[]` |
| `relationships` | up to 8 of `{ basis, strength? }`; `basis` is `shared_language` or `shared_topic` | `[{ shared_language, 1 }]` |
| `layout.kind` | `radial`, `clustered`, `solar_system`, `web`, `timeline` | `radial` |
| `layout.cluster_by` | up to 3 of `language`, `topic`, `role`, `group` | `["language"]` |
| `ranking.by` | `stars`, `recency`, `name` | `stars` |
| `ranking.limit` | 1–2048 | everything |
| `style.motion` | `still`, `gentle`, `lively` | unchanged |
| `style.orbit_shape` | `round`, `wide` | unchanged |
| `style.rings` | boolean | unchanged |

A group `id` uses lowercase letters, digits, `-` and `_`. When omitted it is derived from the label (`"Old Experiments!"` becomes `old-experiments`).

### Filters

A filter is an object with one condition. Several keys in one object mean all must hold; the normalized form makes that explicit with `all`.

| Key | Meaning |
| --- | --- |
| `language` | uses this language (case-insensitive; `C`, `C++` and `C#` stay distinct) |
| `topic` | has this topic |
| `role` | `featured`, `supporting`, `experimental`, `historical` or `unassigned`. Roles are the developer's own curation (`projectShowcase`), never inferred |
| `repository` | one repository by id, such as `owner/name` |
| `stars` | `{ min?, max? }` |
| `updated` | `{ within_days?, older_than_days? }`, measured from the evidence reference date, never the wall clock |
| `archived`, `fork` | boolean |
| `any`, `all` | a list of filters |
| `not` | one filter |

Filters nest at most 4 levels and hold at most 64 conditions.

### How bands are chosen

For `radial` layouts every shown repository gets one band:

1. A group with a `placement` that contains it. If several do, the first group in the spec wins and a warning is reported.
2. Otherwise, a `focus` match: the six highest ranked sit in `center`, the rest in `inner`.
3. Otherwise `middle`, when the spec has a focus or any placed group.
4. With no focus and no placed group, rank decides: the top quarter is `inner`, the last quarter `outer`.

Within a band, stars are ordered by cluster (largest first), then rank, and spaced evenly. `placement` requires `layout.kind: "radial"`; other layouts return an `unsupported_combination` error.

### Accepted synonyms

The validator accepts a few common synonyms and stores the canonical word: `topics` → `topic`, `languages` → `language`, `rings` → `radial`, `galaxy` → `clustered`, `outskirts`/`edge` → `outer`, `centre`/`core` → `center`, `updated` → `recency`, and `name` for a group's `label`. The JSON Schema lists canonical values only.

## Validation and diagnostics

Every externally authored spec is untrusted. Validation never throws and never panics; it returns `{ ok, spec, diagnostics }`. `spec` is the normalized, fully defaulted form.

```json
{
  "code": "invalid_value",
  "severity": "error",
  "path": "layout.kind",
  "message": "Value is not in the supported vocabulary",
  "allowed": ["radial", "clustered", "solar_system", "web", "timeline"],
  "received": "spiral"
}
```

- `code` is stable. `path` locates the field, for example `groups[1].match.language`.
- `allowed` and `bounds` (`{ min, max }`) say what would be accepted.
- `received` echoes at most 80 characters of a scalar, with control characters removed.
- At most 64 diagnostics are returned; `diagnostics_truncated` says when more were dropped.
- Errors stop compilation. Warnings (`unknown_language`, `unknown_topic`, `empty_group`, `empty_focus`, `overlapping_placement`) do not.

Codes: `invalid_json`, `spec_too_large`, `invalid_type`, `missing_field`, `unknown_field`, `unsupported_schema_version`, `invalid_value`, `out_of_range`, `too_long`, `too_many`, `empty_value`, `duplicate_id`, `unknown_group`, `filter_too_deep`, `filter_too_complex`, `empty_filter`, `unsupported_combination`, `unknown_repository`, `unknown_language`, `unknown_topic`, `empty_group`, `empty_focus`, `overlapping_placement`, `unknown_tool`, `invalid_evidence`.

Limits: 256 KiB per spec, 4 MiB and 2,048 repositories of evidence, 64 languages and 64 topics per repository, 120 characters per name.

## Use it from JavaScript

The engine is its own Rust/WASM module (`@constellation/spec`, about 240 KB). It loads only when you import it.

```js
import { createConstellationEngine, validateConstellationSpec } from '@constellation/spec';

validateConstellationSpec({ schema_version: 1, layout: { kind: 'spiral' } });
// { ok: false, diagnostics: [{ code: 'invalid_value', path: 'layout.kind', ... }] }

const engine = createConstellationEngine(repositories, { projectShowcase });   // GitHub-style records
engine.listLanguages();                                   // [{ name: 'Rust', repositories: 4 }, ...]
engine.findRepositories({ language: 'Rust' }, 10);        // ids with reasons, bounded
engine.previewGroup({ name: 'Experiments', match: { role: 'experimental' } });
const { ok, compiled, diagnostics } = engine.compileSpec(spec, { round: true });
engine.destroy();
```

### Engine lifetime

Create one engine per set of repositories and reuse it. It keeps repository lookup, language and topic indexes, and relationship adjacency in Rust.

| Method | Effect |
| --- | --- |
| `validateSpec(spec)` | Schema and reference checks. Builds nothing |
| `compileSpec(spec, canvas?)` | Pure. Returns `compiled`; retains nothing |
| `applySpec(spec, canvas?)` | Compiles and retains the result. A failing spec leaves the engine unchanged |
| `callTool(name, args)` | Runs one published tool. Never mutates |
| `neighbors(id)`, `path(a, b)` | Read retained adjacency; no topology is rebuilt |
| `edges()`, `bands()`, `positions()` | Typed arrays (`Uint32Array`, `Float32Array`, `Uint8Array`) with no JSON |
| `setRepositories(list)` | Replaces evidence, rebuilds every index, clears the applied spec and increments `generation`. Indices from before are invalid |
| `destroy()` | Frees the WASM memory |

Until a spec is applied, adjacency follows the default relationship (shared language). `canvas` is `{ compact, round }`: presentation facts the ring geometry needs.

Compilation is deterministic: the same repositories, spec, canvas and engine version give the same output. The engine has no DOM, network, clock or randomness.

## Use it in a configuration

`constellationSpec` is an optional configuration field. Register the engine once and the normal pipeline honours it:

```js
import { registerSpecHost, createScene } from '@constellation/core';
import { specHost, specOptions } from '@constellation/spec';

registerSpecHost(specHost);
const options = specOptions(currentOptions, compiled);   // adds constellationSpec plus derived options
const scene = createScene(account, repositories, options);
```

`specOptions` writes the existing options a spec maps to, so every renderer and export works unchanged:

| Spec | Option |
| --- | --- |
| `layout.kind` | `arrangement`: `rings`, `galaxy`, `solar-system`, `force`, `era-rings` |
| `relationships` | `connectionBasis` (`languages`, `topics`, `both`) and `connectionWeight` |
| `ranking` | `sortBy`, `maxRepos` (at most 100) |
| `style` | `orbitShape`, `identityRing`; the Studio also applies `motion` |

Ring positions are the one thing options cannot express. For a `radial` spec on the Rings layout, layout asks the engine for them at render time. Stars moved by hand (`starPositions`) keep their place. Changing the layout by hand keeps the spec but stops using its placement.

Without a registered engine, `constellationSpec` is kept as size-checked data and has no effect. The CLI and the GitHub Action register the engine automatically when a configuration contains the field.

The lines drawn on the map come from the existing connection settings above. The engine's own weighted edges power discovery (`describe_repository`, `neighbors`, `path`) and the plan a person reviews.

## Tools

[`schemas/constellation-tools.v1.json`](../schemas/constellation-tools.v1.json) describes the engine's operations as provider-neutral tool definitions (`name`, `description`, `input_schema`): `portfolio_overview`, `list_languages`, `list_topics`, `find_repositories`, `describe_repository`, `preview_group`, `validate_spec`, `compile_spec`. All are read-only and bounded: lists return at most 200 names, searches at most 50 repositories, and every result says whether it was `truncated`. `portfolio_overview` is the place to start: one snapshot of counts, recency, declared roles, top languages and topics, and the most starred and most recently updated repositories. It reports what exists, not skill.

Both schema files and `src/constellation-spec-schema.mjs` are generated from the Rust validator's own vocabularies and limits. Run `npm run build:schema` after changing them; the test suite fails when a checked-in copy is stale.

## Compatibility

- `schema_version` is required. An unsupported version returns `unsupported_schema_version` and nothing else is interpreted.
- Within version 1, new optional fields and vocabulary may be added. Existing fields, defaults and diagnostic codes do not change meaning.
- A breaking change gets a new `schema_version`. The engine will accept both for at least one minor release and document the migration.
- The normalized form returned by validation is what to store. It parses to itself.
