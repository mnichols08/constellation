// The tech stack as something a reader can take in at a glance: a static card
// for a README, and a Markdown block with the links an image can't carry.
import { techStackEvidence, formatYears, plural } from './evidence.mjs';

const WIDTH = 840;
const PAD = 28;
const MAX_ROWS = 10;
const TEXT = '#eef1f8', MUTED = '#bcc5d8', FAINT = '#8f9ab3', LINE = '#232a45', BACKGROUND = '#050819';
const FONT = 'system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif';

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fit = (text, characters) => (text.length > characters ? `${text.slice(0, Math.max(1, characters - 1)).trimEnd()}…` : text);
const date = (iso) => iso.slice(0, 10);
const counted = (evidence) => `${evidence.total} of ${plural(evidence.discovered, 'public repository', 'public repositories')}${evidence.partial ? ' (partial scan)' : ''}`;
const CAVEAT = 'Declared in manifests, which does not prove use. Public repositories only.';

/**
 * A static SVG card: a headline, the stacks used together, and a timeline row
 * per technology. All of its text is also in the title and description, since
 * a README image is often read without being seen.
 */
export function renderTechStackCardSVG(scan, options = {}) {
  const evidence = techStackEvidence(scan, options);
  if (!evidence.core.length && !evidence.tooling.length) throw new Error(`No languages or technologies were found in @${scan.login}’s public repositories.`);
  const rows = evidence.core.slice(0, MAX_ROWS);
  const out = [];
  const text = (x, y, value, { size = 13, fill = TEXT, weight = 400, anchor = 'start' } = {}) => out.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`);
  const heading = (y, value) => text(PAD, y, value.toUpperCase(), { size: 10.5, fill: FAINT, weight: 700 });
  let y = PAD + 18;
  text(PAD, y, fit(`Tech stack · @${evidence.login}`, 60), { size: 20, weight: 700 });
  y += 24;
  text(PAD, y, fit(evidence.headline, 118), { size: 13.5, fill: MUTED });
  y += 14;

  if (evidence.stacks.length) {
    y += 22; heading(y, 'Used together'); y += 6;
    for (const stack of evidence.stacks) {
      y += 22;
      text(PAD, y, fit(stack.name, 58), { size: 14, weight: 600 });
      text(WIDTH - PAD, y, `${plural(stack.repositories)} · ${formatYears(stack)}`, { fill: stack.current ? MUTED : FAINT, anchor: 'end' });
      const examples = stack.examples.map((example) => example.name).join(', ');
      if (examples) { y += 16; text(PAD, y, fit(`See ${examples}`, 110), { size: 11.5, fill: FAINT }); }
    }
    y += 6;
  }

  if (rows.length) {
    y += 22; heading(y, 'Languages and technologies'); y += 8;
    const left = 330, right = WIDTH - PAD - 86;
    const from = Math.min(evidence.span.from, ...rows.map((row) => row.from ?? evidence.span.to));
    const to = evidence.span.to;
    const scale = (ms) => (to > from ? left + ((Math.min(Math.max(ms, from), to) - from) / (to - from)) * (right - left) : left);
    const top = y + 6;
    const firstYear = new Date(from).getUTCFullYear(), lastYear = new Date(to).getUTCFullYear();
    const step = Math.max(1, Math.ceil((lastYear - firstYear + 1) / 7));
    const ticks = [];
    for (let tick = firstYear + 1; tick <= lastYear; tick += step) ticks.push(tick);
    const under = out.length;   // Year lines go beneath the bars.
    for (const row of rows) {
      y += 22;
      text(PAD, y, fit(row.name, 22), { size: 13.5, weight: 600, fill: row.current ? TEXT : MUTED });
      text(left - 16, y, plural(row.repositories), { size: 12, fill: row.current ? MUTED : FAINT, anchor: 'end' });
      out.push(`<rect x="${left}" y="${y - 9}" width="${right - left}" height="8" rx="4" fill="${LINE}"/>`);
      if (row.from !== null && row.to !== null) {
        const start = scale(row.from), end = Math.max(scale(row.to), start + 8);
        out.push(`<rect x="${start.toFixed(1)}" y="${y - 9}" width="${(end - start).toFixed(1)}" height="8" rx="4" fill="${row.color}" opacity="${row.current ? 1 : 0.38}"/>`);
      }
      text(WIDTH - PAD, y, formatYears(row), { size: 12, fill: row.current ? MUTED : FAINT, anchor: 'end' });
    }
    y += 18;
    for (const tick of ticks) {
      const x = scale(Date.UTC(tick, 0, 1));
      out.splice(under, 0, `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${y - 10}" stroke="${LINE}" stroke-width="1"/>`);
      text(x.toFixed(1), y, String(tick), { size: 10, fill: FAINT, anchor: 'middle' });
    }
    if (evidence.core.length > rows.length) { y += 18; text(PAD, y, `and ${evidence.core.length - rows.length} more`, { size: 11.5, fill: FAINT }); }
  }

  if (evidence.tooling.length) {
    y += 24;
    text(PAD, y, fit(`Testing and build tools: ${evidence.tooling.map((tool) => tool.name).join(', ')}`, 122), { size: 12, fill: MUTED });
  }
  y += 26;
  out.push(`<line x1="${PAD}" y1="${y - 14}" x2="${WIDTH - PAD}" y2="${y - 14}" stroke="${LINE}" stroke-width="1"/>`);
  text(PAD, y + 2, fit(`${counted(evidence)} · ${date(evidence.asOf)} · declared in manifests, not proof of use · public work only`, 128), { size: 10.5, fill: FAINT });
  const height = y + PAD - 6;

  const spoken = [
    evidence.headline,
    evidence.stacks.length ? `Used together: ${evidence.stacks.map((stack) => `${stack.name} (${plural(stack.repositories)}, ${formatYears(stack, ' to ')})`).join('; ')}.` : '',
    rows.length ? `Languages and technologies: ${rows.map((row) => `${row.name} (${plural(row.repositories)}, ${formatYears(row, ' to ')})`).join('; ')}.` : '',
    evidence.tooling.length ? `Testing and build tools: ${evidence.tooling.map((tool) => tool.name).join(', ')}.` : '',
    `Counted from ${counted(evidence)} on ${date(evidence.asOf)}. ${CAVEAT}`,
  ].filter(Boolean).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-labelledby="title tech-stack-description" font-family="${FONT}">`
    + `<title id="title">${escape(`Tech stack of ${evidence.login}`)}</title><desc id="tech-stack-description">${escape(spoken)}</desc>`
    + `<rect width="${WIDTH}" height="${height}" rx="14" fill="${BACKGROUND}"/>${out.join('')}</svg>\n`;
}

export const MARKDOWN_START = '<!-- constellation:tech-stack:start -->';
export const MARKDOWN_END = '<!-- constellation:tech-stack:end -->';
// Repository names and descriptions are other people's text: keep them inert.
const inert = (value) => String(value).replace(/[\\`*_{}[\]()#+!|<>~@&]/g, (char) => (char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '&' ? '&amp;' : char === '@' ? '@\u200b' : `\\${char}`));
const link = (example) => (example.url ? `[${inert(example.name)}](${example.url})` : inert(example.name));

