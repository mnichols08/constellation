import { computeScene, rustAvailable } from './engine.mjs';
import { artifactLayouts, artifactPositions } from './artifact-layouts.mjs';
import { organizationLayouts, organizationNodeMode } from './organization/settings.mjs';
import { organizationPositions } from './organization/graph.mjs';
import { timelinePositions } from './history/history-svg.mjs';
import { historyOptions } from './history/settings.mjs';
import { resolveSeed } from './seeded-random.mjs';
import { scalingOptions } from './scaling.mjs';

export const BUILTIN_LAYOUTS = Object.freeze(['field', 'orbital', 'force', 'rings', ...artifactLayouts, ...organizationLayouts]);

// All positions are keyed by stable scene node ID. The accompanying relationship
// result preserves the existing Rust graph selection while callers migrate.
export function layoutScene(scene, options = {}, context = {}) {
  const { signal } = context; signal?.throwIfAborted();
  if (!scene || !Array.isArray(scene.nodes)) throw new Error('Layout requires scene nodes.');
  const records = scene.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || !node.metadata || node.id !== node.metadata.full_name) throw new Error('Layout nodes require matching IDs and metadata.');
    return node.metadata;
  });
  if (new Set(scene.nodes.map(node => node.id)).size !== records.length) throw new Error('Layout node IDs must be unique.');
  const graph = context.graph || { ...scene.presentation?.graph, nodes: records, edges: (scene.edges || []).map(edge => ({ from: edge.from, to: edge.to, members: edge.metadata?.sharedRepositories || [] })) };
  const account = context.account || scene.metadata?.account || 'constellation';
  const seed = context.seed ?? resolveSeed(account, options);
  const reference = context.reference ?? Date.parse(scene.metadata?.referenceDate || options.referenceDate || '1970-01-01T00:00:00Z');
  const compact = options.layout === 'compact';
  const arrangement = options.arrangement || (rustAvailable ? 'rings' : 'field');
  if (!BUILTIN_LAYOUTS.includes(arrangement)) throw new Error('Unknown built-in layout.');
  const scaling = scalingOptions(options), stableOverview = options.nodeCap > 100;
  const temporal = historyOptions(options);
  let positions = options.starPositions || {};
  for (const point of Object.values(positions)) if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Manual layout positions must be finite.');
  if (!stableOverview) positions = { ...artifactPositions(graph.nodes, arrangement, seed, compact, options.majorMetric), ...positions };
  if (!stableOverview && organizationLayouts.includes(arrangement)) positions = { ...organizationPositions(graph, arrangement, compact, seed, options.majorMetric), ...options.starPositions };
  if (!stableOverview && temporal.languageEvolution.enabled && temporal.languageEvolution.style === 'timeline') positions = { ...timelinePositions([...graph.nodes].sort((a, b) => a.full_name.localeCompare(b.full_name)), reference, compact), ...options.starPositions };
  const mode = graph.organization ? organizationNodeMode(options) : options.nodeMode || 'repositories';
  const hidden = new Set(options.hiddenNodes || []);
  const input = {
    stableOverview, nodeCap: scaling.nodeCap, snapToRings: options.snapToRings,
    account: options.seedMode ? seed : account, compact,
    arrangement: artifactLayouts.includes(arrangement) || organizationLayouts.includes(arrangement) ? 'field' : arrangement,
    ring_rotations: options.ringRotations || Array(4).fill(options.ringRotation || 0),
    all: options.connectionDensity === 'all',
    basis: graph.organization && mode !== 'repositories' || mode === 'combined' ? 'membership' : mode !== 'repositories' ? 'repositories' : options.connectionBasis || 'languages',
    repos: records.map(repo => ({
      name: repo.full_name, group: repo.language || 'Other',
      languages: (repo.languages ? Object.keys(repo.languages).filter(key => repo.languages[key] > 0).sort() : repo.language ? [repo.language] : []).filter(language => options.languages == null || options.languages.includes(language)),
      topics: (repo.topics || []).filter(topic => options.topics == null || options.topics.includes(topic)),
      members: repo.members || [], kind: repo.nodeKind || 'repository', hidden: hidden.has(repo.full_name),
      position: Object.hasOwn(positions, repo.full_name) ? [positions[repo.full_name].x, positions[repo.full_name].y] : null,
    })),
  };
  const result = computeScene(input);
  signal?.throwIfAborted();
  if (!result) return null; // Existing deprecated browser-only field fallback.
  return { positions: Object.fromEntries(scene.nodes.map((node, i) => [node.id, { x: result.positions[i][0], y: result.positions[i][1] }])),
    edges: structuredClone(result.edges), total: result.total };
}
