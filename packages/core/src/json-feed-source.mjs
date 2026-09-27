export const jsonFeedSource = {
  id: 'json-feed', apiVersion: 1,
  async load({ options, fetchImpl, signal }) {
    if (Array.isArray(options.items)) return options.items;
    let url;
    try { url = new URL(options.url); } catch { throw new Error('json-feed requires options.items or an HTTP(S) options.url.'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('json-feed URL must use HTTP(S).');
    const response = await fetchImpl(url.href, { signal: signal || AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`JSON feed request failed (${response.status}).`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('JSON feed must contain an array of { id, name, ...metadata } nodes.');
    return items;
  },
};
