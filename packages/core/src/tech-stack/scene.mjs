// Turns a finished scan into the map, its tables, and a standalone page.
import { createScene } from '../constellation.mjs';
import { techStackLayout } from '../engine.mjs';
import { renderSceneHTML } from '../renderer-html.mjs';
import { serializeScene } from '../scene.mjs';
import { LANGUAGE_GROUP, SUPPORTING_TECHS, TECH_GROUPS, isIncidentalLanguage, techGroup } from './catalog.mjs';

const MAX_LANGUAGES_DRAWN = 10;
const MAX_TECHS_DRAWN_PER_GROUP = 7;
const CROSS_GROUP_LINKS = 26;
const LABEL_CHARACTER_WIDTH = 5.8;
const STACKS = [
  ['React + Express + MongoDB', ['React', 'Express', 'MongoDB']],
  ['React + Express + PostgreSQL', ['React', 'Express', 'PostgreSQL']],
  ['React with Tailwind CSS', ['React', 'Tailwind CSS']],
  ['Next.js + Tailwind CSS', ['Next.js', 'Tailwind CSS']],
  ['Next.js + Prisma', ['Next.js', 'Prisma']],
  ['React + Firebase', ['React', 'Firebase']],
  ['Django + PostgreSQL', ['Django', 'PostgreSQL']],
];
const WEB_LANGUAGES = ['HTML', 'CSS', 'JavaScript'];
const LABEL_CSS = 'svg .repo-label{fill:#eef1f8!important;opacity:.96;paint-order:stroke;stroke:#050819!important;stroke-width:2.4px!important;stroke-linejoin:round}.scene-annotation{fill:#fff;paint-order:stroke;stroke:#050819;stroke-width:3px;font:700 9.5px system-ui,sans-serif;text-anchor:middle;letter-spacing:.3px}';

const ranked = (counts) => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

/** Counts for the tables, and which technologies the map draws. */
export function techStackModel(scan) {
  const languageCounts = new Map(), techCounts = new Map();
  const bump = (counts, name) => counts.set(name, (counts.get(name) || 0) + 1);
  for (const record of scan.records) {
    for (const language of Object.keys(record.languages)) if (!isIncidentalLanguage(language)) bump(languageCounts, language);
    for (const tech of record.dependencies) bump(techCounts, tech);
  }
  const total = scan.records.length;
  const drawn = new Set();
  const groups = TECH_GROUPS.map((group) => {
    const rows = ranked(group.core ? languageCounts : [...techCounts].filter(([tech]) => techGroup(tech) === group.id));
    const limit = group.core ? MAX_LANGUAGES_DRAWN : MAX_TECHS_DRAWN_PER_GROUP;
    const eligible = rows.filter(([name]) => group.core || !SUPPORTING_TECHS.has(name)).slice(0, limit);
    for (const [name] of eligible) drawn.add(`${group.core ? 'language' : 'dependency'}:${name}`);
    const onMap = new Set(eligible.map(([name]) => name));
    return { id: group.id, color: group.color, core: Boolean(group.core), rows: rows.map(([name, count]) => ({ name, count, share: total ? count / total : 0, onMap: onMap.has(name) })) };
  }).filter((group) => group.rows.length);
  const stacks = STACKS.map(([name, techs]) => ({ name, count: scan.records.filter((record) => techs.every((tech) => record.dependencies.includes(tech))).length }));
  stacks.push({ name: 'HTML, CSS or JavaScript with no listed framework or library', count: scan.records.filter((record) => !record.dependencies.length && WEB_LANGUAGES.some((language) => Object.hasOwn(record.languages, language))).length });
  stacks.push({ name: 'No language detected by GitHub', count: scan.coverage.noLanguage });
  return { total, groups, drawn, stacks: stacks.filter((stack) => stack.count).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)) };
}

