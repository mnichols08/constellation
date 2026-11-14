// Who reads a description: the built-in matcher, Claude with the visitor's own
// key, or Claude provided by the site after GitHub sign-in. Every path must
// work without the others, and switching one off must never be an error.
import { test, expect, expectPerceptibleScreen, axeViolations } from './support/ux.mjs';

test.beforeEach(async ({ github }) => { void github; });

const KEY = 'sk-ant-e2e-000000000000000000000000000000';
const TOKEN = 'test-token';
const dialog = (page) => page.getByRole('dialog', { name: 'Describe your sky' });
const readers = (page) => dialog(page).locator('.describe-readers');
const toggle = (page) => readers(page).getByRole('button', { name: 'Who reads this, and other ways' });
const SPEC = { schema_version: 1, layout: { kind: 'radial', cluster_by: ['language'] }, ranking: { by: 'stars', limit: 12 } };
const TURNS = [
  [{ type: 'thinking', thinking: 'look first', signature: 'sig' }, { type: 'tool_use', id: 'toolu_1', name: 'portfolio_overview', input: {} }],
  [{ type: 'tool_use', id: 'toolu_2', name: 'submit_spec', input: { spec: SPEC } }],
];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

async function openStudio(page, login = 'octo-sky') {
  await page.goto('/');
  await page.getByLabel('GitHub username').fill(login);
  await page.getByRole('button', { name: 'Show my sky' }).click();
  await expect(page.locator('[data-map] svg').first()).toBeVisible();
}
async function openDescribe(page) {
  await page.getByRole('tab', { name: 'Layout', exact: true }).click();
  await page.getByRole('tabpanel', { name: 'Layout', exact: true }).getByRole('button', { name: 'Describe your sky' }).click();
  await expect(dialog(page)).toBeVisible();
}
/** Point this local copy at a hosted reader on itself, as the published Studio points at its own. */
async function withHostedReader(page, handler) {
  await page.route((url) => url.pathname === '/' || url.pathname === '/index.html', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/(<meta name="constellation-ai" content=")[^"]*/, '$1/api/describe');
    await route.fulfill({ response, body: html });
  });
  const seen = [];
  await page.route('**/api/describe', async (route) => {
    const request = route.request();
    const entry = { method: request.method(), auth: request.headers().authorization || '', body: request.method() === 'POST' ? request.postDataJSON() : null };
    seen.push(entry);
    const { status = 200, body } = await handler(entry, seen.filter((item) => item.method === 'POST').length);
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return seen;
}
async function signIn(page) {
  await page.route('https://api.github.com/user', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ login: 'octo-sky', id: 1 }) }));
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click();
  const signInDialog = page.getByRole('dialog', { name: 'Sign in with GitHub' });
  await signInDialog.getByLabel('Personal access token').fill(TOKEN);
  await signInDialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The sky of @octo-sky' })).toBeAttached();
  await expect(page.locator('[data-map] svg').first()).toBeVisible();
}

