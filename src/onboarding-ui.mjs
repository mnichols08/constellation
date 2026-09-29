import { mountRepositoryPicker } from './repository-picker.mjs';
import { defaultIntent, choicesFor, validateIntent } from './onboarding-model.mjs';
import { recommendProjects } from './onboarding-model.mjs';

export function mountOnboarding(host, { repositories, account, initial, year, findRepositories, generate, customize, useDesign, save }) {
  let intent = initial || defaultIntent(repositories()), step = 0, busy = false, picker;
  const heading = document.createElement('h2'); heading.tabIndex = -1;
  const progress = document.createElement('p');
  const body = document.createElement('div');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.id = 'guided-status';
  const actions = document.createElement('div'); actions.className = 'guided-actions';
  host.replaceChildren(progress, heading, body, status, actions);
  const button = (parent, label, run) => { const element = document.createElement('button'); element.type = 'button'; element.textContent = label; element.addEventListener('click', run); parent.append(element); return element; };
  function radios(title, key, entries, parent = body) {
    const field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = title; field.append(legend);
    for (const [value, text] of entries) {
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'radio'; input.name = `guided-${key}`; input.value = value; input.checked = intent[key] === value;
      input.addEventListener('change', () => { intent[key] = value; }); label.append(input, document.createTextNode(text)); field.append(label);
    }
    parent.append(field);
  }
  const available = () => choicesFor(repositories(), intent.projects, year);
  const steps = () => ['projects', 'languages', ...(available().topics.length ? ['topics'] : []), 'activity', ...(available().history.eligible ? ['history'] : []), 'vibe'];
  function filters(kind) {
    const names = available()[kind];
    const note = document.createElement('p'); note.textContent = kind === 'languages' ? 'Highlight technologies across your selected projects. None uses the existing empty language filter and may leave no visible projects.' : 'Focus on projects with these topics. Skip keeps every topic.'; body.append(note);
    const choices = document.createElement('div'); choices.className = 'guided-actions'; body.append(choices);
    for (const [label, value] of [['Recommended', null], ['All', null], [kind === 'topics' ? 'Skip' : 'None', kind === 'topics' ? null : []]]) button(choices, label, () => {
      intent[kind] = value;
      if (kind === 'topics' && label === 'Skip') { save(intent); step++; }
      draw();
    });
    const field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = 'Choose specific ' + kind; field.append(legend);
    for (const name of names) { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = intent[kind] === null || intent[kind].includes(name); input.addEventListener('change', () => { const selected = new Set(intent[kind] ?? names); input.checked ? selected.add(name) : selected.delete(name); intent[kind] = [...selected].sort(); }); label.append(input, document.createTextNode(name)); field.append(label); } body.append(field);
  }
  function draw() {
    host.hidden = false; document.documentElement.dataset.entry = 'guided';
    const list = steps(); step = Math.min(step, list.length - 1); const current = list[step];
    progress.textContent = `@${account} · Step ${step + 1} of ${list.length}`;
    heading.textContent = { projects: 'Which projects matter?', languages: 'Which technologies matter?', topics: 'What do your projects explore?', activity: 'Show your activity?', history: 'Show your project history?', vibe: 'What kind of feel do you want?' }[current];
    body.replaceChildren(); actions.replaceChildren(); status.textContent = '';
    if (current === 'projects') {
      const note = document.createElement('p'); note.textContent = 'Recommended balances recent work, popularity, project detail and original projects. You can change every selection.'; body.append(note);
      const shortcuts = document.createElement('div'); shortcuts.className = 'guided-actions'; body.append(shortcuts);
      for (const [mode, label] of [['recommended', 'Recommended'], ['recent', 'Recently active'], ['popular', 'Most popular']]) button(shortcuts, label, () => picker.select(recommendProjects(repositories(), mode)));
      const pool = document.createElement('div'); body.append(pool);
      picker = mountRepositoryPicker(pool, { prefix: 'guided-', guided: true, apply() {}, message: text => { status.textContent = text; }, findRepositories });
      picker.update(account, repositories(), { includeRepos: intent.projects }, repositories().filter(repo => intent.projects.includes(repo.full_name)));
    }
    if (current === 'languages' || current === 'topics') filters(current);
    if (current === 'activity') radios('Use real public activity', 'activity', [['surprise', 'Yes — surprise me'], ['asteroids', 'Yes — commit asteroids'], ['orbit', 'Yes — contribution orbit'], ['recent', 'Yes — recent activity'], ['subtle', 'Yes — keep it subtle'], ['none', 'No activity']]);
    if (current === 'history') { radios('Choose a view', 'history', [['current', 'Current projects'], ['history', 'Project history'], ['3d', '3D Temporal Universe'], ['surprise', 'Surprise me']]); const note = document.createElement('p'); note.textContent = `History begins in ${available().history.firstYear}. Retrospective layers use creation dates and current metadata, not historical star counts.`; body.append(note); }
    if (current === 'vibe') { radios('Feel', 'vibe', [['cosmic', 'Cosmic'], ['clean', 'Clean'], ['technical', 'Technical'], ['classic', 'Classic'], ['surprise', 'Surprise me']]); radios('Motion', 'motion', [['automatic', 'Automatic'], ['still', 'Still']]); }
    if (step) button(actions, 'Back', () => { step--; draw(); });
    button(actions, step === list.length - 1 ? 'Generate my constellation' : 'Continue', async () => {
      if (busy) return;
      if (current === 'projects') {
        if (picker.busy()) { status.textContent = 'Wait for repository discovery to finish.'; return; }
        intent.projects = picker.selection();
        const next = available();
        for (const kind of ['languages', 'topics']) if (intent[kind]?.length) { const matching = intent[kind].filter(name => next[kind].includes(name)); intent[kind] = matching.length ? matching : null; }
        if (!next.topics.length) intent.topics = null;
        if (!next.history.eligible) intent.history = 'current';
      }
      if (current === 'topics' && !intent.topics?.length) intent.topics = null;
      try { intent = validateIntent(intent); } catch (error) { status.textContent = error.message; return; }
      save(intent);
      if (step < steps().length - 1) { step++; draw(); } else await run();
    });
    button(actions, 'Open full Studio', customize);
    heading.focus();
  }
  async function run(refreshActivity = false) {
    if (busy) return; busy = true; host.setAttribute('aria-busy', 'true');
    for (const button of host.querySelectorAll('button')) button.disabled = true;
    status.textContent = 'Creating your constellation…';
    try { const diagnostic = await generate(intent, refreshActivity === true); result(diagnostic); }
    catch (error) { status.textContent = error.message; }
    finally { busy = false; host.removeAttribute('aria-busy'); for (const button of host.querySelectorAll('button')) button.disabled = false; }
  }
  function result(diagnostic = '') {
    document.documentElement.dataset.entry = 'result';
    progress.textContent = `@${account}`; heading.textContent = 'Your constellation is ready'; body.replaceChildren(); actions.replaceChildren();
    status.textContent = diagnostic || 'Your choices are saved. Try another interpretation or make this one yours.';
    button(actions, 'Generate another', run); button(actions, 'Use this design', useDesign); button(actions, 'Customize', customize);
    button(actions, 'Edit answers', () => { step = 0; draw(); });
    if (diagnostic) button(actions, 'Retry activity', () => run(true));
    heading.focus();
  }
  draw();
  return { edit() { step = 0; draw(); } };
}
