import { performance } from 'node:perf_hooks';
import { createScene, renderSceneHTML, htmlBundleStatistics } from '../src/core-api.mjs';

const results = [45, 256, 2048].map(count => {
  const records = Array.from({ length: count }, (_, i) => ({ name: `project-${i}`, full_name: `benchmark/project-${i}`, language: ['Rust', 'JavaScript'][i % 2] }));
  const scene = createScene('benchmark', records, { nodeCap: count > 100 ? count : 100, maxRepos: count, animate: false, referenceDate: '2026-09-01T00:00:00Z' });
  const start = performance.now();
  renderSceneHTML(scene);
  const renderMs = performance.now() - start, sizes = htmlBundleStatistics(scene);
  if (sizes.htmlBytes > 12 * 1024 * 1024 || sizes.runtimeBytes > 1024 * 1024) throw new Error('Interactive artifact exceeds size budget.');
  return { nodes: count, renderMs, ...sizes };
});
console.log(JSON.stringify(results, null, 2));
