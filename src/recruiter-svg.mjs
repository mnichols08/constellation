import { recruiterBands, recruiterRadii } from './recruiter.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const shorten = (value, length) => [...String(value || '')].length > length ? [...String(value)].slice(0, length - 1).join('') + '…' : value;
// Conservative glyph budgets avoid long repository/account names crossing the diagram.
const fitName = (value, width, size) => {
  const chars = [...String(value || '')];
  const units = char => /[MWmw@]/.test(char) ? 1 : /[ilI.,'!]/.test(char) ? .38 : .7;
  let total = chars.reduce((sum, char) => sum + units(char), 0), shortened = false;
  while (chars.length && (total + (shortened ? 1 : 0)) * size > width) { total -= units(chars.pop()); shortened = true; }
  return chars.join('') + (shortened ? '…' : '');
};
const text = (x, y, value, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${escape(value)}</text>`;
const circle = (x, y, r, attrs = '') => `<circle cx="${x}" cy="${y}" r="${r}" ${attrs}/>`;
function continuity(x, y, radius, quarters) {
  return quarters.map((active, index) => {
    const a = (-150 + index * 25) * Math.PI / 180, b = a + 19 * Math.PI / 180;
    return `<path d="M${x + Math.cos(a) * radius} ${y + Math.sin(a) * radius} A${radius} ${radius} 0 0 1 ${x + Math.cos(b) * radius} ${y + Math.sin(b) * radius}" fill="none" stroke="currentColor" stroke-width="2" opacity="${active ? .8 : .12}"/>`;
  }).join('');
}

export function renderRecruiterSVG(scene) {
  const options = scene.presentation.options, account = scene.metadata.account;
  const nodes = scene.nodes, byId = new Map(nodes.map(node => [node.id, node]));
  const languages = new Map();
  for (const node of nodes) {
    const language = node.metadata.language || 'Unknown';
    const entry = languages.get(language) || { count: 0, color: node.style.color };
    entry.count++; languages.set(language, entry);
  }
  const summary = [...languages].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const light = options.theme !== 'midnight';
  const palette = { background: light ? '#f7f8fc' : '#0d1117', foreground: light ? '#18213a' : '#e6edf3', line: light ? '#7a869c' : '#68768d', accent: light ? '#395bbe' : '#9ab9ff', star: light ? '#966500' : '#f6d99b', ...options.colors };
  const transparent = options.transparentTheme || options.exportProfile === 'transparent';
  const description = 'Developer at the center. Distance shows last repository push or observed work event: under 30 days, six months, eighteen months, or older. Planet size shows distinct observed active months, never stars or age. Hollow planets mean activity history unavailable. Color shows primary language. Moons show other loaded contributors; missing scans do not establish solo work. Bold names are developer-featured. CONTRIB means verified participation in an external repository; EXT means external ownership only. Thin connections are explicitly curated project relationships. Segmented arcs show active quarters in a complete loaded branch history, oldest to newest clockwise over the last three years. No scores or engineering roles are inferred.';
  const paths = scene.edges.map(edge => {
    const a = byId.get(edge.from).geometry, b = byId.get(edge.to).geometry;
    return `<path class="related" d="M${a.x} ${a.y} Q600 380 ${b.x} ${b.y}"><title>${escape(edge.from)} ↔ ${escape(edge.to)} · curated relationship</title></path>`;
  }).join('');
  const projects = nodes.map(node => {
    const { x, y, radius } = node.geometry, evidence = node.recruiter, label = evidence.label;
    const marker = evidence.contributed ? 'CONTRIB' : evidence.external ? 'EXT' : '';
    const activity = evidence.months ? `${evidence.months}${evidence.complete ? '' : '+'} active mo` : 'history unavailable';
    const contributors = evidence.others === null ? 'contributors unknown' : `${evidence.others}${evidence.contributorPartial ? '+' : ''} other contributor${evidence.others === 1 ? '' : 's'}`;
    const moonRadius = radius + 15;
    const moons = evidence.others ? `<g class="moons" style="transform-origin:${x}px ${y}px">${Array.from({ length: Math.min(6, evidence.others) }, (_, index) => {
      const a = (index * 60 - 90) * Math.PI / 180;
      return circle(x + Math.cos(a) * moonRadius, y + Math.sin(a) * moonRadius, 3.2, 'class="moon"');
    }).join('')}</g>${evidence.others > 6 ? text(x + (label.side ? moonRadius + 7 : -moonRadius - 27), y + 5, `+${evidence.others - 6}`, 'class="overflow"') : ''}` : '';
    const end = label.side ? 270 : 930;
    return `<g class="repository" data-repo="${escape(node.id)}"><title>${escape(`${node.id} · ${node.metadata.language || 'Unknown language'} · ${activity} · ${contributors}${evidence.unknownRecency ? ' · recency unavailable' : ''}`)}</title>
      ${node.interaction.labelHidden ? '' : `<path class="leader" d="M${x} ${y} L${end} ${label.y - 5}"/>`}
      ${evidence.featured && evidence.band === 0 && !evidence.unknownRecency ? circle(x, y, radius + 6, 'class="recent-pulse"') : ''}
      ${evidence.quarters.length && (evidence.featured || evidence.months >= 9) ? continuity(x, y, radius + 7, evidence.quarters) : ''}
      ${circle(x, y, radius, `class="planet star${evidence.months ? '' : ' unknown'}" data-repo="${escape(node.id)}" data-label="${escape(node.metadata.name)}" style="--planet:${node.style.color}"`)}${moons}
      ${node.interaction.labelHidden ? '' : `<g class="project-label"><text class="repo-label${evidence.featured ? ' featured' : ''}" data-repo="${escape(node.id)}" x="${label.x}" y="${label.y}">${escape(fitName(node.metadata.name, 213, 20))}</text>${text(label.x, label.y + 25, `${marker ? marker + ' · ' : ''}${shorten(node.metadata.language || 'Unknown language', 18)}`, 'class="detail"')}${text(label.x, label.y + 47, activity, 'class="detail"')}${text(label.x, label.y + 68, evidence.unknownRecency ? 'recency unavailable' : contributors, 'class="detail muted"')}</g>`}
    </g>`;
  }).join('');
  const languageLine = summary.slice(0, 5).map(([language, entry], index) => `<g transform="translate(${32 + index * 230} 756)">${circle(0, -6, 5, `fill="${entry.color}"`)}${text(13, 0, `${shorten(language, 17)} ×${entry.count}`, 'class="detail"')}</g>`).join('');
  const legend = `<g class="key">
    ${text(32, 802, 'HOW TO READ', 'class="eyebrow"')}
    ${circle(38, 832, 5)}${circle(59, 832, 9)}${text(78, 838, 'larger · more active months')}
    ${circle(414, 832, 10, 'fill="none" stroke="currentColor"')}${circle(420, 832, 3)}${text(439, 838, 'closer · more recent')}
    ${circle(816, 832, 7, `fill="${summary[0]?.[1].color || palette.accent}"`)}${text(836, 838, 'color · primary language')}
    ${circle(40, 869, 7)}${circle(54, 860, 3, 'fill="none" stroke="currentColor"')}${text(78, 875, 'moons · other contributors')}
    ${continuity(415, 869, 11, [true, true, false, true, true, false, true, false, true, true, false, true])}${text(439, 875, 'arc · active quarters')}
    <path class="related" d="M805 869h22"/>${text(836, 875, 'line · curated relationship')}
    ${text(32, 912, 'Bold: featured · CONTRIB: contributed · EXT: external owner · Hollow: history unknown · +: lower bound', 'class="detail muted"')}
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="940" viewBox="0 0 1200 940" role="img" aria-labelledby="recruiter-title recruiter-description">
  <title id="recruiter-title">${escape(options.title || `${account} · project constellation`)}</title><desc id="recruiter-description">${escape(description)}</desc>
  <style>svg{${Object.entries(palette).map(([name, value]) => `--sky-${name}:${value}`).join(';')};color:var(--sky-foreground);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}text{fill:currentColor;font-size:17px}.background{fill:${transparent ? 'none' : 'var(--sky-background)'}}.guide{fill:none;stroke:var(--sky-line);stroke-width:1;opacity:.24}.band{font-size:14px;letter-spacing:1px;opacity:.8}.leader{fill:none;stroke:var(--sky-line);stroke-width:1;opacity:.45}.related{fill:none;stroke:var(--sky-accent);stroke-width:1.5;opacity:.55}.repository .planet{filter:none;fill:var(--planet);stroke:var(--sky-foreground);stroke-width:1}.repository .planet.unknown{fill:var(--sky-background);stroke:var(--planet);stroke-width:2;stroke-dasharray:3 2}.moon{fill:var(--sky-background);stroke:var(--sky-foreground);stroke-width:1.5}.project-label .repo-label{font-size:20px;display:inline;font-weight:500}.featured{font-weight:800}.detail{font-size:16px}.muted{opacity:.8}.eyebrow{font-size:14px;font-weight:700;letter-spacing:2px}.overflow{font-size:14px}.key{fill:currentColor}.recent-pulse{fill:none;stroke:var(--sky-accent);opacity:.3}.sun{fill:var(--sky-star);opacity:.14;stroke:var(--sky-star);stroke-width:1.5}${options.animate !== false ? '@keyframes recruiter-pulse{50%{opacity:.1}}@keyframes recruiter-moons{to{transform:rotate(360deg)}}.recent-pulse{animation:recruiter-pulse 10s ease-in-out infinite}.moons{animation:recruiter-moons 120s linear infinite}@media(prefers-reduced-motion:reduce){.recent-pulse,.moons{animation:none}}' : ''}${escape(options.css || '')}</style>
  <rect class="background" width="1200" height="940" rx="16"/>
  ${text(32, 35, 'PROJECT CONSTELLATION', 'class="eyebrow"')}${text(1168, 35, `As of ${scene.metadata.referenceDate.slice(0, 10)}`, 'class="detail muted" text-anchor="end"')}
  ${recruiterRadii.map((r, index) => `<path class="guide" d="M${600 - r * .94} ${380 - r * .342} A${r} ${r} 0 0 1 ${600 + r * .94} ${380 - r * .342} M${600 + r * .94} ${380 + r * .342} A${r} ${r} 0 0 1 ${600 - r * .94} ${380 + r * .342}"/>${text(600, 380 - r - 9, recruiterBands[index], 'class="band" text-anchor="middle"')}`).join('')}
  ${text(600, 198, "< 30 DAYS", 'class="band" text-anchor="middle"')}${paths}${projects}
  <g class="developer" text-anchor="middle">${circle(600, 380, 103, 'class="sun"')}${text(600, 360, fitName(options.accountData?.name || account, 185, 22), 'font-weight="750" style="font-size:22px"')}${text(600, 388, fitName('@' + account, 185, 16), 'class="detail"')}${text(600, 417, `${nodes.filter(node => node.recruiter.featured).length} featured · ${nodes.filter(node => node.recruiter.band === 0 && !node.recruiter.unknownRecency).length} active`, 'class="detail"')}</g>
  ${text(32, 715, 'Push / observed work recency · active months from loaded history · contributor scans may be partial', 'class="detail muted"')}
  ${text(1168, 60, scene.presentation.recruiterOmitted ? `+${scene.presentation.recruiterOmitted} other loaded repositories` : `${nodes.length} selected repositories`, 'class="detail muted" text-anchor="end"')}
  ${languageLine}${summary.length > 5 ? text(1168, 783, `+${summary.length - 5} languages`, 'class="detail" text-anchor="end"') : ''}
  <path d="M32 777H1168" class="guide"/>${legend}</svg>`;
}
