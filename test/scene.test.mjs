import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createScene, renderSceneSVG, renderConstellation, serializeScene } from '../src/core-api.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/scene-svg-v2.json', import.meta.url)));

test('scene rendering and JSON round trips preserve original 2.0 SVG bytes', () => {
  for (const { options, sha256 } of fixture.cases) {
    const scene = createScene(fixture.account, fixture.repositories, options);
    const svg = renderSceneSVG(JSON.parse(serializeScene(scene)));
    assert.equal(createHash('sha256').update(svg).digest('hex'), sha256, JSON.stringify(options));
    assert.equal(renderConstellation(fixture.account, fixture.repositories, options), svg);
  }
});

test('scene records own geometry, metadata, labels and trusted plugin icon data', () => {
  const repositories = structuredClone(fixture.repositories);
  const scene = createScene(fixture.account, repositories, fixture.cases[0].options, { nodeRenderer: () => ({ path: 'M0 -1L1 0L0 1L-1 0Z', fill: '#abcdef' }) });
  assert.equal(scene.nodes.length, 4);
  assert.ok(scene.nodes.every(node => node.id === node.metadata.full_name && Number.isFinite(node.geometry.x)));
  assert.ok(scene.edges.every(edge => scene.nodes.some(node => node.id === edge.from) && scene.nodes.some(node => node.id === edge.to)));
  assert.ok(scene.labels.every(label => Number.isFinite(label.x) && typeof label.text === 'string'));
  const before = serializeScene(scene);
  repositories[0].name = 'changed';
  repositories[0].languages.Rust = 0;
  assert.equal(serializeScene(scene), before);
  const moved = structuredClone(scene);
  moved.nodes[0].geometry.x = 123;
  assert.match(renderSceneSVG(moved), /cx="123.0"/);
  assert.notEqual(renderSceneSVG(moved), renderSceneSVG(scene));
});
