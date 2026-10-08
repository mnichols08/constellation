import { mountRepositoryPicker } from './repository-picker.mjs';
import { mountStudioLayers } from './studio-layers.mjs';
import { layoutRefinementOptions } from './layout-refinement.mjs';
import { rhythmDefaults } from './coding-rhythm.mjs';
import { studioPresets, presetOptions } from './studio-presets.mjs';
import { mountOrganizationControls } from './organization/studio.mjs';
import { mountStudioHistory } from './history/studio-history.mjs';
import { mountRandomizeMotion } from './studio-randomize-motion.mjs';
import { explainGraphic, ringMeanings } from './semantic-studio.mjs';
import { mountStudioTour } from './studio-tour.mjs';
import { randomizeParts, lockRandomParts, changedParts } from './randomize-parts.mjs';
import { parseConfig, serializeConfig } from './config-schema.mjs';
import { createConfigStore } from './config-store.mjs';
import { encodeShare, decodeShare, publicShareBase } from './share-link.mjs';
import { downloadBlob, svgToPNG } from './export-image.mjs';
import { newSeed } from './seeded-random.mjs';
import { visualThemes } from './themes.mjs';
import { newDesignCode, randomizeDesign, randomizeMatchingDesign } from './design-randomizer.mjs';
import { defaultStarfield, starfieldOptions } from './starfield.mjs';

export const designDefaults = { ringMeaning: 'identity', semanticLegend: false, accountSun: 'off', ...rhythmDefaults, starlightAnimate: true, activityAnimate: true, seedMode: 'account', seed: '', nodeSize: 'legacy', nodeColorMode: 'custom', nodeGlowMode: 'uniform', connectionWeight: 'uniform', majorMetric: 'stars', nodeShape: 'circle', effect: 'none', legend: false, minStars: 0, includeArchived: true, updatedWithin: 0, repoQuery: '', sortBy: 'stars', exportProfile: 'custom', readmePresentation: 'full-universe', ringOrganization: 'identity', featuredTreatment: 'label', activityEffect: 'off', activityWindow: '7d', activityDetail: 'simple', activityConnections: false };

export function preserveShowcaseOptions(recipe, current = {}) {
  return { ...recipe, ...(current.projectRelationships ? { projectRelationships: structuredClone(current.projectRelationships) } : {}), ...(current.projectShowcase ? { projectShowcase: structuredClone(current.projectShowcase) } : {}), ...(current.readmePresentation ? { readmePresentation: current.readmePresentation } : {}), ...(current.ringOrganization ? { ringOrganization: current.ringOrganization } : {}), ...(current.featuredTreatment ? { featuredTreatment: current.featuredTreatment } : {}) };
}

