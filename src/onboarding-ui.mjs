import { mountRepositoryPicker } from './repository-picker.mjs';
import { defaultIntent, choicesFor, validateIntent } from './onboarding-model.mjs';
import { recommendProjects } from './onboarding-model.mjs';

export function mountOnboarding(host, { repositories, account, profile, initial, year, findRepositories, loadPinned, prepareProjects, generate, customize, useDesign, save }) {
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
  const steps = () => ['projects', 'relationships', 'activity', 'universe'];
  function filters(kind) {
    const names = available()[kind];
    const note = document.createElement('p'); note.textContent = kind === 'languages' ? 'Highlight technologies across your selected projects. None uses the existing empty language filter and may leave no visible projects.' : 'Focus on projects with these topics. Skip keeps every topic.'; body.append(note);
    const choices = document.createElement('div'); choices.className = 'guided-actions'; body.append(choices);
    for (const [label, value] of [['Recommended', null], ['All', null], [kind === 'topics' ? 'Skip' : 'None', kind === 'topics' ? null : []]]) button(choices, label, () => {
      intent[kind] = value;
      if (kind === 'topics' && label === 'Skip') save(intent);
      draw();
    });
    const field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = 'Choose specific ' + kind; field.append(legend);
    for (const name of names) { const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = intent[kind] === null || intent[kind].includes(name); input.addEventListener('change', () => { const selected = new Set(intent[kind] ?? names); input.checked ? selected.add(name) : selected.delete(name); intent[kind] = [...selected].sort(); }); label.append(input, document.createTextNode(name)); field.append(label); } body.append(field);
  }
  function draw() {
    host.hidden = false; document.documentElement.dataset.entry = 'guided';
    const list = steps(); step = Math.min(step, list.length - 1); const current = list[step];
    progress.textContent = `@${account} · Step ${step + 1} of ${list.length} · Connect → Curate → Relationships → Activity → Universe → Preview`;
    heading.textContent = { projects: 'Choose what matters', relationships: 'What should your constellation reveal?', activity: 'Add a little life', universe: 'Choose your universe' }[current];
    body.replaceChildren(); actions.replaceChildren(); status.textContent = '';
    if (current === 'projects') {
      const welcome = document.createElement('p'); welcome.className = 'guided-identity'; welcome.textContent = 'Welcome, @' + account + '.' + (profile?.name ? ' ' + profile.name : '') + ' · ' + repositories().length + ' public projects';
      const avatar = profile?.avatar || profile?.avatar_url;
      if (typeof avatar === 'string' && avatar.startsWith('https://avatars.githubusercontent.com/')) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; img.width = 48; img.height = 48; welcome.prepend(img); }
      body.append(welcome);
      const note = document.createElement('p'); note.textContent = 'Recommended balances recent work, popularity, project detail and original projects. You can change every selection.'; body.append(note);
      const shortcuts = document.createElement('div'); shortcuts.className = 'guided-actions'; body.append(shortcuts);
      for (const [mode, label] of [['recommended', 'Recommended'], ['recent', 'Recently active'], ['popular', 'Most starred'], ['all', 'All'], ['contributed', 'Contributed to']]) button(shortcuts, label, () => mode === 'contributed' ? picker.contributed() : picker.select(mode === 'all' ? repositories().filter(repo => !repo.private).map(repo => repo.full_name) : recommendProjects(repositories(), mode)));
      button(shortcuts, 'Pinned repositories', async () => {
        if (busy || picker.busy()) return;
        busy = true; host.setAttribute('aria-busy', 'true');
        for (const control of host.querySelectorAll('button, input, select')) control.disabled = true;
        status.textContent = 'Loading pinned repositories…';
        try {
          if (!loadPinned) throw Error('Continue with GitHub to choose pinned repositories.');
          const pinned = (await loadPinned()).filter(repo => !repo.private);
          if (!pinned.length) { status.textContent = 'This account has no public pinned repositories. Your selection is unchanged.'; return; }
          const names = pinned.map(repo => repo.full_name);
          picker.update(account, repositories(), { includeRepos: names }, pinned);
          picker.select(names);
          status.textContent = `Selected ${names.length} pinned repositories. You can change any selection.`;
        } catch (error) { status.textContent = error.message; }
        finally {
          busy = false; host.removeAttribute('aria-busy');
          for (const control of host.querySelectorAll('button, input, select')) control.disabled = false;
          const scope = host.querySelector('[id$="contribution-scope"]');
          const organization = host.querySelector('[id$="contribution-organization"]');
          if (organization) organization.disabled = scope?.value === 'all';
        }
      });
      const pool = document.createElement('div'); body.append(pool);
      picker = mountRepositoryPicker(pool, { prefix: 'guided-', guided: true, apply() {}, message: text => { status.textContent = text; }, findRepositories });
      picker.update(account, repositories(), { includeRepos: intent.projects }, repositories().filter(repo => intent.projects.includes(repo.full_name)));
    }
    if (current === 'relationships') {
      radios('Emphasize', 'relationships', [['auto', 'Let Constellation decide'], ['projects', 'Projects and how they connect'], ['languages', 'Languages across my work'], ['topics', 'Topics across my work'], ['everything', 'Everything together']]);
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Refine languages and topics'; details.append(summary);
      const marker = body.children.length; filters('languages'); if (available().topics.length) filters('topics');
      for (const child of [...body.children].slice(marker)) details.append(child); body.append(details);
    }
    if (current === 'activity') radios('Use real public activity', 'activity', [['none', '○ No activity — a still sky'], ['subtle', '✦ Recent glow — light around active projects'], ['asteroids', '⁙ Commit asteroids — clusters of recent commits'], ['orbit', '◌ Contribution orbit — public activity around your work'], ['recent', '◎ Recent activity — gently pulsing projects'], ['surprise', '✧ Choose an activity effect for me']]);
    if (current === 'universe') { radios('Structure', 'history', [['current', '✧ Single constellation'], ['rings', '◎ Identity rings'], ['galaxy', '⁙ Connected galaxy'], ['dimension', '▱ Dimensional universe'], ...(available().history.eligible ? [['history', '◷ Evolution through time'], ['3d', '▱ Universe through time']] : [])]); const note = document.createElement('p'); note.textContent = `History begins in ${available().history.firstYear}. Retrospective layers use creation dates and current metadata, not historical star counts.`; if (available().history.eligible) body.append(note); }
    if (current === 'universe') { radios('Dimension (for dimensional universe)', 'dimension', [['language', 'Languages'], ['repository', 'Repositories'], ['topic', 'Topics']]); radios('Feel', 'vibe', [['cosmic', 'Cosmic'], ['clean', 'Clean'], ['technical', 'Technical'], ['classic', 'Classic'], ['surprise', 'Surprise me']]); radios('Motion', 'motion', [['automatic', 'Automatic'], ['still', 'Still']]); }
    if (step) button(actions, 'Back', () => { step--; draw(); });
    button(actions, step === list.length - 1 ? 'Generate my constellation' : 'Continue', async () => {
      if (busy) return;
      if (current === 'projects') {
        if (picker.busy()) { status.textContent = 'Wait for repository discovery to finish.'; return; }
        intent.projects = picker.selection();
        if (!intent.projects.length || intent.projects.length > 100) { status.textContent = 'Choose 1–100 projects to continue.'; return; }
        if (prepareProjects) {
          busy = true; host.setAttribute('aria-busy', 'true');
          for (const button of host.querySelectorAll('button')) button.disabled = true;
          try { await prepareProjects(intent.projects, text => { status.textContent = text; }); }
          catch (error) { status.textContent = error.message; return; }
          finally { busy = false; host.removeAttribute('aria-busy'); for (const button of host.querySelectorAll('button')) button.disabled = false; }
        }
        const next = available();
        for (const kind of ['languages', 'topics']) if (intent[kind]?.length) { const matching = intent[kind].filter(name => next[kind].includes(name)); intent[kind] = matching.length ? matching : null; }
        if (!next.topics.length) intent.topics = null;
        if (!next.history.eligible && ['history', '3d', 'surprise'].includes(intent.history)) intent.history = 'current';
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
    button(actions, 'Generate another', run); button(actions, 'Use this constellation', useDesign); button(actions, 'Customize', customize);
    button(actions, 'Edit answers', () => { step = 0; draw(); });
    if (diagnostic) button(actions, 'Retry activity', () => run(true));
    heading.focus();
  }
  draw();
  return { edit() { step = 0; draw(); } };
}
