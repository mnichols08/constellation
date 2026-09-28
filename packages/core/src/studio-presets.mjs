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
  { id: 'commit-asteroids', label: 'Commit asteroid field', audience: 'any', description: 'Commits become asteroids around their repositories. Contributor ships navigate the field. Load commit data in Motion for a real account.', options: { arrangement: 'galaxy', maxRepos: 12, nodeMode: 'repositories', nodeColorMode: 'custom', visualTheme: 'constellation', activityEffect: 'asteroids', animate: true, activityAnimate: true, contributionComet: { enabled: false }, starfield: { mode: 'space', density: 55 } } },
  { id: 'project-map', label: 'Project map', audience: 'any', description: 'A readable map of projects, colored by language and sized by stars.', options: { arrangement: 'galaxy' } },
  { id: 'classic-constellation', label: 'Classic Constellation', audience: 'any', description: 'The original midnight blue sky, cool blue connections and warm gold stars with identity rings.', options: { arrangement: 'rings', nodeMode: 'combined', nodeColorMode: 'custom', visualTheme: 'constellation' } },
  { id: 'flagship-projects', label: 'Flagship projects', audience: 'any', description: 'Put your most starred projects in a solar system, with up to 25 repositories.', options: { arrangement: 'solar-system', maxRepos: 25, sortBy: 'stars', majorMetric: 'stars', visualTheme: 'github-dark' } },
  { id: 'technology-atlas', label: 'Technology atlas', audience: 'any', description: 'Connect projects directly to their language and topic nodes to see what ties your work together.', options: { arrangement: 'galaxy', nodeMode: 'combined', connectionBasis: 'both', nodeColorMode: 'category', visualTheme: 'solarized' } },
  { id: 'language-orbits', label: 'Language orbits', audience: 'any', description: 'A focused view of languages, sized by how many repositories use them. Projects sharing languages create the connections.', options: { arrangement: 'orbital', nodeMode: 'languages', nodeSize: 'membership', visualTheme: 'dracula' } },
  { id: 'recent-work', label: 'Recent work', audience: 'any', description: 'Bring your 30 most recently updated repositories forward, with halos showing repository lifecycle stages.', options: { arrangement: 'solar-system', maxRepos: 30, sortBy: 'updated', majorMetric: 'updated', nodeSize: 'uniform', stellarAges: { enabled: true, mode: 'halo' }, visualTheme: 'contribution' } },
  { id: 'project-journey', label: 'Project journey', audience: 'any', description: 'Trace inferred language eras from creation dates of surviving public projects. This is current metadata, not historical snapshots.', options: { arrangement: 'field', nodeSize: 'age', languageEvolution: { enabled: true, style: 'timeline' }, visualTheme: 'synthwave' } },
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
  if (preset.audience === 'any') options.organizationView = 'projects';
  if (current.organizationUser) options.organizationUser = current.organizationUser;
  return options;
}
