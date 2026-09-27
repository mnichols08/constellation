import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { seededRandom, resolveSeed } from '../src/seeded-random.mjs';
import { randomizeDesign, newDesignCode } from '../src/design-randomizer.mjs';
import { nodeRadius, sizingModes } from '../src/node-sizing.mjs';
import { mappedColor, mappedGlow, connectionWeight } from '../src/visual-mapping.mjs';
import { artifactPositions } from '../src/artifact-layouts.mjs';
import { visualThemes, resolveTheme } from '../src/themes.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { createConfigStore } from '../src/config-store.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';
import { renderConstellation, selectRepositoryPool, graphNodes } from '../src/constellation.mjs';
import { exportSettings, profileDimensions } from '../src/export-image.mjs';
import { loadConfig } from '../src/config.mjs';
import { renderWorkflow } from '../src/export.mjs';
import { createHash } from 'node:crypto';

const repos = Array.from({ length: 24 }, (_, i) => ({ name: `project-${i}`, full_name: `tester/project-${i}`, language: i % 2 ? 'Rust' : 'JavaScript', languages: { [i % 2 ? 'Rust' : 'JavaScript']: 100, CSS: 20 }, topics: ['tools', `topic-${i % 3}`], stargazers_count: i * 100, updated_at: `202${i % 6}-01-01T00:00:00Z`, created_at: '2020-01-01T00:00:00Z', fork: i === 1, archived: i === 2 }));

test('v4 recipes independently vary every ring and combine motion with varied perspective', () => {
  const variations = Object.fromEntries(['speeds', 'directions', 'modes', 'amplitudes', 'easing', 'horizontal', 'vertical', 'zoom', 'range', 'duration'].map(key => [key, new Set()]));
  let combined = false;
  for (let i = 0; i < 32; i++) {
    const recipe = randomizeDesign(`v4:motion-${i}`);
    assert.deepEqual(recipe, randomizeDesign(recipe.designCode));
    assert.equal(recipe.ringAnimation.linked, false);
    for (const key of ['speeds', 'directions', 'modes', 'amplitudes', 'easing']) {
      assert.equal(recipe.ringAnimation[key].length, 4);
      for (const value of recipe.ringAnimation[key]) variations[key].add(value);
    }
    for (const key of ['horizontal', 'vertical', 'zoom', 'range', 'duration']) variations[key].add(recipe.perspective[key]);
    combined ||= recipe.ringAnimation.enabled && recipe.floatingAnimation.enabled && recipe.perspective.animate;
    assert.deepEqual(parseConfig(serializeConfig('tester', recipe)).options, recipe);
    const shared = decodeShare(encodeShare('https://example.test', 'tester', recipe)).options;
    assert.deepEqual(shared.ringAnimation, recipe.ringAnimation);
    assert.deepEqual(shared.perspective, recipe.perspective);
    const svg = renderConstellation('tester', repos.slice(0, 4), recipe);
    assert.equal(svg, renderConstellation('tester', repos.slice(0, 4).reverse(), recipe));
    assert.match(svg, /ring-motion-still/);
    assert.match(svg, /<animate(?:Transform)? /);
    const still = randomizeDesign(`v4:still-${i}`);
    assert.equal(still.ringAnimation.enabled, false);
    assert.equal(still.floatingAnimation.enabled, false);
    assert.equal(still.perspective.animate, false);
    assert.doesNotMatch(renderConstellation('tester', repos.slice(0, 4), still), /<animate(?:Transform)? |animation:twinkle/);
  }
  assert.ok(combined, 'ring, floating and perspective motion can run together');
  for (const [key, values] of Object.entries(variations)) assert.ok(values.size > 1, `${key} must vary`);
  const mixed = randomizeDesign('v4:motion-0').ringAnimation;
  assert.ok(new Set(mixed.speeds).size > 1, 'rings receive independent speeds');
  assert.ok(new Set(mixed.directions).size > 1, 'rings can counter-rotate');
});

