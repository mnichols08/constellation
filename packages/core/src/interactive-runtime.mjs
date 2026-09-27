// This function is also embedded verbatim into standalone HTML. Keep dependencies
// explicit in its arguments and use DOM text APIs for all scene-provided content.
export function mountInteractive(root, source, options = {}) {
  const scene = source.kind === 'time-lapse' ? source.latest : source;
  const svg = root.querySelector('[data-canvas] > svg');
  if (!svg) throw new Error('Interactive view requires a rendered scene.');
  const abort = new AbortController();
  const listen = (target, type, handler, settings = {}) => target.addEventListener(type, handler, { ...settings, signal: abort.signal });
  const status = root.querySelector('[data-status]');
  const base = [...scene.viewport.viewBox];
  const records = new Map(scene.nodes.map(node => [node.id, node]));
  const groups = [...svg.querySelectorAll('.repository')].filter(group => group.style.display !== 'none');
  const ids = [...new Set(groups.map(group => group.querySelector('.star')?.dataset.repo).filter(id => records.has(id)))];
  const groupId = group => group.querySelector('.star')?.dataset.repo;
  let camera = [...base], selected = null, dragging = null, moved = false;
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
  function selectNode(id, { focus = true } = {}) {
    if (!records.has(id) || !ids.includes(id)) throw new Error(`Unknown or hidden node: ${id}`);
    selected = id;
    svg.removeAttribute('data-exploring');
    for (const group of groups) group.setAttribute('aria-pressed', String(groupId(group) === id));
    if (focus) focusNode(id);
    announce(records.get(id).metadata.name);
    emit('node-select', { id, node: structuredClone(records.get(id)) });
  }
  function clearSelection() {
    selected = null; svg.removeAttribute('data-exploring');
    for (const group of groups) group.setAttribute('aria-pressed', 'false');
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
  svg.setAttribute('role', 'group'); svg.setAttribute('tabindex', '0');
  for (const group of groups) {
    const id = groupId(group), record = records.get(id);
    if (!record) continue;
    group.setAttribute('role', 'button'); group.setAttribute('tabindex', id === ids[0] ? '0' : '-1');
    group.setAttribute('aria-label', `${record.metadata.name}. Select and focus.`); group.setAttribute('aria-pressed', 'false');
    listen(group, 'click', event => { if (!moved) { event.stopPropagation(); selectNode(id); } });
    listen(group, 'pointerenter', () => { announce(record.metadata.name); emit('node-hover', { id }); });
    listen(group, 'pointerleave', () => emit('node-hover', { id: null }));
    listen(group, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(id); }
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
  const api = { selectNode, clearSelection, fit, reset, setCamera, get camera() { return [...camera]; }, get selection() { return selected; }, destroy() { abort.abort(); dragging = null; delete root.constellation; } };
  root.constellation = api;
  announce('Select a node to focus. Drag to pan; use the zoom controls or mouse wheel.');
  emit('scene-ready', { nodes: ids.length });
  return api;
}

export const interactiveStyles = `
.constellation-runtime{font:14px system-ui,sans-serif;color:#e9edf5;background:#11151e;border-radius:12px;overflow:hidden;max-width:1200px;margin:auto}
.constellation-toolbar{display:flex;gap:8px;flex-wrap:wrap;padding:12px;align-items:center}
.constellation-toolbar button{font:inherit;color:inherit;background:#283143;border:1px solid #52617c;border-radius:6px;padding:8px 12px;cursor:pointer}
.constellation-toolbar button:focus-visible,.constellation-runtime .repository:focus-visible{outline:3px solid #a9cdfb;outline-offset:3px}
.constellation-canvas{height:70vh;min-height:280px;overflow:hidden}
.constellation-canvas>svg{display:block;width:100%;height:100%;touch-action:none}
.constellation-runtime .repository{cursor:pointer}.constellation-runtime .repository[aria-pressed=true] .star-halo{opacity:.55}
.constellation-status{padding:8px 16px;min-height:1.5em;margin:0}
@media(prefers-reduced-motion:reduce){.constellation-runtime *{scroll-behavior:auto;transition:none!important}}
`;
