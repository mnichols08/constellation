import { deriveCodingRhythm } from './coding-rhythm.mjs';
import { createScene } from './constellation.mjs';
import { renderSceneSVG } from './renderer-svg.mjs';
import { createDataPipeline } from './pipeline-cache.mjs';
const dataPipeline = createDataPipeline();
import { presetOptions } from './studio-presets.mjs';
import { mountImageViewer } from './image-viewer.mjs';
import { mountStudioLayout } from './studio-layout.mjs';
import { mountStudioDesign } from './studio-design.mjs';
import { createFormRestorer } from './studio-config-form.mjs';
import { visualThemes, themePalettes } from './themes.mjs';
import { exportSettings } from './export-image.mjs';
import { seededRandom, resolveSeed } from './seeded-random.mjs';
import { aggregateActivity } from './activity.mjs';
import { sampleActivity } from './sample-activity.mjs';
import { mountLiveTilt } from './live-tilt.mjs';
import { username, selectRepositoryPool, selectRepositories, repositoryLanguages, renderConstellation } from './constellation.mjs';
import { readmeSnippet, renderWorkflow, installationLinks } from './export.mjs';
import { defaultVisualStyle, visualCSS, randomNodeColors } from './visual-style.mjs';
import { mountLabelEditor } from './label-editor.mjs';
import { mountGraphExplorer } from './graph-explorer.mjs';
import { explainFilters } from './filter-explanation.mjs';
import { rustAvailable, identityPoints } from './engine.mjs';

import { createPreviewData, createPreviewFetch, createPinnedFetch, canRenderPreview } from './preview-data.mjs';

let storage;
try { storage = window.sessionStorage; } catch {}
const proxyBase = document.querySelector('meta[name="constellation-api"]')?.content;
const localAuth = document.querySelector('meta[name="constellation-auth"]')?.content === 'authenticated';
const data = createPreviewData({ storage, fetchImpl: createPreviewFetch({ proxyBase }), fetchPinned: createPinnedFetch({ proxyBase }) });
let loading = false;
let studio, restoreForm, workspace, imageViewer;
function enterStudio() {
  if (!workspace) workspace = mountStudioLayout();
  document.documentElement.dataset.entry = 'studio';
}
let importedOptions = {};
const $ = selector => document.querySelector(selector);
if (proxyBase) $('.form-note').textContent = localAuth
  ? 'Using your local GitHub token. Loaded data is retained; customization makes no additional GitHub requests.'
  : 'No local GitHub token found. Add GH_TOKEN to .env and restart npm run preview to authenticate. Loaded data is retained while customizing.';
