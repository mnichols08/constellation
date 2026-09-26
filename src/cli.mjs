import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { username, fetchRepositories, fetchRepositoryLanguages, selectRepositoryPool, renderConstellation } from './constellation.mjs';
import { loadConfig } from './config.mjs';

try {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.gh_token;
  const { values } = parseArgs({ options: { username: { type: 'string' }, output: { type: 'string' }, config: { type: 'string' }, fixture: { type: 'string' } } });
  const account = username(values.username || process.env.CONSTELLATION_USERNAME);
  const configPath = values.config || process.env.CONSTELLATION_CONFIG;
  const config = await loadConfig(configPath, process.env.CONSTELLATION_CONFIG_JSON);
  const listed = values.fixture ? JSON.parse(await readFile(values.fixture, 'utf8')) : await fetchRepositories(account, { token });
  const repos = values.fixture ? listed : await fetchRepositoryLanguages(selectRepositoryPool(listed, config), { token });
  const svg = renderConstellation(account, repos, config);
  const output = values.output || process.env.CONSTELLATION_OUTPUT || 'dist/constellation.svg';
  if (/[\r\n]/.test(output)) throw new Error('Invalid output path.');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, svg);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `svg=${output}\n`);
  console.log(`Generated ${output} for @${account}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
