import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScene } from '../src/constellation.mjs';
import { semanticGraphFromScene } from '../src/semantic-graph.mjs';
import { generateStoryCandidates, recommendStoryCandidate } from '../src/story-candidates.mjs';

const profiles = JSON.parse(await readFile(new URL('./fixtures/story-profiles.json', import.meta.url), 'utf8'));
function graphFor(profile) {
  const records = Array.from({ length: profile.projects }, (_, i) => ({
    full_name: `sample/repo-${String(i).padStart(2, '0')}`, name: `${profile.id} project ${i + 1}`,
    language: profile.languages.length ? profile.languages[i % profile.languages.length] : null,
    topics: profile.topics.length ? [profile.topics[i % profile.topics.length]] : [],
    created_at: profile.id === 'long-history' ? `${2010 + Math.floor(i / 6) * 4 + (i % 4)}-04-01T00:00:00Z` : null,
    ...(profile.id === 'long-history' ? { language: profile.languages[Math.floor(i / 6)] } : {}),
  }));
  return semanticGraphFromScene(createScene('sample', records, { seed: profile.id, showOther: true, nodeMode: 'repositories', referenceDate: '2026-01-01T00:00:00Z' }));
}

test('representative profile fixture inventory is deterministic and broad', () => {
  assert.equal(profiles.length, 10);
  assert.deepEqual(profiles.map(item => item.id), ['frontend-heavy','full-stack','polyglot-tooling','one-language-specialist','many-tiny-repos','sparse-metadata','long-history','mostly-forks','organization-contributor','small-portfolio']);
});

test('one-language evidence keeps Projects as a safe recommendation', () => {
  const profile = profiles.find(item => item.id === 'one-language-specialist');
  const candidates = generateStoryCandidates(graphFor(profile), { seed: profile.id, referenceDate: '2026-01-01T00:00:00Z' });
  assert.equal(candidates.length, 3);
  assert.equal(recommendStoryCandidate(candidates).id, 'projects');
  assert.equal(candidates.find(item => item.id === 'technical-shape').available, false);
  assert.ok(candidates.find(item => item.id === 'technical-shape').quality.dimensions.differentiation < 0.25);
});

test('sparse metadata remains a usable Projects story and Journey is gated', () => {
  const profile = profiles.find(item => item.id === 'sparse-metadata');
  const candidates = generateStoryCandidates(graphFor(profile), { seed: profile.id, referenceDate: '2026-01-01T00:00:00Z' });
  assert.ok(candidates.find(item => item.id === 'projects').scene.nodes.length > 0);
  assert.equal(candidates.find(item => item.id === 'journey').available, false);
  assert.equal(recommendStoryCandidate(candidates).id, 'projects');
});

test('dated long history can produce a bounded Journey view', () => {
  const profile = profiles.find(item => item.id === 'long-history');
  const candidates = generateStoryCandidates(graphFor(profile), { seed: profile.id, referenceDate: '2026-01-01T00:00:00Z' });
  const journey = candidates.find(item => item.id === 'journey');
  assert.equal(journey.available, true);
  assert.equal(journey.scene.temporalStack.axis, 'year');
  assert.ok(journey.scene.temporalStack.layers.length <= 20);
});

test('small portfolios do not require thematic groups', () => {
  const profile = profiles.find(item => item.id === 'small-portfolio');
  const candidates = generateStoryCandidates(graphFor(profile), { seed: profile.id, referenceDate: '2026-01-01T00:00:00Z' });
  const projects = candidates.find(item => item.id === 'projects');
  assert.equal(projects.scene.nodes.filter(node => node.metadata?.full_name).length, 4);
  assert.equal(candidates.find(item => item.id === 'technical-shape').available, false);
  assert.equal(recommendStoryCandidate(candidates).id, 'projects');
});

test('representative projects are capped at twelve and preserve featured intent', () => {
  const profile = profiles.find(item => item.id === 'many-tiny-repos');
  const showcase = { 'sample/repo-49': { role: 'featured', priority: 1 } };
  const records = Array.from({ length: profile.projects }, (_, i) => ({ full_name: `sample/repo-${i}`, name: `Repo ${i}`, language: 'JavaScript', topics: [] }));
  const graph = semanticGraphFromScene(createScene('sample', records, { nodeMode: 'repositories', showOther: true, projectShowcase: showcase, seed: 'many-tiny-repos' }));
  const candidates = generateStoryCandidates(graph, { projectShowcase: showcase, seed: 'many-tiny-repos' });
  const projects = candidates.find(item => item.id === 'projects').scene.nodes.filter(node => node.metadata?.full_name);
  assert.equal(projects.length, 12);
  assert.ok(projects.some(node => node.id === 'sample/repo-49'));
});

test('frontend, full-stack, and tooling fixtures produce bounded candidates', () => {
  for (const id of ['frontend-heavy', 'full-stack', 'polyglot-tooling', 'mostly-forks', 'organization-contributor']) {
    const profile = profiles.find(item => item.id === id);
    const candidates = generateStoryCandidates(graphFor(profile), { seed: id, referenceDate: '2026-01-01T00:00:00Z' });
    assert.equal(candidates.length, 3, id);
    assert.ok(candidates.every(item => !item.scene || item.scene.nodes.filter(node => node.metadata?.nodeKind === 'repository' || (node.metadata?.full_name && !node.metadata?.nodeKind)).length <= 12), id);
    const technical = candidates.find(item => item.id === 'technical-shape');
    if (technical.available) assert.ok(technical.scene.nodes.filter(node => ['language','topic'].includes(node.metadata?.nodeKind)).length <= 5, id);
  }
});
