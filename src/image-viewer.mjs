// Keep the original SVG in an image context: vector detail without interactive
// document links or scripts, separate from the studio's editable graph.
export function mountImageViewer(host) {
  const launch = document.createElement('button');
  launch.id = 'view-fullscreen'; launch.type = 'button'; launch.className = 'secondary';
  launch.textContent = 'View full screen'; host.append(launch);
  const dialog = document.createElement('dialog'); dialog.id = 'image-viewer';
  dialog.setAttribute('aria-labelledby', 'image-viewer-title');
  dialog.innerHTML = `<div class="image-viewer-toolbar">
    <h2 id="image-viewer-title">Constellation</h2>
    <div class="image-viewer-actions" role="group" aria-label="Image view controls">
      <button type="button" id="viewer-zoom-out" aria-label="Zoom out">−</button>
      <output id="viewer-zoom" aria-label="Zoom level"></output>
      <button type="button" id="viewer-zoom-in" aria-label="Zoom in">+</button>
      <button type="button" id="viewer-fit">Fit</button>
      <button type="button" id="viewer-actual">100%</button>
      <button type="button" id="viewer-close" autofocus>Close <span aria-hidden="true">×</span></button>
    </div>
  </div>
  <div class="image-viewer-stage" tabindex="0" aria-label="Constellation image. Drag to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, zero fits, one shows actual size." aria-describedby="image-viewer-help"><img draggable="false"></div>
  <p id="image-viewer-help">Drag to pan · Scroll or pinch to zoom · Double-click to zoom · 0 to fit · 1 for 100% · Esc to close</p>`;
  const surface = document.createElement('div'); surface.id = 'image-viewer-surface';
  surface.append(...dialog.childNodes); dialog.append(surface);
  document.body.append(dialog);
  const stage = dialog.querySelector('.image-viewer-stage'), img = stage.querySelector('img');
  const output = dialog.querySelector('output');
  let source = '', account = '', imageUrl, width = 900, height = 560;
  let scale = 1, x = 0, y = 0, fitted = true, previousOverflow = '', previousFocus, active = false;
  const pointers = new Map();
  const bounds = () => stage.getBoundingClientRect();
  const fitScale = () => Math.max(.01, Math.min((stage.clientWidth - 32) / width, (stage.clientHeight - 32) / height));
  function paint() {
    // Keep an edge reachable even after long drags or viewport changes.
    x = Math.max(32 - width * scale, Math.min(stage.clientWidth - 32, x));
    y = Math.max(32 - height * scale, Math.min(stage.clientHeight - 32, y));
    img.style.width = `${width * scale}px`; img.style.height = `${height * scale}px`;
    img.style.transform = `translate(${x}px, ${y}px)`;
    output.value = `${Math.round(scale * 100)}%`;
  }
  function center(nextScale) {
    scale = nextScale; x = (stage.clientWidth - width * scale) / 2; y = (stage.clientHeight - height * scale) / 2; paint();
  }
  function fit() { fitted = true; center(fitScale()); }
  function zoom(nextScale, px = stage.clientWidth / 2, py = stage.clientHeight / 2) {
    fitted = false;
    const next = Math.max(Math.min(.1, fitScale()), Math.min(32, nextScale));
    x = px - (px - x) * next / scale; y = py - (py - y) * next / scale; scale = next; paint();
  }
  function releaseImage() { if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = undefined; img.removeAttribute('src'); }
  function restoreFocus() { if (!dialog.open) previousFocus?.focus({ preventScroll: true }); }
  function close() {
    if (!dialog.open) return;
    if (document.fullscreenElement === surface) document.exitFullscreen().catch(() => {}).finally(() => requestAnimationFrame(restoreFocus));
    dialog.close();
    cleanup();
  }
  function cleanup() {
    if (dialog.open || !active) return;
    active = false;
    pointers.clear(); stage.classList.remove('dragging'); releaseImage();
    document.body.style.overflow = previousOverflow;
    restoreFocus();
    requestAnimationFrame(restoreFocus);
  }
  dialog.addEventListener('close', cleanup);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && dialog.open) close();
    else if (dialog.open && fitted) fit();
  });
  launch.addEventListener('click', () => {
    if (!source || dialog.open) return;
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
    width = viewBox?.[2] || parseFloat(svg.getAttribute('width')) || 900;
    height = viewBox?.[3] || parseFloat(svg.getAttribute('height')) || 560;
    previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
    active = true;
    document.body.style.overflow = 'hidden';
    imageUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    img.src = imageUrl; img.alt = `${account} GitHub constellation`;
    dialog.querySelector('h2').textContent = `${account} · Full-resolution view`;
    dialog.showModal(); fit();
    // A full-window dialog remains available if browser fullscreen is unavailable.
    surface.requestFullscreen?.().then(() => {
      if (!dialog.open && document.fullscreenElement === surface) document.exitFullscreen().catch(() => {});
    }).catch(() => {});
  });
  dialog.querySelector('#viewer-close').addEventListener('click', close);
  dialog.querySelector('#viewer-fit').addEventListener('click', fit);
  dialog.querySelector('#viewer-actual').addEventListener('click', () => { fitted = false; center(1); });
  dialog.querySelector('#viewer-zoom-in').addEventListener('click', () => zoom(scale * 1.25));
  dialog.querySelector('#viewer-zoom-out').addEventListener('click', () => zoom(scale / 1.25));
  stage.addEventListener('wheel', event => {
    event.preventDefault(); const rect = bounds();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
    zoom(scale * Math.exp(-Math.max(-250, Math.min(250, delta)) * .003), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false });
  stage.addEventListener('dblclick', event => { const rect = bounds(); zoom(scale * (event.shiftKey ? .5 : 2), event.clientX - rect.left, event.clientY - rect.top); });
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId); stage.classList.add('dragging'); stage.focus({ preventScroll: true }); event.preventDefault();
  });
  const gesture = () => {
    const [a, b = a] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture(); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); const after = gesture();
    fitted = false; x += after.x - before.x; y += after.y - before.y;
    if (pointers.size > 1 && before.distance > 0) { const rect = bounds(); zoom(scale * after.distance / before.distance, after.x - rect.left, after.y - rect.top); }
    else paint();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { pointers.delete(event.pointerId); if (!pointers.size) stage.classList.remove('dragging'); });
  dialog.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') zoom(scale * 1.25);
    else if (event.key === '-') zoom(scale / 1.25);
    else if (event.key === '0') fit();
    else if (event.key === '1') { fitted = false; center(1); }
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      fitted = false; const step = event.shiftKey ? 120 : 40;
      x += event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
      y += event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0; paint();
    } else return;
    event.preventDefault();
  });
  new ResizeObserver(() => { if (dialog.open) fitted ? fit() : paint(); }).observe(stage);
  return { update(svg, name) { source = svg; account = name; } };
}
