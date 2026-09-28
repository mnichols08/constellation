export function mountRepositoryPicker(host, { apply, message, findRepositories }) {
  let repositories = [], selected = new Set(), signature, context, busy = false, edited = false;
  const added = new Set();
  const search = document.createElement('input');
  search.id = 'repository-search'; search.type = 'search'; search.placeholder = 'Find a repository';
  const label = document.createElement('label'); label.htmlFor = search.id; label.textContent = 'Search loaded repositories';
  const count = document.createElement('p'); count.id = 'repository-selection-count'; count.setAttribute('role', 'status');
  const list = document.createElement('div'); list.className = 'repository-picker-list'; list.id = 'repository-picker-list';
  const help = document.createElement('p'); help.className = 'export-note';
  help.textContent = 'Choose projects, then apply. This clears project filters and hidden nodes. Historical views and organization scope still apply. Adding an unpinned project switches the source to all repositories.';
  const discovery = document.createElement('div'); discovery.className = 'repository-discovery';
  const organization = document.createElement('input'); organization.id = 'contribution-organization'; organization.placeholder = 'Optional organization, e.g. chingu-voyages';
  const orgLabel = document.createElement('label'); orgLabel.htmlFor = organization.id; orgLabel.textContent = 'Find team projects';
  const find = document.createElement('button'); find.type = 'button'; find.id = 'find-contributed-repositories'; find.className = 'secondary'; find.textContent = 'Find repositories I contributed to';
  const direct = document.createElement('input'); direct.id = 'add-repository-name'; direct.placeholder = 'owner/repository or GitHub URL';
  const directLabel = document.createElement('label'); directLabel.htmlFor = direct.id; directLabel.textContent = 'Add a public repository';
  const add = document.createElement('button'); add.type = 'button'; add.id = 'add-public-repository'; add.className = 'secondary'; add.textContent = 'Add repository';
  const feedback = document.createElement('p'); feedback.id = 'repository-discovery-status'; feedback.className = 'export-note'; feedback.setAttribute('role', 'status');
  feedback.textContent = 'Search your public pull requests and commits, including team projects. If a project is missing, paste its URL below.';
  discovery.append(orgLabel, organization, find, feedback, directLabel, direct, add);
  const actions = document.createElement('div'); actions.className = 'repository-picker-actions';
  const buttons = [find, add];
  const button = (id, text, callback) => {
    const element = document.createElement('button'); element.type = 'button'; element.id = id; element.textContent = text; element.className = 'secondary';
    element.addEventListener('click', callback); actions.append(element); buttons.push(element); return element;
  };
  const visible = () => repositories.filter(repo => repo.full_name.toLowerCase().includes(search.value.trim().toLowerCase()));
  const updateCount = () => { count.textContent = `${selected.size} selected · ${visible().length} of ${repositories.length} listed`; };
  const draw = () => {
    list.replaceChildren();
    for (const repo of visible()) {
      const row = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span');
      input.type = 'checkbox'; input.value = repo.full_name; input.checked = selected.has(repo.full_name); input.disabled = busy;
      name.textContent = repo.full_name + (repo.fork ? ' · fork' : '') + (repo.archived ? ' · archived' : '');
      input.addEventListener('change', () => { edited = true; if (input.checked) selected.add(repo.full_name); else selected.delete(repo.full_name); updateCount(); });
      row.append(input, name); list.append(row);
    }
    if (!list.children.length) { const empty = document.createElement('p'); empty.textContent = 'No matching repositories.'; list.append(empty); }
    updateCount();
  };
  button('select-visible-repositories', 'Select shown', () => { edited = true; visible().forEach(repo => selected.add(repo.full_name)); draw(); });
  button('clear-repository-selection', 'Clear selection', () => { edited = true; selected.clear(); draw(); });
  const commit = async automatic => {
    if (busy) return;
    if (automatic) { edited = false; signature = undefined; }
    busy = true; buttons.forEach(button => { button.disabled = true; }); search.disabled = true; draw();
    try { await apply(automatic ? undefined : [...selected].sort()); }
    catch (error) { message(error.message, true); }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); search.disabled = false; draw(); }
  };
  button('apply-repository-selection', 'Apply selection', () => commit(false));
  button('automatic-repositories', 'Use automatic selection', () => commit(true));
  async function discover(manual) {
    if (busy) return;
    busy = true; buttons.forEach(button => { button.disabled = true; }); draw();
    feedback.textContent = manual ? 'Loading repository…' : 'Searching contributions…';
    try {
      const result = await findRepositories({ organization: organization.value, repository: manual ? direct.value : undefined, onProgress: text => { feedback.textContent = text; } });
      const merged = new Map(repositories.map(repo => [repo.full_name.toLowerCase(), repo]));
      for (const repo of result.repositories) {
        added.add(repo.full_name.toLowerCase());
        if (!merged.has(repo.full_name.toLowerCase())) merged.set(repo.full_name.toLowerCase(), repo);
        if (manual) selected.add(repo.full_name);
      }
      if (manual) edited = true;
      repositories = [...merged.values()].sort((a, b) => a.full_name.localeCompare(b.full_name));
      search.value = '';
      if (manual) direct.value = '';
      feedback.textContent = `${result.repositories.length} ${manual ? 'repository added and selected. Apply selection to use it.' : 'repositories found. Choose projects below, then apply.'} ${result.diagnostic || ''}`;
    } catch (error) { feedback.textContent = error.message; message(error.message, true); }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); draw(); }
  }
  find.addEventListener('click', () => discover(false));
  organization.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); discover(false); } });
  add.addEventListener('click', () => discover(true));
  direct.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); discover(true); } });
  search.addEventListener('input', draw);
  host.append(discovery, label, search, count, actions, list, help);
  return {
    update(account, pool, options, automaticPool) {
      const nextContext = JSON.stringify([account.toLowerCase(), options.repoSource, options.includeRepos]);
      if (nextContext !== context) { added.clear(); edited = false; context = nextContext; }
      repositories = pool.filter(repo => !repo.private && (options.repoSource !== 'pinned' || repo.pinned || added.has(repo.full_name.toLowerCase()))).sort((a, b) => a.full_name.localeCompare(b.full_name));
      const next = JSON.stringify([account.toLowerCase(), options.repoSource, options.includeRepos, repositories.map(repo => repo.full_name), automaticPool.map(repo => repo.full_name)]);
      if (next === signature) return;
      signature = next;
      if (!edited) selected = new Set((options.includeRepos ? repositories.filter(repo => options.includeRepos.includes(repo.full_name) || options.includeRepos.includes(repo.name)) : automaticPool).map(repo => repo.full_name));
      search.value = ''; draw();
    },
  };
}
