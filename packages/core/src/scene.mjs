import { layerDefinitions, validateLayerOptions, validateLayerOrder } from './scene-layers.mjs';
import { historyOptions } from './history/settings.mjs';
import { validateHierarchy } from './hierarchy-model.mjs';
import { validateStory } from './story-model.mjs';
import { validateTemporalStack } from './temporal-stack-model.mjs';
// Stable Scene API v1; independently versioned from package/config releases.
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
  const options = scene.presentation.options;
  if (!object(options)) fail(path, 'missing presentation options');
  historyOptions(options);
  if (options.colors !== undefined && (!object(options.colors) || Object.entries(options.colors).some(([key, color]) => !['background', 'foreground', 'accent', 'line', 'star'].includes(key) || typeof color !== 'string' || !/^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(color)))) fail(path, 'invalid palette');
  if (options.theme !== undefined && !['auto', 'midnight', 'light'].includes(options.theme)) fail(path, 'invalid theme');
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
  const graph = scene.presentation.graph;
  if (!object(graph) || !['repositories', 'languages', 'topics', 'combined', 'contributors', 'ecosystem', 'organization-community', 'dependencies', 'technology', 'eras', 'commits'].includes(scene.presentation.nodeMode)) fail(path, 'invalid graph presentation');
  for (const key of ['repositoryCount', 'total', 'nodeCount']) if (graph[key] !== undefined && (!Number.isInteger(graph[key]) || graph[key] < 0)) fail(path, 'invalid graph count');
  if (!Number.isInteger(scene.presentation.totalConnections) || scene.presentation.totalConnections < 0) fail(path, 'invalid connection count');
  if (graph.focusProjects !== undefined && (!Array.isArray(graph.focusProjects) || graph.focusProjects.some(value => typeof value !== 'string'))) fail(path, 'invalid focused project list');
  const viewport = scene.viewport;
  if (!object(viewport) || !finite(viewport.width) || !finite(viewport.height) || viewport.width <= 0 || viewport.height <= 0 || viewport.width > 100000 || viewport.height > 100000 || !Array.isArray(viewport.viewBox) || viewport.viewBox.length !== 4 || !viewport.viewBox.every(value => finite(value) && Math.abs(value) <= 100000) || viewport.viewBox[2] <= 0 || viewport.viewBox[3] <= 0) fail(path, 'invalid viewport');
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
  if (scene.accountSystem !== undefined) validateAccountSystem(scene.accountSystem, nodes, path);
  if (scene.stewardship !== undefined) validateStewardship(scene.stewardship, nodes, path);
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
  if (scene.annotations !== undefined && (!Array.isArray(scene.annotations) || scene.annotations.length > 32 || scene.annotations.some(annotation => !object(annotation) || typeof annotation.text !== 'string' || annotation.text.length > 2000 || !finite(annotation.x) || !finite(annotation.y) || Math.abs(annotation.x) > 100000 || Math.abs(annotation.y) > 100000))) fail(path, 'invalid annotations');
  if (scene.story !== undefined) validateStory(scene.story, record);
  if (scene.hierarchy !== undefined) validateHierarchy(scene.hierarchy, record);
  if (scene.timeline !== undefined) {
    const timeline = scene.timeline;
    if (!object(timeline) || timeline.version !== 1 || !Array.isArray(timeline.frames) || timeline.frames.length < 1 || timeline.frames.length > 64 || timeline.referenceDate !== scene.metadata.referenceDate) fail(path, 'invalid timeline');
    let previous = '', totalNodes = 0;
    for (const frame of timeline.frames) {
      if (frame.scene?.temporalStack !== undefined) fail(path, 'timeline frames cannot nest temporal stacks');
      if (typeof frame.date !== 'string' || !Number.isFinite(Date.parse(frame.date)) || new Date(frame.date).toISOString() !== frame.date || frame.date <= previous || frame.date > timeline.referenceDate || frame.id !== frame.date || !['snapshot', 'current', 'current-metadata'].includes(frame.evidence) || frame.scene?.kind !== 'scene' || frame.scene.timeline !== undefined || frame.scene.hierarchy !== undefined || frame.scene.story !== undefined || frame.scene.metadata.referenceDate !== frame.date) fail(path, 'invalid timeline frame');
      record(frame.scene, `${path}.timeline.${frame.id}`); previous = frame.date;
      totalNodes += frame.scene.nodes.length;
      if (totalNodes > 16384) fail(path, 'timeline exceeds aggregate node bounds');
    }
    if (previous !== timeline.referenceDate) fail(path, 'timeline must end at the reference date');
  }
  if (scene.temporalStack !== undefined) validateTemporalStack(scene, frame => record(frame, path + '.temporalStack.frame'));
  if (!object(scene.geometry) || !(scene.geometry.identity === null || Array.isArray(scene.geometry.identity) && scene.geometry.identity.length === 90 && scene.geometry.identity.every(finite)) || !Array.isArray(scene.geometry.ringPoints) || scene.geometry.ringPoints.length > 6144 || scene.geometry.ringPoints.length % 3 || !scene.geometry.ringPoints.every(finite)) fail(path, 'invalid ring geometry');
}

