import { codingRhythmOptions } from './coding-rhythm.mjs';
import { organizationEnabled, organizationOptions, organizationModes, organizationLayouts } from './organization/settings.mjs';
import { scopeRepositories } from './organization/model.mjs';
import { organizationGraph, organizationPositions } from './organization/graph.mjs';
import { visualCSS } from './visual-style.mjs';
import { historyOptions } from './history/settings.mjs';
import { referenceDate, historicalSnapshot } from './history/historical-snapshot.mjs';
import { projectLifecycle } from './history/project-lifecycle.mjs';
import { historyLayers, historyCSS, timelinePositions } from './history/history-svg.mjs';
import { renderTimeLapse } from './history/time-lapse-svg.mjs';
import { aggregateActivity } from './activity.mjs';
import { deriveCodingRhythm } from './coding-rhythm.mjs';
import { renderCodingRhythm, codingRhythmCSS, rhythmDescription } from './coding-rhythm-svg.mjs';
import { githubMark } from './github-mark.mjs';
import { resolveSeed } from './seeded-random.mjs';
import { starfieldOptions, renderStarfield, starfieldCSS } from './starfield.mjs';
import { activityOptions, activityForNode } from './activity.mjs';
import { activityMarkup, activityCSS } from './activity-effects.mjs';
import { resolveTheme } from './themes.mjs';
import { artifactLayouts, artifactPositions } from './artifact-layouts.mjs';
import { mappedColor, mappedGlow, connectionWeight, mappingOptions, shapeFor, shapeDefinitions, decoration } from './visual-mapping.mjs';
import { filterRepositoryMetadata, compareRepositories } from './repository-filters.mjs';
import { nodeRadius } from './node-sizing.mjs';
import { exportSettings, profileDimensions } from './export-image.mjs';
import { focusSVG } from './selection.mjs';
import { perspectiveOptions, perspectiveMarkup } from './perspective.mjs';
import { animateRingSVG, ringAnimationOptions, floatingAnimationOptions } from './ring-animation.mjs';
import { computeScene, identityGeometry, identityPoints, projectNodes, rustAvailable } from './engine.mjs';

export function username(value = '') {
  const name = value.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '').replace(/^@/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(name)) throw new Error('Enter a GitHub username or profile URL.');
  return name;
}

export async function fetchRepositories(account, { token, signal, fetchImpl = fetch, repoSource = 'all' } = {}) {
  if (repoSource === 'pinned') return fetchPinnedRepositories(account, { token, signal, fetchImpl });
  if (repoSource !== 'all') throw new Error('repoSource must be all or pinned.');
  const name = username(account);
  const repositories = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetchImpl(`https://api.github.com/users/${name}/repos?type=owner&sort=full_name&per_page=100&page=${page}`, {
      signal: signal || AbortSignal.timeout(20000),
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (response.status === 404) throw new Error('GitHub account not found.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached. Try again later or use GITHUB_TOKEN in the generator.');
    if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub response.');
    repositories.push(...batch.filter(repo => repo.private !== true));
    if (batch.length < 100) return repositories;
  }
  throw new Error('Account exceeds the 10,000 repository limit.');
}

export async function fetchPinnedRepositories(account, { token, signal, fetchImpl = fetch } = {}) {
  const name = username(account);
  if (!token) throw new Error('Pinned repositories require a GitHub token. Use GH_TOKEN in the local server or the automatic GITHUB_TOKEN in Actions.');
  const query = `query ConstellationPins($login: String!, $after: String) {
    repositoryOwner(login: $login) {
      ... on User { pinnedItems(first: 100, after: $after, types: [REPOSITORY]) { ...Pins } }
      ... on Organization { pinnedItems(first: 100, after: $after, types: [REPOSITORY]) { ...Pins } }
    }
  }
  fragment Pins on PinnableItemConnection {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Repository {
      name nameWithOwner isPrivate isFork isArchived description homepageUrl createdAt updatedAt pushedAt forkCount issues(states: OPEN) { totalCount } stargazerCount primaryLanguage { name }
      repositoryTopics(first: 100) { nodes { topic { name } } }
    } }
  }`;
  const repositories = [];
  let after = null;
  for (let page = 0; page < 100; page++) {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST', signal: signal || AbortSignal.timeout(20000), redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables: { login: name, after } }),
    });
    if (response.status === 401) throw new Error('GitHub rejected the token used to load pinned repositories.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached or token access denied while loading pinned repositories.');
    if (!response.ok) throw new Error(`Could not load pinned repositories (${response.status}).`);
    const body = await response.json();
    if (body.errors?.length) throw new Error('GitHub could not load pinned repositories. Check the account name, token access, and GraphQL rate limit.');
    if (body.data?.repositoryOwner === null) throw new Error('GitHub account not found.');
    const connection = body.data?.repositoryOwner?.pinnedItems;
    if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== 'boolean') throw new Error('Unexpected GitHub pinned repository response.');
    for (const repo of connection.nodes) {
      // Never include private pins even when the server token can read them.
      if (!repo || repo.isPrivate === true) continue;
      if (repo.isPrivate !== false || typeof repo.name !== 'string' || !/^[a-z\d][a-z\d-]*\/[a-z\d_.-]+$/i.test(repo.nameWithOwner || '') || !Array.isArray(repo.repositoryTopics?.nodes)) throw new Error('Unexpected GitHub pinned repository response.');
      repositories.push({ name: repo.name, full_name: repo.nameWithOwner, private: false, fork: repo.isFork,
        description: repo.description, homepage: repo.homepageUrl, archived: repo.isArchived, created_at: repo.createdAt, updated_at: repo.updatedAt, pushed_at: repo.pushedAt, forks_count: repo.forkCount, open_issues_count: repo.issues?.totalCount,
        stargazers_count: repo.stargazerCount, language: repo.primaryLanguage?.name || null,
        topics: repo.repositoryTopics.nodes.map(node => node.topic.name), pinned: true, pin_order: repositories.length });
    }
    if (!connection.pageInfo.hasNextPage) return repositories;
    const cursor = connection.pageInfo.endCursor;
    if (typeof cursor !== 'string' || !cursor || cursor === after) throw new Error('Invalid GitHub pinned repository pagination.');
    after = cursor;
  }
  throw new Error('Pinned repository pagination exceeded its limit.');
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function selectRepositoryPool(repositories, options = {}) {
  const historical = options.history?.mode === 'historical' || options.historicalYear !== undefined;
  const date = referenceDate(options, new Date().toISOString());
  if (historical) repositories = historicalSnapshot(repositories, date);
  const { maxRepos = 45, includeForks = true, includeRepos, repoSource = 'all', sortBy = 'stars' } = options;
  if (!['all', 'pinned'].includes(repoSource)) throw new Error('repoSource must be all or pinned.');
  if (!Number.isInteger(maxRepos) || maxRepos < 1 || maxRepos > 100) throw new Error('maxRepos must be an integer between 1 and 100.');
  const eligible = filterRepositoryMetadata(repositories, options, date).filter(repo => repo.private !== true && (repoSource !== 'pinned' || repo.pinned === true) && (includeForks || !repo.fork) && (!includeRepos || includeRepos.includes(repo.name) || includeRepos.includes(repo.full_name)));
  if (organizationEnabled(options)) {
    const focus = options.organizationUser?.toLowerCase(), records = options.organizationData?.records;
    const community = ['community', 'collaboration'].includes(options.organizationView) || ['contributors', 'ecosystem', 'organization-community'].includes(options.nodeMode);
    const scoped = community && records && eligible.some(repo => records[repo.full_name]) ? eligible.filter(repo => records[repo.full_name]) : eligible;
    const relevant = focus && records ? scoped.filter(repo => records[repo.full_name]?.some(person => person.login?.toLowerCase() === focus)) : [];
    const prioritized = new Set(relevant.map(repo => repo.full_name));
    return [...scopeRepositories(relevant, options, 100), ...scopeRepositories(scoped.filter(repo => !prioritized.has(repo.full_name)), options, 100)].slice(0, options.maxRepos ?? 100);
  }
  return eligible
    .sort((a, b) => repoSource === 'pinned' ? (a.pin_order || 0) - (b.pin_order || 0) : compareRepositories(a, b, sortBy)).slice(0, repoSource === 'pinned' ? 100 : maxRepos);
}