test('v3 motion recipes replay all four motion styles and offer fully still designs', () => {
  const styles = new Set();
  for (let i = 0; i < 24; i++) {
    const code = `v3:motion-${i}`, recipe = randomizeDesign(code);
    assert.deepEqual(recipe, randomizeDesign(code));
    assert.deepEqual(parseConfig(serializeConfig('tester', recipe)).options, recipe);
    styles.add(recipe.ringAnimation.enabled ? recipe.ringAnimation.modes[0] : recipe.floatingAnimation.enabled ? 'floating' : 'perspective');
    const svg = renderConstellation('tester', repos.slice(0, 4), recipe);
    assert.match(svg, /<animate(?:Transform)? /);
    assert.match(svg, /ring-motion-still/);
    const still = randomizeDesign(`v3:still-${i}`);
    assert.equal(still.animate, false);
    assert.doesNotMatch(renderConstellation('tester', repos.slice(0, 4), still), /<animate(?:Transform)? |animation:twinkle/);
  }
  assert.deepEqual([...styles].sort(), ['floating', 'perspective', 'spin', 'sway']);
  assert.match(newDesignCode({ motion: false }), /^v5:m000-/);
});

test('seeded randomness and versioned design codes reproduce a complete visual recipe', () => {
  const a = seededRandom('hello'), b = seededRandom('hello');
  const values = Array.from({ length: 40 }, () => a());
  assert.deepEqual(values, Array.from({ length: 40 }, () => b()));
  assert.ok(values.every(value => value >= 0 && value < 1));
  assert.notEqual(seededRandom('other')(), values[0]);
  assert.equal(resolveSeed('Tester'), 'tester');
  assert.throws(() => resolveSeed('tester', { seedMode: 'random' }));
  assert.match(newDesignCode(), /^v5:mfff-/);
  const design = randomizeDesign('v1:fixture');
  assert.deepEqual(design, randomizeDesign('v1:fixture'));
  assert.notDeepEqual(design, randomizeDesign('v1:other'));
  assert.throws(() => randomizeDesign('v6:fixture'));
  assert.equal(design.visualTheme, 'monochrome'); // Versioned recipe regression vector.
  assert.equal(createHash('sha256').update(JSON.stringify(design)).digest('hex'), 'c6f566741baa8c71e96ded511e5ec95e021a62c09b8e6c38fc0cba5100e0af4b');
  assert.equal(renderConstellation('tester', repos, design), renderConstellation('tester', [...repos].reverse(), design));
});

