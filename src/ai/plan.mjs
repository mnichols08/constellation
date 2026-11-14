// Turn a compiled ConstellationSpec into plain sentences a person can check
// before applying it. Presentation only: every fact comes from the Rust
// compiler's output, and nothing here decides what a spec means.

const PLACE = { center: 'nearest the centre', inner: 'on the inner ring', middle: 'on the middle ring', outer: 'on the outer ring' };
const LAYOUT = {
  radial: 'Rings: distance from the centre follows this plan.',
  clustered: 'Galaxy: projects gather into clusters.',
  solar_system: 'Solar system: the biggest projects become planets.',
  web: 'Web: related projects pull together.',
  timeline: 'Eras: older projects sit further out.',
};
const CLUSTER = { language: 'language', topic: 'topic', role: 'the role you gave them', group: 'group' };
const RANK = { stars: 'most starred', recency: 'most recently updated', name: 'first by name' };
const MOTION = { still: 'The map stays still.', gentle: 'The map moves gently.', lively: 'The map moves in a lively way.' };
const SHOWN = 8;

const short = (id) => String(id).split('/').pop();
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const list = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

function filterText(filter) {
  if (!filter || typeof filter !== 'object') return 'anything';
  const [key, value] = Object.entries(filter)[0] || [];
  switch (key) {
    case 'language': return `written in ${value}`;
    case 'topic': return `tagged ${value}`;
    case 'role': return value === 'unassigned' ? 'with no role set by you' : `you marked ${value}`;
    case 'repository': return `named ${short(value)}`;
    case 'stars': return [value.min !== undefined && `at least ${plural(value.min, 'star')}`, value.max !== undefined && `at most ${plural(value.max, 'star')}`].filter(Boolean).join(' and ');
    case 'updated': return [value.within_days !== undefined && `updated in the last ${plural(value.within_days, 'day')}`, value.older_than_days !== undefined && `not updated for ${plural(value.older_than_days, 'day')}`].filter(Boolean).join(' and ');
    case 'archived': return value ? 'archived' : 'not archived';
    case 'fork': return value ? 'forked from another project' : 'not a fork';
    case 'any': return value.map(filterText).join(', or ');
    case 'all': return value.map(filterText).join(', and ');
    case 'not': return `not ${filterText(value)}`;
    default: return 'anything';
  }
}

function focusText(focus) {
  if (!focus) return null;
  if (focus.kind === 'language') return `Projects written in ${focus.value}`;
  if (focus.kind === 'topic') return `Projects tagged ${focus.value}`;
  if (focus.kind === 'role') return `Projects you marked ${focus.value}`;
  if (focus.kind === 'repository') return short(focus.value);
  return `The “${focus.value}” group`;
}

function linesText(relationships = []) {
  const active = relationships.filter((item) => item.strength > 0).sort((a, b) => b.strength - a.strength);
  if (!active.length) return 'No lines between projects.';
  const name = (item) => (item.basis === 'shared_topic' ? 'topics' : 'languages');
  if (active.length === 1) return `Lines join projects that share ${name(active[0])}.`;
  return active[0].strength === active[1].strength
    ? `Lines join projects that share ${name(active[0])} or ${name(active[1])}, equally.`
    : `Lines join projects that share ${name(active[0])}, and more faintly ${name(active[1])}.`;
}

const projects = (members = [], total = members.length) => ({
  projects: members.slice(0, SHOWN).map((member) => (typeof member === 'string' ? { name: short(member), id: member, reasons: [] } : { name: short(member.id), id: member.id, reasons: (member.reasons || []).map((reason) => reason.detail) })),
  more: Math.max(0, total - Math.min(SHOWN, members.length)),
});

const NOTE = {
  empty_group: (d, compiled) => `“${groupAt(compiled, d.path)?.label || 'A group'}” matches none of your projects, so it changes nothing.`,
  empty_focus: () => 'Nothing matches what you asked to put at the centre.',
  overlapping_placement: (d, compiled) => `Some projects fit more than one group; they stay where the earlier group puts them, not with “${groupAt(compiled, d.path)?.label || 'the later group'}”.`,
  unknown_language: (d) => `None of your projects use ${d.received || 'that language'}.`,
  unknown_topic: (d) => `None of your projects are tagged ${d.received || 'with that topic'}.`,
};
function groupAt(compiled, path) {
  const index = Number(String(path).match(/^groups\[(\d+)\]/)?.[1]);
  return Number.isInteger(index) ? compiled.groups[index] : null;
}

