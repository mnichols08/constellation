// Portable fetch handler for hosted "Describe your sky". It lets a signed-in
// GitHub user have Claude read their description without ever seeing the
// Anthropic API key: the key stays in this service's environment.
//
// The caller sends only a conversation. The model, system prompt, tools and
// output size are fixed here, so the endpoint cannot be used as a general
// purpose proxy. See docs/ai/HOSTED-AI.md.
//
// Environment:
//   ANTHROPIC_API_KEY            the key for Claude. Missing = the feature is off.
//   CONSTELLATION_AI_PROVIDER    "anthropic" (default) or "openai" for any service
//                                that speaks the chat-completions format.
//   CONSTELLATION_AI_BASE_URL    with "openai": the service's base address (https).
//   CONSTELLATION_AI_API_KEY     with "openai": its key.
//   CONSTELLATION_AI_LABEL       what the Studio calls the reader (default: Claude, or the model id).
//   STUDIO_ORIGIN                the only origin allowed to call this.
//   CONSTELLATION_AI             "off" switches the feature off without removing the key.
//   CONSTELLATION_AI_DAILY_LIMIT skies per GitHub user per UTC day (default 10).
//   CONSTELLATION_AI_MODEL       model id (default claude-haiku-5-5; required with "openai").
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

const CHAT_TOOLS = TOOLS.map(({ name, description, input_schema }) => ({ type: 'function', function: { name, description, parameters: input_schema } }));
const label = (value, fallback) => String(value ?? '').replace(/[^\w .:/+-]/g, '').trim().slice(0, 40) || fallback;

/** Which model service this deployment uses, or null when it is not fully configured. A misspelt provider is off, never a silent fallback. */
export function providerSettings(env) {
  const kind = String(env.CONSTELLATION_AI_PROVIDER ?? 'anthropic').trim().toLowerCase() || 'anthropic';
  if (kind === 'anthropic') {
    return env.ANTHROPIC_API_KEY ? { kind, key: env.ANTHROPIC_API_KEY, model: env.CONSTELLATION_AI_MODEL || DEFAULT_MODEL, label: label(env.CONSTELLATION_AI_LABEL, 'Claude') } : null;
  }
  if (kind !== 'openai') return null;
  const model = String(env.CONSTELLATION_AI_MODEL ?? '').trim();
  let base;
  try { base = new URL(String(env.CONSTELLATION_AI_BASE_URL ?? '')); } catch { return null; }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !env.CONSTELLATION_AI_API_KEY || !/^[\w.:/@+-]{1,120}$/.test(model)) return null;
  return { kind, key: env.CONSTELLATION_AI_API_KEY, model, endpoint: `${base.origin}${base.pathname.replace(/\/+$/, '')}/chat/completions`, label: label(env.CONSTELLATION_AI_LABEL, label(model, 'a language model')) };
}

const enabled = (env) => Boolean(providerSettings(env) && env.STUDIO_ORIGIN) && !/^(off|false|0|disabled)$/i.test(String(env.CONSTELLATION_AI ?? '').trim());
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

/** The same rule for the chat-completions format. */
export function validChatMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > HOSTED_LIMITS.messages * 2) return false;
  if (messages[0]?.role !== 'user' || typeof messages[0].content !== 'string' || !messages[0].content.trim()) return false;
  const text = (value) => typeof value === 'string' && value.length <= AI_LIMITS.maxToolResultLength + 64;
  return messages.every((message, index) => {
    if (!object(message)) return false;
    if (index === 0) return Object.keys(message).every((key) => key === 'role' || key === 'content');
    if (message.role === 'assistant') {
      return Object.keys(message).every((key) => key === 'role' || key === 'content' || key === 'tool_calls')
        && (message.content === null || text(message.content))
        && Array.isArray(message.tool_calls) && message.tool_calls.length > 0 && message.tool_calls.length <= HOSTED_LIMITS.blocksPerMessage
        && message.tool_calls.every((call) => object(call) && typeof call.id === 'string' && call.type === 'function' && object(call.function) && TOOL_NAMES.has(call.function.name) && text(call.function.arguments));
    }
    if (message.role === 'tool') return Object.keys(message).every((key) => key === 'role' || key === 'content' || key === 'tool_call_id') && typeof message.tool_call_id === 'string' && text(message.content);
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
  const settings = providerSettings(env);
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
    return reply(200, { available: true, provider: settings.kind, label: settings.label, limit, ...(remaining === undefined ? {} : { remaining }) });
  }
  if (request.method !== 'POST') return reply(405, { error: 'method' });
  if (origin !== env.STUDIO_ORIGIN || !env.STUDIO_ORIGIN) return reply(403, { error: 'origin' });
  if (!on || limit === 0) return reply(503, { error: 'disabled' });
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply(415, { error: 'json' });
  if (!bearer) return reply(401, { error: 'sign-in' });

  const body = await readBody(request, HOSTED_LIMITS.requestBytes).catch(() => null);
  if (body === undefined) return reply(413, { error: 'too-large' });
  if (!object(body) || !(settings.kind === 'openai' ? validChatMessages : validMessages)(body.messages)) return reply(400, { error: 'invalid' });

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

  const upstream = settings.kind === 'openai'
    ? { url: settings.endpoint, headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.key}` }, body: { model: settings.model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...body.messages], tools: CHAT_TOOLS } }
    : { url: 'https://api.anthropic.com/v1/messages', headers: { 'content-type': 'application/json', 'x-api-key': settings.key, 'anthropic-version': '2023-06-01' }, body: { model: settings.model, max_tokens: HOSTED_LIMITS.maxTokens, system: SYSTEM_PROMPT, tools: TOOLS, messages: body.messages } };
  let response;
  try {
    response = await fetchImpl(upstream.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000), headers: upstream.headers, body: JSON.stringify(upstream.body) });
  } catch { return reply(502, { error: 'upstream' }); }
  // A rejected key or an exhausted account is the operator's problem, not the
  // visitor's: report "not available" so the Studio offers its other readers.
  if (response.status === 401 || response.status === 403) return reply(503, { error: 'disabled' });
  if (response.status === 429 || response.status === 529) return reply(429, { error: 'busy' });
  if (!response.ok) return reply(502, { error: 'upstream' });
  let result;
  try { result = await response.json(); } catch { return reply(502, { error: 'upstream' }); }
  // Forward only the model's turn: no usage, ids or upstream diagnostics.
  if (settings.kind === 'openai') {
    const message = object(result?.choices?.[0]?.message) ? result.choices[0].message : {};
    const calls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).filter((call) => object(call) && object(call.function)).slice(0, HOSTED_LIMITS.blocksPerMessage)
      .map((call) => ({ id: String(call.id ?? ''), type: 'function', function: { name: String(call.function.name ?? ''), arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}) } }));
    return reply(200, { choices: [{ message: { content: typeof message.content === 'string' ? message.content : null, ...(calls.length ? { tool_calls: calls } : {}) } }], remaining: Math.max(0, limit - used.skies) });
  }
  return reply(200, { content: Array.isArray(result?.content) ? result.content : [], stop_reason: typeof result?.stop_reason === 'string' ? result.stop_reason : null, remaining: Math.max(0, limit - used.skies) });
}
