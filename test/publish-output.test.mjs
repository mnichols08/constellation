import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishOutput, publicationSummary } from '../scripts/publish-output.mjs';

test('publication summary links to the actual branch and published basename', () => {
  const summary = publicationSummary({ repository: 'octocat/octocat', branch: 'images/daily', file: 'dist/custom.svg' });
  assert.match(summary, /https:\/\/raw\.githubusercontent\.com\/octocat\/octocat\/images%2Fdaily\/custom\.svg/);
  assert.ok(!summary.includes('dist/'));
  assert.ok(summary.includes('```md\n![My GitHub constellation]'));
  assert.throws(() => publicationSummary({ repository: 'owner/repo\ninjected', file: 'x.svg' }));
});

test('publishes to an isolated output branch and preserves other generated files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'constellation-publish-test-'));
  const remote = join(directory, 'remote.git');
  const cwd = join(directory, 'source');
  const git = (args, path = cwd) => execFileSync('git', args, { cwd: path, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '--bare', remote], directory);
    git(['init', '-b', 'main', cwd], directory);
    git(['config', 'user.name', 'Test']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'commit.gpgsign', 'false']);
    await writeFile(join(cwd, 'README.md'), 'Source branch');
    git(['add', 'README.md']);
    git(['commit', '-m', 'Initial source']);
    git(['remote', 'add', 'origin', remote]);
    git(['push', 'origin', 'main']);
    const sourceHead = git(['rev-parse', 'HEAD']);
    await writeFile(join(cwd, 'constellation.svg'), '<svg>first</svg>');
    await publishOutput({ cwd, file: 'constellation.svg' });
    git(['fetch', 'origin', 'output']);
    assert.equal(git(['ls-tree', '--name-only', 'FETCH_HEAD']), 'constellation.svg');
    assert.equal(git(['show', 'FETCH_HEAD:constellation.svg']), '<svg>first</svg>');
    assert.equal(git(['rev-parse', 'HEAD']), sourceHead);
    await rm(join(cwd, 'constellation.svg'));
    git(['switch', '-c', 'metrics', 'FETCH_HEAD']);
    await writeFile(join(cwd, 'metrics.svg'), '<svg>metrics</svg>');
    git(['add', 'metrics.svg']);
    git(['commit', '-m', 'Existing Metrics output']);
    git(['push', 'origin', 'HEAD:output']);
    git(['switch', 'main']);
    await writeFile(join(cwd, 'constellation.svg'), '<svg>updated</svg>');
    await publishOutput({ cwd, file: 'constellation.svg' });
    git(['fetch', 'origin', 'output']);
    assert.equal(git(['show', 'FETCH_HEAD:metrics.svg']), '<svg>metrics</svg>');
    assert.equal(git(['show', 'FETCH_HEAD:constellation.svg']), '<svg>updated</svg>');
    const outputHead = git(['rev-parse', 'FETCH_HEAD']);
    await publishOutput({ cwd, file: 'constellation.svg' });
    git(['fetch', 'origin', 'output']);
    assert.equal(git(['rev-parse', 'FETCH_HEAD']), outputHead, 'unchanged image adds no commit');
    assert.equal(git(['branch', '--show-current']), 'main');
    assert.equal(git(['rev-parse', 'HEAD']), sourceHead);
    await assert.rejects(publishOutput({ cwd, file: 'constellation.svg', branch: 'main' }), /source branch/);
    await assert.rejects(publishOutput({ cwd, file: 'constellation.svg', branch: '../invalid' }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
