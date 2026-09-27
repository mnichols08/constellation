import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, renderSceneSVG, serializeScene, parseScene } from '../src/core-api.mjs';
import { composeLayers } from '../src/scene-layers.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { renderWorkflow } from '../src/export.mjs';

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
