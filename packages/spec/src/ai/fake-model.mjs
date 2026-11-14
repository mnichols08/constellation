// Deterministic stand-ins for a language model. They make the whole
// prompt-to-constellation flow runnable offline, in CI and in the Studio,
// with no network, API key or provider SDK.
import { SUBMIT_TOOL } from './describe.mjs';

/**
 * Replays prerecorded turns. Each turn is a model result, or a function of the
 * request that returns one. Every request is recorded for assertions.
 */
export function createScriptedModel(turns = [], { name = 'scripted' } = {}) {
  const requests = [];
  let index = 0;
  return {
    name,
    requests,
    get remaining() { return Math.max(0, turns.length - index); },
    async generate(request, { signal } = {}) {
      signal?.throwIfAborted?.();
      requests.push(structuredClone(request));
      const turn = turns[index];
      index += 1;
      if (turn === undefined) return { text: 'The script has no more turns.' };
      return structuredClone(typeof turn === 'function' ? turn(request) : turn);
    },
  };
}

const has = (text, pattern) => pattern.test(text);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, name) => new RegExp(`(^|[^a-z0-9+#])${escape(name.toLowerCase())}($|[^a-z0-9+#])`).test(text);
// One- and two-letter names (C, R, Go) are ordinary words unless written exactly.
const named = (raw, text, name) => (name.length <= 2 ? new RegExp(`(^|[^A-Za-z0-9+#])${escape(name)}($|[^A-Za-z0-9+#])`).test(raw) : mentions(text, name));
const NUMBERS = { three: 3, five: 5, ten: 10, twelve: 12, twenty: 20, thirty: 30, fifty: 50 };

/**
 * Read a description with a fixed phrase list and the names the engine
 * reported. This is pattern matching, not language understanding: it exists so
 * the feature works and is testable without a model.
 */
