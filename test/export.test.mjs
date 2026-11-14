import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderWorkflow, renderTechStackWorkflow, readmeSnippet, projectUrl, installationLinks, ACTION_REF, isWorkflow, workflowSettings } from '../src/export.mjs';
import { parseConfig } from '../src/config-schema.mjs';
import { renderConstellation } from '../src/constellation.mjs';
import { loadConfig } from '../src/config.mjs';

test('workflow round-trips every setting and arbitrary CSS into the generator', async () => {
  const options = {
    theme: 'light', layout: 'compact', animate: false, maxRepos: 15,
    includeForks: false, bridges: false, title: 'My “sky”', includeRepos: ['hello'],
    colors: { star: '#abcdef' },
    labelPositions: { 'octocat/hello': { x: 125.5, y: 90 } },
    starPositions: { 'octocat/hello': { x: 200, y: 150.5 } },
    css: '.star { fill: #f00; }\n/* ${{ secrets.TEST }}\n$(echo nope)\n`literal`\n</style><script>no</script> */\n.heading::after { content: "☄ \\ "; }',
  };
  const yaml = renderWorkflow('octocat', options);
  const block = yaml.split('          config-json: |\n')[1];
  const restored = await loadConfig(undefined, block.split('\n').map(line => line.slice(12)).join('\n'));
  assert.deepEqual(restored, options);
  assert.ok(!block.includes('${{'));
  assert.match(yaml, /uses: mnichols08\/constellation@v5/);
  assert.match(yaml, /cron: '17 6 \* \* \*'/);
  assert.match(yaml, /publish: 'true'/);
  assert.ok(!yaml.includes('git push'));
  const repos = [{ name: 'hello', full_name: 'octocat/hello', language: 'JavaScript' }];
  assert.equal(renderConstellation('octocat', repos, options), renderConstellation('octocat', repos, restored));
  assert.ok(!renderConstellation('octocat', repos, restored).includes('<script>'));
});

