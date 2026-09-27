// This function is also embedded verbatim into standalone HTML. Keep dependencies
// explicit in its arguments and use DOM text APIs for all scene-provided content.
export function mountInteractive(root, source, options = {}) {
  const scene = source.kind === 'time-lapse' ? source.latest : source;
  const svg = root.querySelector('[data-canvas] > svg');
  if (!svg) throw new Error('Interactive view requires a rendered scene.');
  const abort = new AbortController();
  const listen = (target, type, handler, settings = {}) => target.addEventListener(type, handler, { ...settings, signal: abort.signal });
  const status = root.querySelector('[data-status]');
  const details = root.querySelector('[data-details]');
  const base = [...scene.viewport.viewBox];
  const records = new Map(scene.nodes.map(node => [node.id, node]));
  const groups = [...svg.querySelectorAll('.repository')].filter(group => group.style.display !== 'none');
  const allIds = [...new Set(groups.map(group => group.querySelector('.star')?.dataset.repo).filter(id => records.has(id)))];
  let ids = [...allIds];
  const groupId = group => group.querySelector('.star')?.dataset.repo;
  let camera = [...base], selected = null, endpoint = null, path = [], dragging = null, moved = false;
  const edges = [...svg.querySelectorAll('.shared-language')].filter(edge => ids.includes(edge.dataset.from) && ids.includes(edge.dataset.to));
  let pairs = Uint32Array.from(edges.flatMap(edge => [ids.indexOf(edge.dataset.from), ids.indexOf(edge.dataset.to)]));
  let filter = { query: '', language: '' }, theme = 'original';
  const announce = text => { if (status) status.textContent = text; };
  const emit = (type, detail) => root.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  const applyCamera = () => { svg.setAttribute('viewBox', camera.join(' ')); emit('camera-change', { viewBox: [...camera] }); };
  function setCamera(value) {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isFinite) || value[2] <= 0 || value[3] <= 0) throw new Error('Invalid camera viewBox.');
    camera = [...value]; applyCamera();
  }
  function zoom(factor, point) {
    const width = Math.max(base[2] / 20, Math.min(base[2] * 4, camera[2] * factor));
    const ratio = width / camera[2], anchor = point || [camera[0] + camera[2] / 2, camera[1] + camera[3] / 2];
    camera = [anchor[0] - (anchor[0] - camera[0]) * ratio, anchor[1] - (anchor[1] - camera[1]) * ratio, width, camera[3] * ratio]; applyCamera();
  }
  function screenPoint(x, y) {
    const point = svg.createSVGPoint(); point.x = x; point.y = y;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }
  function focusNode(id) {
    const record = records.get(id); if (!record) return;
    const target = groups.find(group => groupId(group) === id && group.getBoundingClientRect().width > 0);
    const box = target?.getBoundingClientRect();
    const point = box ? screenPoint(box.x + box.width / 2, box.y + box.height / 2) : record.geometry;
    const width = Math.min(camera[2], base[2] / 3), height = width * base[3] / base[2];
    setCamera([point.x - width / 2, point.y - height / 2, width, height]);
  }
  function showDetails(id) {
    if (!details) return;
    details.replaceChildren();
    if (!id) return;
    const record = records.get(id), metadata = record.metadata;
    const heading = document.createElement('h2'); heading.textContent = metadata.name || id;
    const description = document.createElement('p'); description.textContent = metadata.description || '';
    const summary = document.createElement('p'); summary.textContent = [metadata.language, Number.isFinite(metadata.stargazers_count) ? `${metadata.stargazers_count} stars` : null].filter(Boolean).join(' · ');
    details.append(heading, description, summary);
    if (typeof metadata.html_url === 'string') {
      try {
        const url = new URL(metadata.html_url);
        if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
          const link = document.createElement('a'); link.href = url.href; link.textContent = 'Open project'; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link);
        }
      } catch { /* Non-URL source metadata stays plain text. */ }
    }
  }
  function highlight() {
    const engine = options.engine;
    const indices = selected && engine ? endpoint
      ? engine.shortest_path(ids.length, pairs, ids.indexOf(selected), ids.indexOf(endpoint))
      : engine.neighbors(ids.length, pairs, ids.indexOf(selected)) : [];
    path = endpoint ? Array.from(indices, index => ids[index]) : [];
    const related = new Set(Array.from(indices, index => ids[index]));
    if (selected) related.add(selected);
    if (endpoint) related.add(endpoint);
    const enabled = scene.layers.find(layer => layer.id === 'selection')?.visible !== false;
    svg.toggleAttribute('data-interactive-selection', Boolean(selected && engine && enabled));
    for (const group of groups) {
      group.toggleAttribute('data-related', related.has(groupId(group)));
      group.setAttribute('aria-pressed', String(groupId(group) === selected || groupId(group) === endpoint));
    }
    for (const label of svg.querySelectorAll('.repo-label')) label.toggleAttribute('data-related', related.has(label.dataset.repo));
    for (const edge of edges) {
      const { from, to } = edge.dataset;
      edge.toggleAttribute('data-related', endpoint ? path.some((id, i) => i > 0 && ((path[i - 1] === from && id === to) || (path[i - 1] === to && id === from))) : from === selected || to === selected);
    }
  }
  function selectNode(id, { focus = true, extend = false } = {}) {
    if (!records.has(id) || !ids.includes(id)) throw new Error(`Unknown or hidden node: ${id}`);
    if (extend && selected) endpoint = id;
    else { selected = id; endpoint = null; }
    svg.removeAttribute('data-exploring');
    highlight(); showDetails(id);
    if (focus) focusNode(id);
    announce(endpoint ? path.length ? `${path.length - 1} connections: ${path.map(id => records.get(id).metadata.name).join(' → ')}` : 'No path between the selected nodes.' : `${records.get(id).metadata.name}. Shift-select another node to trace a path.`);
    emit('node-select', { id, node: structuredClone(records.get(id)), start: selected, end: endpoint, path: [...path] });
  }
  function clearSelection() {
    selected = null; endpoint = null; svg.removeAttribute('data-exploring');
    highlight(); showDetails(null);
    announce('Selection cleared.'); emit('node-select', { id: null, node: null });
  }
  function fit() {
    const visible = scene.nodes.filter(node => ids.includes(node.id));
    if (!visible.length) return setCamera(base);
    const left = Math.min(...visible.map(node => node.geometry.x - node.geometry.radius)) - 30;
    const right = Math.max(...visible.map(node => node.geometry.x + node.geometry.radius)) + 30;
    const top = Math.min(...visible.map(node => node.geometry.y - node.geometry.radius)) - 30;
    const bottom = Math.max(...visible.map(node => node.geometry.y + node.geometry.radius)) + 30;
    const width = Math.max(right - left, (bottom - top) * base[2] / base[3]), height = width * base[3] / base[2];
    setCamera([(left + right - width) / 2, (top + bottom - height) / 2, width, height]);
  }
  function reset() { clearSelection(); setCamera(base); }
  function setFilter(value = {}) {
    if (typeof value.query !== 'undefined' && typeof value.query !== 'string' || typeof value.language !== 'undefined' && typeof value.language !== 'string') throw new Error('Filter query and language must be text.');
    filter = { query: value.query || '', language: value.language || '' };
    const query = filter.query.trim().toLowerCase();
    ids = allIds.filter(id => {
      const data = records.get(id).metadata;
      return (!query || `${id} ${data.name} ${data.description || ''}`.toLowerCase().includes(query)) && (!filter.language || data.language === filter.language);
    });
    const visible = new Set(ids);
    for (const group of groups) { group.toggleAttribute('data-filtered', !visible.has(groupId(group))); group.setAttribute('tabindex', groupId(group) === ids[0] ? '0' : '-1'); }
    for (const label of svg.querySelectorAll('.repo-label')) label.toggleAttribute('data-filtered', !visible.has(label.dataset.repo));
    for (const edge of edges) edge.toggleAttribute('data-filtered', !visible.has(edge.dataset.from) || !visible.has(edge.dataset.to));
    pairs = Uint32Array.from(edges.filter(edge => !edge.hasAttribute('data-filtered')).flatMap(edge => [ids.indexOf(edge.dataset.from), ids.indexOf(edge.dataset.to)]));
    if (selected && !visible.has(selected) || endpoint && !visible.has(endpoint)) clearSelection();
    else highlight();
    const search = root.querySelector('[data-search]'), language = root.querySelector('[data-language]');
    if (search) search.value = filter.query;
    if (language) language.value = filter.language;
    announce(`${ids.length} of ${allIds.length} nodes visible.`); emit('filter-change', { ...filter, visible: ids.length });
  }
  function setTheme(value) {
    const palettes = { midnight: { background: '#111111', foreground: '#f3f3f4', accent: '#e3de13', line: '#555a38', star: '#e3de13' }, light: { background: '#fafaf3', foreground: '#202516', accent: '#595600', line: '#838d66', star: '#8b8500' } };
    if (value !== 'original' && !Object.hasOwn(palettes, value)) throw new Error('Unknown interactive theme.');
    theme = value;
    for (const key of Object.keys(palettes.midnight)) {
      if (value === 'original') svg.style.removeProperty(`--sky-${key}`);
      else svg.style.setProperty(`--sky-${key}`, palettes[value][key]);
    }
    svg.style.background = value === 'original' ? '' : palettes[value].background;
    root.dataset.theme = value;
    const control = root.querySelector('[data-theme]'); if (control) control.value = value;
    emit('theme-change', { theme });
  }
  const search = root.querySelector('[data-search]'), language = root.querySelector('[data-language]'), themeControl = root.querySelector('[data-theme]');
  if (search) listen(search, 'input', () => setFilter({ ...filter, query: search.value }));
  if (language) {
    for (const name of [...new Set(scene.nodes.map(node => node.metadata.language).filter(value => typeof value === 'string' && value))].sort()) {
      const option = document.createElement('option'); option.value = name; option.textContent = name; language.append(option);
    }
    listen(language, 'change', () => setFilter({ ...filter, language: language.value }));
  }
  if (themeControl) listen(themeControl, 'change', () => setTheme(themeControl.value));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const updateMotion = () => { root.toggleAttribute('data-reduced-motion', motion.matches); if (motion.matches) { svg.pauseAnimations?.(); svg.setCurrentTime?.(0); } else svg.unpauseAnimations?.(); };
  listen(motion, 'change', updateMotion); updateMotion();
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; emit('view-resize', { width, height }); }) : null;
  resize?.observe(root.querySelector('[data-canvas]'));
  svg.setAttribute('role', 'group'); svg.setAttribute('tabindex', '0');
  for (const group of groups) {
    const id = groupId(group), record = records.get(id);
    if (!record) continue;
    group.setAttribute('role', 'button'); group.setAttribute('tabindex', id === ids[0] ? '0' : '-1');
    group.setAttribute('aria-label', `${record.metadata.name}. Select and focus.`); group.setAttribute('aria-pressed', 'false');
    listen(group, 'click', event => { if (!moved) { event.stopPropagation(); selectNode(id, { extend: event.shiftKey }); } });
    listen(group, 'pointerenter', () => { announce(record.metadata.name); emit('node-hover', { id }); });
    listen(group, 'pointerleave', () => emit('node-hover', { id: null }));
    listen(group, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(id, { extend: event.shiftKey }); }
      if (event.key === 'Escape') { event.preventDefault(); clearSelection(); }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const index = ids.indexOf(id), next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + ids.length) % ids.length;
        for (const node of groups) node.tabIndex = groupId(node) === ids[next] ? 0 : -1;
        groups.find(node => groupId(node) === ids[next] && node.getBoundingClientRect().width > 0)?.focus();
      }
    });
  }
  listen(svg, 'wheel', event => { event.preventDefault(); const point = screenPoint(event.clientX, event.clientY); zoom(Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * .002), [point.x, point.y]); }, { passive: false });
  listen(svg, 'pointerdown', event => {
    if (event.button !== 0 || event.target.closest('a')) return;
    moved = false; const matrix = svg.getScreenCTM();
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: [...camera], sx: matrix.a, sy: matrix.d };
  });
  listen(svg, 'pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
    if (Math.hypot(dx, dy) > 4) { moved = true; svg.setPointerCapture(event.pointerId); }
    if (moved) setCamera([dragging.camera[0] - dx / dragging.sx, dragging.camera[1] - dy / dragging.sy, dragging.camera[2], dragging.camera[3]]);
  });
  const endDrag = event => { if (dragging?.id === event.pointerId) { if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); dragging = null; } };
  listen(svg, 'pointerup', endDrag); listen(svg, 'pointercancel', endDrag);
  for (const button of root.querySelectorAll('[data-action]')) listen(button, 'click', () => {
    ({ 'zoom-in': () => zoom(.8), 'zoom-out': () => zoom(1.25), fit, reset, clear: clearSelection })[button.dataset.action]?.();
  });
  listen(svg, 'keydown', event => {
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.8); }
    if (event.key === '-') { event.preventDefault(); zoom(1.25); }
    if (event.key === 'Escape') clearSelection();
  });
  const api = { selectNode, clearSelection, fit, reset, setCamera, setFilter, setTheme, get filter() { return { ...filter }; }, get theme() { return theme; }, get camera() { return [...camera]; }, get selection() { return selected; }, get selectionState() { return { start: selected, end: endpoint, path: [...path] }; }, destroy() { abort.abort(); resize?.disconnect(); dragging = null; delete root.constellation; } };
  root.constellation = api;
  announce('Select a node to focus. Drag to pan; use the zoom controls or mouse wheel.');
  if (options.emitReady !== false) emit('scene-ready', { nodes: ids.length });
  return api;
}

