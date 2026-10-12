import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceStore, experienceIdentity, storyIntentLabels } from '../src/guided-experience.mjs';

test('experience ownership is account-scoped and bound to normalized configuration', () => {
  const records = new Map(), errors = [];
  const store = experienceStore({
    getItem: key => records.get(key),
    setItem: (key, value) => records.set(key, value),
  }, text => errors.push(text));
  const options = { arrangement: 'rings', starPositions: { 'alice/a': { x: 100, y: 100 } }, customCSS: '.star{fill:red}' };
  store.save('Alice', options, { storyMode: 'story', selectedStoryId: 'projects' });
  assert.equal(store.read('alice', options).storyMode, 'story');
  assert.equal(store.read('bob', options), null);
  assert.equal(store.read('alice', { ...options, arrangement: 'field' }), null);
  assert.equal(experienceIdentity(options), experienceIdentity({ customCSS: options.customCSS, starPositions: options.starPositions, arrangement: 'rings' }));
  assert.equal(Object.keys(storyIntentLabels).length, 3);
  assert.deepEqual(errors, []);
});

test('malformed experience progress reports an error without changing configuration', () => {
  const errors = [];
  const store = experienceStore({ getItem: () => '{' }, text => errors.push(text));
  assert.equal(store.read('alice', {}), null);
  assert.equal(errors.length, 1);
});
