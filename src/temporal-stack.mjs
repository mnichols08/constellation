import { createTimeline } from './timeline.mjs';
import { artifactPositions } from './artifact-layouts.mjs';
import { temporalStackOptions, temporalBridges, MAX_TEMPORAL_LAYERS, MAX_TEMPORAL_NODES } from './temporal-stack-model.mjs';
import { temporalGeometryMath } from './temporal-geometry.mjs';
import { temporalRingLayout } from './temporal-ring-layout.mjs';
import { temporalGeometryDrawing } from './temporal-geometry-drawing.mjs';
import { historyOptions } from './history/settings.mjs';

export function createTemporalStack(account, records, options = {}, runtime = {}) {
  runtime.signal?.throwIfAborted();
  const settings = { ...temporalStackOptions(options.temporalStack), enabled: true };
  if (options.temporalGeometry && options.temporalStack?.innerArrangement === undefined) settings.innerArrangement = 'rings';
  const referenceDate = options.timeline?.referenceDate || options.referenceDate || options.generatedAt || new Date().toISOString();
  const current = new Date(referenceDate).getUTCFullYear();
  const end = settings.yearEnd ?? current, start = settings.yearStart ?? Math.max(1970, end - 5);
  if (!Number.isInteger(current) || end > current || start > end) throw new Error('Temporal Stack years must end at or before the reference year.');
  const years = [];
  for (let year = end; year >= start; year -= settings.yearStep) years.push(year);
  if (years.length > MAX_TEMPORAL_LAYERS) throw new Error(`Temporal Stack supports at most ${MAX_TEMPORAL_LAYERS} yearly layers. Increase yearStep.`);
  const small = options.layout === 'compact' || ['compact', 'profile', 'readme', 'repository'].includes(options.exportProfile);
  const shown = small ? years.slice(0, 3) : years;
  const dates = shown.filter(year => year !== current).map(year => `${year}-12-31T23:59:59.999Z`);
  const inner = { ...options, temporalStack: undefined, timeline: undefined, arrangement: settings.innerArrangement, layout: 'atlas', exportProfile: 'custom', referenceDate, historicalYear: undefined, timeLapse: false };
  // Timeline remains authoritative for evidence, normalization, limits and Rust
  // relationships. Supplied snapshots never get relabelled as year-end facts.
  const scene = createTimeline(account, records, inner, options.timeline || { referenceDate, dates }, runtime);
  // Inner frames use custom sizing; retain the outer export's sky semantics.
  scene.presentation.options.exportProfile = options.exportProfile || 'custom';
  // Frames remain snapshots; playback emphasizes the existing cross-sections.
  scene.presentation.options.history = historyOptions(options).history;
  const union = new Map();
  for (const frame of scene.timeline.frames) for (const node of frame.scene.nodes) union.set(node.id, node);
  const nodes = [...union.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (nodes.length > 2048) throw new Error('Temporal Stack exceeds 2,048 unique nodes. Reduce snapshots or graph size.');
  const anchors = settings.innerArrangement === 'rings' ? Object.fromEntries(nodes.map(node => [node.id, node.geometry])) : artifactPositions(nodes.map(node => node.metadata), settings.innerArrangement, scene.metadata.seed, false, options.majorMetric);
  Object.assign(anchors, options.starPositions);
  const ringModel = temporalRingLayout(scene.metadata.seed, nodes, { ...options, innerArrangement: settings.innerArrangement }, anchors);
  for (const frame of scene.timeline.frames) {
    runtime.signal?.throwIfAborted();
    const labels = new Map(frame.scene.labels.map(label => [label.id, label]));
    for (const node of frame.scene.nodes) {
      const anchor = anchors[node.id], dx = anchor.x - node.geometry.x, dy = anchor.y - node.geometry.y;
      const label = labels.get(node.id);
      if (label) { label.x += dx; label.y += dy; }
      node.geometry = { ...node.geometry, x: anchor.x, y: anchor.y };
    }
    const byId = new Map(frame.scene.nodes.map(node => [node.id, node.geometry]));
    for (const edge of frame.scene.edges) edge.geometry.distance = (byId.get(edge.from).x - byId.get(edge.to).x) ** 2 + (byId.get(edge.from).y - byId.get(edge.to).y) ** 2;
  }
  const byYear = new Map();
  const latest = scene.timeline.frames.at(-1).scene;
  for (const key of ['nodes', 'edges', 'labels', 'geometry']) scene[key] = structuredClone(latest[key]);
  for (const frame of scene.timeline.frames) byYear.set(new Date(frame.date).getUTCFullYear(), frame);
  const layers = shown.filter(year => byYear.has(year)).map((year, index) => ({ year, frameId: byYear.get(year).id, depth: -index }));
  if (!layers.length) throw new Error('No supplied Timeline snapshots fall in the selected years.');
  const frames = new Map(scene.timeline.frames.map(frame => [frame.id, frame.scene]));
  if (layers.reduce((total, layer) => total + frames.get(layer.frameId).nodes.length, 0) > MAX_TEMPORAL_NODES) throw new Error('Temporal Stack exceeds 4,096 displayed node occurrences. Reduce years or graph size.');
  scene.temporalStack = { version: 1, axis: 'year', settings, layers, bridges: temporalBridges(layers, frames, settings.connections), reduced: small && years.length > shown.length };
  const profile = temporalGeometryMath.options(options.temporalGeometry || { shape: 'stack', depth: Math.max(80, Math.min(1600, (layers.length - 1) * settings.depthGap)) });
  scene.temporalStack.geometry = { version: 1, profile, ...ringModel };
  const viewBox = temporalGeometryDrawing(scene).viewBox;
  scene.viewport = { width: 900, height: viewBox[3] * 900 / viewBox[2], viewBox };
  return scene;
}
