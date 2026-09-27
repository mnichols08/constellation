import test from 'node:test';
import assert from 'node:assert/strict';
import { studioPresets, presetOptions } from '../src/studio-presets.mjs';
import { parseConfig, serializeConfig } from '../src/config-schema.mjs';
import { createPreviewData } from '../src/preview-data.mjs';
import { graphNodes, renderConstellation } from '../src/constellation.mjs';
import { defaultVisualStyle } from '../src/visual-style.mjs';
import { encodeShare, decodeShare } from '../src/share-link.mjs';

test('presets preserve custom palettes and node colors only when requested', () => {
  const current = { visualTheme: 'custom', theme: 'auto', nodeColorMode: 'custom',
    nodeColors: { 'alice/example': '#abcdef' }, colorConnections: true,
    visualStyle: { ...defaultVisualStyle(), glow: 5, lineWidth: 3 } };
  current.visualStyle.light.accent = '#123456';
  current.visualStyle.dark.background = '#654321';
  const kept = presetOptions('flagship-projects', current, { keepColors: true });
  assert.deepEqual(kept.visualStyle.light, current.visualStyle.light);
  assert.deepEqual(kept.visualStyle.dark, current.visualStyle.dark);
  assert.deepEqual(kept.nodeColors, current.nodeColors);
  assert.equal(kept.colorConnections, true);
  assert.equal(kept.nodeColorMode, 'custom');
  assert.equal(kept.arrangement, 'solar-system');
  assert.equal(kept.visualStyle.lineWidth, defaultVisualStyle().lineWidth);
  const shared = decodeShare(encodeShare('https://example.com/', 'alice', kept));
  assert.deepEqual(shared.options.visualStyle, kept.visualStyle);
  assert.deepEqual(shared.options.nodeColors, current.nodeColors);
  kept.visualStyle.dark.background = '#000000';
  assert.equal(current.visualStyle.dark.background, '#654321');
  const replaced = presetOptions('classic-constellation', current);
  assert.deepEqual(replaced.visualStyle, defaultVisualStyle());
  assert.equal(replaced.nodeColors, undefined);
});

test('seeded palettes retain their seed and general presets leave organization-only views', () => {
  const options = presetOptions('language-orbits', { accountType: 'organization', organizationView: 'collaboration',
    nodeColorMode: 'seeded', seedMode: 'custom', seed: 'favorite-colors' }, { keepColors: true });
  assert.equal(options.seed, 'favorite-colors');
  assert.equal(options.seedMode, 'custom');
  assert.equal(options.organizationView, 'projects');
  assert.equal(options.nodeMode, 'languages');
  assert.equal(options.accountType, 'organization');
});

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
