import { username, fetchRepositories, fetchRepositoryLanguages, selectRepositoryPool } from './constellation.mjs';

export function createPreviewFetch({ proxyBase, fetchImpl = fetch } = {}) {
  return (url, options) => {
    const target = new URL(url);
    const destination = proxyBase && target.origin === 'https://api.github.com'
      ? `${proxyBase}${target.pathname}${target.search}` : url;
    return fetchImpl(destination, options);
  };
}

// Only load() performs network requests. Rendering and customization read snapshots.
export function createPreviewData({ storage, fetchImpl = fetch } = {}) {
  const key = 'constellation-public-data-v1';
  let accounts = {};
  try {
    const saved = JSON.parse(storage?.getItem(key) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) accounts = saved;
  } catch { /* Storage is optional, including in private browsing. */ }
  const caches = new Map();
  const pending = new Map();
  const save = () => { try { storage?.setItem(key, JSON.stringify(accounts)); } catch {} };
  const snapshot = account => {
    const value = accounts[username(account).toLowerCase()];
    return Array.isArray(value) ? value : undefined;
  };
  async function load(account, options, { refresh = false, onProgress } = {}) {
    const name = username(account).toLowerCase();
    if (pending.has(name)) return pending.get(name);
    const request = (async () => {
      // Keep the previous snapshot available if refreshing fails.
      let listed = !refresh && snapshot(name);
      if (!listed) listed = await fetchRepositories(name, { fetchImpl });
      if (refresh) caches.delete(name);
      const cache = caches.get(name) || new Map();
      caches.set(name, cache);
      accounts[name] = listed;
      save();
      try {
        await fetchRepositoryLanguages(selectRepositoryPool(listed, options), { fetchImpl, cache, onProgress });
      } finally {
        // Preserve successful lookups even when another request hits a rate limit.
        const entries = await Promise.all([...cache].map(async ([repo, value]) => {
          try { return [repo, await value]; } catch { return [repo, undefined]; }
        }));
        const languages = new Map(entries);
        accounts[name] = listed.map(repo => languages.get(repo.full_name) !== undefined ? { ...repo, languages: languages.get(repo.full_name) } : repo);
        save();
      }
      return snapshot(name);
    })();
    pending.set(name, request);
    try { return await request; } finally { pending.delete(name); }
  }
  return { snapshot, load };
}
