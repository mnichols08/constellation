import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceTilt } from '../src/live-tilt.mjs';

test('device tilt uses a neutral baseline, bounds motion and maps landscape orientation', () => {
  const baseline = { beta: 45, gamma: 10 };
  assert.ok(Math.abs(deviceTilt(45, 10, baseline).x) === 0);
  assert.equal(deviceTilt(45, 20, baseline).y, 4);
  assert.equal(deviceTilt(55, 10, baseline).x, -4);
  assert.ok(Math.abs(deviceTilt(45, 20, baseline, 90).x - 4) < .001);
  const extreme = deviceTilt(170, 85, baseline);
  assert.ok(Math.abs(extreme.x) <= 12 && Math.abs(extreme.y) <= 12);
  assert.ok(Math.abs(deviceTilt(-179, 0, { beta: 179, gamma: 0 }).x + .8) < .001);
  assert.equal(deviceTilt(null, 0, baseline), null);
  assert.equal(deviceTilt(0, NaN, baseline), null);
});
