import { seededRandom } from './seeded-random.mjs';
import { compareRepositories } from './repository-filters.mjs';

export const artifactLayouts = ['galaxy', 'solar-system'];
// Feed deterministic positions into the existing Rust scene/relationship engine.
// Manual positions remain the final override, so dragging works in every layout.
export function artifactPositions(nodes, mode, seed, compact = false, metric = 'stars') {
  if (!artifactLayouts.includes(mode)) return {};
  const ordered = [...nodes].sort((a, b) => compareRepositories(a, b, metric));
  const yCenter = compact ? 126 : 270, yScale = compact ? 78 : 185;
  const random = seededRandom(seed), phase = random() * Math.PI * 2;
  const result = {};
  if (mode === 'galaxy') {
    const groups = [...new Set(ordered.map(node => node.language || node.nodeKind || 'Other'))].sort();
    for (const [groupIndex, group] of groups.entries()) {
      const members = ordered.filter(node => (node.language || node.nodeKind || 'Other') === group);
      const angle = phase + groupIndex * Math.PI * 2 / groups.length;
      const cx = groups.length === 1 ? 0 : Math.cos(angle) * .6, cy = groups.length === 1 ? 0 : Math.sin(angle) * .6;
      members.forEach((node, i) => {
        const distance = Math.sqrt(i / Math.max(1, members.length)) * (groups.length === 1 ? .88 : .3);
        const theta = phase + i * 2.399963;
        result[node.full_name] = { x: 450 + 365 * (cx + Math.cos(theta) * distance), y: yCenter + yScale * (cy + Math.sin(theta) * distance) };
      });
    }
  } else {
    const majors = ordered.slice(0, Math.min(4, ordered.length));
    const satellites = new Map(majors.map(node => [node.full_name, []]));
    for (const node of ordered.slice(majors.length)) {
      const major = [...majors].sort((a, b) => affinity(node, b) - affinity(node, a) || compareRepositories(a, b, metric))[0];
      satellites.get(major.full_name).push(node);
    }
    majors.forEach((node, i) => {
      const angle = phase + i * Math.PI * 2 / majors.length;
      const cx = majors.length === 1 ? 0 : Math.cos(angle) * .55, cy = majors.length === 1 ? 0 : Math.sin(angle) * .55;
      result[node.full_name] = { x: 450 + cx * 365, y: yCenter + cy * yScale };
      const members = satellites.get(node.full_name);
      members.forEach((child, j) => {
        const theta = j * 2.399963 + phase, radius = .1 + .24 * Math.sqrt((j + 1) / members.length);
        result[child.full_name] = { x: 450 + (cx + Math.cos(theta) * radius) * 365, y: yCenter + (cy + Math.sin(theta) * radius) * yScale };
      });
    });
  }
  return result;
}
function affinity(a, b) {
  return Number(Boolean(a.language) && a.language === b.language) + (a.topics || []).filter(topic => b.topics?.includes(topic)).length + Number(a.members?.includes(b.full_name) || b.members?.includes(a.full_name));
}
