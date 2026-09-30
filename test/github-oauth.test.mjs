import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGitHubOAuth } from '../src/github-oauth.mjs';
import { exchange } from '../auth/github-exchange.mjs';

function fixture(fetchImpl = async () => Response.json({ access_token: 'secret' })) {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const config = { clientId: 'Iv1.test', exchangeUrl: 'https://auth.example/', redirectUri: 'https://studio.example/', storage, fetchImpl };
  return { data, config, oauth: createGitHubOAuth(config) };
}
test('PKCE S256 survives redirect, is consumed once and never stores a token', async () => {
  let sent;
  const { oauth, config, data } = fixture(async (url, options) => { sent = JSON.parse(options.body); return Response.json({ access_token: 'secret' }); });
  const url = new URL(await oauth.begin()), transaction = JSON.parse([...data.values()][0]);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(transaction.verifier).digest('base64url'));
  assert.equal(url.searchParams.has('scope'), false);
  const callback = config.redirectUri + '?code=code&state=' + transaction.state;
  assert.equal(await createGitHubOAuth(config).complete(callback), 'secret');
  assert.deepEqual(sent, { code: 'code', code_verifier: transaction.verifier }); assert.equal(data.size, 0);
  await assert.rejects(oauth.complete(callback), /state/);
});
test('state mismatch, expiry, cancellation and callback errors never exchange codes', async () => {
  for (const scenario of ['state', 'expiry', 'cancel', 'denied', 'error']) {
    const { oauth, config, data } = fixture(() => { throw Error('must not fetch'); });
    const url = new URL(await oauth.begin()), state = url.searchParams.get('state');
    if (scenario === 'cancel') oauth.cancel();
    const client = scenario === 'expiry' ? createGitHubOAuth({ ...config, now: () => Date.now() + 700000 }) : oauth;
    const query = scenario === 'denied' ? 'error=access_denied' : scenario === 'error' ? 'error=server_error' : 'code=code';
    await assert.rejects(client.complete(config.redirectUri + '?' + query + '&state=' + (scenario === 'state' ? 'wrong' : state)), /state|cancelled|authorize/);
    assert.equal(data.size, 0);
  }
});
test('sign-out invalidates an in-flight OAuth exchange', async () => {
  let finish;
  const { oauth } = fixture(() => new Promise(resolve => { finish = resolve; }));
  const state = new URL(await oauth.begin()).searchParams.get('state');
  const pending = oauth.complete('https://studio.example/?code=code&state=' + state);
  oauth.cancel(); finish(Response.json({ access_token: 'secret' }));
  assert.equal(await pending, null);
});
test('isolated broker restricts origin, callback, method, body and secret exposure', async () => {
  const env = { GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'server-secret', GITHUB_REDIRECT_URI: 'https://studio.example/', STUDIO_ORIGIN: 'https://studio.example' };
  let sent;
  const fetchImpl = async (url, options) => { assert.equal(url, 'https://github.com/login/oauth/access_token'); sent = options.body; return Response.json({ access_token: 'token', refresh_token: 'refresh-secret' }); };
  const request = (origin = env.STUDIO_ORIGIN, body = { code: 'code', code_verifier: 'a'.repeat(43), redirect_uri: 'https://evil.example' }) => new Request('https://auth.example/', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await exchange(request('https://evil.example'), env, fetchImpl)).status, 403);
  assert.equal((await exchange(request(env.STUDIO_ORIGIN, {}), env, fetchImpl)).status, 400);
  assert.equal((await exchange(request(env.STUDIO_ORIGIN, { code: 'a'.repeat(3000) }), env, fetchImpl)).status, 413);
  const response = await exchange(request(), env, fetchImpl);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { access_token: 'token' });
  assert.equal(sent.get('client_secret'), env.GITHUB_CLIENT_SECRET);
  assert.equal(sent.get('redirect_uri'), env.GITHUB_REDIRECT_URI);
  assert.equal((await exchange(request(), env, async () => Response.json({ error: 'bad_verification_code' }))).status, 400);
});
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

test('OAuth callback loads identity, protects designs and offers saved work on return', {skip: !browser, timeout: 30000}, async t => {
  const server = createPreviewServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const {cdp, evaluate:e, waitFor:wait, errors} = await openBrowser(t,origin);
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    const originalQuery = document.querySelector.bind(document);
    document.querySelector = selector => selector === 'meta[name="constellation-oauth-client"]' ? {content:'client'} : selector === 'meta[name="constellation-oauth-exchange"]' ? {content:'https://auth.example/'} : originalQuery(selector);
    sessionStorage.setItem('constellation-oauth-transaction', JSON.stringify({state:'fixture-state',verifier:'a'.repeat(43),created:Date.now(),redirectUri:location.origin+'/'}));
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url,options={}) => {
      if(String(url)==='https://auth.example/') return Response.json({access_token:'oauth-browser-secret'});
      if(String(url).startsWith('https://api.github.com/')) return Response.json(String(url).includes('/repos?') ? [{name:'project',full_name:'alice/project',private:false,language:'Rust',created_at:'2020-01-01',languages:{Rust:100},topics:[]}] : String(url).endsWith('/languages') ? {Rust:100} : {login:'alice',name:'Alice',type:'User'});
      return originalFetch(url,options);
    };
  `});
  await cdp('Page.navigate',{url:origin+'/?code=code&state=fixture-state'});
  await wait(`!!document.querySelector('#guided-repository-search')`);
  assert.equal(await e(`document.querySelector('#username').value`),'alice');
  assert.match(await e(`document.querySelector('.guided-identity').textContent`),/Welcome, @alice.*Alice/);
  assert.equal(await e(`location.search`),'');
  assert.equal(await e(`sessionStorage.getItem('constellation-oauth-transaction')`),null);
  const click = async text => { await e(`[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`); await wait(`!document.querySelector('#guided-setup').hasAttribute('aria-busy')`); };
  await click('Continue'); await click('Continue'); await click('Continue'); await click('Continue'); await click('Generate my constellation');
  await wait(`document.documentElement.dataset.entry==='result'`);
  await e(`document.querySelector('#constellation-title').value='Saved OAuth sky';document.querySelector('#save-constellation').click()`);
  assert.equal(await e(`JSON.stringify({...localStorage,...sessionStorage}).includes('oauth-browser-secret')`),false);
  assert.equal(await e(`document.querySelector('#workflow').value.includes('oauth-browser-secret')`),false);
  await e(`document.querySelector('#github-auth-open').click();document.querySelector('#github-sign-out').click()`);
  assert.equal(await e(`document.querySelector('#github-sign-out').hidden`),true);
  await cdp('Page.navigate',{url:origin+'/?code=another&state=fixture-state'});
  await wait(`document.querySelector('#guided-setup h2')?.textContent==='Continue your constellations'`);
  assert.equal(await e(`JSON.stringify(localStorage).includes('Saved OAuth sky')`),true);
  assert.deepEqual(errors,[]);
});
