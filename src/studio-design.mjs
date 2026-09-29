import { mountRepositoryPicker } from './repository-picker.mjs';
import { mountStudioLayers } from './studio-layers.mjs';
import { layoutRefinementOptions } from './layout-refinement.mjs';
import { rhythmDefaults } from './coding-rhythm.mjs';
import { studioPresets, presetOptions } from './studio-presets.mjs';
import { mountOrganizationControls } from './organization/studio.mjs';
import { mountStudioHistory } from './history/studio-history.mjs';
import { mountRandomizeMotion } from './studio-randomize-motion.mjs';
import { randomizeParts } from './randomize-parts.mjs';
import { parseConfig, serializeConfig } from './config-schema.mjs';
import { createConfigStore } from './config-store.mjs';
import { encodeShare, decodeShare, publicShareBase } from './share-link.mjs';
import { downloadBlob, svgToPNG } from './export-image.mjs';
import { newSeed } from './seeded-random.mjs';
import { visualThemes } from './themes.mjs';
import { newDesignCode, randomizeDesign, randomizeMatchingDesign } from './design-randomizer.mjs';
import { defaultStarfield, starfieldOptions } from './starfield.mjs';

export const designDefaults = { ...rhythmDefaults, starlightAnimate: true, activityAnimate: true, seedMode: 'account', seed: '', nodeSize: 'legacy', nodeColorMode: 'custom', nodeGlowMode: 'uniform', connectionWeight: 'uniform', majorMetric: 'stars', nodeShape: 'circle', effect: 'none', legend: false, minStars: 0, includeArchived: true, updatedWithin: 0, repoQuery: '', sortBy: 'stars', exportProfile: 'custom', activityEffect: 'off', activityWindow: '7d', activityDetail: 'simple', activityConnections: false };

