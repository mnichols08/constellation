# Embed a constellation

Import `@constellation/web-component` in a browser application to register `<constellation-view>`. The package depends on the matching `@constellation/core` release. Use a bundler or an import map for these module specifiers; no application framework is required.

```js
import '@constellation/web-component';
const view = document.createElement('constellation-view');
view.config = { version: 6, account: 'example', options: { animate: false } };
view.records = [{ name: 'compiler', full_name: 'example/compiler', language: 'Rust' }];
document.body.append(view);
```

Properties `config`, `records` and `scene` accept isolated JSON data. Assigning a compiled scene bypasses source loading and layout. The `config` attribute accepts JSON; `account` supplies the account for an otherwise empty view. A `src` attribute loads an HTTP(S) JSON scene, configuration, or `{ config, records }` document. Config-only inputs use the current `records` property: the component never implicitly fetches GitHub or loads executable plugins.

Each element uses Shadow DOM for SVG styles and controls. It shares the HTML export's accessible pan/zoom, selection, details, path highlighting, filtering, themes and reduced-motion behavior. Errors appear as an accessible message when no previous view exists and dispatch an `error` event. Source URLs follow the embedding page's CSP and CORS policies. Imported custom CSS must be self-contained; no config text is executed.

Run the existing preview server and open `/examples/web-component.html` for a browser example.
