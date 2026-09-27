import { createScene } from './constellation.mjs';
import { renderSceneSVG } from './renderer-svg.mjs';
import { validateThemePack } from './theme-packs.mjs';
import { jsonFeedSource } from './json-feed-source.mjs';

const identifier = value => typeof value === 'string' && /^[a-z][a-z\d-]{0,63}$/.test(value);
export const PLUGIN_API_VERSION = 1;
export function pluginOptions(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'sources') || !Array.isArray(value.sources ?? [])) throw new Error('plugins must contain a sources array.');
  const ids = new Set();
  for (const item of value.sources || []) {
    if (!item || !identifier(item.id) || !identifier(item.source) || ids.has(item.id)) throw new Error('Each plugin source needs a unique id and a source identifier (lowercase letters, digits, hyphens).');
    if (item.options !== undefined && (!item.options || typeof item.options !== 'object' || Array.isArray(item.options))) throw new Error(`plugins.sources.${item.id}.options must be an object.`);
    ids.add(item.id);
  }
  return value.sources || [];
}

export function createPluginHost({ fetchImpl = globalThis.fetch } = {}) {
  const sources = new Map(), themes = new Map();
  const cache = new Map();
  const cacheBudget = 8 * 1024 * 1024;
  let cacheBytes = 0;
  let generation = 0;
  const host = {
    clearCache() { generation++; cache.clear(); cacheBytes = 0; },
    get cacheStatistics() { return { entries: cache.size, estimatedBytes: cacheBytes, budgetBytes: cacheBudget }; },
    registerSource(plugin) {
      if (!plugin || !identifier(plugin.id) || plugin.apiVersion !== PLUGIN_API_VERSION || typeof plugin.load !== 'function') throw new Error('Source plugins require id, apiVersion: 1 and load(context).');
      if (sources.has(plugin.id)) throw new Error(`Source plugin already registered: ${plugin.id}`);
      sources.set(plugin.id, Object.freeze({ id: plugin.id, apiVersion: plugin.apiVersion, load: plugin.load, renderNode: plugin.renderNode })); return host;
    },
    registerThemePack(pack) {
      validateThemePack(pack);
      const key = `${pack.id}@${pack.version}`;
      if (themes.has(key)) throw new Error(`Theme pack already registered: ${key}`);
      themes.set(key, structuredClone(pack)); return host;
    },
    async load(config = {}, { account, signal, refresh = false } = {}) {
      if (refresh) host.clearCache();
      const epoch = generation;
      const result = [], seen = new Set();
      for (const source of structuredClone(pluginOptions(config.plugins)).sort((a, b) => a.id.localeCompare(b.id))) {
        signal?.throwIfAborted();
        const plugin = sources.get(source.source);
        if (!plugin) throw new Error(`Unknown source plugin: ${source.source}. Register it before loading.`);
        const key = JSON.stringify([account, source.source, source.id, source.options || {}]);
        let items = cache.get(key)?.items;
        const cached = Boolean(items);
        if (!items) {
          items = await plugin.load({ account, options: structuredClone(source.options || {}), signal, fetchImpl });
          signal?.throwIfAborted();
          if (epoch !== generation) throw new Error('Source data was refreshed during this load; retry with the current snapshot.');
          if (!Array.isArray(items)) throw new Error(`Source ${source.id} must return an array of nodes.`);
        }
        if (!Array.isArray(items)) throw new Error(`Source ${source.id} must return an array of nodes.`);
        for (const item of items) {
          if (!item || typeof item.id !== 'string' || !item.id.trim() || /[\x00-\x1f]/.test(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Source ${source.id} returned a node without a valid id and name.`);
          const id = `source:${source.id}:${encodeURIComponent(item.id)}`;
          if (seen.has(id)) throw new Error(`Duplicate source node ID: ${id}`);
          seen.add(id);
          result.push({ ...structuredClone(item), full_name: id, language: item.language || 'External', private: false, pluginSource: source.source, pluginInstance: source.id, pluginId: item.id, stargazers_count: item.stargazers_count || 0 });
        }
        if (!cached) {
          const bytes = (key.length + JSON.stringify(items).length) * 2;
          if (bytes <= cacheBudget) {
            while (cache.size >= 32 || cacheBytes + bytes > cacheBudget) {
              const oldest = cache.keys().next().value;
              cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
            }
            cache.set(key, { items: structuredClone(items), bytes }); cacheBytes += bytes;
          }
        }
      }
      return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    render(account, nodes, options = {}, runtime = {}) {
      return renderSceneSVG(host.createScene(account, nodes, options, runtime));
    },
    createScene(account, nodes, options = {}, runtime = {}) {
      const ids = new Set();
      for (const node of nodes) {
        if (ids.has(node.full_name)) throw new Error(`Duplicate graph node ID: ${node.full_name}`);
        ids.add(node.full_name);
      }
      let themePack = options.themePack;
      if (themePack && !themePack.preset) themePack = themes.get(`${themePack.id}@${themePack.version}`) || themePack;
      return createScene(account, nodes, { ...options, ...(themePack ? { themePack } : {}) }, {
        ...runtime,
        nodeRenderer: context => runtime.nodeRenderer?.(context) ?? sources.get(context.node.pluginSource)?.renderNode?.(context),
      });
    },
  };
  host.registerSource(jsonFeedSource);
  return host;
}
