import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/constellation.mjs';
import { createProjectConstellation } from '../src/project-constellation.mjs';
import { semanticGraphFromProjectConstellation, semanticGraphFromScene, parseSemanticGraph, serializeSemanticGraph, semanticGraphFingerprint } from '../src/semantic-graph.mjs';
import { renderSemanticMarkdown, SEMANTIC_MARKDOWN_VERSION, SEMANTIC_MARKDOWN_LIMITS } from '../src/semantic-markdown.mjs';
import { repositories } from './fixtures/recruiter.mjs';

test('developer projection preserves ownership, group provenance and factual relationships', () => {
  const owned = repositories.filter(repo => repo.full_name === 'alice/atlas' || repo.full_name === 'alice/atlas-mobile');
  const external = repositories.find(repo => repo.full_name === 'community/query-engine');
  const graph = semanticGraphFromScene(createScene('alice', [...owned, external, { full_name: 'outside/one', name: 'one' }, { full_name: 'outside/two', name: 'two' }], {
    projectFamilies: { Studio: { label: 'Studio', members: ['alice/atlas', 'alice/atlas-mobile'] } },
    projectRelationships: [['alice/atlas', 'alice/atlas-mobile']],
    maxRepos: 45,
  }));
  const before = structuredClone(graph);
  const markdown = renderSemanticMarkdown(graph);
  assert.match(markdown, /^# alice/m);
  assert.match(markdown, /`community\/query-engine`/);
  assert.doesNotMatch(markdown, /Projects owned by alice/);
  assert.match(markdown, /Defined by you\./);
  assert.match(markdown, /Primary language:/);
  assert.match(markdown, /Topics:/);
  assert.match(markdown, /`alice\/atlas` ↔ `alice\/atlas-mobile`/);
  assert.doesNotMatch(markdown, /geometry|viewport|camera|glow|animation/i);
  assert.deepEqual(graph, before);
  const derived = renderSemanticMarkdown(semanticGraphFromScene(createScene('alice', [...owned, { ...owned[0], full_name: 'outside/one', name: 'one' }, { ...owned[0], full_name: 'outside/two', name: 'two' }])));
  assert.match(derived, /Grouped by shared repository owner\./);
  const selectedGraph = semanticGraphFromScene(createScene('alice', owned, { includeRepos: ['alice/atlas'] }));
  const detailed = renderSemanticMarkdown(selectedGraph, { detail: 'detailed' });
  assert.match(detailed, /Evidence and provenance/);
  assert.match(detailed, /selected by user/);
});

test('project projection reports repository identity, structural evidence, private visibility and truncation', () => {
  const model = createProjectConstellation({
    projectId: 'owner/repo', ref: 'main', commit: 'abcdef1234567', visibility: 'private',
    tree: [
      { path: 'package.json', type: 'blob' }, { path: 'packages', type: 'tree' },
      { path: 'packages/core', type: 'tree' }, { path: 'packages/core/package.json', type: 'blob' },
      { path: 'packages/core/src', type: 'tree' }, { path: 'packages/core/src/index.mjs', type: 'blob' },
      { path: 'packages/core/src/other.mjs', type: 'blob' },
    ],
    contents: {
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/core/package.json': '{"name":"@example/core","main":"src/index.mjs"}',
      'packages/core/src/index.mjs': "import './other.mjs';",
      'packages/core/src/other.mjs': 'export const x = 1;',
    },
  });
  const graph = semanticGraphFromProjectConstellation(model);
  const markdown = renderSemanticMarkdown(graph);
  assert.match(markdown, /# owner\/repo/);
  assert.match(markdown, /Ref: `main`/);
  assert.match(markdown, /Commit: `abcdef1234567`/);
  assert.match(markdown, /Visibility: private/);
  assert.match(markdown, /derived from a private repository/);
  assert.match(markdown, /workspace member by `package\.json`/);
  assert.match(markdown, /declared as an entry point/);
  assert.match(markdown, /imports `\.\/other\.mjs`/);
  const bounded = createProjectConstellation({ projectId: 'owner/bounded', tree: Array.from({ length: 130 }, (_, i) => ({ path: `src/file-${i}.js`, type: 'blob' })) }, { nodes: 32 });
  const incomplete = renderSemanticMarkdown(semanticGraphFromProjectConstellation(bounded));
  assert.match(incomplete, /truncated; this is an incomplete bounded view/);
  assert.match(incomplete, /of \d+ files entered inspection/);
  assert.match(incomplete, /of \d+ supported source files read/);
});

test('projection is deterministic over order and graph round trips; details are distinct', () => {
  const graph = semanticGraphFromScene(createScene('alice', repositories.slice(0, 12), { projectFamilies: { studio: { label: 'Studio', members: repositories.slice(0, 4).map(repo => repo.full_name) } } }));
  const baseline = renderSemanticMarkdown(graph);
  const reversed = structuredClone(graph);
  reversed.nodes.reverse(); reversed.edges.reverse(); reversed.groups.reverse();
  assert.equal(renderSemanticMarkdown(reversed), baseline);
  assert.equal(renderSemanticMarkdown(parseSemanticGraph(serializeSemanticGraph(graph))), baseline);
  assert.equal(semanticGraphFingerprint(graph), semanticGraphFingerprint(parseSemanticGraph(serializeSemanticGraph(graph))));
  const summary = renderSemanticMarkdown(graph, { detail: 'summary' });
  const detailed = renderSemanticMarkdown(graph, { detail: 'detailed' });
  assert.notEqual(summary, baseline);
  assert.notEqual(detailed, baseline);
  assert.equal(summary, renderSemanticMarkdown(graph, { detail: 'summary' }));
  assert.equal(SEMANTIC_MARKDOWN_VERSION, 1);
});

test('projection safely escapes hostile labels and rejects invalid graphs and unknown options', () => {
  const graph = semanticGraphFromScene(createScene('alice', [{ full_name: 'alice/name`with`ticks', name: '# heading * bullet [link](javascript:alert(1)) <script>alert(1)</script>', language: 'Rust' }]));
  const markdown = renderSemanticMarkdown(graph);
  assert.match(markdown, /``alice\/name`with`ticks``/);
  assert.ok(markdown.includes('\\# heading \\* bullet'));
  assert.doesNotMatch(markdown, /<script>/);
  assert.doesNotMatch(markdown, /\]\(javascript:/);
  assert.throws(() => renderSemanticMarkdown({}), /Invalid semantic graph/);
  const secret = structuredClone(graph);
  secret.nodes.find(node => node.kind === 'project').properties.description = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  assert.throws(() => renderSemanticMarkdown(secret), /Invalid semantic graph/);
  assert.throws(() => renderSemanticMarkdown(graph, { detail: 'all' }), /detail must be/);
  assert.throws(() => renderSemanticMarkdown(graph, { html: true }), /only detail/);
});

test('presentation truncation is disclosed and stays within byte bounds', () => {
  const seed = repositories[0];
  const graph = semanticGraphFromScene(createScene('alice', Array.from({ length: 100 }, (_, index) => ({ ...seed, full_name: `alice/project-${String(index).padStart(3, '0')}`, name: `project-${index}`, description: 'bounded description' })), { maxRepos: 100 }));
  const before = structuredClone(graph);
  const markdown = renderSemanticMarkdown(graph);
  assert.match(markdown, /Showing 64 of 100 projects/);
  assert.ok(Buffer.byteLength(markdown) <= SEMANTIC_MARKDOWN_LIMITS.bytes);
  assert.deepEqual(graph, before);
});
