#!/usr/bin/env node
import { codingRhythmOptions, deriveCodingRhythm } from './coding-rhythm.mjs';
import { needsHistoryEvents } from './history/settings.mjs';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { username, fetchRepositories, fetchRepositoryLanguages, selectRepositoryPool, selectRepositories, explainFilters, rustAvailable, engineError, createPluginHost, migrateConfig, migrateWorkflow } from '../packages/core/src/core-api.mjs';
import { loadConfig } from './config.mjs';
import { aggregateActivity, activityOptions, normalizePublicEvents } from './activity.mjs';
import { fetchPublicActivity } from './github-activity.mjs';
import { createOrganizationData, attachFocusEvidence } from './organization/data.mjs';
import { organizationOptions } from './organization/settings.mjs';

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.gh_token;
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { username: { type: 'string' }, output: { type: 'string' }, config: { type: 'string' }, from: { type: 'string' }, workflow: { type: 'string' }, fixture: { type: 'string' }, 'activity-fixture': { type: 'string' }, 'refresh-data': { type: 'boolean', default: false }, 'dry-run': { type: 'boolean' }, explain: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' } } });
  if (values.help) {
    console.log('Usage: constellation [validate|migrate] [options]\n\n  --config FILE       Read JSON settings (or use CONSTELLATION_CONFIG_JSON)\n  --from VALUE        Migrate a design code or share URL\n  --workflow FILE     Migrate an existing v1 workflow\n  --username NAME     GitHub account for generation or code migration\n  --fixture FILE      Read repositories offline\n  --output FILE       Destination (migration defaults to stdout)\n  --dry-run           Compute without writing SVG, cache or Action outputs\n  --explain           Print filter report as JSON on stdout\n  --refresh-data      Refresh fetched data\n  --version           Print installed version\n\nvalidate and migrate make no GitHub requests. See docs/migration-v2.md.');
    return;
  }
  if (values.version) { console.log(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version); return; }
  if (!rustAvailable) throw new Error(`Could not load the Rust engine: ${engineError?.message}. Restore the core package WASM or run npm run build:rust and npm run build:core.`);
  if (positionals.length > 1 || (positionals.length && !['validate', 'migrate'].includes(positionals[0]))) throw new Error('Expected validate, migrate, or generation flags.');
  if (positionals[0] === 'migrate') {
    if ([values.config, values.from, values.workflow].filter(Boolean).length !== 1) throw new Error('migrate requires exactly one of --config FILE, --from CODE_OR_URL, or --workflow FILE.');
    const input = values.from || await readFile(values.config || values.workflow, 'utf8');
    const settings = { account: values.username || process.env.CONSTELLATION_USERNAME || 'your-universe' };
    const result = values.workflow ? migrateWorkflow(input, settings) : JSON.stringify(migrateConfig(input, settings), null, 2) + '\n';
    if (values.output && !values['dry-run']) { await mkdir(dirname(values.output), { recursive: true }); await writeFile(values.output, result); }
    else process.stdout.write(result);
    return;
  }
  const configPath = values.config || process.env.CONSTELLATION_CONFIG;
  const config = await loadConfig(configPath, process.env.CONSTELLATION_CONFIG_JSON);
  if (positionals[0] === 'validate') {
    if (!configPath && !process.env.CONSTELLATION_CONFIG_JSON) throw new Error('validate requires --config file.json or CONSTELLATION_CONFIG_JSON.');
    console.log(JSON.stringify({ valid: true, errors: [] }));
    return;
  }
  const account = username(values.username || process.env.CONSTELLATION_USERNAME);
  const cacheFile = '.cache/constellation-organization.json';
  let savedCache = '{}';
  try { savedCache = await readFile(cacheFile, 'utf8'); } catch {}
  const organization = createOrganizationData({ token, storage: { getItem: () => savedCache, setItem: (_key, value) => { savedCache = value; } } });
  const accountData = values.fixture ? { login: account, type: config.accountType === 'organization' ? 'Organization' : 'User' } : await organization.resolve(account, config, values['refresh-data']);
  const settings = organizationOptions(config);
  if (settings.contributors.strategy === 'deep') console.warn('Deep contributor scan: up to ' + settings.contributors.maxRepositories + ' API requests. Cached results will be reused; coverage remains bounded.');
  const focus = !values.fixture && accountData.type === 'Organization' && config.organizationUser ? await organization.focusRepositories(account, config.organizationUser, { refresh: values['refresh-data'] }) : null;
  const discovery = !values.fixture && accountData.type === 'Organization' && config.repoSource !== 'pinned' ? await organization.discover(account, config, { refresh: values['refresh-data'] }) : null;
  let listed = values.fixture ? JSON.parse(await readFile(values.fixture, 'utf8')) : discovery?.repositories || await fetchRepositories(account, { token, repoSource: config.repoSource });
  if (focus && config.repoSource !== 'pinned') listed = [...new Map([...listed, ...focus.repositories].map(repo => [repo.full_name, repo])).values()];
  config.accountData = accountData;
  if (accountData.type === 'Organization') {
    config.organizationData = values.fixture ? { records: Object.fromEntries(listed.map(repo => [repo.full_name, repo.contributors || []])), metadataComplete: true } : { ...await organization.contributors(listed, config, { refresh: values['refresh-data'] }), discovered: listed.length, metadataComplete: discovery?.complete ?? true };
    config.organizationData = attachFocusEvidence(config.organizationData, focus, config.organizationUser, listed);
    if (!values.fixture && !values['dry-run']) { await mkdir(dirname(cacheFile), { recursive: true }); await writeFile(cacheFile, savedCache); }
    if (discovery?.diagnostic) console.warn(discovery.diagnostic);
    if (config.organizationData.diagnostic) console.warn(config.organizationData.diagnostic);
  }
  let enriched = listed;
  if (!values.fixture) { try { enriched = await fetchRepositoryLanguages(selectRepositoryPool(listed, config), { token }); } catch (error) { if (accountData.type !== 'Organization') throw error; console.warn('Language details incomplete; using primary languages. ' + error.message); } }
  // Retain the full public list for historical selection without fetching languages
  // for every repository. Older frames can use their known primary language.
  const byName = new Map(enriched.map(repo => [repo.full_name, repo]));
  const pluginHost = createPluginHost();
  const repos = [...listed.map(repo => byName.get(repo.full_name) || repo), ...await pluginHost.load(config, { account, refresh: values['refresh-data'] })];
  const generatedAt = new Date().toISOString();
  let activityData, codingRhythmData, historyData;
  if (needsHistoryEvents(config) || activityOptions(config).activityEffect !== 'off' || (codingRhythmOptions(config).codingRhythm && config.codingRhythmStyle !== 'hidden')) {
    const snapshot = values['activity-fixture'] ? { events: normalizePublicEvents(JSON.parse(await readFile(values['activity-fixture'], 'utf8'))), asOf: config.activityMetricDate || generatedAt }
      : values.fixture ? { events: [], asOf: config.activityMetricDate || generatedAt }
        : await fetchPublicActivity(account, { token, asOf: generatedAt, accountType: accountData.type === 'Organization' ? 'organization' : 'user' });
    if (snapshot.diagnostic) console.warn(snapshot.diagnostic);
    historyData = snapshot;
    codingRhythmData = deriveCodingRhythm(snapshot.events, config, config.activityMetricDate || snapshot.asOf);
    activityData = aggregateActivity(snapshot.events, selectRepositories(repos, config), config, snapshot.asOf);
  }
  const svg = pluginHost.render(account, repos, { ...config, activityData, codingRhythmData, historyData, generatedAt });
  if (values.explain) console.log(JSON.stringify(explainFilters(repos, config)));
  if (values['dry-run']) return;
  const output = values.output || process.env.CONSTELLATION_OUTPUT || 'dist/constellation.svg';
  if (/[\r\n]/.test(output)) throw new Error('Invalid output path.');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, svg);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `svg=${output}\n`);
  (values.explain ? console.error : console.log)(`Generated ${output} for @${account}.`);
}
try { await main(); } catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
