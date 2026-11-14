// The Studio's side of a hosted reader: a server that holds the key and
// decides the model. The same for every provider; only the message format
// differs, and the server says which one it speaks.
import { ModelUnavailable, readJSON } from './shared.mjs';

/**
 * A server that holds the key. It sets the model, system prompt and tools
 * itself, so only the conversation is sent, with the visitor's GitHub sign-in
 * as proof of who is asking.
 */
export function hostedTransport({ endpoint, getToken, label = 'Claude', fetchImpl = globalThis.fetch } = {}) {
  return async ({ messages }, { signal } = {}) => {
    const token = getToken?.();
    if (!token) throw new ModelUnavailable('sign-in', `Sign in with GitHub to use ${label} here.`);
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', signal, redirect: 'error', credentials: 'omit', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ messages }) });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new ModelUnavailable('network', `${label} could not be reached. Check your connection.`);
    }
    if (response.ok) return readJSON(response);
    const body = await readJSON(response);
    if (response.status === 401) throw new ModelUnavailable('sign-in', `Your GitHub sign-in has expired. Sign in again to use ${label} here.`);
    if (response.status === 429 && body?.error === 'quota') throw new ModelUnavailable('quota', `You’ve used today’s ${body.limit ?? ''} ${label} requests here. They reset at midnight UTC.`.replace('  ', ' '));
    if (response.status === 429) throw new ModelUnavailable('busy', 'Too many requests. Try again in a minute.');
    if (response.status === 503) throw new ModelUnavailable('disabled', `${label} isn’t available here right now.`);
    throw new ModelUnavailable('network', `${label} answered with an error.`);
  };
}

/**
 * Ask a hosted endpoint whether it is switched on. Never throws: an
 * unreachable or disabled endpoint simply reports `available: false`.
 * @returns {Promise<{ available: boolean, provider?: 'anthropic'|'openai', label?: string, limit?: number, remaining?: number }>}
 */
export async function hostedStatus({ endpoint, getToken, fetchImpl = globalThis.fetch, signal } = {}) {
  if (!endpoint) return { available: false };
  try {
    const token = getToken?.();
    const response = await fetchImpl(endpoint, { method: 'GET', signal, redirect: 'error', credentials: 'omit', headers: token ? { authorization: `Bearer ${token}` } : {} });
    const body = response.ok ? await readJSON(response) : null;
    if (body?.available !== true) return { available: false };
    return {
      available: true,
      // Which wire format the server speaks, and what to call its model. Both are display and routing hints, cleaned here.
      provider: body?.provider === 'openai' ? 'openai' : 'anthropic',
      label: typeof body?.label === 'string' && body.label.trim() ? body.label.replace(/[^\w .:/+-]/g, '').trim().slice(0, 40) || 'Claude' : 'Claude',
      ...(Number.isInteger(body?.limit) ? { limit: body.limit } : {}), ...(Number.isInteger(body?.remaining) ? { remaining: body.remaining } : {}),
    };
  } catch {
    return { available: false };
  }
}
