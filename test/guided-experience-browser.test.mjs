import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { validatePortfolioArtifact } from '../src/portfolio-artifact.mjs';

test('public guided preview, ownership, mode parity, publishing and mobile keyboard controls', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate: e, waitFor: wait, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    const originalFetch=window.fetch;window.apiCalls=[];
    window.fetch=async(url,options)=>{
      if(!String(url).startsWith('https://api.github.com/'))return originalFetch(url,options);
      apiCalls.push(String(url));
      if(String(url).includes('/repos?'))return Response.json(Array.from({length:16},(_,i)=>({
        name:'r'+i,full_name:'alice/r'+i,language:i%2?'Rust':'HTML',topics:i%2?['tools']:['web'],
        created_at:'2020-01-01',updated_at:'2026-10-01',description:'Public project',private:false
      })));
      return Response.json({login:'alice',type:'User',public_repos:16});
    };` });
  await cdp('Page.reload');
  await cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait(`document.querySelector('#open-studio')?.disabled===false || document.querySelector('#status')?.getAttribute('role')==='alert'`);
  assert.deepEqual(errors, []);
  assert.equal(await e(`document.querySelector('#open-studio').disabled`), false, await e(`document.querySelector('#status').textContent`));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await e(`window.guidedStarted=performance.now();document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`);
  await wait(`document.querySelector('#guided-setup h2')?.textContent==='What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`);
  assert.equal(await e('apiCalls.length'), 2);
  assert.equal(await e(`document.activeElement.tagName`), 'H2');
  const unavailable = await e(`document.querySelector('#guided-setup [aria-describedby="guided-journey-reason"]').getAttribute('aria-disabled')`);
  assert.equal(unavailable, 'true');
  assert.match(await e(`document.querySelector('#guided-journey-reason').textContent`), /Dates and evidence/);
  await e(`document.querySelector('#guided-setup button').focus()`);
  assert.equal(await e(`document.activeElement.textContent`), 'Use recommendation');
  assert.equal(await e(`document.activeElement.disabled`), false);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await wait(`document.documentElement.dataset.entry==='result' || document.querySelector('#guided-status')?.textContent.length>0`);
  assert.deepEqual(errors, []);
  assert.equal(await e(`document.documentElement.dataset.entry`), 'result', await e(`document.querySelector('#guided-status').textContent`));
  const firstPreviewMs = await e(`performance.now()-guidedStarted`);
  assert.ok(firstPreviewMs < 90000, `fixture preview took ${firstPreviewMs} ms`);
  await e(`[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Personalize and continue').click()`);
  await wait(`document.documentElement.dataset.entry==='studio'`);
  assert.equal(await e(`document.querySelector('.studio-body').dataset.studioMode`), 'simple');
  await e(`document.querySelector('#copy-config').click()`);
  const before = await e(`document.querySelector('#config-json').value`);
  const svgBefore = await e(`document.querySelector('.download').href`);
  await e(`document.querySelector('#studio-mode-advanced').click();document.querySelector('#studio-mode-simple').click()`);
  await e(`document.querySelector('#copy-config').click()`);
  assert.equal(await e(`document.querySelector('#config-json').value`), before);
  assert.equal(await e(`document.querySelector('.download').href`), svgBefore, 'mode changes do not regenerate SVG');
  const modeSwitchMs = await e(`(()=>{
    const start=performance.now();
    for(let i=0;i<100;i++){document.querySelector('#studio-mode-advanced').click();document.querySelector('#studio-mode-simple').click();}
    return (performance.now()-start)/200;
  })()`);
  const browserResourceBytes = await e(`performance.getEntriesByType('resource').reduce((total,entry)=>total+entry.decodedBodySize,0)`);
  assert.equal(await e('apiCalls.length'), 2);
  assert.match(await e(`document.querySelector('#story-recommendation').textContent`), /recommended/);
  await e(`[...document.querySelectorAll('#simple-studio button')].find(b=>b.textContent==='Preview and prepare publishing').click()`);
  await e(`document.querySelector('#before-publish-preview').open=true`);
  await wait(`document.querySelectorAll('#publication-previews img').length===2`);
  const parity = await e(`(async()=>{
    const images=[...document.querySelectorAll('#publication-previews img')];
    return Promise.all(images.map(async img=>{
      const anchor=document.querySelector(img.width===480?'#download-profile-story-compact':'#download-profile-story');
      return (await (await fetch(img.src)).text())===(await (await fetch(anchor.href)).text());
    }));
  })()`);
  assert.deepEqual(parity, [true, true]);
  assert.match(await e(`document.querySelector('#publication-previews').textContent`), /Included projects \(12\)/);
  assert.match(await e(`document.querySelector('#publish-status').textContent`), /workflow is installed/);
  await e(`document.querySelector('#publish-destination').value='portfolio';document.querySelector('#publish-destination').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#publish-format').value='html';document.querySelector('#publish-format').dispatchEvent(new Event('change',{bubbles:true}))`);
  assert.match(await e(`document.querySelector('#publish-status').textContent`), /cannot verify/);
  await wait(`(document.querySelector('#download-portfolio-package')?.href || document.querySelector('#download-portfolio-package')?.textContent.startsWith('Portable package unavailable')) && !document.querySelector('#download-portfolio-package').hidden`);
  assert.ok(await e(`Boolean(document.querySelector('#download-portfolio-package').href)`), await e(`document.querySelector('#download-portfolio-package').textContent`));
  const packedArtifact = await e(`(async()=>await (await fetch(document.querySelector('#download-portfolio-package').href)).json())()`);
  const artifactValidation = await validatePortfolioArtifact(packedArtifact.manifest, packedArtifact.files);
  assert.equal(packedArtifact.manifest.version, 1);
  assert.equal(packedArtifact.manifest.sceneVersion, 1);
  assert.equal(packedArtifact.manifest.entryPoints.interactive, 'constellation.html');
  assert.ok(artifactValidation.files >= 5);
  await e(`document.querySelector('#return-to-editing').click()`);
  assert.equal(await e(`document.activeElement.id`), 'studio-mode-simple');
  assert.equal(await e('apiCalls.length'), 2);
  assert.equal(await e(`document.documentElement.scrollWidth<=innerWidth`), true);
  await e(`document.querySelector('[data-story-choice="projects"]').click()`);
  assert.match(await e(`document.querySelector('#story-recommendation').textContent`), /story selected/);
  await e(`document.querySelector('[data-story-choice="auto"]').click()`);
  assert.match(await e(`document.querySelector('#story-recommendation').textContent`), /recommended/);
  await cdp('Page.reload');
  await wait(`document.querySelector('#open-studio')?.disabled===false`);
  await e(`document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`);
  await wait(`!![...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Continue saved design')`);
  await e(`[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Continue saved design').click();[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Prepare publishing').click()`);
  assert.equal(await e(`document.querySelector('#publish-destination').value`), 'portfolio');
  assert.equal(await e(`document.querySelector('#publish-format').value`), 'html');
  t.diagnostic(JSON.stringify({ fixtureFirstPreviewMs: firstPreviewMs, decisionsBeforePreview: 2, meanModeSwitchMs: modeSwitchMs, browserResourceBytes }));
  assert.deepEqual(errors, []);
});

