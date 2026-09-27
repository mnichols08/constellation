import { parseConfig, serializeConfig } from './config-schema.mjs';
import { createConfigStore } from './config-store.mjs';
import { encodeShare, decodeShare } from './share-link.mjs';
import { downloadBlob, svgToPNG } from './export-image.mjs';
import { newSeed } from './seeded-random.mjs';
import { visualThemes } from './themes.mjs';
import { newDesignCode, randomizeDesign } from './design-randomizer.mjs';
import { defaultStarfield, starfieldOptions } from './starfield.mjs';

export const designDefaults = { seedMode: 'account', seed: '', nodeSize: 'legacy', nodeColorMode: 'custom', nodeGlowMode: 'uniform', connectionWeight: 'uniform', majorMetric: 'stars', nodeShape: 'circle', effect: 'none', legend: false, minStars: 0, includeArchived: true, updatedWithin: 0, repoQuery: '', sortBy: 'stars', exportProfile: 'custom', activityEffect: 'off', activityWindow: '7d', activityDetail: 'simple', activityConnections: false };

export function mountStudioDesign({ host, changed, apply, theme, message }) {
  let storage; try { storage = window.localStorage; } catch {}
  const store = createConfigStore(storage);
  let current, svg = '', saveTimer, pending;
  const controls = new Map();
  let syncSky = () => {};
  const section = title => {
    const details = document.createElement('details'); details.className = 'control-section';
    const summary = document.createElement('summary'); summary.textContent = title;
    const body = document.createElement('div'); body.className = 'control-section-body'; details.append(summary, body); host.append(details); return body;
  };
  const button = (parent, id, label, callback) => {
    const element = document.createElement('button'); element.type = 'button'; element.id = id; element.textContent = label; element.className = 'secondary';
    element.addEventListener('click', async () => { try { await callback(); } catch (error) { message(error.message, true); } }); parent.append(element); return element;
  };
  const control = (parent, key, labelText, values, type = 'text') => {
    const label = document.createElement('label'); label.htmlFor = `design-${key}`; label.textContent = labelText;
    const input = document.createElement(values ? 'select' : 'input'); input.id = label.htmlFor;
    if (values) for (const [value, text] of values.map(value => Array.isArray(value) ? value : [value, value])) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
    } else { input.type = type; if (type === 'number') { input.min = '0'; input.max = '1000000000'; } }
    input.addEventListener('input', () => {
      if (key === 'seedMode' && input.value === 'random') controls.get('seed').value = newSeed();
      if (key === 'seedMode' && input.value === 'custom' && !controls.get('seed').value) controls.get('seed').value = current?.account || 'constellation';
      syncSky();
      changed();
    });
    parent.append(label, input); controls.set(key, input); return input;
  };
  const design = section('Themes & visual mappings');
  const themeSelect = control(design, 'visualTheme', 'Start with a theme', [['custom', 'Custom'], ...Object.entries(visualThemes).filter(([id]) => id !== 'sudo').map(([id, value]) => [id, value.label])]);
  themeSelect.addEventListener('change', () => { if (themeSelect.value !== 'custom') theme(themeSelect.value); });
  control(design, 'nodeSize', 'Size nodes by', [['legacy', 'Classic (existing sizing)'], ['uniform', 'Uniform'], ['stars', 'GitHub stars'], ['activity', 'Recent activity'], ['age', 'Repository age'], ['languages', 'Number of languages'], ['topics', 'Number of topics'], ['membership', 'Category membership']]);
  control(design, 'nodeColorMode', 'Color nodes by', [['custom', 'Custom colors'], ['language', 'Language'], ['seeded', 'Seeded palette'], ['category', 'Category'], ['contribution', 'Contribution-style activity']]);
  control(design, 'nodeGlowMode', 'Glow intensity', ['uniform', 'stars', 'activity', 'seeded']);
  control(design, 'connectionWeight', 'Connection weight', ['uniform', 'languages', 'topics', 'overlap']);
  control(design, 'majorMetric', 'Solar System major repositories', [['stars', 'Most stars'], ['updated', 'Recently updated']]);
  const seedPanel = section('Reproducibility & optional effects');
  const hero = document.createElement('div'); hero.className = 'design-launcher'; hero.setAttribute('aria-label', 'Discover a constellation design');
  document.querySelector('.studio-header').after(hero);
  const heroTitle = document.createElement('div'); heroTitle.className = 'design-launcher-title'; heroTitle.textContent = 'Find your next universe';
  const heroNote = document.createElement('p'); heroNote.textContent = 'One click. A new sky. Keep the code to come back.'; heroTitle.append(heroNote); hero.append(heroTitle);
  const designCode = document.createElement('input'); designCode.id = 'design-code'; designCode.placeholder = 'v3:… (older codes also work)'; designCode.maxLength = 103;
  const codeLabel = document.createElement('label'); codeLabel.htmlFor = designCode.id; codeLabel.textContent = 'Reproducible design code';
  const codeControls = document.createElement('div'); codeControls.className = 'design-code-controls'; codeControls.append(codeLabel, designCode);
  const reseed = async code => { const recipe = randomizeDesign(code); const options = { ...current.options, ...recipe, starfield: recipe.starfield || { mode: 'classic' } }; await apply({ version: 1, account: current.account, options }); designCode.value = code; message(`Design ${code} restored. Save the config to preserve subsequent edits too.`); };
  const motionLabel = document.createElement('label'); motionLabel.className = 'randomize-motion';
  const motion = document.createElement('input'); motion.id = 'randomize-motion'; motion.type = 'checkbox'; motion.checked = !matchMedia('(prefers-reduced-motion: reduce)').matches; motionLabel.append(motion, ' Include motion');
  const randomize = button(hero, 'randomize-design', '✦ Randomize design', () => reseed(newDesignCode({ motion: motion.checked }))); randomize.className = 'randomize-primary';
  hero.append(motionLabel);
  hero.append(codeControls);
  button(codeControls, 'reseed-design', 'Restore code', () => reseed(designCode.value.trim()));
  control(seedPanel, 'seedMode', 'Seed mode', ['account', 'custom', 'random']);
  control(seedPanel, 'seed', 'Saved seed').maxLength = 120;
  button(seedPanel, 'reroll-seed', 'New random seed', () => { controls.get('seedMode').value = 'random'; controls.get('seed').value = newSeed(); changed(); });
  control(seedPanel, 'nodeShape', 'Node shape', ['circle', 'star', 'diamond', 'hexagon', 'square', 'mixed']);
  control(seedPanel, 'effect', 'Optional effect', ['none', 'grid', 'scanlines', 'coordinates']);
  control(seedPanel, 'legend', 'Show compact mapping legend', null, 'checkbox');
  const skyPanel = section('Background starfield');
  control(skyPanel, 'sky-mode', 'Sky', [['off', 'Off'], ['classic', 'Classic dust'], ['space', 'Deep space'], ['milky-way', 'Milky Way band']]);
  const skyDetails = document.createElement('div'); skyPanel.append(skyDetails);
  for (const [key, label, max, step] of [['density', 'Star density', 100, 1], ['brightness', 'Brightness', 1, .05], ['depth', 'Depth / size variation', 1, .05]]) {
    const input = control(skyDetails, `sky-${key}`, label, null, 'range'); input.min = '0'; input.max = max; input.step = step;
  }
  control(skyDetails, 'sky-twinkle', 'Subtle twinkle', null, 'checkbox');
  const skySeed = control(skyDetails, 'sky-seed', 'Background seed (blank follows design)'); skySeed.maxLength = 120;
  button(skyDetails, 'regenerate-starfield', 'Generate another starfield', () => { skySeed.value = newSeed(); changed(); });
  const skyNote = document.createElement('p'); skyNote.className = 'export-note'; skyNote.textContent = 'Decorative stars stay behind your projects. Try a dark theme for a space backdrop. Twinkle follows Starlight animation and reduced-motion preferences. The seed is saved in config and share links.'; skyDetails.append(skyNote);
  syncSky = () => { skyDetails.hidden = !['space', 'milky-way'].includes(controls.get('sky-mode').value); };
  const activityPanel = section('Recent activity');
  control(activityPanel, 'activityEffect', 'Recent activity', [['off', 'Off'], ['glow', 'Glow'], ['pulse', 'Pulse'], ['comet', 'Comet trails'], ['ripple', 'Ripple']]);
  control(activityPanel, 'activityWindow', 'Activity window', [['1d', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['auto', 'Auto']]);
  control(activityPanel, 'activityDetail', 'Event detail', [['simple', 'Simple'], ['event-types', 'Event types']]);
  control(activityPanel, 'activityConnections', 'Brighten active connections', null, 'checkbox');
  const activityStatus = document.createElement('p'); activityStatus.id = 'activity-status'; activityStatus.className = 'export-note'; activityStatus.setAttribute('role', 'status'); activityPanel.append(activityStatus);
  const filters = section('Repository filters');
  control(filters, 'minStars', 'Minimum GitHub stars', null, 'number');
  control(filters, 'includeArchived', 'Include archived repositories', null, 'checkbox');
  control(filters, 'updatedWithin', 'Updated within', [['0', 'Any time'], ['1', 'Past year'], ['2', 'Past 2 years'], ['5', 'Past 5 years']]);
  control(filters, 'repoQuery', 'Repository name contains').maxLength = 200;
  control(filters, 'sortBy', 'Select projects by', [['stars', 'Stars'], ['updated', 'Recently updated'], ['name', 'Repository name']]);
  const exports = section('Config, presets & export');
  control(exports, 'exportProfile', 'Output profile', [['custom', 'Current layout'], ['profile', 'Profile README'], ['repository', 'Repository README'], ['compact', 'Compact'], ['hero', 'Hero'], ['transparent', 'Transparent']]);
  const size = document.createElement('p'); size.id = 'svg-size'; size.className = 'export-note'; exports.append(size);
  const json = document.createElement('textarea'); json.id = 'config-json'; json.rows = 6; json.setAttribute('aria-label', 'Configuration JSON to copy or import'); exports.append(json);
  const serialized = () => { if (!current) throw new Error('Load a design first.'); return serializeConfig(current.account, current.options); };
  button(exports, 'download-config', 'Download config JSON', () => downloadBlob(new Blob([serialized()], { type: 'application/json' }), `constellation-${current.account}.json`));
  button(exports, 'copy-config', 'Copy config JSON', async () => { json.value = serialized(); try { await navigator.clipboard.writeText(json.value); message('Config copied.'); } catch { json.focus(); json.select(); message('Select and copy the configuration below.'); } });
  button(exports, 'import-config', 'Import config JSON', async () => { const config = parseConfig(json.value, current.account); await apply(config); message('Configuration imported.'); });
  const fileLabel = document.createElement('label'); fileLabel.textContent = 'Or choose a config file';
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.id = 'config-file';
  file.addEventListener('change', async () => { try { const selected = file.files[0]; if (!selected) return; if (selected.size > 250000) throw new Error('Configuration is too large.'); const text = await selected.text(); const config = parseConfig(text, current.account); await apply(config); json.value = text; message('Configuration imported.'); } catch (error) { message(error.message, true); } finally { file.value = ''; } });
  fileLabel.append(file); exports.append(fileLabel);
  button(exports, 'copy-share', 'Copy share link', async () => { const link = encodeShare(location.href, current.account, current.options); try { await navigator.clipboard.writeText(link); message('Share link copied. Manual coordinates and CSS remain JSON-only.'); } catch { json.value = link; json.focus(); json.select(); message('Select and copy the share link below.'); } });
  button(exports, 'download-png', 'Download PNG (2× or higher)', async () => { downloadBlob(await svgToPNG(svg), 'constellation.png'); message('PNG downloaded.'); });
  const presetName = document.createElement('input'); presetName.id = 'preset-name'; presetName.placeholder = 'README'; presetName.maxLength = 80; presetName.setAttribute('aria-label', 'Preset name'); exports.append(presetName);
  const presets = document.createElement('select'); presets.id = 'saved-presets'; presets.setAttribute('aria-label', 'Saved presets'); exports.append(presets);
  const refreshPresets = () => {
    const selected = presets.value; presets.replaceChildren(...store.presets(current.account).map(preset => { const option = document.createElement('option'); option.value = preset.name; option.textContent = preset.name; return option; }));
    if ([...presets.options].some(option => option.value === selected)) presets.value = selected;
  };
  const stored = result => { if (!result) throw new Error('Local storage is unavailable or full. Download config JSON to keep this design.'); refreshPresets(); };
  button(exports, 'save-preset', 'Save preset', () => { stored(store.savePreset(current.account, presetName.value, current.options)); presets.value = presetName.value.trim(); message('Preset saved locally.'); });
  button(exports, 'load-preset', 'Load preset', async () => { const preset = store.presets(current.account).find(p => p.name === presets.value); if (!preset) throw new Error('Select a saved preset.'); await apply(parseConfig(preset.config)); message('Preset loaded.'); });
  button(exports, 'rename-preset', 'Rename preset', () => { if (!presets.value) throw new Error('Select a saved preset.'); stored(store.rename(current.account, presets.value, presetName.value)); message('Preset renamed.'); });
  button(exports, 'delete-preset', 'Delete preset', () => { stored(store.delete(current.account, presets.value)); message('Preset deleted.'); });
  button(exports, 'restore-draft', 'Restore last draft', async () => { const draft = store.draft(current.account); if (!draft) throw new Error('No saved draft for this account.'); await apply(draft); });
  button(exports, 'reset-draft', 'Reset current draft', async () => { clearTimeout(saveTimer); store.reset(current.account); await apply({ version: 1, account: current.account, options: {} }); message('Draft reset to defaults.'); });
  const flush = () => {
    clearTimeout(saveTimer);
    if (pending) { const value = pending; pending = null; try { if (!store.saveDraft(value.account, value.options)) message('Local draft could not be saved. Download config JSON to keep it.', true); } catch (error) { message(error.message, true); } }
  };
  window.addEventListener('pagehide', flush);
  function restore(options) {
    designCode.value = options.designCode || '';
    if (options.designCode?.startsWith('v3:')) motion.checked = !options.designCode.startsWith('v3:still-');
    const sky = starfieldOptions(options.starfield);
    for (const [key, input] of controls) {
      const value = key.startsWith('sky-') ? sky[key.slice(4)] : options[key] ?? (key === 'nodeSize' ? options.sizingMode : undefined) ?? designDefaults[key] ?? 'custom';
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
    }
    syncSky();
  }
  restore({ starfield: defaultStarfield });
  return {
    store, restore, flush,
    read: () => {
      const entries = [...controls].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.type === 'range' || ['minStars', 'updatedWithin'].includes(key) ? Number(input.value) : input.value]);
      return { ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('sky-'))), starfield: Object.fromEntries(entries.filter(([key]) => key.startsWith('sky-')).map(([key, value]) => [key.slice(4), value])) };
    },
    update(account, options, source) { if (pending && pending.account !== account) flush(); current = { account, options }; svg = source; pending = structuredClone(current); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); refreshPresets(); size.textContent = `SVG: ${(new Blob([source]).size / 1024).toFixed(1)} KiB. No scripts or external assets.`; },
    shared() { try { return decodeShare(location.href); } catch (error) { message(error.message, true); return null; } },
  };
}
