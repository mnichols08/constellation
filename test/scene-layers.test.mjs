import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, renderSceneSVG, serializeScene, parseScene } from '../src/core-api.mjs';
import { composeLayers } from '../src/scene-layers.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { renderWorkflow } from '../src/export.mjs';
import { migrateWorkflow } from '../src/migrate.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';

test('layer controls survive share links and workflow migration without executable payloads', () => {
  const layers = { nodes: { opacity: 0.4 }, annotations: { visible: false } };
  const url = encodeShare('https://example.com/', 'layers', { layers });
  assert.deepEqual(decodeShare(url).options.layers, layers);
  assert.match(migrateWorkflow(renderWorkflow('layers', { layers }).replace('constellation@v3', 'constellation@v1')), /"opacity": 0.4/);
  for (const opacity of ['0.5" onload="alert(1)', Infinity, -1]) assert.throws(() => parseConfig({ layers: { nodes: { opacity } } }), /opacity|non-finite/);
  assert.throws(() => parseConfig(JSON.parse('{"layers":{"__proto__":{}}}')), /Unsafe/);
});

test('hidden annotations stay hidden in animated historical exports and zero-opacity nodes are absent', () => {
  const repositories = [2019, 2022].map(year => ({ name: `project-${year}`, full_name: `layers/${year}`, language: 'Rust', created_at: `${year}-01-01T00:00:00Z` }));
  for (const mode of ['grow', 'orbit', 'crossfade']) {
    const scene = createScene('layers', repositories, { referenceDate: '2026-09-01T00:00:00Z', history: { timeLapse: { enabled: true, mode } }, layers: { annotations: { visible: false } } });
    const svg = renderSceneSVG(parseScene(serializeScene(scene)));
    assert.doesNotMatch(svg, /<text class="history-year|class="credit"/);
    assert.match(svg, /prefers-reduced-motion/);
  }
  const scene = createScene('layers', repositories, { layers: { nodes: { opacity: 0 } } });
  assert.doesNotMatch(renderSceneSVG(scene), /class="repository"/);
});

test('layer controls survive config, workflow and scene round trips without moving nodes', () => {
  const repositories = [{ name: 'core', full_name: 'layers/core', language: 'Rust' }];
  const options = { referenceDate: '2026-09-01T00:00:00Z' };
  const layers = { rings: { visible: false }, starfield: { opacity: 0.25, order: 8 }, labels: { visible: false } };
  const base = createScene('layers', repositories, options);
  const changed = createScene('layers', repositories, { ...options, layers });
  assert.deepEqual(changed.nodes, base.nodes);
  assert.deepEqual(parseConfig(serializeConfig('layers', { layers })).options.layers, layers);
  assert.match(renderWorkflow('layers', { layers }), /"opacity": 0.25/);
  const svg = renderSceneSVG(parseScene(serializeScene(changed)));
  assert.doesNotMatch(svg, /<g class="identity-ring"|<text class="repo-label"/);
  assert.match(svg, /data-scene-layer="starfield" opacity="0.25"/);
  assert.ok(svg.indexOf('class="star"') < svg.indexOf('class="dust"'));
});

test('layer controls reject unsafe payloads and orders that break rendering semantics', () => {
  for (const layers of [null, [], { nodes: { opacity: NaN } }, { nodes: { visible: 'no' } }, { nodes: { html: '<script>' } }, { unknown: {} }, { connections: { order: 99 } }, { background: { order: 99 } }, { selection: { opacity: 0.5 } }]) {
    assert.throws(() => createScene('layers', [], { layers }), /[Ll]ayer/);
  }
});

test('layers compose in deterministic scene order within camera-safe phases', () => {
  const scene = createScene('layers', [], { referenceDate: '2026-09-01T00:00:00Z' });
  const fragments = Object.fromEntries(scene.layers.map(layer => [layer.id, `[${layer.id}]`]));
  assert.equal(composeLayers(scene, 'backdrop', fragments), '[background][effects][starfield]');
  assert.equal(composeLayers(scene, 'world', fragments), '[rings][starfield][connections][nodes][labels]');
  assert.equal(composeLayers(scene, 'underlay', fragments), '[annotations]');
  assert.equal(composeLayers(scene, 'overlay', fragments), '[annotations]');
  assert.equal(composeLayers(scene, 'interaction', fragments), '[selection]');
  assert.deepEqual(parseScene(serializeScene(scene)).layers, scene.layers);
  const malformed = structuredClone(scene);
  malformed.layers[0].phases = ['world'];
  assert.throws(() => renderSceneSVG(malformed), /layer type or phases/);
});