export function interpretDescription(prompt, { languages = [], topics = [], currentSpec } = {}) {
  const text = ` ${String(prompt).toLowerCase().replace(/\s+/g, ' ')} `;
  const spec = currentSpec ? structuredClone(currentSpec) : { schema_version: 1 };
  spec.schema_version = 1;
  const groups = new Map((spec.groups || []).map((group) => [group.id, group]));
  const outward = has(text, /outskirt|outer|outward|outside|edge|far(ther|thest)? (out|away)|away from|periphery|rim\b|background/);
  const inward = has(text, /cent(er|re|ral)|inner|inward|inside|middle|core\b|near(er|est)?\b|front and|heart/);

  const raw = String(prompt);
  const language = languages.find((name) => named(raw, text, name));
  const topic = topics.find((name) => name.length > 2 && (mentions(text, name) || mentions(text, name.replace(/-/g, ' '))));
  if (language) spec.focus = { kind: 'language', value: language };
  else if (topic && has(text, /focus|cent(er|re)|around|about|highlight|emphasi[sz]e|important/)) spec.focus = { kind: 'topic', value: topic };
  else if (has(text, /featured|flagship|most important|best work|proudest|showcase/)) spec.focus = { kind: 'role', value: 'featured' };
  if (has(text, /no focus|nothing in particular|remove (the )?focus/)) delete spec.focus;

  const place = (id, label, match, wanted) => {
    const group = groups.get(id) || { id, label, match };
    if (wanted) group.placement = wanted; else if (!groups.has(id)) delete group.placement;
    groups.set(id, group);
  };
  if (has(text, /experiment|prototype|sandbox|toy project|playground/)) {
    place('experiments', 'Experiments', { role: 'experimental' }, outward ? 'outer' : has(text, /experiment\w* (near|at|in|to|toward) the (cent|middle|inside|core)/) ? 'inner' : undefined);
  }
  if (has(text, /\bold(er|est)?\b|archiv|dormant|historical|abandon|stale|legacy|inactive/)) {
    place('older-work', 'Older work', { any: [{ role: 'historical' }, { archived: true }, { updated: { older_than_days: 730 } }] }, outward || !inward ? 'outer' : undefined);
  }
  if (has(text, /recent|active|current|latest|lately|this year|newest/)) {
    place('recent-work', 'Recent work', { updated: { within_days: 180 } }, has(text, /(recent|active|current|latest|newest)[^.,;]*(cent|inner|inside|middle|near|core)/) ? 'inner' : undefined);
    spec.ranking = { ...(spec.ranking || {}), by: 'recency' };
  }
  if (has(text, /\bfork/)) place('forks', 'Forks', { fork: true }, outward ? 'outer' : undefined);
  if (topic && !spec.focus?.value?.includes?.(topic) && has(text, /group|cluster|together|separate/)) place(`topic-${topic}`.slice(0, 64).replace(/[^a-z0-9_-]/g, '-'), topic, { topic });

  const byTopic = has(text, /topic|subject|theme|similar|related|alike|kind of (work|project)/);
  const byLanguage = has(text, /language|tech(nology)?\b|stack/);
  const more = /(matter|count|weigh)\w* more|stronger|emphasi[sz]e|above all|mostly|primarily/;
  if (byTopic || byLanguage) {
    const topicFirst = byTopic && (!byLanguage || has(text, new RegExp(`topic\\w*[^.;]*(${more.source})|similar|related|alike`)));
    spec.relationships = byTopic && byLanguage || has(text, /similar|related|alike/)
      ? (topicFirst ? [{ basis: 'shared_topic', strength: 1 }, { basis: 'shared_language', strength: 0.6 }] : [{ basis: 'shared_language', strength: 1 }, { basis: 'shared_topic', strength: 0.6 }])
      : [{ basis: byTopic ? 'shared_topic' : 'shared_language', strength: 1 }];
  }
  if (has(text, /no (lines|connections|links)|without (lines|connections|links)|remove (the )?(lines|connections|links)/)) spec.relationships = [];

  const placed = [...groups.values()].some((group) => group.placement) || spec.focus;
  const layout = { ...(spec.layout || {}) };
  if (has(text, /\bweb\b|network|graph of|pull together/)) layout.kind = 'web';
  else if (has(text, /timeline|eras?\b|over time|through time|chronolog|by year|history of/)) layout.kind = 'timeline';
  else if (has(text, /galax|clusters? of|islands/)) layout.kind = 'clustered';
  else if (has(text, /solar system|planets?/) && !placed) layout.kind = 'solar_system';
  else if (has(text, /radial|concentric|\b(in|on|as|into) (rings|orbits|circles)|ring layout|solar system|planets?/) || placed) layout.kind = 'radial';
  const clusters = [];
  if (has(text, /similar|related|alike|by topic|topics? together|cluster\w* by (topic|subject|theme)/)) clusters.push('topic');
  if (has(text, /by language|languages? together|similar|related|alike|cluster\w* by (language|tech)/)) clusters.push('language');
  if (has(text, /by role|cluster\w* by role/)) clusters.push('role');
  if (clusters.length) layout.cluster_by = clusters;
  if (Object.keys(layout).length) spec.layout = layout;
  // Placement names ring distance, so it only survives on a radial layout.
  if ((spec.layout?.kind || 'radial') !== 'radial') for (const group of groups.values()) delete group.placement;

  const count = text.match(/\b(?:top|only|just|show|first|best)\s+(\d{1,4}|three|five|ten|twelve|twenty|thirty|fifty)\b/);
  if (count) spec.ranking = { ...(spec.ranking || {}), limit: Math.max(1, Math.min(2048, NUMBERS[count[1]] || Number(count[1]))) };
  if (has(text, /most starred|popular|by stars/)) spec.ranking = { ...(spec.ranking || {}), by: 'stars' };
  if (has(text, /all (my |of my )?(projects|repos|repositories)|everything/) && spec.ranking) delete spec.ranking.limit;

  const style = { ...(spec.style || {}) };
  if (has(text, /\bstill\b|static|no (motion|animation|movement)|calm and still|don'?t move|stop (the )?(motion|animation)/)) style.motion = 'still';
  else if (has(text, /lively|energetic|animated|busy|dynamic/)) style.motion = 'lively';
  else if (has(text, /calm|gentle|slow|subtle/)) style.motion = 'gentle';
  if (has(text, /round|circular|perfect circles/)) style.orbit_shape = 'round';
  else if (has(text, /\bwide\b|banner|stretched|ellip/)) style.orbit_shape = 'wide';
  if (has(text, /(no|hide|without|remove) (the )?(orbit )?rings/)) style.rings = false;
  else if (has(text, /show (the )?(orbit )?rings/)) style.rings = true;
  if (Object.keys(style).length) spec.style = style;

  if (groups.size) spec.groups = [...groups.values()]; else delete spec.groups;
  return spec;
}

/**
 * A reasonable sky chosen from the account overview alone, by fixed rules:
 * curated or most used work at the centre, stale work outward, a readable
 * number of projects. No model is involved, so the same account always gets
 * the same suggestion.
 */
export function suggestSpec(overview = {}) {
  const count = (role) => overview.roles?.find((item) => item.role === role)?.repositories || 0;
  const total = overview.repositories?.total || 0;
  const spec = { schema_version: 1 };
  const language = overview.languages?.[0];
  if (count('featured')) spec.focus = { kind: 'role', value: 'featured' };
  else if (language?.repositories >= 2) spec.focus = { kind: 'language', value: language.name };
  const groups = [];
  const stale = (overview.updated?.over_a_year_ago || 0) + (overview.repositories?.archived || 0);
  if ((overview.updated?.within_90_days || 0) >= 2) groups.push({ id: 'recent-work', label: 'Recent work', match: { updated: { within_days: 90 } }, placement: 'inner' });
  if (count('experimental')) groups.push({ id: 'experiments', label: 'Experiments', match: { role: 'experimental' }, placement: 'outer' });
  if (stale && total > 6) groups.push({ id: 'older-work', label: 'Older work', match: { any: [{ role: 'historical' }, { archived: true }, { fork: true }, { updated: { older_than_days: 365 } }] }, placement: 'outer' });
  if (groups.length) spec.groups = groups;
  const topical = (overview.topics || []).filter((topic) => topic.repositories >= 2).length >= 3;
  spec.relationships = topical ? [{ basis: 'shared_topic', strength: 1 }, { basis: 'shared_language', strength: 0.6 }] : [{ basis: 'shared_language', strength: 1 }];
  spec.layout = { kind: 'radial', cluster_by: topical ? ['topic', 'language'] : ['language'] };
  spec.ranking = { by: 'stars', ...(total > 20 ? { limit: 16 } : {}) };
  return spec;
}

/**
 * A model adapter that needs no model: it calls the discovery tools, then
 * submits what `interpretDescription` reads from the prompt. If the engine
 * rejects a part, it drops that part and submits again.
 */
export function createKeywordModel() {
  return {
    name: 'built-in phrase matcher',
    offline: true,
    async generate({ messages }, { signal } = {}) {
      signal?.throwIfAborted?.();
      const user = messages.find((message) => message.role === 'user');
      const results = Object.fromEntries(messages.filter((message) => message.role === 'tool').map((message) => {
        let content = {};
        try { content = JSON.parse(message.content); } catch {}
        return [message.name, content];
      }));
      if (user?.intent === 'suggest' && !results.portfolio_overview) return { toolCalls: [{ id: 'overview', name: 'portfolio_overview', arguments: {} }] };
      if (user?.intent !== 'suggest' && (!results.list_languages || !results.list_topics)) {
        return { toolCalls: [{ id: 'languages', name: 'list_languages', arguments: {} }, { id: 'topics', name: 'list_topics', arguments: {} }] };
      }
      const names = (list) => (Array.isArray(list) ? list.map((item) => item.name).filter((name) => typeof name === 'string') : []);
      const spec = user?.intent === 'suggest' ? suggestSpec(results.portfolio_overview) : interpretDescription(user?.content || '', { languages: names(results.list_languages.languages), topics: names(results.list_topics.topics), currentSpec: user?.currentSpec });
      // After a rejection, remove whatever the diagnostics point at.
      for (const diagnostic of results[SUBMIT_TOOL]?.diagnostics || []) {
        if (diagnostic.severity !== 'error') continue;
        const [section, index] = String(diagnostic.path).match(/^(\w+)(?:\[(\d+)\])?/)?.slice(1) || [];
        if (section === 'groups' && index !== undefined && spec.groups) spec.groups.splice(Number(index), 1);
        else if (section && section !== 'schema_version') delete spec[section];
      }
      return { toolCalls: [{ id: 'submit', name: SUBMIT_TOOL, arguments: { spec } }] };
    },
  };
}
