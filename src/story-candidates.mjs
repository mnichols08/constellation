import { evaluateGraphQuality } from './engine.mjs';
import { createScene } from './constellation.mjs';
import { projectSemanticGraphToScene } from './semantic-graph.mjs';
import { semanticActive } from './semantic-studio.mjs';

export const STORY_CANDIDATE_LIMIT = 3;
export const STORY_TYPES = Object.freeze(['projects', 'technical-shape', 'journey']);

function projectCandidate(graph, options, runtime, mode) {
  const copy = structuredClone(graph);
  let selectedTechnicalCategories = null;
  const projects = copy.nodes.filter(node => node.kind === 'project');
  const evidenceFor = node => [node.properties.language, ...(node.properties.topics || [])].filter(Boolean);
  const explicitPriority = node => ({ featured: 3, supporting: 2, include: 1 }[node.properties.curatedRole] || (node.properties.pinned === true ? 2 : 0));
  if (projects.length > 12) {
    const chosen = [];
    const pending = [...projects].sort((a, b) => explicitPriority(b) - explicitPriority(a) || a.id.localeCompare(b.id));
    while (chosen.length < 12 && pending.length) {
      pending.sort((a, b) => {
        const marginal = node => evidenceFor(node).filter(value => !chosen.some(existing => evidenceFor(existing).includes(value))).length;
        return explicitPriority(b) - explicitPriority(a) || marginal(b) - marginal(a) || a.id.localeCompare(b.id);
      });
      chosen.push(pending.shift());
    }
    const ids = new Set(chosen.map(node => node.id));
    const groupIds = new Set(copy.groups.filter(group => group.members.filter(id => ids.has(id)).length >= 2).map(group => group.id));
    for (const group of copy.groups) if (groupIds.has(group.id)) group.members = group.members.filter(id => ids.has(id));
    for (const node of copy.nodes) if (node.kind === 'semantic-group' && groupIds.has(node.id)) {
      const group = copy.groups.find(item => item.id === node.id);
      node.properties.members = [...group.members];
    }
    const retainedIds = new Set([...ids, ...copy.nodes.filter(node => node.kind === 'developer').map(node => node.id), ...copy.nodes.filter(node => node.kind === 'semantic-group' && groupIds.has(node.id)).map(node => node.id)]);
    copy.nodes = copy.nodes.filter(node => retainedIds.has(node.id));
    copy.groups = copy.groups.filter(group => groupIds.has(group.id));
    copy.edges = copy.edges.filter(edge => retainedIds.has(edge.from) && retainedIds.has(edge.to));
  }
  if (mode === 'technical-shape') {
    const selectedProjects = copy.nodes.filter(node => node.kind === 'project');
    const counts = new Map();
    for (const node of selectedProjects) for (const [kind, value] of [['language', node.properties.language], ...(node.properties.topics || []).map(topic => ['topic', topic])]) {
      if (value) counts.set(`${kind}:${value}`, (counts.get(`${kind}:${value}`) || 0) + 1);
    }
    const meaningful = [...counts].filter(([, count]) => count >= 2 && count < selectedProjects.length)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([key]) => key);
    const selected = selectedTechnicalCategories = new Set(meaningful);
    for (const node of selectedProjects) {
      if (!selected.has(`language:${node.properties.language}`)) delete node.properties.language;
      node.properties.topics = (node.properties.topics || []).filter(topic => selected.has(`topic:${topic}`));
      if (!node.properties.topics.length) delete node.properties.topics;
    }
    const categoryIds = new Set(copy.nodes.filter(node => node.kind === 'language' || node.kind === 'topic')
      .filter(node => selected.has(`${node.kind}:${node.label}`)).map(node => node.id));
    copy.nodes = copy.nodes.filter(node => !['language', 'topic'].includes(node.kind) || categoryIds.has(node.id));
    copy.edges = copy.edges.filter(edge => !['uses-language', 'has-topic'].includes(edge.kind) || categoryIds.has(edge.to));
  }
  if (mode === 'projects') {
    const authored = new Set(copy.groups.filter(group => group.provenance === 'user').map(group => group.id));
    copy.groups = copy.groups.filter(group => authored.has(group.id));
    copy.nodes = copy.nodes.filter(node => node.kind !== 'semantic-group' || authored.has(node.id));
    copy.edges = copy.edges.filter(edge => edge.kind !== 'member-of' || authored.has(edge.to));
  }
  copy.statistics = { ...copy.statistics, nodeCount: copy.nodes.length, edgeCount: copy.edges.length };
  const scene = projectSemanticGraphToScene(copy, { ...options, nodeMode: mode === 'technical-shape' ? 'combined' : 'repositories', showOther: true, languages: undefined, topics: undefined }, runtime);
  if (selectedTechnicalCategories) {
    const remove = new Set(scene.nodes.filter(node => ['language', 'topic'].includes(node.metadata?.nodeKind)
      && !selectedTechnicalCategories.has(`${node.metadata.nodeKind}:${node.metadata.name}`)).map(node => node.id));
    scene.nodes = scene.nodes.filter(node => !remove.has(node.id));
    scene.edges = scene.edges.filter(edge => !remove.has(edge.from) && !remove.has(edge.to));
    scene.labels = scene.labels.filter(label => !remove.has(label.id));
    scene.total = scene.nodes.length;
    scene.presentation.graph.nodeCount = scene.nodes.length;
  }
  if (scene.evidence) {
    const ids = new Set([...(scene.nodes || []).map(node => node.id), ...(scene.semanticGroups?.sourceNodeIds || [])]);
    const subjects = scene.evidence.subjects.filter(subject => ids.has(subject.id));
    const factIds = new Set(subjects.flatMap(subject => subject.facts));
    scene.evidence = { version: scene.evidence.version, facts: scene.evidence.facts.filter(fact => factIds.has(fact.id)), subjects: subjects.map(subject => ({ ...subject, facts: subject.facts.filter(id => factIds.has(id)) })) };
    if (scene.semanticGroups?.canonical) scene.semanticGroups.canonical.evidence = structuredClone(scene.evidence);
  }
  return scene;
}

