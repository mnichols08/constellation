import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWorkflow, readmeSnippet, projectUrl } from '../src/export.mjs';
import { renderConstellation } from '../src/constellation.mjs';
import { loadConfig } from '../src/config.mjs';

test('workflow round-trips every setting and arbitrary CSS into the generator', async () => {
  const options = {
    theme: 'light', layout: 'compact', animate: false, maxRepos: 15,
    includeForks: false, bridges: false, title: 'My “sky”', includeRepos: ['hello'],
    colors: { star: '#abcdef' },
    css: '.star { fill: #f00; }\n/* ${{ secrets.TEST }}\n$(echo nope)\n`literal`\n</style><script>no</script> */\n.heading::after { content: "☄ \\ "; }',
  };
  const yaml = renderWorkflow('octocat', options);
  const block = yaml.split('          config-json: |\n')[1];
  const restored = await loadConfig(undefined, block.split('\n').map(line => line.slice(12)).join('\n'));
  assert.deepEqual(restored, options);
  assert.ok(!block.includes('${{'));
  assert.match(yaml, /username: 'octocat'/);
  assert.match(yaml, /token: \$\{\{ secrets.GITHUB_TOKEN \}\}/);
  assert.match(yaml, /cron: '17 6 \* \* \*'/);
  assert.match(yaml, /output: constellation\.svg/);
  assert.match(yaml, /publish: 'true'/);
  assert.match(yaml, /output-branch: output/);
  assert.ok(!yaml.includes('git push'));
  const repos = [{ name: 'hello', full_name: 'octocat/hello', language: 'JavaScript' }];
  assert.equal(renderConstellation('octocat', repos, options), renderConstellation('octocat', repos, restored));
  assert.ok(!renderConstellation('octocat', repos, restored).includes('<script>'));
});

test('sample workflow uses repository owner and embeds preserve attribution', () => {
  assert.match(renderWorkflow(null, {}), /username: '\$\{\{ github.repository_owner \}\}'/);
  assert.throws(() => renderWorkflow('x\nrun: malicious', {}));
  const snippet = readmeSnippet('octocat');
  assert.ok(snippet.includes(`](${projectUrl})`));
  assert.match(snippet, /by \[@mnichols08\]/);
  assert.ok(snippet.includes('https://raw.githubusercontent.com/octocat/octocat/output/constellation.svg'));
  assert.ok(readmeSnippet('octocat', 'another-owner/gallery').includes('https://raw.githubusercontent.com/another-owner/gallery/output/constellation.svg'));
  assert.ok(readmeSnippet(null).includes('YOUR_USERNAME/YOUR_REPOSITORY/output/constellation.svg'));
  assert.throws(() => readmeSnippet('octocat', 'bad/repo/extra'));
  for (const layout of ['compact', 'atlas']) {
    const svg = renderConstellation('octocat', [], { layout });
    assert.ok(svg.includes(`href="${projectUrl}"`));
    assert.match(svg, /class="credit"/);
    assert.match(svg, />mnichols08\/constellation<\/text>/);
  }
});

test('inline config rejects ambiguous or invalid inputs while file CSS still resolves', async () => {
  await assert.rejects(loadConfig('config.json', '{}'), /either config or config-json/);
  for (const value of ['null', '[]', '"string"', '{bad']) await assert.rejects(loadConfig(undefined, value));
  await assert.rejects(loadConfig(undefined, '{"cssFile":"style.css"}'), /must embed CSS/);
  const dir = await mkdtemp(join(tmpdir(), 'constellation-config-'));
  try {
    await writeFile(join(dir, 'style.css'), '.star{fill:#abc}');
    await writeFile(join(dir, 'config.json'), '{"cssFile":"style.css","layout":"compact"}');
    assert.deepEqual(await loadConfig(join(dir, 'config.json')), { cssFile: 'style.css', layout: 'compact', css: '.star{fill:#abc}' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
