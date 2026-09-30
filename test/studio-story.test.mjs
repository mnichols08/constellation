import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

test('ordinary Studio has no legacy creation controls', { skip: !browser, timeout: 30000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
  await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
  await evaluate(`document.querySelector('#open-studio').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('#tab-story,#story-controls,#story-create').length`), 0);
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[role=tab]'),node=>node.textContent)`), ['Look','Motion','Projects','Nodes','Layers','Save']);
  assert.deepEqual(errors, []);
});
