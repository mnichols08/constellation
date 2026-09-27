// Embedded with the standalone runtime; pass functions explicitly, never evaluate config.
export function mountTimeline(root, source, options, mount) {
  if (!source.timeline) return mount(root, source, options);
  const frames = source.timeline.frames;
  const abort = new AbortController();
  const controls = document.createElement('div'); controls.className = 'constellation-toolbar'; controls.setAttribute('aria-label', 'Timeline');
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = 'Previous date';
  const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Next date';
  const label = document.createElement('span'); label.setAttribute('role', 'status');
  controls.append(previous, label, next); root.prepend(controls);
  let index = frames.length - 1, runtime;
  function setFrame(value) {
    if (!Number.isInteger(value) || value < 0 || value >= frames.length) throw new Error('Invalid timeline frame.');
    runtime?.destroy(); index = value;
    root.querySelector('[data-canvas]').innerHTML = options.frameSVGs[index];
    const languages = root.querySelector('[data-language]'); if (languages) while (languages.options.length > 1) languages.remove(1);
    runtime = mount(root, frames[index].scene, { ...options, emitReady: false });
    label.textContent = `${frames[index].date.slice(0, 10)} · ${frames[index].evidence === 'snapshot' ? 'Historical snapshot' : frames[index].evidence === 'current' ? 'Current metadata' : 'Creation-date view using current metadata'}`;
    previous.disabled = index === 0; next.disabled = index === frames.length - 1;
    root.constellation = api;
    root.dispatchEvent(new CustomEvent('timeline-change', { detail: { index, date: frames[index].date, evidence: frames[index].evidence }, bubbles: true, composed: true }));
  }
  const api = { setFrame, get frameIndex() { return index; }, get selection() { return runtime.selection; }, get selectionState() { return runtime.selectionState; }, get camera() { return runtime.camera; }, get filter() { return runtime.filter; }, get theme() { return runtime.theme; }, destroy() { abort.abort(); runtime?.destroy(); controls.remove(); } };
  for (const method of ['selectNode', 'clearSelection', 'fit', 'reset', 'setCamera', 'setFilter', 'setTheme']) api[method] = (...args) => runtime[method](...args);
  previous.addEventListener('click', () => setFrame(index - 1), { signal: abort.signal });
  next.addEventListener('click', () => setFrame(index + 1), { signal: abort.signal });
  setFrame(index);
  if (options.emitReady !== false) root.dispatchEvent(new CustomEvent('scene-ready', { detail: { frames: frames.length }, bubbles: true, composed: true }));
  return api;
}
