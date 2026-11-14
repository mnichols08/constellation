import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';
import { createConstellationEngine, specOptions, specHost } from '../src/constellation-spec.mjs';
import { describeConstellation, createScriptedModel, describePlan } from '../src/ai/index.mjs';
import { registerSpecHost } from '../src/spec-host.mjs';
import { createScene, renderSceneSVG, parseConfig } from '../src/core-api.mjs';
import { runOfflineDemo, demoTurns, demoRecords } from '../examples/ai-offline-demo.mjs';

const deps = { createConstellationEngine, specOptions, describeConstellation, createScriptedModel, describePlan };

test('offline demo runs discovery, rejection, repair and compilation through the real engine without any network', async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('the offline demo must not use the network'); };
  t.after(() => { globalThis.fetch = realFetch; registerSpecHost(null); });
  const demo = await runOfflineDemo(deps);
  assert.equal(demo.ok, true);
  assert.deepEqual([demo.toolCalls, demo.repairs], [3, 1]);
  assert.deepEqual(demo.steps.map((step) => step.kind), ['tool', 'tool', 'tool', 'rejected', 'repair', 'accepted']);
  assert.match(demo.steps[3].text, /invalid_value at layout\.kind/);
  assert.match(demo.steps[3].text, /unknown_field at positions/, 'model-authored coordinates are refused');
  assert.equal(demo.plan.sections[0].text, 'Projects written in Rust sit nearest the centre. 4 projects match.');
  assert.equal(demo.compiled.groups[0].total, 3);
  assert.deepEqual(await runOfflineDemo(deps), demo, 'the demo is reproducible');
  assert.equal(demoTurns.length, 4);

  // The result is an ordinary configuration the public pipeline renders.
  registerSpecHost(specHost);
  const { options } = parseConfig(demo.config, 'ada');
  const scene = createScene(demo.config.account, demo.records, options);
  assert.equal(scene.nodes.length, demoRecords.length);
  const far = (id) => { const node = scene.nodes.find((item) => item.id === id); return Math.hypot(node.geometry.x - 450, node.geometry.y - 270); };
  assert.ok(far('ada/orbit-engine') < far('ada/stargazer') && far('ada/stargazer') < far('ada/tiny-worlds'), 'focus inside, others between, experiments outside');
  assert.match(renderSceneSVG(scene), /<svg/);
});

test('README and docs link to the offline demo', async () => {
  for (const file of ['../README.md', '../docs/README.md', '../examples/README.md', '../docs/ai/AI-ARCHITECTURE.md']) {
    assert.match(await readFile(new URL(file, import.meta.url), 'utf8'), /ai-offline-demo\.html/, file);
  }
});

test('offline demo page renders through <constellation-view> with no external requests', { skip: !browser, timeout: 120000 }, async (t) => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { evaluate, waitFor, errors } = await openBrowser(t, `${origin}/examples/ai-offline-demo.html`);
  // The first poll can run before the document exists.
  await waitFor(`['ready','error'].includes(document.documentElement?.dataset?.demo)`);
  assert.equal(await evaluate(`document.documentElement.dataset.demo`), 'ready', await evaluate(`document.getElementById('status').textContent`));
  assert.equal(await evaluate(`document.querySelector('constellation-view').shadowRoot.querySelectorAll('.star[data-repo]').length`), demoRecords.length);
  assert.equal(await evaluate(`document.querySelectorAll('#steps li').length`), 6);
  assert.equal(await evaluate(`document.querySelector('#steps li[data-kind="rejected"]') !== null && document.querySelector('#plan dt').textContent`), 'At the centre');
  assert.equal(await evaluate(`JSON.parse(document.getElementById('spec').textContent).focus.value`), 'Rust');
  // Every request stayed on the local origin: no model, no API, no CDN.
  const requests = await evaluate(`performance.getEntriesByType('resource').map(entry => entry.name)`);
  assert.ok(requests.length > 5 && requests.every((url) => url.startsWith('${origin}/'.replace('${origin}', origin))), requests.filter((url) => !url.startsWith(origin)).join(', '));
  // Stars sit where the engine put them: a focused Rust project is nearer the centre than an experiment.
  const distance = (id) => `(() => { const s = document.querySelector('constellation-view').shadowRoot.querySelector('.star[data-repo="${id}"]'); const m = /translate\\(([-\\d.]+)[ ,]+([-\\d.]+)\\)/.exec(s.getAttribute('transform') || s.closest('[transform]')?.getAttribute('transform') || ''); const x = m ? +m[1] : +s.getAttribute('cx'), y = m ? +m[2] : +s.getAttribute('cy'); return Math.hypot(x - 450, y - 270); })()`;
  const [inner, outer] = [await evaluate(distance('ada/orbit-engine')), await evaluate(distance('ada/tiny-worlds'))];
  assert.ok(Number.isFinite(inner) && Number.isFinite(outer) && inner < outer, `inner ${inner}, outer ${outer}`);
  assert.deepEqual(errors, []);
});
