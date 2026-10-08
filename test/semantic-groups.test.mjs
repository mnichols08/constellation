import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSemanticHierarchy, projectSemanticLevel, expandGroup, collapseGroup, explainGroup, createScene, explainEdge, parseConfig, serializeConfig } from '../src/core-api.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';
import { renderSceneHTML } from '../src/renderer-html.mjs';
import { validateScene, serializeScene } from '../src/scene.mjs';

const repositories = [
  { full_name: 'journey/demo-a', name: 'demo-a', language: 'Rust', topics: ['tools'] },
  { full_name: 'journey/demo-b', name: 'demo-b', language: 'Rust', topics: ['tools'] },
  { full_name: 'journey/demo-c', name: 'demo-c', language: 'Rust', topics: ['tools'] },
  { full_name: 'elsewhere/other', name: 'other', language: 'JavaScript', topics: ['web'] },
];

test('project families are stable, persisted in config and explain user provenance', () => {
  const options = { projectFamilies: { 'open-tooling': { label: 'Open Tooling', members: ['journey/demo-a', 'journey/demo-b', 'journey/demo-c'] } } };
  const config = parseConfig({ version: 7, account: 'journey', ...options });
  assert.deepEqual(parseConfig(serializeConfig(config.account, config.options)).options.projectFamilies, options.projectFamilies);
  const scene = createScene('journey', repositories, options);
  const hierarchy = buildSemanticHierarchy(scene);
  const group = hierarchy.groups[0];
  assert.equal(group.id, 'group:user:open-tooling');
  assert.equal(group.label, 'Open Tooling');
  assert.equal(group.provenance, 'user');
  assert.deepEqual(group.members, ['journey/demo-a', 'journey/demo-b', 'journey/demo-c']);
  assert.match(explainGroup(hierarchy, group.id).summary, /Defined by you/);
  assert.equal(buildSemanticHierarchy(scene).groups[0].id, group.id);
  assert.equal(buildSemanticHierarchy(scene, { projectFamilies: {}, derive: false }).groups.length, 0);
  assert.throws(() => parseConfig({ version: 7, account: 'journey', projectFamilies: { a: { label: 'A', members: ['journey/demo-a', 'journey/demo-b'] }, b: { label: 'B', members: ['journey/demo-a', 'journey/demo-c'] } } }), /multiple project families/);
  assert.equal(renderSceneSVG(scene, { semanticLevel: 'groups' }).includes('Open Tooling'), true);
  const html = renderSceneHTML(scene, { semanticLevel: 'groups' });
  assert.match(html, /Open Tooling/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(renderSceneSVG(scene, { semanticLevel: 'groups' }), /Open Tooling · project family · 3 projects/);
});

test('organization grouping is deterministic, conservative and evidence-backed', () => {
  const scene = createScene('journey', repositories, {});
  const hierarchy = buildSemanticHierarchy(scene);
  assert.equal(hierarchy.groups.length, 1);
  const group = hierarchy.groups[0];
  assert.equal(group.kind, 'organization');
  assert.equal(group.provenance, 'derived');
  assert.deepEqual(group.members, ['journey/demo-a', 'journey/demo-b', 'journey/demo-c']);
  assert.deepEqual(buildSemanticHierarchy({ ...scene, nodes: [...scene.nodes].reverse(), edges: [...scene.edges].reverse() }).groups, hierarchy.groups);
  assert.match(explainGroup(hierarchy, group.id).basis[0], /^organization:/);
  assert.equal(buildSemanticHierarchy(createScene('journey', repositories.slice(0, 2), {})).groups.length, 0);
  assert.equal(buildSemanticHierarchy(scene, { projectFamilies: { family: { label: 'Family', members: repositories.slice(0, 3).map(repo => repo.full_name) } } }).groups.length, 1);
});

test('projection is reversible and aggregated edges reference only actual source edges', () => {
  const repos = [...repositories, { full_name: 'elsewhere/second', name: 'second', language: 'Rust', topics: ['tools'] }];
  const scene = createScene('journey', repos, { connectionBasis: 'languages', bridges: true });
  const hierarchy = buildSemanticHierarchy(scene, { projectFamilies: { journey: { label: 'Journey', members: ['journey/demo-a', 'journey/demo-b', 'journey/demo-c'] } } });
  const groupId = hierarchy.groups[0].id;
  const grouped = projectSemanticLevel(scene, 'groups', { hierarchy });
  assert.equal(validateScene(grouped).valid, true);
  assert.equal(grouped.nodes.some(node => node.id === groupId), true);
  assert.ok(grouped.evidence.subjects.some(subject => subject.kind === 'group' && subject.id === groupId));
  const edge = grouped.edges.find(item => item.metadata.aggregated);
  if (edge) {
    assert.ok(edge.metadata.memberEdges.every(id => scene.edges.some(source => source.id === id)));
    assert.equal(explainEdge(grouped, edge.id).summary, `${edge.metadata.relationshipCount} underlying relationships.`);
  }
  const expanded = expandGroup(grouped, hierarchy, groupId);
  assert.equal(expanded.nodes.some(node => node.id === 'journey/demo-a'), true);
  assert.equal(expanded.nodes.some(node => node.id === groupId), false);
  assert.ok(expanded.evidence.subjects.some(subject => subject.kind === 'node' && subject.id === 'journey/demo-a'));
  assert.equal(expanded.edges.every(item => scene.edges.some(source => source.id === item.id) || item.metadata.aggregated), true);
  const collapsed = collapseGroup(expanded, hierarchy, groupId);
  assert.deepEqual(collapsed.nodes.map(node => node.id), grouped.nodes.map(node => node.id));
  const noRelationships = projectSemanticLevel({ ...scene, edges: [] }, 'groups', { hierarchy: buildSemanticHierarchy(scene, { projectFamilies: { journey: { label: 'Journey', members: ['journey/demo-a', 'journey/demo-b', 'journey/demo-c'] } } }) });
  assert.equal(noRelationships.edges.length, 0);
  assert.equal(parseSceneRoundTrip(grouped).semanticGroups.level, 'groups');
});

function parseSceneRoundTrip(scene) { return JSON.parse(serializeScene(scene)); }
