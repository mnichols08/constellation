import { layerDefinitions, validateLayerOptions, validateLayerOrder } from './scene-layers.mjs';
// Internal scene version, independent of the eventual stable public API version.
export const SCENE_VERSION = 1;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const fail = (path, message) => { throw new Error(`Scene ${path}: ${message}`); };

function inspect(value, path, seen, depth = 0) {
  if (depth > 32) fail(path, 'nesting exceeds 32 levels');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value)) return;
  if (typeof value !== 'object') fail(path, 'expected JSON data with finite numbers');
  if (seen.has(value)) fail(path, 'cyclic data');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, 'expected a plain record');
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(path, 'unsafe record key');
    inspect(child, `${path}.${key}`, seen, depth + 1);
  }
  seen.delete(value);
}

function record(scene, path = '$') {
  if (!object(scene) || scene.version !== SCENE_VERSION) fail(path, 'unsupported scene version');
  if (!object(scene.metadata) || !id(scene.metadata.account) || !id(scene.metadata.seed) || !Number.isFinite(Date.parse(scene.metadata.referenceDate))) fail(path, 'invalid metadata');
  if (!object(scene.presentation)) fail(path, 'missing presentation data');
  if (scene.kind === 'time-lapse') {
    if (!Array.isArray(scene.frames) || scene.frames.length > 7 || scene.latest?.kind !== 'scene') fail(path, 'invalid temporal frames');
    record(scene.latest, `${path}.latest`);
    let previous = -Infinity;
    for (const frame of scene.frames) {
      if (!Number.isInteger(frame.year) || frame.year <= previous || frame.scene?.kind !== 'scene') fail(path, 'frames must have unique ascending years');
      previous = frame.year;
      record(frame.scene, `${path}.frames.${frame.year}`);
    }
    return;
  }
  if (scene.kind !== 'scene') fail(path, 'unknown scene kind');
  const viewport = scene.viewport;
  if (!object(viewport) || !finite(viewport.width) || !finite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 || !Array.isArray(viewport.viewBox) || viewport.viewBox.length !== 4 || !viewport.viewBox.every(finite) || viewport.viewBox[2] <= 0 || viewport.viewBox[3] <= 0) fail(path, 'invalid viewport');
  for (const key of ['nodes', 'edges', 'labels', 'layers']) if (!Array.isArray(scene[key])) fail(`${path}.${key}`, 'expected array');
  if (scene.nodes.length > 2048 || scene.edges.length > 100000) fail(path, 'scene exceeds graph bounds');
  const nodes = new Set(), edges = new Set(), layers = new Set();
  for (const node of scene.nodes) {
    if (!id(node?.id) || nodes.has(node.id)) fail(`${path}.nodes`, 'missing or duplicate node ID');
    nodes.add(node.id);
    if (!object(node.geometry) || !['x', 'y', 'radius'].every(key => finite(node.geometry[key])) || node.geometry.radius < 0) fail(`${path}.nodes.${node.id}`, 'invalid geometry');
    if (!object(node.metadata) || node.metadata.full_name !== node.id || typeof node.metadata.name !== 'string') fail(`${path}.nodes.${node.id}`, 'invalid metadata');
    if (!object(node.style) || !(node.style.color === null || /^#[a-f\d]{6}$/i.test(node.style.color)) || !(node.style.glow === null || finite(node.style.glow)) || !['circle', 'diamond', 'square', 'hexagon', 'star'].includes(node.style.shape)) fail(`${path}.nodes.${node.id}`, 'invalid style');
    if (!object(node.interaction) || typeof node.interaction.hidden !== 'boolean' || typeof node.interaction.labelHidden !== 'boolean') fail(`${path}.nodes.${node.id}`, 'invalid interaction metadata');
    if (node.style.opacity !== undefined && (!finite(node.style.opacity) || node.style.opacity < 0 || node.style.opacity > 1)) fail(`${path}.nodes.${node.id}`, 'invalid opacity');
  }
  for (const edge of scene.edges) {
    if (!id(edge?.id) || edges.has(edge.id) || !nodes.has(edge.from) || !nodes.has(edge.to) || edge.from === edge.to) fail(`${path}.edges`, 'invalid ID or endpoints');
    edges.add(edge.id);
    if (!object(edge.geometry) || !finite(edge.geometry.distance) || edge.geometry.distance < 0 || typeof edge.style?.primary !== 'boolean') fail(`${path}.edges.${edge.id}`, 'invalid geometry or style');
  }
  const labels = new Set();
  for (const label of scene.labels) {
    if (!nodes.has(label?.id) || labels.has(label.id) || !finite(label.x) || !finite(label.y) || typeof label.text !== 'string' || typeof label.hidden !== 'boolean' || typeof label.focal !== 'boolean') fail(`${path}.labels`, 'invalid label');
    labels.add(label.id);
  }
  let order = -Infinity;
  for (const layer of scene.layers) {
    if (!id(layer?.id) || layers.has(layer.id) || !Number.isInteger(layer.order) || layer.order <= order) fail(`${path}.layers`, 'IDs and order must be unique and ascending');
    layers.add(layer.id); order = layer.order;
    validateLayerOptions({ [layer.id]: { visible: layer.visible, opacity: layer.opacity, order: layer.order } });
    const definition = layerDefinitions.find(value => value.id === layer.id);
    if (!definition || layer.type !== definition.type || JSON.stringify(layer.phases) !== JSON.stringify(definition.phases)) fail(`${path}.layers`, 'invalid layer type or phases');
  }
  if (layers.size !== layerDefinitions.length) fail(`${path}.layers`, 'missing required layer');
  validateLayerOrder(scene.layers);
  if (!object(scene.geometry) || !(scene.geometry.identity === null || Array.isArray(scene.geometry.identity) && scene.geometry.identity.every(finite)) || !Array.isArray(scene.geometry.ringPoints) || scene.geometry.ringPoints.length % 3 || !scene.geometry.ringPoints.every(finite)) fail(path, 'invalid ring geometry');
}

export function assertScene(scene) {
  inspect(scene, '$', new WeakSet());
  record(scene);
  return scene;
}

export function validateScene(scene) {
  try { assertScene(scene); return { valid: true, errors: [] }; }
  catch (error) { return { valid: false, errors: [error.message] }; }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

export function serializeScene(scene) {
  return JSON.stringify(canonical(assertScene(scene)), null, 2) + '\n';
}

export function parseScene(json) {
  if (typeof json !== 'string' || json.length > 32 * 1024 * 1024) throw new Error('Scene JSON must be text no larger than 32 MiB.');
  return assertScene(JSON.parse(json));
}

export function sceneStatistics(scene) {
  assertScene(scene);
  const current = scene.kind === 'time-lapse' ? scene.latest : scene;
  const visible = id => current.layers.some(layer => layer.id === id && layer.visible !== false && layer.opacity !== 0);
  return {
    version: scene.version, kind: scene.kind,
    nodes: current.nodes.length,
    visibleNodes: visible('nodes') ? current.nodes.filter(node => !node.interaction.hidden && node.style.opacity !== 0).length : 0,
    edges: current.edges.length,
    labels: current.labels.length,
    visibleLabels: visible('labels') ? current.labels.filter(label => !label.hidden).length : 0,
    layers: current.layers.map(layer => layer.id),
    frames: scene.kind === 'time-lapse' ? scene.frames.length + 1 : 1,
    referenceDate: scene.metadata.referenceDate,
  };
}
