import { sanitizeActivityEvents } from './activity.mjs';
import { mappedColor } from './visual-mapping.mjs';

const DAY = 86400000;
const role = (repo, options) => options.projectShowcase?.[repo.full_name] || options.projectShowcase?.[repo.name] || {};
const key = value => String(value || '').toLowerCase();
const lookup = (values, id) => Object.entries(values || {}).find(([name]) => key(name) === key(id))?.[1];
export const recruiterBands = ['ACTIVE NOW', '< 6 MONTHS', '< 18 MONTHS', 'OLDER'];
export const recruiterRadii = [190, 235, 280, 325];
export function validateProjectRelationships(value = []) {
  if (!Array.isArray(value) || value.length > 6 || value.some(pair => !Array.isArray(pair) || pair.length !== 2 || pair.some(id => typeof id !== 'string' || !/^[a-z\d-]+\/[a-z\d_.-]+$/i.test(id)) || key(pair[0]) === key(pair[1])))
    throw Error('projectRelationships must contain up to six pairs of distinct owner/repository IDs.');
}

// Observed months are lower bounds unless a complete branch history is loaded.
// An absent event is never evidence of an inactive period in a capped feed.
export function projectEvidence(repo, options, account, reference) {
  const snapshot = key(options.commitHistoryData?.repository) === key(repo.full_name)
    ? options.commitHistoryData : lookup(options.commitFieldData, repo.full_name);
  const events = sanitizeActivityEvents(options.historyData?.events).filter(event => key(event.repository) === key(repo.full_name) && ['push', 'pull-request', 'release'].includes(event.kind) && Date.parse(event.createdAt) <= reference);
  const commits = (snapshot?.commits || []).filter(commit => Number.isFinite(Date.parse(commit.date)) && Date.parse(commit.date) <= reference);
  const dates = [...commits.map(commit => commit.date), ...events.map(event => event.createdAt)];
  const months = [...new Set(dates.map(date => new Date(date).toISOString().slice(0, 7)))].sort();
  const complete = snapshot?.partial === false && !snapshot.diagnostic;
  const push = Date.parse(repo.pushed_at);
  const latest = Math.max(Number.isFinite(push) && push <= reference ? push : 0, ...dates.map(Date.parse));
  const age = latest ? (reference - latest) / DAY : null;
  const band = age === null ? 3 : age < 30 ? 0 : age < 183 ? 1 : age < 548 ? 2 : 3;
  const rows = lookup(options.organizationData?.records, repo.full_name);
  const logins = Array.isArray(rows) ? new Set(rows.map(row => key(row.login)).filter(Boolean)) : null;
  const others = logins ? [...logins].filter(login => login !== key(account)).length : null;
  const external = key(repo.full_name.split('/')[0]) !== key(account);
  const contributed = external && (logins?.has(key(account)) || commits.some(commit => key(commit.login) === key(account)) || events.some(event => ['push', 'pull-request'].includes(event.kind)));
  const quarter = date => new Date(date).getUTCFullYear() * 4 + Math.floor(new Date(date).getUTCMonth() / 3);
  const current = quarter(reference);
  const active = new Set(commits.map(commit => quarter(commit.date)));
  return { months: months.length, complete, band, latest, unknownRecency: age === null,
    radius: !months.length ? 10 : months.length < 3 ? 9 : months.length < 9 ? 13 : months.length < 24 ? 17 : 21,
    others, contributorPartial: others !== null && options.organizationData?.complete !== true,
    external, contributed, quarters: complete && commits.length ? Array.from({ length: 12 }, (_, i) => active.has(current - 11 + i)) : [],
    featured: role(repo, options).role === 'featured',
  };
}

export function compareRecruiterProjects(a, b, options) {
  const ranks = { featured: 0, supporting: 1, experimental: 2, historical: 3 };
  return (ranks[role(a, options).role] ?? 4) - (ranks[role(b, options).role] ?? 4)
    || (role(a, options).priority ?? 9999) - (role(b, options).priority ?? 9999)
    || (Date.parse(b.pushed_at) || 0) - (Date.parse(a.pushed_at) || 0)
    || a.full_name.localeCompare(b.full_name);
}

// Finalize the existing scene so exported SVG and Studio hit targets agree.
export function prepareRecruiterScene(scene, loadedCount) {
  if (scene.presentation.options.readmePresentation !== 'recruiter') return scene;
  const options = scene.presentation.options;
  validateProjectRelationships(options.projectRelationships);
  scene.nodes = scene.nodes.filter(node => !node.interaction.hidden).sort((a, b) => compareRecruiterProjects(a.metadata, b.metadata, options)).slice(0, 12);
  const reference = Date.parse(scene.metadata.referenceDate);
  scene.nodes.forEach(node => {
    node.recruiter = projectEvidence(node.metadata, options, scene.metadata.account, reference);
    node.style.color = mappedColor({ ...node.metadata, language: node.metadata.language || 'Unknown' }, 'language');
  });
  // Fixed label columns keep names still and readable even when one band is full.
  for (const side of [0, 1]) {
    const group = scene.nodes.filter((_, index) => index % 2 === side);
    group.forEach((node, index) => {
      const angle = (-75 + (index + .5) * 150 / Math.max(1, group.length)) * Math.PI / 180;
      const radius = recruiterRadii[node.recruiter.band];
      node.geometry = { x: 600 + (side ? -1 : 1) * Math.cos(angle) * radius, y: 380 + Math.sin(angle) * radius, radius: node.recruiter.radius };
    });
    group.sort((a, b) => a.geometry.y - b.geometry.y).forEach((node, index) => {
      node.recruiter.label = { x: side ? 32 : 955, y: 138 + index * 96, side };
    });
  }
  const ids = new Map(scene.nodes.map(node => [key(node.id), node]));
  const seen = new Set();
  scene.edges = (options.projectRelationships || []).flatMap(pair => {
    const [from, to] = pair.map(id => ids.get(key(id)));
    const id = pair.map(key).sort().join(':');
    if (!from || !to || seen.has(id)) return [];
    seen.add(id);
    return [{ id, from: from.id, to: to.id, metadata: { shared: ['Curated project relationship'] }, geometry: { distance: Math.hypot(from.geometry.x - to.geometry.x, from.geometry.y - to.geometry.y) }, style: { primary: false } }];
  });
  scene.labels = scene.nodes.map(node => ({ id: node.id, ...node.recruiter.label, text: node.metadata.name, hidden: node.interaction.labelHidden, focal: node.recruiter.featured }));
  scene.viewport = { width: 1200, height: 940, viewBox: [0, 0, 1200, 940] };
  scene.presentation.totalConnections = scene.edges.length;
  scene.presentation.recruiterOmitted = Math.max(0, loadedCount - scene.nodes.length);
  delete scene.semantic;
  delete scene.developerProfile;
  scene.annotations = [];
  return scene;
}
