# Portable Embed and Export

Semantic Graph v1 is the portable semantic source. Embeds and visual exports validate it, project it through Core to Scene v1, and use the existing renderer and runtime.

## Web Component

Load the built Web Component and point its dedicated graph attribute at a UTF-8 JSON resource:

```js
import '@constellation/web-component';
```

```html
<constellation-view semantic-graph="./alice.semantic-graph.json"></constellation-view>
```

Resolve the package entry with your browser import map or application bundler, as in [the runnable example](../examples/web-component.html).

The existing `src` attribute continues to load Scene or config JSON. `semantic-graph` accepts only an explicit HTTP(S) URL. The host must allow browser CORS access. The component reads at most 16 MiB, decodes strict UTF-8, validates Semantic Graph v1, and projects through Core. It does not execute graph contents or acquire data from GitHub.

For a fully offline embed, assign a graph object directly:

```js
const graph = JSON.parse(graphJSON);
const view = document.querySelector('constellation-view');
view.semanticGraph = graph;
```

Assignment validates and projects synchronously without network access. Invalid replacements keep the prior rendered view and emit `semantic-graph-error`; successful replacements emit `semantic-graph-load` with subject, version, fingerprint, and private-source status. Graph values are cloned through canonical serialization and are not mutated. Accessible component status includes the subject and semantic identity.

An active Semantic Graph overrides `src` and config while records/account remain available for the fallback scene. Removing `semantic-graph` restores the normal configured source; assigning `view.semanticGraph = null` clears a programmatic graph override.

## Standalone HTML and bundle

The CLI produces an offline interactive HTML file from the graph projection:

```sh
constellation --semantic-graph alice.semantic-graph.json --format html --output constellation.html
```

The HTML uses the existing interactive runtime and makes subject, Semantic Graph version, fingerprint, source coverage, and private-source disclosure available in a semantic information section. It does not call GitHub or embed source code.

Generate a deterministic directory bundle with:

```sh
constellation --semantic-graph alice.semantic-graph.json --format bundle --output ./dist/alice
```

The directory contains canonical `<subject>.semantic-graph.json`, `constellation.md` rendered with Semantic Markdown v1 standard detail, `constellation.svg`, `constellation.html`, and `manifest.json`. The manifest format is version 1 and records artifact names, subject, package and semantic format versions, fingerprint, visibility, and truncation. It does not wrap the graph or contain local paths, timestamps, credentials, cache data, or source contents. Repeated generation from the same graph produces the same artifact bytes.

The `sg1:` value is a non-cryptographic semantic change identifier. It identifies graph meaning; SVG and HTML appearance remains presentation. Private provenance is retained as a warning because project names, paths, and structure may still be present in an export.

Studio keeps visual downloads and semantic graph export. It also offers a direct Semantic Markdown download from the active semantic graph. Portable directory bundles are available through the CLI; Studio does not offer a ZIP download.
