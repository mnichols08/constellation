import test from 'node:test';
import assert from 'node:assert/strict';
import { studioPresets, presetOptions } from '../src/studio-presets.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { createPreviewData } from '../src/preview-data.mjs';
import { graphNodes, renderConstellation } from '../src/constellation.mjs';

test('built-in presets round-trip, render, and replace restrictive random settings', () => {
  const repositories = [{ name: 'example', full_name: 'collective/example', private: false, language: 'Rust', languages: { Rust: 100 }, created_at: '2020-01-01T00:00:00Z', stargazers_count: 20 }];
  for (const preset of studioPresets) {
    const options = presetOptions(preset.id, { designCode: 'old', minStars: 999999, languages: [], history: { mode: 'historical', year: 1970 }, hiddenNodes: ['collective/example'] });
    const config = parseConfig(serializeConfig('collective', options));
    assert.ok(graphNodes(repositories, config.options).nodes.length, preset.id);
    assert.match(renderConstellation('collective', repositories, config.options), /<svg/);
    assert.equal(config.options.designCode, undefined);
    assert.equal(config.options.history, undefined);
    assert.equal(config.options.hiddenNodes, undefined);
  }
});

test('organization atlas loads without contributor or user contribution requests', async () => {
  const calls = [];
  const data = createPreviewData({ fetchImpl: async url => {
    calls.push(url);
    const path = new URL(url).pathname;
    if (path === '/orgs/collective') return Response.json({ login: 'collective', type: 'Organization', public_repos: 1 });
    if (path === '/orgs/collective/repos') return Response.json([{ name: 'example', full_name: 'collective/example', private: false, language: 'Rust', languages: { Rust: 100 } }]);
    if (path.endsWith('/events')) return Response.json([]);
    throw new Error('Unexpected request: ' + path);
  } });
  const repositories = await data.load('collective', presetOptions('organization-projects'));
  assert.equal(repositories.length, 1);
  assert.equal(data.organization('collective').scanned, 0);
  assert.equal(calls.some(url => /contributors|search\/issues/.test(url)), false);
});
