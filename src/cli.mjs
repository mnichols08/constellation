import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { username, fetchRepositories, fetchRepositoryLanguages, selectRepositoryPool, selectRepositories, renderConstellation } from './constellation.mjs';
import { loadConfig } from './config.mjs';
import { rustAvailable, engineError } from './engine.mjs';
import { aggregateActivity, activityOptions, normalizePublicEvents } from './activity.mjs';
import { fetchPublicActivity } from './github-activity.mjs';

try {
  if (!rustAvailable) throw new Error(`Could not load the Rust engine: ${engineError?.message}. Restore src/wasm or run npm run build:rust.`);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.gh_token;
  const { values } = parseArgs({ options: { username: { type: 'string' }, output: { type: 'string' }, config: { type: 'string' }, fixture: { type: 'string' }, 'activity-fixture': { type: 'string' } } });
  const account = username(values.username || process.env.CONSTELLATION_USERNAME);
  const configPath = values.config || process.env.CONSTELLATION_CONFIG;
  const config = await loadConfig(configPath, process.env.CONSTELLATION_CONFIG_JSON);
  const listed = values.fixture ? JSON.parse(await readFile(values.fixture, 'utf8')) : await fetchRepositories(account, { token, repoSource: config.repoSource });
  const repos = values.fixture ? listed : await fetchRepositoryLanguages(selectRepositoryPool(listed, config), { token });
  const generatedAt = new Date().toISOString();
  let activityData;
  if (activityOptions(config).activityEffect !== 'off') {
    const snapshot = values['activity-fixture'] ? { events: normalizePublicEvents(JSON.parse(await readFile(values['activity-fixture'], 'utf8'))), asOf: config.activityMetricDate || generatedAt }
      : values.fixture ? { events: [], asOf: config.activityMetricDate || generatedAt }
        : await fetchPublicActivity(account, { token, asOf: generatedAt });
    if (snapshot.diagnostic) console.warn(snapshot.diagnostic);
    activityData = aggregateActivity(snapshot.events, selectRepositories(repos, config), config, snapshot.asOf);
  }
  const svg = renderConstellation(account, repos, { ...config, activityData, generatedAt });
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
