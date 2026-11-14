import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyManifests } from '../src/tech-stack/catalog.mjs';
import { scanTechStack, techStackQuery, TechStackRateLimit, TechStackTransient, githubTransport } from '../src/tech-stack/scan.mjs';
import { coverageNotes, createTechStackScene, renderTechStackHTML, renderTechStackSVG, techStackModel } from '../src/tech-stack/scene.mjs';
import { validatePublicationArtifact } from '../src/publication-integrity.mjs';
import { readFile } from 'node:fs/promises';
import { createEngine } from '../src/app/engine.mjs';

const repo = (name, overrides = {}) => ({
  name, nameWithOwner: `acme/${name}`, url: `https://github.com/acme/${name}`, description: null,
  isPrivate: false, isFork: false, isArchived: false, isEmpty: false,
  createdAt: '2024-01-01T00:00:00Z', pushedAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
  stargazerCount: 1, forkCount: 0, primaryLanguage: { name: 'JavaScript' },
  languages: { edges: [{ size: 980, node: { name: 'JavaScript' } }, { size: 10, node: { name: 'Shell' } }] },
  repositoryTopics: { nodes: [] },
  tree: { entries: [{ name: 'package.json', type: 'blob' }] },
  ...overrides,
});
const PACKAGE = JSON.stringify({ dependencies: { react: '^18', express: '^4', mongoose: '^8' }, devDependencies: { vite: '^5' } });

/** Answers each step from fixed repositories and records what it was asked. */
function fakeGitHub(repositories, { files = {}, pageSize = 2 } = {}) {
  const steps = [];
  const transport = async (step) => {
    steps.push(step);
    techStackQuery(step); // Every step sent must pass the query builder.
    if (step.kind === 'roots') {
      return { data: Object.fromEntries(step.items.map((item, r) => [`r${r}`, { tree: repositories.find((entry) => entry.name === item.name)?.tree ?? null }])) };
    }
    if (step.kind === 'listing') {
      const start = Number(step.after || 0), end = start + Math.min(step.size, pageSize);
      return { data: { repositoryOwner: { repositories: { totalCount: repositories.length, pageInfo: { hasNextPage: end < repositories.length, endCursor: String(end) }, nodes: repositories.slice(start, end) } } } };
    }
    const data = {};
    step.items.forEach((item, r) => {
      data[`r${r}`] = {};
      item.paths.forEach((path, f) => {
        if (step.kind === 'manifests') data[`r${r}`][`f${f}`] = { text: files[`${item.name}/${path}`] ?? PACKAGE, byteSize: 100, isBinary: false };
        else data[`r${r}`][`d${f}`] = { entries: [{ name: 'package.json', type: 'blob' }] };
      });
    });
    return { data };
  };
  return { transport, steps };
}

test('classifies each manifest type and ignores unknown and hostile names', () => {
  const { technologies, unreadable } = classifyManifests({
    'package.json': JSON.stringify({ dependencies: { react: '1', __proto__: '1', constructor: '1', 'left-pad': '1' } }),
    'api/requirements.txt': 'Django==4.2  # web\npsycopg2-binary>=2\n-r other.txt\n',
    'Gemfile': "gem 'rails'\n",
    'svc/pom.xml': '<artifactId>spring-boot-starter</artifactId>',
    'broken/package.json': '{ not json',
  }, ['Dockerfile']);
  assert.deepEqual(technologies, ['Django', 'Docker', 'PostgreSQL', 'Rails', 'React', 'Spring Boot']);
  assert.equal(unreadable, 1);
});

test('the query builder asks only for public repositories and rejects anything else', () => {
  const listing = techStackQuery({ kind: 'listing', login: 'acme', after: null, size: 50 });
  assert.match(listing, /privacy:PUBLIC/);
  assert.match(listing, /ownerAffiliations:OWNER/);
  assert.doesNotMatch(listing, /tree:object/, 'file trees are what make GitHub time out, so listing never asks for them');
  for (const bad of [
    { kind: 'listing', login: 'acme", evil:"', size: 1 },
    { kind: 'listing', login: 'acme', size: 5000 },
    { kind: 'mutation', login: 'acme' },
    { kind: 'manifests', login: 'acme', items: [{ name: 'a) { evil }', paths: ['package.json'] }] },
    { kind: 'manifests', login: 'acme', items: [{ name: 'a', paths: ['../../secret'] }] },
    { kind: 'manifests', login: 'acme', items: [] },
    null,
  ]) assert.throws(() => techStackQuery(bad), /Invalid tech stack request/);
  const quoted = techStackQuery({ kind: 'manifests', login: 'acme', items: [{ name: 'a', paths: ['we"ird/package.json'] }] });
  assert.ok(quoted.includes(JSON.stringify('HEAD:we"ird/package.json')), 'paths stay inside a quoted string');
});

