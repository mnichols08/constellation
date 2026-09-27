import test from 'node:test';
import assert from 'node:assert/strict';
import { renderConstellation, graphNodes, layoutStatistics, createPluginHost } from '../src/core-api.mjs';

const repos = Array.from({ length: 1024 }, (_, i) => ({ name: `node-${i}`, full_name: `scale/node-${i}`, language: i % 2 ? 'Rust' : 'JavaScript', topics: ['tools'] }));
const options = { nodeCap: 2048, maxRepos: 2048, animate: false, identityRing: false, snapToRings: false };
const positions = svg => new Map([...svg.matchAll(/<circle class="star" cx="([^"]+)" cy="([^"]+)"[^>]*data-repo="([^"]+)"/g)].map(m => [m[3], [m[1], m[2]]]));

test('1024-node overview reuses unaffected Rust coordinates across styles and filters', () => {
  const before = positions(renderConstellation('scale', repos, options));
  assert.equal(before.size, 1024);
  const computed = layoutStatistics.computedNodes;
  const styled = positions(renderConstellation('scale', repos, { ...options, colors: { star: '#123456' } }));
  assert.deepEqual(styled, before);
  assert.equal(layoutStatistics.computedNodes, computed);
  const subset = positions(renderConstellation('scale', repos, { ...options, languages: ['Rust'] }));
  assert.equal(subset.size, 512);
  assert.equal(layoutStatistics.computedNodes, computed);
  for (const [id, xy] of subset) assert.deepEqual(xy, before.get(id));
  const withNew = [...repos, { name: 'added', full_name: 'scale/added', language: 'Rust' }];
  renderConstellation('scale', withNew, options);
  assert.equal(layoutStatistics.computedNodes, computed + 1);
  assert.ok(graphNodes(repos, { ...options, nodeMode: 'combined' }).nodes.length > 1024);
});

test('large overview retains manual nodes and labels and reports bounded labels', () => {
  const diagnostics = [];
  const locked = { ...options, starPositions: { 'scale/node-0': { x: 100, y: 100 } }, labelOffsets: { 'scale/node-0': { x: 10, y: 20 } }, hiddenNodes: ['scale/node-1'] };
  const svg = renderConstellation('scale', repos, locked, { onDiagnostic: item => diagnostics.push(item) });
  assert.deepEqual(positions(svg).get('scale/node-0'), ['100.0', '100.0']);
  assert.ok(!positions(svg).has('scale/node-1'));
  assert.match(svg, /data-repo="scale\/node-0" x="110.0" y="120.0"/);
  assert.ok(diagnostics.some(item => item.reason === 'large-graph-overview'));
});

test('source snapshots survive view changes and explicit refresh gets fresh data', async () => {
  let calls = 0;
  const host = createPluginHost().registerSource({ id: 'counted', apiVersion: 1, load: async () => [{ id: 'x', name: `snapshot-${++calls}` }] });
  const config = { plugins: { sources: [{ id: 'one', source: 'counted' }] } };
  assert.equal((await host.load(config))[0].name, 'snapshot-1');
  assert.equal((await host.load({ ...config, theme: 'light' }))[0].name, 'snapshot-1');
  assert.equal((await host.load(config, { refresh: true }))[0].name, 'snapshot-2');
  assert.equal(calls, 2);
});
