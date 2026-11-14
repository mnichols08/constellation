// Describe your sky: words in, a plan to check, then one Undo-able change.
// The reader is optional and local; nothing here may reach a network model,
// and nothing may change the map before Apply.
import { test, expect, expectPerceptibleScreen, axeViolations } from './support/ux.mjs';

test.beforeEach(async ({ github }) => { void github; });

async function openStudio(page, login = 'octo-sky') {
  await page.goto('/');
  await page.getByLabel('GitHub username').fill(login);
  await page.getByRole('button', { name: 'Show my sky' }).click();
  await expect(page.getByRole('heading', { name: `The sky of @${login}` })).toBeAttached();
  await expect(page.locator('[data-map] svg').first()).toBeVisible();
}
const mapSvg = (page) => page.evaluate(() => document.querySelector('[data-map]')?.shadowRoot?.querySelector('svg')?.outerHTML || '');
const starIds = (page) => page.evaluate(() => [...(document.querySelector('[data-map]')?.shadowRoot?.querySelectorAll('.star[data-repo]') || [])].map((s) => s.dataset.repo));
const topUndo = (page) => page.getByRole('banner').getByRole('button', { name: 'Undo', exact: true });
const topRedo = (page) => page.getByRole('banner').getByRole('button', { name: 'Redo', exact: true });
const dialog = (page) => page.getByRole('dialog', { name: 'Describe your sky' });
const field = (page) => dialog(page).getByRole('textbox');

/** The Layout tab's entry point exists on every screen size. */
async function openDescribe(page) {
  await page.getByRole('tab', { name: 'Layout', exact: true }).click();
  await page.getByRole('tabpanel', { name: 'Layout', exact: true }).getByRole('button', { name: 'Describe your sky' }).click();
  await expect(dialog(page)).toBeVisible();
}
async function showPlan(page, text) {
  if (text !== undefined) await field(page).fill(text);
  await dialog(page).getByRole('button', { name: 'Show the plan' }).click();
}
const EXAMPLE = 'Put my CSS projects near the centre and old experiments on the outskirts';

test('describing shows a plan first; cancelling changes nothing and Apply is one Undo step', async ({ page }) => {
  const requested = [];
  const hosts = new Set();
  page.on('request', (request) => { const url = new URL(request.url()); hosts.add(url.hostname); requested.push(url.pathname); });
  await openStudio(page);
  // Ordinary rendering downloads none of the spec engine or the prompt layer.
  expect(requested.filter((path) => /constellation_spec|spec-register|constellation-spec|\/src\/ai\//.test(path))).toEqual([]);
  const before = await mapSvg(page);

  await openDescribe(page);
  await expect(dialog(page).getByText('Read by a built-in phrase matcher, not an AI model')).toBeVisible();
  await expectPerceptibleScreen(page, { maxControls: 10, primary: 1 });
  expect(await axeViolations(page)).toEqual([]);

  await dialog(page).getByRole('button', { name: EXAMPLE }).click();
  await expect(field(page)).toHaveValue(EXAMPLE);
  await showPlan(page);
  await expect(dialog(page).getByRole('heading', { name: 'The plan', exact: true })).toBeVisible();
  await expect(dialog(page).getByText('This is one reading of your words, not a statement about your work.')).toBeVisible();
  await expect(dialog(page).getByText('Projects written in CSS sit nearest the centre. 2 projects match.')).toBeVisible();
  await expect(dialog(page).getByRole('list', { name: 'At the centre: matching projects' }).getByRole('listitem')).toHaveCount(2);
  await expect(dialog(page).getByText('“Experiments” matches none of your projects, so it changes nothing.')).toBeVisible();
  await expectPerceptibleScreen(page, { maxControls: 6, primary: 1 });
  expect(await axeViolations(page)).toEqual([]);
  // A preview is only a preview.
  expect(await mapSvg(page)).toBe(before);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  expect(await mapSvg(page)).toBe(before);
  await expect(topUndo(page)).toBeDisabled();
  // All of it ran locally.
  expect(requested.some((path) => path.endsWith('/wasm/constellation_spec_bg.wasm'))).toBe(true);
  // Only this page's own origin and the stubbed GitHub API were ever contacted.
  expect([...hosts].sort()).toEqual(['127.0.0.1', 'api.github.com']);

  await openDescribe(page);
  await expect(field(page)).toHaveValue(EXAMPLE);
  await showPlan(page);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText('Plan applied to your map.').first()).toBeVisible();
  await expect.poll(() => mapSvg(page), { message: 'map redraws' }).not.toBe(before);
  const applied = await mapSvg(page);
  // Every project is still there: a plan arranges, it does not hide.
  expect((await starIds(page)).length).toBe(16);
  await expect(topUndo(page)).toBeEnabled();

  await topUndo(page).click();
  await expect.poll(() => mapSvg(page), { message: 'Undo restores the exact map' }).toBe(before);
  await topRedo(page).click();
  await expect.poll(() => mapSvg(page), { message: 'Redo restores the plan' }).toBe(applied);
});

test('a follow-up revises the current plan, and manual settings keep working alongside it', async ({ page }) => {
  await openStudio(page);
  await openDescribe(page);
  await showPlan(page, EXAMPLE);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => starIds(page).then((ids) => ids.length)).toBe(16);
  const first = await mapSvg(page);

  await openDescribe(page);
  await expect(dialog(page).getByRole('heading', { name: 'Your current plan' })).toBeVisible();
  await expect(dialog(page).getByText('Projects written in CSS sit nearest the centre. 2 projects match.')).toBeVisible();
  await expect(dialog(page).getByLabel('What should change?')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await showPlan(page, 'show only the top 10 and connect projects by topic');
  await expect(dialog(page).getByRole('heading', { name: 'What changes' })).toBeVisible();
  await expect(dialog(page).getByText('Shows your 10 most starred projects.')).toBeVisible();
  await expect(dialog(page).getByText('Lines join projects that share topics.').first()).toBeVisible();
  // Untouched parts of the plan carry over.
  await expect(dialog(page).getByText('Projects written in CSS sit nearest the centre.')).toBeVisible();
  expect(await mapSvg(page)).toBe(first);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => starIds(page).then((ids) => ids.length)).toBe(10);

  // Undo returns to the previous validated plan, exactly.
  await topUndo(page).click();
  await expect.poll(() => mapSvg(page)).toBe(first);
  await topRedo(page).click();
  await expect.poll(() => starIds(page).then((ids) => ids.length)).toBe(10);

  // Manual controls still work on a described map…
  const described = await mapSvg(page);
  await page.getByRole('tabpanel', { name: 'Layout', exact: true }).getByRole('radio', { name: /Galaxy/ }).check();
  await expect.poll(() => mapSvg(page)).not.toBe(described);
  // …and the plan can be removed without losing them.
  await openDescribe(page);
  await dialog(page).getByRole('button', { name: 'Remove this plan' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'Your current plan' })).toHaveCount(0);
  await expect(page.getByText('Plan removed. Your other settings are kept.').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tabpanel', { name: 'Layout', exact: true }).getByRole('radio', { name: /Galaxy/ })).toBeChecked();
});

