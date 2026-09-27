import { renderConstellation, username } from './constellation.mjs';
import { visualCSS } from './visual-style.mjs';
import { sizingModes } from './node-sizing.mjs';

export const CONFIG_VERSION = 1;
export const MAX_CONFIG_BYTES = 250000;
const fields = new Set('theme layout maxRepos animate includeForks bridges connectionDensity connectionBasis languages topics showOther css repoSource arrangement ringAnimation perspective floatingAnimation ringRotation ringRotations identityRing snapToRings nodeMode hiddenNodes hiddenLabels colorConnections nodeColors labelOffsets labelPositions starPositions selection colors title includeRepos minStars includeArchived updatedWithin repoQuery sortBy sizingMode exportProfile visualStyle customCSS seedMode seed nodeSize nodeColorMode nodeGlowMode connectionWeight nodeShape effect legend visualTheme metricDate majorMetric designCode starfield'.split(' '));
const nested = {
  ringAnimation: 'enabled linked speeds directions modes easing amplitudes',
  perspective: 'enabled animate horizontal vertical zoom range duration',
  floatingAnimation: 'enabled mode amplitude duration', selection: 'start end',
  starfield: 'mode density brightness depth twinkle seed',
};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function inspect(value, depth = 0) {
  if (depth > 8) throw new Error('Configuration is too deeply nested.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Configuration contains a non-finite number.');
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe configuration key.');
    inspect(child, depth + 1);
  }
}

export function normalizeConfig(input) {
  if (!object(input)) throw new Error('Configuration must be a JSON object.');
  inspect(input);
  if (JSON.stringify(input).length > MAX_CONFIG_BYTES) throw new Error('Configuration is too large.');
  const options = Object.fromEntries(Object.entries(input).filter(([key]) => fields.has(key)));
  for (const key of ['animate', 'includeForks', 'bridges', 'showOther', 'snapToRings', 'identityRing', 'colorConnections']) {
    if (key in options && typeof options[key] !== 'boolean') throw new Error(`${key} must be boolean.`);
  }
  for (const key of ['css', 'customCSS']) {
    if (key in options && typeof options[key] !== 'string') throw new Error(`${key} must be text.`);
    // Keep CSS self-contained. XML text escaping remains the renderer's responsibility.
    if (options[key] && /(?:@import|url\s*\(|expression\s*\(|\\)/i.test(options[key].replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Imported CSS must be self-contained, without URLs, imports, escapes or expressions.');
  }
  for (const [key, names] of Object.entries(nested)) if (key in options) {
    if (!object(options[key])) throw new Error(`${key} must be an object.`);
    if (Object.keys(options[key]).some(name => !names.split(' ').includes(name))) throw new Error(`Unknown ${key} field.`);
  }
  if (options.selection && Object.values(options.selection).some(value => value !== null && typeof value !== 'string')) throw new Error('Selection must contain node IDs.');
  for (const key of ['nodeColors', 'colors', 'starPositions', 'labelPositions', 'labelOffsets', 'visualStyle']) if (key in options && !object(options[key])) throw new Error(`${key} must be an object.`);
  for (const key of ['starPositions', 'labelPositions', 'labelOffsets']) if (options[key]) {
    if (Object.values(options[key]).some(point => !object(point) || Object.keys(point).some(key => !['x', 'y'].includes(key)) || Math.abs(point.x) > 10000 || Math.abs(point.y) > 10000)) throw new Error('Invalid manual coordinates.');
  }
  if (options.sizingMode !== undefined && !sizingModes.includes(options.sizingMode)) throw new Error('Invalid sizing mode.');
  if (options.designCode !== undefined && (typeof options.designCode !== 'string' || !/^v[12]:[a-z\d-]{1,100}$/i.test(options.designCode))) throw new Error('Invalid design code.');
  if (options.nodeSize !== undefined && !sizingModes.includes(options.nodeSize)) throw new Error('Invalid node size mode.');
  if (options.majorMetric !== undefined && !['stars', 'updated'].includes(options.majorMetric)) throw new Error('Invalid major repository metric.');
  if (options.visualStyle) {
    const allowed = 'light dark lineWidth lineOpacity secondaryOpacity bridgeOpacity glow dustOpacity labelSize labels'.split(' ');
    if (Object.keys(options.visualStyle).some(key => !allowed.includes(key)) || typeof options.visualStyle.labels !== 'boolean') throw new Error('Invalid visual style fields.');
    visualCSS(options.visualStyle);
  }
  // Reuse the rendering validators, including legacy fields and motion settings.
  renderConstellation('validation', [], options);
  return JSON.parse(JSON.stringify(options));
}

export function parseConfig(value, fallbackAccount = 'your-universe') {
  if (typeof value === 'string' && value.length > MAX_CONFIG_BYTES) throw new Error('Configuration is too large.');
  const input = typeof value === 'string' ? JSON.parse(value) : value;
  if (!object(input)) throw new Error('Configuration must be a JSON object.');
  inspect(input);
  if ('version' in input && input.version !== CONFIG_VERSION) throw new Error('Unsupported configuration version.');
  return { version: CONFIG_VERSION, account: username(input.account || fallbackAccount), options: normalizeConfig('options' in input && 'version' in input ? input.options : input) };
}

export const serializeConfig = (account, options) => {
  const value = parseConfig({ version: CONFIG_VERSION, account, options });
  return JSON.stringify({ version: value.version, account: value.account, ...value.options }, null, 2);
};