/** The map: the engine's aggregate scene, placed and linked by the Rust layout. */
export function createTechStackScene(scan, { model = techStackModel(scan) } = {}) {
  if (!model.drawn.size) throw new Error(`No languages or technologies were found in @${scan.login}’s public repositories.`);
  const records = scan.records.map((record) => ({
    ...record,
    language: record.language && model.drawn.has(`language:${record.language}`) ? record.language : null,
    languages: Object.fromEntries(Object.entries(record.languages).filter(([name]) => model.drawn.has(`language:${name}`))),
    dependencies: record.dependencies.filter((tech) => model.drawn.has(`dependency:${tech}`)),
  }));
  const scene = createScene(scan.login, records, {
    accountType: 'organization', organizationView: 'technology', organizationScope: 'all-metadata', nodeMode: 'technology',
    arrangement: 'community-galaxy', nodeSize: 'membership', connectionWeight: 'repositories', colorConnections: true,
    maxRepos: 100, showOther: true, includeForks: false, animate: false, visualTheme: 'deep-space', css: LABEL_CSS,
    organization: { contributors: { enabled: false, strategy: 'off' } }, generatedAt: scan.scannedAt,
  });
  const groupIndex = new Map(TECH_GROUPS.map((group, index) => [group.id, index]));
  const members = new Map(scene.nodes.map((node) => [node.id, new Set()]));
  const memberIds = (record) => [...Object.keys(record.languages).map((name) => `language:${name}`), ...record.dependencies.map((name) => `dependency:${name}`)].filter((id) => members.has(id));
  for (const record of records) for (const id of memberIds(record)) members.get(id).add(record.full_name);
  scene.nodes.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const position = new Map(scene.nodes.map((node, index) => [node.id, index]));
  const { width, height } = scene.viewport;
  const layout = techStackLayout({
    width, height,
    groups: TECH_GROUPS.map((group) => ({ id: group.id, core: Boolean(group.core) })),
    nodes: scene.nodes.map((node) => ({
      id: node.id,
      group: groupIndex.get(node.metadata.nodeKind === 'language' ? LANGUAGE_GROUP : techGroup(node.metadata.name)),
      count: members.get(node.id).size,
      label_width: node.metadata.name.length * LABEL_CHARACTER_WIDTH,
    })),
    repositories: records.map((record) => memberIds(record).map((id) => position.get(id))).filter((ids) => ids.length),
    cross_links: CROSS_GROUP_LINKS,
  });
  const colorOf = (node) => TECH_GROUPS[groupIndex.get(node.metadata.nodeKind === 'language' ? LANGUAGE_GROUP : techGroup(node.metadata.name))].color;
  scene.nodes.forEach((node, index) => {
    const placed = layout.nodes[index], count = members.get(node.id).size;
    node.geometry = { x: placed.x, y: placed.y, radius: placed.radius };
    node.style = { ...node.style, color: colorOf(node), shape: 'circle', glow: null, opacity: 1 };
    node.metadata = { ...node.metadata, stargazers_count: count, representedCount: count };
    node.interaction = { ...node.interaction, labelHidden: false };
  });
  scene.labels = scene.nodes.map((node) => ({ focal: false, hidden: false, id: node.id, text: node.metadata.name, x: node.geometry.x, y: node.geometry.y + node.geometry.radius + 8 }));
  scene.edges = layout.links.map((link) => {
    const a = scene.nodes[link.from], b = scene.nodes[link.to];
    const shared = [...members.get(a.id)].filter((name) => members.get(b.id).has(name)).sort().slice(0, 100);
    return {
      from: a.id, to: b.id, id: JSON.stringify([a.id, b.id]),
      geometry: { distance: Math.hypot(a.geometry.x - b.geometry.x, a.geometry.y - b.geometry.y) },
      style: { primary: true },
      metadata: { key: `${a.id}:${b.id}`, shared, sharedLanguages: [], sharedRepositories: shared, sharedTopics: [], repositoryCount: link.shared, strength: Math.min(4, 1 + Math.floor(Math.log10(link.shared + 1) * 1.6)) },
    };
  });
  scene.presentation.totalConnections = scene.edges.length;
  scene.annotations = layout.groups.map((group) => ({ text: group.id, x: Math.round(group.x), y: Math.round(group.y) }));
  serializeScene(scene); // Validates the recomposed scene.
  return scene;
}

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const formatShare = (share) => `${(share * 100).toFixed(share < 0.01 ? 1 : 0)}%`;

