import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';

test('web component package works outside the repository with bounded assets and accessible controls', { skip: !browser, timeout: 30000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'constellation-consumer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['core', 'web-component']) await cp(new URL(`../packages/${name}/`, import.meta.url), join(root, 'node_modules', '@constellation', name), { recursive: true });
  const directory = join(root, 'node_modules', '@constellation', 'web-component');
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const core = JSON.parse(await readFile(join(root, 'node_modules', '@constellation', 'core', 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['@constellation/core'], core.version);
  assert.deepEqual((await readdir(directory)).sort(), ['README.md', 'index.mjs', 'package.json']);
  assert.ok((await stat(join(directory, 'index.mjs'))).size < 24 * 1024);
  const coreFiles = await readdir(join(root, 'node_modules', '@constellation', 'core'), { recursive: true });
  let bytes = 0;
  for (const file of coreFiles) { const info = await stat(join(root, 'node_modules', '@constellation', 'core', file)); if (info.isFile()) bytes += info.size; }
  assert.ok(bytes < 2 * 1024 * 1024, `Core package exceeds 2 MiB: ${bytes}`);
  await writeFile(join(root, 'index.html'), `<!doctype html><html lang="en"><title>Consumer</title>
<script type="importmap">{"imports":{"@constellation/core":"/node_modules/@constellation/core/src/core-api.mjs","@constellation/core/browser-runtime":"/node_modules/@constellation/core/src/browser-runtime.mjs","@constellation/web-component":"/node_modules/@constellation/web-component/index.mjs"}}</script>
<constellation-view></constellation-view><script type="module">import '@constellation/web-component'; const view=document.querySelector('constellation-view'); view.records=[{name:'compiler',full_name:'demo/compiler',language:'Rust'}]; view.config={version:6,account:'demo',options:{animate:false}};</script></html>`);
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.mjs') || path.endsWith('.js') ? 'text/javascript' : 'text/html');
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, cdp, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
  await waitFor(`Boolean(document.querySelector('constellation-view')?.shadowRoot?.querySelector('.star'))`);
  const accessibility = await cdp('Accessibility.getFullAXTree');
  assert.ok(accessibility.nodes.some(node => node.role?.value === 'button' && node.name?.value === 'Zoom in'));
  assert.ok(accessibility.nodes.some(node => node.role?.value === 'button' && node.name?.value.includes('compiler')));
  await evaluate(`document.querySelector('constellation-view').shadowRoot.querySelector('.repository').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter' });
  assert.equal(await evaluate(`document.querySelector('constellation-view').selection.start`), 'demo/compiler');
  const original = await evaluate(`document.querySelector('constellation-view').scene.metadata.account`);
  assert.equal(await evaluate(`(() => { const view=document.querySelector('constellation-view'); const scene=view.scene; scene.presentation.options.css='@import "https://example.com/attack.css";'; return view.loadScene(scene); })()`), false);
  assert.equal(await evaluate(`document.querySelector('constellation-view').scene.metadata.account`), original);
  assert.deepEqual(errors, []);
});
