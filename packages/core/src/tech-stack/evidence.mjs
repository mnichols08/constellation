// What a reader can learn from a scan without decoding the map: which
// technologies are current, for how long each has appeared, which are used
// together, and which repositories show each one.
//
// Everything here is a count or a date from public repository metadata. It
// says what is declared and when repositories were active. It never rates a
// person, and "declared" still doesn't prove "used".
import { LANGUAGE_GROUP, STACK_LAYERS, TECH_GROUPS, isIncidentalLanguage, isToolingTech, techGroup } from './catalog.mjs';

/** A technology is "current" when a repository declaring it was pushed to within this many days of the scan. */
export const CURRENT_DAYS = 365;
/** A repository counts as "worked on over time" when its first and last activity are at least this far apart. */
export const SUSTAINED_DAYS = 30;
const DAY = 86_400_000;
const MAX_STACKS = 4;
const MAX_STACK_SIZE = 4;
const MAX_ITEMS_PER_REPOSITORY = 6;
const EXAMPLES = 2;

const time = (value) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; };
const year = (ms) => new Date(ms).getUTCFullYear();
const clean = (text, limit) => {
  const flat = String(text ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
};
const githubUrl = (record) => (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(record.html_url || '') ? record.html_url : null);

/** "2021 to now", "2019 to 2022", or a single year. */
export const formatYears = (item, separator = '–') => {
  if (item.first === null) return '';
  const end = item.current ? 'now' : String(item.last);
  return String(item.first) === end ? end : `${item.first}${separator}${end}`;
};
export const plural = (count, word = 'repository', many = 'repositories') => `${count} ${count === 1 ? word : many}`;

/**
 * @param {object} scan A finished tech stack scan.
 * @param {{ featured?: string[] }} [options] Repository names the developer wants shown first as examples.
 */
export function techStackEvidence(scan, { featured = [] } = {}) {
  const asOf = time(scan.scannedAt) ?? Date.now();
  const wanted = new Set((Array.isArray(featured) ? featured : []).map((name) => String(name).split('/').pop().toLowerCase()));
  const repositories = scan.records.map((record) => {
    const start = time(record.created_at);
    const end = time(record.pushed_at) ?? time(record.updated_at) ?? start;
    return {
      record, start: start ?? end, end,
      current: end !== null && asOf - end <= CURRENT_DAYS * DAY,
      sustained: start !== null && end !== null && end - start >= SUSTAINED_DAYS * DAY,
      featured: wanted.has(String(record.name).toLowerCase()),
    };
  });

  const best = (members) => [...members]
    .sort((a, b) => b.featured - a.featured || a.record.archived - b.record.archived || b.sustained - a.sustained
      || b.record.stargazers_count - a.record.stargazers_count || (b.end ?? 0) - (a.end ?? 0) || a.record.name.localeCompare(b.record.name))
    .slice(0, EXAMPLES)
    .map(({ record, end }) => ({ name: record.name, url: githubUrl(record), description: clean(record.description, 90), lastYear: end === null ? null : year(end), archived: Boolean(record.archived) }));
  const summary = (members) => {
    const starts = members.map((item) => item.start).filter((value) => value !== null);
    const ends = members.map((item) => item.end).filter((value) => value !== null);
    const from = starts.length ? Math.min(...starts) : null, to = ends.length ? Math.max(...ends) : null;
    return {
      repositories: members.length,
      sustained: members.filter((item) => item.sustained).length,
      recent: members.filter((item) => item.current).length,
      current: members.some((item) => item.current),
      from, to,
      first: from === null ? null : year(from),
      last: to === null ? null : year(to),
      examples: best(members),
    };
  };
  const byWeight = (a, b) => b.current - a.current || b.sustained - a.sustained || b.repositories - a.repositories || a.name.localeCompare(b.name);

  const members = new Map();
  const add = (key, repository) => { if (!members.has(key)) members.set(key, []); members.get(key).push(repository); };
  for (const repository of repositories) {
    for (const language of Object.keys(repository.record.languages)) if (!isIncidentalLanguage(language)) add(`language:${language}`, repository);
    for (const tech of repository.record.dependencies) add(`technology:${tech}`, repository);
  }
  const color = new Map(TECH_GROUPS.map((group) => [group.id, group.color]));
  const technologies = [...members].map(([key, list]) => {
    const [kind, name] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const group = kind === 'language' ? LANGUAGE_GROUP : techGroup(name);
    return { name, kind, group, color: color.get(group) || '#bcc5d8', role: kind === 'technology' && isToolingTech(name) ? 'tooling' : 'core', ...summary(list) };
  }).sort(byWeight);

  // Stacks: technologies from the frontend, backend and data layers that are
  // declared together. Found from the account's own repositories rather than a
  // fixed list, keeping the largest combination that is still common.
  const layer = (tech) => STACK_LAYERS.indexOf(techGroup(tech));
  const weight = new Map(technologies.map((tech) => [tech.name, tech.repositories]));
  const itemsOf = (repository) => repository.record.dependencies
    .filter((tech) => layer(tech) >= 0 && !isToolingTech(tech))
    .sort((a, b) => weight.get(b) - weight.get(a) || a.localeCompare(b))
    .slice(0, MAX_ITEMS_PER_REPOSITORY)
    .sort((a, b) => layer(a) - layer(b) || a.localeCompare(b));
  const combos = new Map();
  let stackable = 0;
  for (const repository of repositories) {
    const items = itemsOf(repository);
    if (items.length < 2) continue;
    stackable += 1;
    walkInto(combos, items, repository);
  }
  const support = stackable >= 6 ? 2 : 1;
  const candidates = [...combos].map(([key, list]) => ({ techs: key.split('\u0001'), list })).filter((combo) => combo.list.length >= support);
  const within = (small, large) => small.every((tech) => large.includes(tech));
  const closed = candidates.filter((combo) => !candidates.some((other) => other.techs.length > combo.techs.length && other.list.length === combo.list.length && within(combo.techs, other.techs)));
  closed.sort((a, b) => b.list.length * (b.techs.length - 1) - a.list.length * (a.techs.length - 1) || b.list.length - a.list.length || a.techs.join().localeCompare(b.techs.join()));
  const stacks = [];
  for (const combo of closed) {
    if (stacks.length === MAX_STACKS) break;
    if (stacks.some((picked) => within(combo.techs, picked.techs) || within(picked.techs, combo.techs))) continue;
    stacks.push({ name: combo.techs.join(' + '), techs: combo.techs, ...summary(combo.list) });
  }
  stacks.sort(byWeight);

  const total = repositories.length;
  const recent = repositories.filter((repository) => repository.current).length;
  const starts = repositories.map((repository) => repository.start).filter((value) => value !== null);
  // The headline names languages that are the main language of a repository,
  // so stylesheets and markup alongside the real work don't lead.
  const mainOf = new Map();
  for (const repository of repositories) {
    const main = repository.record.language;
    if (main && !isIncidentalLanguage(main)) mainOf.set(main, (mainOf.get(main) || 0) + 1);
  }
  const languages = technologies.filter((tech) => tech.kind === 'language' && mainOf.has(tech.name));
  const leading = (languages.some((tech) => tech.current) ? languages.filter((tech) => tech.current) : languages)
    .sort((a, b) => b.current - a.current || mainOf.get(b.name) - mainOf.get(a.name) || byWeight(a, b)).slice(0, 3).map((tech) => tech.name);
  const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
  const activity = total ? `${recent} of ${plural(total, 'public repository', 'public repositories')} updated in the last year.` : 'No public repositories to count.';
  const headline = leading.length
    ? `${languages.some((tech) => tech.current) ? 'Mostly' : 'Earlier work in'} ${list(leading)}. ${activity}`
    : activity;

  return {
    login: scan.login,
    asOf: new Date(asOf).toISOString(),
    total, recent,
    span: { from: starts.length ? Math.min(...starts) : asOf, to: asOf },
    partial: Boolean(scan.coverage?.stopped || scan.coverage?.missing || scan.coverage?.refused),
    discovered: scan.coverage?.discovered ?? total,
    headline,
    stacks,
    core: technologies.filter((tech) => tech.role === 'core'),
    tooling: technologies.filter((tech) => tech.role === 'tooling'),
  };
}

// Every combination of 2 to MAX_STACK_SIZE items, each counted once per repository.
function walkInto(combos, items, repository) {
  const visit = (start, chosen) => {
    if (chosen.length >= 2) {
      const key = chosen.join('\u0001');
      if (!combos.has(key)) combos.set(key, []);
      combos.get(key).push(repository);
    }
    if (chosen.length === MAX_STACK_SIZE) return;
    for (let index = start; index < items.length; index += 1) visit(index + 1, [...chosen, items[index]]);
  };
  visit(0, []);
}
