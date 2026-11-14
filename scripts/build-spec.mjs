// Builds @constellation/spec: the ConstellationSpec engine (its own Rust/WASM
// module), the published schema, and the optional provider-neutral prompt
// layer. It is separate from @constellation/core so core stays within its size
// budget and nobody who never authors a spec pays for the engine.
import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const target = new URL('packages/spec/', root);
await rm(new URL('src/', target), { recursive: true, force: true });
const files = [
  'constellation-spec.mjs', 'constellation-spec-schema.mjs',
  'ai/index.mjs', 'ai/describe.mjs', 'ai/fake-model.mjs', 'ai/plan.mjs', 'ai/providers/anthropic.mjs',
  'wasm/constellation_spec.js', 'wasm/constellation_spec_bg.wasm',
];
for (const file of files) {
  const destination = new URL(`src/${file}`, target);
  await mkdir(new URL('./', destination), { recursive: true });
  await copyFile(new URL(`src/${file}`, root), destination);
}
await mkdir(new URL('schemas/', target), { recursive: true });
for (const schema of ['constellation-spec.v1.schema.json', 'constellation-tools.v1.json']) await copyFile(new URL(`schemas/${schema}`, root), new URL(`schemas/${schema}`, target));
await copyFile(new URL('docs/constellation-spec.md', root), new URL('README.md', target));
let version = '1.0.0';
try { version = JSON.parse(await readFile(new URL('package.json', target), 'utf8')).version; } catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(new URL('package.json', target), JSON.stringify({
  name: '@constellation/spec',
  version,
  type: 'module',
  description: 'ConstellationSpec: describe a constellation as validated semantic intent; Rust/WASM resolves and compiles it.',
  engines: { node: '>=22' },
  exports: {
    '.': './src/constellation-spec.mjs',
    './ai': './src/ai/index.mjs',
    './ai/anthropic': './src/ai/providers/anthropic.mjs',
    './schema.json': './schemas/constellation-spec.v1.schema.json',
    './tools.json': './schemas/constellation-tools.v1.json',
  },
  files: ['src', 'schemas', 'README.md'],
  license: 'UNLICENSED',
}, null, 2) + '\n');
console.log(`Built @constellation/spec ${version} (${files.length} files).`);
