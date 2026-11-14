// Shared by the provider adapters. Nothing here knows a provider.

/** Thrown when a transport cannot be used right now; `reason` says why. */
export class ModelUnavailable extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ModelUnavailable';
    /** 'disabled' | 'sign-in' | 'quota' | 'key' | 'busy' | 'network' | 'blocked' | 'model' */
    this.reason = reason;
  }
}

export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function readJSON(response) {
  try { return await response.json(); } catch { return null; }
}

/** The opening user message, with the spec being revised when there is one. */
export const firstMessage = (message) => `${message.content}${object(message.currentSpec) ? `\n\nCurrent spec to revise:\n${JSON.stringify(message.currentSpec)}` : ''}`;
