import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createPreviewServer } from '../scripts/preview-server.mjs';

const browser = process.env.CONSTELLATION_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => existsSync(path));

test('headless studio: randomized codes, configs, presets, filters, keyboard, sharing and PNG', { skip: !browser && 'Set CONSTELLATION_BROWSER to a Chromium executable.', timeout: 60000 }, async t => {
  let apiCalls = 0;
  const server = createPreviewServer({ fetchImpl: async url => {
    apiCalls++;
    const account = new URL(url).pathname.split('/')[2];
    return Response.json(['Rust', 'JavaScript'].map((language, i) => ({ name: `repo-${i}`, full_name: `${account}/repo-${i}`, language, languages: { [language]: 100 }, topics: ['tools'], stargazers_count: 20 - i, updated_at: '2026-01-01T00:00:00Z' })));
  } }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'constellation-browser-'));
  // Hosted Linux runners restrict Chrome's namespace sandbox. This isolated
  // test browser only loads our localhost fixtures and uses a disposable profile.
  const runnerArgs = process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux' ? ['--no-sandbox'] : [];
  const child = spawn(browser, ['--headless=new', ...runnerArgs, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let launchError = '', diagnostics = '';
  child.on('error', error => { launchError = error.message; });
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8000); });
  let socket, cdp;
  t.after(async () => {
    if (cdp) try { await cdp('Browser.close'); } catch {}
    socket?.close(); child.kill();
    for (let i = 0; i < 20; i++) { try { await rm(profile, { recursive: true, force: true }); break; } catch { await delay(100); } }
  });
  let port;
  for (let i = 0; i < 150; i++) {
    if (launchError || child.exitCode !== null) break;
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(port, `Chromium did not start: ${launchError || diagnostics || 'DevTools port unavailable'}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let next = 0; const pending = new Map(), errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result);
  });
  cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 10000) }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const value = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text); return value.result.value; };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.navigate', { url: base });
  for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`)) break; await delay(100); }
  assert.deepEqual(errors, []);
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.star'))`));
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length > 100`));
  await evaluate(`window.input = (id,value) => { const el = document.getElementById(id); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }; window.click = id => document.getElementById(id).click();`);
  await evaluate(`input('design-code','v1:browser');click('reseed-design');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length`), 0, 'v1 codes keep their original background');
  const first = await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').outerHTML.replace(/Generated [^<]+ UTC/g,'Generated TIME')`);
  await evaluate(`click('randomize-design');`);
  assert.notEqual(await evaluate(`document.querySelector('#design-code').value`), 'v1:browser');
  await evaluate(`input('design-code','v1:browser');click('reseed-design');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').outerHTML.replace(/Generated [^<]+ UTC/g,'Generated TIME')`), first);
  await evaluate(`input('preset-name','README');click('save-preset');input('design-nodeSize','uniform');click('load-preset');`);
  await delay(50);
  assert.notEqual(await evaluate(`document.querySelector('#design-nodeSize').value`), 'uniform');
  await evaluate(`input('config-json',JSON.stringify({version:1,account:'your-universe',nodeSize:'topics',seedMode:'custom',seed:'imported',arrangement:'galaxy',nodeMode:'combined'}));click('import-config');`);
  await delay(50);
  assert.equal(await evaluate(`document.querySelector('#design-nodeSize').value`), 'topics');
  assert.equal(await evaluate(`document.querySelector('#arrangement').value`), 'galaxy');
  const graphPositions = await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star'),node=>[node.dataset.repo,node.getAttribute('cx'),node.getAttribute('cy')])`);
  await evaluate(`input('design-sky-mode','milky-way');input('design-sky-density','80');input('design-sky-seed','browser-sky');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length`), 400);
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star'),node=>[node.dataset.repo,node.getAttribute('cx'),node.getAttribute('cy')])`), graphPositions);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.starfield-twinkle')).animationName`), 'none');
  if (process.env.CONSTELLATION_SCREENSHOT) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(`input('design-visualTheme','deep-space');document.querySelector('#design-visualTheme').dispatchEvent(new Event('change'));`);
    const clip = await evaluate(`(()=>{const r=document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
    const screenshot = await cdp('Page.captureScreenshot', { clip, captureBeyondViewport: true });
    await mkdir('.dist', { recursive: true }); await writeFile('.dist/starfield-preview.png', Buffer.from(screenshot.data, 'base64'));
  }
  await evaluate(`input('design-minStars','40');`);
  assert.match(await evaluate(`document.querySelector('#filter-summary').textContent`), /5 included/);
  await evaluate(`input('design-minStars','0'); const node=document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository');node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository').getAttribute('aria-pressed')`), 'true');
  assert.equal(await evaluate(`(async()=>{const {svgToPNG}=await import('/src/export-image.mjs');const source=await(await fetch(document.querySelector('.download').href)).text();const blob=await svgToPNG(source);return blob.type==='image/png'&&blob.size>1000;})()`), true);
  const share = await evaluate(`(async()=>{const {encodeShare}=await import('/src/share-link.mjs');return encodeShare(location.href,'your-universe',{seedMode:'custom',seed:'shared',nodeSize:'age',arrangement:'solar-system'});})()`);
  await cdp('Page.navigate', { url: share });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#design-seed')?.value==='shared'`)) break; await delay(100); }
  assert.equal(await evaluate(`document.querySelector('#design-nodeSize').value`), 'age');
  await delay(500);
  await cdp('Page.navigate', { url: base });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#design-seed')?.value==='shared'`)) break; await delay(100); }
  assert.equal(await evaluate(`document.querySelector('#design-seed').value`), 'shared');
  await evaluate(`window.input = (id,value) => { const el = document.getElementById(id); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }; window.account = name => { document.querySelector('#username').value=name; document.querySelector('#account-form').requestSubmit(); };account('tester');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@tester')`)) break; await delay(50); }
  assert.equal(apiCalls, 1);
  await evaluate(`input('design-nodeShape','square');input('design-repoQuery','repo-0');`);
  assert.match(await evaluate(`document.querySelector('#filter-summary').textContent`), /1 included/);
  assert.equal(apiCalls, 1, 'customization never fetches');
  await evaluate(`account('another');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@another')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#design-nodeShape').value`), 'circle');
  await evaluate(`account('tester');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@tester')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#design-nodeShape').value`), 'square');
  assert.equal(await evaluate(`document.querySelector('#design-repoQuery').value`), 'repo-0');
  assert.equal(apiCalls, 2, 'returning to loaded accounts uses cached data');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.deepEqual(errors, []);
});
