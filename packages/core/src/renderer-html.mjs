import { renderSceneSVG } from './renderer-svg.mjs';
import { serializeScene } from './scene.mjs';
import { mountInteractive, interactiveStyles } from './interactive-runtime.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const scriptJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

export function interactiveMarkup(svg) {
  return `<main id="constellation" class="constellation-runtime" aria-label="Interactive constellation">
<div class="constellation-toolbar" role="toolbar" aria-label="View controls">
<button type="button" data-action="zoom-in" aria-label="Zoom in">Zoom in</button><button type="button" data-action="zoom-out" aria-label="Zoom out">Zoom out</button>
<button type="button" data-action="fit">Fit</button><button type="button" data-action="reset">Reset</button><button type="button" data-action="clear">Clear selection</button>
</div><div class="constellation-canvas" data-canvas>${svg}</div><p class="constellation-status" data-status role="status" aria-live="polite"></p></main>`;
}

export function renderSceneHTML(scene, { title = 'Constellation' } = {}) {
  serializeScene(scene); // Validate before embedding either data or SVG.
  const svg = renderSceneSVG(scene);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{margin:0;padding:16px;background:#080b11}${interactiveStyles}</style></head><body>
${interactiveMarkup(svg)}
<script type="application/json" id="constellation-scene">${scriptJSON(scene)}</script>
<script type="module">const scene = JSON.parse(document.getElementById('constellation-scene').textContent);
(${mountInteractive.toString()})(document.getElementById('constellation'), scene);</script>
</body></html>\n`;
}
