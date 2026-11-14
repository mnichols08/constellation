import { h, icon } from '../../dom.mjs';
import { mountSettingsPanel } from './settings-panel.mjs';

export function mountLayoutPanel(section, ctx) {
  const unsubscribe = mountSettingsPanel(section, ctx, { group: 'layout', galleryTitle: 'Pick a layout', controlsTitle: 'Connections' });
  // Its own sheet rather than a layout card: it reads different data, and needs sign-in.
  // First in the panel, so nobody has to scroll past every layout to find it.
  section.prepend(h('section', { class: 'panel-section' },
    h('h3', { text: 'Tech stack' }),
    h('p', { class: 'field-help', text: 'Map the languages and frameworks across every public repository. Needs GitHub sign-in.' }),
    h('button', { class: 'btn btn-block', type: 'button', onclick: () => ctx.actions.openTechStack() }, icon('layers', { size: 18 }), 'Map a tech stack')));
  // Words instead of settings. Optional: every layout below works without it.
  // Second, so Tech stack keeps the first place its own guide promises.
  const describe = h('section', { class: 'panel-section' },
    h('h3', { text: 'Describe it' }),
    h('p', { class: 'field-help', text: 'Say what you want to see in words. You check the plan before anything changes.' }),
    h('button', { class: 'btn btn-block', type: 'button', onclick: () => ctx.actions.openDialog('describe') }, icon('sparkle', { size: 18 }), 'Describe your sky'));
  section.firstElementChild.after(describe);
  return unsubscribe;
}
