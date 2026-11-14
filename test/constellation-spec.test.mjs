import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSTELLATION_SPEC_VERSION, constellationSpecSchema, constellationToolDefinitions, validateConstellationSpec,
  repositoryEvidence, createConstellationEngine, specPlacements, specOptions, specHost,
} from '../src/constellation-spec.mjs';
import { registerSpecHost } from '../src/spec-host.mjs';
import { createScene, parseConfig, serializeConfig, normalizeConfig, renderSceneSVG } from '../src/core-api.mjs';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const evidence = await read('./fixtures/ai/evidence.json');
const examples = await Promise.all((await readdir(new URL('../examples/specs/', import.meta.url))).sort().map(async (name) => [name, await read(`../examples/specs/${name}`)]));

// GitHub-shaped records equivalent to the evidence fixture.
const repositories = evidence.repositories.map((repo) => ({
  name: repo.id.split('/')[1], full_name: repo.id, language: repo.language || Object.keys(repo.languages || {})[0], languages: repo.languages,
  topics: repo.topics, stargazers_count: repo.stars, pushed_at: new Date(repo.updated_day * 86400000).toISOString(),
  created_at: `${repo.created_year}-01-01T00:00:00Z`, archived: Boolean(repo.archived), fork: Boolean(repo.fork),
}));
const projectShowcase = Object.fromEntries(evidence.repositories.filter((repo) => repo.role).map((repo) => [repo.id, { role: repo.role }]));
const referenceDate = new Date(evidence.reference_day * 86400000).toISOString();

/** A small JSON Schema (2020-12 subset) checker: exactly the keywords the published schema uses. */
function schemaErrors(schema, value, root = schema, path = '') {
  if (schema.$ref) {
    const target = schema.$ref === root.$id ? root : schema.$ref.split('/').slice(1).reduce((node, key) => node[key], root);
    return schemaErrors(target, value, root, path);
  }
  const errors = [];
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  if (schema.type && !(schema.type === type || (schema.type === 'number' && type === 'integer'))) return [`${path}: expected ${schema.type}`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: not in enum`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: too long`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (type === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(schema.items, item, root, `${path}[${index}]`)));
  }
  if (type === 'object') {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: too few properties`);
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    for (const key of keys) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], value[key], root, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
    }
  }
  return errors;
}

test('the published schema, its JS module and the tool definitions are one contract', async () => {
  const schema = constellationSpecSchema();
  assert.deepEqual(schema, await read('../schemas/constellation-spec.v1.schema.json'));
  assert.deepEqual(constellationToolDefinitions(), await read('../schemas/constellation-tools.v1.json'));
  assert.deepEqual(schema.properties.schema_version.enum, [CONSTELLATION_SPEC_VERSION]);
  // Callers get copies: mutating one cannot corrupt the contract for the next.
  schema.properties = {};
  assert.ok(constellationSpecSchema().properties.focus);
});

test('every example validates against the JSON Schema and the Rust validator agrees', () => {
  const schema = constellationSpecSchema();
  assert.ok(examples.length >= 5);
  for (const [name, spec] of examples) {
    assert.deepEqual(schemaErrors(schema, spec), [], name);
    const result = validateConstellationSpec(spec);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.diagnostics)}`);
    // The normalized form is itself a valid document, and stable.
    assert.deepEqual(schemaErrors(schema, result.spec), [], `${name} (normalized)`);
    assert.deepEqual(validateConstellationSpec(result.spec).spec, result.spec, name);
  }
  // Schema and validator reject the same malformed documents.
  for (const bad of [{}, { schema_version: 2 }, { schema_version: 1, x: 1 }, { schema_version: 1, layout: { kind: 'spiral' } }, { schema_version: 1, groups: [{ id: 'a' }] }, { schema_version: 1, relationships: [{ basis: 'shared_topic', strength: 2 }] }]) {
    assert.notDeepEqual(schemaErrors(schema, bad), [], JSON.stringify(bad));
    assert.equal(validateConstellationSpec(bad).ok, false, JSON.stringify(bad));
  }
});

test('validation needs no evidence, no provider and never throws on hostile input', () => {
  for (const input of [undefined, null, 7, 'nope', '{', [], () => {}, { schema_version: 1, focus: { kind: 'topic', value: 'x'.repeat(500000) } }]) {
    const result = validateConstellationSpec(input);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics[0].code && typeof result.diagnostics[0].path === 'string');
  }
  const invalid = validateConstellationSpec({ schema_version: 1, groups: [{ name: 'A', match: { role: 'featured' } }, { name: 'B', match: { language: 7 } }] });
  assert.deepEqual(invalid.diagnostics.map(({ code, path }) => [code, path]), [['invalid_type', 'groups[1].match.language']]);
});