const form = $('#account-form');
function syncAccountMode() {
  const mode = $('#account-mode').value;
  $('#organization-account').hidden = mode !== 'paired';
  $('#organization-account').required = mode === 'paired';
  form.elements.username.placeholder = mode === 'organization' ? 'Organization name or URL' : mode === 'paired' ? 'GitHub username' : 'Username or organization';
}
$('#account-mode').addEventListener('change', () => {
  if ($('#account-mode').value === 'organization' && $('#organization-account').value.trim()) form.elements.username.value = $('#organization-account').value.trim();
  syncAccountMode();
});
syncAccountMode();
const status = $('#status');
const preview = $('#preview');
const download = $('.download');
const controls = ['#layout', '#max-repos', '#animate', '#forks', '#bridges', '#connection-density', '#connection-basis', '#show-other', '#custom-css'].map($);
const filterSelection = { languages: null, topics: null };
const labelPlacements = new Map();
const starPlacements = new Map();
const placementAccounts = new Map();
const nodeColorSettings = new Map();
const hiddenNodeSettings = new Map();
const hiddenLabelSettings = new Map();
let displayedNodes = [];
const labelEditor = document.createElement('div');
labelEditor.className = 'live-tilt-surface';
let liveTilt;
let graphSelection = {};
if (!rustAvailable) {
  $('#node-mode').value = 'repositories';
  $('#arrangement').value = 'field';
  for (const option of $('#node-mode').options) option.disabled = option.value !== 'repositories';
  for (const option of $('#arrangement').options) option.disabled = option.value !== 'field';
  $('#identity-ring').checked = false;
  $('#identity-ring').disabled = true;
  $('#snap-rings').disabled = true;
  $('#animate-rings').disabled = true;
  for (let i = 0; i < 4; i++) $(`#ring-rotation-${i}`).disabled = true;
  $('#engine-status').textContent = 'Basic preview: the layout engine could not load. Reload to restore orbital layouts and rings.';
}
function buildGraphFilters(pool) {
  const previousFocus = document.activeElement?.id;
  const available = {
    languages: [...new Set(pool.flatMap(repo => repositoryLanguages(repo).length ? repositoryLanguages(repo) : $('#show-other').checked ? ['Other'] : []))].sort(),
    topics: [...new Set(pool.flatMap(repo => repo.topics || []))].sort(),
  };
  for (const [kind, names] of Object.entries(available)) {
    const container = $(kind === 'languages' ? '#language-filters' : '#topic-filters');
    container.replaceChildren();
    if (!names.length) {
      const note = document.createElement('span'); note.className = 'empty-filters'; note.textContent = kind === 'topics' ? 'No GitHub topics in this project pool. Leave All selected to apply no topic filter.' : 'No detected languages in this project pool.'; container.append(note);
    }
    // Keep an existing selection visible if a changed project pool lacks it.
    for (const name of [...new Set([...names, ...(filterSelection[kind] || [])])].sort()) {
      const label = document.createElement('label'); label.className = 'filter-chip';
      const input = document.createElement('input'); input.type = 'checkbox'; input.id = `filter-${kind}-${encodeURIComponent(name)}`;
      input.checked = filterSelection[kind] === null || filterSelection[kind].includes(name);
      input.addEventListener('input', () => {
        const selected = new Set(filterSelection[kind] ?? names);
        input.checked ? selected.add(name) : selected.delete(name);
        filterSelection[kind] = [...selected].sort(); render();
      });
      const text = document.createElement('span'); text.textContent = kind === 'topics' ? `#${name}` : name;
      label.append(input, text); container.append(label);
    }
    for (const button of document.querySelectorAll(`[data-filter="${kind}"]`)) button.setAttribute('aria-pressed', String(button.dataset.selection === 'all' ? filterSelection[kind] === null : filterSelection[kind]?.length === 0));
  }
  if (previousFocus?.startsWith('filter-')) document.getElementById(previousFocus)?.focus({ preventScroll: true });
}
let visualStyle = defaultVisualStyle();
const colorLabels = { background: 'Sky gradient', foreground: 'Labels & dust', accent: 'Paths & credit', line: 'Secondary links', star: 'Stars' };
function buildVisualControls() {
  $('#palette-controls').replaceChildren();
  for (const mode of ['light', 'dark']) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${mode === 'light' ? 'Light' : 'Dark'} palette`;
    fieldset.append(legend);
    for (const [key, labelText] of Object.entries(colorLabels)) {
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'color'; input.value = visualStyle[mode][key]; input.id = `${mode}-${key}`;
      input.setAttribute('aria-label', `${mode} ${labelText}`);
      input.addEventListener('input', () => { visualStyle[mode][key] = input.value; render(); });
      label.append(input); fieldset.append(label);
    }
    $('#palette-controls').append(fieldset);
  }
  $('#style-sliders').replaceChildren();
  for (const [key, labelText, min, max, step] of [
    ['lineWidth', 'Line weight', .5, 3, .1], ['lineOpacity', 'Connection visibility', 0, 1, .05],
    ['secondaryOpacity', 'Secondary connections', 0, 1, .01],
    ['bridgeOpacity', 'Bridge visibility', 0, 1, .05], ['glow', 'Star glow', 0, 5, .5],
    ['dustOpacity', 'Background stars', 0, 1, .05], ['labelSize', 'Label size', 9, 20, 1],
  ]) {
    const label = document.createElement('label'); label.className = 'visual-range'; label.htmlFor = `style-${key}`; label.textContent = labelText;
    const output = document.createElement('output'); output.value = visualStyle[key]; output.htmlFor = `style-${key}`; label.append(output);
    const input = document.createElement('input'); input.id = `style-${key}`; input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = visualStyle[key];
    input.addEventListener('input', () => { visualStyle[key] = Number(input.value); output.value = input.value; render(); });
    $('#style-sliders').append(label, input);
  }
  $('#show-labels').checked = visualStyle.labels;
}
const sampleGroups = {
  TypeScript: ['constellation', 'little-notes', 'orbit-ui', 'weekend-build', 'palette'],
  JavaScript: ['tiny-worlds', 'garden', 'soundwaves', 'daydream'],
  Python: ['stargazer', 'field-notes', 'moonrise'],
  Rust: ['lightbeam', 'wayfinder'],
  CSS: ['soft-shadows', 'nightfall'],
};
let account = 'your-universe';
let repositories = Object.entries(sampleGroups).flatMap(([language, names]) => names.map((name, index) => ({
  name, full_name: `${account}/${name}`, language, languages: { [language]: 1000, ...(['JavaScript', 'TypeScript', 'CSS'].includes(language) ? { HTML: 80, CSS: 60 } : {}) }, topics: index % 2 ? ['creative-coding'] : ['web', 'tools'], stargazers_count: [42, 18, 7, 3, 1][index], fork: false,
})));
let isSample = true;
let loadedSource = 'all';
repositories = repositories.map((repo, index) => ({ ...repo, pinned: index < 6, pin_order: index, created_at: `${2012 + index % 15}-01-01T00:00:00Z`, pushed_at: `${index % 4 ? 2025 : 2026}-01-01T00:00:00Z`, archived: index === 15 }));
let url;
let workflowUrl;

function updateNodeColorControls(selectedId) {
  const select = $('#color-node');
  const previous = selectedId || select.value;
  const choices = displayedNodes.map(node => [node.full_name, `${node.name} (${node.nodeKind || 'repository'})${hiddenNodeSettings.get(account.toLowerCase())?.has(node.full_name) ? ' — hidden' : ''}`]);
  if (JSON.stringify([...select.options].map(option => [option.value, option.textContent])) !== JSON.stringify(choices)) {
    select.replaceChildren(...choices.map(([id, label]) => {
      const option = document.createElement('option'); option.value = id; option.textContent = label; return option;
    }));
  }
  if (choices.some(([id]) => id === previous)) select.value = previous;
  for (const [id, settings] of [['#node-visible', hiddenNodeSettings], ['#node-label-visible', hiddenLabelSettings]]) {
    $(id).checked = !settings.get(account.toLowerCase())?.has(select.value);
    $(id).disabled = !choices.length;
  }
  const settings = nodeColorSettings.get(account.toLowerCase()) || {};
  const custom = Object.hasOwn(settings, select.value);
  $('#node-color').value = custom ? settings[select.value] : visualStyle[matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'].star;
  select.disabled = !choices.length;
  $('#node-color').disabled = !choices.length;
  $('#random-node-colors').disabled = !choices.length;
  $('#reset-node-color').disabled = !custom;
  $('#reset-node-colors').disabled = !Object.keys(settings).length;
}


function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

function render({ requireVisibleNodes = false } = {}) {
  placementAccounts.set(account.toLowerCase(), studio ? resolveSeed(account, studio.read()) : account);
  const generatedCSS = visualCSS(visualStyle);
  $('#generated-css').value = generatedCSS;
  const options = { ...importedOptions, ...studio?.read(), theme: importedOptions.theme || 'auto', layout: $('#layout').value, maxRepos: Number($('#max-repos').value), animate: $('#animate').checked, includeForks: $('#forks').checked, bridges: $('#bridges').checked, connectionDensity: $('#connection-density').value, connectionBasis: $('#connection-basis').value, languages: filterSelection.languages, topics: filterSelection.topics, showOther: $('#show-other').checked, css: `${generatedCSS}\n${$('#custom-css').value}` };
  options.accountData = isSample ? undefined : data.profile(account);
  options.organizationData = isSample ? undefined : data.organization(account);
  options.layout = exportSettings(options).layout;
  options.visualStyle = structuredClone(visualStyle);
  options.customCSS = $('#custom-css').value;
  options.repoSource = isSample ? $('#repo-source').value : loadedSource;
  $('#pinned-help').hidden = options.repoSource !== 'pinned';
  $('#max-repos').disabled = options.repoSource === 'pinned';
  const selected = selectRepositoryPool(repositories, options);
  options.arrangement = $('#arrangement').value;
  if ($('#link-ring-motion').checked) for (let i = 1; i < 4; i++) {
    $(`#ring-speed-${i}`).value = $('#ring-speed-0').value;
    $(`#ring-direction-${i}`).value = $('#ring-direction-0').value;
    for (const kind of ['motion', 'easing', 'sway']) $(`#ring-${kind}-${i}`).value = $(`#ring-${kind}-0`).value;
  }
  options.ringAnimation = { enabled: $('#animate-rings').checked, linked: $('#link-ring-motion').checked, speeds: Array.from({ length: 4 }, (_, i) => Number($(`#ring-speed-${i}`).value)), directions: Array.from({ length: 4 }, (_, i) => $(`#ring-direction-${i}`).value) };
  options.ringAnimation.modes = Array.from({ length: 4 }, (_, i) => $(`#ring-motion-${i}`).value);
  options.ringAnimation.easing = Array.from({ length: 4 }, (_, i) => $(`#ring-easing-${i}`).value);
  options.ringAnimation.amplitudes = Array.from({ length: 4 }, (_, i) => Number($(`#ring-sway-${i}`).value));
  options.perspective = { enabled: $('#perspective-enabled').checked, animate: $('#perspective-animate').checked, ...Object.fromEntries(['horizontal', 'vertical', 'zoom', 'range', 'duration'].map(key => [key, Number($(`#perspective-${key}`).value)])) };
  $('#perspective-controls').hidden = !options.perspective.enabled;
  $('#perspective-motion-controls').hidden = !options.perspective.animate;
  for (const key of ['horizontal', 'vertical', 'zoom', 'range', 'duration']) $(`#perspective-${key}-value`).value = `${options.perspective[key]}${key === 'zoom' ? '%' : key === 'duration' ? 's' : '°'}`;
  const cameraMoving = options.perspective.enabled && options.perspective.animate;
  options.floatingAnimation = { enabled: $('#animate-floating').checked, mode: $('#floating-motion').value, amplitude: Number($('#floating-amount').value), duration: Number($('#floating-duration').value) };
  $('#floating-motion-controls').hidden = !options.floatingAnimation.enabled;
  $('#floating-amount-value').value = options.floatingAnimation.amplitude;
  $('#floating-duration-value').value = `${options.floatingAnimation.duration}s`;
  for (let i = 0; i < 4; i++) {
    const linked = options.ringAnimation.linked && i > 0;
    $(`[data-ring-editor="${i}"]`).hidden = $('#edit-ring').value !== String(i);
    $(`#ring-sway-controls-${i}`).hidden = options.ringAnimation.modes[i] !== 'sway';
    $(`#ring-sway-value-${i}`).value = `${options.ringAnimation.amplitudes[i]}°`;
    for (const kind of ['motion', 'easing', 'sway']) $(`#ring-${kind}-${i}`).disabled = linked;
    $(`#ring-speed-${i}`).disabled = linked;
    $(`#ring-direction-${i}`).disabled = linked;
    $(`#ring-speed-value-${i}`).value = `${options.ringAnimation.speeds[linked ? 0 : i]} RPM`;
  }
  $('#lock-stars').disabled = options.ringAnimation.enabled || options.floatingAnimation.enabled || cameraMoving || liveTilt?.active;
  options.ringRotations = Array.from({ length: 4 }, (_, i) => Number($(`#ring-rotation-${i}`).value));
  options.ringRotations.forEach((angle, i) => { $(`#ring-rotation-value-${i}`).value = `${angle}°`; });
  options.identityRing = $('#identity-ring').checked;
  options.snapToRings = $('#snap-rings').checked;
  $('#snap-rings').disabled = !rustAvailable;
  options.nodeMode = $('#node-mode').value;
  options.hiddenNodes = [...(hiddenNodeSettings.get(account.toLowerCase()) || [])];
  options.hiddenLabels = [...(hiddenLabelSettings.get(account.toLowerCase()) || [])];
  options.colorConnections = $('#color-connections').checked;
  options.nodeColors = nodeColorSettings.get(account.toLowerCase()) || {};
  const placementKey = `${account.toLowerCase()}:${options.layout}:${options.arrangement}`;
  options.labelOffsets = labelPlacements.get(placementKey) || {};
  options.starPositions = starPlacements.get(placementKey) || {};
  const missing = selected.filter(repo => !repo.languages).length;
  $('#limit-value').value = options.maxRepos;
  $('#load-projects').hidden = isSample || !missing;
  $('#load-projects').textContent = `Load data for ${missing} more projects`;
  $('#load-projects').disabled = loading;
  if (missing && options.accountData?.type !== 'Organization') {
    message(`${missing} projects need language data. Click Load data to apply this project pool. The previous image and exports are retained; no requests are made while customizing.`);
    return;
  }
  const generatedAt = new Date().toISOString();
  const activitySnapshot = isSample ? sampleActivity(repositories) : data.activity(account);
  options.historyData = activitySnapshot;
  studio.historyRange(repositories, generatedAt);
  options.activityData = activitySnapshot ? aggregateActivity(activitySnapshot.events, selectRepositories(repositories, options), options, activitySnapshot.asOf) : undefined;
  options.codingRhythmData = activitySnapshot ? deriveCodingRhythm(activitySnapshot.events, options, options.activityMetricDate || activitySnapshot.asOf) : undefined;
  const activityStatus = $('#activity-status');
  if (activityStatus) activityStatus.textContent = activitySnapshot?.diagnostic || (isSample ? 'Demo activity, using a fixed sample week.' : activitySnapshot ? `${Object.keys(options.activityData.repositories).length} represented projects with public events in ${options.activityData.window}. Snapshot ${activitySnapshot.asOf.slice(0, 10)}. GitHub events can be delayed.` : 'Load an account to fetch its public activity.');
  options.selection = graphSelection;
  const labelDiagnostics = [];
  const scene = createScene(account, repositories, { ...options, generatedAt }, { pipeline: dataPipeline, onDiagnostic: diagnostic => { if (diagnostic.code === 'label-omitted') labelDiagnostics.push(diagnostic); } });
  const svg = renderSceneSVG(scene);
  const currentScene = scene.kind === 'time-lapse' ? scene.latest : scene;
  const projected = { ...currentScene.presentation.graph, nodes: currentScene.nodes.map(node => node.metadata) };
  studio.scene(scene);
  // Validate the final render after form normalization, before publishing it or
  // replacing the saved draft and exports. A metadata-only check is not enough.
  if (requireVisibleNodes && (!projected.nodes.some(node => !options.hiddenNodes.includes(node.full_name)) ||
      !svg.includes('class="star"') || svg.includes('No projects match these filters or historical year.'))) return false;
  displayedNodes = [...projected.nodes].sort((a, b) => a.name.localeCompare(b.name));
  updateNodeColorControls();
  const combinedMode = options.nodeMode === 'combined';
  const categoryMode = options.nodeMode !== 'repositories';
  $('#connection-density').disabled = combinedMode;
  $('#connection-basis').disabled = categoryMode;
  $('#bridges').disabled = categoryMode;
  $('#node-mode-help').textContent = combinedMode ? 'Repositories, languages and topics share one chart. Lines connect each repository to its categories. Unlock positions to arrange nodes; labels move with them. Manual positions carry across views. Topics are repository topics, not issue labels.' : categoryMode
    ? `Each node is a ${options.nodeMode === 'languages' ? 'language' : 'GitHub repository topic'}. Connections mean they occur in the same repository; size shows repository count. Click a node to see its repositories.${options.nodeMode === 'topics' ? ' Issue labels are not included.' : ''}`
    : 'Each node is a repository. Connections show shared languages or topics.';
  $('#node-legend').textContent = combinedMode ? 'Repository · Language (ring) · Topic (dashed ring)' : categoryMode ? options.nodeMode === 'languages' ? 'Language' : 'Topic' : 'Project';
  buildGraphFilters(selectRepositoryPool(repositories, options));
  $('#relationship-legend').textContent = combinedMode ? 'Repository → language / topic' : categoryMode ? 'Shared repository' : options.connectionBasis === 'both' ? 'Languages & topics' : options.connectionBasis === 'topics' ? 'Shared topic' : 'Shared language';
  const exportSelection = () => {
    const captured = renderConstellation(account, repositories, { ...options, generatedAt });
    const nextUrl = URL.createObjectURL(new Blob([captured], { type: 'image/svg+xml' }));
    const img = new Image();
    img.alt = `${account}'s constellation${options.selection?.start ? ': selected connections' : ''}`;
    img.src = nextUrl;
    $('#style-preview').replaceChildren(img);
    if (url) URL.revokeObjectURL(url);
    url = nextUrl; download.href = url; download.download = 'constellation.svg';
    $('#workflow').value = renderWorkflow(isSample ? null : account, options);
    updateSnippet();
    studio?.update(account, options, captured);
    imageViewer?.update(captured, account);
    if (workflowUrl) URL.revokeObjectURL(workflowUrl);
    workflowUrl = URL.createObjectURL(new Blob([$('#workflow').value], { type: 'text/yaml;charset=utf-8' }));
    $('#download-workflow').href = workflowUrl;
  };
  const movedOptions = (repo, pair) => ({ ...options, starPositions: { ...options.starPositions, ...pair.placements, [repo]: pair.star }, labelOffsets: { ...options.labelOffsets, ...pair.offsets } });
  mountLabelEditor(labelEditor, svg, (repo, pair, kind) => {
    const moved = movedOptions(repo, pair);
    starPlacements.set(placementKey, moved.starPositions);
    labelPlacements.set(placementKey, moved.labelOffsets);
    render();
    const target = [...labelEditor.shadowRoot.querySelectorAll(kind === 'star' ? '.star' : '.repo-label')].find(node => node.dataset.repo === repo);
    (kind === 'star' ? target?.parentElement : target)?.focus();
  }, (repo, pair) => renderConstellation(account, repositories, movedOptions(repo, pair)), $('#lock-stars').checked || options.ringAnimation.enabled || options.floatingAnimation.enabled || cameraMoving || liveTilt?.active, options.snapToRings);
  preview.replaceChildren(labelEditor);
  mountGraphExplorer(labelEditor, $('#graph-explorer'), graphSelection, selection => { const previous = graphSelection.start, previousEnd = graphSelection.end; graphSelection = selection; options.selection = selection; exportSelection(); updateNodeColorControls(selection.end || selection.start); if (selection.start && (selection.start !== previous || selection.end !== previousEnd)) workspace?.reveal($('#color-node')); }, { highlight: options.layers?.selection?.visible !== false });
  const eligible = repositories.filter(repo => repo.private !== true && (options.includeForks || !repo.fork));
  const shown = selectRepositories(repositories, options);
  const filterExplanation = explainFilters(repositories, options);
  $('#filter-summary').dataset.explanation = JSON.stringify(filterExplanation);
  const resetFilters = $('#reset-project-filters');
  const emptySelection = repositories.some(repo => repo.private !== true) && !projected.nodes.some(node => !options.hiddenNodes.includes(node.full_name));
  resetFilters.hidden = !emptySelection;
  resetFilters.onclick = () => {
    applyOptions({ ...options, includeRepos: undefined, languages: null, topics: null, showOther: true, includeForks: true, includeArchived: true, minStars: 0, updatedWithin: 0, repoQuery: '', hiddenNodes: [], nodeMode: 'repositories', historicalYear: undefined, timeLapse: undefined, history: { ...options.history, mode: 'current', year: null, timeLapse: { ...options.history?.timeLapse, enabled: false } } });
    render();
  };
  $('#filter-summary').textContent = `${repositories.length} loaded · ${shown.length} included · ${projected.nodes.filter(node => !options.hiddenNodes.includes(node.full_name)).length} rendered · ${Math.max(0, projected.total - projected.nodes.length)} omitted by graph limit. ` + `${shown.length} matching projects from ${options.repoSource === 'pinned' ? `${selected.length} public pinned repositories` : `a pool of ${selected.length}`}.${categoryMode ? ` Showing ${projected.nodes.filter(node => !options.hiddenNodes.includes(node.full_name)).length} of ${projected.total} ${combinedMode ? 'nodes' : options.nodeMode}${projected.total > projected.nodes.length ? combinedMode ? ' (up to 256 nodes, retaining repositories and the most represented categories)' : ' (the 100 most represented categories)' : ''}.` : ''} ${options.repoSource === 'pinned' ? 'Your profile pins define the project pool; language, topic, and fork filters still apply.' : 'Increase the project limit to explore more.'} ${options.languages?.length === 0 || options.topics?.length === 0 ? 'Choose a category or All to show projects.' : ''}`;
  $('#repo-count').textContent = shown.length;
  $('#language-count').textContent = new Set(shown.flatMap(repositoryLanguages)).size;
  $('#star-count').textContent = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(shown.reduce((total, repo) => total + (repo.stargazers_count || 0), 0));
  $('#limit-value').value = options.repoSource === 'pinned' ? 'All pins' : options.maxRepos;
  $('#map-title').textContent = isSample ? 'The sample sky' : options.accountData?.type === 'Organization' ? `${account} · Organization universe${options.organizationUser ? ` · @${options.organizationUser}` : ''}` : `@${account}’s sky`;
  $('#organization-status').textContent = options.accountData?.type === 'Organization' ? `${projected.note || 'Organization universe'} ${options.organizationData?.diagnostic || ''}` : `@${account} · Developer universe`;
  if (labelDiagnostics.length) {
    $('#filter-summary').textContent += ` ${labelDiagnostics.length} labels omitted (hover for reasons).`;
    $('#filter-summary').title = labelDiagnostics.map(item => `${item.node}: ${item.reason}`).join('\n');
  } else $('#filter-summary').title = '';
  if (projected.organization) {
    const kinds = new Set(projected.nodes.map(node => node.nodeKind || 'repository'));
    $('#node-legend').textContent = Object.entries({ repository: 'Project', language: 'Language', topic: 'Topic', contributor: 'Contributor (diamond)', dependency: 'Dependency (hexagon)', era: 'Project group' }).filter(([kind]) => kinds.has(kind)).map(([, label]) => label).join(' · ');
    $('#node-mode-help').textContent = kinds.has('contributor')
      ? 'Projects use the same galaxy layout as personal accounts. Contributor diamonds sit near the projects they contribute to. Lines show observed participation; unscanned projects remain visible.'
      : kinds.has('repository') ? 'Each star is a project, using the same language colors and sizing as personal accounts. Additional project groups summarize the rest of the organization.'
        : 'Each node summarizes projects sharing a language, topic, dependency, or creation group. Size follows the selected mapping, just as in personal views.';
    if (kinds.has('contributor')) $('#relationship-legend').textContent = 'Project participation';
  }
  $('#sample-badge').hidden = !isSample;
  $('#workflow-note').textContent = options.repoSource === 'pinned' ? 'This workflow reads the repository owner’s current public pins on every run using GitHub’s automatic token. No personal token is needed in the workflow.' : 'This workflow generates a constellation for the repository owner, using the settings and CSS shown here.';
  if (!isSample) message(`Showing ${projected.nodes.length} ${options.nodeMode} from ${shown.length} of ${eligible.length} public repositories for @${account}. Using saved data; customization makes no GitHub requests.`);
  if (emptySelection) message(`Loaded ${repositories.length} public repositories for @${account}, but the current filters, history year or node visibility exclude them. Reset project filters to show them.`);
  return true;
}

