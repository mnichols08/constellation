import { createRepositoryCommits } from './repository-commits.mjs';
import { commitGraph, renderCommitGraph } from './commit-graph.mjs';

export function mountStudioCommits(host, { fetchImpl, showConstellation, highlightAuthor }) {
  const data = createRepositoryCommits({ fetchImpl });
  const section = document.createElement('details'); section.className = 'control-section';
  section.innerHTML = '<summary>Repository commits</summary><div class="control-section-body"><p class="export-note">Explore a repository’s commits, merges, and the people behind them.</p><button type="button" class="secondary" id="repository-history-open">Choose a repository</button></div>';
  host.append(section);
  const starAuthors = document.createElement('div'); starAuthors.id = 'commit-star-authors'; starAuthors.hidden = true; section.querySelector('.control-section-body').append(starAuthors);
  const dialog = document.createElement('dialog'); dialog.id = 'repository-history'; dialog.setAttribute('aria-labelledby', 'repository-history-title');
  dialog.innerHTML = `<header><h2 id="repository-history-title">Repository commits</h2><button type="button" id="repository-history-close">Close</button></header><div class="commit-controls"><label>Loaded repositories<select id="commit-repository-select"><option value="">Choose a repository</option></select></label><label>Public repository<input id="commit-repository" placeholder="owner/repository" autocomplete="off"></label><label>Branch or SHA (optional)<input id="commit-branch" placeholder="Default branch" maxlength="200"></label><button type="button" id="commit-constellation">Show as constellation</button><button type="button" id="commit-load">Build commit graph</button><button type="button" id="commit-refresh">Refresh</button><a id="commit-download" hidden>Download SVG</a></div><p id="commit-status" role="status">Choose a public repository to load its history.</p><div id="commit-contributors" aria-label="Highlight a contributor"></div><div id="commit-viewport" tabindex="0" aria-label="Scrollable commit history"></div><p class="commit-help">Load up to 300 recent commits from the selected branch. Show up to 256 as stars in your constellation, or build the separate ancestry graph. Colors identify authors. Contributor counts cover the loaded history.</p>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector), select = find('#commit-repository-select'), input = find('#commit-repository'), branch = find('#commit-branch'), status = find('#commit-status'), viewport = find('#commit-viewport');
  const constellationButton = find('#commit-constellation');
  const loadButton = find('#commit-load'), refreshButton = find('#commit-refresh'), download = find('#commit-download'), people = find('#commit-contributors');
  function gate() {
    const blocked = fetchImpl?.access?.capabilities.commitHistory === false;
    constellationButton.disabled = loadButton.disabled = refreshButton.disabled = blocked;
    if (blocked) status.textContent = 'Sign in with GitHub to load repository history.';
  }
  let snapshot, selected = '', generation = 0, downloadURL, signature;
  function clearDownload() { if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = undefined; download.hidden = true; download.removeAttribute('href'); }
  function draw() {
    const svg = renderCommitGraph(snapshot, selected);
    viewport.innerHTML = svg;
    clearDownload(); downloadURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); download.href = downloadURL; download.download = `${snapshot.repository.replace('/', '-')}-commits.svg`; download.hidden = false;
    const graph = commitGraph(snapshot);
    people.replaceChildren();
    for (const person of [{ key: '', name: 'All contributors', count: snapshot.commits.length }, ...graph.contributors]) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.author = person.key; button.setAttribute('aria-pressed', String(selected === person.key));
      button.textContent = `${person.login ? '@' : ''}${person.name}${person.key.startsWith('unlinked:') ? ' (unlinked)' : ''} · ${person.count}`;
      if (person.color) button.style.setProperty('--author-color', person.color);
      button.addEventListener('click', () => { selected = person.key; const scroll = viewport.scrollTop; draw(); viewport.scrollTop = scroll; [...people.children].find(element => element.dataset.author === selected)?.focus(); });
      people.append(button);
    }
    status.textContent = `${snapshot.repository} · ${snapshot.branch} · ${graph.nodes.length} commits · ${graph.contributors.length} authors${snapshot.partial ? ' · partial history (older commits not loaded)' : ''}${snapshot.diagnostic ? ' · ' + snapshot.diagnostic : ''}`;
  }
  async function load(refresh = false) {
    const request = ++generation;
    loadButton.disabled = refreshButton.disabled = true; clearDownload(); viewport.replaceChildren(); people.replaceChildren(); snapshot = undefined;
    status.textContent = 'Loading commit history…';
    try {
      const result = await data.load(input.value, { branch: branch.value, refresh });
      if (request !== generation) return;
      snapshot = result; selected = ''; draw(); viewport.scrollTop = 0;
    } catch (error) { if (request === generation) status.textContent = error.message; }
    finally { if (request === generation) loadButton.disabled = refreshButton.disabled = false; }
  }
  constellationButton.addEventListener('click', async () => {
    if (loadButton.disabled) return;
    constellationButton.disabled = loadButton.disabled = refreshButton.disabled = true;
    const request = ++generation;
    status.textContent = 'Loading commit stars…';
    try {
      const result = await data.load(input.value, { branch: branch.value });
      if (request !== generation) return;
      const author = snapshot?.repository === result.repository && snapshot?.branch === result.branch ? selected : '';
      if (await showConstellation(result, author)) dialog.close();
    } catch (error) { if (request === generation) status.textContent = error.message; }
    finally { if (request === generation) constellationButton.disabled = loadButton.disabled = refreshButton.disabled = false; }
  });
  select.addEventListener('change', () => { if (select.value) { input.value = select.value; branch.value = ''; } });
  loadButton.addEventListener('click', () => load()); refreshButton.addEventListener('click', () => load(true));
  for (const field of [input, branch]) field.addEventListener('keydown', event => { if (event.key === 'Enter' && !loadButton.disabled) { event.preventDefault(); load(); } });
  section.querySelector('button').addEventListener('click', () => { gate(); dialog.showModal(); if (snapshot) draw(); select.focus(); });
  find('#repository-history-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { generation++; constellationButton.disabled = loadButton.disabled = refreshButton.disabled = false; clearDownload(); });
  return { updateConstellation(snapshot, options) {
    starAuthors.replaceChildren(); starAuthors.hidden = options.nodeMode !== 'commits' || !snapshot;
    if (starAuthors.hidden) return;
    const label = document.createElement('p'); label.textContent = 'Highlight an author in the constellation (counts cover loaded history):'; starAuthors.append(label);
    for (const person of [{ key: '', name: 'All authors', count: snapshot.commits.length }, ...commitGraph(snapshot).contributors]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.author = person.key;
      button.textContent = `${person.name} · ${person.count}`; button.setAttribute('aria-pressed', String((options.commitHistory?.author || '') === person.key));
      if (person.color) button.style.borderColor = person.color;
      button.addEventListener('click', () => highlightAuthor(person.key)); starAuthors.append(button);
    }
  }, update(repositories) {
    const names = repositories.filter(repo => repo.private !== true).map(repo => repo.full_name).sort();
    const next = JSON.stringify(names); if (next === signature) return; signature = next;
    const previous = select.value; select.replaceChildren(new Option('Choose a repository', ''));
    for (const name of names) select.append(new Option(name, name));
    select.value = names.includes(previous) ? previous : '';
  } };
}
