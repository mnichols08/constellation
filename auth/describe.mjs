// Portable fetch handler for hosted "Describe your sky". It lets a signed-in
// GitHub user have Claude read their description without ever seeing the
// Anthropic API key: the key stays in this service's environment.
//
// The caller sends only a conversation. The model, system prompt, tools and
// output size are fixed here, so the endpoint cannot be used as a general
// purpose proxy. See docs/ai/HOSTED-AI.md.
//
// Environment:
//   ANTHROPIC_API_KEY            the key. Missing = the feature is off.
//   STUDIO_ORIGIN                the only origin allowed to call this.
//   CONSTELLATION_AI             "off" switches the feature off without removing the key.
//   CONSTELLATION_AI_DAILY_LIMIT skies per GitHub user per UTC day (default 10).
//   CONSTELLATION_AI_MODEL       model id (default claude-haiku-5-5).
//
// Off is a normal state, not an error: GET answers 200 { available: false }.

import { SYSTEM_PROMPT, modelTools, AI_LIMITS } from '../src/ai/describe.mjs';
import { toolDefinitions } from '../src/constellation-spec-schema.mjs';

export const HOSTED_LIMITS = Object.freeze({
  dailySkies: 10,
  // One sky is a short conversation; this caps the turns a day's skies may use
  // in total, so later turns cannot be replayed for free.
  turnsPerSky: AI_LIMITS.maxTurns + AI_LIMITS.maxRepairs + 2,
  requestBytes: 400_000,
  messages: 64,
  blocksPerMessage: 24,
  // Room for the model's thinking as well as the spec.
  maxTokens: 8000,
});

const DEFAULT_MODEL = 'claude-haiku-5-5';
const TOOLS = modelTools(toolDefinitions).map(({ name, description, input_schema }) => ({ name, description, input_schema }));
const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const enabled = (env) => Boolean(env.ANTHROPIC_API_KEY && env.STUDIO_ORIGIN) && !/^(off|false|0|disabled)$/i.test(String(env.CONSTELLATION_AI ?? '').trim());
const dailyLimit = (env) => { const value = Number.parseInt(env.CONSTELLATION_AI_DAILY_LIMIT, 10); return Number.isInteger(value) && value >= 0 && value <= 1000 ? value : HOSTED_LIMITS.dailySkies; };
const today = (now) => new Date(now).toISOString().slice(0, 10);

/** Only the conversation shapes the Studio produces are accepted. */
export function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > HOSTED_LIMITS.messages) return false;
  if (messages[0]?.role !== 'user' || typeof messages[0].content !== 'string' || !messages[0].content.trim()) return false;
  return messages.every((message, index) => {
    if (!object(message) || Object.keys(message).some((key) => key !== 'role' && key !== 'content')) return false;
    if (index === 0) return true;
    if (!Array.isArray(message.content) || !message.content.length || message.content.length > HOSTED_LIMITS.blocksPerMessage) return false;
    if (message.role === 'assistant') return index % 2 === 1 && message.content.every((block) => object(block) && (
      block.type === 'thinking' || block.type === 'redacted_thinking' || (block.type === 'text' && typeof block.text === 'string')
      || (block.type === 'tool_use' && typeof block.id === 'string' && TOOL_NAMES.has(block.name) && object(block.input))));
    if (message.role === 'user') return index % 2 === 0 && message.content.every((block) => object(block) && ((block.type === 'tool_result' && typeof block.tool_use_id === 'string' && typeof block.content === 'string' && block.content.length <= AI_LIMITS.maxToolResultLength + 64)
      || (block.type === 'text' && typeof block.text === 'string' && block.text.length <= AI_LIMITS.maxToolResultLength + 64)));
    return false;
  });
}

async function readBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0, text = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return undefined; }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

/** Who is asking, according to GitHub. Null when the token is not accepted. */
async function githubUser(token, fetchImpl) {
  if (!/^[\w.-]{20,255}$/.test(token)) return null;
  const response = await fetchImpl('https://api.github.com/user', { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'constellation-describe' } });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('GitHub is unavailable.');
  const user = await response.json();
  return Number.isSafeInteger(user?.id) ? { id: user.id } : null;
}