for (const control of controls) control.addEventListener('input', render);
$('#repo-source').addEventListener('change', () => {
  if (isSample) render(); else loadAccount(account, false, $('#repo-source').value);
});
for (const link of document.querySelectorAll('a[href="#token-help"]')) link.addEventListener('click', () => { $('#token-help').open = true; });
for (const id of ['#arrangement', '#identity-ring', '#node-mode', '#snap-rings']) $(id).addEventListener('input', render);
$('#color-node').addEventListener('change', () => { graphSelection = { start: $('#color-node').value }; render(); });
for (const [id, settings] of [['#node-visible', hiddenNodeSettings], ['#node-label-visible', hiddenLabelSettings]]) {
  $(id).addEventListener('input', () => {
    const hidden = new Set(settings.get(account.toLowerCase()) || []);
    $(id).checked ? hidden.delete($('#color-node').value) : hidden.add($('#color-node').value);
    settings.set(account.toLowerCase(), hidden); render();
  });
}
$('#reset-node-visibility').addEventListener('click', () => {
  hiddenNodeSettings.delete(account.toLowerCase()); hiddenLabelSettings.delete(account.toLowerCase()); render();
});
for (const id of [...['enabled', 'animate', 'horizontal', 'vertical', 'zoom', 'range', 'duration'].map(key => `perspective-${key}`), 'edit-ring', 'animate-floating', 'floating-motion', 'floating-amount', 'floating-duration', ...['motion', 'easing', 'sway'].flatMap(kind => Array.from({ length: 4 }, (_, i) => `ring-${kind}-${i}`)), 'animate-rings', 'link-ring-motion', ...Array.from({ length: 4 }, (_, i) => `ring-speed-${i}`), ...Array.from({ length: 4 }, (_, i) => `ring-direction-${i}`)]) $(`#${id}`).addEventListener('input', render);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', render);
let previousRingRotation = [0, 0, 0, 0];
for (let ring = 0; ring < 4; ring++) $(`#ring-rotation-${ring}`).addEventListener('input', () => {
  const rotation = Array.from({ length: 4 }, (_, i) => Number($(`#ring-rotation-${i}`).value));
  for (const [key, placements] of starPlacements) {
    const [owner, layout] = key.split(':');
    const before = identityPoints(placementAccounts.get(owner) || owner, 256, previousRingRotation);
    const after = identityPoints(placementAccounts.get(owner) || owner, 256, rotation);
    const center = layout === 'compact' ? 126 : 270;
    const spread = layout === 'compact' ? 88 : 192;
    const coordinate = (points, i) => ({ x: Number((450 + (points[i] - 240) * 368 / 172).toFixed(1)), y: Number((center + (points[i + 1] - 240) * spread / 172).toFixed(1)) });
    const moved = { ...placements };
    for (const [id, position] of Object.entries(placements)) {
      for (let i = 0; i < before.length; i += 3) {
        const point = coordinate(before, i);
        if (Math.hypot(point.x - position.x, point.y - position.y) < .2) { moved[id] = coordinate(after, i); break; }
      }
    }
    starPlacements.set(key, moved);
  }
  previousRingRotation = rotation;
  render();
});
$('#color-connections').addEventListener('input', render);
$('#random-node-colors').addEventListener('click', () => {
  nodeColorSettings.set(account.toLowerCase(), { ...nodeColorSettings.get(account.toLowerCase()), ...randomNodeColors(displayedNodes.map(node => node.full_name), seededRandom(`${studio?.read().seed || account}:${Date.now()}`)) });
  render();
});
$('#node-color').addEventListener('input', () => {
  const id = $('#color-node').value;
  if (!id) return;
  nodeColorSettings.set(account.toLowerCase(), { ...nodeColorSettings.get(account.toLowerCase()), [id]: $('#node-color').value });
  render();
});
$('#reset-node-color').addEventListener('click', () => {
  const settings = { ...nodeColorSettings.get(account.toLowerCase()) };
  delete settings[$('#color-node').value]; nodeColorSettings.set(account.toLowerCase(), settings); render();
});
$('#reset-node-colors').addEventListener('click', () => { nodeColorSettings.delete(account.toLowerCase()); render(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => updateNodeColorControls());
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  filterSelection[button.dataset.filter] = button.dataset.selection === 'all' ? null : []; render();
});
async function loadAccount(nextAccount, refresh = false, source = $('#repo-source').value, explicitConfig, { requireVisibleNodes = false } = {}) {
  const changedAccount = nextAccount.toLowerCase() !== account.toLowerCase();
  const restoring = explicitConfig || (nextAccount.toLowerCase() !== account.toLowerCase() ? studio?.store.draft(nextAccount) : null);
  if (restoring) source = restoring.options.repoSource || 'all';
  if (loading) return;
  loading = true;
  $('#repo-source').disabled = true;
  for (const button of [form.querySelector('button'), $('#load-projects'), $('#refresh-data'), $('#reset-project-filters')]) button.disabled = true;
  preview.setAttribute('aria-busy', 'true');
  message('Loading project data… You can keep adjusting styles.');
  try {
    if (source === 'pinned' && (!proxyBase || !localAuth)) {
      $('#token-help').open = true;
      throw new Error('Pinned previews require a personal access token. Create one using the token setup below, save GH_TOKEN in the local project .env, and restart npm run preview. The daily workflow uses GitHub’s automatic token.');
    }
    // Fetch languages for the configuration that will actually be applied. A new
    // account without a draft must not inherit the previous account's filters.
    const loadOptions = restoring?.options || (changedAccount ? presetOptions('project-map', { accountType: $('#account-mode').value === 'organization' ? 'organization' : 'auto' }) : { ...importedOptions, ...studio?.read(), maxRepos: Number($('#max-repos').value), includeForks: $('#forks').checked });
    const nextRepositories = await data.load(nextAccount, { ...loadOptions, repoSource: source }, {
      refresh, onProgress: (done, total) => message(`Loading language data… ${done}/${total}`),
    });
    if (!$('#output-repository').value || [ `${account}/${account}`, `${account}/.github` ].includes($('#output-repository').value)) $('#output-repository').value = data.profile(nextAccount)?.type === 'Organization' ? `${nextAccount}/.github` : `${nextAccount}/${nextAccount}`;
    studio?.flush();
    account = nextAccount;
    repositories = nextRepositories;
    loadedSource = source;
    isSample = false;
    if (restoring || changedAccount) applyOptions(loadOptions);
    form.elements.username.value = loadOptions.organizationUser || account;
    $('#organization-account').value = loadOptions.organizationUser ? account : '';
    $('#account-mode').value = loadOptions.organizationUser ? 'paired' : data.profile(account)?.type === 'Organization' ? 'organization' : 'auto';
    syncAccountMode();
    $('#repo-source').value = source;
    $('#refresh-data').hidden = false;
    if (!render({ requireVisibleNodes })) throw new Error('This configuration could not render a populated graph.');
    enterStudio();
    return true;
  } catch (error) {
    if (!isSample) $('#repo-source').value = loadedSource;
    let detail = error instanceof TypeError ? 'Couldn’t reach GitHub. Check your connection and try again.' : error.message;
    if (/request limit reached/i.test(detail) && !/token access denied/i.test(detail)) detail = localAuth
      ? 'GitHub’s limit for your local token has been reached. Try again after the limit resets.'
      : 'GitHub’s public request limit has been reached. Try later, or run the local preview with a token in .env.';
    if (localAuth && /\(401\)/.test(detail)) detail = 'GitHub rejected your local token. Update .env and restart npm run preview.';
    message(`${detail} The previous image and exports are retained. Successful lookups are saved for your next attempt.`, true);
  } finally {
    loading = false;
    $('#repo-source').disabled = false;
    for (const button of [form.querySelector('button'), $('#load-projects'), $('#refresh-data'), $('#reset-project-filters')]) button.disabled = false;
    preview.setAttribute('aria-busy', 'false');
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const name = username(form.elements.username.value), organization = $('#organization-account').value.trim(), mode = $('#account-mode').value;
    if (mode === 'organization') {
      const draft = studio.store.draft(name);
      const options = draft?.options?.accountType === 'organization' && !draft.options.organizationUser ? draft.options : presetOptions('organization-projects');
      loadAccount(name, false, 'all', { account: name, options });
    }
    else if (mode === 'paired') {
      if (!organization) throw new Error('Enter the organization to connect with this user.');
      const settings = studio.read();
      const discovery = settings.organization.contributors.enabled ? settings.organization : presetOptions('organization-community').organization;
      loadAccount(username(organization), false, 'all', { account: username(organization), options: { organizationScope: settings.organizationScope, organization: discovery, accountType: 'organization', organizationUser: name, organizationView: 'collaboration', arrangement: 'community-galaxy', maxRepos: 100, showOther: true } });
    }
    else loadAccount(name);
  }
  catch (error) { message(error.message, true); }
});
$('#load-projects').addEventListener('click', () => loadAccount(account));
$('#refresh-data').addEventListener('click', () => loadAccount(account, true));