test('scan pages through everything, drops forks, empties and private repositories, and keeps no manifest text', async () => {
  const github = fakeGitHub([repo('one'), repo('two'), repo('forked', { isFork: true }), repo('blank', { isEmpty: true }), repo('secret', { isPrivate: true })]);
  const progress = [];
  const scan = await scanTechStack('acme', { transport: github.transport, onProgress: (update) => progress.push(update.stage) });
  assert.deepEqual(scan.records.map((record) => record.name), ['one', 'two']);
  assert.deepEqual(scan.records[0].dependencies, ['Express', 'MongoDB', 'React', 'Vite']);
  assert.deepEqual(Object.keys(scan.records[0].languages), ['JavaScript'], 'a language under 2% does not count');
  assert.equal(scan.coverage.forks, 1);
  assert.equal(scan.coverage.empty, 1);
  assert.equal(scan.coverage.discovered, 5);
  for (const stage of ['listing', 'folders', 'details']) assert.ok(progress.includes(stage), stage);
  assert.ok(!JSON.stringify(scan).includes('mongoose'), 'manifest text is discarded');
  assert.ok(!github.steps.some((step) => step.items?.some((item) => item.name === 'secret')), 'never reads a private repository');
});

test('scan looks one folder deeper only where it has found no manifest', async () => {
  const nested = repo('nested', { tree: { entries: [{ name: 'app', type: 'tree', object: { entries: [{ name: 'client', type: 'tree' }, { name: 'node_modules', type: 'tree' }] } }] } });
  const github = fakeGitHub([nested, repo('plain')]);
  const scan = await scanTechStack('acme', { transport: github.transport });
  const deep = github.steps.filter((step) => step.kind === 'trees');
  assert.equal(deep.length, 1);
  assert.deepEqual(deep[0].items, [{ name: 'nested', paths: ['app/client'] }]);
  assert.ok(scan.records.find((record) => record.name === 'nested').dependencies.includes('React'));
});

test('a rate limit keeps what was read and says it is partial', async () => {
  const github = fakeGitHub([repo('one'), repo('two'), repo('three')]);
  const transport = async (step) => {
    if (step.kind === 'listing' && step.after) throw new TechStackRateLimit('limit');
    return github.transport(step);
  };
  const scan = await scanTechStack('acme', { transport });
  assert.equal(scan.records.length, 2);
  assert.equal(scan.coverage.stopped, 'rate-limit');
  await assert.rejects(scanTechStack('acme', { transport: async () => { throw new TechStackRateLimit('limit'); } }), TechStackRateLimit, 'with nothing read there is nothing to show');
});

test('the request budget always ends the scan', async () => {
  let calls = 0;
  const transport = async () => { calls += 1; throw new TechStackTransient('busy'); };
  await assert.rejects(scanTechStack('acme', { transport, limits: { requests: 20 } }));
  assert.ok(calls <= 20, `made ${calls} requests`);
});

test('a page that times out is retried smaller', async () => {
  const github = fakeGitHub([repo('one'), repo('two')]);
  const sizes = [];
  const transport = async (step) => {
    if (step.kind === 'listing') { sizes.push(step.size); if (step.size === 100) throw new TechStackTransient('slow'); }
    return github.transport(step);
  };
  const scan = await scanTechStack('acme', { transport });
  assert.equal(scan.records.length, 2);
  assert.equal(sizes[0], 100);
  assert.ok(sizes.some((size) => size < 100));
});