for (const version of [6, 7]) test(`saved v${version} manual design survives onboarding, Auto, and mode transitions`, { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate: e, waitFor: wait, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
  const options = {
    arrangement: 'rings', layout: 'atlas', maxRepos: 10, nodeMode: 'repositories', showOther: true,
    starPositions: { 'manual/r0': { x: 400, y: 200 } },
    labelPositions: { 'manual/r0': { x: 400, y: 220 } },
    labelOffsets: { 'manual/r0': { x: 0, y: 20 } },
    hiddenNodes: ['manual/r2'], hiddenLabels: ['manual/r1'],
    customCSS: '.star{stroke-width:2px}', nodeColors: { 'manual/r0': '#abcdef' },
    projectShowcase: { 'manual/r0': { role: 'featured', priority: 1 } },
    projectFamilies: { pair: { label: 'Authored pair', members: ['manual/r0', 'manual/r1'] } },
    projectRelationships: [['manual/r0', 'manual/r1']],
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('constellation-config-v1:manual',JSON.stringify({version:1,presets:[],draft:${JSON.stringify({ version, account: 'manual', ...options })}}));
    const originalFetch=window.fetch;window.manualCalls=[];
    window.fetch=async(url,settings)=>{
      if(!String(url).startsWith('https://api.github.com/'))return originalFetch(url,settings);
      manualCalls.push(String(url));
      return Response.json(String(url).includes('/repos?')?Array.from({length:3},(_,i)=>({name:'r'+i,full_name:'manual/r'+i,private:false})): {login:'manual',type:'User'});
    };` });
  await cdp('Page.reload');
  await wait(`document.querySelector('#open-studio')?.disabled===false`);
  await e(`document.querySelector('#username').value='manual';document.querySelector('#account-form').requestSubmit()`);
  await wait(`!![...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Continue saved design')`);
  assert.match(await e(`document.querySelector('#story-recommendation').textContent`), /Custom view/);
  await e(`[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Continue saved design').click();[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent==='Personalize and continue').click()`);
  await e(`document.querySelector('#copy-config').click()`);
  const config = await e(`JSON.parse(document.querySelector('#config-json').value)`);
  for (const key of Object.keys(options)) assert.deepEqual(config[key], options[key], key);
  const source = await e(`document.querySelector('#config-json').value`);
  await e(`document.querySelector('#studio-mode-advanced').click();document.querySelector('#studio-mode-simple').click()`);
  await e(`document.querySelector('#copy-config').click()`);
  assert.equal(await e(`document.querySelector('#config-json').value`), source);
  assert.equal(await e('manualCalls.length'), 2);
  assert.equal(await e(`document.querySelector('[data-story-choice="technical-shape"]').getAttribute('aria-disabled')`), 'true');
  assert.equal(await e(`document.querySelector('[data-story-choice="journey"]').getAttribute('aria-disabled')`), 'true');
  await e(`document.querySelector('[data-story-choice="auto"]').click()`);
  await e(`document.querySelector('#copy-config').click()`);
  const after = await e(`JSON.parse(document.querySelector('#config-json').value)`);
  for (const key of Object.keys(options)) assert.deepEqual(after[key], options[key], key);
  assert.equal(await e('manualCalls.length'), 2);
  assert.deepEqual(errors, []);
});