/**
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch, now?: () => number,
 *   quota?: { get(key: string): Promise<{ skies: number, turns: number } | null>, set(key: string, value: object): Promise<void> } }} [services]
 *   `quota` is any small key-value store. Without one the feature reports itself off.
 */
export async function describe(request, env, { fetchImpl = fetch, quota, now = Date.now } = {}) {
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin', 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };
  const reply = (status, body) => Response.json(body, { status, headers });
  const origin = request.headers.get('Origin');
  if (env.STUDIO_ORIGIN && origin === env.STUDIO_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = env.STUDIO_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Max-Age'] = '600';
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const on = enabled(env) && Boolean(quota);
  const limit = dailyLimit(env);
  const bearer = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '')?.[1] || '';

  if (request.method === 'GET') {
    // Status. Never an error: a switched-off service is simply not available.
    if (!on || limit === 0) return reply(200, { available: false });
    let remaining;
    if (bearer && origin === env.STUDIO_ORIGIN) {
      try {
        const user = await githubUser(bearer, fetchImpl);
        if (user) remaining = Math.max(0, limit - ((await quota.get(`${today(now())}/${user.id}`))?.skies || 0));
      } catch {}
    }
    return reply(200, { available: true, limit, ...(remaining === undefined ? {} : { remaining }) });
  }
  if (request.method !== 'POST') return reply(405, { error: 'method' });
  if (origin !== env.STUDIO_ORIGIN || !env.STUDIO_ORIGIN) return reply(403, { error: 'origin' });
  if (!on || limit === 0) return reply(503, { error: 'disabled' });
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415, { error: 'json' });
  if (!bearer) return reply(401, { error: 'sign-in' });

  const body = await readBody(request, HOSTED_LIMITS.requestBytes).catch(() => null);
  if (body === undefined) return reply(413, { error: 'too-large' });
  if (!object(body) || !validMessages(body.messages)) return reply(400, { error: 'invalid' });

  let user;
  try { user = await githubUser(bearer, fetchImpl); } catch { return reply(502, { error: 'github' }); }
  if (!user) return reply(401, { error: 'sign-in' });

  // Count before calling the model, so a failed or abandoned sky still counts
  // and parallel requests cannot all slip under the limit together.
  const key = `${today(now())}/${user.id}`;
  let used;
  try {
    used = (await quota.get(key)) || { skies: 0, turns: 0 };
    const starting = body.messages.length === 1;
    const next = { skies: (Number(used.skies) || 0) + (starting ? 1 : 0), turns: (Number(used.turns) || 0) + 1 };
    // A later turn needs a sky that was started today.
    if (next.skies > limit || next.turns > limit * HOSTED_LIMITS.turnsPerSky || (!starting && next.skies === 0)) return reply(429, { error: 'quota', limit, remaining: 0 });
    await quota.set(key, next);
    used = next;
  } catch {
    // No working counter means no way to keep the promise of a limit: stay closed.
    return reply(503, { error: 'disabled' });
  }

  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: env.CONSTELLATION_AI_MODEL || DEFAULT_MODEL, max_tokens: HOSTED_LIMITS.maxTokens, system: SYSTEM_PROMPT, tools: TOOLS, messages: body.messages }),
    });
  } catch { return reply(502, { error: 'upstream' }); }
  // A rejected key or an exhausted account is the operator's problem, not the
  // visitor's: report "not available" so the Studio offers its other readers.
  if (response.status === 401 || response.status === 403) return reply(503, { error: 'disabled' });
  if (response.status === 429 || response.status === 529) return reply(429, { error: 'busy' });
  if (!response.ok) return reply(502, { error: 'upstream' });
  let result;
  try { result = await response.json(); } catch { return reply(502, { error: 'upstream' }); }
  // Forward only the model's turn: no usage, ids or upstream diagnostics.
  return reply(200, { content: Array.isArray(result?.content) ? result.content : [], stop_reason: typeof result?.stop_reason === 'string' ? result.stop_reason : null, remaining: Math.max(0, limit - used.skies) });
}
