import { renderSceneSVG } from './renderer-svg.mjs';
import { serializeScene } from './scene.mjs';
import { mountInteractive, interactiveStyles } from './interactive-runtime.mjs';
import { bindings, base64 } from './wasm/inline.mjs';
import { mountTimeline } from './timeline-runtime.mjs';
import { replaceInteractiveSVG, transitionCamera } from './scene-transition.mjs';
import { mountHierarchy } from './hierarchy-runtime.mjs';
import { mountStory } from './story-runtime.mjs';
import { mountTemporalStack } from './temporal-stack-runtime.mjs';
import { projectTemporalPlane } from './temporal-stack-model.mjs';
import { createTemporalGeometryMath } from './temporal-geometry.mjs';
import { temporalGeometryDrawing } from './temporal-geometry-drawing.mjs';
import { applyTemporalGeometryDrawing } from './temporal-geometry-runtime.mjs';
import { temporalMotion } from './temporal-motion.mjs';
import { createExplanationHelpers, EVIDENCE_VERSION, dimensionName, layoutSummary } from './evidence.mjs';
import { buildSemanticHierarchy, projectSemanticLevel } from './semantic-groups.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const scriptJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
const runtimeScript = `${bindings}
await __wbg_init({ module_or_path: Uint8Array.from(atob('${base64}'), char => char.charCodeAt(0)) });
const explanationAPI = (${createExplanationHelpers.toString()})(${EVIDENCE_VERSION}, (${dimensionName.toString()}), (${layoutSummary.toString()}));
const scene = JSON.parse(document.getElementById('constellation-scene').textContent);
const semanticArtifacts = JSON.parse(document.getElementById('constellation-semantic-artifacts').textContent);
const projectTemporalPlane = ${projectTemporalPlane.toString()};
const temporalGeometryMath = (${createTemporalGeometryMath.toString()})();
const temporalMotion = ${temporalMotion.toString()};
const temporalGeometryDrawing = ${temporalGeometryDrawing.toString()};
const applyTemporalGeometryDrawing = ${applyTemporalGeometryDrawing.toString()};
const mountTemporalStack = ${mountTemporalStack.toString()};
const mountScene = (root, scene, options) => (${mountTimeline.toString()})(root, scene, { ...options, semanticGroupActions: semanticArtifacts.length > 0 }, (root, scene, options) => (${mountInteractive.toString()})(root, scene, options, explanationAPI));
const mountExperience = (root, scene, options) => (${mountHierarchy.toString()})(root, scene, options, mountScene);
const runtimeOptions = { engine: { shortest_path, neighbors }, history: true, replaceSVG: ${replaceInteractiveSVG.toString()}, transitionCamera: ${transitionCamera.toString()}, frameSVGs: JSON.parse(document.getElementById('constellation-frames').textContent), hierarchyArtifacts: JSON.parse(document.getElementById('constellation-hierarchy').textContent), storyArtifacts: JSON.parse(document.getElementById('constellation-story').textContent) };
let experience = (${mountStory.toString()})(document.getElementById('constellation'), scene, runtimeOptions, mountExperience);
if (semanticArtifacts.length) {
  const root = document.getElementById('constellation');
  const baseSVG = JSON.parse(document.getElementById('constellation-semantic-base').textContent);
  const byId = new Map(semanticArtifacts.map(item => [item.id, item]));
  const show = (nextScene, svg, selected) => {
    const camera = experience.camera, filter = experience.filter, theme = experience.theme;
    experience.destroy?.();
    root.querySelector('[data-canvas]').innerHTML = svg;
    experience = mountExperience(root, nextScene, { ...runtimeOptions, emitReady: false, history: false });
    if (camera) experience.setCamera?.(camera);
    if (filter) experience.setFilter?.(filter);
    if (theme) experience.setTheme?.(theme);
    if (selected) { try { experience.selectNode(selected, { focus: false }); } catch {} }
  };
  root.addEventListener('semantic-group-expand', event => {
    const artifact = byId.get(event.detail.id);
    if (artifact) show(artifact.scene, artifact.svg, artifact.scene.semanticGroups.groups.find(group => group.id === event.detail.id)?.members[0]);
  });
  root.addEventListener('semantic-group-collapse', event => {
    if (byId.has(event.detail.id)) show(scene, baseSVG, event.detail.id);
  });
}
const initialChapter = JSON.parse(document.getElementById('constellation-initial').textContent);
if (initialChapter > 0) experience.setChapter(initialChapter);`.replace(/\r\n?/g, '\n');
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