test('a browser-blocked response is retried, not fatal', async () => {
  // GitHub's 502 has no CORS header, so in a browser fetch rejects with a TypeError.
  const github = fakeGitHub([repo('one')]);
  let blocked = 0;
  const fetchImpl = async (url, init) => {
    const { query } = JSON.parse(init.body);
    if (query.includes('repositoryOwner') && query.includes('first:100')) { blocked += 1; throw new TypeError('Failed to fetch'); }
    const step = query.includes('repositoryOwner') ? { kind: 'listing', login: 'acme', size: 2 }
      : query.includes('tree:object') ? { kind: 'roots', login: 'acme', items: [{ name: 'one' }] }
        : { kind: 'manifests', login: 'acme', items: [{ name: 'one', paths: ['package.json'] }] };
    return new Response(JSON.stringify(await github.transport(step)));
  };
  const scan = await scanTechStack('acme', { transport: githubTransport(fetchImpl) });
  assert.ok(blocked >= 1);
  assert.deepEqual(scan.records[0].dependencies, ['Express', 'MongoDB', 'React', 'Vite']);
});

test('a heavy repository splits its batch and only it goes missing', async () => {
  const repositories = Array.from({ length: 8 }, (_, index) => repo(`app-${index}`));
  const github = fakeGitHub(repositories);
  const transport = async (step) => {
    if (step.kind === 'roots' && step.items.some((item) => item.name === 'app-3')) throw new TechStackTransient('slow');
    return github.transport(step);
  };
  const scan = await scanTechStack('acme', { transport });
  assert.equal(scan.records.length, 8);
  assert.equal(scan.coverage.missing, 1);
  assert.deepEqual(scan.records.find((record) => record.name === 'app-3').dependencies, []);
  assert.deepEqual(scan.records.find((record) => record.name === 'app-4').dependencies, ['Express', 'MongoDB', 'React', 'Vite']);
  assert.ok(coverageNotes(scan).some((note) => note.includes('1 repositories could not be fully read')));
});

test('being offline ends the scan instead of retrying forever', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new TypeError('Failed to fetch'); };
  await assert.rejects(scanTechStack('acme', { transport: githubTransport(fetchImpl) }), TechStackTransient);
  assert.ok(calls <= 12, `made ${calls} requests`);
});

test('cancelling stops the scan', async () => {
  const controller = new AbortController();
  const github = fakeGitHub([repo('one'), repo('two'), repo('three')]);
  const transport = async (step, signal) => { controller.abort(); signal.throwIfAborted(); return github.transport(step); };
  await assert.rejects(scanTechStack('acme', { transport, signal: controller.signal }), { name: 'AbortError' });
});

test('an unknown account and a bad login fail clearly', async () => {
  await assert.rejects(scanTechStack('nobody', { transport: async () => ({ data: { repositoryOwner: null } }) }), /404/);
  await assert.rejects(scanTechStack('bad login', { transport: async () => { throw new Error('should not be called'); } }), /Enter a GitHub username/);
});

test('the transport sends a confined POST and maps GitHub statuses', async () => {
  const seen = [];
  const answer = (status, body = '{}') => async (url, init) => { seen.push({ url, init }); return new Response(body, { status }); };
  await githubTransport(answer(200, '{"data":{}}'))({ kind: 'listing', login: 'acme', size: 1 });
  assert.equal(seen[0].url, 'https://api.github.com/graphql');
  assert.equal(seen[0].init.method, 'POST');
  const step = { kind: 'listing', login: 'acme', size: 1 };
  await assert.rejects(githubTransport(answer(403))(step), TechStackRateLimit);
  await assert.rejects(githubTransport(answer(502))(step), TechStackTransient);
  await assert.rejects(githubTransport(answer(200, 'not json'))(step), TechStackTransient);
  await assert.rejects(githubTransport(answer(401))(step), /401/);
});

const scanOf = async (repositories, options) => scanTechStack('acme', { transport: fakeGitHub(repositories, options).transport, now: () => '2026-11-05T00:00:00.000Z' });

