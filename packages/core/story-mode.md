# Visual stories

A story is an ordered, declarative set of chapters. Chapters use compiled scenes or explicit scene definitions; configuration never contains executable callbacks.

```js
import { createScene, createStory, renderSceneHTML } from '@constellation/core';
const scene = createScene('example', records, { referenceDate: '2026-09-01T00:00:00Z' });
const story = createStory({ scenes: [{ id: 'projects', scene }], chapters: [
  { id: 'intro', title: 'Our projects', narration: 'Start with the whole collection.', scene: 'projects' },
  { id: 'compiler', title: 'The compiler', scene: 'projects', focus: 'example/compiler',
    annotations: [{ x: 450, y: 50, text: 'Shared tooling' }], theme: 'light',
    layers: { starfield: { visible: false } } },
] });
const html = renderSceneHTML(story);
```

Use `scene` as a catalog ID or a compiled scene object. Alternatively supply `definition: { account, records, options }` in a chapter or catalog entry. `layout` selects an existing arrangement for a declarative definition and invokes the normal compiler/Rust layout. A compiled scene cannot be relaid out without its input definition.

Chapters support `id`, `title`, `narration`, `camera` (four-number viewBox), `focus` (node ID), `selection` (zero, one or two IDs), `path: { start, end }`, `filter: { query, language }`, `theme`, `timeline` (frame index), `annotations` (text/x/y), and `layers`. Two selected endpoints highlight the Rust-computed shortest path. A filter that hides the requested selection clears it. Annotations use the normal annotations layer and are escaped in SVG and HTML.

Compilation produces `story.version: 1` with ordered chapters containing isolated scenes and validated runtime state. There are at most 64 chapters and 16,384 chapter nodes. Titles/narration remain text. Static SVG renders the first chapter's scene. Interactive HTML and the web component provide Previous/Next and a labelled chapter selector; no autoplay is introduced.

Call `setChapter(idOrIndex)` and inspect `chapterIndex` on the runtime or component. `chapter-change` reports `{ index, id, title }`. Nested timeline and hierarchy controls remain available inside each chapter. Story navigation itself does not overwrite the embedding page's browser history.

## Chapter transitions

Manual chapter changes interpolate shared-node position, size, fill color and opacity over 300 ms; arriving/departing nodes fade. Shared node groups keep their DOM identity. Camera movement follows the chapter’s explicit view or focused node. Changing chapter again cancels the previous transition and disposes temporary graphics. The system reduced-motion preference skips these effects and immediately applies the target camera, including when changed mid-transition. No timer advances chapters automatically.

## Editing in Studio

Open the Story tab and choose Create chapter to capture the current compiled design and selection. Change the constellation in the normal tabs, then capture another chapter. Use Active chapter to select a chapter; edit its title/narration, duplicate it, move it up/down, or remove it. Captured scenes are isolated from later design changes.

Preview story opens the complete player at the selected chapter inside a sandboxed iframe. Download story HTML produces an offline artifact starting at chapter one. Download story JSON saves the editable compiled story; Import story JSON restores it. Story work stays in memory until downloaded and is separate from the ordinary README config/workflow. The Look tab and simple account workflow remain unchanged.

Programmatic HTML previews may use `renderSceneHTML(story, { initialChapter: index })`; the renderer validates the index and keeps its CSP deterministic.
