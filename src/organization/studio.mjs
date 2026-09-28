import { organizationOptions } from './settings.mjs';
export function mountOrganizationControls(host, changed) {
  const panel = document.createElement('details'); panel.id = 'organization-controls';
  const summary = document.createElement('summary'); summary.textContent = 'Account & organization'; panel.append(summary); host.append(panel);
  const inputs = {};
  const note = document.createElement('p'); note.textContent = 'Deep scans can cost up to 2,000 API requests. Set a limit, then click Load contributor data. Cached results are reused; scanning stops at rate limits.'; note.hidden = true;
  const control = (name, title, choices) => {
    const label = document.createElement('label'), input = document.createElement(choices ? 'select' : 'input');
    input.id = `org-${name}`; label.htmlFor = input.id; label.textContent = title;
    if (choices) for (const value of choices) { const option = document.createElement('option'); option.value = value; option.textContent = value; input.append(option); }
    else input.type = name === 'pattern' ? 'text' : 'number';
    input.addEventListener('input', () => { note.hidden = inputs.strategy.value !== 'deep'; changed(); });
    panel.append(label, input); inputs[name] = input;
  };
  control('type', 'Account type', ['auto', 'user', 'organization']);
  control('scope', 'Organization scope', ['active', 'featured', 'recent', 'sample', 'all-metadata']);
  control('view', 'Organization view', ['projects', 'community', 'collaboration', 'technology', 'history']);
  control('strategy', 'Contributor discovery', ['representative', 'off', 'featured', 'active', 'deep']);
  control('maxRepositories', 'Repositories to scan'); inputs.maxRepositories.min = 1; inputs.maxRepositories.max = 2000;
  control('maxContributorsPerRepo', 'Contributors per repository'); inputs.maxContributorsPerRepo.min = 1; inputs.maxContributorsPerRepo.max = 100;
  control('grouping', 'Group projects by', ['auto', 'year', 'prefix', 'topic', 'language', 'regex', 'none']);
  control('pattern', 'Named capture pattern'); inputs.pattern.placeholder = '^v(?<voyage>\\d+)-(?<tier>tier\\d+)-'; inputs.pattern.maxLength = 180;
  panel.append(note);
  const help = document.createElement('p'); help.textContent = 'Scope and contributor changes take effect when you load data. Contributor counts cover selected repositories. All-metadata can make up to 1,000 paginated requests. Dependencies appear when supplied in repository data.'; panel.append(help);
  const load = document.createElement('button'); load.id = 'load-organization'; load.type = 'button'; load.textContent = 'Load contributor data'; panel.append(load);
  const status = document.createElement('p'); status.id = 'organization-status'; status.setAttribute('role', 'status'); panel.append(status);
  return {
    read: () => ({ accountType: inputs.type.value, organizationScope: inputs.scope.value, organizationView: inputs.view.value, organization: { contributors: { enabled: inputs.strategy.value !== 'off', strategy: inputs.strategy.value, maxRepositories: Number(inputs.maxRepositories.value), maxContributorsPerRepo: Number(inputs.maxContributorsPerRepo.value) }, grouping: { mode: inputs.grouping.value, pattern: inputs.pattern.value } } }),
    restore(options) { const settings = organizationOptions(options); for (const [key, value] of Object.entries({ type: settings.accountType, scope: settings.scope, view: settings.view, strategy: settings.contributors.enabled ? settings.contributors.strategy : 'off', maxRepositories: settings.contributors.maxRepositories, maxContributorsPerRepo: settings.contributors.maxContributorsPerRepo, grouping: settings.grouping.mode, pattern: settings.grouping.pattern })) inputs[key].value = value; note.hidden = inputs.strategy.value !== 'deep'; },
  };
}
