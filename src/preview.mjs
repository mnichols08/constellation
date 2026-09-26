import { username, selectRepositoryPool, selectRepositories, repositoryLanguages, renderConstellation } from './constellation.mjs';
import { readmeSnippet, renderWorkflow, installationLinks } from './export.mjs';
import { defaultVisualStyle, visualCSS } from './visual-style.mjs';

import { createPreviewData, createPreviewFetch } from './preview-data.mjs';

let storage;
try { storage = window.sessionStorage; } catch {}
const proxyBase = document.querySelector('meta[name="constellation-api"]')?.content;
const localAuth = document.querySelector('meta[name="constellation-auth"]')?.content === 'authenticated';
const data = createPreviewData({ storage, fetchImpl: createPreviewFetch({ proxyBase }) });
let loading = false;
const $ = selector => document.querySelector(selector);
if (proxyBase) $('.form-note').textContent = localAuth
  ? 'Using your local GitHub token. Loaded data is retained; customization makes no additional GitHub requests.'
  : 'No local GitHub token found. Add GH_TOKEN to .env and restart npm run preview to authenticate. Loaded data is retained while customizing.';
const form = $('#account-form');
const status = $('#status');
const preview = $('#preview');
const download = $('.download');
const controls = ['#layout', '#max-repos', '#animate', '#forks', '#bridges', '#connection-density', '#connection-basis', '#show-other', '#custom-css'].map($);
const filterSelection = { languages: null, topics: null };
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
let url;
let workflowUrl;


function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

function render() {
  const generatedCSS = visualCSS(visualStyle);
  $('#generated-css').value = generatedCSS;
  const options = { theme: 'auto', layout: $('#layout').value, maxRepos: Number($('#max-repos').value), animate: $('#animate').checked, includeForks: $('#forks').checked, bridges: $('#bridges').checked, connectionDensity: $('#connection-density').value, connectionBasis: $('#connection-basis').value, languages: filterSelection.languages, topics: filterSelection.topics, showOther: $('#show-other').checked, css: `${generatedCSS}\n${$('#custom-css').value}` };
  const selected = selectRepositoryPool(repositories, options);
  const missing = selected.filter(repo => !repo.languages).length;
  $('#limit-value').value = options.maxRepos;
  $('#load-projects').hidden = isSample || !missing;
  $('#load-projects').textContent = `Load data for ${missing} more projects`;
  $('#load-projects').disabled = loading;
  if (missing) {
    message(`${missing} projects need language data. Click Load data to apply this project pool. The previous image and exports are retained; no requests are made while customizing.`);
    return;
  }
  const svg = renderConstellation(account, repositories, { ...options, generatedAt: new Date().toISOString() });
  buildGraphFilters(selectRepositoryPool(repositories, options));
  $('#relationship-legend').textContent = options.connectionBasis === 'both' ? 'Languages & topics' : options.connectionBasis === 'topics' ? 'Shared topic' : 'Shared language';
  const nextUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const img = new Image();
  img.alt = `${isSample ? 'Sample constellation' : `@${account}’s constellation`}: public repositories connected by ${options.connectionBasis === 'both' ? 'shared languages and topics' : `shared ${options.connectionBasis}`}. Larger stars represent more GitHub stars.`;
  img.src = nextUrl;
  preview.replaceChildren(img);
  $('#style-preview').replaceChildren(img.cloneNode());
  if (url) URL.revokeObjectURL(url);
  url = nextUrl;
  download.href = url;
  download.download = 'constellation.svg';
  const eligible = repositories.filter(repo => repo.private !== true && (options.includeForks || !repo.fork));
  const shown = selectRepositories(repositories, options);
  $('#filter-summary').textContent = `${shown.length} matching projects from a pool of ${selected.length}. Increase the project limit to explore more. ${options.languages?.length === 0 || options.topics?.length === 0 ? 'Choose a category or All to show projects.' : ''}`;
  $('#repo-count').textContent = shown.length;
  $('#language-count').textContent = new Set(shown.flatMap(repositoryLanguages)).size;
  $('#star-count').textContent = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(shown.reduce((total, repo) => total + (repo.stargazers_count || 0), 0));
  $('#limit-value').value = options.maxRepos;
  $('#map-title').textContent = isSample ? 'The sample sky' : `@${account}’s sky`;
  $('#sample-badge').hidden = !isSample;
  $('#workflow').value = renderWorkflow(isSample ? null : account, options);
  updateSnippet();
  if (workflowUrl) URL.revokeObjectURL(workflowUrl);
  workflowUrl = URL.createObjectURL(new Blob([$('#workflow').value], { type: 'text/yaml;charset=utf-8' }));
  $('#download-workflow').href = workflowUrl;
  $('#workflow-note').textContent = 'This workflow generates a constellation for the repository owner, using the settings and CSS shown here.';
  if (!isSample) message(`Showing ${shown.length} of ${eligible.length} public repositories for @${account}. Using saved data; customization makes no GitHub requests. Connections use selected ${options.connectionBasis === 'both' ? 'languages and topics' : options.connectionBasis}.`);
}

for (const control of controls) control.addEventListener('input', render);
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  filterSelection[button.dataset.filter] = button.dataset.selection === 'all' ? null : []; render();
});
async function loadAccount(nextAccount, refresh = false) {
  if (loading) return;
  loading = true;
  for (const button of [form.querySelector('button'), $('#load-projects'), $('#refresh-data')]) button.disabled = true;
  preview.setAttribute('aria-busy', 'true');
  message('Loading project data… You can keep adjusting styles.');
  try {
    const nextRepositories = await data.load(nextAccount, { maxRepos: Number($('#max-repos').value), includeForks: $('#forks').checked }, {
      refresh, onProgress: (done, total) => message(`Loading language data… ${done}/${total}`),
    });
    if (!$('#output-repository').value || $('#output-repository').value === `${account}/${account}`) $('#output-repository').value = `${nextAccount}/${nextAccount}`;
    account = nextAccount;
    repositories = nextRepositories;
    isSample = false;
    $('#refresh-data').hidden = false;
    render();
  } catch (error) {
    let detail = error instanceof TypeError ? 'Couldn’t reach GitHub. Check your connection and try again.' : error.message;
    if (/request limit reached/i.test(detail)) detail = localAuth
      ? 'GitHub’s limit for your local token has been reached. Try again after the limit resets.'
      : 'GitHub’s public request limit has been reached. Try later, or run the local preview with a token in .env.';
    if (localAuth && /\(401\)/.test(detail)) detail = 'GitHub rejected your local token. Update .env and restart npm run preview.';
    message(`${detail} The previous image and exports are retained. Successful lookups are saved for your next attempt.`, true);
  } finally {
    loading = false;
    for (const button of [form.querySelector('button'), $('#load-projects'), $('#refresh-data')]) button.disabled = false;
    preview.setAttribute('aria-busy', 'false');
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  try { loadAccount(username(form.elements.username.value)); }
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
buildVisualControls();
render();
