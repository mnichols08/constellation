// Scene records are data. They contain neither executable callbacks nor SVG.
export function serializeScene(scene) {
  return JSON.stringify(scene, null, 2) + '\n';
}
