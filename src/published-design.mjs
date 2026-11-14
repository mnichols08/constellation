// The design a README workflow publishes next to its image, and the link that
// opens it in the Studio. An image in a README cannot carry links of its own,
// so the Markdown around it links to the Studio, which reads the design the
// workflow last published and draws it interactively.
//
// The published file is ordinary configuration (config v7) and is treated as
// untrusted input: bounded, validated by parseConfig, never executed.

import { parseConfig, serializeConfig, MAX_CONFIG_BYTES } from './config-schema.mjs';
import { username } from './constellation.mjs';
import { PUBLIC_STUDIO_URL } from './share-link.mjs';

/** Directory on the output branch holding one design per published image. */
export const DESIGN_DIRECTORY = '.constellation/designs';
export const DEFAULT_IMAGE = 'constellation.svg';
export const DEFAULT_BRANCH = 'output';
const FETCH_TIMEOUT_MS = 8000;

const REPOSITORY = /^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i;
const IMAGE = /^[a-z\d][a-z\d._-]{0,120}\.svg$/i;
const BRANCH = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
const LOGIN = /^[a-z\d][a-z\d-]{0,38}$/i;

function checkRepository(repository) {
  const target = String(repository ?? '').trim();
  if (!REPOSITORY.test(target) || ['.', '..'].includes(target.split('/')[1])) throw new Error('Enter the workflow repository as owner/repository.');
  return target;
}

function checkImage(filename) {
  if (!IMAGE.test(filename)) throw new Error('Use a safe .svg filename for a published image.');
  return filename;
}

function checkBranch(branch) {
  if (!BRANCH.test(branch) || branch.includes('..') || branch.endsWith('/') || branch.includes('//')) throw new Error('Enter a safe output branch name.');
  return branch;
}

/** Where the design for an image lives on the output branch. */
export function designPath(filename = DEFAULT_IMAGE) {
  return `${DESIGN_DIRECTORY}/${checkImage(filename).replace(/\.svg$/i, '')}.json`;
}

/**
 * The file a workflow publishes beside its image: the settings it drew with,
 * as config v7 text. Stable for an unchanged design, so it adds no daily commits.
 */
export function publishedDesign(account, options = {}) {
  const text = `${serializeConfig(username(account), options)}\n`;
  if (text.length > MAX_CONFIG_BYTES) throw new Error('This design is too large to publish beside its image.');
  return text;
}

/**
 * The Studio address that opens whatever a repository's workflow last
 * published. It names the repository, not the design, so a README pasted once
 * keeps opening the current design after the workflow changes.
 */
export function publishedDesignLink(repository, { filename = DEFAULT_IMAGE, branch = DEFAULT_BRANCH, account = null, base = PUBLIC_STUDIO_URL } = {}) {
  const target = checkRepository(repository);
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  // Every part is already limited to characters that are literal in a query.
  let query = `?published=${target}`;
  if (filename !== DEFAULT_IMAGE) query += `&image=${checkImage(filename)}`;
  if (branch !== DEFAULT_BRANCH) query += `&branch=${checkBranch(branch)}`;
  // The account is only named when it isn't the repository's owner; it is what
  // the Studio opens if the design can't be read.
  const login = account ? username(account) : '';
  if (login && login.toLowerCase() !== target.split('/')[0].toLowerCase()) query += `&user=${login}`;
  return url.href + query;
}

/**
 * Read a published-design link. Null when the address isn't one; throws when
 * it is one but names something unsafe.
 */
export function parsePublishedLink(href) {
  const url = new URL(href);
  if (!url.searchParams.has('published')) return null;
  try {
    for (const key of ['published', 'image', 'branch', 'user'])
      if (url.searchParams.getAll(key).length > 1) throw new Error('Duplicate parameter.');
    const repository = checkRepository(url.searchParams.get('published'));
    const filename = checkImage(url.searchParams.get('image') ?? DEFAULT_IMAGE);
    const branch = checkBranch(url.searchParams.get('branch') ?? DEFAULT_BRANCH);
    const owner = repository.split('/')[0];
    const user = url.searchParams.get('user');
    if (user !== null && !LOGIN.test(user)) throw new Error('Invalid account.');
    const path = [...repository.split('/'), ...branch.split('/'), ...designPath(filename).split('/')].map(encodeURIComponent).join('/');
    return { repository, filename, branch, account: user || owner, url: `https://raw.githubusercontent.com/${path}` };
  } catch {
    throw new Error('Unable to open this published design link.');
  }
}

/** Response text, refusing anything longer than a settings file may be. */
async function boundedText(response, limit) {
  if (Number(response.headers?.get?.('content-length')) > limit) throw new Error('Published design is too large.');
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (text.length > limit) throw new Error('Published design is too large.');
    return text;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('Published design is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Fetch and validate the design a link points at. One anonymous, bounded,
 * cancellable request; resolves to `{ account, options }` or rejects.
 */
export async function loadPublishedDesign(source, { fetchImpl = globalThis.fetch, signal, timeout = FETCH_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('This browser can’t read the published design.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetchImpl(source.url, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) throw new Error('No published design was found.');
    const { account, options } = parseConfig(await boundedText(response, MAX_CONFIG_BYTES), source.account);
    return { account, options };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}
