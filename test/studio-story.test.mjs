import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

test('Studio story editor captures, edits, reorders, previews and removes chapters', { skip: !browser, timeout: 30000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
  await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
  await evaluate(`document.querySelector('#open-studio').click(); document.querySelector('[role=tab][aria-controls="panel-story"]').click(); document.querySelector('#story-create').click();`);
  assert.equal(await evaluate(`document.querySelector('#story-chapters').options.length`), 1);
  await evaluate(`const title=document.querySelector('#story-title'); title.value='Opening'; title.dispatchEvent(new Event('input')); document.querySelector('#story-duplicate').click();`);
  assert.equal(await evaluate(`document.querySelector('#story-chapters').options.length`), 2);
  await evaluate(`document.querySelector('#story-up').click()`);
  assert.equal(await evaluate(`document.querySelector('#story-chapters').value`), '0');
  assert.match(await evaluate(`document.querySelector('#story-chapters').options[0].textContent`), /Opening copy/);
  await evaluate(`document.querySelector('#story-down').click(); document.querySelector('button#story-preview').click()`);
  await waitFor(`document.querySelector('iframe#story-preview-frame').srcdoc.includes('Content-Security-Policy')`);
  assert.ok(await evaluate(`document.querySelector('iframe#story-preview-frame').srcdoc.includes('Opening copy')`));
  let rendered = '', sessionId;
  for (let i = 0; i < 50 && !rendered; i++) {
    if (!sessionId) {
      const targets = await cdp('Target.getTargets');
      const target = targets.targetInfos.find(target => target.type === 'iframe' && target.url === 'about:srcdoc');
      if (target) ({ sessionId } = await cdp('Target.attachToTarget', { targetId: target.targetId, flatten: true }));
    }
    if (sessionId) {
      const result = await cdp('Runtime.evaluate', { expression: "document.querySelector('[aria-label=Story] h2')?.textContent", returnByValue: true }, sessionId);
      rendered = result.result.value;
    }
    if (!rendered) await delay(100);
  }
  assert.equal(rendered, 'Opening copy', 'sandboxed preview runs at the active chapter');
  await evaluate(`document.querySelector('#story-remove').click()`);
  assert.equal(await evaluate(`document.querySelector('#story-chapters').options.length`), 1);
  await evaluate(`const doc = new DOMParser().parseFromString(document.querySelector('#story-preview-frame').srcdoc, 'text/html'); const transfer = new DataTransfer(); transfer.items.add(new File([doc.querySelector('#constellation-scene').textContent], 'story.json', {type:'application/json'})); const input=document.querySelector('#story-import'); input.files=transfer.files; input.dispatchEvent(new Event('change'));`);
  await waitFor(`document.querySelector('#story-status').textContent === 'Story imported.'`);
  assert.equal(await evaluate(`document.querySelector('#story-chapters').options.length`), 2);
  await evaluate(`document.querySelector('#story-chapters').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home' });
  assert.deepEqual(errors, []);
});