export function mountStudioDesign({ access, host, changed, apply, theme, message, hasMatchingNodes, repositoryCandidates, repositoryPool, selectedRepositories, findRepositories, reveal }) {
  const layerControls = mountStudioLayers(host, changed, reveal);
  const historyControls = mountStudioHistory(host, changed);
  const organizationControls = mountOrganizationControls(host, changed);
  let storage; try { storage = window.localStorage; } catch {}
  const store = createConfigStore(storage);
  let current, svg = '', saveTimer, pending, presetAudience, projectFamilies = {};
  const controls = new Map();
  let syncSky = () => {};
  const section = title => {
    const details = document.createElement('details'); details.className = 'control-section';
    const summary = document.createElement('summary'); summary.textContent = title;
    const body = document.createElement('div'); body.className = 'control-section-body'; details.append(summary, body); host.append(details); return body;
  };
  const familySection = document.createElement('details'); familySection.id = 'project-families'; familySection.className = 'control-section';
  const familyTitle = document.createElement('summary'); familyTitle.textContent = 'Project families';
  const familyBody = document.createElement('div'); familyBody.className = 'control-section-body'; familySection.append(familyTitle, familyBody); host.append(familySection);
  const detailLabel = document.createElement('label'); detailLabel.htmlFor = 'semantic-detail'; detailLabel.textContent = 'Semantic detail';
  const detailSelect = document.createElement('select'); detailSelect.id = detailLabel.htmlFor;
  for (const [value, label] of [['groups', 'Groups'], ['projects', 'Projects']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; detailSelect.append(option); }
  detailSelect.addEventListener('change', changed);
  familyBody.append(detailLabel, detailSelect);
  const familyList = document.createElement('div'); familyList.setAttribute('aria-label', 'Saved project families');
  const familyLabel = document.createElement('label'); familyLabel.htmlFor = 'project-family-label'; familyLabel.textContent = 'Family name';
  const familyName = document.createElement('input'); familyName.id = familyLabel.htmlFor; familyName.maxLength = 120;
  const familyIdLabel = document.createElement('label'); familyIdLabel.htmlFor = 'project-family-id'; familyIdLabel.textContent = 'Stable family ID';
  const familyId = document.createElement('input'); familyId.id = familyIdLabel.htmlFor; familyId.maxLength = 80; familyId.pattern = '[A-Za-z0-9][A-Za-z0-9._-]{0,79}';
  const familyMembersLabel = document.createElement('label'); familyMembersLabel.htmlFor = 'project-family-members'; familyMembersLabel.textContent = 'Projects (select two or more)';
  const familyMembers = document.createElement('select'); familyMembers.id = familyMembersLabel.htmlFor; familyMembers.multiple = true; familyMembers.size = 6;
  const familyHelp = document.createElement('p'); familyHelp.className = 'export-note'; familyHelp.textContent = 'Families are saved in this config. They do not change repository data.';
  const familySave = document.createElement('button'); familySave.type = 'button'; familySave.className = 'secondary'; familySave.textContent = 'Save project family';
  familyBody.append(familyList, familyLabel, familyName, familyIdLabel, familyId, familyMembersLabel, familyMembers, familySave, familyHelp);
  const renderFamilyList = () => {
    familyList.replaceChildren();
    for (const [id, family] of Object.entries(projectFamilies).sort(([a], [b]) => a.localeCompare(b))) {
      const row = document.createElement('div'); row.className = 'project-family-row';
      const label = document.createElement('span'); label.textContent = `${family.label} · ${family.members.length} projects`;
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = `Edit ${family.label}`; edit.className = 'secondary';
      edit.addEventListener('click', () => { familyId.value = id; familyName.value = family.label; for (const option of familyMembers.options) option.selected = family.members.includes(option.value); familyName.focus(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = `Remove ${family.label}`; remove.className = 'secondary';
      remove.addEventListener('click', () => { delete projectFamilies[id]; renderFamilyList(); changed(); });
      row.append(label, edit, remove); familyList.append(row);
    }
  };
  const syncFamilyEditor = options => {
    projectFamilies = structuredClone(options.projectFamilies || {});
    const candidates = new Map((repositoryPool() || []).map(repo => [repo.full_name, repo.name || repo.full_name]));
    for (const family of Object.values(projectFamilies)) for (const id of family.members) if (!candidates.has(id)) candidates.set(id, id);
    familyMembers.replaceChildren(...[...candidates].sort(([a], [b]) => a.localeCompare(b)).map(([id, name]) => { const option = document.createElement('option'); option.value = id; option.textContent = `${name} · ${id}`; return option; }));
    renderFamilyList();
  };
  familySave.addEventListener('click', () => {
    const label = familyName.value.trim(), id = familyId.value.trim() || label.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 80);
    const members = [...familyMembers.selectedOptions].map(option => option.value).sort();
    if (!label || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id) || members.length < 2) { message('Enter a family name and select at least two projects.', true); return; }
    const duplicate = Object.entries(projectFamilies).find(([otherId, value]) => otherId !== id && value.members.some(member => members.includes(member)));
    if (duplicate) { message(`A project already belongs to ${duplicate[1].label}.`, true); return; }
    projectFamilies[id] = { label, members }; renderFamilyList(); familyId.value = id; message(`${label} saved as a project family.`); changed();
  });
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
  const accountPanel = section('Account sun');
  control(accountPanel, 'accountSun', 'Center of your constellation', [['off', 'Off'], ['sun', 'Identity + username'], ['avatar', 'GitHub avatar + glow'], ['profile', 'Developer profile']]);
  const accountNote = document.createElement('p'); accountNote.className = 'export-note'; accountNote.textContent = 'Your account stays at the center while identity rings and projects move around it. Avatar images are embedded in exports; initials appear if the image is unavailable.'; accountPanel.append(accountNote);
  const meaningPanel = section('Ring meaning');
  const meaningControl = control(meaningPanel, 'ringMeaning', 'Ring meaning', Object.keys(ringMeanings));
  const meaningNote = document.createElement('p'); meaningPanel.append(meaningNote);
  meaningControl.addEventListener('change', async () => {
    if (!current) return;
    try { await apply({ ...current, options: {...current.options, ringMeaning: meaningControl.value, arrangement: 'rings', nodeMode: 'repositories', temporalStack: {...current.options.temporalStack, enabled:false}, layoutEngine:undefined, layoutOptions:undefined, referenceDate: current.options.referenceDate || new Date().toISOString()} }, {localOnly:true}); }
    catch (error) { message(error.message, true); }
  });
  control(meaningPanel, 'semanticLegend', 'Include explanation in exported graphic', null, 'checkbox');
  const showcasePanel = section('Showcase');
  control(showcasePanel, 'readmePresentation', 'README presentation', [['recruiter', 'Recruiter · project orrery'], ['full-universe', 'Full universe'], ['featured-work', 'Featured work'], ['current-focus', 'Current focus'], ['technology-identity', 'Technology identity'], ['project-journey', 'Project journey']]);
  control(showcasePanel, 'ringOrganization', 'Organize rings by', [['identity', 'Identity / automatic'], ['importance', 'Project importance'], ['activity', 'Activity'], ['manual', 'Manual']]);
  control(showcasePanel, 'featuredTreatment', 'Featured project treatment', [['star', 'Star only'], ['label', 'Star + prominent label'], ['spotlight', 'Compact spotlight']]);
  const relationshipLabel = document.createElement('label'); relationshipLabel.textContent = 'Related projects (one owner/repo ↔ owner/repo pair per line, up to six)'; relationshipLabel.htmlFor = 'project-relationships';
  const relationships = document.createElement('textarea'); relationships.id = relationshipLabel.htmlFor; relationships.rows = 3;
  relationships.addEventListener('change', () => changed());
  const recruiterNote = document.createElement('p'); recruiterNote.className = 'export-note'; recruiterNote.textContent = 'Recruiter shows up to seven selected projects. Size reflects your curated roles, distance shows repository recency, and color shows primary language. Featured labels may include other contributors; recurring repository topics appear at the center. Loaded history remains in accessible metadata. Curate relationships explicitly; shared languages do not create links';
  showcasePanel.append(recruiterNote, relationshipLabel, relationships);
  const showcaseList = document.createElement('ol'); showcaseList.className = 'showcase-curation-list'; showcaseList.setAttribute('aria-label', 'Project roles and featured order');
  const showcaseNote = document.createElement('p'); showcaseNote.className = 'export-note'; showcaseNote.textContent = 'Roles express your presentation intent, not GitHub popularity or activity. Projects missing from the current data keep their saved role.';
  showcasePanel.append(showcaseNote, showcaseList);
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
  const heroTitle = document.createElement('div'); heroTitle.className = 'design-launcher-title'; heroTitle.textContent = 'Choose the story your constellation tells';
  const heroNote = document.createElement('p'); heroNote.textContent = 'Learn the Studio, start from a preset, or explore a new composition.'; heroTitle.append(heroNote); hero.append(heroTitle);
  const explain = document.createElement('details'); explain.id = 'explain-graphic';
  const explainTitle = document.createElement('summary'); explainTitle.textContent = 'Explain this graphic';
  const explainText = document.createElement('div'); explainText.setAttribute('aria-live','polite'); explain.append(explainTitle, explainText); hero.append(explain);
  const tour = mountStudioTour({host:hero, reveal, apply: config => apply(config, {localOnly:true}), config: () => current});
  const presetMenu = document.createElement('details'); presetMenu.className = 'builtin-preset-menu';
  const presetSummary = document.createElement('summary'); presetSummary.textContent = 'Choose a preset'; presetMenu.append(presetSummary);
  const presetBody = document.createElement('div'); presetBody.className = 'builtin-preset-body'; presetMenu.append(presetBody); hero.append(presetMenu);
  const presetLabel = document.createElement('label'); presetLabel.htmlFor = 'builtin-preset'; presetLabel.textContent = 'Start with a useful view';
  const presetSelect = document.createElement('select'); presetSelect.id = 'builtin-preset';
  for (const preset of studioPresets) { const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.label; presetSelect.append(option); }
  const presetDescription = document.createElement('p'); presetDescription.id = 'builtin-preset-description'; presetSelect.setAttribute('aria-describedby', presetDescription.id);
  const describePreset = () => { const preset = studioPresets.find(value => value.id === presetSelect.value); presetDescription.textContent = preset ? preset.description + ' ' + explainGraphic(presetOptions(preset.id, current?.options)).join(' ') : ''; };
  presetSelect.addEventListener('change', describePreset); describePreset();
  presetBody.append(presetLabel, presetSelect, presetDescription);
  const presetApply = button(presetBody, 'apply-builtin-preset', 'Apply preset', async () => {
    if (!current) return;
    const preset = studioPresets.find(value => value.id === presetSelect.value);
    if (preset.audience === 'organization' && current.options.accountData?.type !== 'Organization' && current.options.accountType !== 'organization') throw new Error('Load an organization first, then choose an organization preset.');
    presetApply.disabled = true;
    try {
      const applied = await apply({ version: 1, account: current.account, options: presetOptions(preset.id, current.options) }, { localOnly: true, loadOrganization: preset.audience === 'organization', loadPresetData: true, requireVisibleNodes: true, fallback: current });
      if (!applied) { message(`${preset.label} has no visible projects for this account. Your previous design is restored.`, true); return; }
      presetMenu.open = false; message(`${preset.label} applied. Customize it or save it as your own preset.`);
    } finally { presetApply.disabled = false; }
  });
  presetMenu.addEventListener('keydown', event => { if (event.key === 'Escape') { presetMenu.open = false; presetSummary.focus(); } });
  document.addEventListener('click', event => { if (!presetMenu.contains(event.target)) presetMenu.open = false; });
  const designCode = document.createElement('input'); designCode.id = 'design-code'; designCode.placeholder = 'v6:… (older codes also work)'; designCode.maxLength = 106;
  const codeLabel = document.createElement('label'); codeLabel.htmlFor = designCode.id; codeLabel.textContent = 'Reproducible design code';
  const codeControls = document.createElement('div'); codeControls.className = 'design-code-controls'; codeControls.append(codeLabel, designCode);
  const recipeOptions = recipe => ({ ...preserveShowcaseOptions(recipe, current.options), organizationUser: current.options.organizationUser, accountType: current.options.accountType, organizationScope: current.options.organizationScope, organizationView: current.options.organizationView, organization: current.options.organization, repoSource: current.options.repoSource || 'all', codingRhythmTimezone: current.options.codingRhythmTimezone || 'UTC', starfield: recipe.starfield || { mode: 'classic' } });
  const reseed = async code => { const options = recipeOptions(randomizeDesign(code, { repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots, ringPlacements: current.options.ringPlacements })); await apply({ version: 1, account: current.account, options }); designCode.value = code; message(`Design ${code} restored. Save the config to preserve subsequent edits too.`); };
  const compositionMenu = document.createElement('details'); compositionMenu.id = 'composition-menu'; compositionMenu.className = 'builtin-preset-menu';
  const compositionTitle = document.createElement('summary'); compositionTitle.textContent = 'Randomize / locks'; compositionMenu.append(compositionTitle);
  const compositionBody = document.createElement('div'); compositionBody.className = 'composition-body'; compositionMenu.append(compositionBody); hero.append(compositionMenu);
  const motionLabel = document.createElement('label'); motionLabel.className = 'randomize-motion';
  const motion = document.createElement('input'); motion.id = 'randomize-motion'; motion.type = 'checkbox'; motion.checked = false; motionLabel.append(motion, ' Animations');
  const partSwitch = (id, text, checked) => {
    const label = document.createElement('label'); label.className = 'randomize-motion';
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.checked = checked;
    label.append(input, text); compositionBody.append(label); return input;
  };
  const styling = partSwitch('randomize-styling', 'Styling', true);
  const projects = partSwitch('randomize-repositories', 'Repositories', false);
  const layoutPart = partSwitch('randomize-layout', 'Layout / composition', false);
  const semanticPart = partSwitch('randomize-semantics', 'Ring mapping', false);
  const connectionPart = partSwitch('randomize-connections', 'Connections', false);
  const locks = new Map();
  const lockMenu = document.createElement('details'); const lockTitle = document.createElement('summary'); lockTitle.textContent = 'Lock parts I like'; lockMenu.append(lockTitle); compositionBody.append(lockMenu);
  for (const [key,label] of [['styling','Style'],['layout','Layout'],['repositories','Repository selection'],['semantics','Semantic composition'],['connections','Connections'],['animations','Animation']]) {
    const wrapper = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.id = 'lock-' + key; wrapper.append(input, label); lockMenu.append(wrapper); locks.set(key,input);
  }
  const readLocks = () => Object.fromEntries([...locks].map(([key,input]) => [key,input.checked]));
  let undoConfig;
  const changeSummary = document.createElement('p'); changeSummary.id = 'randomize-summary'; changeSummary.setAttribute('role','status'); compositionBody.append(changeSummary);
  const undo = button(compositionBody, 'undo-randomize', 'Undo randomization', async () => { if (!undoConfig) return; const config = undoConfig; await apply(config, {localOnly:true}); undoConfig = null; undo.disabled = true; changeSummary.textContent = 'Previous design restored.'; }); undo.disabled = true;
  const recordDraw = before => { undoConfig = before; undo.disabled = false; const parts = changedParts(before.options,current.options); changeSummary.textContent = 'What changed: ' + (parts.join(', ') || 'no unlocked settings') + '. Save the explicit configuration to keep this combination.'; };
  const full = partSwitch('randomize-full', 'Full design', false);
  let previousRandomParts = null;
  full.title = 'Also change layouts, filters, node types and history. Animations follow the Animations switch.';
  full.addEventListener('input', () => {
    if (full.checked) {
      previousRandomParts = { styling: styling.checked, projects: projects.checked };
      styling.checked = false;
      projects.checked = false;
    } else if (previousRandomParts) {
      styling.checked = previousRandomParts.styling;
      projects.checked = previousRandomParts.projects;
      previousRandomParts = null;
    }
    styling.disabled = full.checked;
    projects.disabled = full.checked;
  });
  const randomize = button(hero, 'randomize-design', '✦ Randomize selected', async () => {
    if (!current) return;
    if (!full.checked && !styling.checked && !motion.checked && !projects.checked && !layoutPart.checked && !semanticPart.checked && !connectionPart.checked) { message('Select Styling, Animations or Repositories to randomize.'); return; }
    const before = structuredClone(current);
    const settings = { motion: motion.checked, animations: animationParts.read(), ...historyControls.bounds(), repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots };
    if (!full.checked) {
      const parts = { styling: styling.checked, animations: motion.checked, repositories: projects.checked, layout: layoutPart.checked, semantics: semanticPart.checked, connections: connectionPart.checked };
      const pool = projects.checked ? repositoryCandidates(current.options) : [];
      let options;
      const recipe = randomizeMatchingDesign(() => newDesignCode(settings), candidate => {
        options = lockRandomParts(current.options, randomizeParts(current.options, candidate, parts, pool), readLocks());
        return hasMatchingNodes(options);
      }, 32);
      if (!recipe) { message('No matching design found with your current filters. Use Reset project filters to show current projects, then randomize again. Your design is unchanged.'); return; }
      if (!await apply({ version: 1, account: current.account, options }, { localOnly: true, requireVisibleNodes: true, fallback: current })) {
        message('That draw rendered no projects. Your previous design is restored. Try again, or use Reset project filters.'); return;
      }
      recordDraw(before); compositionMenu.open = true;
      message('Selected parts randomized. Other settings kept. Use Share link or save the config to keep this combination.');
      return;
    }
    const recipe = randomizeMatchingDesign(() => newDesignCode(settings), candidate => hasMatchingNodes(lockRandomParts(current.options, recipeOptions(candidate), readLocks())), 256, { repositories: repositoryPool(), snapshots: current.options.timeline?.snapshots, ringPlacements: current.options.ringPlacements });
    if (!recipe) { message('No matching randomized design found in the loaded repositories. Your current design is unchanged.'); return; }
    if (!await apply({ version: 1, account: current.account, options: lockRandomParts(current.options, recipeOptions(recipe), readLocks()) }, { localOnly: true, requireVisibleNodes: true, fallback: current })) {
      message('That draw rendered no projects. Your previous design is restored. Try again, or use Reset project filters.'); return;
    }
    recordDraw(before);
    message(`Design ${recipe.designCode} created. Save the config to preserve subsequent edits too.`);
  }); randomize.className = 'randomize-primary';
  compositionBody.append(motionLabel);
  const animationParts = mountRandomizeMotion(compositionBody, motion, storage);
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
    message, findRepositories, access,
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
  const roleValues = [['', 'No role'], ['featured', 'Featured'], ['supporting', 'Supporting'], ['experimental', 'Experimental'], ['historical', 'Historical']];
  function roleEntries() {
    return [...showcaseList.querySelectorAll('[data-project-role]')].map(row => {
      const role = row.querySelector('select').value;
      return [row.dataset.projectRole, role ? { role, priority: role === 'featured' ? Number(row.querySelector('input').value) : 1 } : null];
    });
  }
  function updateShowcaseList(options = {}) {
    const configured = options.projectShowcase || {};
    const repositories = selectedRepositories(options);
    showcaseList.replaceChildren(...repositories.map(repo => {
      const entry = configured[repo.full_name] || configured[repo.name];
      const row = document.createElement('li'); row.dataset.projectRole = repo.full_name;
      const name = document.createElement('strong'); name.textContent = repo.name;
      const description = document.createElement('span'); description.textContent = repo.description || repo.full_name;
      const role = document.createElement('select'); role.setAttribute('aria-label', `Role for ${repo.name}`);
      for (const [value, text] of roleValues) { const option = document.createElement('option'); option.value = value; option.textContent = text; role.append(option); }
      role.value = entry?.role || '';
      const priority = document.createElement('input'); priority.type = 'number'; priority.min = '1'; priority.max = '9999'; priority.step = '1'; priority.value = String(entry?.priority || 1); priority.setAttribute('aria-label', `Featured order for ${repo.name}`); priority.hidden = role.value !== 'featured';
      role.addEventListener('change', () => { priority.hidden = role.value !== 'featured'; changed(); });
      priority.addEventListener('change', changed);
      row.append(name, description, role, priority);
      for (const [delta, text] of [[-1, 'Move up'], [1, 'Move down']]) {
        const move = document.createElement('button'); move.type = 'button'; move.className = 'secondary'; move.textContent = text; move.setAttribute('aria-label', `${text} ${repo.name} in featured order`); move.disabled = role.value !== 'featured';
        move.addEventListener('click', () => {
          const featured = [...showcaseList.querySelectorAll('[data-project-role]')].filter(item => item.querySelector('select').value === 'featured').sort((a, b) => Number(a.querySelector('input').value) - Number(b.querySelector('input').value));
          const index = featured.indexOf(row), target = index + delta;
          if (target < 0 || target >= featured.length) return;
          [featured[index], featured[target]] = [featured[target], featured[index]];
          featured.forEach((item, order) => { item.querySelector('input').value = String(order + 1); });
          changed();
        });
        row.append(move);
      }
      return row;
    }));
  }
  const exports = section('Config, presets & export');
  control(exports, 'exportProfile', 'Output profile', [['custom', 'Current layout'], ['profile', 'Profile README'], ['repository', 'Repository README'], ['compact', 'Compact'], ['wide', 'Wide README'], ['hero', 'Hero'], ['square', 'Square'], ['transparent', 'Transparent']]);
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
  button(exports, 'save-preset', 'Save this as a preset', () => { stored(store.savePreset(current.account, presetName.value, current.options)); presets.value = presetName.value.trim(); message('Preset saved locally.'); });
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
    syncFamilyEditor(options);
    detailSelect.value = ['groups', 'projects'].includes(options.semanticZoom?.level) ? options.semanticZoom.level : 'projects';
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
    relationships.value = (options.projectRelationships || []).map(pair => pair.join(' ↔ ')).join('\n');
    const refinement = layoutRefinementOptions(options.layoutRefinement);
    refinementEnabled.checked = refinement.enabled; refinementIntensity.value = refinement.intensity; syncRefinement();
    controls.get('codingRhythmStyle').value = options.codingRhythm ? options.codingRhythmStyle || 'orbit' : 'hidden';
    zoneMode.value = !options.codingRhythmTimezone || options.codingRhythmTimezone === 'UTC' ? 'UTC' : 'custom';
    syncRhythm();
    syncSky();
  }
  restore({ starfield: defaultStarfield });
  return {
    config: () => structuredClone(current),
    store, restore, flush, tour, historyRange: historyControls.range, scene: layerControls.update,
    read: () => {
      const entries = [...controls].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.type === 'range' || ['minStars', 'updatedWithin'].includes(key) ? Number(input.value) : input.value]);
      const projectShowcase = { ...(current?.options.projectShowcase || {}) };
      for (const [id, entry] of roleEntries()) entry ? projectShowcase[id] = entry : delete projectShowcase[id];
      return { ...layerControls.read(), layoutRefinement: { enabled: refinementEnabled.checked, intensity: Number(refinementIntensity.value) }, ...organizationControls.read(), ...historyControls.read(), ...Object.fromEntries(entries.filter(([key]) => !key.startsWith('sky-') && !key.startsWith('refinement-') && key !== 'rhythmZoneMode')), semanticZoom: { enabled: detailSelect.value === 'groups', level: detailSelect.value }, ...(Object.keys(projectShowcase).length ? { projectShowcase } : {}), ...(Object.keys(projectFamilies).length ? { projectFamilies: structuredClone(projectFamilies) } : {}), projectRelationships: relationships.value.split(/\r?\n/).filter(line => line.trim()).map(line => line.split(/\s*(?:↔|<->|,)\s*/).map(id => id.trim())), readmePresentation: controls.get('readmePresentation').value, ringOrganization: controls.get('ringOrganization').value, featuredTreatment: controls.get('featuredTreatment').value, codingRhythm: controls.get('codingRhythmStyle').value !== 'hidden', codingRhythmTimezone: zoneMode.value === 'browser' ? Intl.DateTimeFormat().resolvedOptions().timeZone : zoneMode.value === 'UTC' ? 'UTC' : zone.value, starfield: Object.fromEntries(entries.filter(([key]) => key.startsWith('sky-')).map(([key, value]) => [key.slice(4), value])) };
    },
    update(account, options, source) {
      if (JSON.stringify(options.projectFamilies || {}) !== JSON.stringify(projectFamilies)) syncFamilyEditor(options);
      if (current && current.account !== account) { undoConfig = null; undo.disabled = true; tour.close(); }
      repositoryPicker.update(account, repositoryPool(), options, selectedRepositories(options));
      const audience = options.accountData?.type === 'Organization' || options.accountType === 'organization' ? 'organization' : 'any';
      if (audience !== presetAudience) {
        presetSelect.value = audience === 'organization' ? 'organization-projects' : 'project-map';
        for (const option of presetSelect.options) option.disabled = audience !== 'organization' && studioPresets.find(preset => preset.id === option.value).audience === 'organization';
        presetAudience = audience; describePreset();
      }
      if (pending && pending.account !== account) { flush(); undoConfig = null; undo.disabled = true; } current = { account, options }; svg = source; pending = structuredClone(current); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); refreshPresets(); size.textContent = `SVG: ${(new Blob([source]).size / 1024).toFixed(1)} KiB. No scripts or external assets.`;
      updateShowcaseList(options);
      meaningNote.textContent = ringMeanings[options.ringMeaning || 'identity'] + ' Semantic bands stay fixed during decorative motion and refinement. Manual node positions override bands.';
      explainText.replaceChildren(...explainGraphic(options).map(line => { const p = document.createElement('p'); p.textContent=line; return p; }));
      tour.refresh();
    },
    shared() { try { return decodeShare(location.href); } catch (error) { message(error.message, true); return null; } },
  };
}