export function renderSceneHTML(scene, { title = 'Constellation', initialChapter = 0, semanticLevel } = {}) {
  serializeScene(scene); // Validate before embedding either data or SVG.
  const level = semanticLevel || (scene.presentation?.options?.semanticZoom?.enabled ? scene.presentation.options.semanticZoom.level : 'projects');
  const canProject = scene.kind === 'scene' && !scene.timeline && !scene.temporalStack;
  const grouped = canProject && (level === 'groups' || level === 'overview');
  const hierarchy = grouped ? buildSemanticHierarchy(scene, { projectFamilies: scene.presentation.options.projectFamilies }) : null;
  const view = !grouped ? scene : projectSemanticLevel(scene, level, { hierarchy });
  if (!Number.isInteger(initialChapter) || initialChapter < 0 || initialChapter >= (view.story?.chapters.length || 1)) throw new Error('Invalid initial story chapter.');
  const svg = renderSceneSVG(view, { interactive: true, semanticLevel: 'projects' });
  let semanticArtifacts = [];
  const sourceBytes = new TextEncoder().encode(JSON.stringify(scene)).length;
  if (grouped && !scene.story && !scene.hierarchy && scene.nodes.length <= 256 && sourceBytes <= 256 * 1024 && hierarchy.groups.length <= 32) {
    semanticArtifacts = hierarchy.groups.map(group => {
      const expanded = projectSemanticLevel(scene, 'groups', { hierarchy, expanded: [group.id] });
      return { id: group.id, scene: expanded, svg: renderSceneSVG(expanded, { interactive: true, semanticLevel: 'projects' }) };
    });
    if (new TextEncoder().encode(JSON.stringify(semanticArtifacts)).length > 4 * 1024 * 1024) semanticArtifacts = [];
  }
  const semanticBase = semanticArtifacts.length ? svg : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(htmlPolicy)}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>body{margin:0;padding:16px;background:#080b11}${interactiveStyles}</style></head><body>
${interactiveMarkup(svg)}
<script type="application/json" id="constellation-scene">${scriptJSON(view)}</script>
<script type="application/json" id="constellation-semantic-artifacts">${scriptJSON(semanticArtifacts)}</script>
<script type="application/json" id="constellation-semantic-base">${scriptJSON(semanticBase)}</script>
<script type="application/json" id="constellation-frames">${scriptJSON(view.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [])}</script>
<script type="application/json" id="constellation-hierarchy">${scriptJSON(hierarchyArtifacts(view))}</script>
<script type="application/json" id="constellation-story">${scriptJSON(storyArtifacts(view))}</script>
<script type="application/json" id="constellation-initial">${scriptJSON(initialChapter)}</script>
<script type="module">${runtimeScript}</script>
</body></html>\n`;
}

export function hierarchyArtifacts(scene) {
  return scene.hierarchy?.scenes.map(entry => ({ id: entry.id, svg: renderSceneSVG(entry.scene), frameSVGs: entry.scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [] })) || [];
}
export function storyArtifacts(scene) {
  return scene.story?.chapters.map(chapter => ({ svg: renderSceneSVG(chapter.scene), frameSVGs: chapter.scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [], hierarchyArtifacts: hierarchyArtifacts(chapter.scene) })) || [];
}
