// Tech stack: locked until sign-in, then scans with the viewer's own token.
import { test, expect, axeViolations } from './support/ux.mjs';

const TOKEN = 'test-token';
const manifest = JSON.stringify({ dependencies: { react: '1', express: '1', mongoose: '1' }, devDependencies: { vite: '1' } });
const repository = (index) => ({
  name: `app-${index}`, nameWithOwner: `sky-org/app-${index}`, url: `https://github.com/sky-org/app-${index}`, description: null,
  isPrivate: false, isFork: false, isArchived: false, isEmpty: false,
  createdAt: '2024-01-01T00:00:00Z', pushedAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z',
  stargazerCount: 0, forkCount: 0, primaryLanguage: { name: 'JavaScript' },
  languages: { edges: [{ size: 900, node: { name: 'JavaScript' } }, { size: 100, node: { name: 'CSS' } }] },
  repositoryTopics: { nodes: [] }, tree: { entries: [{ name: 'package.json', type: 'blob' }] },
});

/** A viewer who signs in with the one good token, and GitHub answering scans for it. */
async function stubScan(page, { hold = null, status = 200, blockFirst = false } = {}) {
  const calls = { graphql: 0, blocked: 0, tokens: new Set() };
  await page.route('https://api.github.com/user', (route) => route.fulfill({
    status: route.request().headers().authorization === `Bearer ${TOKEN}` ? 200 : 401,
    contentType: 'application/json',
    body: JSON.stringify({ login: 'octo-sky', id: 1 }),
  }));
  await page.route('https://api.github.com/graphql', async (route) => {
    calls.graphql += 1;
    calls.tokens.add(route.request().headers().authorization);
    if (hold) await hold;
    if (status !== 200) return route.fulfill({ status, contentType: 'application/json', body: '{"message":"limit"}' }).catch(() => {});
    const { query } = JSON.parse(route.request().postData());
    // GitHub's timeout has no CORS header, which a browser reports as a failed fetch.
    if (blockFirst && query.includes('repositoryOwner') && calls.blocked === 0) { calls.blocked += 1; return route.abort('failed'); }
    if (query.includes('tree:object')) {
      const roots = Object.fromEntries([...query.matchAll(/r(\d+):repository/g)].map((match) => [`r${match[1]}`, { tree: repository(0).tree }]));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: roots }) }).catch(() => {});
    }
    const data = query.includes('repositoryOwner')
      ? { repositoryOwner: { repositories: { totalCount: 3, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [repository(0), repository(1), repository(2)] } } }
      : Object.fromEntries([...query.matchAll(/r(\d+):repository/g)].map((match) => [`r${match[1]}`, { f0: { text: manifest, byteSize: manifest.length, isBinary: false } }]));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) }).catch(() => {});
  });
  return calls;
}

async function openStudio(page) {
  await page.goto('/?user=sky-org');
  await page.getByRole('tab', { name: 'Layout' }).click();
}
const mapButton = (page) => page.getByRole('button', { name: 'Map a tech stack' });

