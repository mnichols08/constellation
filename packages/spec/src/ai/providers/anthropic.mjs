// Adapter for the Claude Messages API. This is the only provider-specific
// module: it translates the neutral request from describe.mjs to and from the
// provider's wire format and nothing else. Validation, limits and repair stay
// in describe.mjs and the Rust engine.
//
// Two transports send the same messages:
//   hostedTransport: to a server that holds the key and checks GitHub sign-in;
//   directTransport: straight from the browser with the visitor's own key.
// Neither key ever reaches the engine, a spec, a configuration or an event.

export const ANTHROPIC = Object.freeze({
  url: 'https://api.anthropic.com/v1/messages',
  version: '2023-06-01',
  model: 'claude-haiku-5-5',
  maxTokens: 8000,
});

/** Thrown when a transport cannot be used right now; `reason` says why. */
export class ModelUnavailable extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ModelUnavailable';
    /** 'disabled' | 'sign-in' | 'quota' | 'key' | 'busy' | 'network' */
    this.reason = reason;
  }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Neutral messages -> Messages API messages.
 *
 * `memory.byCall` maps each tool call id to the assistant content exactly as
 * the model returned it, because thinking blocks must be passed back unchanged
 * while tools are in use. `memory.unprompted` holds, in order, the turns where
 * the model answered without calling a tool; describe.mjs records those as a
 * submit call the model never made, so they are replayed here as what really
 * happened: the model's text, then a plain reminder.
 */
export function toAnthropicMessages(messages, memory = {}) {
  const byCall = memory.byCall || new Map();
  const unprompted = [...(memory.unprompted || [])];
  const out = [];
  let results = [];
  let unanswered = new Set();
  const asText = new Set();
  const settle = () => {
    // Every tool_use needs a result, including calls dropped by the per-turn cap.
    for (const id of unanswered) results.push({ type: 'tool_result', tool_use_id: id, content: 'Not run. Ask again if you still need it.', is_error: true });
    unanswered = new Set();
    if (results.length) out.push({ role: 'user', content: results });
    results = [];
  };
  for (const message of messages) {
    if (message.role === 'tool') {
      const content = String(message.content ?? '');
      if (asText.has(message.id)) results.push({ type: 'text', text: `No spec was submitted. ${content}` });
      else { unanswered.delete(message.id); results.push({ type: 'tool_result', tool_use_id: message.id, content }); }
      continue;
    }
    settle();
    if (message.role === 'user') {
      const context = object(message.currentSpec) ? `\n\nCurrent spec to revise:\n${JSON.stringify(message.currentSpec)}` : '';
      out.push({ role: 'user', content: `${message.content}${context}` });
    } else if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      const original = message.toolCalls.map((call) => byCall.get(call.id)).find(Boolean);
      if (original) {
        out.push({ role: 'assistant', content: original });
        unanswered = new Set(original.filter((block) => block.type === 'tool_use').map((block) => block.id));
        continue;
      }
      const said = unprompted.shift();
      if (said?.length) {
        out.push({ role: 'assistant', content: said });
        for (const call of message.toolCalls) asText.add(call.id);
        continue;
      }
      const content = message.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: object(call.arguments) ? call.arguments : {} }));
      out.push({ role: 'assistant', content });
      unanswered = new Set(content.map((block) => block.id));
    }
  }
  settle();
  return out;
}

