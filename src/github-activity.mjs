import { username } from './constellation.mjs';
import { normalizePublicEvents } from './activity.mjs';

export async function fetchPublicActivity(account, { token, fetchImpl = fetch, signal, asOf = new Date().toISOString() } = {}) {
  const events = [];
  try {
    const name = username(account);
    for (let page = 1; page <= 3; page++) {
      const response = await fetchImpl(`https://api.github.com/users/${name}/events/public?per_page=100&page=${page}`, {
        signal: signal || AbortSignal.timeout(20000), redirect: 'error',
        headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) return { asOf, events: [], diagnostic: `Public activity unavailable (HTTP ${response.status}). Rendering without activity; refresh later to retry.` };
      const body = await response.json();
      if (!Array.isArray(body)) throw new Error('Invalid events response.');
      events.push(...body);
      if (body.length < 100) break;
    }
    return { asOf, events: normalizePublicEvents(events), diagnostic: '' };
  } catch { return { asOf, events: [], diagnostic: 'Public activity unavailable. Rendering without activity; refresh later to retry.' }; }
}