export const interactiveStyles = `
.constellation-runtime{font:14px system-ui,sans-serif;color:#e9edf5;background:#11151e;border-radius:12px;overflow:hidden;max-width:1200px;margin:auto}
.constellation-toolbar{display:flex;gap:8px;flex-wrap:wrap;padding:12px;align-items:center}
.constellation-toolbar button{font:inherit;color:inherit;background:#283143;border:1px solid #52617c;border-radius:6px;padding:8px 12px;cursor:pointer}
.constellation-toolbar input,.constellation-toolbar select{font:inherit;max-width:180px;padding:6px;border-radius:4px}.constellation-toolbar label{display:flex;gap:6px;align-items:center}
.constellation-runtime [data-filtered]{display:none!important}
.constellation-toolbar button:focus-visible,.constellation-runtime .repository:focus-visible{outline:3px solid #a9cdfb;outline-offset:3px}
.constellation-canvas{height:70vh;min-height:280px;overflow:hidden}
.constellation-canvas>svg{display:block;width:100%;height:100%;touch-action:none}
[data-viewports][data-comparing]{display:grid;grid-template-columns:1fr 1fr}[data-viewports]>[hidden]{display:none!important}
@media(max-width:600px){[data-viewports][data-comparing]{grid-template-columns:1fr}}
.constellation-runtime .repository{cursor:pointer}.constellation-runtime .repository[aria-pressed=true] .star-halo{opacity:.55}
.constellation-status{padding:8px 16px;min-height:1.5em;margin:0}
.constellation-details{padding:0 16px 16px}.constellation-details:empty{display:none}.constellation-details a{color:#a9cdfb}
[data-interactive-selection] .repository:not([data-related]),[data-interactive-selection] .repo-label:not([data-related]){opacity:.2}
[data-interactive-selection] .shared-language:not([data-related]){opacity:.07}
@media(prefers-reduced-motion:reduce){.constellation-runtime *{scroll-behavior:auto;transition:none!important;animation:none!important}}
`;
