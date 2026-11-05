// "Map a tech stack": the one Studio view that needs GitHub sign-in, because it
// reads a manifest from every public repository using the viewer's own token and
// request limit. Its result lives here and nowhere else, so it never touches a
// design, the undo history, a draft or a share link.

import { h, icon, announce } from '../../dom.mjs';
import { downloadBlob } from '../../../export-image.mjs';

const WHY = 'Mapping a tech stack reads a file from every public repository, so it uses your own GitHub sign-in and your own request limit.';
const PRIVACY = 'Your sign-in stays in this tab only. It is never saved, shared, or put in your map. Only public repositories are read.';
const LENGTH = 'A large organization can take several minutes. You can cancel at any time.';

let stylesheetAdded = false;

export function createTechStackDialog(ctx) {
  const { store, engine, actions, doc } = ctx;
  if (!stylesheetAdded) {
    stylesheetAdded = true;
    doc.head.append(h('link', { rel: 'stylesheet', href: new URL('./tech-stack.css', import.meta.url).href }));
  }

  let phase = 'form';
  let target = '';
  let lastRequest = null;
  let run = 0;
  let controller = null;
  let progress = '';
  let failure = '';
  let result = null;
  let runtime = null;

  function destroyRuntime() {
    try { runtime?.destroy?.(); } catch { /* A map that failed to mount has nothing to clean up. */ }
    runtime = null;
  }
  function cancelScan() {
    run += 1;
    controller?.abort();
    controller = null;
  }
  // The gate holds after signing out: nothing from the signed-in scan stays on screen.
  engine.onSessionChange((profile) => {
    if (profile) return;
    cancelScan();
    destroyRuntime();
    result = null;
    phase = 'form';
    if (store.get().dialog === 'tech-stack') ctx.refreshDialog?.();
  });

  function describeProgress({ stage, done, total }) {
    const label = { listing: 'Listing repositories', folders: 'Looking through repositories', details: 'Reading project files' }[stage];
    return `${label}… ${done} of ${total}`;
  }

  async function start(login) {
    const mine = ++run;
    controller = new AbortController();
    phase = 'scanning';
    progress = 'Starting…';
    target = login;
    destroyRuntime();
    result = null;
    ctx.refreshDialog?.();
    try {
      const scan = await engine.scanTechStack(login, {
        signal: controller.signal,
        onProgress: (update) => {
          if (mine !== run) return;
          progress = describeProgress(update);
          const status = doc.querySelector('[data-tech-progress]');
          if (status) status.textContent = progress;
        },
      });
      if (mine !== run) return;
      result = { scan, ...(await engine.renderTechStack(scan)) };
      if (mine !== run) return;
      phase = 'done';
      announce(`Tech stack ready: ${result.model.total} repositories for ${scan.login}.`);
    } catch (error) {
      if (mine !== run) return;
      phase = 'error';
      failure = error?.message || 'We couldn’t map this tech stack. Try again.';
    }
    controller = null;
    ctx.refreshDialog?.();
  }

  function gate() {
    return {
      body: [
        h('p', { text: WHY }),
        h('p', { class: 'notice' }, icon('eyeOff', { size: 18 }), h('span', { text: PRIVACY })),
      ],
      foot: [h('button', {
        class: 'btn btn-primary', type: 'button', 'data-primary': true,
        onclick: () => actions.signInForTechStack(target),
      }, icon('github', { size: 18 }), 'Sign in with GitHub')],
    };
  }

  function form() {
    const id = 'tech-stack-account';
    const helpId = 'tech-stack-help';
    const viewer = engine.viewer?.login;
    const field = h('input', { id, class: 'input', type: 'text', value: target, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-describedby': helpId });
    const message = h('div', { 'aria-live': 'polite' });
    const body = h('form', {
      class: 'tech-stack-form', novalidate: true, id: 'tech-stack-form',
      onsubmit: (event) => {
        event.preventDefault();
        let login;
        try { login = engine.parseUsername(field.value.trim()); }
        catch {
          message.replaceChildren(h('p', { class: 'notice', role: 'alert', dataset: { tone: 'error' } }, icon('info', { size: 18 }), h('span', { text: 'Enter a GitHub username or organization, like “octocat”.' })));
          field.focus();
          return;
        }
        start(login);
      },
    },
    h('div', { class: 'field' },
      h('label', { class: 'field-label', for: id, text: 'GitHub account or organization' }),
      field,
      h('p', { class: 'field-help', id: helpId, text: LENGTH })),
    viewer ? h('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: () => { field.value = viewer; field.focus(); },
    }, `Use my account (@${viewer})`) : null,
    message);
    return {
      body: [h('p', { text: 'See which languages, frameworks and services an account’s public repositories declare, and which ones are used together.' }), body],
      foot: [h('button', { class: 'btn btn-primary', type: 'submit', form: 'tech-stack-form', 'data-primary': true }, 'Map tech stack')],
    };
  }

  function scanning() {
    return {
      body: [
        h('p', { text: `Mapping @${target}. ${LENGTH}` }),
        h('p', { class: 'tech-stack-progress', role: 'status', 'data-tech-progress': '', text: progress }),
      ],
      foot: [h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          cancelScan();
          phase = 'form';
          ctx.refreshDialog?.();
          announce('Cancelled.');
        },
      }, 'Cancel')],
    };
  }

  function errored() {
    return {
      body: [h('p', { class: 'notice', role: 'alert', dataset: { tone: 'error' } }, icon('info', { size: 18 }), h('span', { text: failure }))],
      foot: [h('button', { class: 'btn btn-primary', type: 'button', 'data-primary': true, onclick: () => { phase = 'form'; ctx.refreshDialog?.(); } }, 'Try again')],
    };
  }

  function table(caption, rows, offMap = () => false) {
    return h('table', { class: 'tech-stack-table' },
      h('caption', { class: 'visually-hidden', text: caption }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Technology' }), h('th', { scope: 'col', text: 'Repos' }), h('th', { scope: 'col', text: 'Share' }))),
      h('tbody', {}, rows.map((row) => h('tr', { class: offMap(row) ? 'is-off-map' : undefined },
        h('th', { scope: 'row', text: row.name }), h('td', { text: String(row.count) }), h('td', { text: result.formatShare(row.count / (result.model.total || 1)) })))));
  }

  // Inside a shadow root, the map's own styles can't reach the Studio map behind this sheet.
  function mapHost() {
    const host = h('div', { class: 'tech-stack-map' });
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${result.styles}</style>${result.markup}`;
    queueMicrotask(async () => {
      if (!host.isConnected) return;
      try { runtime = await result.mount(shadow.querySelector('main')); }
      catch { /* The drawn map and the tables below still say everything. */ }
    });
    return host;
  }

  function finished() {
    const { scan, model, notes } = result;
    return {
      body: [
        h('p', { class: 'tech-stack-summary', text: `${model.total} of ${scan.coverage.discovered} public repositories for @${scan.login}. Star size shows how many repositories declare a technology. Lines join technologies declared in the same repositories; thicker lines mean more repositories. Select a star to see its links.` }),
        mapHost(),
        h('section', { class: 'tech-stack-section' }, h('h3', { text: 'Most common combinations' }), table('Most common combinations', model.stacks)),
        h('section', { class: 'tech-stack-section' },
          h('h3', { text: 'Every technology detected' }),
          h('p', { class: 'field-help', text: 'Dimmed rows are left off the map to keep it readable.' }),
          h('div', { class: 'tech-stack-tables' }, model.groups.map((group) => h('div', {},
            h('h4', {}, h('span', { class: 'tech-stack-dot', style: { background: group.color } }), group.id),
            table(group.id, group.rows, (row) => !row.onMap))))),
        h('section', { class: 'tech-stack-section' },
          h('h3', { text: 'How to read this' }),
          h('p', { text: 'These technologies are declared in manifests such as package.json and requirements.txt, which doesn’t prove they’re used. Counts say nothing about a project’s quality.' }),
          notes.map((note) => h('p', { text: note }))),
      ],
      foot: [
        h('button', { class: 'btn', type: 'button', onclick: () => { destroyRuntime(); phase = 'form'; ctx.refreshDialog?.(); } }, 'Map another account'),
        h('button', {
          class: 'btn btn-primary', type: 'button', 'data-primary': true,
          onclick: async () => {
            const name = `${scan.login}-tech-stack.html`;
            downloadBlob(new Blob([await engine.techStackPage(scan)], { type: 'text/html;charset=utf-8' }), name);
            actions.toast(`Saved ${name} to your downloads.`);
          },
        }, icon('download', { size: 18 }), 'Download interactive page'),
      ],
    };
  }

  return {
    title: 'Tech stack',
    build() {
      const state = store.get();
      const requested = state.techStackTarget;
      // Redraws happen often, so each request counts once. A new one replaces a
      // finished map, never a scan still running.
      if (requested !== lastRequest) {
        lastRequest = requested;
        if (requested && phase !== 'scanning' && requested.toLowerCase() !== result?.scan.login.toLowerCase()) { phase = 'form'; target = requested; }
      }
      if (!target) target = requested || (state.sample ? engine.viewer?.login : state.account) || '';
      destroyRuntime();
      if (!engine.signedIn) return gate();
      return { form, scanning, error: errored, done: finished }[phase]();
    },
    onClose() {
      // A scan is the visitor's request limit: closing the sheet stops spending it.
      if (phase === 'scanning') { cancelScan(); phase = 'form'; }
      if (phase === 'error') phase = 'form';
      // Only a finished map is worth coming back to; otherwise start from the account on screen.
      if (phase !== 'done') target = '';
      lastRequest = null;
      destroyRuntime();
      store.update({ techStackTarget: null });
    },
  };
}
