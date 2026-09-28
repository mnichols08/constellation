import test from 'node:test';
import assert from 'node:assert/strict';
import { cometTestSnapshot } from '../src/history/comet-lab.mjs';
import { contributionComet } from '../src/history/contribution-comet.mjs';

test('lab edits and ends streaks through the real contribution model', () => {
  for (const date of ['2026-09-27T12:00:00Z', '2027-01-01T00:00:00Z']) {
    const reference = Date.parse(date);
    for (const days of [1, 7, 42, 300]) {
      for (const ended of [false, true]) {
        const result = contributionComet(cometTestSnapshot(days, ended, reference), reference);
        assert.equal(result.days, days);
        assert.equal(result.state, ended ? 'burst' : 'active');
        assert.equal(result.events, days);
      }
    }
  }
});

test('lab rejects empty, fractional and unbounded streak lengths', () => {
  for (const days of [0, -1, 1.5, NaN, Infinity, 301, '7', undefined]) {
    assert.throws(() => cometTestSnapshot(days, false, Date.now()), /between 1 and 300/);
  }
});
