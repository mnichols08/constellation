import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, renderSceneSVG, serializeScene, parseScene } from '../src/core-api.mjs';
import { composeLayers } from '../src/scene-layers.mjs';

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
