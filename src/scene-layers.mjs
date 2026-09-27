// Phases preserve the legacy camera and historical-animation boundaries.
// A logical layer may contribute more than one fragment (e.g. world dust and
// backdrop stars) while retaining one identity and one set of controls.
export const layerDefinitions = Object.freeze([
  ['background', ['backdrop']],
  ['effects', ['backdrop']],
  ['rings', ['world']],
  ['starfield', ['backdrop', 'world']],
  ['annotations', ['underlay', 'overlay']],
  ['connections', ['world']],
  ['nodes', ['world']],
  ['labels', ['world']],
  ['selection', ['interaction']],
].map(([id, phases], order) => Object.freeze({ id, type: id, order, phases: Object.freeze(phases) })));

export function createLayers() {
  return layerDefinitions.map(layer => ({ ...layer, phases: [...layer.phases] }));
}

export function composeLayers(scene, phase, fragments) {
  return scene.layers.filter(layer => layer.phases.includes(phase))
    .map(layer => fragments[layer.id] ?? '').join('');
}

export function selectionForScene(scene) {
  return scene.layers.some(layer => layer.id === 'selection') ? scene.presentation.options.selection : undefined;
}
