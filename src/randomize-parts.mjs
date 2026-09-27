import { seededRandom } from './seeded-random.mjs';
import { visualThemes, themePalettes } from './themes.mjs';

// Partial draws retain the account, topology, filters and all unselected settings.
export function randomizeParts(current, recipe, parts, repositories = []) {
  const options = structuredClone(current);
  const copy = keys => { for (const key of keys) options[key] = structuredClone(recipe[key]); };
  if (parts.styling) {
    copy(['visualTheme', 'nodeShape', 'nodeGlowMode', 'connectionWeight', 'colorConnections', 'effect']);
    const theme = visualThemes[recipe.visualTheme];
    options.theme = 'auto'; options.colors = {}; options.nodeColors = {};
    options.nodeColorMode = recipe.nodeColorMode;
    options.visualStyle = { ...recipe.visualStyle, ...themePalettes(theme), glow: theme.glow, secondaryOpacity: theme.opacity,
      labels: current.visualStyle?.labels ?? true };
    options.starfield = { ...recipe.starfield, twinkle: current.starfield?.twinkle ?? false };
    options.css = ''; options.customCSS = '';
  }
  if (parts.animations) {
    copy(['animate', 'starlightAnimate', 'activityAnimate', 'codingRhythmAnimate', 'ringAnimation', 'floatingAnimation']);
    options.starfield = { ...options.starfield, twinkle: recipe.starfield.twinkle };
    options.perspective = { ...current.perspective, animate: recipe.perspective.animate,
      range: recipe.perspective.range, duration: recipe.perspective.duration };
    options.contributionOrbit = { ...current.contributionOrbit, animate: recipe.contributionOrbit.animate };
    if (current.history?.timeLapse?.enabled) options.history.timeLapse = {
      ...current.history.timeLapse, mode: recipe.history.timeLapse.mode, duration: recipe.history.timeLapse.duration,
    };
  }
  if (parts.repositories) {
    const ids = [...new Set(repositories.map(repo => repo.full_name))].sort();
    if (!ids.length) throw new Error('No repositories match your current filters. Adjust the filters before shuffling projects.');
    const random = seededRandom(`${recipe.designCode}:repositories`);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const limit = Math.min(ids.length, current.maxRepos || 45);
    const minimum = Math.min(5, limit);
    const count = minimum + Math.floor(random() * (limit - minimum + 1));
    options.includeRepos = ids.slice(0, count);
  }
  // A recipe code alone cannot recreate a design assembled from several draws.
  delete options.designCode;
  return options;
}
