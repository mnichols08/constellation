import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

async function withPreview(t, run) {
  const server = createPreviewServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  await run(`http://127.0.0.1:${server.address().port}`);
}

test('preview server serves every module in the Project Constellation Studio import graph', async t => {
  await withPreview(t, async origin => {
    const pending = ['/src/preview.mjs', '/src/github-project-structure.mjs', '/src/project-constellation.mjs', '/src/project-constellation-scene.mjs', '/src/scene-framing.mjs'];
    const visited = new Set();
    while (pending.length) {
      const path = pending.pop();
      if (visited.has(path)) continue;
      visited.add(path);
      const response = await fetch(new URL(path, origin));
      assert.equal(response.status, 200, `${path} must be available to the Studio browser`);
      const source = await response.text();
      for (const match of source.matchAll(/\b(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.(?:mjs|js))['"]/g)) {
        const dependency = new URL(match[1], new URL(path, origin)).pathname;
        if (dependency.startsWith('/src/') || dependency.startsWith('/packages/')) pending.push(dependency);
      }
    }
    for (const required of ['/src/hierarchy.mjs', '/src/scene.mjs', '/src/hierarchy-model.mjs']) {
      assert.ok(visited.has(required), `${required} should be in the audited graph`);
    }
  });
});

test('preview Studio boots and exposes its explicit Project Constellation action', { skip: !browser, timeout: 120000 }, async t => {
  await withPreview(t, async origin => {
    const { evaluate, waitFor, errors } = await openBrowser(t, origin);
    await waitFor(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
    assert.equal(await evaluate(`Boolean(document.querySelector('#open-studio'))`), true);
    await evaluate(`document.querySelector('#open-studio').click()`);
    await waitFor(`document.body.classList.contains('studio-ready')`);
    assert.deepEqual(errors, []);
  });
});