test('repositoryEvidence maps GitHub records and never invents roles', () => {
  const mapped = repositoryEvidence(repositories, { projectShowcase, referenceDate });
  assert.equal(mapped.reference_day, evidence.reference_day);
  assert.equal(mapped.repositories.length, 15);
  const engine = createConstellationEngine(mapped);
  const fixture = createConstellationEngine(evidence);
  const spec = examples.find(([name]) => name === 'solar-system-rust-focus.json')[1];
  assert.deepEqual(engine.compileSpec(spec).compiled, fixture.compileSpec(spec).compiled);
  engine.destroy(); fixture.destroy();
  const unrolled = repositoryEvidence(repositories);
  assert.ok(unrolled.repositories.every((repo) => repo.role === undefined));
  const hostile = repositoryEvidence([null, 7, { name: 'ok', language: 'Rust\u0000', topics: ['a', 'a', '', 5], stargazers_count: -4, languages: { Rust: Infinity, Go: 5 } }, { nodeKind: 'language', name: 'Rust' }, { full_name: 'OK' }]);
  assert.deepEqual(hostile.repositories, [{ id: 'ok', languages: { Go: 5 }, language: 'Rust', topics: ['a', '5'], role: undefined, stars: 0, updated_day: undefined, created_year: undefined, archived: false, fork: false }]);
  assert.throws(() => createConstellationEngine({ repositories: [{ id: 'a', role: 'legendary' }] }), /Invalid repository evidence at repositories\[0\]\.role/);
});

test('one persistent engine serves validation, discovery, compilation and graph queries', () => {
  const engine = createConstellationEngine(repositories, { projectShowcase, referenceDate });
  assert.equal(engine.repositoryCount, 15);
  assert.deepEqual(engine.listLanguages().languages[0], { name: 'Rust', repositories: 4 });
  assert.deepEqual(engine.findRepositories({ language: 'rust' }, 2).repositories.map((repo) => repo.id), ['ada/orbit-engine', 'ada/lightbeam']);
  assert.equal(engine.describeRepository('ada/orbit-engine').repository.role, 'featured');
  assert.equal(engine.previewGroup({ name: 'Giants', match: { stars: { min: 99999 } } }).total, 0);
  assert.equal(engine.callTool('launch', {}).diagnostics[0].code, 'unknown_tool');
  assert.deepEqual(engine.toolDefinitions().tools.map((tool) => tool.name), ['list_languages', 'list_topics', 'find_repositories', 'describe_repository', 'preview_group', 'validate_spec', 'compile_spec']);

  // Hot paths return ids and typed arrays without JSON.
  assert.deepEqual(engine.neighbors('ada/tiny-alloc'), ['ada/lightbeam', 'ada/orbit-engine', 'ada/wayfinder']);
  assert.deepEqual(engine.path('ada/dotfiles', 'ada/tiny-alloc'), ['ada/dotfiles', 'ada/wayfinder', 'ada/tiny-alloc']);
  assert.deepEqual(engine.neighbors('nobody/nothing'), []);
  const before = engine.edges();
  assert.ok(before.pairs instanceof Uint32Array && before.weights instanceof Float32Array && before.pairs.length === before.weights.length * 2);
  assert.equal(engine.bands().length, 0);

  // compileSpec is pure; applySpec retains; a failing apply changes nothing.
  const spec = examples.find(([name]) => name === 'solar-system-rust-focus.json')[1];
  const compiled = engine.compileSpec(spec);
  assert.equal(compiled.ok, true);
  assert.equal(engine.appliedSpec(), null);
  assert.equal(engine.applySpec({ schema_version: 1, focus: { kind: 'repository', value: 'nope' } }).ok, false);
  assert.equal(engine.appliedSpec(), null);
  assert.deepEqual(engine.applySpec(spec).compiled, compiled.compiled);
  assert.deepEqual(engine.appliedSpec(), compiled.compiled.spec);
  assert.ok(engine.bands() instanceof Uint8Array && engine.bands().length === 15);
  assert.ok(engine.positions() instanceof Float32Array && engine.positions().length === 30);
  assert.equal(engine.bands()[engine.indexOf('ada/tiny-alloc')], 3);

  // Replacing evidence rebuilds the indexes and clears the applied spec.
  const generation = engine.generation;
  engine.setRepositories([{ full_name: 'x/one', language: 'Zig' }, { full_name: 'x/two', language: 'Zig' }]);
  assert.equal(engine.generation, generation + 1);
  assert.equal(engine.appliedSpec(), null);
  assert.deepEqual(engine.neighbors('x/one'), ['x/two']);
  assert.equal(engine.indexOf('ada/lightbeam'), -1);
  assert.throws(() => engine.setRepositories({ repositories: [{ id: 'a', stars: -1 }] }), /repositories\[0\]\.stars/);
  assert.equal(engine.repositoryCount, 2);
  engine.destroy();
  assert.throws(() => engine.repositoryCount, /destroyed/);
});

