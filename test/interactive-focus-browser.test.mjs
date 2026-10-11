import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createScene, renderSceneHTML, renderSceneSVG, serializeScene } from '../src/core-api.mjs';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/scene-svg-v2.json', import.meta.url), 'utf8'));
const repositories = structuredClone(fixture.repositories);
repositories[1].topics = ['tools'];
repositories[3].topics = ['data'];
repositories[0].html_url = 'https://github.com/fixture/project-0';
repositories[0].description = 'First project';
const options = {
  ...fixture.cases[0].options,
  projectFamilies: { art: { label: 'Art lab', members: ['fixture/project-0', 'fixture/project-2'] } },
  projectRelationships: [['fixture/project-0', 'fixture/project-1']],
};
const scene = createScene(fixture.account, repositories, options);
const key = async (cdp, name, code = { Enter: 13, Escape: 27 }[name]) => {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, ...(name === 'Enter' ? { text: '\r' } : {}) });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
};

async function exportFile(t, value = scene) {
  const dir = await mkdtemp(join(tmpdir(), 'constellation-focus-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'index.html');
  await writeFile(file, renderSceneHTML(value));
  return pathToFileURL(file).href;
}

test('static SVG stays script-free and unaffected by interactive focus', () => {
  const before = serializeScene(scene);
  const svg = renderSceneSVG(scene);
  assert.doesNotMatch(svg, /<script|data-focus|focus-navigation/);
  renderSceneHTML(scene);
  assert.equal(renderSceneSVG(scene), svg, 'HTML export does not change static SVG output');
  assert.equal(serializeScene(scene), before, 'focus data is derived without mutating the scene');
  const html = renderSceneHTML(scene);
  const graph = JSON.parse(html.match(/<script type="application\/json" id="constellation-navigation">([^<]*)<\/script>/)[1]);
  assert.equal(graph.version, 1);
  assert.ok(graph.nodes.every(node => !node.properties?.description && !node.properties?.url), 'the embedded graph carries identities, not payloads');
});

test('project and relationship focus explain evidence and return to the overview', { skip: !browser, timeout: 120000 }, async t => {
  const { evaluate, waitFor, errors, cdp } = await openBrowser(t, await exportFile(t));
  await waitFor('Boolean(document.querySelector("main")?.constellation)');
  const project = id => `[...document.querySelectorAll('.repository')].find(group => group.querySelector('.star')?.dataset.repo === ${JSON.stringify(id)})`;
  await evaluate(`${project('fixture/project-0')}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  assert.equal(await evaluate('document.querySelector("main").dataset.focus'), 'project');
  assert.deepEqual(await evaluate('document.querySelector("main").constellation.focusState'), {
    mode: 'project', project: 'fixture/project-0', related: null, connections: ['fixture/project-2', 'fixture/project-1'],
  });
  // Unrelated projects are dimmed, never removed; arrangement does not change.
  assert.equal(await evaluate(`${project('fixture/project-3')}.hasAttribute('data-related')`), false);
  assert.equal(await evaluate(`getComputedStyle(${project('fixture/project-3')}).display`), 'inline');
  assert.ok(await evaluate(`Number(getComputedStyle(${project('fixture/project-3')}).opacity) < 0.5`));
  assert.equal(await evaluate(`${project('fixture/project-2')}.hasAttribute('data-related')`), true);
  // A drawn edge with no supporting evidence is not emphasized.
  assert.equal(await evaluate(`[...document.querySelectorAll('.shared-language[data-related]')].some(edge => [edge.dataset.from, edge.dataset.to].includes('fixture/project-3'))`), false);
  assert.match(await evaluate('document.querySelector("[data-status]").textContent'), /one\. 2 evidence-backed connections\. Press Escape/);
  const buttons = await evaluate('[...document.querySelectorAll("[data-focus-relationship]")].map(button => [button.dataset.focusRelationship, button.textContent, button.getBoundingClientRect().height])');
  assert.deepEqual(buttons.map(item => item[0]), ['fixture/project-2', 'fixture/project-1']);
  assert.equal(buttons[0][1], 'three — family Art lab · Rust · #art #stars');
  assert.equal(buttons[1][1], 'two — linked by author');
  assert.equal(await evaluate('document.querySelector("[data-details] a")?.href'), 'https://github.com/fixture/project-0');

  // Relationship focus by keyboard; focus moves to the explanation.
  await evaluate('document.querySelector("[data-focus-relationship]").click()');
  assert.equal(await evaluate('document.querySelector("main").dataset.focus'), 'relationship');
  assert.equal(await evaluate('document.querySelector("[data-focus-heading]").textContent'), 'one ↔ three');
  const reasons = await evaluate('[...document.querySelectorAll(".focus-reasons li")].map(item => item.textContent)');
  assert.deepEqual(reasons, [
    'Same project family, defined by the author: Art lab · author-defined',
    'Shared primary language: Rust · repository metadata',
    'Shared repository topics: art, stars · repository metadata',
  ]);
  assert.match(await evaluate('document.querySelector(".focus-note").textContent'), /not verified dependencies/);
  assert.match(await evaluate('document.querySelector("[data-status]").textContent'), /^one and three: Same project family/);
  const emphasized = await evaluate('[...document.querySelectorAll(".shared-language[data-related]")].map(edge => [edge.dataset.from, edge.dataset.to].sort().join(" "))');
  assert.ok(emphasized.length > 0 && emphasized.every(pair => pair === 'fixture/project-0 fixture/project-2'));
  assert.equal(await evaluate(`${project('fixture/project-1')}.hasAttribute('data-related')`), false, 'relationship focus narrows emphasis to one pair');

  // Back to overview returns to the complete constellation.
  await evaluate('document.querySelector("[data-focus-project]").click()');
  assert.equal(await evaluate('document.querySelector("main").dataset.focus'), 'project');
  await evaluate('document.querySelector("[data-focus-overview]").click()');
  assert.equal(await evaluate('document.querySelector("main").dataset.focus'), 'overview');
  assert.equal(await evaluate('document.querySelector("svg").hasAttribute("data-interactive-selection")'), false);

  // Second degree is loaded on demand and lists only bounded, evidence-backed paths.
  await evaluate(`${project('fixture/project-1')}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await evaluate('document.querySelector("[data-second-degree] summary").click()');
  await waitFor('document.querySelectorAll("[data-second-degree] li").length > 0');
  assert.equal(await evaluate('document.querySelector("[data-second-degree] li").textContent'), 'three — via one');
  await evaluate('document.querySelector("[data-second-degree] button").click()');
  assert.equal(await evaluate('document.querySelector("main").constellation.focusState.project'), 'fixture/project-2');
  assert.deepEqual(errors, []);
});

test('<constellation-view> exposes focus and events', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { evaluate, waitFor, errors, cdp } = await openBrowser(t, `${origin}/examples/web-component.html`);
  await waitFor('Boolean(document.querySelector("#view")?.shadowRoot?.querySelector("main")?.constellation)');
  const setup = `(async () => {
    const view = document.createElement('constellation-view');
    view.id = 'focused';
    window.focusEvents = [];
    view.addEventListener('focus-change', event => window.focusEvents.push(event.detail));
    view.records = ['compiler', 'runtime', 'studio', 'notes'].map((name, i) => ({ name, full_name: 'example/' + name, language: ['Rust', 'Rust', 'TypeScript', 'Go'][i], topics: i < 3 ? ['wasm'] : [], html_url: 'https://github.com/example/' + name }));
    document.body.append(view);
    await view.setConfig({ version: 7, account: 'example', options: { referenceDate: '2026-09-01T00:00:00Z', projectFamilies: { tools: { label: 'Tools', members: ['example/compiler', 'example/runtime'] } }, projectRelationships: [['example/studio', 'example/notes']] } });
    return true;
  })()`;
  await evaluate(setup);
  await waitFor('Boolean(document.querySelector("#focused").shadowRoot.querySelector("main")?.constellation)');
  assert.deepEqual(await evaluate('document.querySelector("#focused").focusState'), { mode: 'overview', project: null, related: null, connections: [] });
  await evaluate('document.querySelector("#focused").focusProject("example/compiler")');
  const state = await evaluate('document.querySelector("#focused").focusState');
  assert.equal(state.mode, 'project');
  assert.deepEqual(state.connections, ['example/runtime', 'example/studio']);
  await evaluate('document.querySelector("#focused").focusRelationship("example/compiler", "example/runtime")');
  assert.match(await evaluate('document.querySelector("#focused").shadowRoot.querySelector(".focus-reasons").textContent'), /Same project family, defined by the author: Tools/);
  assert.match(await evaluate(`(() => { try { document.querySelector('#focused').focusRelationship('example/compiler', 'example/notes'); return 'no error'; } catch (error) { return error.message; } })()`), /No evidence-backed relationship/);
  assert.deepEqual(await evaluate('window.focusEvents.map(event => [event.mode, event.projectId, event.relatedId, event.source])'), [
    ['project', 'example/compiler', null, 'api'],
    ['relationship', 'example/compiler', 'example/runtime', 'api'],
  ]);
  // The view's own selection API and events remain compatible.
  await evaluate('document.querySelector("#focused").selectNode("example/studio", { focus: false })');
  assert.equal(await evaluate('document.querySelector("#focused").selection.start'), 'example/studio');
  assert.deepEqual(await evaluate('document.querySelector("#focused").focusState.connections'), ['example/compiler', 'example/notes', 'example/runtime']);
  await evaluate('document.querySelector("#focused").returnToOverview()');
  assert.equal(await evaluate('document.querySelector("#focused").focusState.mode'), 'overview');
  assert.deepEqual(errors, []);
});
