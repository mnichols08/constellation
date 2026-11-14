// Adapter for the chat-completions format that OpenAI introduced and many
// others serve: OpenRouter, Groq, Ollama, LM Studio and more. One adapter, any
// address. Like every provider module it only translates: validation, limits
// and repair stay in describe.mjs and the Rust engine.
import { ModelUnavailable, object, readJSON, firstMessage } from './shared.mjs';

/** Address shortcuts for the Studio. A preset is a starting point, not a promise that the service accepts calls from a web page. */
export const OPENAI_STYLE_PRESETS = Object.freeze([
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', example: 'vendor/model-name', key: true },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', example: 'the model’s id', key: true },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', example: 'llama-3.3-70b-versatile', key: true },
  { id: 'ollama', label: 'Ollama on this computer', baseUrl: 'http://localhost:11434/v1', example: 'a name from “ollama list”', key: false },
  { id: 'custom', label: 'Another address', baseUrl: '', example: 'the model’s id', key: false },
]);

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The chat-completions address for a base address. Only https, or http to
 * this computer; never an address carrying credentials.
 */
export function chatEndpoint(baseUrl) {
  let url;
  try { url = new URL(String(baseUrl ?? '').trim()); } catch { throw new ModelUnavailable('model', 'Enter the address of the service, starting with https://'); }
  if (url.username || url.password || url.search || url.hash) throw new ModelUnavailable('model', 'The address should be just the service’s base address, with no sign-in details or query.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL.has(url.hostname))) throw new ModelUnavailable('model', 'The address must start with https://, or be http://localhost for a model on this computer.');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path.endsWith('/chat/completions') ? path : `${path}/chat/completions`}`;
}
const local = (endpoint) => LOCAL.has(new URL(endpoint).hostname);

/** Neutral messages -> chat-completions messages. */
export function toChatMessages(messages) {
  const out = [];
  for (const message of messages) {
    if (message.role === 'user') out.push({ role: 'user', content: firstMessage(message) });
    else if (message.role === 'tool') out.push({ role: 'tool', tool_call_id: message.id, content: String(message.content ?? '') });
    else if (message.role === 'assistant' && Array.isArray(message.toolCalls) && message.toolCalls.length) {
      out.push({ role: 'assistant', content: null, tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(object(call.arguments) ? call.arguments : {}) } })) });
    }
  }
  return out;
}

/** Tool definitions in the chat-completions shape. */
export const toChatTools = (tools) => tools.map(({ name, description, input_schema }) => ({ type: 'function', function: { name, description, parameters: input_schema } }));

/** A chat-completions response -> a neutral model turn. Unknown shapes become an empty turn. */
export function fromChatResponse(body) {
  const message = object(body?.choices?.[0]?.message) ? body.choices[0].message : {};
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls.filter((call) => object(call) && object(call.function) && typeof call.function.name === 'string') : [];
  return {
    // Arguments arrive as JSON text; describe.mjs parses and checks them.
    toolCalls: calls.map((call, index) => ({ id: typeof call.id === 'string' && call.id ? call.id : `call-${index + 1}`, name: call.function.name, arguments: call.function.arguments ?? {} })),
    text: typeof message.content === 'string' ? message.content.slice(0, 2000) : '',
  };
}

/**
 * @param {{ send(body: { system: string, messages: object[], tools: object[] }, context: { signal?: AbortSignal }): Promise<object>, name?: string }} options
 */
export function createOpenAICompatibleModel({ send, name = 'A language model' } = {}) {
  if (typeof send !== 'function') throw new Error('createOpenAICompatibleModel needs a transport.');
  return {
    name,
    async generate({ system, messages, tools }, { signal } = {}) {
      const turn = fromChatResponse(await send({ system, messages: toChatMessages(messages), tools: toChatTools(tools) }, { signal }));
      return { toolCalls: turn.toolCalls, text: turn.text };
    },
  };
}

/**
 * The visitor's own key (or none, for a local model), sent from their browser
 * straight to the address they chose. The key lives only in this closure.
 */
export function directChatTransport({ baseUrl, model, apiKey = '', fetchImpl = globalThis.fetch } = {}) {
  const endpoint = chatEndpoint(baseUrl);
  const chosen = String(model ?? '').trim();
  if (!/^[\w.:/@+-]{1,120}$/.test(chosen)) throw new ModelUnavailable('model', 'Enter the model’s name as the service writes it, with no spaces.');
  const key = String(apiKey ?? '').trim();
  if (key && !/^[\x21-\x7e]{8,400}$/.test(key)) throw new ModelUnavailable('key', 'That doesn’t look like an API key.');
  if (!key && !local(endpoint)) throw new ModelUnavailable('key', 'Enter your API key for that service.');
  const host = new URL(endpoint).host;
  return async ({ system, messages, tools }, { signal } = {}) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST', signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ model: chosen, messages: [{ role: 'system', content: system }, ...messages], tools }),
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // A browser gives no detail here: offline, a wrong address, and a service
      // that refuses calls from web pages all look the same.
      throw new ModelUnavailable('blocked', local(endpoint)
        ? `Nothing answered at ${host}. Check the model is running and allows this page to call it.`
        : `${host} could not be reached from this page. Check the address and your connection; some services refuse calls from a browser.`);
    }
    if (response.status === 401 || response.status === 403) throw new ModelUnavailable('key', `${host} rejected that API key.`);
    if (response.status === 404) throw new ModelUnavailable('model', `${host} has no model or address by that name. Check the address and the model’s name.`);
    if (response.status === 429) throw new ModelUnavailable('busy', `${host} is busy or your key has reached its limit. Try again in a moment.`);
    if (!response.ok) throw new ModelUnavailable('network', `${host} answered with an error. The model may not support tools.`);
    return readJSON(response);
  };
}
