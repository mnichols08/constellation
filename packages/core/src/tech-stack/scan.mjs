// Reads one account's public repositories and what their manifests declare.
// Every request is bounded and cancellable. Manifest text is dropped as soon as
// it is classified, and no token ever reaches a result.
import { classifyManifests, isManifestPath, isSignalPath, isSkippedFolder, isWorkspacePath, fileName, MINIMUM_LANGUAGE_SHARE } from './catalog.mjs';

const LOGIN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const REPOSITORY = /^[\w.-]{1,100}$/;
const LIMITS = { repositories: 5000, requests: 1500, pageSize: 50, deepFolders: 25, manifestsPerRepository: 12, manifestBytes: 300_000, batchRepositories: 30, batchCharacters: 6000, concurrency: 3 };
const TRANSIENT_ATTEMPTS = 3;

export class TechStackRateLimit extends Error {}
export class TechStackTransient extends Error {}

const safePath = (path) => typeof path === 'string' && path.length > 0 && path.length <= 300 && !/[\u0000-\u001f\u007f]/.test(path) && !path.split('/').includes('..');
const blobs = (paths) => paths.map((path, index) => `f${index}:object(expression:${JSON.stringify(`HEAD:${path}`)}){...on Blob{text byteSize isBinary}}`).join(' ');
const trees = (paths) => paths.map((path, index) => `d${index}:object(expression:${JSON.stringify(`HEAD:${path}`)}){...on Tree{entries{name type}}}`).join(' ');

/** Builds the only GraphQL these steps can send. Throws on anything outside the fixed shapes. */
export function techStackQuery(step) {
  if (!step || typeof step !== 'object' || !LOGIN.test(step.login || '')) throw new Error('Invalid tech stack request.');
  const owner = JSON.stringify(step.login);
  if (step.kind === 'listing') {
    const size = step.size;
    if (!Number.isInteger(size) || size < 1 || size > LIMITS.pageSize) throw new Error('Invalid tech stack request.');
    if (step.after !== null && step.after !== undefined && (typeof step.after !== 'string' || step.after.length > 500)) throw new Error('Invalid tech stack request.');
    const after = step.after ? `,after:${JSON.stringify(step.after)}` : '';
    return `query{repositoryOwner(login:${owner}){repositories(first:${size},privacy:PUBLIC,ownerAffiliations:OWNER,orderBy:{field:CREATED_AT,direction:ASC}${after}){totalCount pageInfo{hasNextPage endCursor} nodes{
      name nameWithOwner url description isPrivate isFork isArchived isEmpty createdAt pushedAt updatedAt stargazerCount forkCount primaryLanguage{name}
      languages(first:15,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}} repositoryTopics(first:20){nodes{topic{name}}}
      tree:object(expression:"HEAD:"){...on Tree{entries{name type object{...on Tree{entries{name type}}}}}}
    }}}}`;
  }
  if (step.kind !== 'trees' && step.kind !== 'manifests') throw new Error('Invalid tech stack request.');
  if (!Array.isArray(step.items) || !step.items.length || step.items.length > LIMITS.batchRepositories) throw new Error('Invalid tech stack request.');
  const parts = step.items.map((item, index) => {
    const limit = step.kind === 'trees' ? LIMITS.deepFolders : LIMITS.manifestsPerRepository;
    if (!REPOSITORY.test(item?.name || '') || !Array.isArray(item.paths) || !item.paths.length || item.paths.length > limit || !item.paths.every(safePath)) throw new Error('Invalid tech stack request.');
    return `r${index}:repository(owner:${owner},name:${JSON.stringify(item.name)}){${step.kind === 'trees' ? trees(item.paths) : blobs(item.paths)}}`;
  });
  return `query{${parts.join(' ')}}`;
}

async function readAnswer(response) {
  if (response.status === 401) throw new Error('GitHub rejected the token (401).');
  if (response.status === 403 || response.status === 429) throw new TechStackRateLimit('GitHub request limit reached (403).');
  if (response.status >= 500) throw new TechStackTransient(`GitHub is busy (${response.status}).`);
  if (!response.ok) throw new Error(`GitHub could not answer (${response.status}).`);
  try { return JSON.parse(await response.text()); }
  catch (error) {
    // A cancelled read must stay a cancellation rather than look like a bad answer.
    if (error?.name === 'AbortError') throw error;
    throw new TechStackTransient('GitHub sent an unreadable answer.');
  }
}

