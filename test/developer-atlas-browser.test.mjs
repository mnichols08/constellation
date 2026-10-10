import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';
import { createScene } from '../src/constellation.mjs';
import { semanticGraphFromScene, serializeSemanticGraph, semanticGraphFingerprint } from '../src/semantic-graph.mjs';

test('Studio imported Developer Atlas drills into a canonical group and project offline', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.atlasNetwork=[];const originalFetch=window.fetch;window.fetch=(...args)=>{atlasNetwork.push(String(args[0]));if(String(args[0]).includes('api.github.com'))throw Error('Atlas must not fetch');return originalFetch(...args)}` });
  await cdp('Page.reload');
  await waitFor(`document.querySelector('#open-studio')?.disabled===false`);
  await evaluate(`document.querySelector('#open-studio').click()`);
  await waitFor(`document.body.classList.contains('studio-ready')`);
  const graph = semanticGraphFromScene(createScene('atlas-alice', [
    { full_name: 'atlas-alice/one', name: 'one', language: 'Rust' },
    { full_name: 'atlas-alice/two', name: 'two', language: 'Rust' },
    { full_name: 'atlas-bob/other', name: 'other', language: 'JavaScript' },
  ], { projectFamilies: { tools: { label: 'Developer Tools', members: ['atlas-alice/one', 'atlas-alice/two'] } } }));
  const json = serializeSemanticGraph(graph), fingerprint = semanticGraphFingerprint(graph);
  await evaluate(`{const input=document.querySelector('#import-semantic-graph');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(json)}],'atlas-alice.semantic-graph.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await waitFor(`document.querySelector('#semantic-graph-status').textContent.includes('Imported offline') && document.querySelector('#preview').querySelector('[aria-label="Developer Atlas"]')`);
  assert.equal(await evaluate(`document.querySelector('#preview').querySelector('[aria-label="Atlas context"]').textContent.includes('Developer Tools')`), true);
  await evaluate(`[...document.querySelectorAll('.developer-atlas-actions button')].find(button=>button.textContent.includes('Developer Tools')).click()`);
  await waitFor(`document.querySelector('#preview').querySelector('[aria-label="Atlas context"]').textContent.includes('User-authored group')`);
  await evaluate(`[...document.querySelectorAll('.developer-atlas-actions button')].find(button=>button.textContent.includes('one')).click()`);
  await waitFor(`document.querySelector('#preview').querySelector('[aria-label="Atlas context"]').textContent.includes('Structural detail is not included')`);
  assert.deepEqual(await evaluate(`Array.from(document.querySelector('#preview').querySelectorAll('.developer-atlas button[aria-current="location"]'),button=>button.textContent)`), ['one']);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), 'Developer Atlas: atlas-alice › Developer Tools › one');
  assert.equal((await evaluate(`document.querySelector('#semantic-graph-status').textContent`)).includes(fingerprint), true);
  await evaluate(`document.querySelector('#preview').querySelector('.developer-atlas button').click()`);
  assert.match(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), /Developer Atlas: atlas-alice › Developer Tools/);
  assert.equal(await evaluate(`atlasNetwork.filter(url=>url.includes('api.github.com')).length`), 0);
  assert.deepEqual(errors, []);
});

