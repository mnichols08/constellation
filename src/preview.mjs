import { username, fetchRepositories, fetchRepositoryLanguages, selectRepositoryPool, selectRepositories, repositoryLanguages, renderConstellation } from './constellation.mjs';
import { readmeSnippet, renderWorkflow } from './export.mjs';
import { defaultVisualStyle, visualCSS } from './visual-style.mjs';

const $ = selector => document.querySelector(selector);
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
const colorLabels = { background: 'Sky', foreground: 'Labels & dust', accent: 'Paths & credit', line: 'Secondary links', star: 'Stars' };
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
let renderVersion = 0;
const languageCache = new Map();

function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}

async function render() {
  const version = ++renderVersion;
  const generatedCSS = visualCSS(visualStyle);
  $('#generated-css').value = generatedCSS;
  const options = { theme: 'auto', layout: $('#layout').value, maxRepos: Number($('#max-repos').value), animate: $('#animate').checked, includeForks: $('#forks').checked, bridges: $('#bridges').checked, connectionDensity: $('#connection-density').value, connectionBasis: $('#connection-basis').value, languages: filterSelection.languages, topics: filterSelection.topics, showOther: $('#show-other').checked, css: `${generatedCSS}\n${$('#custom-css').value}` };
  const source = repositories;
  const selected = selectRepositoryPool(source, options);
  try {
    if (selected.some(repo => !repo.languages)) {
      preview.setAttribute('aria-busy', 'true');
      const enriched = await fetchRepositoryLanguages(selected, { cache: languageCache, onProgress: (done, total) => {
        if (version === renderVersion) message(`Loading full language breakdowns… ${done}/${total}`);
      }});
      if (version !== renderVersion || source !== repositories) return;
      const byName = new Map(enriched.map(repo => [repo.full_name, repo]));
      repositories = source.map(repo => byName.get(repo.full_name) || repo);
    }
  } catch (error) {
    if (version === renderVersion) message(`${error.message} The previous map and exports are retained.`, true);
    return;
  } finally {
    if (version === renderVersion) preview.setAttribute('aria-busy', 'false');
  }
  const svg = renderConstellation(account, repositories, options);
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
  $('#snippet').value = readmeSnippet(isSample ? null : account);
  $('#workflow').value = renderWorkflow(isSample ? null : account, options);
  if (workflowUrl) URL.revokeObjectURL(workflowUrl);
  workflowUrl = URL.createObjectURL(new Blob([$('#workflow').value], { type: 'text/yaml;charset=utf-8' }));
  $('#download-workflow').href = workflowUrl;
  $('#workflow-note').textContent = isSample ? 'The sample uses your repository owner when the workflow runs.' : `This workflow generates @${account}’s constellation with the settings shown here.`;
  if (!isSample) message(`Showing ${shown.length} of ${eligible.length} public repositories for @${account}. Connections use selected ${options.connectionBasis === 'both' ? 'languages and topics' : options.connectionBasis}.`);
}

for (const control of controls) control.addEventListener('input', render);
for (const button of document.querySelectorAll('[data-filter]')) button.addEventListener('click', () => {
  filterSelection[button.dataset.filter] = button.dataset.selection === 'all' ? null : []; render();
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  preview.setAttribute('aria-busy', 'true');
  message('Looking for your stars…');
  try {
    const nextAccount = username(form.elements.username.value);
    const listed = await fetchRepositories(nextAccount);
    const enriched = await fetchRepositoryLanguages(selectRepositoryPool(listed, { maxRepos: Number($('#max-repos').value), includeForks: $('#forks').checked }), {
      cache: languageCache, onProgress: (done, total) => message(`Loading full language breakdowns… ${done}/${total}`),
    });
    const byName = new Map(enriched.map(repo => [repo.full_name, repo]));
    const nextRepositories = listed.map(repo => byName.get(repo.full_name) || repo);
    account = nextAccount;
    repositories = nextRepositories;
    isSample = false;
    await render();
  } catch (error) {
    message(error instanceof TypeError ? 'Couldn’t reach GitHub. Check your connection and try again.' : error.message, true);
  } finally {
    button.disabled = false;
    preview.setAttribute('aria-busy', 'false');
  }
});

$('#copy-markdown').addEventListener('click', async () => {
  $('#snippet-panel').hidden = false;
  try {
    await navigator.clipboard.writeText($('#snippet').value);
    message('README snippet copied. Save your downloaded SVG as dist/constellation.svg in your repository.');
  } catch {
    $('#snippet').focus();
    $('#snippet').select();
    message('Select and copy the README snippet below. Save your downloaded SVG as dist/constellation.svg.');
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