/** Sends each step to GitHub directly. `fetchImpl` is the session's confined fetch. */
export function githubTransport(fetchImpl) {
  return async (step, signal) => readAnswer(await fetchImpl('https://api.github.com/graphql', {
    method: 'POST', signal,
    headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: techStackQuery(step) }),
  }));
}

/** Sends each step through the local preview server, which holds the token. */
export function proxyTransport(fetchImpl, proxyBase) {
  return async (step, signal) => readAnswer(await fetchImpl(`${proxyBase}/tech-stack?step=${encodeURIComponent(JSON.stringify(step))}`, { signal }));
}

function recordFrom(repo, technologies) {
  const edges = repo.languages?.edges || [];
  const total = edges.reduce((sum, edge) => sum + edge.size, 0);
  return {
    name: repo.name, full_name: repo.nameWithOwner, html_url: repo.url, description: repo.description ?? null,
    fork: false, private: false, archived: Boolean(repo.isArchived),
    created_at: repo.createdAt, updated_at: repo.updatedAt, pushed_at: repo.pushedAt,
    stargazers_count: repo.stargazerCount || 0, forks_count: repo.forkCount || 0,
    language: repo.primaryLanguage?.name ?? null,
    languages: Object.fromEntries(edges.filter((edge) => edge.size / total >= MINIMUM_LANGUAGE_SHARE).map((edge) => [edge.node.name, edge.size])),
    topics: (repo.repositoryTopics?.nodes || []).map((node) => node.topic.name),
    dependencies: technologies,
  };
}

