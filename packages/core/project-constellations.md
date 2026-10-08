# Project Constellations

A Project Constellation is a bounded map of repository artifacts at one Git ref. It records paths, supported package manifests, explicitly declared workspace membership, selected JavaScript or TypeScript static imports, and manifest-declared entry points. It does not infer architectural domains or inspect symbols.

## Core API

```js
import {
  createProjectConstellation,
  createProjectConstellationScene,
  createProjectConstellationHierarchy,
} from '@constellation/core';

const model = createProjectConstellation({ projectId: 'owner/repo', ref: 'main', commit, tree, contents });
const { scene } = createProjectConstellationScene(model);
```

`createProjectConstellation` is pure: `tree` contains `{ path, type, sha?, size? }` records and `contents` maps selected manifest/source paths to text. Source text is used transiently for import parsing and is never copied into the returned model. Stable IDs hash the repository identity and normalized path, independent of record ordering. The result carries the requested ref and optional commit SHA.

To open a project from an existing Scene v1 parent, call `createProjectConstellationHierarchy(parentScene, selectedProjectNodeId, model)`. It adds one child scene using the existing hierarchy API. The Web Component's hierarchy navigation provides the breadcrumb and Back behavior; the caller can load the returned hierarchy with `view.scene = hierarchy`.

Run `node scripts/benchmark-project-constellation.mjs` to measure normalization/graph construction, Scene adaptation, SVG, offline HTML, and serialized Scene size for 50, 128, and 256 input files. The current 100-node Scene cap means larger inputs report bounded/truncated output rather than expanding the renderer's graph limit.

## Nodes and relationships

Node kinds are `project-root`, `package`, `directory`, `module`, and `entry-point`. Workspace membership can be represented by a separate `workspace-member` relationship. `contains` follows repository path ancestry; `workspace-member` comes from a supported workspace declaration; `entry-of` comes from a package manifest pointing to a real tree file; and `imports` comes from a recognized literal relative JS/TS import, re-export, or `require()` whose target resolves to another represented module. Unresolved and external imports are omitted. No calls or runtime dependencies are inferred.

The Core model's edges each retain compact source evidence (`repository-path`, `manifest`, or `static-import`). `explainProjectStructuralNode` and `explainProjectStructuralEdge` return bounded path and relationship explanations. The Scene adapter reuses Scene API v1 renderers and retains the structural kind and source evidence in edge metadata. The Core model remains the canonical explanation attachment.

## Bounds and truncation

Default deterministic bounds are 500 file paths inspected, 128 directories, 2 MiB of content, 32 manifests read, 500 parsed import statements, 100 graph nodes, 1,024 graph edges, three structural directory levels, 512 characters per path, and 64 KiB per manifest. The node cap aligns with the existing Core scene compiler's 100 repository limit. Invalid paths are ignored; unsupported files are counted explicitly. Results expose available, read, and omitted file, manifest, source-file, and directory counts, unsupported files ignored, content bytes, import counts, and a `truncated` flag with a limitation message. A tree-only or manifest-only acquisition is marked limited when source content was available but not read, so the graph does not claim complete import coverage.

The application GitHub acquisition helper (`src/github-project-structure.mjs`) is opt-in and separate from Core normalization. It requires the caller's existing session/request-cache fetch function so it reuses auth isolation, cooldowns, and cancellation policy. It makes repository, commit, and tree requests, then fetches at most eight manifests in public mode. Authenticated mode may fetch at most 24 manifests and 16 manifest-declared entry files. Request cancellation is supported. A GitHub tree response that GitHub itself marks truncated is rejected rather than shown as complete. Rate limits are surfaced as an error; callers should keep already-loaded data available.

## Supported sources and limitations

Generic `package.json` workspaces and entry fields, including bounded conditional `exports`, are supported. Cargo `[workspace].members` arrays are read with a small bounded TOML rule and produce explicit workspace relationships. Cargo crates are represented as packages. `pyproject.toml` and `go.mod` are recognized as package manifest paths, but their syntax and dependencies are not interpreted in this release. JavaScript and TypeScript static relative imports are recognized; Rust module declarations, external package dependency expansion, universal language parsing, symbol graphs, and source viewers are out of scope. Anonymous GitHub acquisition is intentionally shallow and manifest-focused. Local and imported tree snapshots can supply their own bounded `contents` map.

The model and its Scene adapter work offline after acquisition. SVG, offline HTML, and PNG continue to use the existing Scene renderers. No credentials or source text are placed in the model or scene. A user who wants a static artifact can serialize the adapted scene with the existing Scene API; project provenance and structural explanations remain available in the separate model.
