import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { projectUrl } from '../src/export.mjs';

export function publicationSummary({ repository, branch = 'output', file }) {
  if (!/^[a-z\d][a-z\d-]*\/[a-z\d_.-]+$/i.test(repository || '')) throw new Error('Invalid GitHub repository for publication summary.');
  const path = repository.split('/').map(encodeURIComponent).join('/');
  const image = `https://raw.githubusercontent.com/${path}/${encodeURIComponent(branch)}/${encodeURIComponent(basename(file))}`;
  const snippet = `[![My GitHub constellation](${image})](${projectUrl})\n\nMade with [GitHub Constellation](${projectUrl}) by [@mnichols08](https://github.com/mnichols08).`;
  return `## Your GitHub constellation\n\n${snippet}\n\n[Open the generated image](${image})\n\nPaste this into your profile README:\n\n\`\`\`md\n${snippet}\n\`\`\`\n\nThe image updates whenever this workflow runs.\n`;
}

export async function publishOutput({ cwd = process.cwd(), file, branch = 'output' }) {
  const git = (args, directory = cwd, input) => execFileSync('git', args, { cwd: directory, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['check-ref-format', '--branch', branch]);
  const source = resolve(cwd, file);
  const filename = basename(source);
  if (!/^[a-z\d][a-z\d._-]*\.svg$/i.test(filename)) throw new Error('Published output must have a simple .svg filename.');
  await readFile(source); // Fail before touching Git if generation did not succeed.
  if (git(['branch', '--show-current']) === branch) throw new Error('Check out the source branch before publishing to the output branch.');
  const identity = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
  for (let attempt = 0; attempt < 3; attempt++) {
    const directory = await mkdtemp(join(tmpdir(), 'constellation-output-'));
    const worktree = join(directory, 'branch');
    let attached = false;
    try {
      const existing = git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
      let base;
      if (existing) {
        git(['fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
        base = git(['rev-parse', 'FETCH_HEAD']);
      } else {
        const tree = git(['mktree'], cwd, '');
        base = git([...identity, 'commit-tree', tree, '-m', 'Initialize constellation output']);
      }
      git(['worktree', 'add', '--detach', worktree, base]);
      attached = true;
      // Replace only this image; unrelated Metrics and other output files survive.
      // Remove a prior file/symlink first so copying cannot follow a symlink.
      await rm(join(worktree, filename), { force: true });
      await copyFile(source, join(worktree, filename));
      git(['add', '--', filename], worktree);
      if (!git(['diff', '--cached', '--name-only'], worktree)) return;
      git([...identity, 'commit', '-m', 'Update GitHub constellation'], worktree);
      try {
        git(['push', 'origin', `HEAD:refs/heads/${branch}`], worktree);
        return;
      } catch (error) {
        // A different workflow may have updated output. Rebase our single file
        // onto its latest state by rebuilding the worktree; never force-push.
        if (attempt === 2) throw error;
      }
    } finally {
      if (attached) git(['worktree', 'remove', '--force', worktree]);
      await rm(directory, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await publishOutput({ file: process.env.CONSTELLATION_OUTPUT, branch: process.env.CONSTELLATION_OUTPUT_BRANCH || 'output' });
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, publicationSummary({
      repository: process.env.GITHUB_REPOSITORY,
      branch: process.env.CONSTELLATION_OUTPUT_BRANCH || 'output',
      file: process.env.CONSTELLATION_OUTPUT,
    }));
    console.log('Published constellation to the output branch.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
