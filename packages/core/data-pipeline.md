# Data pipeline

The pipeline is source → normalized records → graph → scene → renderer.
Transforms are added in the following 2.3 patches. Existing GitHub acquisition,
organization scans and source API 1 still return repository-shaped objects;
compilation adapts them before graph construction. Rust/WASM remains responsible
for the existing graph projection and layout computations.

```js
import { normalizeRecords, createScene, renderSceneSVG } from '@constellation/core';
const result = normalizeRecords([
  { full_name: 'example/core', name: 'core', language: 'Rust', stargazers_count: 42 },
]);
const scene = createScene('example', result.records, {
  referenceDate: '2026-09-01T00:00:00Z', animate: false,
});
const svg = renderSceneSVG(scene);
```

A normalized record has `version: 1`, `type: "record"`, a stable `id`, display
`label`, semantic `kind`, numeric `metrics`, and isolated `attributes` containing
source metadata. Adapted GitHub records expose `metrics.stars`; missing or invalid
counts become zero. `source` identifies GitHub or the registered source/instance.
Temporal fields retain their evidence and are not synthesized as history.

`normalizeRecords` returns `{ records, diagnostics, statistics }`. Invalid records
are rejected with their input index and reason; duplicate IDs fail the pipeline.
An optional `onDiagnostic` callback receives rejection diagnostics. Records are
cloned so later mutations cannot affect source caches or callers. `toGraphRecords`
adapts normalized records into the existing graph interface without dropping source
metadata, manual identity or plugin provenance.

The legacy scene entry point defers duplicate-ID checking until after its existing
privacy/fork/repository filters. This preserves inputs whose repeated IDs belong
only to excluded records. The resulting graph still requires unique IDs, and
registered source loading retains its earlier collision checks.

`createScene` accepts either existing repository records or normalized records.
It reports loaded/rejected/normalized/graph/scene counts in `presentation.pipeline`.
Source API 1 remains unchanged: `pluginHost.load` returns its existing objects,
while `pluginHost.loadRecords` is an additive normalized adapter using the same
registration, namespace, cache and cancellation boundaries. Hosts must still
explicitly register executable source callbacks; config never loads modules.
