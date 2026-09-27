export function mountRepositoryPicker(host, { apply, message }) {
  let repositories = [], selected = new Set(), signature, busy = false;
  const search = document.createElement('input');
  search.id = 'repository-search'; search.type = 'search'; search.placeholder = 'Find a repository';
  const label = document.createElement('label'); label.htmlFor = search.id; label.textContent = 'Search loaded repositories';
  const count = document.createElement('p'); count.id = 'repository-selection-count'; count.setAttribute('role', 'status');
  const list = document.createElement('div'); list.className = 'repository-picker-list'; list.id = 'repository-picker-list';
  const help = document.createElement('p'); help.className = 'export-note';
  help.textContent = 'Choose projects, then apply. This clears project filters and hidden nodes. Historical views and organization scope still apply. Only repositories loaded for this account and source are listed.';
  const actions = document.createElement('div'); actions.className = 'repository-picker-actions';
  const buttons = [];
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
      input.addEventListener('change', () => { if (input.checked) selected.add(repo.full_name); else selected.delete(repo.full_name); updateCount(); });
      row.append(input, name); list.append(row);
    }
    if (!list.children.length) { const empty = document.createElement('p'); empty.textContent = 'No matching repositories.'; list.append(empty); }
    updateCount();
  };
  button('select-visible-repositories', 'Select shown', () => { visible().forEach(repo => selected.add(repo.full_name)); draw(); });
  button('clear-repository-selection', 'Clear selection', () => { selected.clear(); draw(); });
  const commit = async automatic => {
    if (busy) return;
    busy = true; buttons.forEach(button => { button.disabled = true; }); search.disabled = true; draw();
    try { await apply(automatic ? undefined : [...selected].sort()); }
    catch (error) { message(error.message, true); }
    finally { busy = false; buttons.forEach(button => { button.disabled = false; }); search.disabled = false; draw(); }
  };
  button('apply-repository-selection', 'Apply selection', () => commit(false));
  button('automatic-repositories', 'Use automatic selection', () => commit(true));
  search.addEventListener('input', draw);
  host.append(label, search, count, actions, list, help);
  return {
    update(account, pool, options, automaticPool) {
      repositories = pool.filter(repo => !repo.private && (options.repoSource !== 'pinned' || repo.pinned)).sort((a, b) => a.full_name.localeCompare(b.full_name));
      const next = JSON.stringify([account.toLowerCase(), options.repoSource, options.includeRepos, repositories.map(repo => repo.full_name), automaticPool.map(repo => repo.full_name)]);
      if (next === signature) return;
      signature = next;
      selected = new Set((options.includeRepos ? repositories.filter(repo => options.includeRepos.includes(repo.full_name) || options.includeRepos.includes(repo.name)) : automaticPool).map(repo => repo.full_name));
      search.value = ''; draw();
    },
  };
}
