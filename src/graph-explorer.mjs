import { selectionCSS } from './selection.mjs';
import { graphSelection, rustAvailable } from './engine.mjs';
import { explainNode, explainEdge } from './evidence.mjs';

export function mountGraphExplorer(host, panel, selection, onSelect, { highlight = true, scene } = {}) {
  const shadow = host.shadowRoot;
  const svg = shadow.querySelector('svg');
  const nodes = [...svg.querySelectorAll('.repository')].filter(node => node.style.display !== 'none');
  const names = nodes.map(node => node.querySelector('.star').dataset.repo);
  const graphNames = [...new Set(names)];
  const metadata = new Map(nodes.map(node => {
    const star = node.querySelector('.star');
    return [star.dataset.repo, { label: star.dataset.label || star.dataset.repo, kind: star.dataset.kind || 'repository', members: JSON.parse(star.dataset.members || '[]'), commit: star.dataset.commit, detail: node.querySelector('title')?.textContent }];
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
  const edges = [...svg.querySelectorAll('.shared-language')].filter(edge => names.includes(edge.dataset.from) && names.includes(edge.dataset.to));
  const pairs = edges.flatMap(edge => [graphNames.indexOf(edge.dataset.from), graphNames.indexOf(edge.dataset.to)]);
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
    const related = new Set(start ? graphSelection(graphNames, pairs, start, end) : []);
    // Keep both endpoints visible when no path exists.
    if (start) related.add(start);
    if (end) related.add(end);
    const path = start && end ? graphSelection(graphNames, pairs, start, end) : [];
    const kind = metadata.get(start)?.kind;
    const category = kind && kind !== 'repository';
    svg.toggleAttribute('data-exploring', Boolean(start) && highlight);
    nodes.forEach((node, i) => {
      node.toggleAttribute('data-related', related.has(names[i]));
      node.setAttribute('aria-pressed', String(names[i] === start || names[i] === end));
    });
    for (const label of svg.querySelectorAll('.repo-label')) label.toggleAttribute('data-related', related.has(label.dataset.repo));
    for (const bridge of svg.querySelectorAll('.temporal-bridge')) bridge.toggleAttribute('data-related', bridge.dataset.nodeId === start);
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
    if (start && scene) {
      const explanation = explainNode(scene.kind === 'time-lapse' ? scene.latest : scene, start);
      if (explanation) {
        const disclosure = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = 'Why is this here?'; disclosure.append(summary);
        const addSection = (title, value) => { if (!value) return; const heading = document.createElement('h4'); heading.textContent = title; const text = document.createElement('p'); text.textContent = value; disclosure.append(heading, text); };
        addSection('Included', explanation.included.summary);
        addSection('Position', explanation.position.summary);
        if (explanation.position.evidence?.length) addSection('Evidence', explanation.position.evidence.join(' · '));
        for (const [channel, visual] of Object.entries(explanation.appearance || {})) {
          const details = [visual.summary];
          if (visual.input !== undefined) details.push(`Input: ${visual.input}.`);
          if (visual.scale) details.push(`Scale: ${visual.scale}.`);
          if (visual.fallback !== undefined) details.push(`Fallback: ${visual.fallback}.`);
          if (visual.rendered !== undefined) details.push(`Rendered: ${visual.rendered}.`);
          addSection(channel[0].toUpperCase() + channel.slice(1), details.join(' '));
        }
        if (selection.end && scene.kind !== 'time-lapse') {
          const reasons = path.slice(1).flatMap((to, index) => {
            const from = path[index], edge = scene.edges.find(item => item.from === from && item.to === to || item.to === from && item.from === to);
            return edge ? explainEdge(scene, edge.id)?.evidence || [] : [];
          });
          addSection('Connection', reasons.length ? `Shared metadata: ${reasons.join(' · ')}` : 'Explanation unavailable for this connection type.');
        }
        panel.append(disclosure);
      }
    }
    if (start && svg.querySelector('[data-temporal-year]')) {
      const years = nodes.filter(node => node.querySelector('.star').dataset.repo === start).map(node => Number(node.dataset.year));
      const history = document.createElement('p'); history.textContent = `First visible: ${Math.min(...years)}. Present through: ${Math.max(...years)}. Visible in: ${years.length} yearly layers. First visibility is limited to this window.`; panel.append(history);
    }
    if (start) {
      const selected = metadata.get(start);
      if (selected.kind === 'commit' && /^[a-z\d][a-z\d-]*\/[a-z\d_.-]+\/commit\/[a-f\d]{40,64}$/i.test(selected.commit || '')) {
        const detail = document.createElement('p'); detail.textContent = selected.detail;
        const link = document.createElement('a'); link.textContent = 'Open commit on GitHub'; link.href = `https://github.com/${selected.commit}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
        panel.append(detail, link);
      }
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
      if (category && kind !== 'commit') {
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