test('compilation is deterministic and never exposes coordinates in the spec', () => {
  const run = () => {
    const engine = createConstellationEngine(evidence);
    try { return examples.map(([, spec]) => JSON.stringify(engine.compileSpec(spec, { round: true }))); } finally { engine.destroy(); }
  };
  assert.deepEqual(run(), run());
  const engine = createConstellationEngine(evidence);
  const { compiled } = engine.compileSpec(examples.find(([name]) => name === 'experiments-on-the-outskirts.json')[1]);
  engine.destroy();
  assert.ok(!/position|"x"|"y"/.test(JSON.stringify(compiled.spec)));
  assert.ok(compiled.nodes.every((node) => node.position.every(Number.isFinite)));
});

test('constellationSpec is an optional config field that Rust validates once the engine is registered', (t) => {
  const spec = examples.find(([name]) => name === 'solar-system-rust-focus.json')[1];
  t.after(() => registerSpecHost(null));
  // Without the engine it is inert, size-checked data: accepted, kept, unused.
  registerSpecHost(null);
  assert.deepEqual(normalizeConfig({ constellationSpec: spec }).constellationSpec, spec);
  assert.throws(() => normalizeConfig({ constellationSpec: 'nope' }), /constellationSpec must be/);
  assert.throws(() => normalizeConfig({ constellationSpec: { schema_version: 1, pad: 'x'.repeat(300000) } }), /constellationSpec must be|too large/);
  assert.equal(normalizeConfig({ theme: 'midnight' }).constellationSpec, undefined);

  registerSpecHost(specHost);
  const options = normalizeConfig({ constellationSpec: spec });
  assert.equal(options.constellationSpec.groups[0].id, 'experiments', 'stored in normalized form');
  assert.throws(() => normalizeConfig({ constellationSpec: { schema_version: 1, layout: { kind: 'spiral' } } }), /constellationSpec is invalid at layout\.kind/);
  // Saved configurations and share-style round trips keep the spec.
  const saved = serializeConfig('ada', { ...options, maxRepos: 15 });
  assert.deepEqual(parseConfig(saved, 'ada').options.constellationSpec, options.constellationSpec);
  // Deeply nested filters survive saving even though other settings may not nest that far.
  const deep = { schema_version: 1, groups: [{ id: 'deep', label: 'Deep', match: { any: [{ all: [{ not: { any: [{ updated: { older_than_days: 30 } }] } }] }] } }] };
  assert.deepEqual(parseConfig(serializeConfig('ada', { constellationSpec: deep }), 'ada').options.constellationSpec.groups[0].match, deep.groups[0].match);
  assert.throws(() => normalizeConfig({ constellationSpec: { schema_version: 1, style: { constructor: 1 } } }), /Unsafe configuration key/);
  assert.throws(() => registerSpecHost({}), /validate\(\) and placements\(\)/);
});