/** Messages API response -> a neutral model turn. Unknown shapes become an empty turn. */
export function fromAnthropicResponse(body) {
  const content = Array.isArray(body?.content) ? body.content.filter(object) : [];
  return {
    toolCalls: content.filter((block) => block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string').map((block) => ({ id: block.id, name: block.name, arguments: object(block.input) ? block.input : {} })),
    text: content.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n').slice(0, 2000),
    content,
  };
}

/** Tool definitions in the shape the Messages API expects. */
export const toAnthropicTools = (tools) => tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

/**
 * @param {{ send(body: { system: string, messages: object[], tools: object[] }, context: { signal?: AbortSignal }): Promise<object>, name?: string }} options
 *   `send` is a transport: it returns the provider's response JSON or throws.
 */
export function createAnthropicModel({ send, name = 'Claude Haiku' } = {}) {
  if (typeof send !== 'function') throw new Error('createAnthropicModel needs a transport.');
  const memory = { byCall: new Map(), unprompted: [] };
  return {
    name,
    async generate({ system, messages, tools }, { signal } = {}) {
      // A new conversation starts with one message; forget earlier ones.
      if (messages.length === 1) { memory.byCall.clear(); memory.unprompted.length = 0; }
      const turn = fromAnthropicResponse(await send({ system, messages: toAnthropicMessages(messages, memory), tools: toAnthropicTools(tools) }, { signal }));
      if (turn.toolCalls.length) for (const call of turn.toolCalls) memory.byCall.set(call.id, turn.content);
      else memory.unprompted.push(turn.content);
      return { toolCalls: turn.toolCalls, text: turn.text };
    },
  };
}

async function readJSON(response) {
  try { return await response.json(); } catch { return null; }
}

/**
 * The visitor's own key, sent from their browser straight to the provider.
 * The key lives only in the closure the caller creates.
 */
export function directTransport({ apiKey, fetchImpl = globalThis.fetch, model = ANTHROPIC.model } = {}) {
  if (typeof apiKey !== 'string' || !/^sk-ant-[\w-]{20,300}$/.test(apiKey.trim())) throw new ModelUnavailable('key', 'That doesn’t look like an Anthropic API key. They start with “sk-ant-”.');
  const key = apiKey.trim();
  return async ({ system, messages, tools }, { signal } = {}) => {
    let response;
    try {
      response = await fetchImpl(ANTHROPIC.url, {
        method: 'POST', signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC.version, 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: ANTHROPIC.maxTokens, system, messages, tools }),
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ModelUnavailable('network', 'Claude could not be reached. Check your connection.');
    }
    if (response.status === 401 || response.status === 403) throw new ModelUnavailable('key', 'Anthropic rejected that API key.');
    if (response.status === 429 || response.status === 529) throw new ModelUnavailable('busy', 'Claude is busy or your key has reached its limit. Try again in a moment.');
    if (!response.ok) throw new ModelUnavailable('network', 'Claude answered with an error.');
    return readJSON(response);
  };
}

/**
 * A server that holds the key. It sets the model, system prompt and tools
 * itself, so only the conversation is sent, with the visitor's GitHub sign-in
 * as proof of who is asking.
 */
export function hostedTransport({ endpoint, getToken, fetchImpl = globalThis.fetch } = {}) {
  return async ({ messages }, { signal } = {}) => {
    const token = getToken?.();
    if (!token) throw new ModelUnavailable('sign-in', 'Sign in with GitHub to use Claude here.');
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', signal, redirect: 'error', credentials: 'omit', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ messages }) });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ModelUnavailable('network', 'Claude could not be reached. Check your connection.');
    }
    if (response.ok) return readJSON(response);
    const body = await readJSON(response);
    if (response.status === 401) throw new ModelUnavailable('sign-in', 'Your GitHub sign-in has expired. Sign in again to use Claude here.');
    if (response.status === 429 && body?.error === 'quota') throw new ModelUnavailable('quota', `You’ve used today’s ${body.limit ?? ''} Claude requests here. They reset at midnight UTC.`.replace('  ', ' '));
    if (response.status === 429) throw new ModelUnavailable('busy', 'Too many requests. Try again in a minute.');
    if (response.status === 503) throw new ModelUnavailable('disabled', 'Claude isn’t available here right now.');
    throw new ModelUnavailable('network', 'Claude answered with an error.');
  };
}

/**
 * Ask a hosted endpoint whether it is switched on. Never throws: an
 * unreachable or disabled endpoint simply reports `available: false`.
 * @returns {Promise<{ available: boolean, limit?: number, remaining?: number }>}
 */
export async function hostedStatus({ endpoint, getToken, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!endpoint) return { available: false };
  try {
    const token = getToken?.();
    const response = await fetchImpl(endpoint, { method: 'GET', signal, redirect: 'error', credentials: 'omit', headers: token ? { authorization: `Bearer ${token}` } : {} });
    const body = response.ok ? await readJSON(response) : null;
    return { available: body?.available === true, ...(Number.isInteger(body?.limit) ? { limit: body.limit } : {}), ...(Number.isInteger(body?.remaining) ? { remaining: body.remaining } : {}) };
  } catch {
    return { available: false };
  }
}
