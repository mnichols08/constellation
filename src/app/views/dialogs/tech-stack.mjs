// "Map a tech stack": the one Studio view that needs GitHub sign-in, because it
// reads a manifest from every public repository using the viewer's own token and
// request limit. Its result lives here and nowhere else, so it never touches a
// design, the undo history, a draft or a share link.

import { h, icon, announce } from '../../dom.mjs';
import { downloadBlob } from '../../../export-image.mjs';
import { renderTechStackWorkflow, installationLinks, readmeSnippet } from '../../../export.mjs';

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

  // Projects the person marked as featured in the open design lead the
  // examples, when the map is of that same account.
  function featuredFor(login) {
    const state = store.get();
    if (state.sample || String(state.account || '').toLowerCase() !== login.toLowerCase()) return [];
    return Object.entries(state.options?.projectShowcase || {}).filter(([, entry]) => entry?.role === 'featured').map(([name]) => name.split('/').pop()).slice(0, 12);
  }

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
      const featured = featuredFor(scan.login);
      result = { scan, featured, ...(await engine.renderTechStack(scan, { featured })) };
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

  // `years` gives a row's dated entry, when the table has an Active column.
  function table(caption, rows, offMap = () => false, years = null) {
    return h('table', { class: 'tech-stack-table' },
      h('caption', { class: 'visually-hidden', text: caption }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Technology' }), h('th', { scope: 'col', text: 'Repos' }), h('th', { scope: 'col', text: 'Share' }), years ? h('th', { scope: 'col', text: 'Active' }) : null)),
      h('tbody', {}, rows.map((row) => h('tr', { class: offMap(row) ? 'is-off-map' : undefined },
        h('th', { scope: 'row', text: row.name }), h('td', { text: String(row.count) }), h('td', { text: result.formatShare(row.count / (result.model.total || 1)) }),
        years ? h('td', { text: years(row) ? result.formatYears(years(row)) : '' }) : null))));
  }

  // What someone skimming can take away without reading the map: what is
  // current, what goes together, and which repositories show it.
  function glance() {
    const { evidence, formatYears, plural } = result;
    const example = (item) => (item.url ? h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', text: item.name }) : h('span', { text: item.name }));
    const entry = (item) => h('li', {},
      h('strong', { text: item.name }), ` · ${plural(item.repositories)} · ${formatYears(item)}`,
      item.current ? null : h('span', { class: 'tech-stack-earlier', text: ' · earlier work' }),
      item.examples.length ? [' · ', ...item.examples.flatMap((one, index) => (index ? [', ', example(one)] : [example(one)]))] : null);
    return h('section', { class: 'tech-stack-section tech-stack-glance' },
      h('h3', { text: 'At a glance' }),
      h('p', { class: 'tech-stack-headline', text: evidence.headline }),
      evidence.stacks.length ? [h('h4', { text: 'Used together' }), h('ul', {}, evidence.stacks.map(entry))] : null,
      evidence.core.length ? [h('h4', { text: 'Where to look' }), h('ul', {}, evidence.core.slice(0, 8).map(entry))] : null,
      evidence.tooling.length ? h('p', { text: `Testing and build tools: ${evidence.tooling.map((tool) => tool.name).join(', ')}.` }) : null,
      h('p', { class: 'field-help', text: '“Now” means a repository declaring it was pushed to in the last year. Dates run from when the first such repository was created to the last push to any of them.' }));
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

  // A README can't run this sheet, so the profile path is a workflow: GitHub
  // redraws the image daily with the repository's own access. Nobody's sign-in
  // is written into it.
  function profileSection(scan) {
    const file = 'tech-stack.svg';
    const { featured } = result;
    let yaml = '';
    let snippet = '';
    let markdown = '';
    const style = h('select', { class: 'input', id: 'tech-stack-style' },
      h('option', { value: 'card', text: 'Summary card: stacks, dates and counts (recommended)' }),
      h('option', { value: 'map', text: 'Star map' }));
    const markdownCode = h('code');
    const markdownPre = h('pre', { tabindex: '0', role: 'region', 'aria-label': 'README project list' }, markdownCode);
    engine.techStackMarkdown(scan, { featured }).then((text) => { markdown = text; markdownCode.textContent = text; }).catch(() => { markdownPre.hidden = true; });
    const repository = h('input', { class: 'input', id: 'tech-stack-repository', type: 'text', autocomplete: 'off', spellcheck: 'false', value: `${scan.login}/${scan.login}`, 'aria-describedby': 'tech-stack-repository-help' });
    const problem = h('p', { class: 'notice', role: 'alert', dataset: { tone: 'error' }, hidden: true });
    const create = h('a', { class: 'btn', target: '_blank', rel: 'noopener noreferrer' }, icon('github', { size: 18 }), 'Create the file on GitHub');
    const workflowCode = h('code');
    const workflowPre = h('pre', { tabindex: '0', role: 'region', 'aria-label': 'Workflow file' }, workflowCode);
    const snippetCode = h('code');
    const snippetPre = h('pre', { tabindex: '0', role: 'region', 'aria-label': 'README snippet' }, snippetCode);
    const copy = (label, getText, target) => h('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: async () => {
        try {
          await ctx.win.navigator.clipboard.writeText(getText());
          actions.toast('Copied to clipboard.');
        } catch {
          // Clipboard blocked: select the text so one keystroke finishes the job.
          ctx.win.getSelection?.()?.selectAllChildren(target);
          target.focus();
          actions.toast('Press Ctrl+C (Command+C on a Mac) to copy.');
        }
      },
    }, icon('copy', { size: 16 }), label);
    const refresh = () => {
      try {
        yaml = renderTechStackWorkflow(scan.login, { filename: file, style: style.value, featured });
        const links = installationLinks(repository.value, yaml, 'tech-stack.yml');
        snippet = readmeSnippet(scan.login, repository.value, file, 'tech stack');
        create.href = links.install;
        create.hidden = false;
        problem.hidden = true;
      } catch (error) {
        yaml = '';
        snippet = '';
        create.hidden = true;
        create.removeAttribute('href');
        problem.textContent = error.message;
        problem.hidden = false;
      }
      workflowCode.textContent = yaml;
      snippetCode.textContent = snippet;
    };
    repository.addEventListener('input', refresh);
    style.addEventListener('change', refresh);
    refresh();
    return h('section', { class: 'tech-stack-section tech-stack-profile' },
      h('h3', { text: 'Add it to a GitHub profile' }),
      h('p', { text: 'A workflow redraws this every day and saves it as an image a README can show. It runs on GitHub with that repository’s own access. Your sign-in is not used or stored.' }),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'tech-stack-style', text: 'Image' }),
        style,
        h('p', { class: 'field-help', text: 'The card can be read without explanation. The star map shows how technologies connect.' })),
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'tech-stack-repository', text: 'Repository for the workflow' }),
        repository,
        h('p', { class: 'field-help', id: 'tech-stack-repository-help', text: 'A profile repository has the same name as the account. For an organization, use its .github repository and put the snippet in profile/README.md.' })),
      problem,
      h('ol', { class: 'tech-stack-steps' },
        h('li', {}, h('p', { text: 'Add the workflow file, then commit it.' }), h('div', { class: 'tech-stack-actions' }, create, copy('Copy the file', () => yaml, workflowPre)),
          h('details', {}, h('summary', { text: 'Show the file' }), workflowPre)),
        h('li', {}, h('p', { text: 'On the repository’s Actions page, run “Daily tech stack map” once. It takes a few minutes for a large account.' })),
        h('li', {}, h('p', { text: 'Paste this into the README.' }), snippetPre, h('div', { class: 'tech-stack-actions' }, copy('Copy the snippet', () => snippet, snippetPre))),
        h('li', {}, h('p', { text: 'Optional: paste this list under the image. An image can’t hold links, so this is how a reader gets to the projects. It is a snapshot from today; paste a new one when your work changes.' }),
          h('div', { class: 'tech-stack-actions' }, copy('Copy the list', () => markdown, markdownPre)),
          h('details', {}, h('summary', { text: 'Show the list' }), markdownPre))),
      h('p', { class: 'field-help', text: 'Nothing is published until the workflow runs. Prefer a one-time image? Download it instead.' }),
      h('div', { class: 'tech-stack-actions' }, h('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async () => {
          const name = `${scan.login}-tech-stack.svg`;
          downloadBlob(new Blob([await engine.techStackImage(scan, { style: style.value, featured })], { type: 'image/svg+xml' }), name);
          actions.toast(`Saved ${name} to your downloads.`);
        },
      }, icon('download', { size: 16 }), 'Download image (SVG)')));
  }

  function finished() {
    const { scan, model, notes, evidence } = result;
    const active = new Map([...evidence.core, ...evidence.tooling].map((tech) => [`${tech.kind === 'language' ? 'l' : 't'}:${tech.name}`, tech]));
    return {
      body: [
        h('p', { class: 'tech-stack-summary', text: `${model.total} of ${scan.coverage.discovered} public repositories for @${scan.login}. Star size shows how many repositories declare a technology. Lines join technologies declared in the same repositories; thicker lines mean more repositories. Select a star to see its links.` }),
        glance(),
        mapHost(),
        h('section', { class: 'tech-stack-section' }, h('h3', { text: 'Most common combinations' }), table('Most common combinations', model.stacks)),
        h('section', { class: 'tech-stack-section' },
          h('h3', { text: 'Every technology detected' }),
          h('p', { class: 'field-help', text: 'Dimmed rows are left off the map to keep it readable.' }),
          h('div', { class: 'tech-stack-tables' }, model.groups.map((group) => h('div', {},
            h('h4', {}, h('span', { class: 'tech-stack-dot', style: { background: group.color } }), group.id),
            table(group.id, group.rows, (row) => !row.onMap, (row) => active.get(`${group.core ? 'l' : 't'}:${row.name}`)))))),
        h('section', { class: 'tech-stack-section' },
          h('h3', { text: 'How to read this' }),
          h('p', { text: 'These technologies are declared in manifests such as package.json and requirements.txt, which doesn’t prove they’re used. Counts say nothing about a project’s quality.' }),
          notes.map((note) => h('p', { text: note }))),
        profileSection(scan),
      ],
      foot: [
        h('button', { class: 'btn', type: 'button', onclick: () => { destroyRuntime(); phase = 'form'; ctx.refreshDialog?.(); } }, 'Map another account'),
        h('button', {
          class: 'btn btn-primary', type: 'button', 'data-primary': true,
          onclick: async () => {
            const name = `${scan.login}-tech-stack.html`;
            downloadBlob(new Blob([await engine.techStackPage(scan, { featured: result.featured })], { type: 'text/html;charset=utf-8' }), name);
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
