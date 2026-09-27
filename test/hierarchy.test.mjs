import test from 'node:test';
import assert from 'node:assert/strict';
import { createHierarchy, createOrganizationHierarchy, createScene, serializeScene, parseScene, renderSceneSVG } from '../src/core-api.mjs';

const options = { referenceDate: '2026-09-01T00:00:00Z', animate: false };
const root = createScene('demo', [{ name: 'compiler', full_name: 'demo/compiler', language: 'Rust' }], options);
const definition = { root: 'account', scenes: [
  { id: 'account', title: 'Projects', scene: root, links: [{ nodeId: 'demo/compiler', target: 'compiler' }] },
  { id: 'compiler', title: 'Compiler technologies', definition: { account: 'demo', records: [{ name: 'Rust', full_name: 'technology:Rust', nodeKind: 'language', language: 'Rust' }], options } },
] };

test('organization detail scenes reuse verified project and contributor scope without API calls', () => {
  const repositories = [{ name: 'compiler', full_name: 'demo/compiler', language: 'Rust', languages: { Rust: 90, C: 10 }, topics: ['compiler'] }, { name: 'private', full_name: 'demo/private', private: true, language: 'Rust' }];
  const scene = createOrganizationHierarchy('demo', repositories, { ...options, organizationData: { records: { 'demo/compiler': [{ login: 'alice', contributions: 5 }], 'demo/private': [{ login: 'secret', contributions: 8 }] }, scanned: 1, selected: 2, complete: false } });
  const child = scene.hierarchy.scenes.find(entry => entry.id === 'repository:demo/compiler').scene;
  assert.ok(child.nodes.some(node => node.id === 'contributor:alice'));
  assert.ok(child.nodes.some(node => node.id === 'language:Rust'));
  assert.ok(child.nodes.some(node => node.id === 'language:C'));
  assert.ok(!child.nodes.some(node => node.id === 'contributor:secret'));
  assert.ok(!serializeScene(scene).includes('contributor:secret'));
  assert.ok(!serializeScene(scene).includes('demo/private'));
  assert.match(child.presentation.graph.note, /already-loaded/);
  assert.equal(scene.hierarchy.scenes.length, 2);
  assert.throws(() => createOrganizationHierarchy('demo', repositories, options, { maxProjects: 64 }), /maxProjects/);
});

test('explicit node references compile into deterministic serializable child scenes', () => {
  const scene = createHierarchy(definition);
  assert.equal(scene.nodes[0].interaction.childScene, 'compiler');
  assert.equal(root.nodes[0].interaction.childScene, undefined);
  assert.equal(scene.hierarchy.scenes[1].scene.nodes[0].id, 'technology:Rust');
  assert.equal(serializeScene(scene), serializeScene(createHierarchy({ ...definition, scenes: [...definition.scenes].reverse() })));
  assert.equal(renderSceneSVG(parseScene(serializeScene(scene))), renderSceneSVG(scene.hierarchy.scenes[0].scene));
  const invalid = structuredClone(definition); invalid.scenes[0].links[0].target = 'missing';
  assert.throws(() => createHierarchy(invalid), /Missing child/);
  const abort = new AbortController(); abort.abort();
  assert.throws(() => createHierarchy(definition, { signal: abort.signal }), /abort/i);
});
