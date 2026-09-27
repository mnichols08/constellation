import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutScene, createScene, serializeScene, parseScene } from '../src/core-api.mjs';
const records = ['Rust', 'Python', 'Rust'].map((language, i) => ({ name: `p-${i}`, full_name: `layout/p-${i}`, language, stargazers_count: i * 10 }));
const options = { referenceDate: '2026-09-01T00:00:00Z', animate: false };
test('existing layouts share the scene interface and preserve seeded/manual coordinates', () => {
  for (const arrangement of ['field', 'rings', 'orbital', 'force', 'galaxy', 'solar-system']) {
    const settings = { ...options, arrangement, starPositions: { 'layout/p-0': { x: 123, y: 234 } } };
    const scene = createScene('layout', records, settings);
    const first = layoutScene(scene, settings), second = layoutScene(parseScene(serializeScene(scene)), settings);
    assert.deepEqual(first, second);
    assert.deepEqual(first.positions['layout/p-0'], { x: 123, y: 234 });
    assert.deepEqual(scene.nodes.map(node => node.geometry.x), scene.nodes.map(node => first.positions[node.id].x));
    first.positions['layout/p-0'].x = 999;
    assert.equal(layoutScene(scene, settings).positions['layout/p-0'].x, 123);
  }
});
