import { normalizeConfig } from './config-schema.mjs';

export const storyIntentLabels = Object.freeze({
  projects: 'Show my projects',
  'technical-shape': 'Show how my work connects',
  journey: 'Show my development journey',
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

export function experienceIdentity(options) {
  const text = JSON.stringify(stable(normalizeConfig(options, { trustedCSS: true })));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function experienceStore(storage, report) {
  const key = account => `constellation-experience-v1:${account.toLowerCase()}`;
  return {
    read(account, options) {
      try {
        const value = JSON.parse(storage?.getItem(key(account)) || 'null');
        if (!value) return null;
        if (value.identity !== experienceIdentity(options)) return null;
        if (!['auto', 'story', 'manual'].includes(value.storyMode)
          || !Object.hasOwn(storyIntentLabels, value.selectedStoryId)) throw Error('Invalid guided experience state.');
        if (value.publishing && (
          !['profile', 'repository', 'portfolio'].includes(value.publishing.destination)
          || !['svg', 'html'].includes(value.publishing.format)
          || !['current', '480', '900'].includes(value.publishing.presentation)
          || typeof value.publishing.repository !== 'string' || value.publishing.repository.length > 200
          || typeof value.publishing.filename !== 'string' || value.publishing.filename.length > 130
        )) throw Error('Invalid saved publishing setup.');
        return value;
      } catch (error) {
        report(`Saved experience could not be restored: ${error.message}`);
        return null;
      }
    },
    save(account, options, state) {
      try {
        storage?.setItem(key(account), JSON.stringify({
          identity: experienceIdentity(options),
          storyMode: state.storyMode,
          selectedStoryId: state.selectedStoryId,
          ...(state.publishing ? { publishing: state.publishing } : {}),
        }));
      } catch (error) {
        report(`Experience progress could not be saved: ${error.message}`);
      }
    },
  };
}

export function mountIntentChoices(host, candidates, choose, current = 'auto') {
  const group = document.createElement('div');
  group.className = 'guided-actions';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Choose what to communicate');
  for (const id of ['auto', ...Object.keys(storyIntentLabels)]) {
    const candidate = candidates.find(item => item.id === id);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = id === 'auto' ? 'Use recommendation' : storyIntentLabels[id];
    button.setAttribute('aria-pressed', String(current === id));
    const unavailable = id !== 'auto' && (!candidate?.scene || candidate.available === false);
    button.setAttribute('aria-disabled', String(unavailable));
    if (unavailable) {
      const reason = document.createElement('span');
      reason.id = `guided-${id}-reason`;
      reason.textContent = `Unavailable: ${candidate?.reason || 'No project evidence is available.'}`;
      button.setAttribute('aria-describedby', reason.id);
      button.append(reason);
    }
    button.addEventListener('click', () => { if (!unavailable) choose(id); });
    group.append(button);
  }
  host.append(group);
}
