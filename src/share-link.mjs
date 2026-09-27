import { parseConfig } from './config-schema.mjs';

export const MAX_SHARE_LENGTH = 8000;
export function encodeShare(base, account, options) {
  const payload = parseConfig({ version: 1, account, options });
  // Manual coordinates and authored CSS are deliberately JSON-only.
  for (const key of ['starPositions', 'labelPositions', 'labelOffsets', 'css', 'customCSS']) delete payload.options[key];
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const url = new URL(base); url.search = ''; url.hash = '';
  url.searchParams.set('user', payload.account); url.searchParams.set('view', encoded);
  if (url.href.length > MAX_SHARE_LENGTH) throw new Error('This view is too large for a share link. Download config JSON instead.');
  return url.href;
}

export function decodeShare(href) {
  const url = new URL(href);
  const encoded = url.searchParams.get('view');
  if (!encoded) return null;
  if (href.length > MAX_SHARE_LENGTH || !/^[\w-]+$/.test(encoded)) throw new Error('Invalid share link.');
  try {
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    const result = parseConfig(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (url.searchParams.get('user')?.toLowerCase() !== result.account.toLowerCase()) throw new Error('Account mismatch.');
    return result;
  } catch { throw new Error('Unable to restore this share link. Default settings are available.'); }
}
