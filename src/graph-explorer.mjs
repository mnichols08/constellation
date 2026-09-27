import { selectionCSS } from './selection.mjs';
import { graphSelection, rustAvailable } from './engine.mjs';

export function mountGraphExplorer(host, panel, selection, onSelect, { highlight = true } = {}) {
  const shadow = host.shadowRoot;
  const svg = shadow.querySelector('svg');
  const nodes = [...svg.querySelectorAll('.repository')];
  const names = nodes.map(node => node.querySelector('.star').dataset.repo);
  const metadata = new Map(nodes.map(node => {
    const star = node.querySelector('.star');
    return [star.dataset.repo, { label: star.dataset.label || star.dataset.repo, kind: star.dataset.kind || 'repository', members: JSON.parse(star.dataset.members || '[]') }];
  }));
  const label = name => metadata.get(name)?.label || name;
  function select(name, event) {
    selection = event.shiftKey && selection.start && rustAvailable
      ? { start: selection.start, end: name }
      : { start: selection.start === name && !selection.end ? null : name };
    onSelect(selection); display();
  }
  selection = { start: names.includes(selection.start) ? selection.start : null, end: names.includes(selection.end) ? selection.end : null };
  if (!selection.start) selection.end = null;
  onSelect(selection);
  const edges = [...svg.querySelectorAll('.shared-language')];
  const pairs = edges.flatMap(edge => [names.indexOf(edge.dataset.from), names.indexOf(edge.dataset.to)]);
  const style = document.createElement('style');
  style.textContent = `
    .repository{cursor:pointer}.repository:focus-visible{outline:2px solid var(--sky-accent);outline-offset:4px}.repository:focus-visible .star-halo{opacity:.65}
    .explore-hit{fill:transparent;pointer-events:all}
    ${selectionCSS}
    .repository,.repo-label,.shared-language{transition:opacity .18s ease}
    @media(prefers-reduced-motion:reduce){.repository,.repo-label,.shared-language{transition:none}}
  `;
  shadow.append(style);

  function display() {
    const start = names.includes(selection.start) ? selection.start : null;
    const end = names.includes(selection.end) ? selection.end : null;
    const related = new Set(start ? graphSelection(names, pairs, start, end) : []);
    // Keep both endpoints visible when no path exists.
    if (start) related.add(start);
    if (end) related.add(end);
    const path = start && end ? graphSelection(names, pairs, start, end) : [];
    const kind = metadata.get(start)?.kind;
    const category = kind && kind !== 'repository';
    svg.toggleAttribute('data-exploring', Boolean(start) && highlight);
    nodes.forEach((node, i) => {
      node.toggleAttribute('data-related', related.has(names[i]));
      node.setAttribute('aria-pressed', String(names[i] === start || names[i] === end));
    });
    for (const label of svg.querySelectorAll('.repo-label')) label.toggleAttribute('data-related', related.has(label.dataset.repo));
    for (const edge of edges) {
      const { from, to } = edge.dataset;
      const shown = end ? path.some((name, i) => i > 0 && ((path[i - 1] === from && name === to) || (path[i - 1] === to && name === from)))
        : from === start || to === start;
      edge.toggleAttribute('data-related', Boolean(start && shown));
    }
    panel.replaceChildren();
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = !start ? `Click a node to reveal its connections and choose its color.${rustAvailable ? ' Shift-click another to trace the shortest path.' : ''}`
      : end ? path.length ? `${path.length - 1} connection${path.length === 2 ? '' : 's'}: ${path.map(label).join(' → ')}`
        : `No path between ${label(start)} and ${label(end)} in the displayed connections.`
      : `${label(start)}: ${related.size - 1} connected node${related.size === 2 ? '' : 's'}.`;
    panel.append(status);
    if (start) {
      const list = document.createElement('div'); list.className = 'related-projects';
      for (const name of related) {
        if (metadata.get(name).kind !== 'repository') {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label(name);
          button.addEventListener('click', event => select(name, event));
          list.append(button); continue;
        }
        const link = document.createElement('a');
        link.href = `https://github.com/${name.split('/').map(encodeURIComponent).join('/')}`;
        link.textContent = label(name); link.target = '_blank'; link.rel = 'noopener noreferrer';
        list.append(link);
      }
      panel.append(list);
      if (category) {
        const heading = document.createElement('p'); heading.textContent = `Repositories with ${label(start)} (${metadata.get(start).members.length}):`;
        const members = document.createElement('div'); members.className = 'related-projects member-repositories';
        for (const repo of metadata.get(start).members) {
          const link = document.createElement('a'); link.textContent = repo;
          link.href = `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}`;
          link.target = '_blank'; link.rel = 'noopener noreferrer'; members.append(link);
        }
        panel.append(heading, members);
      }
      const exportNote = document.createElement('p'); exportNote.className = 'export-note'; exportNote.textContent = 'SVG and workflow downloads include this selected view. Clear selection to export the full constellation.'; panel.append(exportNote);
      const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear selection';
      clear.addEventListener('click', () => { selection = {}; onSelect(selection); display(); nodes[0]?.focus(); });
      panel.append(clear);
    }
  }
  nodes.forEach((node, index) => {
    const star = node.querySelector('.star');
    if (!node.querySelector('.star-hit')) {
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      for (const attribute of ['cx', 'cy']) hit.setAttribute(attribute, star.getAttribute(attribute));
      for (const animation of star.querySelectorAll('animate')) hit.append(animation.cloneNode(true));
      hit.setAttribute('r', '13'); hit.setAttribute('class', 'explore-hit'); node.append(hit);
    }
    node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `${label(names[index])}, ${metadata.get(names[index]).kind}. Select to show connections and edit color.${rustAvailable ? ' Shift-select a second node to trace a path.' : ''}${node.classList.contains('draggable') ? ' Drag or use arrow keys to move this node and its label together.' : ''}`);
    node.addEventListener('click', event => select(names[index], event));
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(names[index], event); }
      if (event.key === 'Escape') { selection = {}; onSelect(selection); display(); }
    });
  });
  display();
}
