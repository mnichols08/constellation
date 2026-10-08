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
  assert.throws(() => parseConfig({ version: 7, account: 'journey', projectFamilies: { a: { label: 'A', members: ['Owner/Repo', 'owner/repo'] } } }), /unique/);
  assert.throws(() => parseConfig({ version: 7, account: 'journey', projectFamilies: { a: { label: 'A', members: ['Owner/Repo', 'Owner/Other'] }, b: { label: 'B', members: ['owner/repo', 'Elsewhere/Repo'] } } }), /multiple project families/);
  assert.equal(parseConfig({ version: 7, account: 'journey', projectFamilies: { a: { label: 'A', members: ['Owner/Repo', 'Elsewhere/Repo'] } } }).options.projectFamilies.a.members[0], 'Owner/Repo');
  assert.equal(renderSceneSVG(scene, { semanticLevel: 'groups' }).includes('Open Tooling'), true);
  const html = renderSceneHTML(scene, { semanticLevel: 'groups' });
  assert.match(html, /Open Tooling/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(renderSceneSVG(scene, { semanticLevel: 'groups' }), /Open Tooling · project family · 3 projects/);
});

test('repository-owner grouping has stable identity, truthful evidence, and remains conservative', () => {
  const scene = createScene('journey', repositories, {});
  const hierarchy = buildSemanticHierarchy(scene);
  assert.equal(hierarchy.groups.length, 1);
  const group = hierarchy.groups[0];
  assert.equal(group.kind, 'repository-owner');
  assert.match(group.id, /^group:owner:/);
  assert.equal(group.provenance, 'derived');
  assert.deepEqual(group.members, ['journey/demo-a', 'journey/demo-b', 'journey/demo-c']);
  assert.deepEqual(group.basis, ['repository-owner:journey']);
  assert.deepEqual(buildSemanticHierarchy({ ...scene, nodes: [...scene.nodes].reverse(), edges: [...scene.edges].reverse() }).groups, hierarchy.groups);
  const filtered = [repositories[0], repositories[1], repositories[3], { full_name: 'another/other', name: 'other-2', language: 'JavaScript', topics: ['web'] }];
  const filteredIds = [repositories.slice(0, 2), [repositories[1], repositories[2]], [repositories[2], repositories[0]]].map(visible => buildSemanticHierarchy(createScene('journey', [...visible, ...filtered.slice(2)], {})).groups.find(item => item.kind === 'repository-owner').id);
  assert.deepEqual(filteredIds, [group.id, group.id, group.id]);
  assert.notEqual(buildSemanticHierarchy(createScene('journey', [{ ...repositories[0], full_name: 'elsewhere/demo-a' }, { ...repositories[1], full_name: 'elsewhere/demo-b' }, { ...repositories[2], full_name: 'elsewhere/demo-c' }, { ...repositories[3], full_name: 'another/other' }], {})).groups[0].id, group.id);
  const explanation = explainGroup(hierarchy, group.id);
  assert.match(explanation.basis[0], /^repository-owner:/);
  assert.doesNotMatch(explanation.basis.join(' '), /organization/i);
  const ownerSvg = renderSceneSVG(scene, { semanticLevel: 'groups' });
  assert.match(ownerSvg, /journey · repository-owner group · 3 projects/);
  assert.doesNotMatch(ownerSvg, /same organization|organization group/i);
  assert.equal(buildSemanticHierarchy(createScene('journey', repositories.slice(0, 2).concat(filtered.slice(2)), {})).groups[0].id, group.id);
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
    assert.equal(explainEdge(grouped, edge.id).truncated, false);
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

test('aggregate edge references cap at 256 while counts and truncation stay truthful', () => {
  const repos = [...Array.from({ length: 18 }, (_, i) => ({ full_name: `left/project-${i}`, name: `left-${i}`, language: 'Rust' })), ...Array.from({ length: 18 }, (_, i) => ({ full_name: `right/project-${i}`, name: `right-${i}`, language: 'Rust' }))];
  const families = { left: { label: 'Left', members: repos.slice(0, 18).map(repo => repo.full_name) }, right: { label: 'Right', members: repos.slice(18).map(repo => repo.full_name) } };
  const source = createScene('benchmark', repos, { projectFamilies: families });
  const cases = [12, 256, 900];
  for (const total of cases) {
    const edges = Array.from({ length: total }, (_, i) => ({ id: `real-edge:${i}`, from: repos[i % 18].full_name, to: repos[18 + (Math.floor(i / 18) % 18)].full_name, metadata: {}, geometry: { distance: 1 }, style: { primary: false } }));
    const scene = { ...source, edges };
    const hierarchy = buildSemanticHierarchy(scene, { derive: false });
    const grouped = projectSemanticLevel(scene, 'groups', { hierarchy });
    const aggregate = grouped.edges[0];
    const explanation = explainEdge(grouped, aggregate.id);
    assert.equal(aggregate.metadata.relationshipCount, total);
    assert.equal(aggregate.metadata.memberEdges.length, Math.min(total, 256));
    assert.ok(aggregate.metadata.memberEdges.every(id => edges.some(edge => edge.id === id)));
    assert.equal(explanation.relationshipCount, total);
    assert.equal(explanation.retainedEdgeCount, Math.min(total, 256));
    assert.equal(explanation.truncated, total > 256);
    assert.equal(validateScene(grouped).valid, true);
  }
});

function parseSceneRoundTrip(scene) { return JSON.parse(serializeScene(scene)); }
