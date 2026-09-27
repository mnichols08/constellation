import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutHost, createPluginHost, createScene, parseConfig, serializeConfig, renderSceneSVG } from '../src/core-api.mjs';
const capabilities = { maxNodes: 100, manualPositioning: true, ringSnapping: false, deterministicSeed: true, animation: true, refinement: true };
const records = [0, 1, 2].map(i => ({ full_name: `registered/p${i}`, name: `p${i}`, language: 'Rust' }));
const grid = { id: 'grid', apiVersion: 1, capabilities, layout: scene => Object.fromEntries(scene.nodes.map((node, i) => [node.id, { x: 100 + i * 100, y: 150 }])) };

test('trusted layout registration produces scenes and survives declarative config round trips', () => {
  const host = createPluginHost().registerLayout(grid);
  const options = parseConfig(serializeConfig('registered', { layoutEngine: 'grid', starPositions: { 'registered/p0': { x: 333, y: 222 } } })).options;
  const scene = host.createScene('registered', records, options);
  assert.equal(scene.nodes.find(node => node.id === 'registered/p0').geometry.x, 333);
  assert.equal(scene.nodes.find(node => node.id === 'registered/p1').geometry.y, 150);
  assert.match(renderSceneSVG(scene), /class="shared-language"/);
  assert.throws(() => createScene('registered', records, options), /Register it/);
  assert.throws(() => parseConfig({ layoutEngine: 'https://example.com/layout.js' }), /identifier/);
});

test('registrations and callback inputs are isolated; capabilities and positions are enforced', () => {
  const definition = { ...grid, capabilities: { ...capabilities } };
  const host = createLayoutHost().register(definition);
  definition.layout = () => { throw new Error('mutated'); }; definition.capabilities.maxNodes = 0;
  const scene = createScene('registered', records);
  assert.equal(Object.keys(host.run(scene, { layoutEngine: 'grid' }).positions).length, 3);
  assert.throws(() => host.register(grid), /already registered/);
  assert.throws(() => host.run(scene, { layoutEngine: 'grid', snapToRings: true }), /ring snapping/);
  assert.equal(createLayoutHost().describe('grid'), null);
  const broken = createLayoutHost().register({ ...grid, id: 'broken', layout: () => ({ unknown: { x: 1, y: 2 } }) });
  assert.throws(() => broken.run(scene, { layoutEngine: 'broken' }), /every scene node/);
  const mutation = createLayoutHost().register({ ...grid, id: 'isolated', layout(input) { input.nodes[0].metadata.name = 'changed'; return grid.layout(input); } });
  mutation.run(scene, { layoutEngine: 'isolated' });
  assert.notEqual(scene.nodes[0].metadata.name, 'changed');
});
