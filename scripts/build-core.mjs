import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'src');
const target = resolve(root, 'packages/core');
const visited = new Set();
async function copyModule(path) {
  if (visited.has(path)) return;
  visited.add(path);
  const name = relative(source, path);
  if (name.startsWith('..')) throw new Error(`Core dependency escapes src: ${name}`);
  const destination = resolve(target, 'src', name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(path, destination);
  if (!/\.(mjs|js)$/.test(path)) return;
  const code = await readFile(path, 'utf8');
  for (const match of code.matchAll(/(?:from\s*|import\s*\(|new URL\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    await copyModule(resolve(dirname(path), match[1]));
  }
}
await copyModule(resolve(source, 'core-api.mjs'));
await copyModule(resolve(source, 'browser-runtime.mjs'));
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
await writeFile(resolve(target, 'package.json'), JSON.stringify({ name: '@constellation/core', version, type: 'module', description: 'Deterministic GitHub constellation layout and SVG rendering with bundled Rust/WASM.', engines: { node: '>=22' }, exports: { '.': './src/core-api.mjs', './browser-runtime': './src/browser-runtime.mjs' }, files: ['src', 'README.md', 'scene-api.md', 'layers.md', 'data-pipeline.md', 'layout-api.md', 'interactive-html.md'], license: 'UNLICENSED' }, null, 2) + '\n');
await copyFile(resolve(root, 'docs/core-api.md'), resolve(target, 'README.md'));
await copyFile(resolve(root, 'docs/scene-api.md'), resolve(target, 'scene-api.md'));
await copyFile(resolve(root, 'docs/layers.md'), resolve(target, 'layers.md'));
await copyFile(resolve(root, 'docs/data-pipeline.md'), resolve(target, 'data-pipeline.md'));
await copyFile(resolve(root, 'docs/layout-api.md'), resolve(target, 'layout-api.md'));
console.log(`Built @constellation/core ${version} (${visited.size} files).`);

await copyFile(resolve(root, 'docs/interactive-html.md'), resolve(target, 'interactive-html.md'));