test('the existing scene pipeline places stars from a spec, and manual moves still win', (t) => {
  t.after(() => registerSpecHost(null));
  const spec = examples.find(([name]) => name === 'solar-system-rust-focus.json')[1];
  const base = { maxRepos: 15, animate: false, referenceDate, projectShowcase, arrangement: 'rings', orbitShape: 'round' };
  const positions = (options) => Object.fromEntries(createScene('ada', repositories, options).nodes.map((node) => [node.id, [node.geometry.x, node.geometry.y]]));
  const distance = ([x, y]) => Math.hypot(x - 450, y - 270);

  registerSpecHost(null);
  const without = positions({ ...base, constellationSpec: spec });
  assert.deepEqual(without, positions(base), 'no engine registered: the spec has no effect');

  registerSpecHost(specHost);
  const placed = positions({ ...base, constellationSpec: spec });
  assert.notDeepEqual(placed, without);
  const expected = specPlacements(spec, repositories, { round: true, projectShowcase, referenceDate });
  for (const [id, point] of expected) assert.deepEqual(placed[id], point, id);
  for (const inner of ['ada/orbit-engine', 'ada/lightbeam', 'ada/wayfinder']) {
    for (const outer of ['ada/tiny-alloc', 'ada/tiny-worlds', 'ada/weekend-synth']) assert.ok(distance(placed[inner]) < distance(placed[outer]), `${inner} is nearer the centre than ${outer}`);
  }
  // A star moved by hand keeps its place.
  const moved = positions({ ...base, constellationSpec: spec, starPositions: { 'ada/tiny-alloc': { x: 111, y: 222 } } });
  assert.deepEqual(moved['ada/tiny-alloc'], [111, 222]);
  assert.deepEqual(moved['ada/lightbeam'], placed['ada/lightbeam']);
  // Other layouts ignore placement; a spec that no longer fits the data is ignored, not fatal.
  assert.deepEqual(positions({ ...base, arrangement: 'galaxy', constellationSpec: spec }), positions({ ...base, arrangement: 'galaxy' }));
  assert.deepEqual(positions({ ...base, constellationSpec: { schema_version: 1, focus: { kind: 'repository', value: 'gone/away' } } }), positions(base));
  // Rendering stays deterministic and works with no AI code loaded.
  const svg = (options) => renderSceneSVG(createScene('ada', repositories, options));
  assert.equal(svg({ ...base, constellationSpec: spec }), svg({ ...base, constellationSpec: spec }));
});

test('specOptions carries a compiled plan through existing options', () => {
  const engine = createConstellationEngine(evidence);
  const { compiled } = engine.compileSpec(examples.find(([name]) => name === 'language-weighted-relationships.json')[1]);
  engine.destroy();
  const next = specOptions({ theme: 'midnight', starPositions: { a: { x: 1, y: 2 } }, labelOffsets: { a: 1 }, temporalStack: { enabled: true, axis: 'year' }, layoutEngine: 'x', arrangement: 'temporal-stack' }, compiled);
  assert.deepEqual(next, {
    theme: 'midnight', arrangement: 'force', connectionBasis: 'both', connectionWeight: 'languages', sortBy: 'updated', maxRepos: 12,
    constellationSpec: compiled.spec, starPositions: {}, labelPositions: {}, labelOffsets: {}, temporalStack: { enabled: false, axis: 'year' },
  });
  assert.throws(() => specOptions({}, { spec: {} }), /compiled ConstellationSpec/);
  // The result is an ordinary, valid configuration.
  registerSpecHost(specHost);
  assert.doesNotThrow(() => normalizeConfig(next));
  registerSpecHost(null);
});

test('the CLI validates a saved spec with Rust and renders it, with no flag and no network', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'constellation-spec-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const options = { arrangement: 'rings', orbitShape: 'round', maxRepos: 15, animate: false, referenceDate, projectShowcase };
  const spec = examples.find(([name]) => name === 'solar-system-rust-focus.json')[1];
  const write = async (name, value) => { const path = join(directory, name); await writeFile(path, JSON.stringify(value)); return path; };
  const fixture = await write('repositories.json', repositories);
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' } });
  const render = async (name, config) => {
    const output = join(directory, `${name}.svg`);
    const result = run('--username', 'ada', '--fixture', fixture, '--config', await write(`${name}.json`, config), '--output', output);
    assert.equal(result.status, 0, result.stderr);
    // The footer carries the time of generation; everything else must be reproducible.
    return (await readFile(output, 'utf8')).replace(/<text class="generated-at"[^>]*>[^<]*<\/text>/, '');
  };
  const plain = await render('plain', { version: 7, account: 'ada', options });
  const nested = await render('nested', { version: 7, account: 'ada', options: { ...options, constellationSpec: spec } });
  assert.notEqual(nested, plain, 'the spec changes where stars sit');
  assert.equal(await render('again', { version: 7, account: 'ada', options: { ...options, constellationSpec: spec } }), nested, 'and does so deterministically');

  const invalid = run('validate', '--config', await write('bad.json', { version: 7, account: 'ada', options: { constellationSpec: { schema_version: 1, layout: { kind: 'spiral' } } } }));
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr + invalid.stdout, /constellationSpec is invalid at layout\.kind/);
  assert.equal(run('validate', '--config', join(directory, 'nested.json')).status, 0);
});
