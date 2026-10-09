import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/constellation.mjs';
import { createProjectConstellation } from '../src/project-constellation.mjs';
import { semanticGraphFromScene, semanticGraphFromProjectConstellation, serializeSemanticGraph, semanticGraphFingerprint } from '../src/semantic-graph.mjs';
import { renderSemanticMarkdown } from '../src/semantic-markdown.mjs';
import { createPortableExport, EXPORT_MANIFEST_VERSION } from '../src/portable-export.mjs';

test('portable export creates deterministic artifacts from one canonical graph', () => {
  const graph = semanticGraphFromScene(createScene('alice', [
    { full_name: 'alice/compiler', name: 'compiler', language: 'Rust' },
    { full_name: 'alice/studio', name: 'studio', language: 'JavaScript' },
  ]));
  const before = structuredClone(graph);
  const first = createPortableExport(graph);
  const second = createPortableExport(graph);
  assert.equal(JSON.stringify(graph), JSON.stringify(before));
  assert.equal(JSON.stringify(first.files), JSON.stringify(second.files));
  assert.equal(first.manifest.version, EXPORT_MANIFEST_VERSION);
  assert.equal(first.manifest.fingerprint, semanticGraphFingerprint(graph));
  assert.equal(first.files['alice.semantic-graph.json'], serializeSemanticGraph(graph));
  assert.equal(first.files['constellation.md'], renderSemanticMarkdown(graph, { detail: 'standard' }));
  assert.match(first.files['constellation.svg'], /^<svg/);
  assert.match(first.files['constellation.html'], /Semantic Graph v1/);
  const manifest = JSON.parse(first.files['manifest.json']);
  assert.deepEqual(manifest.artifacts, first.manifest.artifacts);
  assert.equal(manifest.semanticGraphVersion, 1);
  assert.equal(manifest.semanticMarkdownVersion, 1);
});

test('portable project HTML and manifest retain private visibility and incomplete coverage', () => {
  const model = createProjectConstellation({
    projectId: 'owner/private-repo', ref: 'main', visibility: 'private',
    tree: [{ path: '', type: 'tree' }, { path: 'package.json', type: 'blob' }],
    contents: { 'package.json': '{"name":"private-repo"}' },
  });
  const graph = semanticGraphFromProjectConstellation(model);
  graph.statistics.truncated = true;
  graph.statistics.limitations = ['bounded-source'];
  const portable = createPortableExport(graph);
  assert.equal(portable.manifest.sourceVisibility, 'private');
  assert.equal(portable.manifest.truncated, true);
  assert.match(portable.files['constellation.html'], /Source visibility is private/);
  assert.match(portable.files['constellation.html'], /coverage is incomplete/i);
});
