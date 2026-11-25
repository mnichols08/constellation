// Daily showpiece: a Project Constellation of this repository, with a look
// chosen deterministically from the date. Offline; reads only `git ls-files`.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createProjectConstellation } from '../src/project-constellation.mjs';
import { createProjectConstellationScene } from '../src/project-constellation-scene.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';
import { renderSceneHTML } from '../src/renderer-html.mjs';
import { visualThemes, themePalettes } from '../src/themes.mjs';

const args = process.argv.slice(2);
const readmeAt = args.includes('--readme') ? args[args.indexOf('--readme') + 1] : null;
const date = args.find((a, i) => /^d{4}-d{2}-d{2}$/.test(a) && args[i - 1] !== '--readme') || new Date().toISOString().slice(0, 10);
const STARFIELDS = ['milky-way', 'space'];
const hash = [...date].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (list, salt) => list[(hash + salt * 2654435761) % list.length >>> 0];
const look = {
  visualTheme: 'constellation', // adaptive light/dark palette; other presets are single-mode
  starfield: { mode: pick(STARFIELDS, 2), density: 90, brightness: 0.9, depth: 0.9, twinkle: true, seed: date },
  seed: `daily:${date}`,
  animate: true,
  layers: { connections: { opacity: 0.38 }, rings: { opacity: 0.55 } },
};

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64e6 });
const commit = git('rev-parse', 'HEAD').trim();
const files = git('ls-files', '-s').split('\n').filter(Boolean).map(l => {
  const [, sha, , path] = l.match(/^\d+ (\S+) (\d)\t(.+)$/);
  return { path, type: 'blob', sha };
});
const dirs = new Set();
for (const { path } of files) { const p = path.split('/'); for (let i = 1; i < p.length; i++) dirs.add(p.slice(0, i).join('/')); }
const tree = [...[...dirs].map(path => ({ path, type: 'tree' })), ...files];
const wanted = files.map(f => f.path).filter(p => /(^|\/)(package\.json|Cargo\.toml)$/.test(p) || /^(src|mcp|scripts|packages)\/.*\.(mjs|js|ts)$/.test(p));
const contents = {};
for (const p of wanted) { try { const t = readFileSync(p, 'utf8'); if (t.length < 128 * 1024) contents[p] = t; } catch {} }

const model = createProjectConstellation({ projectId: 'mnichols08/constellation', ref: 'main', commit, tree, contents });
// Colour every star by its top-level area; the hue wheel turns a little each day.
// Colours are CSS variables with a light and a dark value, so the SVG and the
// interactive page follow the viewer's prefers-color-scheme with no script.
const hex = (h, sat, light) => { const a = sat * Math.min(light, 1 - light), f = n => { const k = (n + h / 30) % 12; return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
const areaOf = n => (n.path || '').split('/')[0] || '(root)';
const areas = [...new Set(model.nodes.map(areaOf))].sort();
const baseHue = hash % 360;
let lightCSS = '', darkCSS = '';
for (const n of model.nodes) {
  if (n.kind === 'project-root') continue;
  const h = (baseHue + areas.indexOf(areaOf(n)) * (360 / areas.length)) % 360;
  lightCSS += `.star[data-repo="${n.id}"]{--node-color:${hex(h, 0.8, 0.36)}}`;
  darkCSS += `.star[data-repo="${n.id}"]{--node-color:${hex(h, 0.9, 0.68)}}`;
}
look.css = `${lightCSS}@media(prefers-color-scheme:dark){${darkCSS}}`;
const { scene } = createProjectConstellationScene(model, look);
// Keep the sky legible: only structural landmarks carry visible labels.
const kindById = new Map(model.nodes.map(n => [n.id, n.kind]));
for (const node of scene.nodes) if (kindById.get(node.id) === 'module') node.interaction.labelHidden = true;

// The scene framing can crop the outer ring; reframe to the real star extents plus margin,
// keeping the canvas aspect so the SVG still fills its 900 x 560 box.
const reframe = (svg, sc) => {
  const xs = sc.nodes.map(n => n.geometry.x), ys = sc.nodes.map(n => n.geometry.y), m = 26;
  let x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + m + 14;
  const aspect = 900 / 560; let w = x1 - x0, h = y1 - y0;
  if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}"`);
};
const dir = 'dist/daily';
// README images: GitHub picks <picture> sources by the reader's theme setting, which can
// differ from the OS preference an adaptive SVG follows, so ship one fixed SVG per scheme.
if (readmeAt) {
  mkdirSync(readmeAt, { recursive: true });
  const palettes = themePalettes(visualThemes.constellation);
  for (const scheme of ['light', 'dark']) {
    const css = scheme === 'light' ? lightCSS : darkCSS;
    const { scene: fixed } = createProjectConstellationScene(model, { ...look, colors: palettes[scheme], css });
    for (const node of fixed.nodes) if (kindById.get(node.id) === 'module') node.interaction.labelHidden = true;
    writeFileSync(`${readmeAt}/constellation-${scheme}.svg`, reframe(renderSceneSVG(fixed), fixed));
  }
  console.log(`README images written to ${readmeAt}`);
}

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/${date}.svg`, reframe(renderSceneSVG(scene), scene));
// The runtime's page chrome is dark-only; add a light variant (inline style is allowed by its CSP).
const lightChrome = '@media(prefers-color-scheme:light){body{background:#eef1f8}.constellation-runtime{color:#18213a;background:#fff}.constellation-toolbar button,.constellation-details button{background:#e3e8f5;border-color:#98a6c7}.constellation-details a{color:#2447a8}}';
writeFileSync(`${dir}/${date}.html`, renderSceneHTML(scene, { title: `Constellation of Constellation · ${date}` }).replace('</style></head>', lightChrome + '</style></head>'));
writeFileSync(`${dir}/${date}.model.json`, JSON.stringify(model, null, 1));
console.log(JSON.stringify({ date, look: { theme: look.visualTheme + ' (light+dark)', starfield: look.starfield.mode }, nodes: model.nodes.length, edges: model.edges.length, stats: model.statistics }, null, 1));
