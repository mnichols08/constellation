import { seededRandom, newSeed } from './seeded-random.mjs';
import { visualThemes } from './themes.mjs';

export const newDesignCode = () => `v1:${newSeed()}`;

// Freeze the v1 recipe: future recipes get a new prefix so shared codes never drift.
export function randomizeDesign(code) {
  if (typeof code !== 'string' || !/^v1:[a-z\d-]{1,100}$/i.test(code)) throw new Error('Design code must start with v1: followed by letters, numbers or hyphens.');
  const random = seededRandom(code);
  const pick = values => values[Math.floor(random() * values.length)];
  const visualTheme = pick(['github-dark', 'deep-space', 'terminal', 'solarized', 'dracula', 'synthwave', 'monochrome', 'contribution', 'rustacean', 'javascript']);
  const preset = visualThemes[visualTheme];
  const palette = Object.fromEntries(['background', 'foreground', 'accent', 'line', 'star'].map((key, i) => [key, preset.palette[i]]));
  return {
    designCode: code, seedMode: 'custom', seed: code, visualTheme, theme: 'auto', colors: {},
    arrangement: pick(['rings', 'orbital', 'galaxy', 'solar-system']),
    layout: pick(['atlas', 'compact']), exportProfile: 'custom',
    nodeSize: pick(['stars', 'activity', 'uniform', 'languages', 'topics']),
    nodeColorMode: pick(['custom', 'language', 'seeded', 'category']),
    nodeGlowMode: pick(['uniform', 'stars', 'activity', 'seeded']),
    connectionWeight: pick(['uniform', 'overlap', 'languages']),
    nodeShape: pick(['circle', 'circle', 'mixed', 'diamond', 'hexagon']),
    effect: pick(['none', 'none', 'grid', 'coordinates']), legend: false,
    animate: preset.animate ?? true, bridges: false,
    ringRotations: Array.from({ length: 4 }, () => Math.floor(random() * 360)),
    ringAnimation: { enabled: false }, floatingAnimation: { enabled: false }, perspective: { enabled: false },
    identityRing: true, snapToRings: true, colorConnections: false,
    nodeColors: {}, starPositions: {}, labelPositions: {}, labelOffsets: {}, hiddenNodes: [], hiddenLabels: [], selection: {},
    css: '', customCSS: '',
    visualStyle: { light: { ...palette }, dark: { ...palette }, lineWidth: .9, lineOpacity: .8, secondaryOpacity: preset.opacity, bridgeOpacity: .35, glow: preset.glow, dustOpacity: .6, labelSize: 11, labels: true },
  };
}