test('metric size/glow are bounded, missing values are safe, and manual colors win', () => {
  for (const mode of sizingModes) for (const repo of [{}, ...repos, { stargazers_count: 1e9 }]) {
    const value = nodeRadius(repo, mode, Date.parse('2026-01-01'));
    assert.ok(value >= 2.7 && value <= 6, `${mode}: ${value}`);
  }
  assert.ok(nodeRadius(repos[10], 'stars') > nodeRadius(repos[0], 'stars'));
  assert.ok(nodeRadius(repos[5], 'activity', Date.parse('2025-01-01')) > nodeRadius(repos[0], 'activity', Date.parse('2025-01-01')));
  assert.equal(nodeRadius({}, 'uniform'), 4);
  assert.equal(mappedColor(repos[1], 'language'), '#dea584');
  for (const mode of ['stars', 'activity', 'seeded']) assert.ok(mappedGlow(repos[1], mode, 'x', Date.parse('2026-01-01')) >= 0 && mappedGlow(repos[1], mode, 'x', Date.parse('2026-01-01')) <= 1);
  const svg = renderConstellation('tester', repos, { nodeColorMode: 'language', nodeColors: { 'tester/project-1': '#123456' } });
  assert.match(svg, /--node-color:#123456/);
  const edge = { sharedLanguages: ['CSS', 'Rust'], sharedTopics: ['tools'] };
  assert.equal(connectionWeight(edge), null);
  assert.ok(connectionWeight(edge, 'overlap').width > connectionWeight(edge, 'topics').width);
  assert.throws(() => renderConstellation('tester', [], { nodeSize: 'huge' }));
});

test('themes change only visual defaults and every theme renders a script-free SVG', () => {
  for (const theme of Object.keys(visualThemes)) {
    const resolved = resolveTheme({ theme, maxRepos: 5, includeForks: false, animate: true, colors: { star: '#abcdef' } });
    assert.equal(resolved.maxRepos, 5); assert.equal(resolved.includeForks, false); assert.equal(resolved.animate, true); assert.equal(resolved.colors.star, '#abcdef');
    const svg = renderConstellation('tester', repos, { theme });
    assert.doesNotMatch(svg, /<script|foreignObject|@import/);
    assert.match(svg, /prefers-reduced-motion/);
  }
});

test('Galaxy and Solar System layouts are deterministic, bounded and preserve manual positions', () => {
  for (const mode of ['galaxy', 'solar-system']) for (const compact of [true, false]) {
    const positions = artifactPositions(repos, mode, 'seed', compact);
    assert.deepEqual(positions, artifactPositions([...repos].reverse(), mode, 'seed', compact));
    for (const { x, y } of Object.values(positions)) { assert.ok(x >= 32 && x <= 868); assert.ok(y >= 28 && y <= (compact ? 220 : 500)); }
    const svg = renderConstellation('tester', repos, { arrangement: mode, starPositions: { 'tester/project-1': { x: 100, y: 100 } } });
    assert.match(svg, /class="star" cx="100.0" cy="100.0"[^>]*data-repo="tester\/project-1"/);
  }
});

test('custom-seeded rings, animation, selection and shapes share the same point anchors', () => {
  const options = { seedMode: 'custom', seed: 'v1:my-sky', arrangement: 'rings', nodeShape: 'mixed', nodeColorMode: 'seeded', ringRotations: [5, 10, 15, 20], selection: { start: 'tester/project-1' }, ringAnimation: { enabled: true } };
  const svg = renderConstellation('tester', repos, options);
  assert.equal(svg, renderConstellation('tester', [...repos].reverse(), options));
  assert.match(svg, /ring-motion-still/); assert.match(svg, /data-focus-start="tester\/project-1"/);
  const anchors = [...svg.matchAll(/data-snap-x="([\d.]+)" data-snap-y="([\d.]+)"/g)];
  for (const [, x, y] of anchors) assert.ok(svg.includes(`class="star" cx="${Number(x).toFixed(1)}" cy="${Number(y).toFixed(1)}"`));
});

test('portable configs migrate old fields, validate structure and strip runtime secrets', async () => {
  const legacy = { ringRotation: 33, nodeColors: { 'tester/project-1': '#abcdef' }, hiddenNodes: [], hiddenLabels: [], starPositions: { 'tester/project-1': { x: 90, y: 120 } }, labelOffsets: {}, nodeMode: 'combined', repoSource: 'pinned' };
  const encoded = serializeConfig('tester', { ...legacy, GH_TOKEN: 'secret', cache: repos });
  assert.doesNotMatch(encoded, /secret|cache/);
  assert.deepEqual(parseConfig(encoded).options, legacy);
  assert.deepEqual(parseConfig(legacy, 'tester').options, legacy);
  assert.deepEqual(await loadConfig(undefined, encoded), legacy);
  const recipe = randomizeDesign('v1:fixture');
  assert.deepEqual(parseConfig(serializeConfig('tester', recipe)).options, recipe);
  for (const value of ['null', '[]', '{bad', '{"version":42}', '{"__proto__":{}}', '{"nodeColors":null}', '{"selection":{"start":7}}', '{"css":"@import url(https://evil.test)"}', '{"perspective":{"token":"secret"}}', '{"ringRotations":[1,2]}']) assert.throws(() => parseConfig(value), value);
  assert.throws(() => parseConfig({ starPositions: { a: { x: 9999999, y: 5 } } }));
  const workflow = renderWorkflow('tester', recipe);
  const restored = await loadConfig(undefined, workflow.split('          config-json: |\n')[1]);
  assert.equal(renderConstellation('tester', repos, restored), renderConstellation('tester', repos, recipe));
});

test('drafts and presets are account-scoped, validated and tolerate unavailable storage', () => {
  const data = new Map(), store = createConfigStore({ getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) });
  assert.equal(store.saveDraft('Tester', { nodeSize: 'stars' }), true);
  assert.equal(store.draft('tester').options.nodeSize, 'stars'); assert.equal(store.draft('other'), null);
  store.savePreset('tester', 'README', { layout: 'compact' }); store.rename('tester', 'README', 'Minimal');
  assert.equal(store.presets('tester')[0].name, 'Minimal');
  store.delete('tester', 'Minimal'); assert.deepEqual(store.presets('tester'), []);
  store.reset('tester'); assert.equal(store.draft('tester'), null);
  data.set('constellation-config-v1:tester', 'not json'); assert.equal(store.draft('tester'), null);
  assert.equal(createConfigStore().saveDraft('tester', {}), false);
  assert.equal(createConfigStore({ getItem() { throw Error(); } }).draft('tester'), null);
});

