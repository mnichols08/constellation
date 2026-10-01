import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/constellation.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';
import { projectEvidence } from '../src/recruiter.mjs';
import { normalizeConfig } from '../src/config-schema.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';
import { repositories, options, referenceDate } from './fixtures/recruiter.mjs';

test('recruiter encodes recency independently of sustained work, stars, and curation', () => {
  const evidence = repo => projectEvidence(repo, options, 'alice', Date.parse(referenceDate));
  const long = evidence(repositories[0]), brief = evidence(repositories[2]), old = evidence(repositories[5]);
  assert.equal(long.months, 30); assert.equal(brief.months, 1);
  assert.equal(long.band, 0); assert.equal(brief.band, 0); assert.equal(old.band, 3);
  assert.ok(long.radius > brief.radius);
  assert.equal(evidence({ ...repositories[2], stargazers_count: 999999 }).radius, brief.radius);
  assert.equal(brief.others, 0); assert.equal(long.others, 14);
  assert.equal(evidence(repositories[4]).contributed, true);
  assert.equal(projectEvidence(repositories[4], {}, 'alice', Date.parse(referenceDate)).contributed, false);
});
test('missing and partial evidence never implies solo, inactivity, or complete history', () => {
  const unknown = projectEvidence({ ...repositories[0], pushed_at: null }, {}, 'alice', Date.parse(referenceDate));
  assert.equal(unknown.months, 0); assert.equal(unknown.others, null); assert.equal(unknown.unknownRecency, true);
  const partial = projectEvidence(repositories[0], { ...options, commitFieldData: { [repositories[0].full_name]: { ...options.commitFieldData[repositories[0].full_name], partial: true } } }, 'alice', Date.parse(referenceDate));
  assert.equal(partial.months, 30); assert.equal(partial.complete, false); assert.deepEqual(partial.quarters, []);
  const future = projectEvidence({ ...repositories[0], pushed_at: '2099-01-01' }, {}, 'alice', Date.parse(referenceDate));
  assert.equal(future.unknownRecency, true);
});
test('recruiter scene caps projects, uses explicit relationships, and exports a standalone static key', () => {
  const scene = createScene('alice', repositories, options);
  assert.equal(scene.nodes.length, 12); assert.equal(scene.presentation.recruiterOmitted, 3);
  assert.equal(scene.edges.length, 1); assert.equal(scene.edges[0].from, 'alice/atlas');
  assert.equal(scene.nodes[0].id, 'alice/atlas');
  const svg = renderSceneSVG(scene);
  assert.match(svg, /HOW TO READ/); assert.match(svg, /CONTRIB/); assert.match(svg, /\+8/);
  assert.match(svg, /prefers-reduced-motion/); assert.match(svg, /30 active mo/);
  const solo = svg.split('data-repo="alice/tiny-experiment"')[1].split('</g>')[0];
  assert.doesNotMatch(solo, /class="moons"/);
  const staticSVG = renderSceneSVG(createScene('alice', repositories, { ...options, animate: false }));
  assert.doesNotMatch(staticSVG, /@keyframes|animation:|<animate/);
  assert.match(staticSVG, /class="moons"/); assert.match(staticSVG, /HOW TO READ/);
  assert.deepEqual(createScene('alice', [...repositories].reverse(), options).nodes, scene.nodes);
});
test('curation round trips through config/share links and rejects malformed relationships', () => {
  const config = normalizeConfig({ account: 'alice', readmePresentation: 'recruiter', projectRelationships: options.projectRelationships });
  assert.deepEqual(config.projectRelationships, options.projectRelationships);
  const share = decodeShare(encodeShare('https://example.test', 'alice', config));
  assert.deepEqual(share.options.projectRelationships, options.projectRelationships);
  assert.throws(() => normalizeConfig({ account: 'alice', projectRelationships: [['alice/a', 'alice/a']] }), /projectRelationships/);
});
test('metadata is escaped, private/hidden repositories excluded, and unknown history is visible', () => {
  const scene = createScene('alice', [{ ...repositories[0], name: '<script>&"' }, { ...repositories[1], private: true }], { ...options, commitFieldData: undefined, hiddenNodes: [repositories[2].full_name] });
  const svg = renderSceneSVG(scene);
  assert.doesNotMatch(svg, /<script>/); assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /history unavailable/); assert.equal(scene.nodes.length, 1);
});

test('twelve substantial recent projects leave space for all contributor orbits', () => {
  const repos = repositories.slice(0, 12).map(repo => ({ ...repo, pushed_at: '2026-09-28' }));
  const scene = createScene('alice', repos, { ...options, commitFieldData: Object.fromEntries(repos.map(repo => [repo.full_name, { ...options.commitFieldData['alice/atlas'], repository: repo.full_name }])) });
  for (const [i, a] of scene.nodes.entries()) for (const b of scene.nodes.slice(i + 1)) {
    const distance = Math.hypot(a.geometry.x - b.geometry.x, a.geometry.y - b.geometry.y);
    assert.ok(distance > a.geometry.radius + b.geometry.radius + 36.4, `${a.id} and ${b.id} moon orbits overlap`);
  }
});
