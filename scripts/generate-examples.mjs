import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseConfig } from '../src/config-schema.mjs';
import { renderConstellation } from '../src/constellation.mjs';

// Synthetic public projects keep the gallery reproducible without API access.
const groups = { Rust: ['orbit-core', 'starship', 'signal'], JavaScript: ['stargazer', 'tiny-world', 'moonrise'], Python: ['night-sky', 'telescope', 'atlas'], TypeScript: ['constellation', 'sky-map', 'observatory'] };
const repos = Object.entries(groups).flatMap(([language, names]) => names.map((name, i) => ({ name, full_name: `example/${name}`, language, languages: { [language]: 100 }, topics: i % 2 ? ['tools'] : ['space', 'creative-coding'], stargazers_count: [128, 32, 8][i], created_at: '2020-01-01T00:00:00Z', pushed_at: `202${i + 3}-01-01T00:00:00Z` })));
await mkdir(new URL('../examples/gallery/', import.meta.url), { recursive: true });
for (const name of ['deep-space', 'terminal', 'minimal', 'solar-system']) {
  const { options } = parseConfig(await readFile(new URL(`../examples/${name}.json`, import.meta.url), 'utf8'));
  const svg = renderConstellation('example', repos, options);
  await writeFile(new URL(`../examples/gallery/${name}.svg`, import.meta.url), svg);
  console.log(`${name}: ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KiB`);
}
