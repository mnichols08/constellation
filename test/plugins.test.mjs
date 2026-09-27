import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginHost, serializeConfig, parseConfig } from '../src/core-api.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';
import { themePacks } from '../packages/themes/index.mjs';

const feed = (id, items) => ({ id, source: 'json-feed', options: { items } });
test('source instances coexist, report collisions, render custom nodes and preserve config', async () => {
  const host = createPluginHost();
  host.registerSource({ id: 'custom', apiVersion: 1, load: async () => [{ id: 'one', name: 'Custom' }], renderNode: () => ({ path: 'M0 -1 L1 1 L-1 1 Z', fill: '#abcdef' }) });
  const options = { plugins: { sources: [feed('a', [{ id: 'one', name: 'First' }]), { id: 'b', source: 'custom' }] }, animate: false };
  const nodes = await host.load(options);
  assert.deepEqual(nodes.map(node => node.full_name), ['source:a:one', 'source:b:one']);
  assert.match(host.render('tester', nodes, options), /class="plugin-node-icon"/);
  assert.equal(host.render('tester', nodes, options), host.render('tester', nodes, options));
  const restored = parseConfig(serializeConfig('tester', options));
  assert.deepEqual(decodeShare(encodeShare('https://example.com/', 'tester', restored.options)).options.plugins, options.plugins);
  await assert.rejects(host.load({ plugins: { sources: [feed('a', [{ id: 'one', name: 'A' }, { id: 'one', name: 'B' }])] } }), /Duplicate source node ID/);
  assert.throws(() => host.registerSource({ id: 'custom', apiVersion: 1, load() {} }), /already registered/);
});

test('JSON feed uses the injected fetch and rejects malformed feeds', async () => {
  let calls = 0;
  const host = createPluginHost({ fetchImpl: async url => { calls++; assert.equal(url, 'https://example.com/feed.json'); return Response.json([{ id: 'x', name: 'Feed' }]); } });
  const config = { plugins: { sources: [{ id: 'feed', source: 'json-feed', options: { url: 'https://example.com/feed.json' } }] } };
  assert.equal((await host.load(config))[0].name, 'Feed'); assert.equal(calls, 1);
  await assert.rejects(createPluginHost({ fetchImpl: async () => Response.json({}) }).load(config), /array/);
});

test('independent theme packs swap and portable embedded themes render identically', async () => {
  const host = createPluginHost();
  for (const pack of themePacks) host.registerThemePack(pack);
  const nodes = await host.load({ plugins: { sources: [feed('a', [{ id: 'one', name: 'A' }])] } });
  const pack = themePacks[0], options = { animate: false, themePack: { id: pack.id, version: pack.version } };
  const first = host.render('tester', nodes, options);
  assert.equal(first, host.render('tester', nodes, { ...options, themePack: pack }));
  assert.notEqual(first, host.render('tester', nodes, { ...options, themePack: themePacks[1] }));
  const external = { ...pack, id: 'external', version: '2.0.0' };
  host.registerThemePack(external);
  const restored = parseConfig(serializeConfig('tester', { ...options, themePack: { id: external.id, version: external.version } }));
  assert.match(host.render('tester', nodes, restored.options), /<svg/);
});
