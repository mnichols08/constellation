import test from 'node:test';
import assert from 'node:assert/strict';
import { designPath, publishedDesign, publishedDesignLink, parsePublishedLink, loadPublishedDesign } from '../src/published-design.mjs';
import { MAX_CONFIG_BYTES } from '../src/config-schema.mjs';
import { readmeSnippet } from '../src/export.mjs';

const STUDIO = 'https://mnichols08.github.io/constellation/';
const response = (body, { status = 200, headers = {} } = {}) => new Response(body, { status, headers });

test('a published link names the repository and round-trips', () => {
  const link = publishedDesignLink('octocat/octocat');
  assert.equal(link, `${STUDIO}?published=octocat/octocat`);
  assert.deepEqual(parsePublishedLink(link), {
    repository: 'octocat/octocat', filename: 'constellation.svg', branch: 'output', account: 'octocat',
    url: 'https://raw.githubusercontent.com/octocat/octocat/output/.constellation/designs/constellation.json',
  });
  // The owner's own account adds nothing; a different one is named for the fallback.
  assert.equal(publishedDesignLink('octocat/octocat', { account: 'Octocat' }), link);
  const other = publishedDesignLink('collective/.github', { filename: 'alice-sky.svg', branch: 'images/daily', account: 'alice' });
  assert.equal(other, `${STUDIO}?published=collective/.github&image=alice-sky.svg&branch=images/daily&user=alice`);
  assert.deepEqual(parsePublishedLink(other), {
    repository: 'collective/.github', filename: 'alice-sky.svg', branch: 'images/daily', account: 'alice',
    url: 'https://raw.githubusercontent.com/collective/.github/images/daily/.constellation/designs/alice-sky.json',
  });
  assert.equal(designPath('alice-sky.svg'), '.constellation/designs/alice-sky.json');
  // The link is safe inside Markdown link syntax.
  assert.doesNotMatch(other, /[()\s<>"]/);
  assert.equal(parsePublishedLink(/\]\((https:\/\/mnichols08\.github\.io[^)]+)\)/.exec(readmeSnippet('octocat'))[1]).repository, 'octocat/octocat');
});

test('addresses that are not published links are left to the share-link reader', () => {
  assert.equal(parsePublishedLink(`${STUDIO}?user=octocat`), null);
  assert.equal(parsePublishedLink(STUDIO), null);
});

test('unsafe published links are refused before any request', () => {
  for (const query of [
    'published=octocat', 'published=octocat/..', 'published=a/b/c', 'published=octocat/repo%0Ax',
    'published=../etc/passwd', 'published=octocat/octocat&published=evil/evil',
    'published=octocat/octocat&image=../secret.svg', 'published=octocat/octocat&image=x.json',
    'published=octocat/octocat&branch=../main', 'published=octocat/octocat&branch=a//b',
    'published=octocat/octocat&user=not%20a%20login', 'published=YOUR_USERNAME/YOUR_REPOSITORY',
  ]) assert.throws(() => parsePublishedLink(`${STUDIO}?${query}`), /Unable to open/, query);
  assert.throws(() => publishedDesignLink('octocat/octocat', { filename: 'a b.svg' }));
  assert.throws(() => publishedDesignLink('bad/repo/extra'));
});

test('a published design is fetched anonymously and validated like any settings file', async () => {
  const source = parsePublishedLink(publishedDesignLink('octocat/octocat'));
  const calls = [];
  const text = publishedDesign('https://github.com/Octocat', { arrangement: 'rings', maxRepos: 12 });
  const design = await loadPublishedDesign(source, { fetchImpl: async (url, init) => { calls.push({ url, init }); return response(text); } });
  assert.equal(design.account, 'Octocat');
  assert.equal(design.options.arrangement, 'rings');
  assert.equal(design.options.maxRepos, 12);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, source.url);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers, undefined, 'no token or custom header is ever sent');
  // Deterministic, so an unchanged design never changes the published file.
  assert.equal(publishedDesign('Octocat', { arrangement: 'rings', maxRepos: 12 }), text);
});

test('missing, oversized, malformed and slow designs are rejected', async () => {
  const source = parsePublishedLink(publishedDesignLink('octocat/octocat'));
  const load = (fetchImpl, options) => loadPublishedDesign(source, { fetchImpl, ...options });
  await assert.rejects(load(async () => response('Not Found', { status: 404 })), /No published design/);
  await assert.rejects(load(async () => response('{not json')));
  await assert.rejects(load(async () => response('[]')), /JSON object/);
  await assert.rejects(load(async () => response(JSON.stringify({ version: 99, options: {} }))), /Unsupported/);
  await assert.rejects(load(async () => response('{}', { headers: { 'content-length': String(MAX_CONFIG_BYTES + 1) } })), /too large/);
  await assert.rejects(load(async () => response(`{"note":"${'x'.repeat(MAX_CONFIG_BYTES)}"}`)), /too large/);
  await assert.rejects(load(async () => { throw new TypeError('Failed to fetch'); }));
  await assert.rejects(load((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), { timeout: 10 }), /aborted/);
  await assert.rejects(loadPublishedDesign(source, { fetchImpl: null }));
});
