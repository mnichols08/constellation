import { historyOptions } from './settings.mjs';
export function mountStudioHistory(host, changed) {
  const details = document.createElement('details'); details.className = 'control-section';
  const summary = document.createElement('summary'); summary.textContent = 'History & evolution';
  const body = document.createElement('div'); body.className = 'control-section-body'; details.append(summary, body); host.append(details);
  let settings = historyOptions(), end = new Date().getUTCFullYear();
  const controls = new Map();
  const field = (key, title, choices, type = 'checkbox') => {
    const label = document.createElement('label'); label.textContent = title;
    const input = document.createElement(choices ? 'select' : 'input'); input.id = `history-${key}`; label.htmlFor = input.id;
    if (choices) for (const [value, text] of choices.map(value => Array.isArray(value) ? value : [value, value])) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option);
    } else input.type = type;
    body.append(label, input); controls.set(key, input);
    input.addEventListener('input', () => { sync(); changed(); }); return input;
  };
  const mode = field('mode', 'History mode', [['current', 'Current'], ['historical', 'Historical year'], ['time-lapse', 'Time-lapse']]);
  const year = field('year', 'Historical year', null, 'range'); year.min = '2008'; year.max = String(end); year.step = '1';
  const yearText = document.createElement('output'); yearText.htmlFor = year.id; body.append(yearText);
  const orbit = field('orbit', 'Contribution orbit');
  const comet = field('comet', 'Contribution streak comet');
  const cometNote = document.createElement('p'); cometNote.className = 'export-note'; cometNote.textContent = 'Grow a comet with consecutive days of public activity. A completed UTC day off turns it into a burst. Private contributions are not included.'; body.append(cometNote);
  const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = 'Replay comet animation'; replay.addEventListener('click', () => changed()); body.append(replay);
  const orbitStyle = field('orbit-style', 'Orbit style', ['segments', 'dots', 'pulse-ring']);
  const language = field('language', 'Language evolution', [['off', 'Off'], ['rings', 'Rings'], ['timeline', 'Timeline'], ['trails', 'Trails'], ['eras', 'Eras']]);
  const ages = field('ages', 'Stellar ages');
  const foreign = field('foreign', 'Foreign galaxies');
  const minimum = field('minimum', 'Minimum contribution', ['pr', 'merged-pr', 'code', 'issue', 'any']);
  const lapse = field('lapse', 'Time-lapse mode', ['grow', 'crossfade', 'orbit']);
  const duration = field('duration', 'Duration in seconds', null, 'range'); duration.min = '8'; duration.max = '30'; duration.step = '1';
  const loop = field('loop', 'Loop');
  const note = document.createElement('p'); note.className = 'export-note'; note.textContent = 'Historical views use surviving projects and current language metadata. Public-event history is partial; gaps are unknown. Timeline changes use loaded data.'; body.append(note);
  function visible(input, show) { input.hidden = !show; input.previousElementSibling.hidden = !show; }
  function sync() {
    cometNote.hidden = replay.hidden = !comet.checked;
    visible(year, mode.value === 'historical'); yearText.hidden = mode.value !== 'historical'; yearText.value = year.value;
    visible(orbitStyle, orbit.checked); visible(minimum, foreign.checked);
    for (const input of [lapse, duration, loop]) visible(input, mode.value === 'time-lapse');
  }
  function restore(options) {
    settings = historyOptions(options);
    mode.value = settings.history.timeLapse.enabled ? 'time-lapse' : settings.history.mode;
    year.value = String(settings.history.year || end);
    orbit.checked = settings.contributionOrbit.enabled; orbitStyle.value = settings.contributionOrbit.style;
    comet.checked = settings.contributionComet.enabled;
    language.value = settings.languageEvolution.enabled ? settings.languageEvolution.style : 'off';
    ages.checked = settings.stellarAges.enabled; foreign.checked = settings.foreignGalaxies.enabled; minimum.value = settings.foreignGalaxies.minimumContribution;
    lapse.value = settings.history.timeLapse.mode; duration.value = String(settings.history.timeLapse.duration); loop.checked = settings.history.timeLapse.loop; sync();
  }
  restore({});
  return {
    restore,
    bounds: () => ({ firstYear: Number(year.min), year: Number(year.max) }),
    read: () => ({ ...settings, contributionComet: { enabled: comet.checked }, historicalYear: undefined, timeLapse: undefined, timeLapseMode: undefined, timeLapseDuration: undefined, languageEvolutionStyle: undefined, history: { ...settings.history, mode: mode.value, year: mode.value === 'historical' ? Number(year.value) : null, timeLapse: { ...settings.history.timeLapse, enabled: mode.value === 'time-lapse', mode: lapse.value, duration: Number(duration.value), loop: loop.checked } }, contributionOrbit: { ...settings.contributionOrbit, enabled: orbit.checked, style: orbitStyle.value }, languageEvolution: { ...settings.languageEvolution, enabled: language.value !== 'off', style: language.value === 'off' ? settings.languageEvolution.style : language.value }, stellarAges: { ...settings.stellarAges, enabled: ages.checked }, foreignGalaxies: { ...settings.foreignGalaxies, enabled: foreign.checked, minimumContribution: minimum.value } }),
    range(repos, generatedAt) {
      end = new Date(generatedAt).getUTCFullYear();
      const years = repos.filter(repo => repo.private !== true).map(repo => new Date(repo.created_at).getUTCFullYear()).filter(Number.isFinite);
      year.min = String(Math.min(end, ...years)); year.max = String(end); sync();
    },
  };
}
