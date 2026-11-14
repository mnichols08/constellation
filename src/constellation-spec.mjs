// ConstellationSpec: the semantic contract for describing a constellation.
// This module is a thin adapter over the Rust/WASM engine. Rust validates the
// spec, resolves it against repository evidence, and computes every band,
// relationship and position; JavaScript only maps repository records in and
// structured results out. No AI provider is involved or required.
import { specSchema, toolDefinitions } from './constellation-spec-schema.mjs';

// The spec engine is its own WASM module, fetched only by code that imports
// this file. Bytes are instantiated directly, so no wasm MIME type is needed.
const bindings = await import('./wasm/constellation_spec.js');
try {
  const url = new URL('./wasm/constellation_spec_bg.wasm', import.meta.url);
  let bytes;
  if (typeof process !== 'undefined' && process.versions?.node) {
    bytes = await (await import('node:fs/promises')).readFile(url);
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = await response.arrayBuffer();
  }
  await bindings.default({ module_or_path: bytes });
} catch (error) {
  throw new Error('ConstellationSpec requires its Rust/WASM module (src/wasm/constellation_spec_bg.wasm).', { cause: error });
}
const specBindings = () => bindings;

export const CONSTELLATION_SPEC_VERSION = 1;
export const SPEC_LIMITS = Object.freeze({ repositories: 2048, languagesPerRepository: 64, topicsPerRepository: 64, text: 120, specBytes: 262144 });

const DAY = 86400000;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clean = (value, max = SPEC_LIMITS.text) => String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, max);
const day = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= 0 ? Math.floor(time / DAY) : null;
};

/** JSON Schema (2020-12) for ConstellationSpec v1, generated from the Rust contract. */
export const constellationSpecSchema = () => structuredClone(specSchema);
/** Provider-neutral tool definitions: `{ version, tools: [{ name, description, input_schema }] }`. */
export const constellationToolDefinitions = () => structuredClone(toolDefinitions);

const text = (spec) => {
  const json = typeof spec === 'string' ? spec : JSON.stringify(spec);
  // Rust rejects oversized input too; this avoids copying it across the boundary.
  return typeof json === 'string' && json.length <= SPEC_LIMITS.specBytes ? json : ' '.repeat(SPEC_LIMITS.specBytes + 1);
};

/**
 * Validate a spec without repository evidence.
 * @returns {{ ok: boolean, spec?: object, diagnostics: object[] }}
 */
export function validateConstellationSpec(spec) {
  return JSON.parse(specBindings().validate_constellation_spec(text(spec)));
}

/**
 * Map GitHub-style repository records to the engine's evidence document.
 * Roles come only from the developer's own `projectShowcase` curation.
 */
export function repositoryEvidence(repositories = [], { projectShowcase = {}, referenceDate } = {}) {
  const roles = new Map(Object.entries(object(projectShowcase) ? projectShowcase : {}).map(([id, value]) => [id.toLowerCase(), value?.role]));
  const seen = new Set();
  const records = [];
  for (const repo of Array.isArray(repositories) ? repositories : []) {
    if (!object(repo) || (repo.nodeKind && repo.nodeKind !== 'repository')) continue;
    const id = clean(repo.full_name || repo.name, 200);
    const key = id.toLowerCase();
    if (!id || seen.has(key) || records.length >= SPEC_LIMITS.repositories) continue;
    seen.add(key);
    const languages = Object.entries(object(repo.languages) ? repo.languages : {})
      .filter(([name, bytes]) => clean(name) && Number.isFinite(bytes) && bytes > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, SPEC_LIMITS.languagesPerRepository)
      .map(([name, bytes]) => [clean(name), bytes]);
    const role = roles.get(key) ?? roles.get(clean(repo.name, 200).toLowerCase());
    const stars = Number(repo.stargazers_count);
    const year = new Date(repo.created_at).getUTCFullYear();
    records.push({
      id,
      languages: Object.fromEntries(languages),
      language: clean(repo.language) || undefined,
      topics: [...new Set((Array.isArray(repo.topics) ? repo.topics : []).map((topic) => clean(topic)).filter(Boolean))].slice(0, SPEC_LIMITS.topicsPerRepository),
      role: ['featured', 'supporting', 'experimental', 'historical'].includes(role) ? role : undefined,
      stars: Number.isFinite(stars) && stars > 0 ? Math.min(Math.floor(stars), 4294967295) : 0,
      updated_day: day(repo.pushed_at || repo.updated_at) ?? undefined,
      created_year: year >= 1970 && year <= 9999 ? year : undefined,
      archived: Boolean(repo.archived),
      fork: Boolean(repo.fork),
    });
  }
  const reference = day(referenceDate);
  return { ...(reference === null ? {} : { reference_day: reference }), repositories: records };
}

const isEvidence = (value) => object(value) && Array.isArray(value.repositories) && value.repositories.every((repo) => object(repo) && typeof repo.id === 'string');

function diagnosticsError(error) {
  let diagnostics = [];
  try { diagnostics = JSON.parse(String(error?.message ?? error)).diagnostics || []; } catch {}
  const first = diagnostics[0];
  const failure = new Error(first ? `Invalid repository evidence${first.path ? ` at ${first.path}` : ''}: ${first.message}` : 'Invalid repository evidence.');
  failure.diagnostics = diagnostics;
  return failure;
}