test('an empty description is explained and changes nothing', async ({ page }) => {
  await openStudio(page);
  const before = await mapSvg(page);
  await openDescribe(page);
  await showPlan(page, '   ');
  await expect(dialog(page).getByRole('alert')).toHaveText('Describe the constellation you want.');
  expect(await axeViolations(page)).toEqual([]);
  await expect(dialog(page).getByRole('heading', { name: 'The plan', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await mapSvg(page)).toBe(before);
  await expect(topUndo(page)).toBeDisabled();
});

test('a connected model goes through the same adapter: slow, failing and self-correcting answers are all safe', async ({ page }) => {
  await page.addInitScript(() => {
    let call = 0;
    window.modelRequests = [];
    window.constellationModelAdapter = {
      name: 'Test model',
      apiKey: 'sk-test-secret',
      async generate(request) {
        window.modelRequests.push(request);
        call += 1;
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (call === 1) throw new Error('503 from https://models.example.test/?key=sk-test-secret');
        // First answer: coordinates and an invented layout. Second: fixed from the diagnostics.
        if (call === 2) return { toolCalls: [{ id: 'a', name: 'submit_spec', arguments: { spec: { schema_version: 1, layout: { kind: 'spiral' }, positions: [{ x: 1, y: 2 }] } } }] };
        return { toolCalls: [{ id: 'b', name: 'submit_spec', arguments: { spec: { schema_version: 1, focus: { kind: 'language', value: 'Rust' }, layout: { kind: 'radial' } } } }] };
      },
    };
  });
  await openStudio(page);
  const before = await mapSvg(page);
  await openDescribe(page);
  await expect(dialog(page).getByText('Read by Test model.')).toBeVisible();

  // Busy state is announced and can be stopped; a failure is a sentence, not a stack trace.
  await showPlan(page, 'put rust in the middle');
  await expect(dialog(page).getByRole('status')).toContainText('Reading your description');
  await expect(dialog(page).getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(dialog(page).getByRole('alert')).toHaveText('The description could not be read right now. Nothing was changed. Try again in a moment.');
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('sk-test-secret');
  expect(await mapSvg(page)).toBe(before);

  // The retry is rejected by the engine once, repaired, and only then shown.
  await showPlan(page);
  await expect(dialog(page).getByText('Projects written in Rust sit nearest the centre. 2 projects match.')).toBeVisible();
  const feedback = await page.evaluate(() => JSON.parse(window.modelRequests.at(-1).messages.at(-1).content));
  expect(feedback.ok).toBe(false);
  expect(feedback.diagnostics.map((d) => `${d.code}@${d.path}`).sort()).toEqual(['invalid_value@layout.kind', 'unknown_field@positions']);
  // The model was given provider-neutral tools and nothing secret.
  const sent = await page.evaluate(() => JSON.stringify(window.modelRequests));
  expect(sent).not.toContain('sk-test-secret');
  expect(await page.evaluate(() => window.modelRequests[0].tools.map((tool) => tool.name))).toContain('find_repositories');
  expect(await mapSvg(page)).toBe(before);
  await dialog(page).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => mapSvg(page)).not.toBe(before);
});

test('the top bar offers Describe on wide screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'phones reach it from the Layout tab');
  await openStudio(page);
  const button = page.getByRole('banner').getByRole('button', { name: 'Describe', exact: true });
  await button.click();
  await expect(dialog(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
});