test('Decide for me makes a plan with no model and no network; the other readers are explained', async ({ page }) => {
  const hosts = new Set();
  page.on('request', (request) => hosts.add(new URL(request.url()).hostname));
  await openStudio(page);
  await openDescribe(page);
  await expect(dialog(page).getByRole('button', { name: 'Decide for me' })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await toggle(page).click();
  await expect(dialog(page).getByText(/built-in phrase matcher, not an AI model/)).toBeVisible();
  await expect(readers(page).getByLabel('Use your own Anthropic API key')).toHaveAttribute('type', 'password');
  await expect(readers(page).getByRole('link', { name: 'How to connect an assistant' })).toHaveAttribute('href', /docs\/mcp\.md$/);
  // This copy is not the registered address, so the site's own reader is never offered or contacted.
  await expect(readers(page).getByRole('button', { name: 'Sign in with GitHub' })).toHaveCount(0);
  await expectPerceptibleScreen(page, { primary: 1 });
  expect(await axeViolations(page)).toEqual([]);

  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
  await expect(dialog(page).getByText('A plan chosen for you, for someone skimming your profile.')).toBeVisible();
  await expect(dialog(page).getByText('not a statement about your work')).toBeVisible();
  await expectPerceptibleScreen(page, { primary: 1 });
  expect(await axeViolations(page)).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan applied to your map.' })).toBeVisible();
  expect([...hosts].filter((host) => /anthropic|netlify|openai/.test(host))).toEqual([]);
});

test('your own key: Claude reads the description from this tab, and the key is kept nowhere', async ({ page }) => {
  const calls = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls.push({ headers: request.headers(), body: request.postDataJSON() });
    await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ content: TURNS[calls.length - 1] }) });
  });
  await openStudio(page);
  await openDescribe(page);
  await toggle(page).click();
  const keyField = readers(page).getByLabel('Use your own Anthropic API key');
  await keyField.fill('not-a-key');
  await readers(page).getByRole('button', { name: 'Use this key' }).click();
  await expect(readers(page).getByRole('alert')).toContainText('doesn’t look like an Anthropic API key');
  await readers(page).getByLabel('Use your own Anthropic API key').fill(KEY);
  await readers(page).getByRole('button', { name: 'Use this key' }).click();
  await expect(dialog(page).getByText('Read by Claude, using your own key.').first()).toBeVisible();
  await expect(readers(page).getByText(/Claude receives your words and the public details/)).toBeVisible();
  await expect(readers(page).getByRole('button', { name: 'Forget my key' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  await dialog(page).getByRole('textbox', { name: 'What would you like to see?' }).fill('Show my twelve most starred projects by language');
  await dialog(page).getByRole('button', { name: 'Show the plan' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[0].headers['x-api-key']).toBe(KEY);
  expect(calls[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(calls[0].body.model).toBe('claude-haiku-5-5');
  expect(calls[0].body.tools.map((tool) => tool.name)).toContain('portfolio_overview');
  // The second turn hands back Claude's own blocks and the engine's real answer.
  expect(calls[1].body.messages[1].content[0].type).toBe('thinking');
  expect(calls[1].body.messages[2].content[0].content).toContain('"most_starred"');
  await dialog(page).getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan applied to your map.' })).toBeVisible();

  // The key is in memory only: not in the page, storage, address or saved design.
  const kept = await page.evaluate(() => {
    const dump = (s) => Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i))}`).join('\n');
    return [document.documentElement.outerHTML, dump(localStorage), dump(sessionStorage), location.href, [...document.querySelectorAll('input,textarea')].map((i) => i.value).join('\n')].join('\n');
  });
  expect(kept).not.toContain(KEY);
  await openDescribe(page);
  await toggle(page).click();
  await readers(page).getByRole('button', { name: 'Forget my key' }).click();
  await expect(dialog(page).getByText(/built-in phrase matcher/)).toBeVisible();
});

test('a rejected key is explained, dropped, and the matcher still works', async ({ page }) => {
  page.removeAllListeners('console');
  await page.route('https://api.anthropic.com/**', (route) => (route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"error":{"type":"authentication_error"}}' })));
  await openStudio(page);
  await openDescribe(page);
  await toggle(page).click();
  await readers(page).getByLabel('Use your own Anthropic API key').fill(KEY);
  await readers(page).getByRole('button', { name: 'Use this key' }).click();
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Anthropic rejected that API key. Nothing was changed.' })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(readers(page).getByLabel('Use your own Anthropic API key')).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
});

test('signed in, the site’s Claude reads it: only the conversation is sent, with the sign-in as proof', async ({ page }) => {
  const seen = await withHostedReader(page, (entry, posts) => (entry.method === 'GET'
    ? { body: { available: true, limit: 10, ...(entry.auth ? { remaining: posts ? 9 : 10 } : {}) } }
    : { body: { content: TURNS[posts - 1], remaining: 9 } }));
  await signIn(page);
  await openDescribe(page);
  await expect(dialog(page).getByText(/Read by Claude \(10 of 10 left today\)\./).first()).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
  const posts = seen.filter((entry) => entry.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts.every((entry) => entry.auth === `Bearer ${TOKEN}`)).toBe(true);
  expect(Object.keys(posts[0].body)).toEqual(['messages']);
  expect(posts[0].body.messages[0].content).toContain('Decide for me');
  expect(JSON.stringify(posts)).not.toContain('sk-ant-');
  await dialog(page).getByRole('button', { name: 'Back' }).click();
  await expect(dialog(page).getByText(/Read by Claude \(9 of 10 left today\)\./).first()).toBeVisible();
  await expectPerceptibleScreen(page, { primary: 1 });
});

test('not signed in, the site’s Claude is offered; switched off, it is simply absent', async ({ page }) => {
  let available = true;
  await withHostedReader(page, () => ({ body: available ? { available: true, limit: 10 } : { available: false } }));
  await openStudio(page);
  await openDescribe(page);
  await toggle(page).click();
  await expect(readers(page).getByText('Sign in with GitHub and Claude reads your description instead, up to 10 times a day. No key needed.')).toBeVisible();
  await expect(readers(page).getByRole('button', { name: 'Sign in with GitHub' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  // The operator's off switch: no offer, no error, everything else as before.
  available = false;
  await openDescribe(page);
  await toggle(page).click();
  await expect(readers(page).getByRole('button', { name: 'Sign in with GitHub' })).toHaveCount(0);
  await expect(readers(page).getByLabel('Use your own Anthropic API key')).toBeVisible();
  await expect(dialog(page).getByRole('alert')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
});

test('out of requests or switched off mid-way: a plain sentence, then the other ways', async ({ page }) => {
  // The refusals are the behaviour under test, and this local stand-in serves them.
  page.removeAllListeners('console');
  page.removeAllListeners('response');
  let mode = 'quota';
  await withHostedReader(page, (entry) => (entry.method === 'GET'
    ? { body: { available: true, limit: 10, remaining: 4 } }
    : mode === 'quota' ? { status: 429, body: { error: 'quota', limit: 10, remaining: 0 } } : { status: 503, body: { error: 'disabled' } }));
  await signIn(page);
  await openDescribe(page);
  await expect(dialog(page).getByText(/Read by Claude \(4 of 10 left today\)\./).first()).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'You’ve used today’s 10 Claude requests here. They reset at midnight UTC. Nothing was changed.' })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(readers(page).getByLabel('Use your own Anthropic API key')).toBeVisible();
  await expect(readers(page).getByRole('link', { name: 'How to connect an assistant' })).toBeVisible();
});

test('switched off between the check and the request: said plainly, then the matcher takes over', async ({ page }) => {
  page.removeAllListeners('console');
  page.removeAllListeners('response');
  await withHostedReader(page, (entry) => (entry.method === 'GET' ? { body: { available: true, limit: 10, remaining: 10 } } : { status: 503, body: { error: 'disabled' } }));
  await signIn(page);
  await openDescribe(page);
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('alert').filter({ hasText: 'Claude isn’t available here right now. Nothing was changed.' })).toBeVisible();
  // It falls back to the matcher at once, so the next try just works.
  await expect(dialog(page).getByText(/built-in phrase matcher/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Decide for me' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'The plan' })).toBeVisible();
});
