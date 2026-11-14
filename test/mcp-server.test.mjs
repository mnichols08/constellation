import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../mcp/server.mjs';
import { createConstellationTools } from '../mcp/tools.mjs';
import { demoRecords } from '../examples/ai-offline-demo.mjs';

const serverPath = fileURLToPath(new URL('../mcp/server.mjs', import.meta.url));

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-mcp-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = join(dir, 'repositories.json');
  await writeFile(fixture, JSON.stringify(demoRecords));
  const cwd = join(dir, 'work');
  return { dir, cwd, env: { CONSTELLATION_MCP_FIXTURE: fixture } };
}
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
const payload = (response) => JSON.parse(response.result.content[0].text);

test('the protocol: initialize, list, ping, and errors a client can act on', async (t) => {
  const server = createServer(await workspace(t));
  t.after(() => server.close());
  const hello = await server.handle(rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }));
  assert.equal(hello.result.protocolVersion, '2025-06-18');
  assert.equal(hello.result.serverInfo.name, 'constellation');
  assert.deepEqual(hello.result.capabilities, { tools: { listChanged: false } });
  assert.match(hello.result.instructions, /does not assess a person/);
  assert.equal((await server.handle(rpc(2, 'initialize', { protocolVersion: '1999-01-01' }))).result.protocolVersion, '2025-06-18');
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await server.handle({ jsonrpc: '2.0', id: 9, result: {} }), null);
  assert.deepEqual((await server.handle(rpc(3, 'ping'))).result, {});

  const { tools } = (await server.handle(rpc(4, 'tools/list'))).result;
  assert.deepEqual(tools.map((tool) => tool.name), ['load_account', 'portfolio_overview', 'list_languages', 'list_topics', 'find_repositories', 'describe_repository', 'preview_group', 'validate_spec', 'compile_spec', 'suggest_sky', 'describe_plan', 'render_sky', 'readme_workflow']);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object', tool.name);
    assert.ok(tool.description.length > 20 && !('input_schema' in tool), tool.name);
  }
  assert.equal((await server.handle(rpc(5, 'resources/list'))).error.code, -32601);
  assert.equal((await server.handle(rpc(6, 'tools/call', { name: 'run_shell', arguments: {} }))).error.code, -32602);
  assert.equal((await server.handle(rpc(7, 'tools/call', {}))).error.code, -32602);
  assert.equal((await server.handle({ id: 8, method: 'ping' })).error.code, -32600);
  assert.equal((await server.handle([])).error.code, -32600);
  // A tool used too early is a result the assistant can read, not a protocol failure.
  const early = await server.handle(rpc(10, 'tools/call', { name: 'list_topics', arguments: {} }));
  assert.equal(early.result.isError, true);
  assert.match(payload(early).message, /Call load_account first/);
});

