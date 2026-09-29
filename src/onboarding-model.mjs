import { repositoryLanguages } from './constellation.mjs';
import { temporalEligibility } from './design-randomizer-v6.mjs';

export function recommendProjects(repositories, mode = 'recommended', limit = 24) {
  const pool = repositories.filter(repo => !repo.private);
  const time = repo => Date.parse(repo.pushed_at || repo.updated_at) || 0;
  const newest = Math.max(1, ...pool.map(time));
  const score = repo => mode === 'recent' ? time(repo) : mode === 'popular' ? repo.stargazers_count || 0
    : Math.log2(1 + (repo.stargazers_count || 0)) + 4 * Math.max(0, 1 - (newest - time(repo)) / (3 * 365.25 * 86400000)) + (repo.description ? 1 : 0) + (repo.language ? 1 : 0) + (repo.topics?.length ? 1 : 0) - (repo.fork ? 3 : 0) - (repo.archived ? 3 : 0);
  return [...pool].sort((a, b) => score(b) - score(a) || a.full_name.localeCompare(b.full_name)).slice(0, limit).map(repo => repo.full_name);
}
export function choicesFor(repositories, projects, year) {
  const selected = repositories.filter(repo => projects.includes(repo.full_name));
  return { selected, languages: [...new Set(selected.flatMap(repositoryLanguages))].sort(), topics: [...new Set(selected.flatMap(repo => repo.topics || []))].sort(), history: temporalEligibility(selected, [], year) };
}
export function defaultIntent(repositories) {
  return { version: 1, projects: recommendProjects(repositories), languages: null, topics: null, activity: 'surprise', history: 'current', motion: 'automatic', vibe: 'cosmic' };
}
export function validateIntent(value) {
  const strings = (list, max) => Array.isArray(list) && list.length <= max && list.every(item => typeof item === 'string' && item.length > 0 && item.length <= 200);
  if (!value || value.version !== 1 || !strings(value.projects, 100) || !value.projects.length || !['languages', 'topics'].every(key => value[key] === null || strings(value[key], 100)) || !['none', 'surprise', 'asteroids', 'orbit', 'recent', 'subtle'].includes(value.activity) || !['current', 'history', '3d', 'surprise'].includes(value.history) || !['automatic', 'still'].includes(value.motion) || !['cosmic', 'clean', 'technical', 'classic', 'surprise'].includes(value.vibe)) throw Error('Choose 1–100 projects and valid showcase preferences.');
  return Object.fromEntries(['version', 'projects', 'languages', 'topics', 'activity', 'history', 'motion', 'vibe'].map(key => [key, structuredClone(value[key])]));
}
export function intentStore(storage) {
  const key = account => `constellation-intent-v1:${account.toLowerCase()}`;
  return {
    read(account) { try { return validateIntent(JSON.parse(storage?.getItem(key(account)))); } catch { return null; } },
    save(account, intent) { const value = validateIntent(intent); try { storage?.setItem(key(account), JSON.stringify(value)); return !!storage; } catch { return false; } },
  };
}
