// One mapping between render options and the existing studio controls.
const fields = {
  layout: 'layout', maxRepos: 'max-repos', animate: 'animate', includeForks: 'forks', bridges: 'bridges', connectionDensity: 'connection-density', connectionBasis: 'connection-basis', showOther: 'show-other', repoSource: 'repo-source', arrangement: 'arrangement', identityRing: 'identity-ring', snapToRings: 'snap-rings', nodeMode: 'node-mode', colorConnections: 'color-connections',
};
export function createFormRestorer(document) {
  // Imported configurations may legitimately select fewer than five repositories.
  document.getElementById('max-repos').step = '1';
  // Relax the step first so changing the minimum cannot snap 45 to 46.
  document.getElementById('max-repos').min = '1';
  const defaults = new Map([...document.querySelectorAll('input[id],select[id],textarea[id]')].map(input => [input.id, input.type === 'checkbox' ? input.checked : input.value]));
  const set = (id, value) => { const input = document.getElementById(id); if (!input) return; const next = value ?? defaults.get(id); if (input.type === 'checkbox') input.checked = next; else input.value = next; };
  return options => {
    document.getElementById('max-repos').max = String(options.nodeCap || 100);
    for (const [key, id] of Object.entries(fields)) set(id, options[key]);
    if (options.temporalStack?.enabled) set('arrangement', 'temporal-stack');
    for (const key of ['yearStart', 'yearEnd', 'yearStep', 'depthGap', 'tilt', 'connections']) set(`temporal-${key}`, options.temporalStack?.[key]);
    set('temporal-innerArrangement', options.temporalStack?.innerArrangement);
    set('temporal-form', options.temporalGeometry?.shape);
    for (const key of ['radius', 'depth', 'startRadius', 'endRadius', 'waist', 'twist', 'surface']) set(`temporal-${key}`, options.temporalGeometry?.[key]);
    set('temporal-orientation', options.temporalGeometry?.orientation?.y);
    const rotation = options.ringRotations || Array(4).fill(options.ringRotation || 0);
    for (let i = 0; i < 4; i++) {
      set(`ring-rotation-${i}`, rotation[i]);
      for (const [key, id] of [['speeds', 'speed'], ['directions', 'direction'], ['modes', 'motion'], ['easing', 'easing'], ['amplitudes', 'sway']]) set(`ring-${id}-${i}`, options.ringAnimation?.[key]?.[i]);
    }
    set('animate-rings', options.ringAnimation?.enabled); set('link-ring-motion', options.ringAnimation?.linked);
    for (const key of ['enabled', 'animate', 'horizontal', 'vertical', 'zoom', 'range', 'duration']) set(`perspective-${key}`, options.perspective?.[key]);
    for (const [key, id] of [['enabled', 'animate-floating'], ['mode', 'floating-motion'], ['amplitude', 'floating-amount'], ['duration', 'floating-duration']]) set(id, options.floatingAnimation?.[key]);
  };
}