test('an assistant can go from an account to a checked plan, an image and a README workflow', async (t) => {
  const host = await workspace(t);
  const server = createServer(host);
  t.after(() => server.close());
  const call = async (name, args = {}) => { const response = await server.handle(rpc(1, 'tools/call', { name, arguments: args })); return { ...payload(response), isError: response.result.isError }; };

  const loaded = await call('load_account', { account: 'https://github.com/ada', roles: { 'orbit-engine': 'featured', 'ada/lightbeam': 'featured', moonrise: 'historical' } });
  assert.equal(loaded.isError, false);
  assert.deepEqual([loaded.account, loaded.repositories], ['ada', 14]);
  assert.equal(loaded.overview.roles[0].repositories, 2);
  assert.equal(loaded.overview.roles_source, 'declared');

  // The engine's own tools answer from the loaded repositories.
  assert.equal((await call('list_languages')).languages[0].name, 'Rust');
  assert.equal((await call('preview_group', { group: { label: 'Rust', match: { language: 'Rust' } } })).total, 4);
  const invalid = await call('validate_spec', { spec: { schema_version: 1, layout: { kind: 'spiral' } } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.diagnostics[0].path, 'layout.kind');

  const suggestion = await call('suggest_sky');
  assert.equal(suggestion.ok, true);
  assert.deepEqual(suggestion.spec.focus, { kind: 'role', value: 'featured' });
  assert.equal(suggestion.plan.sections[0].label, 'At the centre');
  assert.deepEqual(await call('suggest_sky'), suggestion, 'the same account gets the same suggestion');

  const spec = { schema_version: 1, focus: { kind: 'language', value: 'Rust' }, groups: [{ label: 'Archive', match: { archived: true }, placement: 'outer' }], layout: { kind: 'radial', cluster_by: ['topic'] } };
  const plan = await call('describe_plan', { spec });
  assert.match(JSON.stringify(plan.plan), /orbit-engine/);
  const refused = await call('describe_plan', { spec: { schema_version: 1, focus: { kind: 'language', value: 5 } } });
  assert.equal(refused.ok, false);
  assert.ok(refused.diagnostics.length && refused.hint);

  const drawn = await call('render_sky', { spec, output: 'art/sky.svg' });
  assert.equal(drawn.ok, true);
  assert.equal(drawn.saved, 'art/sky.svg');
  const svg = await readFile(join(host.cwd, 'art', 'sky.svg'), 'utf8');
  assert.equal(Buffer.byteLength(svg), drawn.bytes);
  assert.match(svg, /^<svg[\s\S]*orbit-engine[\s\S]*<\/svg>\s*$/);
  assert.ok(!/<script|javascript:/i.test(svg));
  assert.notEqual((await call('render_sky', { spec, shape: 'compact', output: 'compact.svg' })).bytes, 0);

  const published = await call('readme_workflow', { spec });
  assert.equal(published.workflow_path, '.github/workflows/constellation.yml');
  assert.match(published.workflow, /uses: mnichols08\/constellation@v5/);
  assert.match(published.workflow, /"constellationSpec"/);
  assert.match(published.workflow, /"value": "Rust"/);
  assert.match(published.readme_snippet, /raw\.githubusercontent\.com\/ada\/ada\/output\/constellation\.svg/);
  assert.equal(published.steps.length, 3);
  assert.deepEqual((await readdir(host.cwd)).sort(), ['art', 'compact.svg'], 'readme_workflow writes nothing');
});

test('it cannot write outside its folder, and bad input is explained without internals', async (t) => {
  const host = await workspace(t);
  const tools = createConstellationTools(host);
  t.after(() => tools.close());
  await tools.call('load_account', { account: 'ada' });
  const spec = { schema_version: 1 };
  for (const output of ['../escape.svg', '/tmp/absolute.svg', 'notes.txt', 'a/../../b.svg', 'x.svg\0', '.']) {
    const result = await tools.call('render_sky', { spec, output });
    assert.equal(result.ok, false, output);
    assert.match(result.value.message, /output must/);
  }
  assert.deepEqual(await readdir(host.dir), ['repositories.json'], 'nothing was written anywhere');
  for (const [name, args, pattern] of [
    ['load_account', { account: 'not a name!' }, /./],
    ['load_account', { account: 'ada', roles: { nowhere: 'featured' } }, /no public repository named nowhere/],
    ['load_account', { account: 'ada', roles: { moonrise: 'best' } }, /must be one of/],
    ['render_sky', {}, /spec must be/],
    ['readme_workflow', { spec, repository: 'bad name' }, /repository must be/],
    ['readme_workflow', { spec, filename: 'x.png' }, /\.svg/],
    ['list_topics', 'nope', /JSON object/],
    ['nothing', {}, /Unknown tool/],
  ]) {
    const result = await tools.call(name, args);
    assert.equal(result.ok, false, name);
    assert.match(result.value.message, pattern);
    assert.ok(!/\bat \w+ \(|node:|\.mjs:\d/.test(result.value.message), 'no stack traces');
  }
  // A failed reload keeps the account that was already loaded.
  assert.equal((await tools.call('list_languages', {})).ok, true);
});

test('loading from GitHub uses the token from the environment and never echoes it', async () => {
  const token = 'ghp_secretsecretsecretsecretsecret1234';
  const seen = [];
  const page = (records) => new Response(JSON.stringify(records), { status: 200, headers: { 'content-type': 'application/json' } });
  const tools = createConstellationTools({ env: { GITHUB_TOKEN: token }, cwd: tmpdir(), fetchImpl: async (url, init) => { seen.push({ url: String(url), auth: init.headers.Authorization }); return page(seen.length === 1 ? demoRecords : []); } });
  const loaded = await tools.call('load_account', { account: 'ada' });
  assert.equal(loaded.ok, true);
  assert.match(seen[0].url, /^https:\/\/api\.github\.com\/users\/ada\/repos/);
  assert.equal(seen[0].auth, `Bearer ${token}`);
  assert.ok(!JSON.stringify(loaded).includes(token));
  tools.close();
  const failing = createConstellationTools({ env: {}, cwd: tmpdir(), fetchImpl: async () => new Response('{"message":"API rate limit exceeded"}', { status: 403 }) });
  const refused = await failing.call('load_account', { account: 'ada' });
  assert.equal(refused.ok, false);
  assert.match(refused.value.message, /GitHub could not load @ada.*Set GITHUB_TOKEN/s);
});

test('over real stdio: one JSON message per line, nothing else on stdout, clean exit', async (t) => {
  const host = await workspace(t);
  await writeFile(join(host.dir, 'keep'), '');
  const child = spawn(process.execPath, [serverPath], { cwd: host.dir, env: { ...process.env, ...host.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  const exited = new Promise((resolve) => child.on('close', resolve));
  for (const message of [
    rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } }),
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    rpc(2, 'tools/call', { name: 'load_account', arguments: { account: 'ada' } }),
    rpc(3, 'tools/call', { name: 'suggest_sky', arguments: {} }),
  ]) child.stdin.write(`${JSON.stringify(message)}\n`);
  child.stdin.write('this is not json\n\n');
  child.stdin.end();
  assert.equal(await exited, 0, err);
  const lines = out.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.id), [1, 2, 3, null]);
  assert.equal(lines[0].result.protocolVersion, '2025-03-26');
  assert.equal(payload(lines[1]).repositories, 14);
  assert.equal(payload(lines[2]).ok, true);
  assert.equal(lines[3].error.code, -32700);
  assert.equal(err, '');
});

test('the server has no dependencies and no way to run commands or reach a model', async () => {
  for (const file of ['server.mjs', 'tools.mjs']) {
    const source = await readFile(new URL(`../mcp/${file}`, import.meta.url), 'utf8');
    for (const [, specifier] of source.matchAll(/from\s+'([^']+)'/g)) assert.ok(specifier.startsWith('node:') || specifier.startsWith('.'), `${file} imports ${specifier}`);
    assert.ok(!/child_process|\beval\s*\(|new Function|anthropic|openai|api[_-]?key/i.test(source), `${file} stays local`);
  }
});
