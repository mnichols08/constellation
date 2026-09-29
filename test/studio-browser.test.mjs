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
  let apiCalls = 0, failPresetLanguage = false;
  const requestedUrls = [];
  const server = createPreviewServer({ fetchImpl: async url => {
    apiCalls++;
    requestedUrls.push(url);
    const account = new URL(url).pathname.split('/')[2];
    if (url.includes('/repos/collective/repo-0/commits?')) {
      const branch = new URL(url).searchParams.get('sha');
      if (branch === 'missing') return Response.json({ message: 'Not Found' }, { status: 404 });
      if (branch === 'empty') return Response.json({ message: 'Empty' }, { status: 409 });
      return Response.json([[4, [3, 2], 'alice'], [3, [1], 'alice'], [2, [1], 'bob'], [1, [], null]].map(([id, parents, login]) => ({ sha: String(id).padStart(40, '0'), parents: parents.map(id => ({ sha: String(id).padStart(40, '0') })), author: login ? { login } : null, commit: { message: ['Initial constellation', 'Add contributor colors', 'Draw orbital paths', 'Merge contributor graph'][id - 1], author: { name: 'Guest developer' }, committer: { date: '2026-09-27T12:00:00Z' } } })));
    }
    if (/\/repos\/collective\/repo-0$/.test(url)) return Response.json({ name: 'repo-0', full_name: 'collective/repo-0', private: false, default_branch: 'main' });
    if (url.includes('/search/issues')) return Response.json({ total_count: 1, items: [{ user: { login: 'alice' }, pull_request: {}, repository_url: 'https://api.github.com/repos/chingu-voyages/team-project' }] });
    if (url.includes('/search/commits')) return Response.json({ total_count: 1, items: [{ author: { login: 'alice' }, repository: { full_name: 'code-the-dream/practicum', private: false } }] });
    if (/\/repos\/(chingu-voyages|code-the-dream)\//.test(url)) {
      if (url.includes('/contributors?')) return Response.json([{ login: 'alice', contributions: 5 }, { login: 'teammate', contributions: 8 }]);
      if (url.endsWith('/languages')) return Response.json({ JavaScript: 100 });
      const full_name = new URL(url).pathname.slice(7);
      return Response.json({ name: full_name.split('/')[1], full_name, private: false, language: 'JavaScript', stargazers_count: 5, created_at: '2022-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
    }
    if (/\/(users|orgs)\/collective$/.test(url)) return Response.json({ login: 'collective', type: 'Organization', public_repos: 2 });
    if (url.includes('/repos/collective/') && url.includes('/contributors')) return Response.json([{ login: 'alice', contributions: 8 }, { login: 'bob', contributions: 3 }]);
    if (url.includes('/repos/collective/')) return Response.json({ Rust: 100 });
    if (url.includes('/orgs/collective/events')) return Response.json([]);
    if (/\/users\/[^/?]+$/.test(url)) return Response.json({ login: account, type: 'User' });
    if (failPresetLanguage && url.includes('/repos/partial/')) return Response.json({ message: 'Language data unavailable' }, { status: 503 });
    if (url.includes('/repos/mnichols08/') || url.includes('/repos/partial/')) return Response.json({ Rust: 100 });
    if (url.includes('/events/public')) return Response.json([{ id: '1', public: true, type: 'PushEvent', repo: { name: `${account}/repo-0` }, created_at: new Date(Date.now() - 3600000).toISOString(), payload: { secret: 'NEVER_RENDER' } }]);
    if (account === 'partial') return Response.json(Array.from({ length: 60 }, (_, i) => ({ name: `repo-${i}`, full_name: `partial/repo-${i}`, language: 'Rust', stargazers_count: 100 - i, topics: ['tools'], created_at: '2018-01-01T00:00:00Z', updated_at: new Date(Date.UTC(2026,0,i+1)).toISOString() })));
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
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`), `Studio did not render: ${errors.join('\n')}`);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.starfield-point').length > 100`));
  assert.equal(await evaluate(`document.documentElement.dataset.entry`), 'landing', 'first visit retains the original landing layout');
  assert.equal(await evaluate(`document.body.classList.contains('studio-ready')`), false);
  assert.ok(await evaluate(`document.querySelector('.intro h1 em') !== null`));
  await evaluate(`document.querySelector('#open-studio').click();`);
  assert.equal(await evaluate(`document.body.classList.contains('studio-ready')`), true);
  await cdp('Page.reload');
  for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`)) break; await delay(100); }
  assert.equal(await evaluate(`document.documentElement.dataset.entry`), 'landing', 'returning visits keep customization opt-in');
  await evaluate(`document.querySelector('#open-studio').click()`);
  assert.equal(await evaluate(`document.body.classList.contains('studio-ready')`), true);
  for (const [mode, accent, sky] of [['dark', '#c7d6ff', '#080e20'], ['light', '#304e8a', '#f7f8fc']]) {
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    assert.equal(await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`), accent);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg')).getPropertyValue('--sky-background').trim()`), sky);
    await mkdir('.dist', { recursive: true });
    const restoredThemeShot = await cdp('Page.captureScreenshot');
    await writeFile(`.dist/constellation-restored-${mode}.png`, Buffer.from(restoredThemeShot.data, 'base64'));
  }
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  const curvedMotion = await evaluate(`(async () => {
    const { renderConstellation } = await import('/src/constellation.mjs');
    const repos = Array.from({length:12}, (_,i)=>({name:'r'+i,full_name:'o/r'+i,language:'Rust'}));
    const results = [];
    for (const motion of [
      {ringAnimation:{enabled:true,speeds:[1,2,0,3],directions:['clockwise','counterclockwise','clockwise','clockwise']}},
      {floatingAnimation:{enabled:true,mode:'orbit',amplitude:12,duration:8},starPositions:{'o/r0':{x:450,y:270}}}
    ]) {
      const host = document.createElement('div'); document.body.append(host);
      host.innerHTML = renderConstellation('o',repos,{...motion,colorConnections:true});
      const svg = host.querySelector('svg'); svg.pauseAnimations();
      const edges = [...svg.querySelectorAll('path.shared-language')];
      let maxError = 0, curved = 0;
      for (const time of [0,3.71,17.3,61.1]) {
        svg.setCurrentTime(time);
        for (const edge of edges) {
          const from = [...svg.querySelectorAll('circle.star')].find(n=>n.dataset.repo===edge.dataset.from);
          const to = [...svg.querySelectorAll('circle.star')].find(n=>n.dataset.repo===edge.dataset.to);
          const length = edge.getTotalLength(), start = edge.getPointAtLength(0), end = edge.getPointAtLength(length);
          maxError = Math.max(maxError,Math.hypot(start.x-from.cx.animVal.value,start.y-from.cy.animVal.value),Math.hypot(end.x-to.cx.animVal.value,end.y-to.cy.animVal.value));
          if (length > Math.hypot(end.x-start.x,end.y-start.y)+.01) curved++;
        }
      }
      results.push({edges:edges.length,animations:svg.querySelectorAll('path.shared-language animate[attributeName="d"]').length,maxError,curved});
      host.remove();
    }
    return results;
  })()`);
  for (const result of curvedMotion) {
    assert.ok(result.edges > 0 && result.animations > 0);
    assert.ok(result.maxError < .2, 'curved endpoints follow independently animated nodes: ' + JSON.stringify(result));
    assert.ok(result.curved > 0, 'animated connections retain curvature');
  }
  await evaluate(`document.querySelector('#open-studio').click()`);
  await evaluate(`window.input = (id,value) => { const el = document.getElementById(id); el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); }; window.click = id => document.getElementById(id).click();`);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await evaluate(`input('design-activityEffect', 'asteroids');`);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.commit-asteroid').length > 20`));
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.commit-ship,.commit-flight-path').length`), 0);
  const asteroidShot = await cdp('Page.captureScreenshot');
  await writeFile('.dist/commit-asteroid-field.png', Buffer.from(asteroidShot.data, 'base64'));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.commit-asteroid')).transitionDuration`), '0s');
  await evaluate(`input('design-activityEffect', 'off');`);
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await evaluate(`click('history-comet');`);
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.contribution-comet'))`));
  const cometTravel = await evaluate(`(() => {
    const flight = document.querySelector('#preview').firstChild.shadowRoot.querySelector('.comet-active .comet-flight');
    const animation = flight.getAnimations().find(value => value.animationName === 'comet-cruise');
    animation.pause(); animation.currentTime = 1000;
    const start = flight.getBoundingClientRect().x;
    animation.currentTime = 7000;
    const end = flight.getBoundingClientRect().x;
    animation.currentTime = 13000;
    const loop = flight.getBoundingClientRect().x;
    animation.play(); return { distance: end - start, loopOffset: Math.abs(loop - start) };
  })()`);
  assert.ok(cometTravel.distance > 250, 'active demo comet visibly crosses the sky');
  assert.ok(cometTravel.loopOffset < 1, 'flight loops continuously');
  assert.equal(await evaluate(`(async () => {
    const { renderContributionComet, cometCSS } = await import('/src/history/contribution-comet.mjs');
    const host = document.createElement('div');
    host.id = 'comet-test-stage'; host.style.cssText = 'position:fixed;inset:0 auto auto 0;width:900px;height:300px;background:#0b1025;z-index:99999;--sky-foreground:#e0f2fe';
    host.innerHTML = '<svg viewBox="0 0 900 300"><style>' + cometCSS + '</style>' + renderContributionComet({state:'burst',days:7,events:21,missedDate:'2026-09-26'}, {centerY:150,spreadY:80,height:300}) + '</svg>';
    document.body.append(host);
    const flight = host.querySelector('.comet-flight'), shard = host.querySelector('.comet-shard');
    const animated = getComputedStyle(shard).animationName === 'comet-scatter' && getComputedStyle(flight).animationName === 'comet-arrival';
    for (const animation of host.getAnimations({subtree:true})) { animation.pause(); animation.currentTime = 2200; }
    return animated;
  })()`), true);
  const cometShot = await cdp('Page.captureScreenshot', { clip: { x: 0, y: 0, width: 900, height: 300, scale: 1 } });
  await mkdir('.dist', { recursive: true }); await writeFile('.dist/comet-burst.png', Buffer.from(cometShot.data, 'base64'));
  await evaluate(`document.querySelector('#comet-test-stage').remove()`);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.comet-flight')).animationName`), 'none');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate(`click('history-comet');`);
  await evaluate(`click('tab-layers'); window.chooseLayer = id => { const select=document.querySelector('#layer-select');select.value=id;select.dispatchEvent(new Event('change',{bubbles:true})); }; chooseLayer('labels');`);
  const unlockCometLab = async () => {
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key });
    }
  };
  assert.equal(await evaluate(`document.querySelector('#comet-lab')`), null, 'test controls are absent until unlocked');
  await evaluate(`document.querySelector('#username').focus()`);
  await unlockCometLab();
  assert.equal(await evaluate(`document.querySelector('#comet-lab')`), null, 'typing in inputs cannot unlock the lab');
  await evaluate(`document.activeElement.blur()`);
  await unlockCometLab();
  assert.equal(await evaluate(`document.querySelector('#comet-lab').open`), true);
  assert.equal(await evaluate(`document.activeElement.id`), 'comet-lab-days');
  await evaluate(`input('comet-lab-days', '42'); click('comet-lab-apply');`);
  assert.match(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay] .comet-active').textContent`), /42-day comet/);
  await evaluate(`input('max-repos', document.querySelector('#max-repos').value);`);
  assert.match(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay] .comet-active').textContent`), /42-day comet/, 'test state survives preview redraws');
  const exportWithTest = await evaluate(`(async () => (await fetch(document.querySelector('.download').href)).text())()`);
  assert.doesNotMatch(exportWithTest, /comet-lab|TEST ·|42-day comet/);
  await evaluate(`input('comet-lab-days', '0'); click('comet-lab-end');`);
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay] .comet-active'))`), 'invalid streak does not replace the current test');
  await evaluate(`input('comet-lab-days', '42'); click('comet-lab-end');`);
  assert.ok(await evaluate(`Boolean(document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay] .comet-burst.comet-motion'))`));
  await evaluate(`click('comet-lab-reset');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay]')`), null);
  await evaluate(`click('comet-lab-end'); document.querySelector('#comet-lab-close').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' });
  assert.equal(await evaluate(`document.querySelector('#comet-lab').open`), false);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay]')`), null, 'closing restores real activity');
  assert.equal(await evaluate(`document.querySelector('#layer-controls').closest('[role=tabpanel]').id`), 'panel-layers');
  assert.match(await evaluate(`document.querySelector('#scene-summary').textContent`), /visible nodes.*9 layers/);
  await evaluate(`click('layer-visible');`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.repo-label').length`), 0);
  assert.match(await evaluate(`document.querySelector('#workflow').value`), /"labels": \{\s+"visible": false/);
  await evaluate(`click('layer-reset');chooseLayer('starfield');input('layer-opacity','0.35');`);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-scene-layer="starfield"][opacity="0.35"]') !== null`));
  await evaluate(`click('layer-reset');chooseLayer('connections');document.querySelector('#layer-order').value='99';document.querySelector('#layer-order').dispatchEvent(new Event('change',{bubbles:true}));`);
  assert.match(await evaluate(`document.querySelector('#layer-error').textContent`), /behind nodes/);
  assert.equal(await evaluate(`document.querySelector('#layer-order').value`), '5');
  await evaluate(`chooseLayer('starfield');click('layer-edit-settings');`);
  assert.equal(await evaluate(`document.activeElement.id`), 'design-sky-mode');
  assert.equal(await evaluate(`document.querySelector('[role=tab][aria-selected=true]').id`), 'tab-look');
  await evaluate(`click('tab-layers');document.querySelector('#tab-layers').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
  assert.equal(await evaluate(`document.activeElement.id`), 'tab-story');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight' });
  assert.equal(await evaluate(`document.activeElement.id`), 'tab-save');
  await evaluate(`click('tab-layers');chooseLayer('selection');click('layer-visible');document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));`);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg').hasAttribute('data-exploring')`), false);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository[aria-pressed="true"]') !== null`));
  await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repository').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));click('layer-reset');`);
  await evaluate(`click('tab-look');`);
  assert.ok(await evaluate(`(() => {
    const root = document.querySelector('#preview').firstChild.shadowRoot;
    const nodes = [...root.querySelectorAll('.repository')];
    return nodes.length > 0 && nodes.every(node => {
      node.focus();
      if (root.activeElement !== node || node.tabIndex !== 0 || node.getAttribute('role') !== 'button' || !node.getAttribute('aria-label')) return false;
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      if (node.getAttribute('aria-pressed') !== 'true') return false;
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      node.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      if (node.getAttribute('aria-pressed') !== 'true') return false;
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return node.getAttribute('aria-pressed') === 'false';
    });
  })()`), 'every rendered studio node is focusable and supports keyboard selection');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`(() => { const root = document.querySelector('#preview').firstChild.shadowRoot; const node = root.querySelector('.repository'); node.focus(); return getComputedStyle(node).outlineStyle; })()`), 'solid');
  await evaluate(`click('tab-look');`);
  const overview = await evaluate(`(async () => {
    const { renderConstellation } = await import('/src/constellation.mjs');
    const { mountLabelEditor } = await import('/src/label-editor.mjs');
    const { mountGraphExplorer } = await import('/src/graph-explorer.mjs');
    const repos = Array.from({length:1024}, (_,i)=>({name:'node-'+i,full_name:'large/node-'+i,language:'Rust'}));
    const start = performance.now();
    const svg = renderConstellation('large',repos,{nodeCap:2048,maxRepos:2048,animate:false,identityRing:false});
    const host = document.createElement('div'), panel = document.createElement('div'); document.body.append(host,panel);
    mountLabelEditor(host,svg,()=>{},()=>{},true);
    mountGraphExplorer(host,panel,{},()=>{});
    const count = host.shadowRoot.querySelectorAll('.repository[tabindex="0"]').length;
    await new Promise(requestAnimationFrame);
    const elapsed = performance.now()-start;
    host.remove();panel.remove();
    return {count,elapsed};
  })()`);
  assert.equal(overview.count, 1024);
  assert.ok(overview.elapsed < 3000, '1024-node studio overview should settle within three seconds');
  assert.equal(await evaluate(`document.querySelector('#design-refinement-enabled').checked`), false);
  assert.equal(await evaluate(`document.querySelector('#design-refinement-intensity').disabled`), true);
  assert.equal(await evaluate(`document.querySelector('#design-refinement-enabled').closest('.inspector-panel').id`), 'panel-nodes');
  const originalPositions = await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star'),el=>[el.dataset.repo,el.getAttribute('cx'),el.getAttribute('cy')])`);
  await evaluate(`document.querySelector('#design-refinement-enabled').checked=true;document.querySelector('#design-refinement-enabled').dispatchEvent(new Event('input'));input('design-refinement-intensity','8');click('copy-config');`);
  assert.deepEqual(await evaluate(`JSON.parse(document.querySelector('#config-json').value).layoutRefinement`), { enabled: true, intensity: 8 });
  assert.equal(await evaluate(`document.querySelector('#lock-stars').checked`), true, 'refinement does not unlock dragging');
  await evaluate(`click('copy-share');`);
  assert.deepEqual(await evaluate(`(async()=>{const {decodeShare}=await import('/src/share-link.mjs');return decodeShare(document.querySelector('#share-url').value).options.layoutRefinement;})()`), { enabled: true, intensity: 8 });
  await evaluate(`click('close-share');document.querySelector('#design-refinement-enabled').checked=false;document.querySelector('#design-refinement-enabled').dispatchEvent(new Event('input'));`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star'),el=>[el.dataset.repo,el.getAttribute('cx'),el.getAttribute('cy')])`), originalPositions);
  await evaluate(`click('copy-share');`);
  assert.equal(await evaluate(`document.querySelector('#share-dialog').open`), true, await evaluate(`document.querySelector('#status').textContent`));
  assert.ok(await evaluate(`document.querySelector('#share-url').value.startsWith('https://mnichols08.github.io/constellation/')`), 'sharing from localhost creates a public link');
  assert.equal(await evaluate(`document.querySelector('#copy-share').closest('.design-launcher') !== null`), true);
  await evaluate(`click('close-share');`);
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
  await evaluate(`document.querySelector('#randomize-full').checked=true;document.querySelector('#randomize-full').dispatchEvent(new Event('input'));document.querySelector('#randomize-motion').checked=true;click('randomize-design');`);
  assert.notEqual(await evaluate(`document.querySelector('#design-code').value`), 'v1:browser');
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v6:mfff-/);
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
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v6:m000-/);
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
  assert.equal(await evaluate(`document.documentElement.dataset.entry`), 'result');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.controls')).display`), 'none');
  await delay(500);
  await cdp('Page.navigate', { url: base });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#design-seed')?.value==='shared'`)) break; await delay(100); }
  assert.equal(await evaluate(`document.querySelector('#design-seed').value`), 'shared');
  await evaluate(`document.querySelector('#open-studio').click()`);
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
  await evaluate(`document.activeElement.blur()`);
  await unlockCometLab();
  await evaluate(`document.querySelector('#comet-lab-apply').click(); account('another');`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title').textContent.includes('@another')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('[data-comet-lab-overlay]')`), null, 'switching accounts clears test data');
  await evaluate(`document.querySelector('#comet-lab-close').click();`);
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
  await evaluate(`document.querySelector('#randomize-full').checked=true;document.querySelector('#randomize-full').dispatchEvent(new Event('input'));document.querySelector('#randomize-motion').checked=true;document.querySelector('#randomize-motion').dispatchEvent(new Event('input'));for(const input of document.querySelectorAll('.randomize-motion-parts input')){input.checked=input.id==='randomize-ring2';input.dispatchEvent(new Event('input'));}document.querySelector('#randomize-design').click();`);
  assert.match(await evaluate(`document.querySelector('#design-code').value`), /^v6:m008-/);
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
  failPresetLanguage = true;
  await evaluate(`document.querySelector('#builtin-preset').value='recent-work';document.querySelector('#apply-builtin-preset').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
  assert.doesNotMatch(await evaluate(`document.querySelector('#status').textContent`), /applied/);
  assert.equal(await evaluate(`document.querySelector('#design-sortBy').value`), 'stars', 'failed preset restores controls');
  await evaluate(`document.querySelector('#copy-config').click();`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('#config-json').value).sortBy`), 'stars', 'failed preset keeps exports');
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length>0`));
  failPresetLanguage = false;
  // A different preset can select repositories outside the hydrated top 45.
  await evaluate(`document.querySelector('#builtin-preset').value='recent-work';document.querySelector('#apply-builtin-preset').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
  await evaluate(`document.querySelector('#copy-config').click();`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('#config-json').value).sortBy`), 'updated', 'preset updates exports as well as controls');
  assert.equal(await evaluate(`document.querySelector('#load-projects').hidden`), true, 'preset hydrates its selected repository pool');
  // Reject an unusable final render without losing the previous preset.
  await evaluate(`(()=>{const input=document.querySelector('#design-minStars');const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');Object.defineProperty(input,'value',{configurable:true,get(){return descriptor.get.call(this)},set(value){delete this.value;this.value='999999999'}});document.querySelector('#builtin-preset').value='minimal-readme';document.querySelector('#apply-builtin-preset').click();})()`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
  assert.match(await evaluate(`document.querySelector('#status').textContent`), /previous design is restored/);
  assert.equal(await evaluate(`document.querySelector('#layout').value`), 'atlas');
  await evaluate(`document.querySelector('#copy-config').click();`);
  assert.equal(await evaluate(`JSON.parse(document.querySelector('#config-json').value).sortBy`), 'updated');
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length>0`));
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
  await evaluate(`document.querySelector('#clear-repository-selection').click();document.querySelector('#repository-search').value='partial/repo-59';document.querySelector('#repository-search').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate(`document.querySelectorAll('#repository-picker-list input').length`), 1);
  await evaluate(`document.querySelector('#select-visible-repositories').click();document.querySelector('#repository-search').value='partial/repo-0';document.querySelector('#repository-search').dispatchEvent(new Event('input'));document.querySelector('#repository-picker-list input').click();document.querySelector('#apply-repository-selection').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-repository-selection').disabled`)) break; await delay(50); }
  await evaluate(`input('node-mode','repositories');document.querySelector('#copy-config').click();`);
  const pickedConfig = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  assert.deepEqual(pickedConfig.includeRepos, ['partial/repo-0', 'partial/repo-59']);
  assert.equal(pickedConfig.maxRepos, 2);
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star'),n=>n.dataset.repo).sort()`), pickedConfig.includeRepos);
  assert.match(await evaluate(`document.querySelector('#workflow').value`), /partial\/repo-59/);
  await evaluate(`document.querySelector('#copy-share').click();`);
  assert.deepEqual(await evaluate(`(async()=>{const {decodeShare}=await import('/src/share-link.mjs');return decodeShare(document.querySelector('#share-url').value).options.includeRepos;})()`), pickedConfig.includeRepos);
  await evaluate(`document.querySelector('#close-share').click();document.querySelector('#clear-repository-selection').click();document.querySelector('#apply-repository-selection').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-repository-selection').disabled`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length`), 0);
  await evaluate(`document.querySelector('#automatic-repositories').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#automatic-repositories').disabled`)) break; await delay(50); }
  await evaluate(`document.querySelector('#copy-config').click();`);
  assert.equal(JSON.parse(await evaluate(`document.querySelector('#config-json').value`)).includeRepos, undefined);
  await evaluate(`document.querySelector('#config-json').value=${JSON.stringify(JSON.stringify(pickedConfig))};document.querySelector('#import-config').click();`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('#repository-picker-list input:checked'),n=>n.value).sort()`), pickedConfig.includeRepos);
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
  await cdp('Page.navigate', { url: `${base}/?user=mnichols08&preset=minimal-readme&arrangement=solar-system&maxRepos=12&animate=false` });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title')?.textContent.includes('@mnichols08')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#layout').value`), 'compact', 'readable URL settings override saved drafts');
  assert.equal(await evaluate(`document.querySelector('#arrangement').value`), 'solar-system');
  assert.equal(await evaluate(`document.querySelector('#max-repos').value`), '12');
  await evaluate(`document.querySelector('#dark-accent').value='#e3de13';document.querySelector('#dark-accent').dispatchEvent(new Event('input'));`);
  for (const [id, expected] of [['flagship-projects', '#58a6ff'], ['language-orbits', '#ff79c6'], ['classic-constellation', '#9ab9ff']]) {
    await evaluate(`document.querySelector('#builtin-preset').value='${id}';document.querySelector('#apply-builtin-preset').click();`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(50); }
    assert.match(await evaluate(`document.querySelector('#status').textContent`), /applied/);
    assert.equal(await evaluate(`document.querySelector('#dark-accent').value`), expected, id + ' applies its theme');
    assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length > 0`), id + ' renders account nodes');
  }
  await evaluate(`document.querySelector('#randomize-full').checked=false;document.querySelector('#randomize-full').dispatchEvent(new Event('input'));document.querySelector('#randomize-styling').checked=false;document.querySelector('#randomize-motion').checked=true;document.querySelector('#copy-config').click();`);
  const lockedLook = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  await evaluate(`document.querySelector('#randomize-design').click();document.querySelector('#copy-config').click();`);
  const motionOnly = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  for (const key of ['visualTheme', 'visualStyle', 'nodeColors', 'arrangement', 'nodeMode', 'maxRepos', 'seed', 'includeRepos']) assert.deepEqual(motionOnly[key], lockedLook[key], 'animation shuffle preserves ' + key);
  assert.equal(motionOnly.designCode, undefined);
  assert.match(await evaluate(`document.querySelector('#status').textContent`), /Selected parts randomized|configuration/i);
  await evaluate(`document.querySelector('#randomize-motion').checked=false;document.querySelector('#randomize-repositories').checked=true;document.querySelector('#randomize-design').click();document.querySelector('#copy-config').click();`);
  const projectsOnly = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  assert.ok(projectsOnly.includeRepos.length > 0);
  for (const key of ['visualStyle', 'arrangement', 'seed', 'ringAnimation', 'floatingAnimation']) assert.deepEqual(projectsOnly[key], motionOnly[key], 'repository shuffle preserves ' + key);
  await evaluate(`document.querySelector('#randomize-repositories').checked=false;document.querySelector('#randomize-styling').checked=true;document.querySelector('#randomize-design').click();document.querySelector('#copy-config').click();`);
  const styleOnly = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  for (const key of ['includeRepos', 'arrangement', 'nodeMode', 'ringAnimation', 'floatingAnimation', 'animate']) assert.deepEqual(styleOnly[key], projectsOnly[key], 'styling shuffle preserves ' + key);
  // Simulate a control normalization mismatch after the metadata preflight.
  // The final render must reject it before replacing the image or export.
  await evaluate(`(()=>{const input=document.querySelector('#design-minStars');const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');Object.defineProperty(input,'value',{configurable:true,get(){return descriptor.get.call(this)},set(value){delete this.value;this.value='999999999'}});document.querySelector('#randomize-design').click();})()`);
  assert.match(await evaluate(`document.querySelector('#status').textContent`), /previous design is restored/);
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star').length>0`));
  assert.doesNotMatch(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.textContent`), /No projects match/);
  await evaluate(`document.querySelector('#copy-config').click();`);
  const restoredDraw = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  for (const key of ['visualStyle', 'minStars', 'includeRepos', 'history', 'designCode']) assert.deepEqual(restoredDraw[key], styleOnly[key], 'failed draw restores ' + key);
  assert.equal(await evaluate(`document.querySelector('#preset-keep-colors')`), null);
  await evaluate(`document.querySelector('#design-visualTheme').value='mnix';document.querySelector('#design-visualTheme').dispatchEvent(new Event('change'));`);
  assert.equal(await evaluate(`document.querySelector('#dark-background').value`), '#111111');
  assert.equal(await evaluate(`document.querySelector('#dark-accent').value`), '#e3de13');
  assert.equal(await evaluate(`document.querySelector('#dark-line').value`), '#555a38');
  assert.equal(await evaluate(`document.querySelector('#light-accent').value`), '#595600');
  for (const [mode, accent] of [['light', '#595600'], ['dark', '#e3de13']]) {
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
    assert.deepEqual(await evaluate(`(()=>{const svg=document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg');const style=getComputedStyle(svg);return [style.backgroundColor,style.getPropertyValue('--sky-accent').trim(),!!svg.querySelector('ellipse[fill="url(#nebula)"]')];})()`), ['rgba(0, 0, 0, 0)', accent, false]);
  }
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  for (const [id, darkAccent, lightAccent] of [['chingu', '#34d399', '#047857'], ['code-the-dream', '#ff5c35', '#c43d20']]) {
    await evaluate(`document.querySelector('#design-visualTheme').value='${id}';document.querySelector('#design-visualTheme').dispatchEvent(new Event('change'));document.querySelector('#copy-config').click();`);
    const branded = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
    assert.equal(branded.visualTheme, id);
    assert.equal(branded.visualStyle.dark.accent, darkAccent);
    assert.equal(branded.visualStyle.light.accent, lightAccent);
    assert.equal(branded.nodeColorMode, 'custom');
    for (const [mode, accent] of [['light', lightAccent], ['dark', darkAccent]]) {
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] });
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('svg')).getPropertyValue('--sky-accent').trim()`), accent);
    }
  }
  await cdp('Emulation.setEmulatedMedia', { features: [] });
  await cdp('Page.navigate', { url: `${base}/?user=alice&organization=collective&preset=organization-community&maxRepos=12` });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#map-title')?.textContent.includes('Organization universe')`)) break; await delay(50); }
  assert.equal(await evaluate(`document.querySelector('#username').value`), 'alice');
  assert.equal(await evaluate(`document.querySelector('#organization-account').value`), 'collective');
  assert.equal(await evaluate(`document.querySelector('#max-repos').value`), '12');
  await evaluate(`document.querySelector('#copy-share').click();`);
  assert.equal(await evaluate(`document.querySelector('#share-dialog').open`), true);
  assert.equal(await evaluate(`(async()=>{const {decodeShare}=await import('/src/share-link.mjs');return decodeShare(document.querySelector('#share-url').value).options.organizationUser;})()`), 'alice');
  await evaluate(`document.querySelector('#close-share').click();`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await evaluate(`document.querySelector('#tab-projects').click(); document.querySelector('#repository-history-open').click();`);
  assert.equal(await evaluate(`document.querySelector('#repository-history').open`), true);
  assert.ok(await evaluate(`Array.from(document.querySelector('#commit-repository-select').options).some(option => option.value === 'collective/repo-0')`));
  await evaluate(`const select=document.querySelector('#commit-repository-select');select.value='collective/repo-0';select.dispatchEvent(new Event('change'));document.querySelector('#commit-load').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelectorAll('#commit-viewport .commit-node').length === 4`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelectorAll('#commit-viewport .commit-node').length`), 4);
  assert.match(await evaluate(`document.querySelector('#commit-status').textContent`), /4 commits · 3 authors/);
  const callsBeforeHighlight = apiCalls;
  await evaluate(`document.querySelector('#commit-contributors [data-author="github:bob"]').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('#commit-viewport .commit-node[opacity=".22"]').length`), 3);
  assert.equal(apiCalls, callsBeforeHighlight, 'highlighting contributors uses loaded history');
  const exportedHistory = await evaluate(`(async()=> (await fetch(document.querySelector('#commit-download').href)).text())()`);
  assert.match(exportedHistory, /highlighting bob/); assert.doesNotMatch(exportedHistory, /<script|NaN/);
  await evaluate(`document.querySelector('#commit-contributors [data-author=""]').click();`);
  const commitShot = await cdp('Page.captureScreenshot');
  await writeFile('.dist/repository-commit-graph.png', Buffer.from(commitShot.data, 'base64'));
  await evaluate(`document.querySelector('#commit-load').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#commit-load').disabled`)) break; await delay(25); }
  assert.equal(apiCalls, callsBeforeHighlight, 'rebuilding cached graph does not fetch');
  for (const [branch, expected] of [['missing', 'not found'], ['empty', '0 commits']]) {
    await evaluate(`document.querySelector('#commit-branch').value='${branch}';document.querySelector('#commit-load').click();`);
    for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#commit-load').disabled`)) break; await delay(25); }
    assert.match(await evaluate(`document.querySelector('#commit-status').textContent`), new RegExp(expected));
    assert.equal(await evaluate(`document.querySelectorAll('#commit-viewport .commit-node').length`), 0);
  }
  await evaluate(`document.querySelector('#repository-history-close').click();`);
  await evaluate(`document.querySelector('#builtin-preset').value='commit-asteroids';document.querySelector('#apply-builtin-preset').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-builtin-preset').disabled`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#design-activityEffect').value`), 'asteroids');
  assert.equal(await evaluate(`document.querySelector('#history-comet').checked`), false);
  await evaluate(`document.querySelector('#load-commit-field').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.commit-asteroid').length >= 4`)) break; await delay(25); }
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.commit-asteroid').length >= 4`), 'real account loads actual commit asteroids');
  assert.ok(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.activity-asteroid-field a').getAttribute('href').startsWith('https://github.com/collective/repo-0/commit/')`));
  const fieldSVG = await evaluate(`(async()=> (await fetch(document.querySelector('.download').href)).text())()`);
  assert.match(fieldSVG, /activity-asteroid-field/); assert.doesNotMatch(fieldSVG, /commit-ship|commit-flight-path/);
  await cdp('Page.navigate', { url: `${base}/?user=alice&preset=project-map` });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#repository-picker-list')?.textContent.includes('alice/repo-0')`)) break; await delay(25); }
  await evaluate(`document.querySelector('#tab-projects').click(); document.querySelector('#find-contributed-repositories').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#find-contributed-repositories').disabled`)) break; await delay(25); }
  assert.match(await evaluate(`document.querySelector('#repository-picker-list').textContent`), /chingu-voyages\/team-project/);
  assert.match(await evaluate(`document.querySelector('#repository-picker-list').textContent`), /code-the-dream\/practicum/);
  assert.match(await evaluate(`document.querySelector('#repository-discovery-status').textContent`), /2 repositories found/);
  await evaluate(`document.querySelector('#clear-repository-selection').click();document.querySelector('#automatic-repositories').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#automatic-repositories').disabled`)) break; await delay(25); }
  assert.ok(await evaluate(`document.querySelectorAll('#repository-picker-list input:checked').length > 0`), 'automatic selection restores checkboxes after clearing an unapplied selection');
  await evaluate(`document.querySelector('#clear-repository-selection').click();document.querySelector('#add-repository-name').value='https://github.com/code-the-dream/practicum';document.querySelector('#add-public-repository').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#add-public-repository').disabled`)) break; await delay(25); }
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('#repository-picker-list input:checked'),input=>input.value)`), ['code-the-dream/practicum']);
  await evaluate(`document.querySelector('#apply-repository-selection').click();`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('#apply-repository-selection').disabled`)) break; await delay(25); }
  assert.match(await evaluate(`document.querySelector('#status').textContent`), /1 repositories selected/);
  assert.ok(await evaluate(`!!document.querySelector('#preview').firstChild.shadowRoot.querySelector('.star[data-repo="code-the-dream/practicum"]')`));
  await evaluate(`document.querySelector('#copy-config').click();document.querySelector('#copy-share').click();`);
  assert.deepEqual(JSON.parse(await evaluate(`document.querySelector('#config-json').value`)).includeRepos, ['code-the-dream/practicum']);
  const contributedShare = await evaluate(`document.querySelector('#share-url').value`);
  await evaluate(`sessionStorage.clear();localStorage.clear();`);
  await cdp('Page.navigate', { url: `${base}/${new URL(contributedShare).search}` });
  for (let i = 0; i < 100; i++) { if (await evaluate(`!!document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star[data-repo="code-the-dream/practicum"]')`)) break; await delay(25); }
  assert.ok(await evaluate(`!!document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star[data-repo="code-the-dream/practicum"]')`), 'team selections reload from a share link without cached repository data: ' + await evaluate(`JSON.stringify({url:location.href,status:document.querySelector('#status')?.textContent})`) + errors.join('\n'));
  await evaluate(`document.querySelector('#tab-projects').click();document.querySelector('#repository-search').closest('details').open=true;`);
  const contributedShot = await cdp('Page.captureScreenshot');
  await writeFile('.dist/contributed-repositories.png', Buffer.from(contributedShot.data, 'base64'));
  await evaluate(`document.querySelector('#node-mode').value='contributors';document.querySelector('#node-mode').dispatchEvent(new Event('input'));`);
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelectorAll('[data-kind="contributor"].star').length === 2`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('[data-kind="contributor"].star').length`), 2, 'switching a personal account to contributor mode loads team members');
  assert.match(await evaluate(`document.querySelector('#organization-status').textContent`), /1.*repositories/);
  await evaluate(`document.querySelector('#copy-share').click();`);
  const contributorViewShare = await evaluate(`document.querySelector('#share-url').value`);
  await evaluate(`sessionStorage.clear();localStorage.clear();`);
  await cdp('Page.navigate', { url: `${base}/${new URL(contributorViewShare).search}` });
  for (let i = 0; i < 100; i++) { if (await evaluate(`document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelectorAll('[data-kind="contributor"].star').length === 2`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('[data-kind="contributor"].star').length`), 2, 'shared personal contributor views load contributor data on a fresh visit');
  const themeBeforeCommitStars = await evaluate(`document.querySelector('#dark-accent').value`);
  await evaluate(`document.querySelector('#repository-history-open').click();document.querySelector('#commit-repository').value='collective/repo-0';document.querySelector('#commit-branch').value='main';document.querySelector('#commit-constellation').click();`);
  for (let i = 0; i < 120; i++) { if (await evaluate(`!document.querySelector('#repository-history').open`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#repository-history').open`), false, await evaluate(`document.querySelector('#commit-status').textContent`));
  assert.equal(await evaluate(`document.querySelector('#node-mode').value`), 'commits');
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star[data-kind="commit"]').length`), 4);
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.shared-language').length`), 4);
  assert.equal(await evaluate(`document.querySelector('#dark-accent').value`), themeBeforeCommitStars, 'commit stars preserve the chosen palette');
  await evaluate(`document.querySelector('#commit-star-authors [data-author="github:bob"]').click();`);
  assert.equal(await evaluate(`Array.from(document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.repository')).filter(node=>node.style.opacity==='0.2').length`), 3);
  await evaluate(`document.querySelector('#commit-star-authors [data-author=""]').click();`);
  await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.star[data-kind="commit"]').parentElement.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('#graph-explorer a')).some(link=>link.href.includes('/collective/repo-0/commit/'))`));
  await evaluate(`Array.from(document.querySelectorAll('#graph-explorer button')).find(button=>button.textContent==='Clear selection').click();document.querySelector('#copy-config').click();document.querySelector('#copy-share').click();`);
  const commitStarConfig = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  assert.equal(commitStarConfig.commitHistory.repository, 'collective/repo-0'); assert.equal(commitStarConfig.commitHistoryData, undefined);
  const commitStarShare = await evaluate(`document.querySelector('#share-url').value`);
  await evaluate(`sessionStorage.clear();localStorage.clear();`);
  await cdp('Page.navigate', { url: `${base}/${new URL(commitStarShare).search}` });
  for (let i = 0; i < 120; i++) { if (await evaluate(`document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelectorAll('.star[data-kind="commit"]').length === 4`)) break; await delay(25); }
  assert.equal(await evaluate(`document.querySelector('#preview').firstChild.shadowRoot.querySelectorAll('.star[data-kind="commit"]').length`), 4, 'commit constellation share restores real history');
  const commitStarsSVG = await evaluate(`(async()=> (await fetch(document.querySelector('.download').href)).text())()`);
  assert.match(commitStarsSVG, /data-kind="commit"/); assert.match(commitStarsSVG, /Commit ancestry/);
  const commitStarsShot = await cdp('Page.captureScreenshot');
  await writeFile('.dist/commit-stars.png', Buffer.from(commitStarsShot.data, 'base64'));
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