async function signInThroughGate(page) {
  await mapButton(page).click();
  await page.getByRole('dialog', { name: 'Tech stack' }).getByRole('button', { name: 'Sign in with GitHub' }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in with GitHub' });
  await signIn.getByLabel('Personal access token').fill(TOKEN);
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click();
  return page.getByRole('dialog', { name: 'Tech stack' });
}

test('signed out, it asks for sign-in and sends nothing to GitHub GraphQL', async ({ page, github }) => {
  void github;
  const calls = await stubScan(page);
  await openStudio(page);
  await mapButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Tech stack' });
  await expect(dialog.getByText('your own GitHub sign-in and your own request limit')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Map tech stack' })).toHaveCount(0);
  expect(calls.graphql).toBe(0);
});

test('it is easy to find: first in the Layout tab, and in the top bar where there is room', async ({ page, github }, testInfo) => {
  void github;
  await page.goto('/?user=sky-org');
  const topBar = page.getByRole('banner').getByRole('button', { name: 'Tech stack' });
  const phone = testInfo.project.name.startsWith('mobile');
  for (const tab of ['Look', 'Layout', 'Projects', 'Details']) {
    await page.getByRole('tab', { name: tab }).click();
    if (phone) await expect(topBar).toBeHidden();
    else await expect(topBar).toBeInViewport({ ratio: 1 });
  }
  await page.getByRole('tab', { name: 'Layout' }).click();
  const inPanel = page.getByRole('button', { name: 'Map a tech stack' });
  await expect(inPanel).toBeInViewport({ ratio: 1 });
  expect(await page.locator('#panel-layout').evaluate((panel) => panel.firstElementChild.textContent)).toContain('Map a tech stack');
  await (phone ? inPanel : topBar).click();
  await expect(page.getByRole('dialog', { name: 'Tech stack' }).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
});

test('the rest of the Studio still works without signing in', async ({ page, github }) => {
  void github;
  await openStudio(page);
  await expect(page.locator('#studio-main .star').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /The sky of @sky-org/ })).toBeVisible();
});

test('after sign-in it returns to the sheet, scans with the viewer’s token and shows the map and tables', async ({ page, github }) => {
  void github;
  const calls = await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await expect(dialog.getByLabel('GitHub account or organization')).toHaveValue('sky-org');
  await expect(dialog.getByRole('button', { name: 'Use my account (@octo-sky)' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.getByText('3 of 3 public repositories for @sky-org')).toBeVisible();
  expect([...calls.tokens]).toEqual([`Bearer ${TOKEN}`]);
  await expect(dialog.getByRole('row', { name: /^React 3 100%/ })).toBeVisible();
  const star = dialog.locator('.star[data-repo="dependency:React"]');
  await expect(star).toBeVisible();
  await star.click({ force: true });
  await expect(dialog.locator('[data-status]')).toContainText('React');
  await expect(dialog.locator('[data-details]')).toContainText('3 repositories');
  expect(await axeViolations(page)).toEqual([]);
});

test('the map offers a download and leaves the design and share link untouched', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const before = page.url();
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.getByRole('button', { name: 'Download interactive page' })).toBeEnabled();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download interactive page' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('sky-org-tech-stack.html');
  await dialog.getByRole('button', { name: 'Close' }).click();
  expect(page.url()).toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('a viewer can map their own account', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Use my account (@octo-sky)' }).click();
  await expect(dialog.getByLabel('GitHub account or organization')).toHaveValue('octo-sky');
});

test('Cancel stops a scan', async ({ page, github }) => {
  void github;
  let release;
  const calls = await stubScan(page, { hold: new Promise((resolve) => { release = resolve; }) });
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.locator('[data-tech-progress]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog.getByRole('button', { name: 'Map tech stack' })).toBeVisible();
  const made = calls.graphql;
  release();
  await page.waitForTimeout(200);
  expect(calls.graphql).toBe(made);
  await expect(dialog.getByText(/public repositories for @sky-org/)).toHaveCount(0);
});

test('closing the sheet stops a scan and reopening starts clean', async ({ page, github }) => {
  void github;
  let release;
  const calls = await stubScan(page, { hold: new Promise((resolve) => { release = resolve; }) });
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.locator('[data-tech-progress]')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  const made = calls.graphql;
  release();
  await page.waitForTimeout(200);
  expect(calls.graphql).toBe(made);
  await mapButton(page).click();
  await expect(dialog.getByLabel('GitHub account or organization')).toHaveValue('sky-org');
  await expect(dialog.getByRole('button', { name: 'Map tech stack' })).toBeVisible();
});

test('a request the browser blocks is retried and the map still appears', async ({ page, github }) => {
  void github;
  const calls = await stubScan(page, { blockFirst: true });
  // Chrome logs the blocked request, and it is the behaviour under test.
  page.removeAllListeners('console');
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.getByText('3 of 3 public repositories for @sky-org')).toBeVisible();
  expect(calls.blocked).toBe(1);
});

test('a rate limit explains itself and offers another try', async ({ page, github }) => {
  void github;
  await stubScan(page, { status: 403 });
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.getByRole('alert')).toContainText('request limit for your account');
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('signing out locks the view again and removes the map', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  await expect(dialog.getByText('3 of 3 public repositories for @sky-org')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /@sky-org. Choose a different account/ }).click();
  await page.getByRole('button', { name: /Signed in as @octo-sky/ }).click();
  const signIn = page.getByRole('dialog', { name: 'Sign in with GitHub' });
  await signIn.getByRole('button', { name: 'Sign out' }).click();
  await signIn.getByRole('button', { name: 'Close' }).click();
  // Same page, so the in-memory state is the one under test.
  await page.getByLabel(/GitHub username/i).fill('sky-org');
  await page.getByLabel(/GitHub username/i).press('Enter');
  await page.getByRole('tab', { name: 'Layout' }).click();
  await mapButton(page).click();
  const locked = page.getByRole('dialog', { name: 'Tech stack' });
  await expect(locked.getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  await expect(locked.locator('.star')).toHaveCount(0);
});

test('a finished map can go on a GitHub profile: workflow link, README snippet and an image', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  const section = dialog.locator('.tech-stack-profile');
  await expect(section.getByRole('heading', { name: 'Add it to a GitHub profile' })).toBeVisible();
  await expect(section.getByText('Your sign-in is not used or stored.')).toBeVisible();

  // The link opens GitHub's new-file editor with the workflow filled in.
  const create = section.getByRole('link', { name: 'Create the file on GitHub' });
  const href = new URL(await create.getAttribute('href'));
  expect(href.origin + href.pathname).toBe('https://github.com/sky-org/sky-org/new/HEAD');
  expect(href.searchParams.get('filename')).toBe('.github/workflows/tech-stack.yml');
  const yaml = href.searchParams.get('value');
  expect(yaml).toContain("uses: mnichols08/constellation@v5");
  expect(yaml).toContain("username: 'sky-org'");
  expect(yaml).toContain("tech-stack: 'true'");
  expect(yaml).toContain("tech-stack-style: 'full'");
  // The viewer's sign-in never leaves the tab.
  expect(yaml).not.toContain(TOKEN);
  await expect(section.getByRole('region', { name: 'README snippet' })).toContainText('raw.githubusercontent.com/sky-org/sky-org/output/tech-stack.svg');

  // Another repository updates both; a bad one explains itself and removes the link.
  await section.getByLabel('Repository for the workflow').fill('sky-org/.github');
  await expect(create).toHaveAttribute('href', /github\.com\/sky-org\/\.github\/new\/HEAD/);
  await expect(section.getByRole('region', { name: 'README snippet' })).toContainText('sky-org/.github/output/tech-stack.svg');
  await section.getByLabel('Repository for the workflow').fill('not a repository');
  await expect(section.getByRole('alert')).toHaveText('Enter the workflow repository as owner/repository.');
  await expect(create).toBeHidden();
  await section.getByLabel('Repository for the workflow').fill('sky-org/sky-org');
  await expect(create).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download image (SVG)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('sky-org-tech-stack.svg');
  const svg = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
  // The default image is the card: it says what it shows in words.
  expect(svg).toContain('<title id="title">Tech stack of sky-org</title>');
  expect(svg).toContain('Tech stack · @sky-org');
  expect(svg).toContain('LANGUAGES AND TECHNOLOGIES');
  expect(svg).toContain('PROJECTS TO START WITH');
  expect(svg).toContain('declared in manifests, not proof of use');
  expect(svg).not.toContain(TOKEN);

  // The star map is still one choice away, for the workflow and the download.
  await section.getByLabel('Image').selectOption('map');
  await expect(create).toHaveAttribute('href', /tech-stack-style%3A\+%27map%27|tech-stack-style%3A%20%27map%27/);
  const mapDownload = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download image (SVG)' }).click();
  const map = await (await import('node:fs/promises')).readFile(await (await mapDownload).path(), 'utf8');
  expect(map).toContain('<title id="title">Tech stack across sky-org</title>');

  // Links can't live in an image, so the list of projects is offered as README text.
  await section.getByText('Show the list').click();
  const list = section.getByRole('region', { name: 'README project list' });
  await expect(list).toContainText('<!-- constellation:tech-stack:start -->');
  await expect(list).toContainText('](https://github.com/sky-org/');
  await expect(list).toContainText('which does not prove use');
  await expect(section.getByRole('button', { name: 'Copy the list' })).toBeVisible();
  // Still its own sheet: no design change, nothing to undo.
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});


test('the result opens with what a reader can take away: what is current, what goes together, where to look', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  const glance = dialog.locator('.tech-stack-glance');
  await expect(glance.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  // The stand-in repositories were last pushed in 2024, and the summary says so instead of implying current work.
  await expect(glance.locator('.tech-stack-headline')).toHaveText('Earlier work in JavaScript. 0 of 3 public repositories updated in the last year.');
  await expect(glance.getByRole('heading', { name: 'Where to look' })).toBeVisible();
  const first = glance.getByRole('listitem').first();
  await expect(first).toContainText('3 repositories · 2024');
  await expect(first).toContainText('earlier work');
  // Each entry names real repositories, as links that leave the Studio safely.
  const link = first.getByRole('link').first();
  await expect(link).toHaveAttribute('href', /^https:\/\/github\.com\/sky-org\//);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(glance.getByText('“Now” means a repository declaring it was pushed to in the last year.')).toBeVisible();
  // It comes before the map, and the tables say when each technology was active.
  expect(await dialog.evaluate((node) => Boolean(node.querySelector('.tech-stack-glance').compareDocumentPosition(node.querySelector('.tech-stack-map')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(dialog.getByRole('columnheader', { name: 'Active' }).first()).toBeVisible();
  await expect(dialog.getByRole('row', { name: /JavaScript 3 100% 2024/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('three projects to start with are shown, and only the owner is told what to fill in', async ({ page, github }) => {
  void github;
  await stubScan(page);
  await openStudio(page);
  const dialog = await signInThroughGate(page);
  // Someone else's account: the projects, but no advice about a profile that isn't theirs.
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  const glance = dialog.locator('.tech-stack-glance');
  await expect(glance.getByRole('heading', { name: 'Projects to start with' })).toBeVisible();
  const projects = glance.locator('.tech-stack-spotlights > li');
  await expect(projects).toHaveCount(3);
  await expect(projects.first().getByRole('link')).toHaveAttribute('href', /^https:\/\/github\.com\/sky-org\/app-\d$/);
  await expect(projects.first()).toContainText('Built with JavaScript, React, Express, MongoDB');
  await expect(projects.first()).toContainText('No description yet.');
  await expect(glance.getByRole('heading', { name: 'Before you publish' })).toHaveCount(0);

  // Their own account: plain facts about what is missing, and where to fix it.
  await dialog.getByRole('button', { name: 'Map another account' }).click();
  await dialog.getByRole('button', { name: 'Use my account (@octo-sky)' }).click();
  await dialog.getByRole('button', { name: 'Map tech stack' }).click();
  const checks = dialog.locator('.tech-stack-checks');
  await expect(checks.getByRole('heading', { name: 'Before you publish' })).toBeVisible();
  await expect(checks.getByRole('listitem').first()).toContainText('has no one-line description, link to a live site or demo and topics.');
  await expect(checks.getByText('use the gear beside “About”')).toBeVisible();
  await expect(checks.getByText('star them in the Projects tab')).toBeVisible();
  // The spotlight alone can be the README image.
  const section = dialog.locator('.tech-stack-profile');
  await section.getByLabel('Image').selectOption('spotlight');
  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download image (SVG)' }).click();
  const svg = await (await import('node:fs/promises')).readFile(await (await download).path(), 'utf8');
  expect(svg).toContain('Projects to start with · @octo-sky');
  expect(svg).not.toContain('USED TOGETHER');
  expect(await axeViolations(page)).toEqual([]);
});
