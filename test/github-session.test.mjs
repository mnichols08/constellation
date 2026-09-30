import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGitHubSession } from '../src/github-session.mjs';
import { createPreviewFetch, createPinnedFetch } from '../src/preview-data.mjs';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

test('session validates identity, confines credentials to GitHub and clears rejected credentials', async () => {
  const calls = [], changes = []; let reject = false;
  const session = createGitHubSession({ onChange: value => changes.push(value), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ login: 'alice' }, { status: reject ? 401 : 200 });
  } });
  assert.deepEqual(await session.signIn('  test-token  '), { login: 'alice' });
  const preview = createPreviewFetch({ proxyBase: '/api/github', session });
  await preview('https://api.github.com/users/alice');
  assert.equal(calls.at(-1).options.headers.get('Authorization'), 'Bearer test-token');
  assert.equal(calls.at(-1).options.redirect, 'error');
  await session.fetch('https://example.com/data', { headers: { Authorization: 'Bearer test-token' } });
  assert.equal(calls.at(-1).options.headers.get('Authorization'), null);
  reject = true;
  await session.fetch('https://api.github.com/user');
  assert.equal(session.token, ''); assert.equal(session.profile, null);
  assert.deepEqual(changes, [{ login: 'alice' }, null]);
  await assert.rejects(session.signIn('bad-token'), /rejected/);
  assert.equal(session.token, '');
  await session.fetch('https://api.github.com/graphql', { headers: { Authorization: 'Bearer stale-token' } });
  assert.equal(calls.at(-1).options.headers.get('Authorization'), null);
});

test('sign-out and cancellation cannot be undone by a pending sign-in', async () => {
  for (const action of ['signOut', 'cancelSignIn']) {
    let resolve;
    const session = createGitHubSession({ fetchImpl: () => new Promise(done => { resolve = done; }) });
    const pending = session.signIn('test-token'); session[action]();
    resolve(Response.json({ login: 'alice' }));
    assert.equal(await pending, null); assert.equal(session.token, '');
  }
});

test('hosted pinned previews use the signed-in session without a local proxy', async () => {
  const calls = [];
  const session = createGitHubSession({ fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/user') ? { login: 'alice' } : { data: { repositoryOwner: { pinnedItems: { nodes: [], pageInfo: { hasNextPage: false } } } } });
  } });
  await session.signIn('test-token');
  assert.deepEqual(await createPinnedFetch({ session })('alice'), []);
  assert.equal(calls.at(-1).url, 'https://api.github.com/graphql');
  assert.equal(calls.at(-1).options.headers.get('Authorization'), 'Bearer test-token');
  session.signOut();
  await assert.rejects(createPinnedFetch({ session })('alice'), /Continue with GitHub/);
});

test('browser token sign-in starts guided setup, keeps credentials out of storage, and signs out', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate: e, waitFor: wait, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    const realFetch=window.fetch; window.apiCalls=[];
    window.fetch=async (url,options={})=>{
      if(!String(url).startsWith('https://api.github.com/')) return realFetch(url,options);
      const auth=new Headers(options.headers).get('Authorization'); window.apiCalls.push({url,auth});
      if(auth==='Bearer bad-token') return Response.json({}, {status:401});
      return Response.json(String(url).includes('/repos?') ? [{name:'project',full_name:'alice/project',private:false,language:'Rust',created_at:'2020-01-01',languages:{Rust:100},topics:[]}] : {login:'alice',type:'User'});
    };` });
  await cdp('Page.reload'); await wait(`document.querySelector('#open-studio')?.disabled === false`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const point = await e(`(()=>{const r=document.querySelector('#github-auth-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  assert.equal(await e(`document.querySelector('#github-sign-in').open`), true);
  assert.equal(await e(`document.querySelector('#github-sign-in').scrollWidth <= document.querySelector('#github-sign-in').clientWidth`), true);
  await mkdir('.dist', { recursive: true });
  await writeFile('.dist/token-sign-in-mobile.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  await e(`document.querySelector('#github-token').value='bad-token'; document.querySelector('#github-token-form').requestSubmit()`);
  await wait(`document.querySelector('#github-auth-status').textContent.includes('rejected')`);
  assert.equal(await e(`document.querySelector('#github-token').value`), '');
  await e(`document.querySelector('#github-token').value='browser-test-secret'; document.querySelector('#github-token-form').requestSubmit()`);
  await wait(`document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search')`);
  assert.equal(await e(`document.querySelector('#github-auth-open').textContent`), '@alice');
  assert.equal(await e(`JSON.stringify({...localStorage,...sessionStorage}).includes('browser-test-secret')`), false);
  assert.equal(await e(`apiCalls.filter(call=>call.url.includes('/users/')).every(call=>call.auth==='Bearer browser-test-secret')`), true);
  await e(`document.querySelector('#github-auth-open').click(); document.querySelector('#github-sign-out').click()`);
  assert.equal(await e(`document.querySelector('#github-auth-open').textContent`), 'Continue with GitHub');
  await e(`document.querySelector('#github-token').value='browser-test-secret'; document.querySelector('#github-token-form').requestSubmit()`);
  await wait(`document.querySelector('#github-auth-open').textContent === '@alice'`);
  await cdp('Page.reload'); await wait(`document.querySelector('#open-studio')?.disabled === false`);
  assert.equal(await e(`document.querySelector('#github-auth-open').textContent`), 'Continue with GitHub');
  assert.equal(await e(`document.querySelector('#github-token').value`), '');
  assert.deepEqual(errors, []);
});