test('share links round-trip Unicode configs and manual edits, bound size, reject corruption', () => {
  const options = { seedMode: 'custom', seed: '🌌 Rust', nodeMode: 'combined', nodeSize: 'stars', ringRotations: [0, 10, 20, 30], starPositions: { x: { x: 1, y: 2 } }, css: '.star{opacity:.5}', GH_TOKEN: 'nope' };
  const link = encodeShare('https://example.test/studio?token=nope#old', 'tester', options);
  assert.ok(link.length < 8000); assert.ok(!link.includes('token'));
  const decoded = decodeShare(link); assert.equal(decoded.options.seed, options.seed); assert.deepEqual(decoded.options.starPositions, options.starPositions); assert.equal(decoded.options.css, options.css);
  for (const href of ['https://example.test?view=@@', 'https://example.test?view=e30&user=tester', link.replace('user=tester', 'user=other')]) assert.throws(() => decodeShare(href));
  assert.throws(() => encodeShare('https://example.test', 'tester', { hiddenNodes: Array(3000).fill('a-long-repository') }));
  assert.equal(decodeShare('https://example.test'), null);
});

test('metadata filters run before category projection and pinned ordering remains stable', () => {
  const selected = selectRepositoryPool(repos, { minStars: 1000, includeArchived: false, repoQuery: 'project-1', sortBy: 'name' });
  assert.deepEqual(selected.map(repo => repo.name), Array.from({ length: 10 }, (_, i) => `project-${i + 10}`));
  const graph = graphNodes(repos, { minStars: 2200, nodeMode: 'languages' });
  assert.equal(graph.repositoryCount, 2); assert.equal(graph.nodes.find(node => node.name === 'CSS').members.length, 2);
  const pins = repos.slice(0, 3).map((repo, i) => ({ ...repo, pinned: true, pin_order: i }));
  assert.deepEqual(selectRepositoryPool(pins, { repoSource: 'pinned', minStars: 100 }).map(repo => repo.name), ['project-1', 'project-2']);
  assert.equal(selectRepositoryPool(repos, { updatedWithin: 1 }).length, 0);
});

test('profiles share one renderer with bounded dimensions, label density and transparent background', () => {
  assert.equal(exportSettings({ exportProfile: 'compact' }).layout, 'compact');
  assert.equal(profileDimensions('hero', 560).width, 1440);
  const normal = renderConstellation('tester', repos), compact = renderConstellation('tester', repos, { exportProfile: 'compact' });
  assert.match(compact, /width="600"/); assert.ok([...compact.matchAll(/class="repo-label"/g)].length < [...normal.matchAll(/class="repo-label"/g)].length);
  const transparent = renderConstellation('tester', repos, { exportProfile: 'transparent', theme: 'deep-space' });
  assert.doesNotMatch(transparent, /<ellipse/); assert.match(transparent, /background:transparent!important/);
  assert.throws(() => exportSettings({ exportProfile: 'invalid' }));
});

test('example configs render deterministically and remain within the documented static SVG budget', async () => {
  for (const file of (await readdir(new URL('../examples/', import.meta.url))).filter(name => name.endsWith('.json'))) {
    const options = parseConfig(await readFile(new URL(`../examples/${file}`, import.meta.url), 'utf8')).options;
    const svg = renderConstellation('tester', repos, options);
    assert.equal(svg, renderConstellation('tester', repos, options));
    assert.ok(Buffer.byteLength(svg) < 250000, `${file}: ${Buffer.byteLength(svg)} bytes`);
  }
});
