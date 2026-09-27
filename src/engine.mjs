// One prebuilt Rust module runs in the browser and in the Node action.
import { overviewEdges } from './scaling.mjs';
// Loading failure keeps the existing star field usable on restricted browsers.
let core;
export let engineError;
try {
  const bindings = await import('./wasm/constellation_core.js');
  const url = new URL('./wasm/constellation_core_bg.wasm', import.meta.url);
  const module = typeof process !== 'undefined' && process.versions?.node
    ? await (await import('node:fs/promises')).readFile(url)
    : await (await fetch(url)).arrayBuffer();
  await bindings.default({ module_or_path: module });
  core = bindings;
} catch (error) {
  engineError = error;
  console.warn('Constellation: the non-WASM fallback is deprecated in v2 and will be removed in the next major release. Restore the bundled WASM engine for supported rendering.');
}

export const rustAvailable = Boolean(core);
const stableCoordinates = new Map();
export const layoutStatistics = { computedNodes: 0, reusedNodes: 0 };
function stableScene(input) {
  const prefix = JSON.stringify([input.account, input.compact]);
  const keys = input.repos.map(repo => `${prefix}:${repo.name}`);
  const missing = input.repos.filter((_repo, i) => !stableCoordinates.has(keys[i]));
  if (missing.length) {
    const positions = JSON.parse(core.stable_positions(JSON.stringify({ account: input.account, compact: input.compact, names: missing.map(repo => repo.name) })));
    missing.forEach((repo, i) => stableCoordinates.set(`${prefix}:${repo.name}`, positions[i]));
  }
  layoutStatistics.computedNodes += missing.length;
  layoutStatistics.reusedNodes += input.repos.length - missing.length;
  const anchors = input.snapToRings ? identityPoints(input.account, input.nodeCap, input.ring_rotations) : [];
  const positions = input.repos.map((repo, i) => {
    if (repo.position) return repo.position;
    const position = stableCoordinates.get(keys[i]);
    if (!anchors.length) return position;
    let best = position, distance = Infinity;
    for (let j = 0; j < anchors.length; j += 3) {
      const point = [450 + (anchors[j] - 240) * 368 / 172, (input.compact ? 126 : 270) + (anchors[j + 1] - 240) * (input.compact ? 88 : 192) / 172];
      const next = (point[0] - position[0]) ** 2 + (point[1] - position[1]) ** 2;
      if (next < distance) { best = point; distance = next; }
    }
    return best;
  });
  while (stableCoordinates.size > 8192) stableCoordinates.delete(stableCoordinates.keys().next().value);
  return { positions, edges: overviewEdges(input.repos, input.basis), total: input.repos.length };
}
const refinements = new Map();
export function refineLayout(input) {
  if (!core?.refine_layout) throw new Error('Layout refinement needs the rebuilt Rust engine. Reload the studio or run npm run build:rust.');
  const key = JSON.stringify(input);
  if (!refinements.has(key)) {
    if (refinements.size >= 8) refinements.delete(refinements.keys().next().value);
    refinements.set(key, JSON.parse(core.refine_layout(key)));
  }
  return refinements.get(key);
}
const projections = new Map();
export function projectNodes(input) {
  if (!core) throw new Error('Language and topic nodes need the Rust engine. Reload to try again.');
  const key = JSON.stringify(input);
  if (!projections.has(key)) {
    const result = JSON.parse(core.project_nodes(key));
    if (projections.size >= 8) projections.delete(projections.keys().next().value);
    projections.set(key, result);
  }
  return structuredClone(projections.get(key));
}
const scenes = new Map();
export function layoutCacheStatistics() {
  return { scenes: scenes.size, sceneLimit: 8, projections: projections.size, projectionLimit: 8, refinements: refinements.size, refinementLimit: 8, stableCoordinates: stableCoordinates.size, stableCoordinateLimit: 8192 };
}
export function computeScene(input) {
  if (!core) return null;
  if (input.stableOverview) return stableScene(input);
  const key = JSON.stringify(input);
  if (!scenes.has(key)) {
    const scene = JSON.parse(core.compute_scene(key));
    if (scenes.size >= 8) scenes.delete(scenes.keys().next().value);
    scenes.set(key, scene);
  }
  return scenes.get(key);
}

export function identityGeometry(metadata, variation = 0) {
  return core ? Array.from(core.identity_geometry(metadata, variation)) : null;
}

export function identityPoints(metadata, count, rotation = 0) {
  return core ? Array.from(core.identity_points(metadata, count, Float64Array.from(Array.isArray(rotation) ? rotation : [rotation, rotation, rotation, rotation]))) : [];
}

export function graphSelection(names, pairs, start, end) {
  const index = names.indexOf(start);
  if (index < 0) return [];
  if (end != null) {
    const target = names.indexOf(end);
    if (target < 0 || !core) return [];
    return Array.from(core.shortest_path(names.length, Uint32Array.from(pairs), index, target), i => names[i]);
  }
  // A direct-neighbor fallback keeps click exploration available without Wasm.
  const adjacent = core ? Array.from(core.neighbors(names.length, Uint32Array.from(pairs), index))
    : pairs.reduce((result, value, i) => {
      if (i % 2 === 0 && (value === index || pairs[i + 1] === index)) result.push(value === index ? pairs[i + 1] : value);
      return result;
    }, []);
  return [start, ...adjacent.map(i => names[i])];
}