/** Sections of the spec that differ between two normalized specs, in plain words. */
export function planChanges(previous, next) {
  if (!previous) return [];
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changes = [];
  if (!same(previous.focus, next.focus)) changes.push(next.focus ? `Centre: ${focusText(next.focus)}${previous.focus ? ` (was ${focusText(previous.focus).toLowerCase()})` : ''}.` : 'Nothing in particular at the centre any more.');
  const before = new Map((previous.groups || []).map((group) => [group.id, group]));
  for (const group of next.groups || []) {
    const old = before.get(group.id);
    before.delete(group.id);
    if (!old) changes.push(`New group “${group.label}”${group.placement ? `, ${PLACE[group.placement]}` : ''}.`);
    else if (old.placement !== group.placement) changes.push(group.placement ? `“${group.label}” moves ${PLACE[group.placement]}.` : `“${group.label}” no longer has a fixed ring.`);
    else if (!same(old.match, group.match)) changes.push(`“${group.label}” now holds projects ${filterText(group.match)}.`);
  }
  for (const group of before.values()) changes.push(`The “${group.label}” group is removed.`);
  if (!same(previous.relationships, next.relationships)) changes.push(linesText(next.relationships));
  if (!same(previous.layout, next.layout)) changes.push(`Layout: ${LAYOUT[next.layout.kind].replace(/\.$/, '')}${next.layout.cluster_by.length ? `, side by side by ${list(next.layout.cluster_by.map((key) => CLUSTER[key]))}` : ''}.`);
  if (!same(previous.ranking, next.ranking)) changes.push(next.ranking.limit ? `Shows your ${next.ranking.limit} ${RANK[next.ranking.by]} projects.` : `Orders projects ${RANK[next.ranking.by]} first.`);
  if (!same(previous.style, next.style)) changes.push('Look: ' + ([next.style?.motion && MOTION[next.style.motion], next.style?.orbit_shape && `${next.style.orbit_shape === 'round' ? 'Round' : 'Wide'} orbits.`, next.style?.rings === false && 'Orbit rings hidden.', next.style?.rings === true && 'Orbit rings shown.'].filter(Boolean).join(' ') || 'back to your own settings.'));
  return changes;
}

/**
 * @param {object} compiled The `compiled` object returned by the engine.
 * @param {{ previousSpec?: object }} [context] The spec currently applied, for follow-up requests.
 * @returns {{ sections: { id: string, label: string, text: string, projects?: object[], more?: number }[], changes: string[], notes: string[], unchanged: boolean }}
 */
export function describePlan(compiled, { previousSpec } = {}) {
  const { spec } = compiled;
  const sections = [];
  if (spec.focus) {
    const total = compiled.focus?.total ?? 0;
    sections.push({ id: 'focus', label: 'At the centre', text: `${focusText(spec.focus)} sit nearest the centre. ${plural(total, 'project')} match${total === 1 ? 'es' : ''}.`, ...projects(compiled.focus?.members, total) });
  }
  for (const group of compiled.groups) {
    const where = group.placement ? `placed ${PLACE[group.placement]}` : 'kept together';
    sections.push({ id: `group-${group.id}`, label: group.label, text: `Projects ${filterText(spec.groups.find((item) => item.id === group.id)?.match)}, ${where}. ${plural(group.total, 'project')} match${group.total === 1 ? 'es' : ''}.`, ...projects(group.members, group.total) });
  }
  sections.push({ id: 'lines', label: 'Lines', text: linesText(spec.relationships) });
  const side = spec.layout.cluster_by.length ? ` Similar projects sit side by side, by ${list(spec.layout.cluster_by.map((key) => CLUSTER[key]))}.` : '';
  sections.push({ id: 'layout', label: 'Layout', text: `${LAYOUT[spec.layout.kind]}${spec.layout.kind === 'radial' ? side : ''}` });
  const { total, included } = compiled.repositories;
  if (spec.ranking.limit && included < total) sections.push({ id: 'showing', label: 'Showing', text: `Your ${included} ${RANK[spec.ranking.by]} projects, out of ${total}.` });
  const look = [spec.style?.motion && MOTION[spec.style.motion], spec.style?.orbit_shape && `${spec.style.orbit_shape === 'round' ? 'Round' : 'Wide'} orbits.`, spec.style?.rings === false && 'Orbit rings hidden.', spec.style?.rings === true && 'Orbit rings shown.'].filter(Boolean);
  if (look.length) sections.push({ id: 'look', label: 'Look', text: look.join(' ') });
  const notes = (compiled.diagnostics || []).map((diagnostic) => NOTE[diagnostic.code]?.(diagnostic, compiled)).filter(Boolean);
  const changes = planChanges(previousSpec, spec);
  return { sections, changes, notes: [...new Set(notes)], unchanged: Boolean(previousSpec) && changes.length === 0 };
}

/** One readable sentence for a failed request. Diagnostics stay available to developers. */
export function describeFailure(result) {
  switch (result?.reason) {
    case 'invalid_prompt': return result.message;
    case 'aborted': return 'Stopped. Nothing was changed.';
    case 'adapter_error': return 'The description could not be read right now. Nothing was changed. Try again in a moment.';
    case 'tool_limit':
    case 'turn_limit': return 'That description took too many steps to work out. Try a shorter one.';
    case 'repair_limit': {
      const first = result.diagnostics?.find((item) => item.severity !== 'warning');
      // The reader answered in words, or with nothing usable, instead of a plan.
      if (first?.code === 'missing_field' && first.path === '') return 'The reader answered without making a plan. Try again, or say where things should go, for example: “Rust and WebAssembly in the centre, my JavaScript projects around them.”';
      return `That description could not be turned into a plan${first?.message ? ` (${first.message.toLowerCase()})` : ''}. Try describing it another way.`;
    }
    default: return 'That description could not be turned into a plan. Try describing it another way.';
  }
}
