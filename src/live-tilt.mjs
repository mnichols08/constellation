const clamp = value => Math.max(-12, Math.min(12, value));
const difference = (value, start) => ((value - start + 540) % 360) - 180;

export function deviceTilt(beta, gamma, baseline, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const dx = difference(gamma, baseline.gamma), dy = difference(beta, baseline.beta);
  const angle = screenAngle * Math.PI / 180;
  return { x: clamp(-(dy * Math.cos(angle) - dx * Math.sin(angle)) * .4), y: clamp((dx * Math.cos(angle) + dy * Math.sin(angle)) * .4) };
}

export function mountLiveTilt({ surface, target, mode, enable, recenter, status, onChange }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 'off', baseline, frame, pending, revision = 0;
  const active = () => selected !== 'off' && !reduced.matches;
  const reset = () => {
    cancelAnimationFrame(frame); frame = null; pending = null;
    target.style.setProperty('--live-tilt-x', '0deg'); target.style.setProperty('--live-tilt-y', '0deg');
  };
  const apply = value => {
    if (!active() || !value) return;
    pending = value;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (!active()) return;
      target.style.setProperty('--live-tilt-x', `${pending.x.toFixed(2)}deg`);
      target.style.setProperty('--live-tilt-y', `${pending.y.toFixed(2)}deg`);
    });
  };
  const refresh = () => {
    target.classList.toggle('live-tilt-active', active());
    recenter.disabled = selected !== 'device' || reduced.matches;
    status.textContent = reduced.matches && selected !== 'off' ? 'Live tilt is paused by your reduced-motion preference.' : selected === 'device' ? 'Hold your device comfortably. The first reading becomes the neutral position.' : selected === 'pointer' ? 'Move your pointer over the constellation. Turn live tilt off to edit positions.' : 'Live tilt is off. It affects this preview only.';
    onChange();
  };
  const orientation = event => {
    if (selected !== 'device' || !active() || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    baseline ||= { beta: event.beta, gamma: event.gamma };
    apply(deviceTilt(event.beta, event.gamma, baseline, screen.orientation?.angle ?? window.orientation ?? 0));
    status.textContent = 'Following device tilt. Recenter to use your current position as neutral.';
  };
  const detach = () => window.removeEventListener('deviceorientation', orientation);
  const change = () => {
    revision++; detach(); reset(); baseline = null;
    selected = mode.value === 'pointer' ? 'pointer' : 'off';
    // Device access is requested only from the explicit button gesture.
    if (mode.value === 'device') { refresh(); status.textContent = 'Click Enable device tilt to connect the motion sensor.'; }
    else refresh();
  };
  const request = async () => {
    const current = ++revision;
    detach(); reset(); selected = 'off'; baseline = null;
    try {
      if (!window.isSecureContext || !window.DeviceOrientationEvent) throw new Error('Device tilt is unavailable here. Use pointer mode, or a supported device over HTTPS or localhost.');
      if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('Motion access was not granted. Pointer mode is still available.');
      if (current !== revision) return;
      selected = 'device'; mode.value = 'device'; window.addEventListener('deviceorientation', orientation, { passive: true }); refresh();
    } catch (error) {
      if (current !== revision) return;
      mode.value = 'off'; refresh(); status.textContent = error.message || 'Device tilt could not start. Pointer mode is still available.';
    }
  };
  const pointer = event => {
    if (selected !== 'pointer' || event.pointerType === 'touch') return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    apply({ x: clamp((.5 - (event.clientY - rect.top) / rect.height) * 16), y: clamp(((event.clientX - rect.left) / rect.width - .5) * 16) });
  };
  const neutral = () => { baseline = null; reset(); };
  mode.addEventListener('change', change);
  enable.addEventListener('click', request);
  recenter.addEventListener('click', neutral);
  surface.addEventListener('pointermove', pointer, { passive: true });
  surface.addEventListener('pointerleave', () => { if (selected === 'pointer') reset(); });
  window.addEventListener('orientationchange', neutral);
  reduced.addEventListener('change', () => { neutral(); refresh(); });
  window.addEventListener('pagehide', () => { revision++; detach(); reset(); });
  return { get active() { return active(); } };
}
