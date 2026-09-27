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
  const requestedUrls = [];
  const server = createPreviewServer({ fetchImpl: async url => {
    apiCalls++;
    requestedUrls.push(url);
    const account = new URL(url).pathname.split('/')[2];
    if (url.includes('/search/issues')) return Response.json({ total_count: 0, items: [] });
    if (/\/(users|orgs)\/collective$/.test(url)) return Response.json({ login: 'collective', type: 'Organization', public_repos: 2 });
    if (url.includes('/repos/collective/') && url.includes('/contributors')) return Response.json([{ login: 'alice', contributions: 8 }, { login: 'bob', contributions: 3 }]);
    if (url.includes('/repos/collective/')) return Response.json({ Rust: 100 });
    if (url.includes('/orgs/collective/events')) return Response.json([]);
    if (/\/users\/[^/?]+$/.test(url)) return Response.json({ login: account, type: 'User' });
    if (url.includes('/repos/mnichols08/') || url.includes('/repos/partial/')) return Response.json({ Rust: 100 });
    if (url.includes('/events/public')) return Response.json([{ id: '1', public: true, type: 'PushEvent', repo: { name: `${account}/repo-0` }, created_at: new Date(Date.now() - 3600000).toISOString(), payload: { secret: 'NEVER_RENDER' } }]);
    if (account === 'partial') return Response.json(Array.from({ length: 60 }, (_, i) => ({ name: `repo-${i}`, full_name: `partial/repo-${i}`, language: 'Rust', stargazers_count: 100 - i, topics: ['tools'], created_at: '2018-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })));
    return Response.json(['Rust', 'JavaScript'].map((language, i) => ({ private: false, name: `repo-${i}`, full_name: `${account}/repo-${i}`, language, ...(account === 'mnichols08' ? {} : { languages: { [language]: 100 } }), topics: ['tools'], stargazers_count: 20 - i, created_at: (2018 + i * 4) + '-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' })));
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Page.navigate', { url: base });
  for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`)) break; await delay(100); }
  assert.deepEqual(errors, []);
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.star'))`));
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length > 100`));
  await evaluate(`window.input = (id,value) => { const el = document.getElementById(id); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }; window.click = id => document.getElementById(id).click();`);
  const viewerCalls = apiCalls;
  await cdp('Runtime.evaluate', { expression: `document.querySelector('#view-fullscreen').focus();click('view-fullscreen');`, userGesture: true });
  for (let i = 0; i < 40; i++) { if (await evaluate(`document.fullscreenElement?.id === 'image-viewer-surface'`)) break; await delay(25); }
  assert.equal(await evaluate(`document.fullscreenElement?.id`), 'image-viewer-surface', 'a user gesture enters native fullscreen');
  assert.equal(await evaluate(`document.querySelector('#image-viewer').open`), true);
  await evaluate(`document.querySelector('.image-viewer-stage img').decode()`);
  assert.equal(await evaluate(`(async()=>await (await fetch(document.querySelector('.image-viewer-stage img').src)).text() === await (await fetch(document.querySelector('.download').href)).text())()`), true, 'viewer uses the complete exported SVG');
  const fitZoom = await evaluate(`parseInt(document.querySelector('#viewer-zoom').value)`);
  await evaluate(`click('viewer-zoom-in');`);
  assert.ok(await evaluate(`parseInt(document.querySelector('#viewer-zoom').value)`) > fitZoom);
  await evaluate(`click('viewer-actual');`);
  assert.equal(await evaluate(`document.querySelector('#viewer-zoom').value`), '100%');
  const beforePan = await evaluate(`document.querySelector('.image-viewer-stage img').style.transform`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 300, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 560, y: 340, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 560, y: 340, button: 'left', clickCount: 1 });
  assert.notEqual(await evaluate(`document.querySelector('.image-viewer-stage img').style.transform`), beforePan, 'drag pans the image');
  await evaluate(`document.querySelector('.image-viewer-stage').dispatchEvent(new WheelEvent('wheel',{deltaY:-150,clientX:550,clientY:350,cancelable:true}));`);
  assert.ok(await evaluate(`parseInt(document.querySelector('#viewer-zoom').value)`) > 100, 'wheel zooms');
  await evaluate(`document.querySelector('.image-viewer-stage').dispatchEvent(new KeyboardEvent('keydown',{key:'0',bubbles:true}));`);
  assert.equal(await evaluate(`parseInt(document.querySelector('#viewer-zoom').value)`), fitZoom, 'keyboard fits the image');
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 300, id: 0 }, { x: 600, y: 300, id: 1 }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 460, y: 300, id: 0 }, { x: 640, y: 300, id: 1 }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await evaluate(`parseInt(document.querySelector('#viewer-zoom').value)`) > fitZoom, 'two-finger pinch zooms');
  if (process.env.CONSTELLATION_SCREENSHOT) {
    await mkdir('.dist', { recursive: true });
    const shot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/fullscreen-viewer.png', Buffer.from(shot.data, 'base64'));
  }
  await evaluate(`document.exitFullscreen()`);
  for (let i = 0; i < 40; i++) { if (await evaluate(`!document.fullscreenElement && document.activeElement.id === 'view-fullscreen'`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#image-viewer').open`), false, 'exiting browser fullscreen closes the viewer');
  assert.equal(await evaluate(`document.activeElement.id`), 'view-fullscreen', 'closing returns keyboard focus');
  assert.equal(await evaluate(`document.body.style.overflow`), '');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate(`click('view-fullscreen');`);
  assert.ok(await evaluate(`document.querySelector('#image-viewer').scrollWidth<=innerWidth`), 'viewer controls fit on mobile');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  assert.equal(await evaluate(`document.querySelector('#image-viewer').open`), false, 'Escape closes the viewer');
  await evaluate(`click('view-fullscreen');click('viewer-close');`);
  assert.equal(await evaluate(`document.querySelector('#image-viewer').open`), false, 'Close button closes the viewer');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(apiCalls, viewerCalls, 'viewing and zooming require no API calls');
  await evaluate(`input('design-codingRhythmStyle','orbit');input('design-codingRhythmWindow','14d');input('design-rhythmZoneMode','browser');`);
  assert.equal(await evaluate(`document.querySelector('#design-codingRhythmStyle').closest('.inspector-panel').id`), 'panel-motion');
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.coding-rhythm-hour').length`), 24);
  await evaluate(`click('copy-config');`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('#config-json').value).codingRhythmTimezone === Intl.DateTimeFormat().resolvedOptions().timeZone`), true);
  await evaluate(`input('design-rhythmZoneMode','custom');input('design-codingRhythmTimezone','America/New_York');input('design-codingRhythmStyle','active-arc');`);
  assert.match(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.innerHTML`), /America\/New_York/);
  await evaluate(`click('design-codingRhythmAnimate');`);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.coding-rhythm-marker')).display`), 'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.coding-rhythm-hour')).display`), 'inline');
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(`input('design-codingRhythmStyle','hidden');`);
  assert.equal(await evaluate(`document.querySelectorAll('.inspector-panel:not([hidden])').length`), 1);
  assert.equal(await evaluate(`document.querySelector('[role=tab][aria-selected=true]').id`), 'tab-look');
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return r.top>0&&r.bottom<innerHeight&&r.height>300;})()`));
  assert.deepEqual(await evaluate(`(async()=>{const original=new DOMParser().parseFromString(await(await fetch('/')).text(),'text/html');return [...original.querySelectorAll('input[id],select[id],textarea[id],button[id]')].filter(el=>!document.getElementById(el.id)).map(el=>el.id);})()`), [], 'all customization controls remain available');
  await evaluate(`click('tab-motion');document.querySelector('#animate-rings').closest('details').open=true;`);
  const previewBeforeScroll = await evaluate(`document.querySelector('#preview').getBoundingClientRect().top`);
  await evaluate(`document.querySelector('.inspector-scroll').scrollTop=500;`);
  assert.equal(await evaluate(`document.querySelector('#preview').getBoundingClientRect().top`), previewBeforeScroll);
  await evaluate(`document.querySelector('#perspective-enabled').closest('details').open=true;`);
  await delay(50);
  assert.equal(await evaluate(`document.querySelector('#animate-rings').closest('details').open`), false);
  await evaluate(`document.querySelector('#tab-motion').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
  assert.equal(await evaluate(`document.activeElement.id`), 'tab-projects');
  await evaluate(`click('toggle-customization');`);
  assert.equal(await evaluate(`document.querySelector('#studio-inspector').hidden`), true);
  await evaluate(`click('toggle-customization');click('tab-look');document.querySelector('.design-code-menu > summary').click();`);
  assert.equal(await evaluate(`document.querySelector('.design-code-menu').open`), true);
  await evaluate(`document.querySelector('#design-code').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelector('.design-code-menu').open`), false);
  await evaluate(`input('design-code','v1:browser');click('reseed-design');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length`), 0, 'v1 codes keep their original background');
  const first = await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').outerHTML.replace(/Generated [^<]+ UTC/g,'Generated TIME')`);
  await evaluate(`click('randomize-design');`);
  assert.notEqual(await evaluate(`document.querySelector('#design-code').value`), 'v1:browser');
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v5:mfff-/);
  assert.equal(await evaluate(`(async()=>{const {randomizeDesign}=await import('/src/design-randomizer.mjs');return document.querySelector('#link-ring-motion').checked===randomizeDesign(document.querySelector('#design-code').value).ringAnimation.linked;})()`), true);
  assert.ok(await evaluate(`(async()=>{
    const {randomizeDesign}=await import('/src/design-randomizer.mjs');
    const recipe=randomizeDesign(document.querySelector('#design-code').value);
    const rings=['speeds','directions','modes','amplitudes','easing'].every((key,j)=>recipe.ringAnimation[key].every((value,i)=>String(value)===document.getElementById('ring-'+['speed','direction','motion','sway','easing'][j]+'-'+i).value));
    const perspective=Object.entries(recipe.perspective).every(([key,value])=>{const el=document.getElementById('perspective-'+key);return typeof value==='boolean'?el.checked===value:el.value===String(value);});
    return rings&&perspective;
  })()`));

  // A v5 draw may select an empty historical/filter pool or a CSS-only layer.
  assert.equal(await evaluate(`document.querySelector('#animate').checked && document.querySelector('#design-starlightAnimate').checked && document.querySelector('#animate-rings').checked`), true);
  await evaluate(`click('randomize-motion');click('randomize-design');`);
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v5:m000-/);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('animate,animateTransform').length`), 0);
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
    const studioShot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/organization-studio.png', Buffer.from(studioShot.data, 'base64'));
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(`input('design-activityEffect','comet');input('design-visualTheme','deep-space');document.querySelector('#design-visualTheme').dispatchEvent(new Event('change'));`);
    const pageShot = await cdp('Page.captureScreenshot');
    await mkdir('.dist', { recursive: true }); await writeFile('.dist/studio-preview.png', Buffer.from(pageShot.data, 'base64'));
    const clip = await evaluate(`(()=>{const r=document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()`);
    const screenshot = await cdp('Page.captureScreenshot', { clip, captureBeyondViewport: true });
    await mkdir('.dist', { recursive: true }); await writeFile('.dist/starfield-preview.png', Buffer.from(screenshot.data, 'base64'));
  }
  await evaluate(`input('design-minStars','40');`);
  assert.match(await evaluate(`document.querySelector('#filter-summary').textContent`), /5 included/);
  await evaluate(`input('design-minStars','0'); const node=document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository');node.focus();node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository').getAttribute('aria-pressed')`), 'true');
  assert.equal(await evaluate(`document.querySelector('[role=tab][aria-selected=true]').id`), 'tab-nodes');
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
  assert.equal(apiCalls, 3);
  await evaluate(`input('node-mode','repositories');input('history-mode','historical');input('history-year','2019');`);
  assert.equal(await evaluate(`document.querySelector('#history-year').min`), '2018');
  assert.equal(await evaluate(`document.querySelector('#history-year').hidden`), false);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.repository').length`), 1);
  await evaluate(`input('history-year','2026');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.repository').length`), 2);
  await evaluate(`document.querySelector('#animate').checked=true;input('history-mode','time-lapse');`);
  for (const mode of ['grow', 'orbit', 'crossfade']) {
    await evaluate(`input('history-lapse',${JSON.stringify(mode)});`);
    assert.equal(await evaluate(`(async()=>{const source=await(await fetch(document.querySelector('.download').href)).text();return new DOMParser().parseFromString(source,'image/svg+xml').querySelectorAll('parsererror').length;})()`), 0, `${mode} exports valid XML`);
    assert.equal(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.history-year')).every(el=>getComputedStyle(el).animationName==='none')`), true);
    assert.equal(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('text.history-year')).filter(el=>Number(getComputedStyle(el).opacity)>0).length`), 1, `${mode} shows only the latest year for reduced motion`);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const firstYear = await evaluate(`(()=>{const root=document.querySelector('#preview').firstChild.shadowRoot;for(const animation of root.querySelector('svg').getAnimations({subtree:true})){animation.pause();animation.currentTime=100;}return Array.from(root.querySelectorAll('text.history-year')).filter(el=>Number(getComputedStyle(el).opacity)>.9).map(el=>el.textContent);})()`);
    assert.deepEqual(firstYear, ['2018'], `${mode} begins at the first historical year`);
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  }
  assert.equal(apiCalls, 3, 'year slider and all time-lapse modes remain local');
  await evaluate(`input('history-mode','current');`);
  await evaluate(`input('design-activityEffect','comet');input('design-activityWindow','1d');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.activity-comet').length`), 1);
  assert.doesNotMatch(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.innerHTML`), /NEVER_RENDER/);
  await evaluate(`input('design-nodeShape','square');input('design-repoQuery','repo-0');`);
  assert.match(await evaluate(`document.querySelector('#filter-summary').textContent`), /1 included/);
  assert.equal(apiCalls, 3, 'customization never fetches');
  await evaluate(`account('another');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@another')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#design-nodeShape').value`), 'circle');
  await evaluate(`account('tester');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@tester')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#design-nodeShape').value`), 'square');
  assert.equal(await evaluate(`document.querySelector('#design-repoQuery').value`), 'repo-0');
  assert.equal(apiCalls, 6, 'returning to loaded accounts uses cached data');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('#tab-look').click();document.querySelector('#design-sky-mode').closest('details').open=true;`);
  await delay(50);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'mobile has no horizontal overflow');
  const mobileBounds = await evaluate(`(()=>{const p=document.querySelector('#preview').getBoundingClientRect(),c=document.querySelector('.controls').getBoundingClientRect();return {previewHeight:p.height,previewBottom:p.bottom,controlsTop:c.top,controlsBottom:c.bottom,viewport:innerHeight};})()`);
  assert.ok(mobileBounds.previewHeight>100&&mobileBounds.previewBottom<=mobileBounds.controlsTop&&mobileBounds.controlsBottom<mobileBounds.viewport, `mobile keeps preview above the bounded controls: ${JSON.stringify(mobileBounds)}`);
  await evaluate(`document.querySelector('.design-launcher').style.paddingBottom='48px';`);
  await delay(100);
  assert.ok(await evaluate(`document.querySelector('.controls').getBoundingClientRect().bottom<innerHeight`), 'workspace adapts when toolbar height changes');
  const mobilePreviewTop=await evaluate(`document.querySelector('#preview').getBoundingClientRect().top`);
  await evaluate(`document.querySelector('.inspector-scroll').scrollTop=200;`);
  assert.equal(await evaluate(`document.querySelector('#preview').getBoundingClientRect().top`), mobilePreviewTop);
  if (process.env.CONSTELLATION_SCREENSHOT) {
    const studioShot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/organization-studio.png', Buffer.from(studioShot.data, 'base64'));
    await evaluate(`document.querySelector('.inspector-scroll').scrollTop=0;`);
    const mobileShot=await cdp('Page.captureScreenshot');
    await writeFile('.dist/studio-mobile.png',Buffer.from(mobileShot.data,'base64'));
  }
  await evaluate(`document.querySelector('.randomize-motion-menu').open=true;`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'animation parts fit on mobile');
  if (process.env.CONSTELLATION_SCREENSHOT) {
    const studioShot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/organization-studio.png', Buffer.from(studioShot.data, 'base64'));
    const capture = await cdp('Page.captureScreenshot');
    await writeFile('.dist/animation-parts-mobile.png', Buffer.from(capture.data, 'base64'));
  }
  await evaluate(`input('design-minStars','999999999');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length`), 0, 'manual empty filters remain visible');
  assert.match(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.textContent`), /No projects match these filters/);
  assert.equal(await evaluate(`document.querySelector('#reset-project-filters').hidden`), false);
  const beforeReset = apiCalls;
  await evaluate(`document.querySelector('#reset-project-filters').click();`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length`), 2);
  assert.equal(apiCalls, beforeReset, 'resetting project filters stays local');
  await evaluate(`input('design-minStars','999999999');account('mnichols08');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@mnichols08')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#map-title').textContent`), '@mnichols08’s sky');
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star[data-kind="repository"]').length`), 2, 'a new account loads its default pool despite previous restrictive filters');
  assert.equal(await evaluate(`document.querySelector('#design-minStars').value`), '0');
  assert.equal(await evaluate(`document.querySelector('#load-projects').hidden`), true, 'the displayed pool already has language data');
  const requestsBeforeRandomizing = apiCalls;
  await evaluate(`document.querySelector('#randomize-motion').checked=true;document.querySelector('#randomize-motion').dispatchEvent(new Event('input'));for(const input of document.querySelectorAll('.randomize-motion-parts input')){input.checked=input.id==='randomize-ring2';input.dispatchEvent(new Event('input'));}document.querySelector('#randomize-design').click();`);
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v5:m008-/);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length > 0`), 'randomization selects a nonempty design');
  assert.equal(await evaluate(`document.querySelector('#design-starlightAnimate').checked`), false);
  assert.equal(await evaluate(`Number(document.querySelector('#ring-speed-0').value)`), 0);
  assert.ok(await evaluate(`Number(document.querySelector('#ring-speed-1').value)>0`));
  assert.equal(await evaluate(`document.querySelector('#perspective-animate').checked`), false);
  assert.equal(apiCalls, requestsBeforeRandomizing, 'randomization stays local');
  await evaluate(`account('partial');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@partial')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#map-title').textContent`), '@partial’s sky', await evaluate(`document.querySelector('#status').textContent`));
  assert.equal(await evaluate(`document.querySelector('#max-repos').value`), '45', 'default pool matches the repositories hydrated on account load');
  const partialCalls = apiCalls;
  await evaluate(`input('design-minStars','999999999');document.querySelector('#randomize-motion').checked=false;document.querySelector('#randomize-motion').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length`), 0);
  for (let i = 0; i < 12; i++) {
    await evaluate(`document.querySelector('#randomize-design').click();`);
    assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length>0`), `partial-cache randomization ${i} produces a populated preview`);
    assert.equal(await evaluate(`document.querySelector('#load-projects').hidden`), true, 'accepted random designs need no additional data');
    assert.doesNotMatch(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.textContent`), /No projects match|No public repositories|No public pinned repositories/);
  }
  assert.equal(apiCalls, partialCalls, 'retrying partially cached designs stays local');
  await evaluate(`document.querySelector('#account-mode').value='paired';document.querySelector('#account-mode').dispatchEvent(new Event('change'));document.querySelector('#organization-account').value='collective';account('alice');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('Organization universe')`)) break; await delay(50); }
  assert.match(await evaluate(`document.querySelector('#map-title').textContent`), /collective.*Organization universe.*alice/);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star[data-kind="contributor"]').length`), 2);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('[data-organization-focus]').length >= 4`));
  assert.match(await evaluate(`document.querySelector('#organization-status').textContent`), /selected organization scope/);
  const organizationCalls = apiCalls;
  await evaluate(`input('arrangement','collaboration-gravity');input('org-view','history');input('org-grouping','year');input('org-view','collaboration');document.querySelector('#copy-config').click();`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('#config-json').value).organizationUser`), 'alice');
  assert.match(await evaluate(`document.querySelector('#workflow').value`), /username: 'collective'/);
  assert.equal(apiCalls, organizationCalls, 'organization layouts and views are local');
  await evaluate(`document.querySelector('#builtin-preset').value='organization-community';document.querySelector('#apply-builtin-preset').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#username').value`), 'alice', 'a preset preserves the paired username field');
  assert.equal(await evaluate(`document.querySelector('#organization-account').value`), 'collective');
  const beforeOrganizationOnly = requestedUrls.length;
  await evaluate(`document.querySelector('#account-mode').value='organization';document.querySelector('#account-mode').dispatchEvent(new Event('change'));account('collective');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent === 'collective · Organization universe'`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#map-title').textContent`), 'collective · Organization universe');
  assert.equal(await evaluate(`document.querySelector('#organization-account').hidden`), true);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('[data-organization-focus]').length`), 0);
  assert.equal(requestedUrls.slice(beforeOrganizationOnly).some(url => /contributors|search\/issues/.test(url)), false, 'organization-only project atlas does not scan people or search for a user');
  assert.equal(await evaluate(`document.querySelector('#output-repository').value`), 'collective/.github');
  for (const id of ['organization-community', 'organization-technology', 'organization-history', 'organization-featured', 'organization-projects']) {
    await evaluate(`document.querySelector('.builtin-preset-menu').open=true;document.querySelector('#builtin-preset').value='${id}';document.querySelector('#builtin-preset').dispatchEvent(new Event('change'));document.querySelector('#apply-builtin-preset').click();`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
    assert.match(await evaluate(`document.querySelector('#status').textContent`), /applied/);
    assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length > 0`), id + ' renders nodes');
    await evaluate(`document.querySelector('#copy-config').click();`);
    const config = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
    assert.equal(config.account, 'collective');
    assert.equal(config.organizationUser, undefined);
    assert.equal(config.accountType, 'organization');
    assert.equal(config.designCode, undefined, 'a curated preset clears any random design code');
    if (id === 'organization-community') assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star[data-kind="contributor"]').length > 0`));
  }
  assert.match(await evaluate(`document.querySelector('#workflow').value`), /username: 'collective'/);
  const beforeSimplePreset = apiCalls;
  if (process.env.CONSTELLATION_SCREENSHOT) {
    await evaluate(`document.querySelector('.builtin-preset-menu').open=true;`);
    const shot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/organization-presets.png', Buffer.from(shot.data, 'base64'));
    await evaluate(`document.querySelector('.builtin-preset-menu').open=false;`);
  }
  await evaluate(`document.querySelector('#builtin-preset').value='minimal-readme';document.querySelector('#apply-builtin-preset').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#layout').value`), 'compact');
  assert.equal(apiCalls, beforeSimplePreset, 'a visual preset uses loaded data');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('.builtin-preset-menu').open=true;`);
  assert.ok(await evaluate(`(()=>{const r=document.querySelector('.builtin-preset-body').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()`), 'preset picker fits a narrow viewport');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'organization form and launcher do not overflow on mobile');
  await evaluate(`document.querySelector('.builtin-preset-menu').open=false;`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.deepEqual(errors, []);
  if (process.env.CONSTELLATION_SCREENSHOT) {
    const studioShot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/organization-studio.png', Buffer.from(studioShot.data, 'base64'));
    await cdp('Emulation.setDeviceMetricsOverride', { width: 940, height: 620, deviceScaleFactor: 1, mobile: false });
    const gallery = await readFile('examples/gallery/night-owl.svg', 'utf8');
    await cdp('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from('<meta charset="utf-8"><body style="margin:20px;background:#080c24">' + gallery).toString('base64') });
    await delay(200);
    const shot = await cdp('Page.captureScreenshot');
    await writeFile('.dist/coding-rhythm.png', Buffer.from(shot.data, 'base64'));
    if (process.env.CONSTELLATION_ORGANIZATION_SVG) {
      const svg = await readFile(process.env.CONSTELLATION_ORGANIZATION_SVG, 'utf8');
      await cdp('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from('<meta charset="utf-8"><body style="margin:20px;background:#080c24">' + svg).toString('base64') });
      await delay(150);
      const capture = await cdp('Page.captureScreenshot');
      await writeFile('.dist/organization-live.png', Buffer.from(capture.data, 'base64'));
    }
    for (const name of ['developer-history', 'open-source-galaxy', 'time-machine', 'stellar-ages', 'organization-community', 'organization-user', 'organization-eras']) {
      const svg = await readFile(`examples/gallery/${name}.svg`, 'utf8');
      await cdp('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from('<meta charset="utf-8"><body style="margin:20px;background:#080c24">' + svg).toString('base64') });
      await delay(150);
      assert.equal(await evaluate(`document.querySelectorAll('parsererror').length`), 0);
      const capture = await cdp('Page.captureScreenshot');
      await writeFile(`.dist/${name}.png`, Buffer.from(capture.data, 'base64'));
    }
  }
});
