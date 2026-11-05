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
  return unsubscribe;
}