test('workflow always uses repository owner regardless of preview account and embeds preserve attribution', () => {
  const workflow = renderWorkflow(null, {});
  assert.ok(!workflow.includes('username:'));
  for (const account of ['octocat', 'mnichols08', 'x\nrun: malicious']) {
    assert.equal(renderWorkflow(account, {}), workflow);
  }
  const snippet = readmeSnippet('octocat');
  assert.ok(snippet.includes(`](${projectUrl})`));
  assert.ok(snippet.includes(`/output/constellation.svg)](${projectUrl})`));
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

test('installation links preserve workflow content and reject invalid targets', () => {
  const workflow = renderWorkflow('octocat', { css: '.star { fill: #abc; } /* & + ☄ */' });
  const links = installationLinks('octocat/octocat', workflow);
  const install = new URL(links.install);
  assert.equal(install.pathname, '/octocat/octocat/new/HEAD');
  assert.equal(install.searchParams.get('filename'), '.github/workflows/constellation.yml');
  assert.equal(install.searchParams.get('value'), workflow);
  assert.equal(new URL(links.create).searchParams.get('name'), 'octocat');
  assert.equal(links.actions, 'https://github.com/octocat/octocat/actions/workflows/constellation.yml');
  for (const target of ['', 'owner/repo/extra', 'https://evil.example', 'owner/..', 'owner/repo?x=1']) assert.throws(() => installationLinks(target, workflow));
  assert.equal(installationLinks('octocat/octocat', 'x'.repeat(8000)).install, null);
});

test('publishing workflow is bounded, checked out, least permission, and filename safe', async () => {
  const workflow = renderWorkflow('octocat', {}, { filename: 'alice-sky.svg', branch: 'images/daily' });
  assert.match(workflow, /uses: actions\/checkout@v6/);
  assert.match(workflow, /permissions:\n  contents: write/);
  assert.match(workflow, /output: 'alice-sky\.svg'/);
  assert.match(workflow, /output-branch: 'images\/daily'/);
  const action = await readFile(new URL('../action.yml', import.meta.url), 'utf8');
  assert.match(action, /if: \$\{\{ failure\(\).*steps\.publish\.outcome != 'failure'/);
  assert.match(action, /last known-good output branch artifact was preserved/);
  assert.match(readmeSnippet('octocat', 'octocat/octocat', 'alice-sky.svg'), /output\/alice-sky\.svg/);
  assert.throws(() => renderWorkflow('octocat', {}, { filename: '../steal.svg' }));
  assert.throws(() => renderWorkflow('octocat', {}, { filename: 'constellation.svg', branch: 'output;echo bad' }));
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

test('tech stack workflow publishes a daily README image through the current action tag', () => {
  const yaml = renderTechStackWorkflow('https://github.com/Octo-Sky');
  assert.equal(ACTION_REF, 'v5');
  assert.match(yaml, /uses: mnichols08\/constellation@v5\n        with:\n          username: 'Octo-Sky'\n          tech-stack: 'true'\n          publish: 'true'\n          output: 'tech-stack\.svg'\n          output-branch: 'output'\n$/);
  assert.match(yaml, /name: Daily tech stack map/);
  assert.match(yaml, /permissions:\n  contents: write/);
  // No design settings, tokens or secrets are written into the file.
  assert.ok(!/config-json|secrets\.|token/i.test(yaml));
  // It shares the constellation workflow's concurrency group, so two publishes never race on the output branch.
  assert.match(yaml, /group: constellation-output-\$\{\{ github\.repository \}\}/);
  assert.match(renderWorkflow('octocat', {}), /group: constellation-output-\$\{\{ github\.repository \}\}/);
  assert.throws(() => renderTechStackWorkflow('octocat', { filename: '../x.svg' }), /safe \.svg filename/);
  assert.throws(() => renderTechStackWorkflow('octocat', { branch: 'a..b' }), /safe output branch/);
  assert.throws(() => renderTechStackWorkflow("o'; rm -rf"), /username/i);

  const links = installationLinks('octo-sky/octo-sky', yaml, 'tech-stack.yml');
  assert.equal(new URL(links.install).searchParams.get('filename'), '.github/workflows/tech-stack.yml');
  assert.equal(new URL(links.install).searchParams.get('value'), yaml);
  assert.equal(links.actions, 'https://github.com/octo-sky/octo-sky/actions/workflows/tech-stack.yml');
  assert.equal(new URL(installationLinks('octo-sky/octo-sky', yaml).install).searchParams.get('filename'), '.github/workflows/constellation.yml');
  assert.throws(() => installationLinks('octo-sky/octo-sky', yaml, '../evil.yml'), /simple \.yml/);
  const snippet = readmeSnippet('octo-sky', 'octo-sky/octo-sky', 'tech-stack.svg', 'tech stack');
  assert.match(snippet, /^\[!\[octo-sky tech stack\]\(https:\/\/raw\.githubusercontent\.com\/octo-sky\/octo-sky\/output\/tech-stack\.svg\)\]/);
  assert.match(readmeSnippet('octo-sky'), /^\[!\[octo-sky GitHub constellation\]/);
});

test('a design published by an older version opens from its workflow file and draws the same image', () => {
  // The shape of a profile banner made with version 3: short canvas, wide orbits, no tilt.
  const design = {
    layout: 'compact', exportProfile: 'custom', arrangement: 'rings', nodeMode: 'topics', maxRepos: 25, animate: false, snapToRings: true, identityRing: true,
    perspective: { enabled: false, animate: true, horizontal: 0, vertical: 25, zoom: 90, range: 25, duration: 46 },
    visualStyle: { light: { background: '#fafaf3', foreground: '#202516', accent: '#595600', line: '#838d66', star: '#8b8500' }, dark: { background: '#111111', foreground: '#f3f3f4', accent: '#e3de13', line: '#555a38', star: '#e3de13' }, lineWidth: 1, lineOpacity: 0.65, secondaryOpacity: 0.26, bridgeOpacity: 0.3, glow: 3.5, dustOpacity: 0.95, labelSize: 11, labels: true },
    css: 'svg { --sky-accent: #595600; }\n/* $literal */', referenceDate: '2026-09-01T00:00:00Z',
  };
  const current = renderWorkflow('octocat', design);
  // Older files differ only in the action tag, checkout version and concurrency group.
  const old = current.replace('@v5', '@v3').replace('actions/checkout@v6', 'actions/checkout@v4').replace(/group: [^\n]+/, 'group: constellation-output');
  for (const text of [current, old, old.replace(/\n/g, '\r\n')]) {
    assert.equal(isWorkflow(text), true);
    const { options } = parseConfig(workflowSettings(text), 'octocat');
    assert.deepEqual(options, parseConfig({ ...design, version: 7 }, 'octocat').options);
    // Saving it again writes the same design, so re-publishing changes nothing.
    assert.equal(workflowSettings(renderWorkflow('octocat', options)), workflowSettings(current));
  }
  const repos = Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, full_name: `octocat/p${i}`, language: ['Rust', 'CSS'][i % 2], topics: [['web', 'cli', 'docs'][i % 3], 'tools'], stargazers_count: i }));
  const opened = parseConfig(workflowSettings(old), 'octocat').options;
  const svg = renderConstellation('octocat', repos, opened);
  assert.equal(svg, renderConstellation('octocat', repos, design));
  // The banner keeps its exact canvas: no re-framing, no tilt.
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="900" height="280" viewBox="0 0 900 280"/);

  assert.equal(isWorkflow('{"version":7}'), false);
  assert.throws(() => workflowSettings('{"version":7}'), /doesn’t run the Constellation action/);
  assert.throws(() => workflowSettings("      - uses: mnichols08/constellation@v5\n        with:\n          config: constellation.json\n"), /separate settings file/);
  assert.throws(() => workflowSettings(renderTechStackWorkflow('octocat')), /tech stack map/);
  assert.throws(() => workflowSettings("      - uses: mnichols08/constellation@v5\n"), /no saved design/);
  assert.throws(() => workflowSettings("      - uses: mnichols08/constellation@v5\n        with:\n          config-json: |\n            { nope\n"), /isn’t valid JSON/);
  assert.throws(() => workflowSettings("      - uses: mnichols08/constellation@v5\n        with:\n          config-json: |\n            [1]\n"), /settings object/);
  assert.throws(() => workflowSettings(`${current}${' '.repeat(400000)}`), /too big/);
  // Text after the block is never read as settings, and unsafe keys are still refused downstream.
  assert.deepEqual(JSON.parse(workflowSettings(`${current}      - run: echo '{"evil": true}'\n`)), JSON.parse(workflowSettings(current)));
  assert.throws(() => parseConfig(workflowSettings("      - uses: mnichols08/constellation@v5\n        with:\n          config-json: |\n            {\"constructor\": {\"x\": 1}}\n"), 'octocat'), /Unsafe configuration key/);
});

