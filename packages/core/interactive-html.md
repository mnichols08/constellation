# Interactive HTML

Build a self-contained visualization and open it directly in a modern browser:

```sh
node src/cli.mjs build --username octocat --fixture repositories.json --format html --output dist/constellation.html
```

Use your own repository JSON array as the fixture, or omit `--fixture` to load GitHub data. Existing config, source, transform, mapping and layer options apply. SVG remains the default format and the GitHub Action's existing output.

Drag the canvas to pan, scroll to zoom, or use the labelled zoom controls. Select a node to focus it; Fit frames the visible nodes and Reset restores the original view. Tab reaches the canvas, controls and nodes. Arrow keys navigate nodes, Home/End select the first/last keyboard target, Enter/Space select, Escape clears selection, and +/- zoom.

The renderer embeds compiled scene data and a small DOM runtime. It does not fetch data or recalculate layouts when opened. A status region announces selection. Existing SVG reduced-motion rules remain in effect.

```js
import { createScene, renderSceneHTML } from '@constellation/core';
const scene = createScene('example', repositories, options);
const html = renderSceneHTML(scene, { title: 'Project constellation' });
```

Scene objects currently use the internal scene contract and should come from the compiler or trusted fixtures. Configuration remains declarative. HTML titles and embedded JSON are escaped; runtime metadata uses DOM text APIs. The exported page works offline without a web server.

Run `node examples/interactive-demo.mjs` to generate a small offline example in `dist/interactive-demo.html`.

Select a node to see its description, language and star count. Source-provided HTTP(S) project links open safely in a new tab. Shift-click or Shift-Enter on a second node traces the shortest path across visible connections. Both endpoints remain visible when no path exists. Path computation uses the embedded Rust/WASM engine, with no network requests.

A host runtime exposes `selectionState` as `{ start, end, path }`; `selectNode(id, { extend: true, focus: false })` extends a selection programmatically. Clear selection resets details and highlights. Selection layer visibility controls highlighting without disabling accessible details.

Find and Language filter the compiled nodes locally; they do not reload sources or change stored scene positions. Paths follow the remaining visible connections. Theme switches between the original scene palette and Midnight/Light, retaining per-node mappings. Reset restores the camera and selection; filter and theme controls retain your choices.

The runtime exposes `setFilter({ query, language })` and `setTheme("original" | "midnight" | "light")`. Controls work without a server. The responsive SVG preserves its camera as its container resizes. Changes to the operating system reduced-motion preference immediately pause SVG animation and disable CSS animation.
