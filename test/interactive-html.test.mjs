import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createScene, renderSceneHTML } from '../src/core-api.mjs';
import { htmlBundleStatistics } from '../src/renderer-html.mjs';
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
  assert.match(output, /Content-Security-Policy/);
  const size = htmlBundleStatistics(scene);
  assert.ok(size.runtimeBytes < 1024 * 1024);
  assert.ok(size.wasmBytes > 100000);
  for (const mutate of [
    value => { value.presentation.options.colors = { star: '</style><script>alert(1)</script>' }; },
    value => { value.presentation.nodeMode = '<script>alert(1)</script>'; },
    value => { value.viewport.viewBox[3] = 1000000; },
  ]) { const invalid = structuredClone(scene); mutate(invalid); assert.throws(() => renderSceneHTML(invalid)); }
});

test('standalone file supports selection, keyboard, camera and cleanup', { skip: !browser, timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-html-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'index.html');
  const linked = structuredClone(scene);
  linked.nodes[0].metadata.html_url = 'https://example.com/project';
  linked.nodes[1].metadata.html_url = 'javascript:window.injected=true';
  linked.nodes[1].metadata.description = '<img src=x onerror=window.injected=true>';
  await writeFile(file, renderSceneHTML(linked));
  const { evaluate, waitFor, errors, cdp } = await openBrowser(t, pathToFileURL(file).href);
  await waitFor('Boolean(document.querySelector("main")?.constellation)');
  await evaluate(`document.querySelector('main').setAttribute('onclick', 'window.injected=true'); document.querySelector('main').click()`);
  assert.equal(await evaluate('Boolean(window.injected)'), false, 'CSP blocks injected handlers');
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
  await evaluate(`document.querySelector('main').constellation.selectNode(${JSON.stringify(scene.nodes[0].id)}, {focus:false})`);
  assert.equal(await evaluate('document.querySelector("[data-details] a").getAttribute("rel")'), 'noopener noreferrer');
  await evaluate(`document.querySelector('main').constellation.selectNode(${JSON.stringify(scene.nodes[1].id)}, {focus:false})`);
  assert.equal(await evaluate('document.querySelector("[data-details] a")'), null);
  assert.equal(await evaluate('document.querySelector("[data-details] img")'), null);
  const edge = scene.edges[0];
  await evaluate(`document.querySelector('main').constellation.selectNode(${JSON.stringify(edge.from)}, {focus:false}); document.querySelector('main').constellation.selectNode(${JSON.stringify(edge.to)}, {focus:false,extend:true})`);
  assert.deepEqual((await evaluate('document.querySelector("main").constellation.selectionState')).path, [edge.from, edge.to]);
  assert.ok(await evaluate('document.querySelector("svg").hasAttribute("data-interactive-selection")'));
  assert.ok(await evaluate('document.querySelector(".shared-language[data-related]") !== null'));
  await evaluate('document.querySelector("main").constellation.setFilter({query:"no-match-fixture"})');
  assert.equal(await evaluate('document.querySelector("main").constellation.selection'), null);
  assert.equal(await evaluate('document.querySelectorAll(".repository[role=button]:not([data-filtered])").length'), 0);
  await evaluate('document.querySelector("main").constellation.setFilter({})');
  assert.ok(await evaluate('document.querySelectorAll(".repository[role=button]:not([data-filtered])").length > 0'));
  await evaluate('document.querySelector("main").constellation.setTheme("light")');
  assert.equal(await evaluate('document.querySelector("svg").style.getPropertyValue("--sky-foreground")'), '#202516');
  await evaluate('document.querySelector("main").constellation.setTheme("original")');
  assert.equal(await evaluate('document.querySelector("svg").style.getPropertyValue("--sky-foreground")'), '');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waitFor('document.querySelector("main").hasAttribute("data-reduced-motion")');
  assert.equal(await evaluate('document.querySelector("svg").animationsPaused()'), true);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 700, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluate('document.querySelector("[data-canvas]").getBoundingClientRect().width <= 375'));
  await evaluate('document.querySelector("main").constellation.reset()');
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
