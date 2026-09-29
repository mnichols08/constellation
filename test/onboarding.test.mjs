import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultIntent, recommendProjects, validateIntent, intentStore } from '../src/onboarding-model.mjs';
import { generateGuidedDesign } from '../src/onboarding-generator.mjs';
import { createPreviewData } from '../src/preview-data.mjs';

const repos = Array.from({ length: 12 }, (_, i) => ({ name: `r${i}`, full_name: `alice/r${i}`, created_at: `${2010 + i}-01-01`, updated_at: '2026-01-01', languages: { Rust: 100 }, topics: ['tools'], stargazers_count: i }));
test('guided generation is deterministic and preserves explicit constraints across seeds', () => {
  for (const history of ['current', 'history', '3d', 'surprise']) for (const activity of ['none', 'orbit', 'asteroids', 'recent', 'subtle', 'surprise']) {
    const intent = { ...defaultIntent(repos), languages: ['Rust'], topics: ['tools'], history, activity, motion: 'still' };
    const context = { seed: 'fixture', year: 2026 };
    assert.deepEqual(generateGuidedDesign('alice', repos, intent, context), generateGuidedDesign('alice', repos, intent, context));
    for (const seed of ['one', 'two']) {
      const { config: { options }, history: resolved } = generateGuidedDesign('alice', repos, intent, { ...context, seed });
      assert.deepEqual(options.includeRepos, intent.projects); assert.deepEqual(options.languages, ['Rust']); assert.deepEqual(options.topics, ['tools']);
      assert.equal(options.maxRepos, 12); assert.equal(options.animate, false); assert.equal(options.floatingAnimation.enabled, false);
      assert.equal(options.history.timeLapse.enabled, false); assert.equal(options.contributionOrbit.enabled, activity === 'orbit' || activity === 'surprise' && options.contributionOrbit.enabled);
      if (history === '3d') { assert.equal(options.arrangement, 'temporal-stack'); assert.equal(options.temporalStack.yearStart, 2010); }
      if (resolved === 'current') assert.notEqual(options.arrangement, 'temporal-stack');
    }
  }
});
test('recommendation is stable, multi-signal and honors private exclusions', () => {
  const pool = [{ ...repos[0], full_name: 'alice/active', description: 'Useful', language: 'Rust' }, { ...repos[0], full_name: 'alice/archive', archived: true, fork: true }, { ...repos[11], private: true }];
  assert.deepEqual(recommendProjects(pool), ['alice/active', 'alice/archive']); assert.deepEqual(recommendProjects([...pool].reverse()), recommendProjects(pool));
});
test('unsupported history and unavailable activity safely compile to current, quiet designs', () => {
  const small = repos.slice(0, 2), intent = { ...defaultIntent(small), history: '3d', activity: 'orbit' };
  const result = generateGuidedDesign('alice', small, intent, { seed: 'quiet', year: 2026, activityAvailable: false });
  assert.equal(result.history, 'current'); assert.equal(result.activity, 'none'); assert.equal(result.config.options.contributionOrbit.enabled, false);
});
test('skipping or clearing topics leaves selected projects visible', () => {
  for (const topics of [null, []]) {
    const result = generateGuidedDesign('alice', repos, { ...defaultIntent(repos), topics, activity: 'none' }, { seed: 'skip-topics', year: 2026 });
    assert.equal(result.config.options.topics, null);
    assert.deepEqual(result.config.options.includeRepos, defaultIntent(repos).projects);
  }
});
test('intent storage validates, isolates accounts, and tolerates unavailable storage', () => {
  const values = new Map(), store = intentStore({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  const intent = defaultIntent(repos); store.save('Alice', intent); assert.deepEqual(store.read('alice'), intent); assert.equal(store.read('bob'), null);
  assert.equal(intentStore().save('alice', intent), false); assert.equal(intentStore().read('alice'), null);
  assert.throws(() => validateIntent({ ...intent, version: 2 })); assert.throws(() => validateIntent({ ...intent, projects: [] }));
});
test('guided account load postpones optional activity and reuses cached repositories', async () => {
  const calls = [];
  const data = createPreviewData({ fetchImpl: async url => { calls.push(url); return Response.json(url.includes('/events') ? [] : url.includes('/repos?') ? repos : { login: 'alice', type: 'User' }); } });
  await data.load('alice', { maxRepos: 100 }, { activity: false }); assert.equal(calls.some(url => url.includes('/events')), false);
  await data.loadActivity('alice'); assert.equal(calls.filter(url => url.includes('/events')).length, 1);
  await data.load('alice', { maxRepos: 100 }, { activity: false }); assert.equal(calls.filter(url => url.includes('/repos?')).length, 1);
});
test('guided entry loads metadata first and hydrates only chosen projects', async () => {
  const calls = [], metadata = repos.map(({ languages, ...repo }) => ({ ...repo, language: 'Rust' }));
  const data = createPreviewData({ fetchImpl: async url => {
    calls.push(url);
    return Response.json(url.endsWith('/languages') ? { Rust: 100 } : url.includes('/repos?') ? metadata : { login: 'alice', type: 'User' });
  } });
  await data.load('alice', { maxRepos: 100 }, { activity: false, languages: false });
  assert.equal(calls.some(url => url.endsWith('/languages')), false);
  await data.load('alice', { maxRepos: 1, includeRepos: ['alice/r0'] }, { activity: false });
  assert.deepEqual(calls.filter(url => url.endsWith('/languages')), ['https://api.github.com/repos/alice/r0/languages']);
  assert.equal(calls.some(url => url.includes('/events')), false);
});
