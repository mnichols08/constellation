import { performance } from 'node:perf_hooks';
import { createScene, buildSemanticHierarchy, projectSemanticLevel, expandGroup, collapseGroup, renderSceneHTML } from '../src/core-api.mjs';

function fixture(count) {
  const base = createScene('benchmark', [{ full_name: 'owner/project-0', name: 'project-0', language: 'Rust', topics: ['tools'] }, { full_name: 'other/project', name: 'project', language: 'Rust', topics: ['tools'] }], { bridges: true });
  const template = base.nodes[0];
  base.nodes = Array.from({ length: count }, (_, index) => {
    const id = `${index < Math.ceil(count / 4) ? 'family' : `owner-${index % 7}`}/project-${index}`;
    return { ...structuredClone(template), id, metadata: { ...template.metadata, full_name: id, name: `project-${index}`, nodeKind: 'repository' }, geometry: { ...template.geometry, x: 40 + (index % 48) * 16, y: 40 + Math.floor(index / 48) * 16 } };
  });
  base.labels = base.nodes.map(node => ({ id: node.id, x: node.geometry.x, y: node.geometry.y + 18, text: node.metadata.name, hidden: false, focal: false }));
  base.edges = Array.from({ length: count }, (_, index) => {
    const from = base.nodes[index], to = base.nodes[(index + 1) % count];
    return { id: JSON.stringify([from.id, to.id]), from: from.id, to: to.id, metadata: { sharedLanguages: ['Rust'], sharedTopics: ['tools'] }, geometry: { distance: 16 }, style: { primary: false } };
  });
  delete base.evidence;
  base.presentation.graph.nodeCount = count; base.presentation.graph.repositoryCount = count; base.presentation.graph.total = count;
  return base;
}

for (const count of [45, 256, 2048]) {
  const scene = fixture(count), familyMembers = scene.nodes.slice(0, Math.max(2, Math.floor(count / 4))).map(node => node.id);
  const projectFamilies = { benchmark: { label: 'Benchmark Family', members: familyMembers } };
  const startHierarchy = performance.now();
  const hierarchy = buildSemanticHierarchy(scene, { projectFamilies });
  const hierarchyMs = performance.now() - startHierarchy;
  const startProjection = performance.now();
  const grouped = projectSemanticLevel(scene, 'groups', { hierarchy });
  const projectionMs = performance.now() - startProjection;
  const group = hierarchy.groups[0];
  const startExpand = performance.now();
  const expanded = expandGroup(grouped, hierarchy, group.id);
  const expansionMs = performance.now() - startExpand;
  const startCollapse = performance.now();
  collapseGroup(expanded, hierarchy, group.id);
  const collapseMs = performance.now() - startCollapse;
  const htmlBytes = Buffer.byteLength(renderSceneHTML(scene, { semanticLevel: 'groups' }));
  console.log(JSON.stringify({ projects: count, groups: hierarchy.groups.length, visibleNodes: grouped.nodes.length, edges: scene.edges.length, aggregateEdges: grouped.edges.length, hierarchyMs: +hierarchyMs.toFixed(2), projectionMs: +projectionMs.toFixed(2), expansionMs: +expansionMs.toFixed(2), collapseMs: +collapseMs.toFixed(2), sourceSceneBytes: Buffer.byteLength(JSON.stringify(scene)), groupedSceneBytes: Buffer.byteLength(JSON.stringify(grouped)), interactiveHtmlBytes: htmlBytes }));
}