export function selectRepositories(repositories, options = {}) {
  const { languages, topics, showOther = false } = options;
  for (const [key, value] of Object.entries({ languages, topics })) {
    if (value !== undefined && value !== null && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw new Error(`${key} must be an array of names or null for all.`);
  }
  return selectRepositoryPool(repositories, options).filter(repo => {
    const detected = repositoryLanguages(repo);
    if (!showOther && !detected.length) return false;
    const matchesLanguage = languages == null || detected.some(language => languages.includes(language)) || (showOther && !detected.length && languages.includes('Other'));
    const matchesTopic = topics == null || (repo.topics || []).some(topic => topics.includes(topic));
    return matchesLanguage && matchesTopic;
  });
}

export function sharedConnections(from, to, { languages, topics, connectionBasis = 'languages' } = {}) {
  const sharedLanguages = connectionBasis === 'topics' ? [] : repositoryLanguages(from).filter(language => (languages == null || languages.includes(language)) && repositoryLanguages(to).includes(language));
  const sharedTopics = connectionBasis === 'languages' ? [] : [...new Set(from.topics || [])].filter(topic => (topics == null || topics.includes(topic)) && (to.topics || []).includes(topic)).sort();
  return { sharedLanguages, sharedTopics, shared: [...sharedLanguages, ...sharedTopics.map(topic => `#${topic}`)] };
}

export function repositoryLanguages(repo) {
  // A fetched empty result means no detected code, not a failed lookup.
  return repo.languages ? Object.keys(repo.languages).filter(key => repo.languages[key] > 0).sort() : repo.language ? [repo.language] : [];
}

export function graphNodes(repositories, options = {}) {
  const mode = options.nodeMode ?? 'repositories';
  if (organizationEnabled(options) || organizationModes.includes(mode)) {
    // Aggregate the same filtered scope, without the direct-node cap.
    const source = filterRepositoryMetadata(repositories, options, referenceDate(options, new Date().toISOString())).filter(repo => repo.private !== true && (options.includeForks !== false || !repo.fork) && (options.repoSource !== 'pinned' || repo.pinned) && (!options.includeRepos || options.includeRepos.includes(repo.name) || options.includeRepos.includes(repo.full_name)));
    const filtered = source.filter(repo => selectRepositories([repo], { ...options, maxRepos: 1 }).length);
    return organizationGraph(filtered, selectRepositories(repositories, options), options);
  }
  if (!['repositories', 'languages', 'topics', 'combined'].includes(mode)) throw new Error('nodeMode must be repositories, languages, topics or combined.');
  const repos = selectRepositories(repositories, options);
  if (mode === 'repositories') return { nodes: repos, total: repos.length, repositoryCount: repos.length };
  const projected = projectNodes({ mode, repos: repos.map(repo => ({ id: repo.full_name,
    languages: (repositoryLanguages(repo).length ? repositoryLanguages(repo) : options.showOther ? ['Other'] : []).filter(value => options.languages == null || options.languages.includes(value)),
    topics: (repo.topics || []).filter(value => options.topics == null || options.topics.includes(value)),
  })) });
  return { nodes: projected.nodes.map(node => ({ full_name: node.id, name: node.label, ...(node.kind === 'repository' ? repos.find(repo => repo.full_name === node.id) : {}), nodeKind: node.kind, members: node.members, stargazers_count: node.kind === 'repository' ? repos.find(repo => repo.full_name === node.id)?.stargazers_count || 0 : node.members.length })), total: projected.total, repositoryCount: repos.length };
}

export async function fetchRepositoryLanguages(repositories, { token, signal, fetchImpl = fetch, cache = new Map(), onProgress = () => {} } = {}) {
  const publicRepos = repositories.filter(repo => repo.private !== true);
  let next = 0, completed = 0, failure;
  const results = new Array(publicRepos.length);
  async function worker() {
    while (next < publicRepos.length && !failure) {
      const index = next++, repo = publicRepos[index];
      try {
        if (repo.languages) { results[index] = repo; onProgress(++completed, publicRepos.length); continue; }
        if (!cache.has(repo.full_name)) {
          const request = (async () => {
            const parts = repo.full_name.split('/');
            if (parts.length !== 2 || !parts.every(part => /^[a-z\d_.-]+$/i.test(part))) throw new Error('Invalid repository name.');
            const response = await fetchImpl(`https://api.github.com/repos/${parts.map(encodeURIComponent).join('/')}/languages`, {
              signal: signal || AbortSignal.timeout(20000),
              headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached while loading languages. Try later or use GITHUB_TOKEN with the generator.');
            if (!response.ok) throw new Error(`Could not load languages for ${repo.full_name} (${response.status}).`);
            const languages = await response.json();
            if (!languages || Array.isArray(languages) || typeof languages !== 'object' || Object.values(languages).some(bytes => !Number.isFinite(bytes) || bytes < 0)) throw new Error('Unexpected GitHub language response.');
            return languages;
          })();
          cache.set(repo.full_name, request);
          request.catch(() => { if (cache.get(repo.full_name) === request) cache.delete(repo.full_name); });
        }
        results[index] = { ...repo, languages: await cache.get(repo.full_name) };
        onProgress(++completed, publicRepos.length);
      } catch (error) { failure = error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, publicRepos.length) }, worker));
  if (failure) throw failure;
  return results;
}
const hash = value => {
  let n = [...value].reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) >>> 0, 7);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
export const themes = {
  midnight: { background: '#111111', foreground: '#f3f3f4', accent: '#e3de13', line: '#555a38', star: '#e3de13' },
  light: { background: '#fafaf3', foreground: '#202516', accent: '#595600', line: '#838d66', star: '#8b8500' },
};

export function renderConstellation(account, repositories, options = {}) {
  organizationOptions(options);
  const sourceHasRepositories = repositories.some(repo => repo.private !== true && (options.repoSource !== 'pinned' || repo.pinned === true));
  options = exportSettings(resolveTheme(options));
  for (const key of ['starlightAnimate', 'activityAnimate']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  if (options.generatedAt !== undefined && !Number.isFinite(Date.parse(options.generatedAt))) throw new Error('generatedAt must be a valid date.');
  const temporal = historyOptions(options);
  const hasHistory = temporal.history.mode !== 'current' || temporal.history.timeLapse.enabled || ['contributionOrbit', 'languageEvolution', 'stellarAges', 'foreignGalaxies'].some(key => temporal[key].enabled);
  const clock = referenceDate(options, new Date().toISOString());
  options = { ...options, referenceDate: new Date(clock).toISOString() };
  if (temporal.history.timeLapse.enabled) return renderTimeLapse(account, repositories, { ...options, ...temporal }, renderConstellation, clock);
  if (temporal.history.mode === 'historical') {
    repositories = historicalSnapshot(repositories, clock);
    options = { ...options, metricDate: options.referenceDate, activityMetricDate: options.referenceDate, activityData: options.historyData ? aggregateActivity(options.historyData.events, repositories, { ...options, activityMetricDate: options.referenceDate }, options.referenceDate) : undefined, codingRhythmData: options.historyData ? deriveCodingRhythm(options.historyData.events, options, options.referenceDate) : undefined };
  }
  mappingOptions(options);
  const name = username(account);
  const seed = resolveSeed(name, options);
  const sky = starfieldOptions(options.starfield);
  const activitySettings = activityOptions(options);
  const rhythmSettings = codingRhythmOptions(options);
  const recent = id => activitySettings.activityEffect === 'off' ? null : activityForNode(id, options.activityData);
  nodeRadius({}, options.nodeSize || options.sizingMode, 0);
  const reference = clock;
  const generatedDate = options.generatedAt === undefined ? null : new Date(options.generatedAt);
  if (generatedDate && !Number.isFinite(generatedDate.getTime())) throw new Error('generatedAt must be a valid date.');
  const generatedLabel = generatedDate ? `Generated ${generatedDate.toISOString().slice(0, 19).replace('T', ' ')} UTC` : '';
  const { theme = 'auto', colors = {}, animate = true, maxRepos = 45, includeForks = true, css = '', layout = 'atlas', title, includeRepos, bridges = false, connectionDensity = 'balanced', connectionBasis = 'languages' } = options;
  if (!['languages', 'topics', 'both'].includes(connectionBasis)) throw new Error('Connection basis must be languages, topics or both.');
  if (!['balanced', 'all'].includes(connectionDensity)) throw new Error('Connection density must be balanced or all.');
  if (!['atlas', 'compact'].includes(layout)) throw new Error('Layout must be atlas or compact.');
  if (title !== undefined && (typeof title !== 'string' || title.length > 60)) throw new Error('Title must be a string of up to 60 characters.');
  if (includeRepos !== undefined && (!Array.isArray(includeRepos) || includeRepos.some(value => typeof value !== 'string'))) throw new Error('includeRepos must be an array of repository names.');
  const compact = layout === 'compact';
  const colorConnections = options.colorConnections ?? false;
  if (typeof colorConnections !== 'boolean') throw new Error('colorConnections must be a boolean.');
  let nodeColors = options.nodeColors ?? {};
  if (typeof nodeColors !== 'object' || Array.isArray(nodeColors) || Object.values(nodeColors).some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('nodeColors must map node IDs to 6 digit hex colors.');
  const perspective = perspectiveOptions(options.perspective);
  const floatingAnimation = floatingAnimationOptions(options.floatingAnimation);
  const ringAnimation = ringAnimationOptions(options.ringAnimation);
  const ringRotation = options.ringRotation ?? 0;
  if (!Number.isFinite(ringRotation) || ringRotation < 0 || ringRotation > 360) throw new Error('ringRotation must be between 0 and 360 degrees.');
  const ringRotations = options.ringRotations ?? [ringRotation, ringRotation, ringRotation, ringRotation];
  if (!Array.isArray(ringRotations) || ringRotations.length !== 4 || ringRotations.some(angle => !Number.isFinite(angle) || angle < 0 || angle > 360)) throw new Error('ringRotations must contain four angles between 0 and 360 degrees.');
  const { arrangement = rustAvailable ? 'rings' : 'field', identityRing = true } = options;
  if (!['field', 'orbital', 'force', 'rings', ...artifactLayouts, ...organizationLayouts].includes(arrangement)) throw new Error('Invalid arrangement.');
  if (typeof identityRing !== 'boolean') throw new Error('identityRing must be a boolean.');
  if (!rustAvailable && arrangement !== 'field') throw new Error('This arrangement needs the Rust engine. Reload the studio or run npm run build:rust.');
  const height = compact ? 280 : 560;
  const profile = profileDimensions(options.exportProfile, height);
  const labelPositions = options.labelPositions ?? {};
  const labelOffsets = options.labelOffsets ?? {};
  if (typeof labelOffsets !== 'object' || Array.isArray(labelOffsets) || Object.values(labelOffsets).some(position => !position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new Error('labelOffsets must map node IDs to finite x and y offsets.');
  if (typeof labelPositions !== 'object' || Array.isArray(labelPositions) || Object.values(labelPositions).some(position => !position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new Error('labelPositions must map repository names to finite x and y coordinates.');
  let starPositions = options.starPositions ?? {};
  if (typeof starPositions !== 'object' || Array.isArray(starPositions) || Object.values(starPositions).some(position => !position || !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new Error('starPositions must map repository names to finite x and y coordinates.');
  if (theme !== 'auto' && !themes[theme]) throw new Error('Theme must be auto, midnight or light.');
  if (!Number.isInteger(maxRepos) || maxRepos < 1 || maxRepos > 100) throw new Error('maxRepos must be an integer between 1 and 100.');
  const palette = { ...themes[theme === 'auto' ? 'light' : theme], ...colors };
  const variables = values => Object.entries(values).map(([key, value]) => `--sky-${key}:${value}`).join(';');
  const paletteCSS = `svg{${variables(palette)}}` + (theme === 'auto' ? `@media(prefers-color-scheme:dark){svg{${variables({ ...themes.midnight, ...colors })}}}` : '');
  for (const [key, color] of Object.entries(palette)) {
    if (!Object.hasOwn(themes.midnight, key) || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) throw new Error('Colors must use known palette keys and 3 or 6 digit hex values.');
  }
  // CSS is local, trusted configuration, but must never escape its XML text node.
  const graph = graphNodes(repositories, options);
  const repos = graph.nodes;
  starPositions = { ...artifactPositions(repos, arrangement, seed, compact, options.majorMetric), ...starPositions };
  if (organizationLayouts.includes(arrangement)) starPositions = { ...organizationPositions(graph, arrangement, compact), ...options.starPositions };
  if (temporal.languageEvolution.enabled && temporal.languageEvolution.style === 'timeline') starPositions = { ...timelinePositions([...repos].sort((a, b) => a.full_name.localeCompare(b.full_name)), clock, compact), ...options.starPositions };
  nodeColors = { ...Object.fromEntries(repos.map(repo => [repo.full_name, mappedColor(repo, options.nodeColorMode, seed, reference)]).filter(([, color]) => color)), ...nodeColors };
  const nodeMode = options.nodeMode ?? 'repositories';
  const combinedMode = nodeMode === 'combined';
  const categoryMode = nodeMode !== 'repositories' && !combinedMode;
  for (const key of ['hiddenNodes', 'hiddenLabels']) {
    if (options[key] !== undefined && (!Array.isArray(options[key]) || options[key].some(id => typeof id !== 'string'))) throw new Error(`${key} must be an array of node IDs.`);
  }
  const hiddenNodes = new Set(options.hiddenNodes || []);
  const hiddenLabels = new Set(options.hiddenLabels || []);
  const groups = [...new Set(repos.map(repo => repo.language || 'Other'))].sort();
  const hubs = groups.map(language => ({ language }));
  // A deterministic, account-seeded star field uses the full card instead of
  // narrow language columns that turn cross-language links into long fans.
  const ordered = [...repos].sort((a, b) => hash(a.full_name) - hash(b.full_name) || a.full_name.localeCompare(b.full_name));
  const scene = computeScene({ account: options.seedMode ? seed : name, compact, arrangement: artifactLayouts.includes(arrangement) || organizationLayouts.includes(arrangement) ? 'field' : arrangement, ring_rotations: ringRotations, all: connectionDensity === 'all', basis: graph.organization ? 'membership' : combinedMode ? 'membership' : categoryMode ? 'repositories' : connectionBasis,
    repos: ordered.map(repo => ({ name: repo.full_name, group: repo.language || 'Other',
      languages: repositoryLanguages(repo).filter(language => options.languages == null || options.languages.includes(language)),
      topics: (repo.topics || []).filter(topic => options.topics == null || options.topics.includes(topic)),
      members: repo.members || [], kind: repo.nodeKind || 'repository', hidden: hiddenNodes.has(repo.full_name),
      position: Object.hasOwn(starPositions, repo.full_name) ? [starPositions[repo.full_name].x, starPositions[repo.full_name].y] : null })) });
  const centerY = compact ? 126 : 270;
  const spreadY = compact ? 88 : 192;
  const organizationEras = arrangement === 'era-rings' ? [...new Set(repos.map(repo => repo.organizationGroup || repo.name))].sort() : [];
  const eraRings = organizationEras.map((era, i) => `<ellipse class="organization-era-ring" cx="450" cy="${centerY}" rx="${(365 * (i + 1) / (organizationEras.length + 1)).toFixed(1)}" ry="${((compact ? 85 : 190) * (i + 1) / (organizationEras.length + 1)).toFixed(1)}" fill="none" stroke="var(--sky-accent)" stroke-opacity=".18" stroke-dasharray="2 5"><title>${escape(era)}</title></ellipse>`).join('');
  const historyLayer = hasHistory ? historyLayers(name, selectRepositories(repositories, options), options, { centerY, spreadY, height }) : { markup: '', note: '', description: '' };
  const phase = (hash(options.seedMode ? seed : name) % 628) / 100;
  const stars = ordered.map((repo, index) => {
    const angle = index * 2.399963 + phase;
    const radius = ordered.length === 1 ? 0 : Math.sqrt((index + .6) / Math.max(1, ordered.length));
    const position = scene ? { x: scene.positions[index][0], y: scene.positions[index][1] }
      : Object.hasOwn(starPositions, repo.full_name) ? starPositions[repo.full_name] : null;
    return { repo, hub: hubs.find(hub => hub.language === (repo.language || 'Other')),
      x: position ? Math.max(32, Math.min(868, position.x)) : 450 + Math.cos(angle) * radius * 368,
      y: position ? Math.max(28, Math.min(height - 60, position.y)) : centerY + Math.sin(angle) * radius * spreadY };
  });
  const visibleStars = stars.filter(star => !hiddenNodes.has(star.repo.full_name));
  const dust = Array.from({ length: profile.dustCount }, (_, i) => `<circle cx="${20 + hash(`${options.seedMode ? seed : name}:x:${i}`) % 860}" cy="${(compact ? 58 : 90) + hash(`${options.seedMode ? seed : name}:y:${i}`) % (compact ? 180 : 405)}" r="${i % 3 ? '.6' : '1'}" opacity=".25"/>`).join('');
  // Compare complete language sets, including secondary HTML/CSS/JavaScript.
  const candidates = [];
  if (graph.organization) {
    const byId = new Map(stars.map(star => [star.repo.full_name, star]));
    for (const edge of graph.edges) {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to || hiddenNodes.has(edge.from) || hiddenNodes.has(edge.to)) continue;
      candidates.push({ from, to, key: `${edge.from}:${edge.to}`, sharedLanguages: [], sharedTopics: [], sharedRepositories: edge.members, shared: edge.members, strength: edge.strength, primary: true, distance: (from.x - to.x) ** 2 + (from.y - to.y) ** 2 });
    }
  } else if (scene) for (const edge of scene.edges) {
    const from = stars[edge.from], to = stars[edge.to];
    candidates.push({ from, to, key: `${edge.from}:${edge.to}`, sharedLanguages: edge.languages, sharedTopics: edge.topics, sharedRepositories: edge.members,
      shared: [...edge.languages, ...edge.topics.map(topic => `#${topic}`), ...(edge.members || [])], primary: edge.primary,
      distance: (from.x - to.x) ** 2 + (from.y - to.y) ** 2 });
  }
  else for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const from = stars[i], to = stars[j];
      if (hiddenNodes.has(from.repo.full_name) || hiddenNodes.has(to.repo.full_name)) continue;
      const relation = sharedConnections(from.repo, to.repo, options);
      if (relation.shared.length) candidates.push({ from, to, ...relation, key: `${i}:${j}`, distance: (from.x - to.x) ** 2 + (from.y - to.y) ** 2 });
    }
  }
  const selectedEdges = new Set();
  if (scene || connectionDensity === 'all') candidates.forEach(edge => selectedEdges.add(edge));
  else {
    // Show up to four strongest neighbours per star. Prefer cross-region links
    // at equal overlap so secondary-language relationships stay visible.
    for (const star of stars) {
      const neighbours = candidates.filter(edge => edge.from === star || edge.to === star)
        .sort((a, b) => b.shared.length - a.shared.length || Number(b.from.hub !== b.to.hub) - Number(a.from.hub !== a.to.hub) || a.distance - b.distance || a.key.localeCompare(b.key));
      neighbours.slice(0, 4).forEach(edge => selectedEdges.add(edge));
    }
  }
  // Emphasize a short spanning forest of genuine relationships. All selected
  // secondary links remain present, but recede behind the local constellation.
  const parent = new Map(stars.map(star => [star, star]));
  const root = star => parent.get(star) === star ? star : root(parent.get(star));
  const backbone = new Set();
  if (scene) candidates.filter(edge => edge.primary).forEach(edge => backbone.add(edge));
  else for (const edge of [...selectedEdges].sort((a, b) => a.distance - b.distance || b.shared.length - a.shared.length || a.key.localeCompare(b.key))) {
    if (root(edge.from) !== root(edge.to)) {
      backbone.add(edge);
      parent.set(root(edge.from), root(edge.to));
    }
  }
  const edges = [...selectedEdges].sort((a, b) => Number(backbone.has(a)) - Number(backbone.has(b))).map((edge, index) => {
    const { from, to, shared, sharedLanguages, sharedTopics, sharedRepositories = [] } = edge;
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.sqrt(edge.distance) || 1;
    const bend = Math.min(18, length * .08) * (hash(edge.key) % 2 ? 1 : -1);
    const cx = (from.x + to.x) / 2 - dy / length * bend;
    const cy = (from.y + to.y) / 2 + dx / length * bend;
    const gradientId = `connection-color-${index}`;
    const gradient = colorConnections ? `<defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}"><stop stop-color="${nodeColors[from.repo.full_name] || 'var(--sky-star)'}"/><stop offset="1" stop-color="${nodeColors[to.repo.full_name] || 'var(--sky-star)'}"/></linearGradient></defs>` : '';
    const weight = graph.organization ? { width: .7 + (edge.strength || 1) * .3, opacity: .15 + (edge.strength || 1) * .12 } : connectionWeight(edge, options.connectionWeight);
    if (graph.focus) { const direct = from.repo.full_name === graph.focus || to.repo.full_name === graph.focus; weight.width = direct ? 2.5 : 1; weight.opacity = direct ? .95 : from.repo.organizationFocus && to.repo.organizationFocus ? .3 : .05; }
    const activeWeight = activitySettings.activityConnections ? Math.max(recent(from.repo.full_name)?.score || 0, recent(to.repo.full_name)?.score || 0) : 0;
    const edgeStyle = [colorConnections ? `stroke:url(#${gradientId})` : '', weight ? `stroke-width:${weight.width.toFixed(2)};opacity:${weight.opacity.toFixed(2)}` : '', activeWeight ? `opacity:${Math.min(.85, (weight?.opacity ?? (backbone.has(edge) ? .62 : .13)) + activeWeight * .2).toFixed(3)}` : ''].filter(Boolean).join(';');
    return `${gradient}<path class="shared-language"${edgeStyle ? ` style="${edgeStyle}"` : ''} data-from="${escape(from.repo.full_name)}" data-to="${escape(to.repo.full_name)}" data-languages="${escape(sharedLanguages.join(', '))}" data-topics="${escape(sharedTopics.join(', '))}" data-repositories="${escape(sharedRepositories.join(', '))}" data-emphasis="${backbone.has(edge) ? 'primary' : 'secondary'}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}"><title>${escape(from.repo.name)} ↔ ${escape(to.repo.name)} · ${escape(shared.join(', '))}</title></path>`;
  }).join('');
  // Join language regions with the shortest available visual bridges. These are
  // composition guides, not inferred technical relationships or dependencies.
  const bridgeLines = [];
  if (bridges && !combinedMode && !categoryMode && visibleStars.length > 1) {
    const joined = new Set([visibleStars[0].hub]);
    while (joined.size < new Set(visibleStars.map(star => star.hub)).size) {
      let best = { distance: Infinity };
      for (const from of visibleStars.filter(star => joined.has(star.hub))) {
        for (const to of visibleStars.filter(star => !joined.has(star.hub))) {
          const distance = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
          if (distance < best.distance) best = { from, to, distance };
        }
      }
      bridgeLines.push(`<path d="M${best.from.x.toFixed(1)} ${best.from.y.toFixed(1)}L${best.to.x.toFixed(1)} ${best.to.y.toFixed(1)}"><title>Visual bridge: ${escape(best.from.repo.name)} to ${escape(best.to.repo.name)}. No technical relationship implied.</title></path>`);
      joined.add(best.to.hub);
    }
  }
  const points = visibleStars.map(({ repo, x, y }) => {
    const lifecycle = temporal.stellarAges.enabled && (!repo.nodeKind || repo.nodeKind === 'repository') ? projectLifecycle(repo, clock, temporal.stellarAges.thresholds, options.historyData?.events || []) : null;
    const lifecycleAttributes = lifecycle ? ` data-lifecycle="${lifecycle === 'archived' && !temporal.stellarAges.showArchivedRemnants ? 'quiet' : lifecycle}" data-age-mode="${temporal.stellarAges.mode}"` : '';
    const radius = repo.organizationFocal ? 11 : repo.nodeKind === 'contributor' ? 2.5 + Math.min(5, Math.sqrt(repo.members.length)) : nodeRadius(repo, options.nodeSize || options.sizingMode, reference);
    const glow = mappedGlow(repo, options.nodeGlowMode, seed, reference);
    const shape = repo.nodeKind === 'contributor' ? 'diamond' : repo.nodeKind === 'dependency' ? 'hexagon' : shapeFor(repo, options.nodeShape);
    const activity = !repo.nodeKind || repo.nodeKind === 'repository' ? recent(repo.full_name) : null;
    const activityAttributes = activity ? ` data-activity-score="${activity.score.toFixed(3)}" data-activity-count="${activity.eventCount}" data-latest-activity="${activity.latestEventAt}"` : '';
    const activityLayer = activityMarkup({ x, y, radius, id: repo.full_name, activity, effect: activitySettings.activityEffect, detail: activitySettings.activityDetail, seed, animate: animate && options.activityAnimate !== false });
    const phaseHour = rhythmSettings.codingRhythm && rhythmSettings.codingRhythmStyle !== 'hidden' && rhythmSettings.codingRhythmProjectHints ? options.codingRhythmData?.projectHours?.[repo.full_name] : undefined;
    const phaseHint = Number.isInteger(phaseHour) && phaseHour >= 0 && phaseHour < 24 ? ` style="opacity:${(.065 + phaseHour / 24 * .025).toFixed(3)}"` : '';
    const starStyle = `${repo.organizationFocus ? "stroke:var(--sky-accent);stroke-width:1.5;" : ""}${shape !== 'circle' ? `clip-path:url(#shape-${shape});` : ''}${glow !== null ? `filter:drop-shadow(0 0 ${(glow * 4).toFixed(2)}px var(--node-color,var(--sky-star)));` : ''}`;
    const tooltip = repo.nodeKind && repo.nodeKind !== 'repository' ? `${repo.name} · ${repo.representedCount || repo.members.length} repositories · ${repo.members.join(', ')}` : `${repo.full_name} · ${repo.stargazers_count || 0} stars${repo.fork ? ' · fork' : ''} · ${repositoryLanguages(repo).join(', ') || 'No detected languages'}`;
    return `<g class="repository"${graph.focus && !repo.organizationFocus ? ' opacity=".22"' : ""}${repo.organizationFocal ? ' data-organization-user="true"' : ""}${repo.organizationFocus ? ' data-organization-focus="true"' : ""}${lifecycleAttributes}${activityAttributes}${Object.hasOwn(nodeColors, repo.full_name) ? ` style="--node-color:${nodeColors[repo.full_name]}"` : ''}><title>${escape(tooltip)}${lifecycle ? ` · ${lifecycle}` : ''}</title>${activityLayer}<circle class="star-halo"${phaseHint} cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius + 4).toFixed(1)}"/><circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" data-repo="${escape(repo.full_name)}" data-label="${escape(repo.name)}" data-kind="${repo.nodeKind || 'repository'}" data-members="${escape(JSON.stringify(repo.members || [repo.full_name]))}" style="${starStyle}animation-delay:-${hash(options.seedMode ? `${seed}:${repo.full_name}` : repo.full_name) % 60 / 10}s"/><circle class="star-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"/></g>`;
  }).join('');
  // Try labels at every collection size, avoiding collisions where space is tight.
  // Visibility is controlled by the visual styles, independently of repo count.
  const labelBoxes = [];
  const labels = stars.map((star, index) => {
    if (star.repo.organizationFocal && !hiddenNodes.has(star.repo.full_name)) return `<text class="repo-label organization-person-label" data-repo="${escape(star.repo.full_name)}" x="${star.x.toFixed(1)}" y="${(star.y + 26).toFixed(1)}" style="font-size:15px;font-weight:700">@${escape(star.repo.name)}</text>`;
    if (index >= Math.ceil(stars.length * profile.labelFraction)) return '';
    const text = star.repo.name.length > 22 ? star.repo.name.slice(0, 20) + '…' : star.repo.name;
    const width = text.length * 5.6;
    const label = (x, y) => hiddenNodes.has(star.repo.full_name) ? '' : `<text class="repo-label" data-repo="${escape(star.repo.full_name)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${hiddenLabels.has(star.repo.full_name) ? ' style="display:none"' : ''}>${escape(text)}</text>`;
    if (Object.hasOwn(labelOffsets, star.repo.full_name)) {
      const offset = labelOffsets[star.repo.full_name];
      return label(star.x + offset.x, star.y + offset.y);
    }
    if (Object.hasOwn(labelPositions, star.repo.full_name)) {
      const position = labelPositions[star.repo.full_name];
      return label(Math.max(34 + width / 2, Math.min(866 - width / 2, position.x)), Math.max(28, Math.min(height - 43, position.y)));
    }
    for (const dy of [17, -13, 29, -25]) {
      const x = Math.max(34 + width / 2, Math.min(866 - width / 2, star.x));
      const y = star.y + dy;
      const box = { left: x - width / 2 - 4, right: x + width / 2 + 4, top: y - 10, bottom: y + 3 };
      if (box.top < 18 || box.bottom > height - 40) continue;
      if (labelBoxes.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
      if (stars.some(other => other !== star && other.x > box.left - 5 && other.x < box.right + 5 && other.y > box.top - 5 && other.y < box.bottom + 5)) continue;
      labelBoxes.push(box);
      return label(x, y);
    }
    return '';
  }).join('');
  if (options.snapToRings !== undefined && typeof options.snapToRings !== 'boolean') throw new Error('snapToRings must be a boolean.');
  const geometry = (identityRing || options.snapToRings === true || ringAnimation.enabled || floatingAnimation.enabled || (perspective.enabled && perspective.animate)) && repos.length ? identityGeometry(options.seedMode ? seed : name) : null;
  const ringMarkup = geometry ? Array.from({ length: 4 }, (_, index) => {
    const ring = geometry.slice(2 + index * 22, 24 + index * 22);
    return `<g><circle class="identity-arc" data-ring="${index}" cx="240" cy="240" r="${ring[0]}" stroke-dasharray="${ring[2]} ${ring[3]}" transform="rotate(${(ring[1] + ringRotations[index]) % 360} 240 240)"/></g>`;
  }).join('') : '';
  const ringPoints = geometry ? identityPoints(options.seedMode ? seed : name, repos.length, ringRotations) : [];
  const pointMarkup = Array.from({ length: ringPoints.length / 3 }, (_, i) => {
    const [x, y, radius] = ringPoints.slice(i * 3, i * 3 + 3);
    const sx = Number((450 + (x - 240) * 368 / 172).toFixed(1));
    const sy = Number((centerY + (y - 240) * spreadY / 172).toFixed(1));
    const owner = ordered[i];
    const hidden = hiddenNodes.has(owner.full_name);
    const occupied = stars.filter(star => Math.hypot(star.x - sx, star.y - sy) < 1).map(star => star.repo.full_name);
    if (hidden && !occupied.includes(owner.full_name)) occupied.push(owner.full_name);
    return `<circle class="identity-point" data-node="${escape(owner.full_name)}"${hidden ? ' style="display:none"' : ''} cx="${x}" cy="${y}" r="${radius}" data-snap-x="${sx}" data-snap-y="${sy}" data-occupied="${escape(JSON.stringify(occupied))}"/>`;
  }).join('');
  const camera = perspectiveMarkup(perspective, centerY, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title description">
<title id="title">${escape(title ?? `${name}’s GitHub constellation`)}</title>
<desc id="description">${graph.organization ? escape(`Organization universe. ${visibleStars.length} nodes, ${selectedEdges.size} bounded connections. Contributor diamonds connect through shared projects; project and technology views show repository relationships. Contributor size reflects represented repository count. ${graph.note}`) : `${visibleStars.length} ${combinedMode ? `repository, language and topic nodes from ${graph.repositoryCount} public repositories` : categoryMode ? `${nodeMode} from ${graph.repositoryCount} public repositories` : 'public repositories'} arranged in a deterministic ${arrangement === 'rings' ? 'identity ring point layout' : arrangement === 'field' ? 'star field' : arrangement === 'orbital' ? 'orbital layout' : 'force layout'}. ${combinedMode ? `Lines connect repositories directly to their languages and topics. Showing ${visibleStars.length} of ${graph.total} nodes.` : categoryMode ? `Solid lines connect ${nodeMode} appearing in the same repository. Showing ${repos.length} of ${graph.total} categories, ranked by repository count.` : `Solid lines connect projects through selected ${connectionBasis === 'both' ? 'languages and topics' : connectionBasis}; detected languages include secondary languages; dotted bridges join nearby groups visually and do not represent dependencies.`} ${selectedEdges.size} of ${scene?.total ?? candidates.length} shared connections shown. Brighter paths emphasize nearby relationships; faint paths preserve the remaining selected overlaps. Star size reflects ${combinedMode ? 'GitHub stars for repositories and repository count for categories' : categoryMode ? 'repository count' : 'GitHub stars'}. ${geometry ? 'Identity rings are seeded by the account name; ring points provide placement anchors for nodes. ' : ''}${visibleStars.map(star => escape(star.repo.name)).join(', ')}.${escape(rhythmDescription(options.codingRhythmData, rhythmSettings))}${escape(historyLayer.description)} ${escape(graph.note || "")}`}</desc>
<defs>${graph.organization || options.nodeShape && options.nodeShape !== 'circle' ? shapeDefinitions : ''}<radialGradient id="nebula"><stop stop-color="var(--sky-background)" stop-opacity=".13"/><stop offset="1" stop-color="var(--sky-background)" stop-opacity="0"/></radialGradient><filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>
${hasHistory ? historyCSS : ''}${paletteCSS}${rhythmSettings.codingRhythm ? codingRhythmCSS : ''}
svg{background:transparent;border:none;outline:none;color:var(--sky-foreground);font:13px system-ui,sans-serif}text{fill:currentColor}.background{fill:none;stroke:none}.dust{fill:var(--sky-foreground)}.connections{fill:none;stroke:var(--sky-line);stroke-width:.9;opacity:.8}.shared-language{stroke-linecap:round}.shared-language[data-emphasis="primary"]{stroke:var(--sky-accent);opacity:.62}.shared-language[data-emphasis="secondary"]{opacity:.13}.star{fill:var(--sky-star);${animate && options.starlightAnimate !== false ? 'animation:twinkle 6s ease-in-out infinite;' : ''}}.language circle{fill:var(--sky-accent)}.language text{text-anchor:middle;fill:var(--sky-accent);font-weight:600}.repo-label{text-anchor:middle;font-size:10px;stroke:none}.caption{font-size:12px;opacity:.65}.heading{font-size:23px;font-weight:600}@keyframes twinkle{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.star{animation:none}}
.star{filter:url(#glow)}.star-halo{fill:var(--sky-star);opacity:.07}.star-core{fill:var(--sky-foreground);opacity:.9;pointer-events:none}.language text{font-size:10px;letter-spacing:2px;font-weight:500}.repo-label{fill:var(--sky-foreground);opacity:.68}.heading{font-size:20px;letter-spacing:-.5px}.chart-guide{fill:none;stroke:var(--sky-line);stroke-width:.5;opacity:.28}
.bridges{fill:none;stroke:var(--sky-accent);stroke-width:1;stroke-dasharray:2 5;opacity:.35}
.identity-ring{fill:none;stroke:var(--sky-accent);stroke-width:.65;opacity:.14;pointer-events:none}.identity-point{fill:var(--sky-accent);stroke:none}
.star[data-kind="language"]{stroke:var(--sky-foreground);stroke-width:.8}.star[data-kind="topic"]{stroke:var(--sky-foreground);stroke-width:1;stroke-dasharray:2 2}
.star,.star-halo{fill:var(--node-color,var(--sky-star))}
.credit{font-size:9px;opacity:.65;fill:var(--sky-accent);text-anchor:end}a{text-decoration:none}
.generated-at{font-size:9px;opacity:.6;fill:var(--sky-foreground);text-anchor:start}
${compact ? '.heading{font-size:17px}.language text{font-size:13px;letter-spacing:.5px}.caption{font-size:12px;opacity:.8}.connections{stroke-width:.9;opacity:.8}' : ''}
${options.visualStyle ? escape(visualCSS(options.visualStyle)) : ''}${escape(css)}${activitySettings.activityEffect !== 'off' ? activityCSS : ''}
${['space', 'milky-way'].includes(sky.mode) ? starfieldCSS : ''}
${options.exportProfile === 'transparent' ? 'svg{background:transparent!important}.background{fill:none!important}' : ''}
</style>
<rect class="background" width="900" height="${height}" rx="${compact ? 12 : 18}"/>
${options.exportProfile === 'transparent' ? '' : `<ellipse cx="440" cy="${height / 2}" rx="420" ry="${height * .43}" fill="url(#nebula)"/>`}

${decoration(options, height, visibleStars)}
${renderStarfield(seed, sky, { height, detail: profile.dustCount / 85, animate, transparent: options.exportProfile === 'transparent' })}
<!--history-scene-start-->${eraRings}${historyLayer.markup}${renderCodingRhythm(options.codingRhythmData, rhythmSettings, { centerY, spreadY, height, legend: options.legend })}${camera.start}${geometry ? `<g class="identity-ring" aria-hidden="true"${identityRing ? '' : ' style="display:none"'} transform="translate(450 ${centerY}) scale(${368 / 172} ${spreadY / 172}) translate(-240 -240)">${ringMarkup}${pointMarkup}</g>` : ''}${sky.mode === 'classic' ? `<g class="dust">${dust}</g>` : ''}<g class="bridges">${bridgeLines.join('')}</g><g class="connections">${edges}</g>${points}${labels}${camera.end}<!--history-scene-end-->${historyLayer.note}${options.organizationUser && graph.organization ? `<g class="organization-focus-caption"><text x="450" y="26" text-anchor="middle" font-size="16" font-weight="600">@${escape(options.organizationUser)} → ${escape(name)}</text><text x="450" y="43" text-anchor="middle" font-size="10">${graph.focus ? `${graph.focusProjects.length} connected projects · bright lines show direct participation` : "No verified connection in the loaded results; expand or refresh the scan"}</text></g>` : ""}${graph.organization ? `<text class="organization-coverage" x="450" y="${height - 34}" text-anchor="middle" font-size="9">${escape(`${graph.nodes.length} nodes · ${graph.repositoryCount} selected projects · ${options.organizationData?.scanned || 0} repositories scanned for contributors`)}<title>${escape(graph.note)}</title></text>` : ""}
${visibleStars.length ? '' : `<text x="450" y="${height / 2}" text-anchor="middle">${repos.length ? 'All nodes are hidden. Restore visibility in Individual nodes.' : categoryMode && graph.repositoryCount ? `No ${nodeMode} in the matching repositories.` : sourceHasRepositories ? 'No projects match these filters or historical year.' : options.repoSource === 'pinned' ? 'No public pinned repositories match this selection.' : 'No public repositories to show yet.'}</text>`}
${options.legend ? `<text class="mapping-legend" x="32" y="${height - 30}" font-size="9">${escape(`Size: ${options.nodeSize || options.sizingMode || 'legacy'} · Glow: ${options.nodeGlowMode || 'uniform'} · Color: ${options.nodeColorMode || 'custom'} · Links: ${options.connectionWeight || 'uniform'}${activitySettings.activityEffect !== 'off' ? ` · ${activitySettings.activityEffect}: public activity / ${['1d', '7d', '30d'].includes(options.activityData?.window) ? options.activityData.window : activitySettings.activityWindow}` : ''}`)}</text>` : ''}
${generatedLabel ? `<text class="generated-at" x="32" y="${height - 14}">${generatedLabel}</text>` : ''}
<a href="https://github.com/mnichols08/constellation" target="_blank" rel="noopener noreferrer">${githubMark.replace('<svg ', `<svg x="744" y="${height - 23}" `)}<text class="credit" x="868" y="${height - 14}">mnichols08/constellation</text></a>
</svg>\n`;
  return animateRingSVG(focusSVG(svg, options.selection), ringAnimation, geometry, visibleStars, centerY, spreadY, escape, floatingAnimation, Array.from({ length: ringPoints.length / 3 }, (_, i) => ({ x: 450 + (ringPoints[i * 3] - 240) * 368 / 172, y: centerY + (ringPoints[i * 3 + 1] - 240) * spreadY / 172 })));
}
