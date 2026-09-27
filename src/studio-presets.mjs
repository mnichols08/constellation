const base = {
  theme: 'auto', visualTheme: 'deep-space', layout: 'atlas', maxRepos: 45,
  repoSource: 'all', nodeMode: 'repositories', nodeSize: 'stars', nodeColorMode: 'language',
  showOther: true, includeArchived: true, includeForks: false, minStars: 0,
  animate: false, starlightAnimate: false, identityRing: true, legend: true,
  connectionBasis: 'languages', connectionDensity: 'balanced', seedMode: 'account',
  starfield: { mode: 'classic' },
};
const organization = (view, scope = 'sample', contributors = false) => ({
  accountType: 'organization', organizationView: view, organizationScope: scope,
  organization: {
    contributors: { enabled: contributors, strategy: contributors ? 'representative' : 'off', maxRepositories: 20, maxContributorsPerRepo: 15 },
    grouping: { mode: view === 'history' ? 'year' : 'language' },
  },
});

export const studioPresets = [
  { id: 'project-map', label: 'Project map', audience: 'any', description: 'A readable map of projects, colored by language and sized by stars.', options: { arrangement: 'galaxy' } },
  { id: 'minimal-readme', label: 'Minimal README', audience: 'any', description: 'A compact, still constellation with a quiet background for your README.', options: { arrangement: 'field', visualTheme: 'monochrome', layout: 'compact', maxRepos: 25, nodeSize: 'uniform', starfield: { mode: 'off' }, legend: false } },
  { id: 'organization-projects', label: 'Organization · Project atlas', audience: 'organization', description: 'A representative set of projects grouped by language. No contributor scan.', options: { ...organization('projects'), arrangement: 'community-galaxy' } },
  { id: 'organization-featured', label: 'Organization · Flagship projects', audience: 'organization', description: 'Highlight up to 25 popular repositories. No contributor scan.', options: { ...organization('projects', 'featured'), arrangement: 'solar-system', maxRepos: 25 } },
  { id: 'organization-community', label: 'Organization · Community', audience: 'organization', description: 'Add public contributors around the project atlas. Scans up to 20 repositories, with up to 15 contributors per repository.', options: { ...organization('collaboration', 'sample', true), arrangement: 'community-galaxy', nodeMode: 'organization-community' } },
  { id: 'organization-technology', label: 'Organization · Technology map', audience: 'organization', description: 'Compare languages across a representative set of projects. No contributor scan.', options: { ...organization('technology'), arrangement: 'community-galaxy', nodeSize: 'membership' } },
  { id: 'organization-history', label: 'Organization · Project eras', audience: 'organization', description: 'Group surviving public repositories by creation year. Uses current metadata, not historical snapshots. No contributor scan.', options: { ...organization('history'), arrangement: 'era-rings', nodeSize: 'membership' } },
];

export function presetOptions(id, current = {}) {
  const preset = studioPresets.find(value => value.id === id);
  if (!preset) throw new Error('Choose a built-in preset.');
  const options = structuredClone({ ...base, ...preset.options });
  // Keep account identity while replacing filters and random visual settings.
  if (preset.audience === 'any') for (const key of ['accountType', 'organizationScope', 'organizationView', 'organization']) {
    if (current[key] !== undefined) options[key] = structuredClone(current[key]);
  }
  if (id === 'project-map') options.organizationView = 'projects';
  if (current.organizationUser) options.organizationUser = current.organizationUser;
  return options;
}
