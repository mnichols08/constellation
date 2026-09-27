import { renderConstellation } from './constellation.mjs';
import { validateThemePack } from './theme-packs.mjs';
import { jsonFeedSource } from './json-feed-source.mjs';

const identifier = value => typeof value === 'string' && /^[a-z][a-z\d-]{0,63}$/.test(value);
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
  const host = {
    registerSource(plugin) {
      if (!plugin || !identifier(plugin.id) || plugin.apiVersion !== 1 || typeof plugin.load !== 'function') throw new Error('Source plugins require id, apiVersion: 1 and load(context).');
      if (sources.has(plugin.id)) throw new Error(`Source plugin already registered: ${plugin.id}`);
      sources.set(plugin.id, plugin); return host;
    },
    registerThemePack(pack) {
      validateThemePack(pack);
      const key = `${pack.id}@${pack.version}`;
      if (themes.has(key)) throw new Error(`Theme pack already registered: ${key}`);
      themes.set(key, structuredClone(pack)); return host;
    },
    async load(config = {}, { account, signal } = {}) {
      const result = [], seen = new Set();
      for (const source of [...pluginOptions(config.plugins)].sort((a, b) => a.id.localeCompare(b.id))) {
        const plugin = sources.get(source.source);
        if (!plugin) throw new Error(`Unknown source plugin: ${source.source}. Register it before loading.`);
        const items = await plugin.load({ account, options: structuredClone(source.options || {}), signal, fetchImpl });
        if (!Array.isArray(items)) throw new Error(`Source ${source.id} must return an array of nodes.`);
        for (const item of items) {
          if (!item || typeof item.id !== 'string' || !item.id.trim() || /[\x00-\x1f]/.test(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error(`Source ${source.id} returned a node without a valid id and name.`);
          const id = `source:${source.id}:${encodeURIComponent(item.id)}`;
          if (seen.has(id)) throw new Error(`Duplicate source node ID: ${id}`);
          seen.add(id);
          result.push({ ...item, full_name: id, language: item.language || 'External', private: false, pluginSource: source.source, pluginInstance: source.id, pluginId: item.id, stargazers_count: item.stargazers_count || 0 });
        }
      }
      return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
    render(account, nodes, options = {}, runtime = {}) {
      let themePack = options.themePack;
      if (themePack && !themePack.preset) themePack = themes.get(`${themePack.id}@${themePack.version}`) || themePack;
      return renderConstellation(account, nodes, { ...options, ...(themePack ? { themePack } : {}) }, {
        ...runtime,
        nodeRenderer: context => runtime.nodeRenderer?.(context) ?? sources.get(context.node.pluginSource)?.renderNode?.(context),
      });
    },
  };
  host.registerSource(jsonFeedSource);
  return host;
}
