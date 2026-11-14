// ConstellationSpec engine timings on synthetic accounts. Fails when a budget is exceeded.
import { performance } from 'node:perf_hooks';
import { stat } from 'node:fs/promises';
import { createConstellationEngine, specPlacements } from '../src/constellation-spec.mjs';

const languages = ['Rust', 'TypeScript', 'Python', 'Go', 'JavaScript', 'CSS', 'Shell', 'HTML'];
const topics = ['web', 'cli', 'data', 'graphics', 'tools', 'systems', 'ml', 'docs', 'api', 'game'];
const repositories = (count) => Array.from({ length: count }, (_, i) => ({
  name: `project-${i}`, full_name: `benchmark/project-${i}`, language: languages[i % 8], languages: { [languages[i % 8]]: 900, [languages[(i * 3) % 8]]: 100 },
  topics: [topics[i % 10], topics[(i * 7) % 10]], stargazers_count: i, pushed_at: '2026-09-01T00:00:00Z', created_at: `${2012 + (i % 14)}-01-01T00:00:00Z`,
}));
const spec = {
  schema_version: 1, focus: { kind: 'language', value: 'Rust' },
  groups: [{ name: 'Command line', match: { topic: 'cli' }, placement: 'outer' }],
  relationships: [{ basis: 'shared_topic', strength: 1 }, { basis: 'shared_language', strength: 0.6 }],
  layout: { kind: 'radial', cluster_by: ['topic', 'language'] },
};
const mean = (runs, fn) => { fn(); const start = performance.now(); for (let i = 0; i < runs; i += 1) fn(); return (performance.now() - start) / runs; };
const round = (value) => Number(value.toFixed(3));

const results = [25, 100, 500, 2048].map((count) => {
  const data = repositories(count);
  const runs = count > 400 ? 5 : 40;
  const engines = [];
  const build = mean(runs, () => engines.push(createConstellationEngine(data)));
  const engine = engines.pop();
  for (const other of engines) other.destroy();
  const graphStart = performance.now();
  const edges = engine.edges().weights.length;
  const graph = performance.now() - graphStart;
  const result = {
    repositories: count,
    engineBuildMs: round(build),
    firstGraphQueryMs: round(graph),
    edges,
    validateMs: round(mean(runs, () => engine.validateSpec(spec))),
    compileMs: round(mean(runs, () => engine.compileSpec(spec))),
    layoutPlacementsMs: round(mean(runs, () => specPlacements(spec, data))),
    previewGroupMs: round(mean(runs, () => engine.previewGroup(spec.groups[0]))),
    neighborsMs: round(mean(200, () => engine.neighbors(`benchmark/project-${count >> 1}`))),
    pathMs: round(mean(50, () => engine.path('benchmark/project-0', `benchmark/project-${count - 1}`))),
  };
  engine.destroy();
  return result;
});
const wasmBytes = (await stat(new URL('../src/wasm/constellation_spec_bg.wasm', import.meta.url))).size;
console.log(JSON.stringify({ wasmBytes, results }, null, 2));

const at = (count) => results.find((result) => result.repositories === count);
// Layout asks for placements on every pass, so it must stay far below a frame for a normal map.
if (at(100).layoutPlacementsMs > 25) throw new Error('Spec placements for 100 projects exceed 25 ms.');
if (at(2048).engineBuildMs > 1500 || at(2048).compileMs > 2500 || at(2048).firstGraphQueryMs > 2500) throw new Error('Spec engine exceeds its budget at 2,048 projects.');
if (at(2048).neighborsMs > 5) throw new Error('Neighbour queries must reuse retained adjacency.');
if (wasmBytes > 300 * 1024) throw new Error('Spec WASM exceeds 300 KiB.');
