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