/** Plain sentences on what a scan covers. Shared by the Studio and the standalone page. */
export function coverageNotes(scan) {
  const { coverage, records } = scan;
  const notes = [`${coverage.withManifest} of ${records.length} repositories have a recognized manifest. ${coverage.noLanguage} have no language GitHub could detect. ${coverage.forks} forks and ${coverage.empty} empty repositories are excluded. Languages under 2% of a repository’s code are not counted.`];
  if (coverage.unreadable) notes.push(`${coverage.unreadable} manifests could not be read.`);
  if (coverage.missing) notes.push(`${coverage.missing} repositories could not be fully read because GitHub did not answer.`);
  if (coverage.refused) notes.push(`GitHub refused ${coverage.refused} ${coverage.refused === 1 ? 'read' : 'reads'} for this sign-in, so these counts may be low.`);
  if (coverage.stopped === 'rate-limit') notes.push('GitHub’s request limit stopped this scan early, so these counts are partial.');
  if (coverage.stopped === 'limit') notes.push('This account is larger than one scan can read, so these counts are partial.');
  return notes;
}

const STYLES = '.tech-head,.tech-data{max-width:1200px;margin:0 auto;color:#e8ecf6;font:15px/1.55 system-ui,sans-serif}.tech-head{padding:8px 0 14px}.tech-head h1{font-size:26px;line-height:1.2;margin:0 0 6px;text-wrap:balance}.tech-head p{margin:0;max-width:75ch;color:#bcc5d8}.tech-data{padding:12px 0 48px}.tech-data h2{font-size:19px;margin:30px 0 10px}.tech-data h3{font-size:15px;margin:0 0 6px}.tech-data p,.tech-data li{color:#bcc5d8;max-width:75ch}.tech-data li{margin-bottom:6px}.tech-data li strong{color:#e8ecf6}.tech-tables{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:24px}.tech-data table{width:100%;border-collapse:collapse;font-size:14px}.tech-data .stacks{max-width:560px}.tech-data th,.tech-data td{padding:3px 6px;border-bottom:1px solid #232a3a;text-align:right;font-weight:400;font-variant-numeric:tabular-nums}.tech-data th:first-child{text-align:left}.tech-data thead th{color:#8f9ab0;font-size:12px}.tech-data .offmap th,.tech-data .offmap td{color:#8f9ab0}.tech-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:7px}';

/** A self-contained interactive page with the map and every count. No token is ever involved. */
export function renderTechStackHTML(scan) {
  const model = techStackModel(scan);
  const scene = createTechStackScene(scan, { model });
  const table = (rows, name, off = () => false) => `<thead><tr><th scope="col">${name}</th><th scope="col">Repos</th><th scope="col">Share</th></tr></thead><tbody>${rows.map((row) => `<tr${off(row) ? ' class="offmap"' : ''}><th scope="row">${escape(row.name)}</th><td>${row.count}</td><td>${formatShare(row.count / (model.total || 1))}</td></tr>`).join('')}</tbody>`;
  const tables = model.groups.map((group) => `<section><h3><span class="tech-dot" style="background:${group.color}"></span>${escape(group.id)}</h3><table>${table(group.rows, 'Technology', (row) => !row.onMap)}</table></section>`).join('');
  const header = `<header class="tech-head"><h1>Tech stacks across ${escape(scan.login)}</h1><p>Every public, non-fork, non-empty repository: <strong>${model.total}</strong> of ${scan.coverage.discovered}. Star area shows how many repos declare a technology. A line means two technologies are declared in the same repos, and thicker lines mean more repos. Select a star to see its links.</p></header>`;
  const details = `<main class="tech-data"><h2>Most common combinations</h2><table class="stacks">${table(model.stacks, 'Stack')}</table><h2>Every technology detected</h2><p>Dimmed rows are left off the map to keep it readable. Counts are not exclusive: most repos use several.</p><div class="tech-tables">${tables}</div><h2>How to read this</h2><ul><li><strong>Declared, not proven used.</strong> Technologies come from manifests such as package.json, requirements.txt, Gemfile and pom.xml, down to three folders deep. Some entries are starter-kit defaults: Create React App installs Testing Library, for example.</li><li><strong>Counts are repos, not people or quality.</strong> Popularity here says nothing about how good a project is.</li><li><strong>Coverage.</strong> ${coverageNotes(scan).map(escape).join(' ')}</li><li><strong>Snapshot.</strong> Public default-branch data from ${escape(scan.scannedAt.slice(0, 10))}. The technology list is hand-curated, so libraries outside it are not shown.</li></ul></main>`;
  return renderSceneHTML(scene, { title: `${scan.login} Tech Stacks` })
    .replace('</style></head><body>', () => `${STYLES}</style></head><body>${header}`)
    .replace('</body>', () => `${details}</body>`);
}
