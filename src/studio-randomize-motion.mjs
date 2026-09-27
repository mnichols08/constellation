import { motionParts, v5Parameters } from './design-randomizer-v5.mjs';
export function mountRandomizeMotion(hero, master, storage) {
  const details = document.createElement('details'); details.className = 'randomize-motion-menu';
  const summary = document.createElement('summary'); summary.textContent = 'Animation parts'; details.append(summary);
  const body = document.createElement('div'); body.className = 'randomize-motion-parts'; details.append(body);
  const note = document.createElement('p'); note.textContent = 'Choose which animation layers can move. Partial randomization keeps your existing layout and enabled data layers; Full random can change those too.'; body.append(note);
  let saved = {};
  try { saved = JSON.parse(storage?.getItem('constellation-randomize-motion-v1') || '{}'); } catch {}
  const inputs = new Map();
  const read = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.checked]));
  for (const [key, title] of motionParts) {
    const label = document.createElement('label'); label.className = 'toggle-row'; label.textContent = title;
    const input = document.createElement('input'); input.type = 'checkbox'; input.id = `randomize-${key}`; input.checked = saved?.[key] !== false;
    input.addEventListener('input', () => { try { storage?.setItem('constellation-randomize-motion-v1', JSON.stringify(read())); } catch {} });
    label.append(input); body.append(label); inputs.set(key, input);
  }
  const sync = () => { for (const input of inputs.values()) input.disabled = !master.checked; };
  master.addEventListener('input', sync); sync();
  details.addEventListener('keydown', event => { if (event.key === 'Escape') { details.open = false; summary.focus(); } });
  document.addEventListener('click', event => { if (!details.contains(event.target)) details.open = false; });
  hero.append(details);
  return { read, sync,
    restore(code) {
      if (!/^v5:/i.test(code || '')) { sync(); return; }
      const { animations } = v5Parameters(code);
      master.checked = Object.values(animations).some(Boolean);
      // A still code keeps the user's part preferences for their next animated design.
      if (master.checked) for (const [key, input] of inputs) input.checked = animations[key];
      sync();
    },
  };
}