export async function scanTechStack(login, { transport, signal, onProgress = () => {}, limits: overrides = {}, now = () => new Date().toISOString() } = {}) {
  if (!LOGIN.test(login || '')) throw new Error('Enter a GitHub username, like “octocat”.');
  const limits = { ...LIMITS, ...overrides };
  let requests = 0, stopped = null, refused = 0;
  const send = async (step) => {
    for (let attempt = 1; ; attempt++) {
      signal?.throwIfAborted();
      if (++requests > limits.requests) { const error = new TechStackRateLimit('budget'); error.budget = true; throw error; }
      try {
        const answer = await transport(step, signal);
        // GitHub can answer in part: nulls alongside errors. Those gaps must not read as "not used".
        if (Array.isArray(answer?.errors)) refused += answer.errors.length;
        return answer;
      } catch (error) {
        if (!(error instanceof TechStackTransient) || attempt >= TRANSIENT_ATTEMPTS) throw error;
      }
    }
  };
  // Large pages time out on GitHub's side, so a failed page retries smaller.
  const listed = [];
  let after = null, size = limits.pageSize, discovered = 0;
  try {
    while (listed.length < limits.repositories) {
      let page = null;
      try {
        const answer = await send({ kind: 'listing', login, after, size });
        if (answer?.data && answer.data.repositoryOwner === null) throw new Error('Could not find that account (404).');
        page = answer?.data?.repositoryOwner?.repositories || null;
      } catch (error) {
        if (!(error instanceof TechStackTransient)) throw error;
      }
      if (!page?.nodes) {
        if (size === 1) throw new TechStackTransient('GitHub could not list these repositories.');
        size = Math.max(1, Math.floor(size / 3));
        continue;
      }
      discovered = page.totalCount ?? discovered;
      listed.push(...page.nodes.filter(Boolean));
      after = page.pageInfo?.endCursor ?? null;
      onProgress({ stage: 'listing', done: listed.length, total: discovered });
      if (!page.pageInfo?.hasNextPage || !after) break;
      size = Math.min(limits.pageSize, size * 2);
    }
    if (listed.length >= limits.repositories && discovered > limits.repositories) stopped = 'limit';
  } catch (error) {
    if (!(error instanceof TechStackRateLimit) || !listed.length) throw error;
    stopped = error.budget ? 'limit' : 'rate-limit';
  }

  // The query already asks for public repositories; never trust that alone.
  const candidates = listed.filter((repo) => repo.isPrivate !== true && !repo.isFork && !repo.isEmpty && REPOSITORY.test(repo.name || ''));
  const entries = candidates.map((repo) => {
    const paths = [], deep = [];
    for (const entry of repo.tree?.entries || []) {
      if (entry.type === 'blob') paths.push(entry.name);
      else if (entry.type === 'tree' && !isSkippedFolder(entry.name)) {
        for (const child of entry.object?.entries || []) {
          if (child.type === 'blob') paths.push(`${entry.name}/${child.name}`);
          else if (child.type === 'tree' && !isSkippedFolder(child.name)) deep.push(`${entry.name}/${child.name}`);
        }
      }
    }
    return { repo, paths, deep, manifests: {}, unreadable: 0 };
  });

  const inBatches = (items, charactersOf) => {
    const batches = [];
    let batch = [], characters = 0;
    for (const item of items) {
      const cost = charactersOf(item);
      if (batch.length && (batch.length >= limits.batchRepositories || characters + cost > limits.batchCharacters)) { batches.push(batch); batch = []; characters = 0; }
      batch.push(item);
      characters += cost;
    }
    if (batch.length) batches.push(batch);
    return batches;
  };
  const concurrently = async (batches, work) => {
    let next = 0;
    const worker = async () => {
      while (next < batches.length && !stopped) {
        const batch = batches[next++];
        try { await work(batch); }
        catch (error) {
          if (error instanceof TechStackRateLimit) stopped ??= error.budget ? 'limit' : 'rate-limit';
          else if (error instanceof TechStackTransient) for (const item of batch) item.missing = true;
          else throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: limits.concurrency }, worker));
  };
  const length = (paths, name) => JSON.stringify(paths).length + name.length + 24;

  // One level deeper, only where a repository shows no manifest yet or is a workspace.
  const needDeep = entries.filter((entry) => entry.deep.length && (!entry.paths.some(isManifestPath) || entry.deep.some(isWorkspacePath)));
  const deepItems = needDeep.map((entry) => ({ entry, name: entry.repo.name, paths: entry.deep.slice(0, limits.deepFolders) }));
  await concurrently(inBatches(deepItems, (item) => length(item.paths, item.name)), async (batch) => {
    const answer = await send({ kind: 'trees', login, items: batch.map(({ name, paths }) => ({ name, paths })) });
    batch.forEach((item, r) => item.paths.forEach((folder, d) => {
      for (const child of answer?.data?.[`r${r}`]?.[`d${d}`]?.entries || []) if (child.type === 'blob') item.entry.paths.push(`${folder}/${child.name}`);
    }));
  });

  const items = entries.map((entry) => ({ entry, name: entry.repo.name, paths: entry.paths.filter(isManifestPath).filter(safePath).slice(0, limits.manifestsPerRepository) })).filter((item) => item.paths.length);
  let finished = 0;
  await concurrently(inBatches(items, (item) => length(item.paths, item.name)), async (batch) => {
    const answer = await send({ kind: 'manifests', login, items: batch.map(({ name, paths }) => ({ name, paths })) });
    batch.forEach((item, r) => item.paths.forEach((path, f) => {
      const file = answer?.data?.[`r${r}`]?.[`f${f}`];
      if (typeof file?.text === 'string' && !file.isBinary && file.byteSize <= limits.manifestBytes) item.entry.manifests[path] = file.text;
      else if (file) item.entry.unreadable += 1;
    }));
    finished += batch.length;
    onProgress({ stage: 'details', done: finished, total: items.length });
  });

  let unreadable = 0;
  const records = entries.map((entry) => {
    const signals = entry.paths.filter(isSignalPath).map(fileName);
    const { technologies, unreadable: bad } = classifyManifests(entry.manifests, signals);
    unreadable += entry.unreadable + bad;
    return recordFrom(entry.repo, technologies);
  });
  return {
    login,
    scannedAt: now(),
    records,
    coverage: {
      discovered,
      forks: listed.filter((repo) => repo.isFork).length,
      empty: listed.filter((repo) => repo.isEmpty && !repo.isFork).length,
      withManifest: items.length,
      noLanguage: records.filter((record) => !Object.keys(record.languages).length).length,
      unreadable,
      missing: items.filter((item) => item.missing).length,
      refused,
      stopped,
    },
  };
}
