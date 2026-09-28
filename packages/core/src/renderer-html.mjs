import { renderSceneSVG } from './renderer-svg.mjs';
import { serializeScene } from './scene.mjs';
import { mountInteractive, interactiveStyles } from './interactive-runtime.mjs';
import { bindings, base64 } from './wasm/inline.mjs';
import { mountTimeline } from './timeline-runtime.mjs';
import { replaceInteractiveSVG, transitionCamera } from './scene-transition.mjs';
import { mountHierarchy } from './hierarchy-runtime.mjs';
import { mountStory } from './story-runtime.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const scriptJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
const runtimeScript = `${bindings}
await __wbg_init({ module_or_path: Uint8Array.from(atob('${base64}'), char => char.charCodeAt(0)) });
const scene = JSON.parse(document.getElementById('constellation-scene').textContent);
const mountScene = (root, scene, options) => (${mountTimeline.toString()})(root, scene, options, ${mountInteractive.toString()});
const mountExperience = (root, scene, options) => (${mountHierarchy.toString()})(root, scene, options, mountScene);
(${mountStory.toString()})(document.getElementById('constellation'), scene, { engine: { shortest_path, neighbors }, history: true, replaceSVG: ${replaceInteractiveSVG.toString()}, transitionCamera: ${transitionCamera.toString()}, frameSVGs: JSON.parse(document.getElementById('constellation-frames').textContent), hierarchyArtifacts: JSON.parse(document.getElementById('constellation-hierarchy').textContent), storyArtifacts: JSON.parse(document.getElementById('constellation-story').textContent) }, mountExperience);`;
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(runtimeScript));
const scriptHash = btoa(String.fromCharCode(...new Uint8Array(digest)));
export const htmlPolicy = `default-src 'none'; script-src 'sha256-${scriptHash}' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`;

export function htmlBundleStatistics(scene) {
  const bytes = value => new TextEncoder().encode(value).length;
  return { htmlBytes: bytes(renderSceneHTML(scene)), sceneBytes: bytes(scriptJSON(scene)), runtimeBytes: bytes(runtimeScript), wasmBytes: Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0) };
}

export function interactiveMarkup(svg) {
  return `<main id="constellation" class="constellation-runtime" aria-label="Interactive constellation">
<div class="constellation-toolbar" role="toolbar" aria-label="View controls">
<button type="button" data-action="zoom-in" aria-label="Zoom in">Zoom in</button><button type="button" data-action="zoom-out" aria-label="Zoom out">Zoom out</button>
<button type="button" data-action="fit">Fit</button><button type="button" data-action="reset">Reset</button><button type="button" data-action="clear">Clear selection</button>
<label>Find <input type="search" data-search placeholder="Find nodes"></label><label>Language <select data-language><option value="">All</option></select></label><label>Theme <select data-theme><option value="original">Original</option><option value="midnight">Midnight</option><option value="light">Light</option></select></label>
</div><div data-viewports><div class="constellation-canvas" data-canvas>${svg}</div></div><p class="constellation-status" data-status role="status" aria-live="polite"></p><section class="constellation-details" data-details aria-label="Node details"></section></main>`;
}

export function renderSceneHTML(scene, { title = 'Constellation' } = {}) {
  serializeScene(scene); // Validate before embedding either data or SVG.
  const svg = renderSceneSVG(scene);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(htmlPolicy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{margin:0;padding:16px;background:#080b11}${interactiveStyles}</style></head><body>
${interactiveMarkup(svg)}
<script type="application/json" id="constellation-scene">${scriptJSON(scene)}</script>
<script type="application/json" id="constellation-frames">${scriptJSON(scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [])}</script>
<script type="application/json" id="constellation-hierarchy">${scriptJSON(hierarchyArtifacts(scene))}</script>
<script type="application/json" id="constellation-story">${scriptJSON(storyArtifacts(scene))}</script>
<script type="module">${runtimeScript}</script>
</body></html>\n`;
}

export function hierarchyArtifacts(scene) {
  return scene.hierarchy?.scenes.map(entry => ({ id: entry.id, svg: renderSceneSVG(entry.scene), frameSVGs: entry.scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [] })) || [];
}
export function storyArtifacts(scene) {
  return scene.story?.chapters.map(chapter => ({ svg: renderSceneSVG(chapter.scene), frameSVGs: chapter.scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [], hierarchyArtifacts: hierarchyArtifacts(chapter.scene) })) || [];
}
