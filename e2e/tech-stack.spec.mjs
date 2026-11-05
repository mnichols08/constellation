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
async function stubScan(page, { hold = null, status = 200 } = {}) {
  const calls = { graphql: 0, tokens: new Set() };
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
