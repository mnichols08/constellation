// One prebuilt Rust module runs in the browser and in the Node action.
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
} catch (error) { engineError = error; }

export const rustAvailable = Boolean(core);
const projections = new Map();
export function projectNodes(input) {
  if (!core) throw new Error('Language and topic nodes need the Rust engine. Reload to try again.');
  const key = JSON.stringify(input);
  if (!projections.has(key)) {
    const result = JSON.parse(core.project_nodes(key));
    if (projections.size >= 8) projections.delete(projections.keys().next().value);
    projections.set(key, result);
  }
  return projections.get(key);
}
const scenes = new Map();
export function computeScene(input) {
  if (!core) return null;
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
