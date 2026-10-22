// The "How it works" page's live example: the Studio's own engine draws the
// built-in example sky, with no GitHub requests. The page reads fine without
// it; if WebAssembly is blocked, the fallback sentence stays in place.
import { createEngine, defaultOptions } from './engine.mjs';
import { applySetting } from './settings.mjs';

const stage = document.getElementById('demo-stage');
const controls = document.getElementById('demo-controls');
const status = document.getElementById('demo-status');

const engine = createEngine();
const { account, repositories, profile } = engine.sample();
const base = defaultOptions(account, repositories, profile);
const names = { galaxy: 'Galaxy', rings: 'Rings', 'solar-system': 'Solar system', 'temporal-stack': 'Through time' };

// A shadow root keeps the page's styles away from the map's own nested SVGs,
// as the Studio's map does.
const host = document.createElement('div');
host.className = 'guide-sky';
const shadow = host.attachShadow({ mode: 'open' });

function draw({ announce = true } = {}) {
  const layout = controls.querySelector('input[name="layout"]:checked').value;
  const theme = controls.querySelector('input[name="theme"]:checked').value;
  let options = applySetting(base, 'look.theme', theme);
  options = applySetting(options, 'layout.arrangement', layout);
  // A "Generated …" date means nothing on a made-up example.
  const svg = engine.render(account, repositories, options, { sample: true }).svg
    .replace(/<text class="generated-at"[^>]*>[^<]*<\/text>/, '');
  shadow.innerHTML = `<style>:host{display:block}svg{display:block;width:100%;height:auto}</style>${svg}`;
  const picture = shadow.querySelector('svg');
  picture.removeAttribute('aria-labelledby');
  picture.setAttribute('role', 'img');
  picture.setAttribute('aria-label', `An example sky of ${repositories.length} projects in the ${names[layout]} layout`);
  if (announce) status.textContent = `Showing the ${names[layout]} layout.`;
}

draw({ announce: false });
stage.replaceChildren(host);
controls.addEventListener('change', () => draw());
controls.hidden = false;
