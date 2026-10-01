import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene, renderConstellation } from '../src/constellation.mjs';
import { loadAccountAvatar } from '../src/account-sun.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';
import { renderWorkflow } from '../src/export.mjs';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const repos = Array.from({ length: 10 }, (_, i) => ({ name: `r${i}`, full_name: `example/r${i}`, language: 'JavaScript' }));

test('account sun is decoration and never takes a node or reserved ring point', () => {
  for (const layout of ['atlas', 'compact']) {
    const options = { arrangement: 'rings', layout, hiddenNodes: ['example/r1'], ringRotations: [45, 90, 135, 180] };
    const base = createScene('example', repos, options);
    assert.doesNotMatch(renderConstellation('example', repos, options), /class="account-sun"/);
    for (const accountSun of ['sun', 'avatar']) {
      const settings = { ...options, accountSun, accountData: { avatarData: `data:image/png;base64,${png}` } };
      const scene = createScene('example', repos, settings);
      assert.deepEqual(scene.nodes, base.nodes);
      assert.deepEqual(scene.geometry.ringPoints, base.geometry.ringPoints);
      const svg = renderConstellation('example', repos, settings);
      assert.match(svg, new RegExp(`class="account-sun" data-mode="${accountSun}" transform="translate\\(450 ${layout === 'compact' ? 126 : 270}\\)"`));
      assert.match(svg, />@example<\/text>/);
      assert.equal(svg.includes('class="account-sun-avatar"'), accountSun === 'avatar');
    }
  }
});

test('sun choice survives configs, share links and workflow exports; avatar bytes stay out of config', () => {
  for (const accountSun of ['off', 'sun', 'avatar']) {
    const options = { accountSun, accountData: { avatarData: `data:image/png;base64,${png}` } };
    const json = serializeConfig('example', options);
    assert.equal(parseConfig(json).options.accountSun, accountSun);
    assert.doesNotMatch(json, /avatarData/);
    assert.equal(decodeShare(encodeShare('https://example.com/', 'example', options)).options.accountSun, accountSun);
    const workflow = renderWorkflow('example', options);
    assert.match(workflow, new RegExp(`"accountSun": "${accountSun}"`));
    assert.doesNotMatch(workflow, /avatarData/);
  }
  assert.throws(() => parseConfig({ accountSun: 'unknown' }), /accountSun/);
  assert.throws(() => createScene('example', repos, { accountSun: true }), /accountSun/);
});

test('avatars load once from the image CDN without credentials and fail to initials safely', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, 'https://avatars.githubusercontent.com/sun-test?s=96');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers, undefined);
    return new Response(Buffer.from(png, 'base64'), { headers: { 'content-type': 'image/png' } });
  };
  assert.equal(await loadAccountAvatar('Sun-test', { fetcher }), `data:image/png;base64,${png}`);
  await loadAccountAvatar('sun-test', { fetcher });
  assert.equal(calls, 1);
  assert.equal(await loadAccountAvatar('sun-failure', { fetcher: async () => { throw Error('offline'); } }), null);
  assert.equal(await loadAccountAvatar('sun-invalid', { fetcher: async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }) }), null);
  for (const avatarData of [undefined, 'https://example.com/avatar.png', 'data:image/svg+xml;base64,PHN2Zy8+']) {
    const svg = renderConstellation('example', repos, { accountSun: 'avatar', accountData: { avatarData } });
    assert.match(svg, /class="account-sun-initials"/);
    assert.doesNotMatch(svg, /class="account-sun-avatar"/);
  }
});

test('Studio offers both account sun styles without moving the animated ring nodes', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
  await evaluate(`document.querySelector('#open-studio').click();document.querySelector('#arrangement').value='rings';document.querySelector('#arrangement').dispatchEvent(new Event('input'));document.querySelector('#animate-rings').checked=true;document.querySelector('#animate-rings').dispatchEvent(new Event('input'))`);
  const before = await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length`);
  for (const mode of ['sun', 'avatar', 'off']) {
    await evaluate(`{const select=document.querySelector('#design-accountSun');select.value=${JSON.stringify(mode)};select.dispatchEvent(new Event('input'));}`);
    const state = await evaluate(`(async()=>{
      const root=document.querySelector('#preview').firstChild.shadowRoot, svg=root.querySelector('svg');
      svg.pauseAnimations();svg.setCurrentTime(7);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const screen=e=>new DOMPoint(e.cx.animVal.value,e.cy.animVal.value).matrixTransform(e.getScreenCTM());
      const sun=root.querySelector('.account-sun');
      return {mode:sun?.dataset.mode || 'off', sunInCamera:!!sun?.closest('.perspective-scene'),
        nodes:root.querySelectorAll('.star').length, points:root.querySelectorAll('.identity-point').length,
        initials:!!root.querySelector('.account-sun-initials'), workflow:document.querySelector('#workflow').value,
        distances:[...root.querySelectorAll('.identity-point')].map(p=>{
          const n=[...root.querySelectorAll('.star')].find(n=>n.dataset.repo===p.dataset.node);
          const a=screen(n),b=screen(p);return Math.hypot(a.x-b.x,a.y-b.y);
        })};
    })()`);
    assert.equal(state.mode, mode);
    assert.equal(state.nodes, before); assert.equal(state.points, before);
    assert.ok(Math.max(...state.distances) < .2);
    assert.equal(state.sunInCamera, mode !== 'off');
    assert.equal(state.initials, mode === 'avatar');
    assert.match(state.workflow, new RegExp(`"accountSun": "${mode}"`));
  }
  assert.deepEqual(errors, []);
});
