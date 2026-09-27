# Sources, themes and node renderers

The core exposes `createPluginHost()`. Each host has an isolated registry; it does not discover or execute modules from config strings. Import trusted plugin modules in the application and call `registerSource`. The built-in `json-feed` source accepts `options.items` or an HTTP(S) `options.url` whose response is an array of nodes.

```js
import { createPluginHost } from '@constellation/core';
const host = createPluginHost();
host.registerSource({
  id: 'projects', apiVersion: 1,
  async load({ options, account, signal, fetchImpl }) {
    return [{ id: 'one', name: 'Project one', language: 'Rust', topics: ['tools'] }];
  },
  renderNode({ node }) { return { path: 'M0 -1 L1 0 L0 1 L-1 0 Z', fill: '#ff8800' }; },
});
const options = { plugins: { sources: [{ id: 'work', source: 'projects', options: {} }] } };
const nodes = await host.load(options, { account: 'octocat' });
const svg = host.render('octocat', nodes, options);
```

Every source instance has a unique config `id`. Returned node IDs become `source:instance:encoded-id`; duplicate IDs within an instance produce an error. Different sources can return the same local ID. Source loading and returned nodes have deterministic ordering. Keep each loader deterministic for a given data snapshot; pass cancellation through `signal` and use the supplied `fetchImpl` in tests. GitLab can be implemented through the same loader contract by mapping its public projects to nodes; no GitLab adapter ships here.

Render hooks receive a copied node, SVG coordinates and radius. They return `{ path, fill? }`; paths use a -1..1 coordinate box, and fill is a six-digit hex color. The host retains the interactive node circle and supplies the custom path in its place visually. Arbitrary markup is not accepted. A direct render caller can also provide `nodeRenderer` in the fourth argument.

`packages/source-json` is a standalone reference source package. Its implementation is also bundled in core for CLI/Action use. Configure a feed through `plugins.sources` in the same config-file or config-json paths. Plugins loaded by another application must be registered in that application's host; config strings do not import executable code.

`packages/themes` contains every existing Look preset as a `{ id, version, preset }` theme pack, versioned independently at 1.0.0. Build extension packages with `node scripts/build-extensions.mjs`, then `npm pack ./packages/themes` or `npm pack ./packages/source-json`. Import `themePacks`, register a pack with `host.registerThemePack(pack)`, and set `themePack: { id, version }`. A full pack with its `preset` can also be embedded in a config/share link; exact references to bundled Look packs resolve directly. Explicit config colors and styling retain precedence. A theme pack change does not require changing the core version.