/**
 * A persistent engine for one set of repositories. Build it once and reuse it
 * for every validation, preview, discovery call and graph query.
 *
 * `setRepositories` replaces the evidence, rebuilds every index, clears the
 * applied spec and increments `generation`. Call `destroy()` when finished.
 *
 * @param {object[]|{repositories: object[]}} repositories GitHub-style records, or an evidence document.
 */
export function createConstellationEngine(repositories = [], evidenceOptions = {}) {
  const { ConstellationEngine } = specBindings();
  const evidence = (input, options) => JSON.stringify(isEvidence(input) ? input : repositoryEvidence(input, options));
  let engine;
  try { engine = new ConstellationEngine(evidence(repositories, evidenceOptions)); } catch (error) { throw diagnosticsError(error); }
  const live = () => {
    if (!engine) throw new Error('This ConstellationEngine has been destroyed.');
    return engine;
  };
  const canvas = ({ compact = false, round = false } = {}) => [Boolean(compact), Boolean(round)];
  const index = (id) => (typeof id === 'string' && id.length <= 200 ? live().indexOf(id) : -1);
  const ids = (indices) => Array.from(indices, (i) => live().idAt(i));
  const call = (name, args = {}) => JSON.parse(live().callTool(String(name).slice(0, 80), text(args ?? {})));
  return {
    get repositoryCount() { return live().repositoryCount; },
    get generation() { return live().generation; },
    summary: () => JSON.parse(live().summary()),
    setRepositories(next, options = {}) {
      try { live().setEvidence(evidence(next, options)); } catch (error) { throw diagnosticsError(error); }
    },
    /** Schema and reference validation only. `{ ok, spec?, diagnostics }` */
    validateSpec: (spec) => JSON.parse(live().validateSpec(text(spec))),
    /** Pure compilation for inspection. `{ ok, compiled?, diagnostics }` */
    compileSpec: (spec, options) => JSON.parse(live().compileSpec(text(spec), ...canvas(options))),
    /** Ring positions `[id, x, y]` for a radial spec, without relationship scoring. Empty when the spec is rejected. */
    placements: (spec, options) => JSON.parse(live().placements(text(spec), ...canvas(options))).positions ?? [],
    /** Compile and retain. A failing spec leaves the engine unchanged. */
    applySpec: (spec, options) => JSON.parse(live().applySpec(text(spec), ...canvas(options))),
    appliedSpec: () => JSON.parse(live().appliedSpec()),
    toolDefinitions: constellationToolDefinitions,
    /** Run one published tool by name. Never mutates the engine. */
    callTool: call,
    listLanguages: () => call('list_languages'),
    listTopics: () => call('list_topics'),
    findRepositories: (filter, limit) => call('find_repositories', { filter, ...(limit === undefined ? {} : { limit }) }),
    describeRepository: (id) => call('describe_repository', { id }),
    previewGroup: (group, limit) => call('preview_group', { group, ...(limit === undefined ? {} : { limit }) }),
    // Hot paths: numbers and typed arrays straight from retained Rust indexes.
    neighbors(id) { const at = index(id); return at < 0 ? [] : ids(live().neighbors(at)); },
    path(from, to) { const a = index(from), b = index(to); return a < 0 || b < 0 ? [] : ids(live().path(a, b)); },
    indexOf: index,
    idAt: (at) => live().idAt(at) ?? null,
    /** `{ pairs: Uint32Array, weights: Float32Array }` for the retained relationships. */
    edges: () => ({ pairs: live().edgePairs(), weights: live().edgeWeights() }),
    /** Uint8Array band per repository (0 centre … 3 outer, 255 not shown); empty before applySpec. */
    bands: () => live().bands(),
    /** Float32Array x,y per repository for an applied radial spec; empty otherwise. */
    positions: () => live().positions(),
    destroy() { engine?.free?.(); engine = null; },
  };
}

/**
 * Ring positions for the repositories on screen, keyed by repository id.
 * Used by the layout pipeline; returns an empty map when the spec does not
 * validate against these repositories, so a stale spec never breaks rendering.
 */
export function specPlacements(spec, repositories, { compact = false, round = false, projectShowcase, referenceDate } = {}) {
  const placements = new Map();
  let engine;
  try {
    engine = createConstellationEngine(repositories, { projectShowcase, referenceDate });
    // Positions only: relationship scoring is skipped, so layout can ask on every pass.
    for (const [id, x, y] of engine.placements(spec, { compact, round })) placements.set(id, [x, y]);
  } catch {} finally { engine?.destroy(); }
  return placements;
}

/**
 * Options for the existing scene pipeline that carry a compiled spec: the
 * derived arrangement and connection settings plus the spec itself. Manual
 * star and label positions are cleared, exactly as choosing a layout does.
 */
export function specOptions(options, compiled) {
  if (!object(compiled) || !object(compiled.spec) || !object(compiled.scene_options)) throw new Error('specOptions requires a compiled ConstellationSpec.');
  const next = { ...options, ...compiled.scene_options, constellationSpec: structuredClone(compiled.spec), starPositions: {}, labelPositions: {}, labelOffsets: {} };
  if (options.temporalStack) next.temporalStack = { ...options.temporalStack, enabled: false };
  delete next.layoutEngine;
  delete next.layoutOptions;
  delete next.ringPlacements;
  return next;
}

/** Pass to `registerSpecHost` so configuration and layout honour `constellationSpec`. */
export const specHost = Object.freeze({ validate: validateConstellationSpec, placements: specPlacements });