export function mountStudioDesign({ host, changed, apply, theme, message, hasMatchingNodes, repositoryCandidates, repositoryPool, selectedRepositories, findRepositories, reveal }) {
  const layerControls = mountStudioLayers(host, changed, reveal);
  const historyControls = mountStudioHistory(host, changed);
  const organizationControls = mountOrganizationControls(host, changed);
  let storage; try { storage = window.localStorage; } catch {}
  const store = createConfigStore(storage);
  let current, svg = '', saveTimer, pending, presetAudience;
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
  const refinementPanel = section('Refine layout');
  const refinementEnabled = control(refinementPanel, 'refinement-enabled', 'Refine layout', null, 'checkbox');
  const refinementIntensity = control(refinementPanel, 'refinement-intensity', 'Intensity', null, 'range');
  refinementIntensity.min = '0'; refinementIntensity.max = '10'; refinementIntensity.step = '1';
  const refinementValue = document.createElement('output'); refinementValue.htmlFor = refinementIntensity.id; refinementPanel.append(refinementValue);
  const refinementNote = document.createElement('p'); refinementNote.className = 'export-note';
  refinementNote.textContent = 'A static overlap-reduction pass. Manual and hidden node/label pairs stay fixed. Ring snapping constrains moves to available points or swaps; turn snapping off for free nudges. Higher intensity allows more movement. Collisions can remain in crowded layouts.'; refinementPanel.append(refinementNote);
  const syncRefinement = () => { refinementIntensity.disabled = !refinementEnabled.checked; refinementValue.value = refinementIntensity.value; };
  refinementEnabled.addEventListener('input', syncRefinement); refinementIntensity.addEventListener('input', syncRefinement);
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
  const presetMenu = document.createElement('details'); presetMenu.className = 'builtin-preset-menu';
  const presetSummary = document.createElement('summary'); presetSummary.textContent = 'Choose a preset'; presetMenu.append(presetSummary);
  const presetBody = document.createElement('div'); presetBody.className = 'builtin-preset-body'; presetMenu.append(presetBody); hero.append(presetMenu);
  const presetLabel = document.createElement('label'); presetLabel.htmlFor = 'builtin-preset'; presetLabel.textContent = 'Start with a useful view';
  const presetSelect = document.createElement('select'); presetSelect.id = 'builtin-preset';
  for (const preset of studioPresets) { const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; presetSelect.append(option); }
  const presetDescription = document.createElement('p'); presetDescription.id = 'builtin-preset-description'; presetSelect.setAttribute('aria-describedby', presetDescription.id);
  const describePreset = () => { presetDescription.textContent = studioPresets.find(value => value.id === presetSelect.value)?.description || ''; };
  presetSelect.addEventListener('change', describePreset); describePreset();
  presetBody.append(presetLabel, presetSelect, presetDescription);
  const presetApply = button(presetBody, 'apply-builtin-preset', 'Apply preset', async () => {
    if (!current) return;
    const preset = studioPresets.find(value => value.id === presetSelect.value);
    if (preset.audience === 'organization' && current.options.accountData?.type !== 'Organization' && current.options.accountType !== 'organization') throw new Error('Load an organization first, then choose an organization preset.');
    presetApply.disabled = true;
    try {
      const applied = await apply({ version: 1, account: current.account, options: presetOptions(preset.id, current.options) }, { loadOrganization: preset.audience === 'organization', loadPresetData: true, requireVisibleNodes: true, fallback: current });
      if (!applied) { message(`${preset.label} has no visible projects for this account. Your previous design is restored.`, true); return; }
      presetMenu.open = false; message(`${preset.label} applied. Customize it or save it as your own preset.`);
    } finally { presetApply.disabled = false; }
  });
  presetMenu.addEventListener('keydown', event => { if (event.key === 'Escape') { presetMenu.open = false; presetSummary.focus(); } });
  document.addEventListener('click', event => { if (!presetMenu.contains(event.target)) presetMenu.open = false; });
  const designCode = document.createElement('input'); designCode.id = 'design-code'; designCode.placeholder = 'v6:… (older codes also work)'; designCode.maxLength = 106;
  const codeLabel = document.createElement('label'); codeLabel.htmlFor = designCode.id; codeLabel.textContent = 'Reproducible design code';
  const codeControls = document.createElement('div'); codeControls.className = 'design-code-controls'; codeControls.append(codeLabel, designCode);
  const recipeOptions = recipe => ({ ...recipe, organizationUser: current.options.organizationUser, accountType: current.options.accountType, organizationScope: current.options.organizationScope, organizationView: current.options.organizationView, organization: current.options.organization, repoSource: current.options.repoSource || 'all', codingRhythmTimezone: current.options.codingRhythmTimezone || 'UTC', starfield: recipe.starfield || { mode: 'classic' } });
  const reseed = async code => { const options = recipeOptions(randomizeDesign(code, { repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots, ringPlacements: current.options.ringPlacements })); await apply({ version: 1, account: current.account, options }); designCode.value = code; message(`Design ${code} restored. Save the config to preserve subsequent edits too.`); };
  const motionLabel = document.createElement('label'); motionLabel.className = 'randomize-motion';
  const motion = document.createElement('input'); motion.id = 'randomize-motion'; motion.type = 'checkbox'; motion.checked = false; motionLabel.append(motion, ' Animations');
  const partSwitch = (id, text, checked) => {
    const label = document.createElement('label'); label.className = 'randomize-motion';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = checked;
    label.append(input, text); hero.append(label); return input;
  };
  const styling = partSwitch('randomize-styling', 'Styling', true);
  const projects = partSwitch('randomize-repositories', 'Repositories', false);
  const full = partSwitch('randomize-full', 'Full random', false);
  full.title = 'Also change layouts, filters, node types and history. Animations follow the Animations switch.';
  full.addEventListener('input', () => { styling.disabled = projects.disabled = full.checked; });
  const randomize = button(hero, 'randomize-design', '✦ Randomize selected', async () => {
    if (!current) return;
    if (!full.checked && !styling.checked && !motion.checked && !projects.checked) { message('Select Styling, Animations or Repositories to randomize.'); return; }
    const settings = { motion: motion.checked, animations: animationParts.read(), ...historyControls.bounds(), repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots };
    if (!full.checked) {
      const parts = { styling: styling.checked, animations: motion.checked, repositories: projects.checked };
      const pool = projects.checked ? repositoryCandidates(current.options) : [];
      let options;
      const recipe = randomizeMatchingDesign(() => newDesignCode(settings), candidate => {
        options = randomizeParts(current.options, candidate, parts, pool);
        return hasMatchingNodes(options);
      }, 32);
      if (!recipe) { message('No matching design found with your current filters. Use Reset project filters to show current projects, then randomize again. Your design is unchanged.'); return; }
      if (!await apply({ version: 1, account: current.account, options }, { requireVisibleNodes: true, fallback: current })) {
        message('That draw rendered no projects. Your previous design is restored. Try again, or use Reset project filters.'); return;
      }
      message('Selected parts randomized. Other settings kept. Use Share link or save the config to keep this combination.');
      return;
    }
    const recipe = randomizeMatchingDesign(() => newDesignCode(settings), candidate => hasMatchingNodes(recipeOptions(candidate)), 256, { repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots, ringPlacements: current.options.ringPlacements });
    if (!recipe) { message('No matching randomized design found in the loaded repositories. Your current design is unchanged.'); return; }
    if (!await apply({ version: 1, account: current.account, options: recipeOptions(recipe) }, { requireVisibleNodes: true, fallback: current })) {
      message('That draw rendered no projects. Your previous design is restored. Try again, or use Reset project filters.'); return;
    }
    message(`Design ${recipe.designCode} created. Save the config to preserve subsequent edits too.`);
  }); randomize.className = 'randomize-primary';
  hero.append(motionLabel);
  const animationParts = mountRandomizeMotion(hero, motion, storage);
  hero.append(codeControls);
  button(codeControls, 'reseed-design', 'Restore code', () => reseed(designCode.value.trim()));
  control(seedPanel, 'seedMode', 'Seed mode', ['account', 'custom', 'random']);
  control(seedPanel, 'seed', 'Saved seed').maxLength = 120;
  button(seedPanel, 'reroll-seed', 'New random seed', () => { controls.get('seedMode').value = 'random'; controls.get('seed').value = newSeed(); changed(); });
  control(seedPanel, 'nodeShape', 'Node shape', ['circle', 'star', 'diamond', 'hexagon', 'square', 'mixed']);
  control(seedPanel, 'effect', 'Optional effect', ['none', 'grid', 'scanlines', 'coordinates']);
  control(seedPanel, 'legend', 'Show compact mapping legend', null, 'checkbox');
  control(seedPanel, 'starlightAnimate', 'Animate repository twinkle', null, 'checkbox');
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
  control(activityPanel, 'activityEffect', 'Contribution visual', [['off', 'Off'], ['asteroids', 'Commit asteroids & ships'], ['glow', 'Glow'], ['pulse', 'Pulse'], ['comet', 'Comet trails'], ['ripple', 'Ripple']]);
  control(activityPanel, 'activityWindow', 'Activity window', [['1d', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['auto', 'Auto']]);
  control(activityPanel, 'activityDetail', 'Event detail', [['simple', 'Simple'], ['event-types', 'Event types']]);
  control(activityPanel, 'activityConnections', 'Brighten active connections', null, 'checkbox');
  control(activityPanel, 'activityAnimate', 'Animate activity effects', null, 'checkbox');
  const activityStatus = document.createElement('p'); activityStatus.id = 'activity-status'; activityStatus.className = 'export-note'; activityStatus.setAttribute('role', 'status'); activityPanel.append(activityStatus);
  const asteroidActions = document.createElement('div'); asteroidActions.id = 'asteroid-actions'; asteroidActions.hidden = true;
  asteroidActions.innerHTML = '<button type="button" id="load-commit-field" class="secondary">Load commit asteroids</button><button type="button" id="refresh-commit-field" class="secondary">Refresh commit asteroids</button><p id="commit-field-status" class="export-note" role="status">Latest 24 commits per repository, 12 repositories per batch. Ships represent up to three authors per repository. Click an asteroid to open its commit.</p>';
  activityPanel.append(asteroidActions);
  const rhythmPanel = section('Coding rhythm');
  control(rhythmPanel, 'codingRhythmStyle', 'Coding rhythm', [['hidden', 'Off'], ['orbit', 'Orbit'], ['active-arc', 'Active arc'], ['halo', 'Halo']]);
  control(rhythmPanel, 'codingRhythmWindow', 'Window', [['7d', '7 days'], ['14d', '14 days'], ['30d', '30 days']]);
  const zoneMode = control(rhythmPanel, 'rhythmZoneMode', 'Timezone', [['UTC', 'UTC'], ['browser', 'Browser timezone'], ['custom', 'Custom timezone']]);
  const zone = control(rhythmPanel, 'codingRhythmTimezone', 'Custom IANA timezone');
  zone.maxLength = 100;
  control(rhythmPanel, 'codingRhythmDays', 'Days of week', [['off', 'Off'], ['subtle', 'Subtle'], ['full', 'Full']]);
  control(rhythmPanel, 'codingRhythmAnimate', 'Animate rhythm', null, 'checkbox');
  control(rhythmPanel, 'codingRhythmPeakLabel', 'Show peak label', null, 'checkbox');
  const syncRhythm = () => { zone.hidden = zoneMode.value !== 'custom'; zone.previousElementSibling.hidden = zone.hidden; };
  zoneMode.addEventListener('input', syncRhythm);
  const filters = section('Repository filters');
  control(filters, 'minStars', 'Minimum GitHub stars', null, 'number');
  control(filters, 'includeArchived', 'Include archived repositories', null, 'checkbox');
  control(filters, 'updatedWithin', 'Updated within', [['0', 'Any time'], ['1', 'Past year'], ['2', 'Past 2 years'], ['5', 'Past 5 years']]);
  control(filters, 'repoQuery', 'Repository name contains').maxLength = 200;
  control(filters, 'sortBy', 'Select projects by', [['stars', 'Stars'], ['updated', 'Recently updated'], ['name', 'Repository name']]);
  const repositoryPicker = mountRepositoryPicker(section('Choose repositories'), {
    message, findRepositories,
    apply: async includeRepos => {
      if (!current) return;
      const cap = current.options.nodeCap || 100;
      if (includeRepos && includeRepos.length > cap) throw new Error(`Choose at most ${cap} repositories, or increase the node cap first.`);
      const options = { ...current.options, includeRepos };
      if (includeRepos?.some(name => !repositoryPool().find(repo => repo.full_name === name)?.pinned)) options.repoSource = 'all';
      if (includeRepos) Object.assign(options, { maxRepos: Math.max(1, includeRepos.length), includeForks: true, includeArchived: true, minStars: 0, updatedWithin: 0, repoQuery: '', languages: null, topics: null, showOther: true, hiddenNodes: [], selection: {} });
      if (await apply({ version: 1, account: current.account, options }, { loadPresetData: true, fallback: current })) message(includeRepos ? `${includeRepos.length} repositories selected.` : 'Automatic repository selection restored.');
    },
  });
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
  const shareDialog = document.createElement('dialog'); shareDialog.id = 'share-dialog'; shareDialog.setAttribute('aria-labelledby', 'share-title');
  shareDialog.innerHTML = `<h2 id="share-title">Share this constellation</h2>
    <p>Your link keeps this design, filters, colors, and manual positions. It loads current public GitHub data when opened.</p>
    <label for="share-url">Constellation link</label><input id="share-url" type="url" readonly>
    <p id="share-feedback" role="status">Copy the link and send it to anyone. Download the SVG to keep a snapshot of today's image.</p>
    <div class="share-actions"><button type="button" id="copy-share-link">Copy link</button><a id="open-share-link" target="_blank" rel="noopener noreferrer">Open link ↗</a><button type="button" id="close-share">Done</button></div>`;
  document.body.append(shareDialog);
  const shareURL = shareDialog.querySelector('#share-url'), shareFeedback = shareDialog.querySelector('#share-feedback');
  button(hero, 'copy-share', 'Share link', () => {
    if (!current) throw new Error('Load a design first.');
    const link = encodeShare(publicShareBase(location.href), current.account, { ...current.options, customCSS: document.querySelector('#custom-css').value });
    shareURL.value = link; shareDialog.querySelector('#open-share-link').href = link;
    shareFeedback.textContent = 'Copy the link and send it to anyone. Download the SVG to keep a snapshot of today’s image.';
    shareDialog.showModal(); shareURL.focus(); shareURL.select();
  });
  shareDialog.querySelector('#copy-share-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareURL.value); shareFeedback.textContent = 'Link copied. Ready to share.'; }
    catch { shareURL.focus(); shareURL.select(); shareFeedback.textContent = 'The link is selected. Press Ctrl+C or ⌘C to copy it.'; }
  });
  shareDialog.querySelector('#close-share').addEventListener('click', () => shareDialog.close());
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
    layerControls.restore(options);
    organizationControls.restore(options);
    historyControls.restore(options);
    designCode.value = options.designCode || '';
    if (full.checked && /^v[34]:/i.test(options.designCode || '')) motion.checked = !options.designCode.slice(3).startsWith('still-');
    if (full.checked) animationParts.restore(options.designCode);
    const sky = starfieldOptions(options.starfield);
    for (const [key, input] of controls) {
      const value = key.startsWith('sky-') ? sky[key.slice(4)] : options[key] ?? (key === 'nodeSize' ? options.sizingMode : undefined) ?? designDefaults[key] ?? 'custom';
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
    }
    const refinement = layoutRefinementOptions(options.layoutRefinement);
    refinementEnabled.checked = refinement.enabled; refinementIntensity.value = refinement.intensity; syncRefinement();
    controls.get('codingRhythmStyle').value = options.codingRhythm ? options.codingRhythmStyle || 'orbit' : 'hidden';
    zoneMode.value = !options.codingRhythmTimezone || options.codingRhythmTimezone === 'UTC' ? 'UTC' : 'custom';
    syncRhythm();
    syncSky();
  }
  restore({ starfield: defaultStarfield });
  return {
    store, restore, flush, historyRange: historyControls.range, scene: layerControls.update,
    read: () => {
      const entries = [...controls].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.type === 'range' || ['minStars', 'updatedWithin'].includes(key) ? Number(input.value) : input.value]);
      return { ...layerControls.read(), layoutRefinement: { enabled: refinementEnabled.checked, intensity: Number(refinementIntensity.value) }, ...organizationControls.read(), ...historyControls.read(), ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('sky-') && !key.startsWith('refinement-') && key !== 'rhythmZoneMode')), codingRhythm: controls.get('codingRhythmStyle').value !== 'hidden', codingRhythmTimezone: zoneMode.value === 'browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : zoneMode.value === 'UTC' ? 'UTC' : zone.value, starfield: Object.fromEntries(entries.filter(([key]) => key.startsWith('sky-')).map(([key, value]) => [key.slice(4), value])) };
    },
    update(account, options, source) {
      repositoryPicker.update(account, repositoryPool(), options, selectedRepositories(options));
      const audience = options.accountData?.type === 'Organization' || options.accountType === 'organization' ? 'organization' : 'any';
      if (audience !== presetAudience) {
        presetSelect.value = audience === 'organization' ? 'organization-projects' : 'project-map';
        for (const option of presetSelect.options) option.disabled = audience !== 'organization' && studioPresets.find(preset => preset.id === option.value).audience === 'organization';
        presetAudience = audience; describePreset();
      }
      if (pending && pending.account !== account) flush(); current = { account, options }; svg = source; pending = structuredClone(current); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); refreshPresets(); size.textContent = `SVG: ${(new Blob([source]).size / 1024).toFixed(1)} KiB. No scripts or external assets.`;
    },
    shared() { try { return decodeShare(location.href); } catch (error) { message(error.message, true); return null; } },
  };
}