function updateSnippet() {
  for (const id of ['#install-workflow', '#create-profile', '#run-workflow']) {
    $(id).hidden = true;
    $(id).removeAttribute('href');
  }
  try {
    $('#snippet').value = readmeSnippet(isSample ? null : account, $('#output-repository').value);
    $('#copy-markdown').disabled = false;
    $('#repository-help').textContent = 'Image links use this repository’s output branch. Save and run the workflow in that same repository.';
    const target = $('#output-repository').value.trim() || (isSample ? '' : `${account}/${account}`);
    if (target) {
      const links = installationLinks(target, $('#workflow').value);
      for (const [id, link] of [['#install-workflow', links.install], ['#create-profile', links.create], ['#run-workflow', links.actions]]) {
        if (link) { $(id).href = link; $(id).hidden = false; }
      }
      if (!links.install) $('#repository-help').textContent = 'Your settings are too large for a prefilled GitHub link. Download or copy the workflow below and save it in the selected repository.';
    }
  } catch (error) {
    $('#snippet').value = '';
    $('#copy-markdown').disabled = true;
    $('#repository-help').textContent = error.message;
  }
}
$('#output-repository').addEventListener('input', updateSnippet);

$('#copy-markdown').addEventListener('click', async () => {
  $('#snippet-panel').hidden = false;
  try {
    await navigator.clipboard.writeText($('#snippet').value);
    message('README snippet copied. Run the exported workflow in the selected repository to publish constellation.svg on its output branch.');
  } catch {
    $('#snippet').focus();
    $('#snippet').select();
    message('Select and copy the README snippet below. Run the exported workflow to publish constellation.svg on the output branch.');
  }
});
$('#reset-css').addEventListener('click', () => { $('#custom-css').value = ''; render(); });
$('#show-labels').addEventListener('input', () => { visualStyle.labels = $('#show-labels').checked; render(); });
$('#lock-stars').addEventListener('input', render);
$('#reset-stars').addEventListener('click', () => {
  const key = `${account.toLowerCase()}:${$('#layout').value}:${$('#arrangement').value}`;
  starPlacements.delete(key);
  labelPlacements.delete(key);
  render();
});
$('#reset-visual').addEventListener('click', () => { visualStyle = defaultVisualStyle(); buildVisualControls(); render(); });
$('#copy-workflow').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#workflow').value);
    message('Workflow copied. Save it as .github/workflows/constellation.yml in your README repository.');
  } catch {
    $('#workflow').focus();
    $('#workflow').select();
    message('Select and copy the workflow. Save it as .github/workflows/constellation.yml.');
  }
});
function applyOptions(options) {
  importedOptions = { ...options };
  restoreForm(options); studio.restore(options);
  filterSelection.languages = options.languages ?? null; filterSelection.topics = options.topics ?? null;
  visualStyle = options.visualStyle || defaultVisualStyle();
  const preset = visualThemes[options.visualTheme || options.theme];
  if (!options.visualStyle && preset) {
    const palettes = themePalettes(preset);
    visualStyle.light = palettes.light; visualStyle.dark = palettes.dark; visualStyle.glow = preset.glow; visualStyle.secondaryOpacity = preset.opacity;
  }
  if (!options.visualStyle && options.colors) { Object.assign(visualStyle.light, options.colors); Object.assign(visualStyle.dark, options.colors); }
  $('#custom-css').value = options.customCSS ?? options.css ?? '';
  buildVisualControls();
  const key = account.toLowerCase();
  nodeColorSettings.set(key, options.nodeColors || {}); hiddenNodeSettings.set(key, new Set(options.hiddenNodes || [])); hiddenLabelSettings.set(key, new Set(options.hiddenLabels || []));
  for (const map of [starPlacements, labelPlacements]) for (const placementKey of map.keys()) if (placementKey.startsWith(`${key}:`)) map.delete(placementKey);
  const placementKey = `${key}:${exportSettings(options).layout || $('#layout').value}:${$('#arrangement').value}`;
  starPlacements.set(placementKey, options.starPositions || {}); labelPlacements.set(placementKey, options.labelOffsets || {});
  previousRingRotation = options.ringRotations || Array(4).fill(options.ringRotation || 0);
  graphSelection = options.selection || {};
}
for (const [value, text] of [['galaxy', 'Galaxy · language clusters'], ['solar-system', 'Solar System · major repositories']]) {
  const option = document.createElement('option'); option.value = value; option.textContent = text; option.disabled = !rustAvailable; $('#arrangement').append(option);
}
for (const [value, label] of [['community-galaxy', 'Community galaxy'], ['collaboration-gravity', 'Collaboration gravity'], ['era-rings', 'Era rings']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; $('#arrangement').append(option); }
for (const [value, label] of [['contributors', 'Contributors'], ['ecosystem', 'Full ecosystem'], ['organization-community', 'Organization community'], ['dependencies', 'Dependencies']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; $('#node-mode').append(option); }
buildVisualControls();
restoreForm = createFormRestorer(document);
const designHost = document.createElement('div'); designHost.className = 'design-controls'; $('.stats').before(designHost);
studio = mountStudioDesign({ host: designHost, changed: () => { try { render(); } catch (error) { message(error.message, true); } },
  reveal: id => { const element = document.getElementById(id); if (element) { workspace?.reveal(element); element.focus(); } },
  hasMatchingNodes: options => canRenderPreview(repositories, { ...options, accountData: data.profile(account), organizationData: data.organization(account) }),
  repositoryPool: () => repositories,
  selectedRepositories: options => selectRepositories(repositories, options),
  repositoryCandidates: options => selectRepositories(repositories, { ...options, includeRepos: undefined, maxRepos: 100 }),
  apply: async (config, { loadOrganization = false, loadPresetData = false, requireVisibleNodes = false, fallback } = {}) => {
    if (loading) throw new Error('Wait for the account to finish loading before applying a preset.');
    const previous = { account, repositories, loadedSource, isSample };
    const restore = () => {
      if (!fallback) return;
      ({ account, repositories, loadedSource, isSample } = previous);
      applyOptions(fallback.options);
      render();
    };
    try {
      const missingPresetData = loadPresetData && !isSample && data.profile(account)?.type !== 'Organization' &&
        selectRepositoryPool(repositories, config.options).some(repo => !repo.languages);
      if (config.account.toLowerCase() !== account.toLowerCase() || (!isSample && ((config.options.repoSource || 'all') !== loadedSource || loadOrganization || missingPresetData))) {
        if (!await loadAccount(config.account, false, config.options.repoSource || 'all', config, { requireVisibleNodes })) throw new Error($('#status').textContent || 'Could not apply this configuration. The previous design is restored.');
        return true;
      }
      applyOptions(config.options);
      const applied = render({ requireVisibleNodes });
      if (!applied && requireVisibleNodes) { restore(); return false; }
      return applied;
    } catch (error) {
      restore();
      throw error;
    }
  },
  theme: id => {
    const preset = visualThemes[id];
    visualStyle = { ...visualStyle, ...themePalettes(preset), glow: preset.glow, secondaryOpacity: preset.opacity };
    for (const [key, value] of Object.entries({ nodeShape: preset.nodeShape || 'circle', effect: preset.effect || 'none', nodeColorMode: preset.nodeColorMode || 'custom' })) $(`#design-${key}`).value = value;
    if (preset.animate !== undefined) $('#animate').checked = preset.animate;
    buildVisualControls(); render();
  }, message,
});
$('#load-organization').addEventListener('click', () => loadAccount(account));
if (document.documentElement.dataset.entry === 'studio') enterStudio();
$('#open-studio').disabled = false;
$('#open-studio').addEventListener('click', () => { enterStudio(); $('#username').focus(); });
imageViewer = mountImageViewer($('.design-launcher'));
const initialDraft = studio.store.draft(account);
if (initialDraft) applyOptions(initialDraft.options);
liveTilt = mountLiveTilt({ surface: preview, target: labelEditor, mode: $('#live-tilt-mode'), enable: $('#enable-device-tilt'), recenter: $('#recenter-device-tilt'), status: $('#live-tilt-status'), onChange: render });
render();

// Remember a successfully initialized visit, even if the visitor stays on the landing page.
try { localStorage.setItem('constellation:visited', '1'); } catch {}
const initialShare = studio.shared();
if (initialShare) {
  if (initialShare.account === account) { applyOptions(initialShare.options); render(); }
  else { form.elements.username.value = initialShare.account; loadAccount(initialShare.account, false, initialShare.options.repoSource || 'all', initialShare); }
}