function sceneQualityInput(scene, name) {
  const semanticGroups = scene.semanticGroups?.groups || [];
  const categoryGroups = (scene.nodes || []).filter(node => ['language', 'topic'].includes(node.metadata?.nodeKind)).map(node => ({ id: node.id, members: node.metadata.members || [], evidence: [`category:${node.metadata.nodeKind}:${node.metadata.name || node.id}`] }));
  const isProject = node => node.metadata?.nodeKind === 'repository' || (node.metadata?.full_name && !node.metadata?.nodeKind);
  const temporalGroups = scene.timeline?.frames?.length
    ? scene.timeline.frames.map(frame => ({ id: `period:${frame.date}`, members: (frame.scene?.nodes || []).filter(isProject).map(node => node.id), evidence: ['created-at-period'] }))
    : [];
  const groups = [...semanticGroups, ...categoryGroups, ...temporalGroups];
  const sourceNodes = scene.nodes || [];
  const nodes = sourceNodes.map(node => ({
    id: node.id, label: node.label || '',
    kind: isProject(node) ? 'project' : node.metadata?.nodeKind || 'other',
    x: Number(node.geometry?.x ?? node.x ?? 0), y: Number(node.geometry?.y ?? node.y ?? 0),
    evidence: [...(node.metadata?.language ? [`language:${node.metadata.language}`] : []), ...(node.metadata?.topics || []).map(topic => `topic:${topic}`), ...(['language','topic'].includes(node.metadata?.nodeKind) ? [`category:${node.metadata.nodeKind}:${node.metadata.name || node.id}`] : [])],
    curated: node.metadata?.curatedRole === 'featured' || node.metadata?.curatedRole === 'supporting',
  }));
  return { name, nodes, edges: (scene.edges || []).map(edge => ({ from: edge.from, to: edge.to })), groups: groups.map(group => ({ id: group.id, members: group.members || [], evidence: group.basis || [] })) };
}