test('Studio live constellation activates the shared Atlas and keeps semantic exports stable', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.liveAtlasFetches=[];const originalFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('api.github.com'))liveAtlasFetches.push(String(args[0]));return originalFetch(...args)}` });
  await cdp('Page.reload');
  await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
  await evaluate(`document.querySelector('#open-studio').click()`);
  await waitFor(`document.querySelector('#preview').querySelector('[aria-label="Developer Atlas"]')`);
  const graph = await evaluate(`fetch(document.querySelector('#download-semantic-graph').href).then(response=>response.json())`);
  assert.equal(graph.subject.kind, 'developer');
  const group = graph.groups.find(item => item.members.length >= 2);
  assert.ok(group, 'sample live graph includes at least one canonical group');
  const before = await evaluate(`Promise.all(['#download-semantic-graph','#download-semantic-markdown'].map(selector=>fetch(document.querySelector(selector).href).then(response=>response.text())))`);
  await evaluate(`document.querySelectorAll('.developer-atlas-actions button')[0].click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label').includes(${JSON.stringify(group.label)})`);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${group.label}`);
  assert.match(await evaluate(`document.querySelector('#preview .developer-atlas-context').textContent`), /Derived group/);
  const member = group.members[0];
  const memberLabel = graph.nodes.find(node => node.id === member).label;
  await evaluate(`Array.from(document.querySelectorAll('.developer-atlas-actions button')).find(button=>button.textContent===${JSON.stringify('Explore ' + memberLabel)}).click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label').endsWith(${JSON.stringify(memberLabel)})`);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${group.label} › ${memberLabel}`);
  await evaluate(`document.querySelector('#preview .developer-atlas button[aria-label="Back in Developer Atlas"]').click()`);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${group.label}`);
  await evaluate(`document.querySelector('#preview .developer-atlas button[aria-label="Back in Developer Atlas"]').click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label')===${JSON.stringify('Developer Atlas: ' + graph.subject.id)}`);
  await evaluate(`Array.from(document.querySelectorAll('.developer-atlas-actions button')).find(button=>button.textContent===${JSON.stringify('Explore ' + memberLabel)}).click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label').endsWith(${JSON.stringify(memberLabel)})`);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${memberLabel}`);
  const after = await evaluate(`Promise.all(['#download-semantic-graph','#download-semantic-markdown'].map(selector=>fetch(document.querySelector(selector).href).then(response=>response.text())))`);
  assert.deepEqual(after, before);
  assert.equal(await evaluate(`window.liveAtlasFetches.length`), 0, 'Developer to Group to Project remains local after account data is loaded');
  assert.deepEqual(errors, []);
});

test('live Project structure is explicit, bounded, and failure atomic', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.atlasScanFail=true;window.atlasScanCalls=[];const baseFetch=window.fetch;window.fetch=(input,init)=>{const url=String(input),path=new URL(url).pathname;if(url.startsWith('https://api.github.com/repos/')){window.atlasScanCalls.push(url);if(window.atlasScanFail&&path.startsWith('/repos/')&&path.split('/').length===4)return Promise.resolve(Response.json({message:'test failure'},{status:503}));if(path.includes('/commits/'))return Promise.resolve(Response.json({sha:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',commit:{tree:{sha:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}}}));if(path.includes('/git/trees/'))return Promise.resolve(Response.json({truncated:false,tree:[{path:'src',type:'tree'},{path:'src/index.js',type:'blob',size:10}]}));if(path.startsWith('/repos/'))return Promise.resolve(Response.json({default_branch:'main',private:false}));}return baseFetch(input,init)}` });
  await cdp('Page.reload');
  await waitFor(`Array.isArray(window.atlasScanCalls)`);
  await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
  await evaluate(`document.querySelector('#open-studio').click()`);
  await waitFor(`document.querySelector('#preview').querySelector('[aria-label="Developer Atlas"]')`);
  const graph = await evaluate(`fetch(document.querySelector('#download-semantic-graph').href).then(response=>response.json())`);
  const project = graph.nodes.find(node=>node.kind==='project'); assert.ok(project);
  await evaluate(`Array.from(document.querySelectorAll('.developer-atlas-actions button')).find(button=>button.textContent===${JSON.stringify('Explore ' + project.label)}).click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label').endsWith(${JSON.stringify(project.label)})`);
  const backDisabledBeforeScan = await evaluate(`document.querySelector('#preview').querySelector('.developer-atlas button[aria-label="Back in Developer Atlas"]').disabled`);
  assert.equal(backDisabledBeforeScan, false);
  assert.equal(await evaluate(`window.atlasScanCalls?.length || 0`), 0, 'entering Project performs no scan');
  await evaluate(`document.querySelector('#preview').querySelector('.developer-atlas-context button').click()`);
  await waitFor(`document.querySelector('#project-constellation-dialog').open`);
  await evaluate(`document.querySelector('#project-constellation-start').click()`);
  await waitFor(`document.querySelector('#project-constellation-status').textContent.includes('503')`);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${project.label}`);
  const historyAfterFailure = await evaluate(`document.querySelector('#preview').querySelector('.developer-atlas button[aria-label="Back in Developer Atlas"]').disabled`);
  assert.equal(historyAfterFailure, backDisabledBeforeScan);
  await evaluate(`window.atlasScanFail=false;document.querySelector('#project-constellation-start').click()`);
  await waitFor(`document.querySelector('#preview').getAttribute('aria-label').includes(' › src')`);
  assert.equal(await evaluate(`document.querySelector('#project-constellation-dialog').open`), false);
  assert.equal(await evaluate(`document.querySelector('#preview').getAttribute('aria-label')`), `Developer Atlas: ${graph.subject.id} › ${project.label} › src › src/index.js`);
  assert.equal(await evaluate(`(window.atlasScanCalls?.length || 0) >= 4`), true);
  assert.deepEqual(errors, []);
});
