import { contributionComet, renderContributionComet, cometCSS } from './contribution-comet.mjs';
import { DAY } from './historical-snapshot.mjs';

const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

// Synthetic evidence goes through the real streak model, but never enters saved data.
export function cometTestSnapshot(days, ended, reference) {
  if (!Number.isInteger(days) || days < 1 || days > 300) throw new Error('Choose a streak between 1 and 300 days.');
  const today = Math.floor(reference / DAY) * DAY;
  const latest = today - (ended ? 2 : 0) * DAY;
  const start = latest - (days - 1) * DAY;
  return {
    asOf: new Date(reference).toISOString(), coverageStart: new Date(start).toISOString(),
    events: Array.from({ length: days }, (_, i) => ({ id: `comet-test-${i}`, kind: 'push', repository: 'comet-test/streak', createdAt: new Date(start + i * DAY).toISOString() })),
  };
}

export function mountCometLab() {
  let panel, input, status, previousFocus, svg, account, override = null, keys = [], lastKey = 0;
  function paint() {
    svg?.querySelector('[data-comet-lab-overlay]')?.remove();
    if (!svg || !override) return;
    const reference = Date.now();
    const data = contributionComet(cometTestSnapshot(override.days, override.ended, reference), reference);
    const height = svg.viewBox.baseVal.height || 600, compact = height < 400;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-comet-lab-overlay', '');
    group.innerHTML = `<style>${cometCSS}\n.contribution-comet{display:none}[data-comet-lab-overlay] .contribution-comet{display:inline}</style>` + renderContributionComet(data, { centerY: compact ? 126 : 270, spreadY: compact ? 88 : 192, height }, true);
    const label = group.querySelector('text'); label.textContent = `TEST · ${label.textContent}`;
    svg.append(group);
    status.textContent = override.ended ? `Test: ${override.days}-day streak ended. Replaying the burst.` : `Test: ${override.days}-day streak flying.`;
  }
  function reset() {
    override = null; paint();
    if (status) status.textContent = 'Real activity restored. No test override.';
  }
  function open() {
    if (!panel) {
      panel = document.createElement('dialog'); panel.id = 'comet-lab'; panel.setAttribute('aria-labelledby', 'comet-lab-title');
      panel.innerHTML = `<h2 id="comet-lab-title">Comet test lab</h2><p>Preview only. Saved settings, exports, and GitHub activity stay real. Motion respects your reduced-motion preference.</p><label for="comet-lab-days">Streak length (days)</label><input id="comet-lab-days" type="number" min="1" max="300" step="1" value="7"><div class="comet-lab-actions"><button type="button" id="comet-lab-apply">Set streak</button><button type="button" id="comet-lab-end">End streak / replay burst</button><button type="button" id="comet-lab-reset">Reset to real activity</button><button type="button" id="comet-lab-close">Close</button></div><p id="comet-lab-status" role="status">No test override.</p>`;
      document.body.append(panel);
      input = panel.querySelector('input'); status = panel.querySelector('[role=status]');
      const simulate = ended => {
        if (!input.reportValidity() || !Number.isInteger(input.valueAsNumber)) return;
        override = { days: input.valueAsNumber, ended }; paint();
      };
      panel.querySelector('#comet-lab-apply').addEventListener('click', () => simulate(false));
      panel.querySelector('#comet-lab-end').addEventListener('click', () => simulate(true));
      panel.querySelector('#comet-lab-reset').addEventListener('click', reset);
      const close = () => { reset(); panel.close(); };
      panel.querySelector('#comet-lab-close').addEventListener('click', close);
      panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
      panel.addEventListener('close', () => { reset(); previousFocus?.focus({ preventScroll: true }); });
    }
    if (!panel.open) { previousFocus = document.activeElement; panel.show(); }
    input.focus();
  }
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.composedPath().some(node => node.matches?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) { keys = []; return; }
    if (Date.now() - lastKey > 5000) keys = [];
    lastKey = Date.now(); keys.push(event.key.length === 1 ? event.key.toLowerCase() : event.key); keys = keys.slice(-sequence.length);
    if (sequence.every((key, index) => keys[index] === key)) { keys = []; event.preventDefault(); open(); }
  });
  return {
    update(element, nextAccount) {
      if (account !== nextAccount) reset();
      account = nextAccount; svg = element; paint();
    },
  };
}