/**
 * The same evidence as Markdown for a README, with links to the repositories
 * that show each technology. Wrapped in markers so it can be replaced later.
 */
export function renderTechStackMarkdown(scan, options = {}) {
  const evidence = techStackEvidence(scan, options);
  const line = (item) => `- **${inert(item.name)}** · ${plural(item.repositories)} · ${formatYears(item)}${item.examples.length ? ` · ${item.examples.map(link).join(', ')}` : ''}`;
  const lines = [MARKDOWN_START, `**${inert(evidence.headline)}**`];
  if (evidence.stacks.length) lines.push('', '**Used together**', '', ...evidence.stacks.map(line));
  const rows = evidence.core.slice(0, 8);
  if (rows.length) {
    lines.push('', '**Where to look**', '');
    for (const row of rows) {
      const [example] = row.examples;
      lines.push(`${line(row)}${example?.description ? `: ${inert(example.description)}` : ''}`);
    }
  }
  if (evidence.tooling.length) lines.push('', `Testing and build tools: ${evidence.tooling.map((tool) => inert(tool.name)).join(', ')}.`);
  lines.push('', `<sub>Counted from ${counted(evidence)} on ${date(evidence.asOf)}. ${CAVEAT}</sub>`, MARKDOWN_END);
  return `${lines.join('\n')}\n`;
}

/** Put a fresh block into README text: replace the marked block, or append one. */
export function replaceTechStackMarkdown(readme, block) {
  const start = readme.indexOf(MARKDOWN_START), end = readme.indexOf(MARKDOWN_END);
  if (start >= 0 && end > start) return `${readme.slice(0, start)}${block.trimEnd()}${readme.slice(end + MARKDOWN_END.length)}`;
  return `${readme.trimEnd()}\n\n${block}`;
}