test('the scene counts every repository, joins real pairs and is repeatable', async () => {
  const files = { 'solo/package.json': JSON.stringify({ dependencies: { vue: '3' } }) };
  const repositories = [...Array.from({ length: 140 }, (_, index) => repo(`app-${index}`)), repo('solo')];
  const scan = await scanOf(repositories, { files });
  const scene = createTechStackScene(scan);
  const node = (name) => scene.nodes.find((item) => item.metadata.name === name);
  assert.equal(node('React').metadata.representedCount, 140, 'not capped at the 100 drawn projects');
  assert.equal(node('Vue').metadata.representedCount, 1);
  assert.ok(node('React').geometry.radius > node('Vue').geometry.radius);
  assert.equal(node('React').style.color, '#5cc8ff');
  const edge = scene.edges.find((item) => item.from === 'dependency:Express' && item.to === 'dependency:MongoDB');
  assert.equal(edge.metadata.repositoryCount, 140);
  assert.ok(edge.metadata.sharedRepositories.length <= 100);
  assert.ok(!scene.edges.some((item) => item.from.endsWith(':Vue') || item.to.endsWith(':Vue')), 'Vue shares nothing with these');
  assert.ok(scene.annotations.some((item) => item.text === 'Frontend & build'));
  assert.deepEqual(JSON.parse(JSON.stringify(createTechStackScene(scan))), JSON.parse(JSON.stringify(scene)));
});

test('a personal account with a small stack still draws, and an empty one explains itself', async () => {
  const scene = createTechStackScene(await scanOf([repo('only')]));
  assert.equal(scene.nodes.length, 5);
  assert.ok(scene.nodes.every((item) => Number.isFinite(item.geometry.x)));
  const empty = await scanOf([repo('docs', { primaryLanguage: null, languages: { edges: [] }, tree: { entries: [] } })]);
  assert.throws(() => createTechStackScene(empty), /No languages or technologies/);
});

test('the map draws a bounded number of stars; the tables keep the rest', async () => {
  const everything = JSON.stringify({ dependencies: Object.fromEntries(['react', 'vue', 'svelte', 'next', 'nuxt', 'astro', 'gatsby', 'jquery', 'vite', 'webpack', 'lucide-react', 'tailwindcss'].map((name) => [name, '1'])) });
  const scan = await scanOf([repo('all')], { files: { 'all/package.json': everything } });
  const model = techStackModel(scan);
  const frontend = model.groups.find((group) => group.id === 'Frontend & build');
  assert.equal(frontend.rows.length, 10);
  assert.equal(frontend.rows.filter((row) => row.onMap).length, 7);
  const styling = model.groups.find((group) => group.id === 'Styling');
  assert.equal(styling.rows.find((row) => row.name === 'lucide').onMap, false, 'supporting libraries stay in the table');
  assert.ok(createTechStackScene(scan, { model }).nodes.length <= 60);
});

test('the standalone page escapes account data and carries no credentials', async () => {
  const hostile = repo('app', { name: 'app', description: '<img src=x onerror=alert(1)>' });
  const scan = await scanOf([hostile]);
  const html = renderTechStackHTML(scan);
  assert.match(html, /Tech stacks across acme/);
  assert.match(html, /Declared, not proven used/);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/Bearer|gh[pousr]_/.test(html));
});

test('the README image is a publishable, self-describing SVG that carries no credentials', async () => {
  const repositories = [repo('a'), repo('b'), repo('c'), repo('d', { description: '<img src=x onerror=alert(1)>' })];
  const scan = await scanOf(repositories);
  const svg = renderTechStackSVG(scan);
  // The same checks the Action applies before it publishes to a README.
  assert.doesNotThrow(() => validatePublicationArtifact(Buffer.from(svg), { format: 'svg', filename: 'tech-stack.svg' }));
  assert.match(svg, /<title id="title">Tech stack across acme<\/title>/);
  assert.match(svg, /<desc id="tech-stack-description">Languages and technologies declared across 4 of 4 public repositories for acme\./);
  assert.match(svg, /Most common: [^<]*React \(4\)/);
  assert.match(svg, /class="tech-stack-caption"[^>]*>4 of 4 public repositories · declared in manifests, not proof of use<\/text>/);
  assert.ok(svg.includes('React') && svg.includes('Express'));
  assert.ok(!/<script|onerror|<img|Bearer|gh[pousr]_/.test(svg));
  assert.equal(renderTechStackSVG(scan), svg, 'the image is reproducible');
  // A scan cut short says so on the image itself.
  const partial = renderTechStackSVG({ ...scan, coverage: { ...scan.coverage, stopped: 'rate-limit' } });
  assert.match(partial, /4 of 4 public repositories \(partial scan\) · declared in manifests/);
  await assert.rejects(async () => renderTechStackSVG(await scanOf([repo('empty', { languages: { edges: [] }, primaryLanguage: null, tree: { entries: [] } })])), /No languages or technologies/);
});

