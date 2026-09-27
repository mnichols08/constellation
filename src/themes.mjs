// Themes only supply visual defaults. Explicit configuration always wins.
export const visualThemes = {
  mnix: { label: 'Mnix (charcoal & yellow)', palette: ['#111111', '#f3f3f4', '#e3de13', '#555a38', '#e3de13'], glow: 2, opacity: .13, nodeColorMode: 'custom' },
  'github-dark': { label: 'GitHub Dark', palette: ['#0d1117', '#c9d1d9', '#58a6ff', '#30363d', '#79c0ff'], glow: 1, opacity: .28 },
  'deep-space': { label: 'Deep Space', palette: ['#080c24', '#dce6ff', '#a78bfa', '#53619c', '#93c5fd'], glow: 3, opacity: .24 },
  terminal: { label: 'Terminal Green', palette: ['#071409', '#a8f0a0', '#39d353', '#245c32', '#56f584'], glow: 1.5, opacity: .2, nodeShape: 'square', animate: false },
  solarized: { label: 'Solarized', palette: ['#002b36', '#93a1a1', '#b58900', '#586e75', '#2aa198'], glow: 0, opacity: .3, animate: false },
  dracula: { label: 'Dracula', palette: ['#282a36', '#f8f8f2', '#ff79c6', '#6272a4', '#bd93f9'], glow: 2, opacity: .27 },
  synthwave: { label: 'Synthwave', palette: ['#170d30', '#f9d5ff', '#ff4fd8', '#62359e', '#51e5ff'], glow: 3, opacity: .26, nodeShape: 'diamond' },
  monochrome: { label: 'Monochrome', palette: ['#111111', '#eeeeee', '#cccccc', '#777777', '#ffffff'], glow: 0, opacity: .25, animate: false },
  contribution: { label: 'Contribution Graph', palette: ['#0d1117', '#c9d1d9', '#39d353', '#21452c', '#26a641'], glow: 0, opacity: .16, nodeColorMode: 'contribution', nodeShape: 'square', animate: false },
  rustacean: { label: 'Rustacean', palette: ['#221712', '#f3dccb', '#f29964', '#92674e', '#dea584'], glow: 1, opacity: .24, nodeShape: 'hexagon' },
  javascript: { label: 'JavaScript Yellow', palette: ['#191909', '#fffbd6', '#f1e05a', '#777340', '#f7df1e'], glow: 1, opacity: .2 },
  sudo: { label: 'sudo', palette: ['#061109', '#b8ffbe', '#39ff72', '#28633c', '#66ff99'], glow: 2, opacity: .18, nodeShape: 'square', effect: 'scanlines', animate: false },
};

export function resolveTheme(options = {}) {
  const id = options.visualTheme || (visualThemes[options.theme] ? options.theme : null);
  if (!id || id === 'custom') return options;
  const preset = visualThemes[id];
  if (!preset) throw new Error('Unknown visual theme.');
  const { label, palette, glow, opacity, ...defaults } = preset;
  const colors = Object.fromEntries(['background', 'foreground', 'accent', 'line', 'star'].map((key, i) => [key, palette[i]]));
  return { ...defaults, ...options, theme: visualThemes[options.theme] ? 'midnight' : options.theme || 'midnight',
    colors: { ...colors, ...options.colors },
    css: `svg{background:var(--sky-background)}.star{filter:drop-shadow(0 0 ${glow}px var(--node-color,var(--sky-star)))}.shared-language[data-emphasis="secondary"]{opacity:${opacity}}\n${options.css || ''}` };
}
