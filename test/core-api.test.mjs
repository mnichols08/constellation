import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderConstellation, validateConfig, explainFilters } from '../packages/core/src/core-api.mjs';

const repos = [{ name: 'a', full_name: 'tester/a', language: 'Rust' }, { name: 'b', full_name: 'tester/b', language: 'JavaScript' }];

test('core imports and renders outside the repository with bundled WASM', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-core-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(new URL('../packages/core', import.meta.url), dir, { recursive: true });
  const core = await import(pathToFileURL(join(dir, 'src/core-api.mjs')));
  assert.equal(core.rustAvailable, true, core.engineError?.message);
  assert.equal(core.renderConstellation('tester', repos, { animate: false }), renderConstellation('tester', repos, { animate: false }));
  assert.equal(core.validateConfig({ maxRepos: 0 }).valid, false);
  assert.deepEqual(core.explainFilters(repos, { languages: ['Rust'] }), explainFilters(repos, { languages: ['Rust'] }));
});

test('validation reports unknown fields and malformed JSON without throwing', () => {
  assert.equal(validateConfig('{').valid, false);
  assert.equal(validateConfig({ maxRepo: 20 }).errors[0].path, 'maxRepo');
  assert.equal(validateConfig({ layoutRefinement: { intensity: 12 } }).valid, false);
  assert.equal(validateConfig({ maxRepos: 100 }).valid, true);
});

test('CLI validate is offline and dry-run explanations leave output files untouched', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = join(dir, 'config.json'), fixture = join(dir, 'repos.json'), output = join(dir, 'absent.svg');
  await writeFile(config, JSON.stringify({ languages: ['Rust'] }));
  await writeFile(fixture, JSON.stringify(repos));
  const env = { ...process.env, CONSTELLATION_CONFIG: '', CONSTELLATION_CONFIG_JSON: '', GITHUB_OUTPUT: join(dir, 'action-output') };
  const run = args => spawnSync(process.execPath, ['src/cli.mjs', ...args], { encoding: 'utf8', env, windowsHide: true });
  const valid = run(['validate', '--config', config]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { valid: true, errors: [] });
  const dry = run(['--username', 'tester', '--fixture', fixture, '--config', config, '--output', output, '--dry-run', '--explain']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(JSON.parse(dry.stdout), explainFilters(repos, { languages: ['Rust'] }));
  await assert.rejects(access(output)); await assert.rejects(access(env.GITHUB_OUTPUT));
  await writeFile(config, '{"maxRepos":0}');
  const invalid = run(['validate', '--config', config]);
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /maxRepos/);
});
