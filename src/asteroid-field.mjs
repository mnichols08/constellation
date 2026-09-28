import { seededRandom } from './seeded-random.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const n = value => Number(value).toFixed(2);
const colors = ['#93c5fd', '#c4b5fd', '#f6d99b', '#86efac', '#fda4af'];

export function asteroidFieldMarkup({ id, x, y, radius, snapshot, reference, animate = true }) {
  if (!snapshot || snapshot.repository?.toLowerCase() !== id.toLowerCase() || !Array.isArray(snapshot.commits)) return '';
  const seen = new Set();
  const commits = snapshot.commits.filter(commit => {
    if (!/^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(commit?.sha) || seen.has(commit.sha) || !Number.isFinite(Date.parse(commit.date)) || Date.parse(commit.date) > reference) return false;
    seen.add(commit.sha); return true;
  }).slice(0, 24);
  if (!commits.length) return '';
  const random = seededRandom(`asteroids:${id}`), authors = new Map();
  const rocks = commits.map((commit, i) => {
    const key = commit.login?.toLowerCase() || commit.author || 'Unlinked author';
    if (!authors.has(key)) authors.set(key, { name: commit.author || key, color: colors[authors.size % colors.length], points: [] });
    const author = authors.get(key);
    const angle = i * 2.399963 + random() * .3, distance = radius + 16 + (i % 3) * 8;
    const px = Math.cos(angle) * distance, py = Math.sin(angle) * distance * .72;
    const size = 2 + random() * 2.2;
    const points = Array.from({ length: 7 }, (_, j) => { const r = size * (.65 + random() * .5), a = j / 7 * Math.PI * 2; return `${j ? 'L' : 'M'}${n(px + Math.cos(a) * r)} ${n(py + Math.sin(a) * r)}`; }).join('') + 'Z';
    author.points.push({ x: px, y: py });
    const title = escape(`${snapshot.demo ? 'Demo · ' : ''}${commit.sha.slice(0, 7)} · ${author.name} · ${String(commit.subject || '').slice(0, 140)}`);
    const rock = `<path class="commit-asteroid" d="${points}" fill="var(--sky-line)" stroke="${author.color}" stroke-width=".8"><title>${title}</title></path>`;
    return snapshot.demo ? rock : `<a href="https://github.com/${escape(id)}/commit/${commit.sha}" target="_blank" rel="noopener noreferrer" aria-label="${title}">${rock}</a>`;
  }).join('');
  const ships = [...authors.values()].slice(0, 3).map((author, index) => {
    const distance = radius + 27 + index * 5;
    const route = author.points.length >= 3
      ? author.points.map((point, i, points) => { const next = points[(i + 1) % points.length]; return `${i ? '' : `M${n(point.x * 1.2)} ${n(point.y * 1.2)} `}Q${n((point.x + next.x) * .75)} ${n((point.y + next.y) * .75)} ${n(next.x * 1.2)} ${n(next.y * 1.2)} `; }).join('') + 'Z'
      : `M${n(distance)} 0 A${n(distance)} ${n(distance * .7)} 0 1 1 ${n(-distance)} 0 A${n(distance)} ${n(distance * .7)} 0 1 1 ${n(distance)} 0`;
    const shape = 'M5 0L-3.5 -3L-1.5 0L-3.5 3Z';
    const title = escape(`${author.name}'s ship · navigating their loaded commits`);
    const still = `<path class="commit-ship ${animate ? 'commit-ship-still' : 'commit-ship-rest'}" d="${shape}" transform="translate(${n(distance)} 0) rotate(90)" fill="${author.color}"><title>${title}</title></path>`;
    return `<path class="commit-flight-path" d="${route}" fill="none" stroke="${author.color}" stroke-width=".45" stroke-dasharray="1 5" opacity=".14" pointer-events="none"/>${still}${animate ? `<path class="commit-ship commit-ship-moving" d="${shape}" fill="${author.color}" pointer-events="none"><title>${title}</title><animateMotion path="${route}" dur="${14 + index * 5}s" begin="-${index * 4}s" rotate="auto" repeatCount="indefinite"/></path>` : ''}`;
  }).join('');
  return `<svg class="activity-asteroid-field" x="${n(x)}" y="${n(y)}" width="1" height="1" overflow="visible" data-repository="${escape(id)}"><title>${escape(id)} · ${commits.length} ${snapshot.demo ? 'demo' : 'loaded'} commit asteroids · ${authors.size} authors</title>${rocks}${ships}</svg>`;
}

export const asteroidFieldCSS = `
.activity-asteroid-field{width:1px!important;height:1px!important;background:none!important;overflow:visible}
.commit-asteroid{opacity:.8;transition:opacity .15s,stroke-width .15s}.activity-asteroid-field a:hover .commit-asteroid,.activity-asteroid-field a:focus .commit-asteroid{opacity:1;stroke-width:1.8}
.commit-ship{stroke:var(--sky-background);stroke-width:.5;filter:drop-shadow(0 0 2px var(--sky-accent))}.commit-ship-still{display:none}
@media(prefers-reduced-motion:reduce){.commit-ship-moving{display:none}.commit-ship-still{display:inline}.commit-asteroid{transition:none}}
`;