export function generateStoryCandidates(graph, options = {}, runtime = {}) {
  if (graph?.subject?.kind !== 'developer') throw new Error('Story candidates require a developer Semantic Graph.');
  const candidates = [
    { id: 'projects', label: 'Projects', question: 'What does this person build?', scene: projectCandidate(graph, options, runtime, 'projects') },
  ];
  const selectedProjects = graph.nodes.filter(node => node.kind === 'project').slice(0, 12);
  const featureCounts = new Map();
  for (const node of selectedProjects) for (const [kind, value] of [['language', node.properties.language], ...(node.properties.topics || []).map(topic => ['topic', topic])]) {
    if (value) featureCounts.set(`${kind}:${value}`, (featureCounts.get(`${kind}:${value}`) || 0) + 1);
  }
  const meaningfulFeatures = [...featureCounts].filter(([, count]) => count >= 2 && count < selectedProjects.length);
  const semanticLayoutActive = semanticActive(options);
  const technicalAvailable = selectedProjects.length >= 6 && meaningfulFeatures.length >= 2 && !semanticLayoutActive;
  candidates.push({ id: 'technical-shape', label: 'Technical Shape', question: 'What technical areas connect this work?', available: technicalAvailable, ...(technicalAvailable ? {} : { reason: semanticLayoutActive ? 'The current semantic ring presentation takes priority over category nodes.' : selectedProjects.length < 6 ? 'At least six representative projects are needed to form useful technical areas.' : 'The available language and topic evidence does not distinguish multiple project areas.' }), scene: projectCandidate(graph, options, runtime, 'technical-shape') });
  const projects = graph.nodes.filter(node => node.kind === 'project');
  const dated = projects.filter(node => /^\d{4}-\d{2}-\d{2}/.test(node.properties?.createdAt || ''));
  const years = new Set(dated.map(node => Number(node.properties.createdAt.slice(0, 4))));
  const firstYear = Math.min(...years);
  const periods = new Map();
  for (const node of dated) {
    const period = Math.floor((Number(node.properties.createdAt.slice(0, 4)) - firstYear) / 4);
    if (!periods.has(period)) periods.set(period, []);
    periods.get(period).push(node);
  }
  const periodEvidence = [...periods.values()].map(items => {
    const values = items.flatMap(node => [node.properties.language, ...(node.properties.topics || [])]).filter(Boolean);
    return [...new Set(values)].sort().join('|');
  });
  const temporalChange = periods.size >= 3 && [...periods.values()].every(items => items.length >= 2)
    && new Set(periodEvidence).size >= 2 && periodEvidence.every(Boolean);
  if (dated.length >= 6 && years.size >= 3 && temporalChange) {
    const records = projects.slice(0, 100).map(node => ({ full_name: node.id, name: node.label, description: node.properties.description || '', language: node.properties.language || null, topics: node.properties.topics || [], created_at: node.properties.createdAt || null }));
    const referenceDate = options.referenceDate || options.generatedAt || new Date().toISOString();
    const currentYear = new Date(referenceDate).getUTCFullYear();
    const start = Math.min(...[...years].filter(year => year <= currentYear));
    const end = Math.min(Math.max(...years), currentYear);
    const yearStep = Math.max(1, Math.ceil((end - start + 1) / 20));
    if (!Number.isFinite(start) || end - start < 2) {
      candidates.push({ id: 'journey', label: 'Journey', question: 'How has the visible work changed over time?', available: false, reason: 'Temporal evidence is too sparse to show a reliable progression.' });
    } else {
    const scene = createScene(graph.subject.id, records, { ...options, nodeMode: 'repositories', showOther: true, languages: undefined, topics: undefined, referenceDate, arrangement: 'temporal-stack', maxRepos: records.length, includeRepos: records.map(item => item.full_name), temporalStack: { enabled: true, axis: 'year', yearStart: start, yearEnd: end, yearStep, connections: 'none', innerArrangement: 'rings' } }, runtime);
    candidates.push({ id: 'journey', label: 'Journey', question: 'How has the visible work changed over time?', available: true, scene });
    }
  } else candidates.push({ id: 'journey', label: 'Journey', question: 'How has the visible work changed over time?', available: false, reason: 'Dates and evidence do not show enough distinct project periods.' });
  return candidates.slice(0, STORY_CANDIDATE_LIMIT).map(candidate => Object.freeze({ ...candidate, quality: candidate.scene ? evaluateGraphQuality(sceneQualityInput(candidate.scene, candidate.id)) : null }));
}

export function recommendStoryCandidate(candidates) {
  const available = candidates.filter(candidate => STORY_TYPES.includes(candidate.id) && candidate.available !== false);
  const projects = available.find(candidate => candidate.id === 'projects');
  const technical = available.find(candidate => candidate.id === 'technical-shape');
  const journey = available.find(candidate => candidate.id === 'journey');
  if (journey && journey.quality.dimensions.narrativeStructure >= 0.65
    && journey.quality.dimensions.differentiation >= 0.5
    && journey.quality.score > Math.max(projects?.quality.score ?? 0, technical?.quality.score ?? 0) + 0.08) return journey;
  if (technical && technical.quality.dimensions.differentiation >= 0.25 && technical.quality.score > (projects?.quality.score ?? 0)) return technical;
  return projects || available[0] || null;
}
