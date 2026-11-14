// 'Describe your sky': say what you want in words, check the plan, then apply.
// The words go to a model adapter; the Rust engine decides what is valid and
// what matches. Nothing on the map changes until Apply, and Apply is one Undo.

import { h, icon, announce } from '../../dom.mjs';

const MAX_LENGTH = 600;

let styled = false;
function loadStyles(doc) {
  if (styled) return;
  styled = true;
  doc.head.append(h('link', { rel: 'stylesheet', href: new URL('./describe.css', import.meta.url).href }));
}

function mostUsedLanguage(repositories) {
  const counts = new Map();
  for (const repo of repositories) if (repo.language) counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

export function createDescribeDialog(ctx) {
  const { store, actions, doc } = ctx;
  loadStyles(doc);
  let step = 'ask';
  let text = '';
  let pending = null;
  let failure = null;
  let outcome = null;

  const reset = () => { pending?.abort(); pending = null; step = 'ask'; failure = null; outcome = null; };

  async function submit(input) {
    text = input.value;
    failure = null;
    pending = new AbortController();
    const { signal } = pending;
    ctx.refreshDialog();
    announce('Reading your description…');
    let result;
    try {
      result = await actions.describe(text, { signal });
    } catch {
      // The reader is a separate download; say so plainly when it cannot load.
      result = { ok: false, sentence: 'The description reader could not be loaded. Check your connection and try again. Nothing was changed.' };
    }
    if (signal.aborted) return;
    pending = null;
    if (result.ok) { outcome = result; step = 'plan'; announce('Plan ready. Check it, then apply.'); }
    else { failure = result.sentence; announce(failure); }
    ctx.refreshDialog();
  }

  function planList(plan) {
    return h('dl', { class: 'describe-plan' }, plan.sections.map((section) => [
      h('dt', { text: section.label }),
      h('dd', {},
        h('p', { text: section.text }),
        section.projects?.length ? h('ul', { class: 'describe-projects', 'aria-label': `${section.label}: matching projects` },
          section.projects.map((project) => h('li', { title: project.reasons.join('; ') || undefined }, project.name,
            project.reasons.length ? h('span', { class: 'describe-why', text: ` — ${project.reasons.join('; ')}` }) : null)),
          section.more ? h('li', { class: 'describe-more', text: `and ${section.more} more` }) : null) : null),
    ]));
  }

  function buildAsk() {
    const { repositories, options } = store.get();
    const current = options.constellationSpec ? actions.currentPlan() : null;
    const language = mostUsedLanguage(repositories);
    const examples = [
      language ? `Put my ${language} projects near the centre and old experiments on the outskirts` : 'Put my featured projects near the centre and old projects on the outskirts',
      'Keep similar projects side by side and connect them by topic',
      'Show my 12 most recent projects, calm and still',
    ];
    const input = h('textarea', {
      class: 'textarea', id: 'describe-text', name: 'description', rows: 4, maxlength: MAX_LENGTH, value: text,
      'aria-describedby': 'describe-help', placeholder: current ? 'Move experiments further out' : examples[0], disabled: Boolean(pending),
      oninput: () => { text = input.value; },
    });
    const form = h('form', { class: 'describe-form', onsubmit: (event) => { event.preventDefault(); if (!pending) submit(input); } },
      h('label', { class: 'field-label', for: 'describe-text', text: current ? 'What should change?' : 'What would you like to see?' }),
      input,
      h('p', { class: 'field-help', id: 'describe-help', text: `${actions.describeReader()} You check the plan before anything changes.` }));
    form.id = 'describe-form';
    return {
      body: [
        current ? h('section', { class: 'describe-current', 'aria-labelledby': 'describe-current-title' },
          h('h3', { id: 'describe-current-title', text: 'Your current plan' }),
          planList(current),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { actions.clearPlan(); reset(); ctx.refreshDialog(); } }, icon('trash', { size: 18 }), 'Remove this plan')) : null,
        form,
        current ? null : h('div', { class: 'describe-examples' },
          h('h3', { id: 'describe-examples-title', text: 'Try one' }),
          h('ul', { 'aria-labelledby': 'describe-examples-title' }, examples.map((example) => h('li', {},
            h('button', { class: 'btn btn-ghost describe-example', type: 'button', disabled: Boolean(pending), onclick: () => { text = example; input.value = example; input.focus(); } }, example))))),
        h('div', { class: 'describe-status', role: 'status' }, pending ? h('p', { class: 'describe-busy', text: 'Reading your description and checking it against your projects…' }) : null),
        failure ? h('div', { class: 'notice', role: 'alert', dataset: { tone: 'error' } }, icon('info', { size: 18 }), h('p', { text: failure })) : null,
      ],
      foot: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => actions.closeDialog() }, 'Cancel'),
        pending
          ? h('button', { class: 'btn btn-primary', type: 'button', 'data-primary': '', onclick: () => { reset(); announce('Stopped. Nothing was changed.'); ctx.refreshDialog(); } }, 'Stop')
          : h('button', { class: 'btn btn-primary', type: 'submit', form: 'describe-form', 'data-primary': '' }, icon('sparkle', { size: 18 }), 'Show the plan'),
      ],
    };
  }

  function buildPlan() {
    const { plan } = outcome;
    const refining = Boolean(store.get().options.constellationSpec);
    return {
      body: [
        h('blockquote', { class: 'describe-asked', text: text.trim() }),
        h('p', { class: 'describe-caveat', text: 'This is one reading of your words, not a statement about your work. Which projects match comes from their public details and the roles you set.' }),
        refining ? h('section', { 'aria-labelledby': 'describe-changes-title' },
          h('h3', { id: 'describe-changes-title', text: 'What changes' }),
          plan.unchanged ? h('p', { text: 'Nothing: this matches your current plan.' }) : h('ul', { class: 'describe-changes' }, plan.changes.map((change) => h('li', { text: change })))) : null,
        h('section', { 'aria-labelledby': 'describe-plan-title' },
          h('h3', { id: 'describe-plan-title', tabindex: '-1', text: refining ? 'The plan after this change' : 'The plan' }),
          planList(plan)),
        plan.notes.length ? h('div', { class: 'notice' }, icon('info', { size: 18 }), h('ul', { class: 'describe-notes' }, plan.notes.map((note) => h('li', { text: note })))) : null,
      ],
      foot: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { step = 'ask'; outcome = null; ctx.refreshDialog(); } }, icon('back', { size: 18 }), 'Change the description'),
        h('button', { class: 'btn btn-primary', type: 'button', 'data-primary': '', disabled: plan.unchanged, onclick: () => { const { compiled } = outcome; text = ''; reset(); actions.applyPlan(compiled); } }, icon('check', { size: 18 }), 'Apply'),
      ],
    };
  }

  return {
    title: 'Describe your sky',
    build: () => (step === 'plan' && outcome ? buildPlan() : buildAsk()),
    // Closing never changes the map: only Apply does.
    onClose: reset,
  };
}