function validateAccountSystem(value, sceneNodes, path) {
  if (!object(value) || value.version !== 1 || !object(value.center) || !id(value.center.id) || !id(value.center.login) || !["user", "organization"].includes(value.center.type)) fail(path, "invalid account-system attachment");
  if (!Array.isArray(value.planets) || !Array.isArray(value.moons) || !Array.isArray(value.relations) || !object(value.coverage) || value.planets.length > 100 || value.moons.length > 120 || value.planets.length + value.moons.length + 1 > 256 || value.relations.length > 2048) fail(path, "account-system attachment exceeds bounds");
  const planets = new Set(), moons = new Set();
  for (const planet of value.planets) {
    if (!id(planet?.id) || planets.has(planet.id) || !sceneNodes.has(planet.id) || !Array.isArray(planet.position) || planet.position.length !== 2 || !planet.position.every(finite) || planet.technical_region !== null && !["interface", "services", "data", "systems", "tooling", "automation"].includes(planet.technical_region)) fail(path, "invalid account-system planet");
    planets.add(planet.id);
  }
  for (const moon of value.moons) {
    if (!id(moon?.id) || moons.has(moon.id) || moon.id === value.center.id || !id(moon.login) || !["User", "Bot", "Organization", "Unknown"].includes(moon.actor_type) || !planets.has(moon.parent) || !Array.isArray(moon.offset) || moon.offset.length !== 2 || !moon.offset.every(finite) || Math.hypot(...moon.offset) > 200) fail(path, "invalid account-system moon");
    moons.add(moon.id);
  }
  for (const relation of value.relations) if (!moons.has(relation?.identity) || !planets.has(relation.repository) || !["github-contributors", "authored-public-pr", "supplied"].includes(relation.source) || typeof relation.primary !== "boolean" || relation.contributions !== null && (!Number.isInteger(relation.contributions) || relation.contributions < 0) || relation.pull_requests !== null && (!Number.isInteger(relation.pull_requests) || relation.pull_requests < 0)) fail(path, "invalid account-system relation");
  for (const moon of value.moons) if (value.relations.filter((relation) => relation.identity === moon.id && relation.primary && relation.repository === moon.parent).length !== 1) fail(path, "moon must have exactly one evidenced primary parent");
  for (const key of ["observed_identities", "displayed_identities", "suppressed_identities"]) if (!Number.isInteger(value.coverage[key]) || value.coverage[key] < 0) fail(path, "invalid account-system coverage");
}

function validateStewardship(value, sceneNodes, path) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.repositories) || !Array.isArray(value.recurrence) || value.repositories.length > 100 || value.recurrence.length !== 7) fail(path, "invalid stewardship attachment");
  const seen = new Set();
  for (const row of value.repositories) {
    if (!id(row?.id) || seen.has(row.id) || !sceneNodes.has(row.id) || !Number.isInteger(row.known_mask) || !Number.isInteger(row.present_mask) || !Number.isInteger(row.inherited_mask) || row.known_mask < 0 || row.known_mask > 127 || (row.present_mask & ~row.known_mask) || (row.inherited_mask & ~row.present_mask) || !object(row.behavior) || Object.keys(row.behavior).length > 32 || Object.entries(row.behavior).some(([key, count]) => !id(key) || !Number.isInteger(count) || count < 0)) fail(path, "invalid stewardship repository evidence");
    seen.add(row.id);
  }
  for (const recurrence of value.recurrence) if (!Number.isInteger(recurrence.slot) || recurrence.slot < 0 || recurrence.slot > 6 || !Number.isInteger(recurrence.known) || !Number.isInteger(recurrence.present) || recurrence.present > recurrence.known || !Number.isInteger(recurrence.fixed_point) || recurrence.fixed_point < 0 || recurrence.fixed_point > 1000) fail(path, "invalid stewardship recurrence");
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
  const json = JSON.stringify(canonical(assertScene(scene)), null, 2) + '\n';
  if (new TextEncoder().encode(json).length > 32 * 1024 * 1024) throw new Error('Scene JSON exceeds 32 MiB.');
  return json;
}

export function parseScene(json) {
  if (typeof json !== 'string' || json.length > 32 * 1024 * 1024 || new TextEncoder().encode(json).length > 32 * 1024 * 1024) throw new Error('Scene JSON must be text no larger than 32 MiB.');
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
    frames: scene.temporalStack?.frames?.length || scene.timeline?.frames.length || (scene.kind === 'time-lapse' ? scene.frames.length + 1 : 1),
    referenceDate: scene.metadata.referenceDate,
    pipeline: structuredClone(current.presentation.pipeline),
  };
}
