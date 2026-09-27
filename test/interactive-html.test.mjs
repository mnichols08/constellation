import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createScene, renderSceneHTML } from '../src/core-api.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/scene-svg-v2.json', import.meta.url)));
const scene = createScene(fixture.account, fixture.repositories, fixture.cases[0].options);

test('HTML export is deterministic and embeds escaped scene data', () => {
  const html = renderSceneHTML(scene, { title: '<safe>' });
  assert.equal(html, renderSceneHTML(scene, { title: '<safe>' }));
  assert.match(html, /<title>&lt;safe&gt;<\/title>/);
  const dangerous = structuredClone(scene);
  dangerous.nodes[0].metadata.description = '</script><script>window.injected=true</script>';
  const output = renderSceneHTML(dangerous);
  assert.ok(!output.includes('<script>window.injected'));
  assert.match(output, /\\u003c\/script\\u003e/);
});

test('standalone file supports selection, keyboard, camera and cleanup', { skip: !browser, timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-html-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'index.html');
  await writeFile(file, renderSceneHTML(scene));
  const { evaluate, waitFor, errors, cdp } = await openBrowser(t, pathToFileURL(file).href);
  await waitFor('Boolean(document.querySelector("main")?.constellation)');
  const base = await evaluate('document.querySelector("main").constellation.camera');
  await evaluate('document.querySelector("[data-action=zoom-in]").click()');
  assert.ok((await evaluate('document.querySelector("main").constellation.camera'))[2] < base[2]);
  await evaluate('document.querySelector(".repository[role=button]").dispatchEvent(new MouseEvent("click", {bubbles:true}))');
  assert.ok(await evaluate('document.querySelector("main").constellation.selection'));
  await evaluate('document.querySelector(".repository[role=button]").focus()');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End' });
  assert.equal(await evaluate('document.activeElement.getAttribute("tabindex")'), '0');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-pressed")'), 'true');
  await evaluate('document.querySelector("[data-action=fit]").click()');
  assert.notDeepEqual(await evaluate('document.querySelector("main").constellation.camera'), base);
  await evaluate('document.querySelector("[data-action=reset]").click()');
  assert.deepEqual(await evaluate('document.querySelector("main").constellation.camera'), base);
  assert.equal(await evaluate('document.querySelector("main").constellation.selection'), null);
  await evaluate('document.querySelector("main").constellation.destroy(); document.querySelector("[data-action=zoom-in]").click()');
  assert.equal(await evaluate('document.querySelector("svg").getAttribute("viewBox")'), base.join(' '));
  assert.deepEqual(errors, []);
});

test('CLI build emits standalone HTML without changing the SVG default', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-html-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const repos = join(dir, 'repos.json'), output = join(dir, 'index.html');
  await writeFile(repos, JSON.stringify(fixture.repositories));
  const run = args => spawnSync(process.execPath, ['src/cli.mjs', 'build', '--username', 'fixture', '--fixture', repos, '--output', output, ...args], { encoding: 'utf8', windowsHide: true, env: { ...process.env, CONSTELLATION_CONFIG: '', CONSTELLATION_CONFIG_JSON: '', GITHUB_OUTPUT: '' } });
  const result = run(['--format', 'html']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, 'utf8'), /^<!doctype html>/);
  assert.equal(run(['--format', 'invalid']).status, 1);
  assert.equal(run([]).status, 0);
  assert.match(await readFile(output, 'utf8'), /<svg/);
  assert.ok(!(await readFile(output, 'utf8')).includes('<!doctype html>'));
});
