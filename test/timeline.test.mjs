import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, serializeScene, parseScene, renderSceneSVG, renderSceneHTML, temporalMetadata } from '../src/core-api.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

const records = [{ name: 'compiler', full_name: 'demo/compiler', created_at: '2020-01-01', updated_at: '2026-01-01', language: 'Rust', stargazers_count: 100 }, { name: 'runtime', full_name: 'demo/runtime', created_at: '2024-01-01', language: 'Rust', stargazers_count: 20 }];
const referenceDate = '2026-09-01T00:00:00.000Z';
const options = { referenceDate, animate: false };

test('timeline distinguishes current metadata from supplied historical snapshots', () => {
  const timeline = createTimeline('demo', records, options, { dates: ['2021-01-01'] });
  assert.equal(timeline.timeline.frames[0].evidence, 'current-metadata');
  assert.equal(timeline.timeline.frames[0].scene.nodes.length, 1);
  assert.equal(timeline.timeline.frames[0].scene.nodes[0].metadata.stargazers_count, 100);
  assert.equal(timeline.timeline.frames[0].scene.nodes[0].metadata.updated_at, undefined);
  assert.equal(temporalMetadata(records)[0].created, '2020-01-01T00:00:00.000Z');
  const snapshot = createTimeline('demo', records, options, { snapshots: [{ date: '2021-01-01', records: [{ ...records[0], stargazers_count: 3 }] }] });
  assert.equal(snapshot.timeline.frames[0].evidence, 'snapshot');
  assert.equal(snapshot.timeline.frames[0].scene.nodes[0].metadata.stargazers_count, 3);
  assert.equal(serializeScene(parseScene(serializeScene(snapshot))), serializeScene(snapshot));
  assert.equal(renderSceneSVG(snapshot), renderSceneSVG(snapshot.timeline.frames.at(-1).scene));
  assert.equal(renderSceneHTML(snapshot), renderSceneHTML(snapshot));
  assert.throws(() => createTimeline('demo', records, options, { dates: ['2021-01-01', '2021-01-01'] }), /unique/);
  assert.throws(() => createTimeline('demo', records, options, { dates: ['2030-01-01'] }), /reference/);
  assert.throws(() => createTimeline('demo', records), /dates/);
});

test('offline timeline controls render supplied frames with evidence labels', { skip: !browser, timeout: 30000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-timeline-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'index.html');
  await writeFile(file, renderSceneHTML(createTimeline('demo', records, options, { snapshots: [{ date: '2021-01-01', records: [records[0]] }] })));
  const { evaluate, waitFor, errors, cdp } = await openBrowser(t, pathToFileURL(file).href);
  await waitFor(`Boolean(document.querySelector('main')?.constellation)`);
  assert.equal(await evaluate(`document.querySelectorAll('.star').length`), 2);
  await evaluate(`window.sharedNode = document.querySelector('[data-repo="demo/compiler"]').closest('.repository'); document.querySelector('main').constellation.selectNode('demo/compiler',{focus:false}); document.querySelector('main').constellation.setTheme('light'); document.querySelector('main').constellation.setFrame(0)`);
  assert.equal(await evaluate(`sharedNode === document.querySelector('[data-repo="demo/compiler"]').closest('.repository')`), true);
  assert.equal(await evaluate(`document.querySelector('main').constellation.selection`), 'demo/compiler');
  assert.equal(await evaluate(`document.querySelector('main').constellation.theme`), 'light');
  assert.equal(await evaluate(`document.querySelectorAll('.star').length`), 1);
  assert.match(await evaluate(`document.querySelector('[aria-label=Timeline]').textContent`), /Historical snapshot/);
  await evaluate(`document.querySelector('main').constellation.setFrame(1)`);
  assert.equal(await evaluate(`document.querySelectorAll('.star').length`), 2);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await waitFor(`document.querySelector('main').hasAttribute('data-reduced-motion')`);
  await evaluate(`document.querySelector('main').constellation.setFrame(0)`);
  assert.equal(await evaluate(`document.querySelectorAll('.departing-node').length`), 0);
  assert.equal(await evaluate(`document.querySelector('.repository').getAnimations().length`), 0);
  assert.deepEqual(errors, []);
});