test('the Action and CLI expose the tech stack image without a new secret', async () => {
  const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8');
  assert.match(action, /\n  tech-stack:\n    description: [^\n]+\n    default: 'false'/);
  assert.match(action, /CONSTELLATION_TECH_STACK: \$\{\{ inputs\.tech-stack \}\}/);
  const cli = await readFile(new URL('../src/cli.mjs', import.meta.url), 'utf8');
  assert.match(cli, /process\.env\.CONSTELLATION_TECH_STACK === "true"/);
  assert.match(action, /\n  tech-stack-style:\n    description: [^\n]+\n    default: card/);
  assert.match(action, /CONSTELLATION_TECH_STACK_STYLE: \$\{\{ inputs\.tech-stack-style \}\}/);
  assert.match(action, /CONSTELLATION_TECH_STACK_FEATURED: \$\{\{ inputs\.tech-stack-featured \}\}/);
  // The card is the default image; the map stays available; .md writes the linked list.
  assert.match(cli, /style === "card" \? renderTechStackCardSVG\(scan, \{ featured \}\) : renderTechStackSVG\(scan\)/);
  assert.match(cli, /renderTechStackMarkdown\(scan, \{ featured \}\)/);
  assert.match(cli, /--tech-stack-style must be card or map/);
});

test('the Studio refuses to scan without sign-in, and sends nothing', async () => {
  const requests = [];
  const engine = createEngine({ win: undefined, doc: undefined, fetchImpl: async (url) => { requests.push(url); return new Response('{}'); } });
  assert.equal(engine.signedIn, false);
  await assert.rejects(engine.scanTechStack('acme'), /Sign in with GitHub/);
  assert.deepEqual(requests, []);
});

test('a signed-in scan uses that visitor’s own token, sent only to GitHub', async () => {
  const seen = [];
  const github = fakeGitHub([repo('one')]);
  const fetchImpl = async (url, init = {}) => {
    const authorization = new Headers(init.headers).get('authorization');
    seen.push({ url: String(url), authorization });
    if (String(url).endsWith('/user')) return new Response(JSON.stringify({ login: 'viewer' }));
    const query = JSON.parse(init.body).query;
    if (query.includes('repositoryOwner')) return new Response(JSON.stringify(await github.transport({ kind: 'listing', login: 'acme', size: 2 })));
    if (query.includes('tree:object')) return new Response(JSON.stringify(await github.transport({ kind: 'roots', login: 'acme', items: [{ name: 'one' }] })));
    return new Response(JSON.stringify({ data: { r0: { f0: { text: PACKAGE, byteSize: 10, isBinary: false } } } }));
  };
  const memory = new Map();
  const sessionStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
  const engine = createEngine({ win: { sessionStorage, location: { origin: 'https://example.test', pathname: '/', hostname: 'example.test' } }, doc: undefined, fetchImpl });
  await engine.signIn.withToken('viewer-token');
  const scan = await engine.scanTechStack('acme');
  assert.deepEqual(scan.records[0].dependencies, ['Express', 'MongoDB', 'React', 'Vite']);
  assert.ok(seen.every((entry) => entry.url.startsWith('https://api.github.com/') && entry.authorization === 'Bearer viewer-token'));
  assert.ok(!JSON.stringify(scan).includes('viewer-token'));
  engine.signIn.signOut();
  await assert.rejects(engine.scanTechStack('acme'), /Sign in with GitHub/, 'signing out closes the gate');
});

test('reads GitHub refuses are reported, so gaps never look like "not used"', async () => {
  const github = fakeGitHub([repo('one')]);
  const transport = async (step) => {
    const answer = await github.transport(step);
    if (step.kind !== 'manifests') return answer;
    return { data: { r0: { f0: null } }, errors: [{ type: 'FORBIDDEN', message: 'Resource not accessible by integration' }] };
  };
  const scan = await scanTechStack('acme', { transport });
  assert.equal(scan.coverage.refused, 1);
  assert.deepEqual(scan.records[0].dependencies, []);
  assert.ok(coverageNotes(scan).some((note) => note.includes('GitHub refused 1 read')));
  assert.ok(!coverageNotes(await scanOf([repo('fine')])).some((note) => note.includes('refused')));
});
