import { createLayers, layerDefinitions } from './scene-layers.mjs';
import { sceneStatistics } from './scene.mjs';

const descriptions = {
  background: ['The base canvas and nebula.', 'design-visualTheme'],
  effects: ['Background decoration, such as a galaxy or grid.', 'design-effect'],
  starfield: ['Background stars and classic dust.', 'design-sky-mode'],
  rings: ['Identity rings and placement anchors.', 'identity-ring'],
  connections: ['Shared relationships and optional visual bridges.', 'connection-density'],
  nodes: ['Project and category markers, including their activity effects.', 'design-nodeSize'],
  labels: ['Project names. Labels can remain visible when nodes are hidden.', 'show-labels'],
  annotations: ['History, rhythm, legends and captions. The project credit stays visible.', 'design-legend'],
  selection: ['Highlight the selected neighborhood or path.', 'color-node'],
};

export function mountStudioLayers(host, changed, reveal) {
  let settings = {};
  const details = document.createElement('details'); details.className = 'control-section'; details.id = 'layer-controls';
  const summary = document.createElement('summary'); summary.textContent = 'Scene layers';
  const body = document.createElement('div'); body.className = 'control-section-body';
  details.append(summary, body); host.append(details);
  const stats = document.createElement('p'); stats.id = 'scene-summary'; stats.className = 'export-note'; body.append(stats);
  function field(id, text, type) {
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = text;
    const input = document.createElement(type === 'select' ? 'select' : 'input'); input.id = id;
    if (type !== 'select') input.type = type;
    body.append(label, input); return input;
  }
  const select = field('layer-select', 'Choose a layer', 'select');
  for (const layer of layerDefinitions) {
    const option = document.createElement('option'); option.value = layer.id; option.textContent = layer.id[0].toUpperCase() + layer.id.slice(1); select.append(option);
  }
  const description = document.createElement('p'); description.id = 'layer-description'; description.className = 'export-note'; body.append(description);
  select.setAttribute('aria-describedby', description.id);
  const visible = field('layer-visible', 'Show layer', 'checkbox');
  const opacity = field('layer-opacity', 'Opacity', 'range'); opacity.min = '0'; opacity.max = '1'; opacity.step = '0.05';
  const value = document.createElement('output'); value.htmlFor = opacity.id; body.append(value);
  const order = field('layer-order', 'Order priority', 'number'); order.min = '-1000'; order.max = '1000'; order.step = '1';
  const note = document.createElement('p'); note.className = 'export-note'; note.textContent = 'Lower priorities draw first within each pass. Backgrounds stay behind decoration; connections stay behind nodes and labels.'; body.append(note);
  const error = document.createElement('p'); error.id = 'layer-error'; error.setAttribute('role', 'status'); body.append(error);
  const edit = document.createElement('button'); edit.id = 'layer-edit-settings'; edit.type = 'button'; edit.className = 'secondary'; edit.textContent = 'Open layer settings';
  edit.addEventListener('click', () => reveal(descriptions[select.value][1])); body.append(edit);
  const reset = document.createElement('button'); reset.id = 'layer-reset'; reset.type = 'button'; reset.className = 'secondary'; reset.textContent = 'Reset this layer';
  reset.addEventListener('click', () => {
    const next = structuredClone(settings); delete next[select.value];
    commit(next);
  }); body.append(reset);
  function sync() {
    const id = select.value, current = settings[id] || {};
    description.textContent = descriptions[id][0];
    visible.checked = current.visible ?? true;
    opacity.value = String(current.opacity ?? 1); opacity.disabled = id === 'selection';
    value.value = `${Math.round(Number(opacity.value) * 100)}%`;
    order.value = String(current.order ?? layerDefinitions.find(layer => layer.id === id).order);
  }
  function commit(next) {
    try {
      createLayers(next);
      settings = next; error.textContent = ''; sync(); changed();
    } catch (cause) { error.textContent = cause.message; sync(); }
  }
  select.addEventListener('change', () => { error.textContent = ''; sync(); });
  for (const [input, key, read] of [[visible, 'visible', () => visible.checked], [opacity, 'opacity', () => Number(opacity.value)], [order, 'order', () => Number(order.value)]]) {
    input.addEventListener(input === order ? 'change' : 'input', () => commit({ ...settings, [select.value]: { ...settings[select.value], [key]: read() } }));
  }
  sync();
  return {
    read: () => ({ layers: structuredClone(settings) }),
    restore(options) { createLayers(options.layers); settings = structuredClone(options.layers || {}); error.textContent = ''; sync(); },
    update(scene) {
      const report = sceneStatistics(scene);
      stats.textContent = `${report.visibleNodes} visible nodes · ${report.edges} relationships · ${report.layers.length} layers`;
    },
  };
}
