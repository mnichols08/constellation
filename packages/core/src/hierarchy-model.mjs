export const HIERARCHY_VERSION = 1;
export function validateHierarchy(hierarchy, validateScene) {
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f]/.test(value);
  if (!hierarchy || hierarchy.version !== HIERARCHY_VERSION || !id(hierarchy.root) || !Array.isArray(hierarchy.scenes) || hierarchy.scenes.length < 1 || hierarchy.scenes.length > 64) throw new Error('Hierarchy requires a root and 1–64 scenes.');
  const scenes = new Map(); let nodes = 0;
  for (const entry of hierarchy.scenes) {
    if (!id(entry.id) || scenes.has(entry.id) || typeof entry.title !== 'string' || entry.title.length > 200 || entry.scene?.kind !== 'scene' || entry.scene.hierarchy !== undefined) throw new Error('Invalid or duplicate hierarchy scene.');
    validateScene?.(entry.scene); scenes.set(entry.id, entry);
    nodes += entry.scene.nodes.length + (entry.scene.timeline?.frames.reduce((sum, frame) => sum + frame.scene.nodes.length, 0) || 0);
    if (nodes > 16384) throw new Error('Hierarchy exceeds 16,384 aggregate nodes.');
  }
  if (!scenes.has(hierarchy.root)) throw new Error('Hierarchy root scene is missing.');
  const visiting = new Set(), visited = new Set();
  function visit(sceneId, depth) {
    if (visiting.has(sceneId)) throw new Error('Hierarchy contains a cycle.');
    if (depth > 16) throw new Error('Hierarchy exceeds 16 levels.');
    if (visited.has(sceneId)) return;
    const entry = scenes.get(sceneId); if (!entry) throw new Error(`Missing child scene: ${sceneId}`);
    visiting.add(sceneId);
    for (const node of entry.scene.nodes) if (node.interaction.childScene !== undefined) {
      if (!id(node.interaction.childScene)) throw new Error('Invalid child scene reference.');
      visit(node.interaction.childScene, depth + 1);
    }
    visiting.delete(sceneId); visited.add(sceneId);
  }
  for (const sceneId of scenes.keys()) visit(sceneId, 1);
  return hierarchy;
}
