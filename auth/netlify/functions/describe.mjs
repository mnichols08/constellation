// Netlify Function wrapper around the portable hosted-AI handler. It holds the
// Anthropic API key (ANTHROPIC_API_KEY, set in the site's environment
// variables and nowhere else) and counts each GitHub user's daily skies in
// Netlify Blobs. See docs/ai/HOSTED-AI.md.
import { describe } from '../../describe.mjs';

const environment = () => ({
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  STUDIO_ORIGIN: process.env.STUDIO_ORIGIN,
  CONSTELLATION_AI: process.env.CONSTELLATION_AI,
  CONSTELLATION_AI_DAILY_LIMIT: process.env.CONSTELLATION_AI_DAILY_LIMIT,
  CONSTELLATION_AI_MODEL: process.env.CONSTELLATION_AI_MODEL,
});

// Loaded on first use. If the store cannot be opened the handler gets no
// counter and reports the feature as off rather than running without a limit.
let store;
async function quota() {
  if (store !== undefined) return store;
  try {
    const { getStore } = await import('@netlify/blobs');
    const blobs = getStore('describe-quota');
    store = {
      get: (key) => blobs.get(key, { type: 'json' }),
      set: (key, value) => blobs.setJSON(key, value),
    };
  } catch {
    store = null;
  }
  return store;
}

export default async (request) => describe(request, environment(), { quota: (await quota()) || undefined });

export const config = {
  path: '/api/describe',
  // One sky is a dozen calls at most; this stops a flood before it reaches
  // the per-user daily count.
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
