import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewData } from '../src/preview-data.mjs';
import { renderConstellation, selectRepositoryPool } from '../src/constellation.mjs';

function fixture() {
  const calls = [];
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const repos = Array.from({ length: 8 }, (_, i) => ({ name: `repo-${i}`, full_name: `octocat/repo-${i}`, stargazers_count: 8 - i }));
  const fetchImpl = async url => {
    calls.push(url);
    return { ok: true, json: async () => url.includes('/events/public') ? [] : url.includes('/users/') ? repos : { JavaScript: 100, CSS: 20 } };
  };
  return { calls, storage, fetchImpl };
}

test('customization, returning to an account, and tab reloads reuse the first snapshot', async () => {
  const f = fixture();
  let data = createPreviewData(f);
  const repos = await data.load('Octocat', { maxRepos: 5 });
  assert.equal(f.calls.length, 7);
  for (const maxRepos of [1, 3, 5]) {
    renderConstellation('octocat', repos, { maxRepos, css: '.star { opacity: .8; }', topics: [], theme: 'auto' });
    assert.equal(selectRepositoryPool(data.snapshot('octocat'), { maxRepos }).length, maxRepos);
  }
  await data.load('OCTOCAT', { maxRepos: 5 });
  data = createPreviewData(f);
  await data.load('octocat', { maxRepos: 5 });
  assert.equal(f.calls.length, 7);
  assert.equal(selectRepositoryPool(data.snapshot('octocat'), { maxRepos: 8 }).filter(repo => !repo.languages).length, 3);
  assert.equal(f.calls.length, 7, 'changing the pool does not fetch');
  await data.load('octocat', { maxRepos: 8 });
  assert.equal(f.calls.length, 10, 'explicit load fetches only missing languages');
  await data.load('octocat', { maxRepos: 5 }, { refresh: true });
  assert.equal(f.calls.length, 17, 'explicit refresh fetches a fresh list and selected languages');
});

test('partial successes survive a failed load and a tab reload', async () => {
  const f = fixture();
  const original = f.fetchImpl;
  f.fetchImpl = async url => {
    if (url.includes('repo-1/languages')) {
      f.calls.push(url);
      return { ok: false, status: 429 };
    }
    return original(url);
  };
  const data = createPreviewData(f);
  await assert.rejects(data.load('octocat', { maxRepos: 5 }), /limit/);
  assert.ok(data.snapshot('octocat').some(repo => repo.languages));
  const saved = data.snapshot('octocat').filter(repo => repo.languages).length;
  f.calls.length = 0;
  f.fetchImpl = original;
  await createPreviewData(f).load('octocat', { maxRepos: 5 });
  assert.equal(f.calls.length, 5 - saved);
  assert.ok(f.calls.every(url => !url.includes('/users/')));
});

test('storage restrictions do not break in-memory caching and concurrent loads are shared', async () => {
  const f = fixture();
  f.storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  const data = createPreviewData(f);
  await Promise.all([data.load('octocat', { maxRepos: 5 }), data.load('octocat', { maxRepos: 5 })]);
  await data.load('octocat', { maxRepos: 5 });
  assert.equal(f.calls.length, 7);
});
