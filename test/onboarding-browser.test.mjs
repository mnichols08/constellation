import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { browser, openBrowser } from "../scripts/browser-harness.mjs";
import { createPreviewServer } from "../scripts/preview-server.mjs";

test(
  "guided first visit, constraints, optional failure, exports, customize and draft return",
  { skip: !browser, timeout: 120000 },
  async (t) => {
    const calls = [];
    const repos = Array.from({ length: 8 }, (_, i) => ({
      name: `r${i}`,
      full_name: `alice/r${i}`,
      description: `Project ${i}`,
      language: "Rust",
      created_at: `${2015 + i}-01-01`,
      updated_at: "2026-01-01",
      languages: { Rust: 100 },
      topics: ["tools"],
      stargazers_count: i,
    }));
    const server = createPreviewServer({
      token: "test-local-token",
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("/search/issues"))
          return Response.json({
            total_count: 1,
            items: [
              {
                user: { login: "alice" },
                pull_request: {},
                repository_url:
                  "https://api.github.com/repos/another-org/discovered",
              },
            ],
          });
        if (url.includes("/search/commits"))
          return Response.json({ total_count: 0, items: [] });
        if (/\/repos\/(team|another-org)\/(direct|discovered)$/.test(url)) {
          const name = url.split("/").pop();
          return Response.json({
            ...repos[0],
            name,
            full_name: new URL(url).pathname.slice(7),
            private: false,
          });
        }
        return Response.json(
          url.includes("/events") || url.includes("/commits?")
            ? { message: "Unavailable" }
            : url.includes("/languages")
              ? { Rust: 100 }
              : url.includes("/repos?")
                ? repos
                : { login: "alice", type: "User" },
          url.includes("/events") || url.includes("/commits?")
            ? { status: 503 }
            : {},
        );
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    );
    const page = await openBrowser(
      t,
      `http://127.0.0.1:${server.address().port}`,
    );
    const { evaluate: e, waitFor: wait, cdp } = page;
    const click = async (text) => {
      await e(
        `[...document.querySelectorAll('#guided-setup button')].find(button => button.textContent === ${JSON.stringify(text)}).click()`,
      );
      await wait(
        `!document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
      );
    };
    await wait(`document.querySelector('#open-studio')?.disabled === false`);
    assert.equal(await e(`document.documentElement.dataset.entry`), "landing");
    assert.equal(
      await e(
        `getComputedStyle(document.querySelector('.studio-body')).display`,
      ),
      "none",
    );
    await e(`document.querySelector('#open-studio').click()`);
    const guidedButton = await e(
      `(async()=>{const button=document.querySelector('#start-guided-setup');button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=button.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    await cdp("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...guidedButton,
      button: "left",
      clickCount: 1,
    });
    await cdp("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...guidedButton,
      button: "left",
      clickCount: 1,
    });
    assert.equal(await e(`document.documentElement.dataset.entry`), "landing");
    assert.equal(await e(`document.activeElement.id`), "username");
    await e(
      `document.querySelector('#username').value='alice'; document.querySelector('#account-form').requestSubmit()`,
    );
    await wait(`(document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    assert.ok(await e(`[...document.querySelectorAll('#guided-setup button')].some(b => b.textContent === 'Generate my project map')`), "the first useful result has a one-click default");
    assert.ok(await e(`[...document.querySelectorAll('#guided-setup button')].some(b => b.textContent === 'Show my technical focus')`), "plain-language outcomes are available before the questionnaire");
    assert.equal(
      await e(`document.querySelector('#arrangement option[value="orbital"]').textContent.trim()`),
      "Orbit around me (Identity Orbits)",
      "orbital copy describes its actual deterministic geometry",
    );
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await click("Generate my project map");
    await wait(`document.documentElement.dataset.entry === 'result'`);
    await wait(`Boolean(document.querySelector('#preview')?.firstChild?.shadowRoot?.querySelector('.star'))`);
    assert.equal(
      await e(`document.querySelector('.observatory').compareDocumentPosition(document.querySelector('#guided-setup')) & Node.DOCUMENT_POSITION_FOLLOWING ? true : false`),
      true,
      "the generated constellation precedes its next-step actions",
    );
    await mkdir(".dist", { recursive: true });
    const smartDefaultShot = await cdp("Page.captureScreenshot");
    await writeFile(
      ".dist/onboarding-smart-default-mobile.png",
      Buffer.from(smartDefaultShot.data, "base64"),
    );
    await click("Edit answers");
    await wait(
      `document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.equal(
      calls.some((url) => url.includes("/events")),
      false,
    );
    assert.equal(await e(`document.activeElement.tagName`), "H2");
    await e(
      `document.querySelector('#guided-add-repository-name').value='team/direct'; document.querySelector('#guided-add-public-repository').click()`,
    );
    await wait(
      `document.querySelector('#guided-repository-picker-list input[value="team/direct"]')?.checked`,
    );
    await e(
      `document.querySelector('#guided-contribution-organization').value='team'; document.querySelector('#guided-find-contributed-repositories').click()`,
    );
    await wait(
      `document.querySelector('#guided-repository-picker-list input[value="another-org/discovered"]') && !document.querySelector('#guided-find-contributed-repositories').disabled`,
    );
    assert.ok(
      calls
        .filter((url) => url.includes("/search/"))
        .every((url) => !new URL(url).searchParams.get("q").includes("org:")),
    );
    await e(
      `document.querySelector('#guided-repository-picker-list input[value="another-org/discovered"]').click()`,
    );
    await e(
      `document.querySelector('#guided-repository-search').value='r0'; document.querySelector('#guided-repository-search').dispatchEvent(new Event('input'))`,
    );
    assert.equal(
      await e(
        `document.querySelectorAll('#guided-repository-picker-list input').length`,
      ),
      1,
    );

    assert.equal(
      await e(`document.documentElement.scrollWidth <= innerWidth`),
      true,
    );
    await click("Continue");
    await click("Back");
    assert.ok(
      await e(`document.querySelector('#guided-repository-search') !== null`),
    );
    await click("Continue");
    await e(
      `document.querySelector('select[aria-label="Role for r0"]').value='featured'; document.querySelector('select[aria-label="Role for r0"]').dispatchEvent(new Event('change'))`,
    );
    await click("Continue");
    await click("Continue");
    await e(`document.querySelector('#guided-setup details').open=true`);
    await click("Skip");
    await click("Continue");
    assert.equal(
      await e(`document.querySelector('#guided-setup h2').textContent`),
      "Add a little life",
    );
    assert.equal(
      await e(
        `JSON.parse(localStorage.getItem('constellation-intent-v1:alice')).topics`,
      ),
      null,
    );
    await e(
      `document.querySelector('[name="guided-activity"][value="orbit"]').click()`,
    );
    await click("Continue");
    await e(
      `document.querySelector('[name="guided-history"][value="3d"]').click()`,
    );
    await click("Generate my constellation");
    await wait(
      `document.documentElement.dataset.entry === 'result' || !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.equal(
      await e(`document.documentElement.dataset.entry`),
      "result",
      await e(`document.querySelector('#guided-status').textContent`),
    );
    assert.match(
      await e(`document.querySelector('#guided-status').textContent`),
      /without activity/,
    );
    await e(`document.querySelector('#view-fullscreen').click()`);
    assert.equal(await e(`document.querySelector('#image-viewer').open`), true);
    await e(`document.querySelector('#viewer-close').click()`);
    await e(
      `document.querySelector('#constellation-title').value='My first universe'; document.querySelector('#save-constellation').click()`,
    );
    const draft = () =>
      e(
        `JSON.parse(localStorage.getItem('constellation-config-v1:alice')).draft`,
      );
    const before = await draft();
    assert.ok(before.includeRepos.includes("team/direct"));
    assert.ok(before.includeRepos.includes("another-org/discovered"));
    assert.equal(before.projectShowcase["alice/r0"].role, "featured");
    assert.equal(before.arrangement, "temporal-stack");
    assert.equal(before.contributionOrbit.enabled, false);
    await click("Generate another");
    await wait(
      `!document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    await e(
      `document.querySelector('#constellation-title').value='My second universe'; document.querySelector('#save-constellation').click()`,
    );
    const after = await draft();
    assert.deepEqual(after.includeRepos, before.includeRepos);
    assert.deepEqual(after.languages, before.languages);
    await mkdir(".dist", { recursive: true });
    const resultShot = await cdp("Page.captureScreenshot");
    await writeFile(
      ".dist/onboarding-result-mobile.png",
      Buffer.from(resultShot.data, "base64"),
    );
    await click("Explore my work");
    assert.equal(await e(`document.documentElement.dataset.entry`), "install");
    assert.equal(
      await e(`document.querySelector('#panel-save').hidden`),
      false,
    );
    await click("Customize");
    assert.equal(await e(`document.documentElement.dataset.entry`), "studio");
    assert.equal(
      await e(`document.querySelectorAll('.studio-tabs [role="tab"]').length`),
      5,
    );
    await e(
      `[...document.querySelectorAll('.design-launcher button')].find(button => button.textContent === 'Guided setup').click()`,
    );
    await wait(`(document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    await e(`[...document.querySelectorAll('#guided-setup button')].find(b => b.textContent === 'Quick guided generator')?.click()`);
    await wait(
      `document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.deepEqual(
      (await draft()).includeRepos,
      before.includeRepos,
      "entering the wizard preserves the manual draft",
    );
    await click("Open full Studio");
    assert.deepEqual((await draft()).includeRepos, before.includeRepos);

    await cdp("Page.reload");
    await wait(`document.querySelector('#open-studio')?.disabled === false`);
    await e(`document.querySelector('#open-constellation-library').click()`);
    assert.equal(
      await e(`document.querySelectorAll('.saved-constellation-row').length`),
      2,
    );
    await e(
      `[...document.querySelectorAll('.saved-constellation-row')].find(row=>row.textContent.includes('My first universe')).querySelector('button').click()`,
    );
    await wait(`document.documentElement.dataset.entry === 'result'`);
    assert.equal(
      await e(`document.querySelector('#constellation-title').value`),
      "My first universe",
    );
    assert.equal((await draft()).seed, before.seed);
    await e(
      `document.querySelector('#username').value='alice'; document.querySelector('#account-form').requestSubmit()`,
    );
    await wait(`(document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    await e(`[...document.querySelectorAll('#guided-setup button')].find(b => b.textContent === 'Quick guided generator')?.click()`);
    await wait(
      `document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.equal(
      (await draft()).seed,
      before.seed,
      "an existing draft does not bypass setup or get overwritten",
    );
    assert.equal(
      await e(`document.querySelector('.controls').getClientRects().length`),
      0,
    );
    assert.deepEqual((await draft()).includeRepos, before.includeRepos);
    assert.deepEqual(page.errors, []);
  },
);

test(
  "sparse profiles skip empty questions, no-activity stays lazy, asteroids load automatically",
  { skip: !browser, timeout: 120000 },
  async (t) => {
    const calls = [];
    const repo = {
      name: "app",
      full_name: "bob/app",
      private: false,
      language: "Rust",
      languages: { Rust: 100 },
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const server = createPreviewServer({
      token: "test-local-token",
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.includes("/commits?"))
          return Response.json([
            {
              sha: "1".repeat(40),
              parents: [],
              author: { login: "bob" },
              commit: {
                message: "Build app",
                committer: { date: "2026-09-01" },
              },
            },
          ]);
        return Response.json(
          url.includes("/repos?")
            ? [repo]
            : url.includes("/repos/bob/app")
              ? repo
              : { login: "bob", type: "User" },
        );
      },
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    );
    const {
      evaluate: e,
      waitFor: wait,
      errors,
    } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
    const click = async (text) => {
      await e(
        `[...document.querySelectorAll('#guided-setup button')].find(button => button.textContent === ${JSON.stringify(text)}).click()`,
      );
      await wait(
        `!document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
      );
    };
    await wait(`document.querySelector('#open-studio')?.disabled === false`);
    await e(
      `document.querySelector('#username').value='bob'; document.querySelector('#account-form').requestSubmit()`,
    );
    await wait(`(document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    await e(`[...document.querySelectorAll('#guided-setup button')].find(b => b.textContent === 'Quick guided generator')?.click()`);
    await wait(
      `document.documentElement.dataset.entry === 'guided' && !!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.match(
      await e(`document.querySelector('#guided-setup > p').textContent`),
      /Step 1 of 6/,
    );
    await click("Continue");
    await click("Continue");
    await click("Continue");
    await click("Continue");
    await e(
      `document.querySelector('[name="guided-activity"][value="none"]').click()`,
    );
    await click("Continue");
    await click("Generate my constellation");
    await wait(`document.documentElement.dataset.entry === 'result'`);
    assert.equal(
      calls.some((url) => url.includes("/events") || url.includes("/commits?")),
      false,
    );
    await click("Edit answers");
    await click("Continue");
    await click("Continue");
    await click("Continue");
    await click("None");
    await click("Continue");
    await click("Continue");
    await click("Generate my constellation");
    await wait(
      `document.querySelector('#guided-status').textContent.includes('no visible projects')`,
    );
    assert.equal(await e(`document.documentElement.dataset.entry`), "guided");
    await click("Back");
    await click("Back");
    await click("Back");
    await click("Back");
    await click("Back");
    await click("All");
    await click("Continue");
    await click("Continue");
    await click("Continue");
    await click("Recommended");
    await click("Continue");
    await e(
      `document.querySelector('[name="guided-activity"][value="asteroids"]').click()`,
    );
    await click("Continue");
    await click("Generate my constellation");
    await wait(`document.documentElement.dataset.entry === 'result'`);
    assert.equal(calls.filter((url) => url.includes("/commits?")).length, 1);
    assert.equal(
      calls.some((url) => url.includes("/events")),
      false,
    );
    assert.equal(
      await e(
        `JSON.parse(localStorage.getItem('constellation-config-v1:bob')).draft.activityEffect`,
      ),
      "asteroids",
    );
    assert.deepEqual(errors, []);
  },
);

test(
  "returning intent outcomes normalize view state and preserve selected projects and roles",
  { skip: !browser, timeout: 120000 },
  async (t) => {
    const repos = Array.from({ length: 8 }, (_, i) => ({
      name: `r${i}`,
      full_name: `alice/r${i}`,
      description: `Project ${i}`,
      language: "Rust",
      created_at: `${2015 + i}-01-01`,
      updated_at: "2026-01-01",
      languages: { Rust: 100 },
      topics: ["tools"],
      stargazers_count: i,
    }));
    const server = createPreviewServer({
      token: "test-local-token",
      fetchImpl: async (url) =>
        Response.json(
          url.includes("/languages")
            ? { Rust: 100 }
            : url.includes("/repos?")
              ? repos
              : { login: "alice", type: "User" },
        ),
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    );
    const { evaluate: e, waitFor: wait } = await openBrowser(
      t,
      `http://127.0.0.1:${server.address().port}`,
    );
    await wait(`document.querySelector('#open-studio')?.disabled === false`);
    const oldIntent = {
      version: 1,
      projects: Array.from({ length: 6 }, (_, i) => `alice/r${i}`),
      projectShowcase: {
        "alice/r0": { role: "featured", priority: 1 },
        "alice/r1": { role: "supporting", priority: 1 },
      },
      languages: ["Rust"],
      topics: ["tools"],
      relationships: "languages",
      dimension: "language",
      activity: "none",
      history: "history",
      topology: "automatic",
      motion: "automatic",
      vibe: "cosmic",
    };
    await e(`localStorage.setItem('constellation-intent-v1:alice',${JSON.stringify(JSON.stringify(oldIntent))})`);
    await e(
      `document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`,
    );
    await wait(`document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?'`);
    const clickOutcome = async (evaluate, waitFor, label) => {
      await evaluate(`[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent===${JSON.stringify(label)}).click()`);
      await waitFor(`document.documentElement.dataset.entry==='result' && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`);
      return evaluate(`JSON.parse(localStorage.getItem('constellation-config-v1:alice')).draft`);
    };
    assert.equal(await e(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice')).history`), "history");
    const focus = await clickOutcome(e, wait, "Show my technical focus");
    assert.equal(focus.arrangement, "profile");
    const intent = await e(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice'))`);
    assert.equal(intent.topology, "automatic");
    assert.equal(intent.history, "current", "the initial technical-focus action resets saved project history");
    assert.deepEqual(focus.includeRepos, oldIntent.projects);
    assert.deepEqual(focus.projectShowcase, oldIntent.projectShowcase);

    const { evaluate: e2, waitFor: wait2 } = await openBrowser(
      t,
      `http://127.0.0.1:${server.address().port}`,
    );
    await wait2(`document.querySelector('#open-studio')?.disabled === false`);
    await e2(`localStorage.setItem('constellation-intent-v1:alice',${JSON.stringify(JSON.stringify(oldIntent))})`);
    await e2(
      `document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`,
    );
    await wait2(`document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?'`);

    const map = await clickOutcome(e2, wait2, "Generate my project map");
    assert.notEqual(map.arrangement, "profile");
    assert.notEqual(map.arrangement, "era-rings");
    let returningIntent = await e2(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice'))`);
    assert.equal(returningIntent.topology, "later");
    assert.equal(returningIntent.history, "current");
    assert.deepEqual(map.includeRepos, oldIntent.projects);
    assert.deepEqual(map.projectShowcase, oldIntent.projectShowcase);

    const returningFocus = await clickOutcome(e2, wait2, "Show my technical focus");
    assert.equal(returningFocus.arrangement, "profile");
    returningIntent = await e2(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice'))`);
    assert.equal(returningIntent.topology, "automatic");
    assert.equal(returningIntent.history, "current");
    assert.deepEqual(returningFocus.includeRepos, oldIntent.projects);
    assert.deepEqual(returningFocus.projectShowcase, oldIntent.projectShowcase);

    const history = await clickOutcome(e2, wait2, "Show my project history");
    assert.equal(history.arrangement, "era-rings");
    returningIntent = await e2(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice'))`);
    assert.equal(returningIntent.topology, "later");
    assert.equal(returningIntent.history, "history");

    const readme = await clickOutcome(e2, wait2, "Create a README graphic");
    assert.equal(readme.layout, "compact");
    assert.equal(readme.legend, false);
    assert.notEqual(readme.arrangement, "era-rings");
    returningIntent = await e2(`JSON.parse(localStorage.getItem('constellation-intent-v1:alice'))`);
    assert.equal(returningIntent.topology, "later");
    assert.equal(returningIntent.history, "current");
    assert.equal(returningIntent.motion, "still");
    assert.equal(returningIntent.vibe, "clean");
    assert.deepEqual(readme.includeRepos, oldIntent.projects);
    assert.deepEqual(readme.projectShowcase, oldIntent.projectShowcase);
  },
);

for (const scenario of ["pins", "empty", "failure", "anonymous"])
  test(
    `onboarding pinned quick group: ${scenario}`,
    { skip: !browser, timeout: 120000 },
    async (t) => {
      const calls = [];
      const repo = {
        name: "owned",
        full_name: "alice/owned",
        private: false,
        language: "Rust",
        created_at: "2020-01-01",
        topics: [],
      };
      const pin = (name, isPrivate = false) => ({
        name,
        nameWithOwner: "team/" + name,
        isPrivate,
        isFork: false,
        isArchived: false,
        createdAt: "2020-01-01",
        primaryLanguage: { name: "Rust" },
        repositoryTopics: { nodes: [] },
      });
      const server = createPreviewServer({
        token: scenario === "anonymous" ? undefined : "test-local-token",
        fetchImpl: async (url) => {
          calls.push(String(url));
          if (String(url).includes("/graphql"))
            return scenario === "failure"
              ? Response.json({}, { status: 503 })
              : Response.json({
                  data: {
                    repositoryOwner: {
                      pinnedItems: {
                        nodes:
                          scenario === "empty"
                            ? []
                            : [pin("pinned"), pin("private", true)],
                        pageInfo: { hasNextPage: false, endCursor: null },
                      },
                    },
                  },
                });
          return Response.json(
            String(url).endsWith("/languages")
              ? { Rust: 100 }
              : String(url).includes("/repos?")
                ? [repo]
                : { login: "alice", type: "User" },
          );
        },
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(
        () =>
          new Promise((resolve) => {
            server.close(resolve);
            server.closeAllConnections();
          }),
      );
      const {
        evaluate: e,
        waitFor: wait,
        cdp,
        errors,
      } = await openBrowser(t, `http://127.0.0.1:${server.address().port}/`);
      await wait(`document.querySelector('#open-studio')?.disabled===false`);
      if (scenario === "anonymous") {
        await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `{
        const originalFetch = window.fetch;
        window.publicCalls = [];
        window.fetch = async (url, options) => {
          if (!String(url).startsWith('https://api.github.com/')) return originalFetch(url, options);
          publicCalls.push(String(url));
          return Response.json(String(url).includes('/repos?') ? [${JSON.stringify(repo)}] : {login:'alice',type:'User'});
        };
      }` });
        await cdp("Page.reload");
        await wait(`document.querySelector('#open-studio')?.disabled===false`);
      }
      await e(
        `document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`,
      );
      await wait(`(!!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    await e(`[...document.querySelectorAll('#guided-setup button')].find(b => b.textContent === 'Quick guided generator')?.click()`);
    await wait(
        `!!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
      );
      const selection = () =>
        e(
          `Array.from(document.querySelectorAll('#guided-repository-picker-list input:checked'),node=>node.value)`,
        );
      const original = await selection();
      if (scenario === "anonymous") {
        assert.equal(await e(`[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent==='Pinned repositories').disabled`), true);
        assert.match(await e(`[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent==='Pinned repositories').title`), /Sign in/);
        assert.deepEqual(await selection(), original);
        assert.equal(await e('publicCalls.length'), 2);
        assert.equal(calls.length, 0, 'anonymous requests never reach the local proxy');
        assert.deepEqual(errors, []);
        return;
      }
      assert.equal(
        calls.some((url) => url.includes("/graphql")),
        false,
      );
      await e(
        `const pinnedButton=[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent==='Pinned repositories');pinnedButton.focus();`,
      );
      await cdp("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        text: "\r",
        windowsVirtualKeyCode: 13,
      });
      await cdp("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await wait(
        `!document.querySelector('#guided-setup').hasAttribute('aria-busy') && document.querySelector('#guided-status').textContent.length > 0`,
      );
      const status = await e(
        `document.querySelector('#guided-status').textContent`,
      );
      if (scenario === "pins") {
        assert.deepEqual(await selection(), ["team/pinned"]);
        assert.match(status, /Selected 1 pinned/);
        await e(
          `document.querySelector('#guided-repository-picker-list input[value="team/pinned"]').click()`,
        );
        assert.deepEqual(await selection(), []);
        await e(
          `document.querySelector('#guided-repository-picker-list input[value="team/pinned"]').click();[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent==='Continue').click()`,
        );
        await wait(
          `document.querySelector('#guided-setup h2').textContent==='Which projects should stand out?'`,
        );
        await e(
          `[...document.querySelectorAll('#guided-setup button')].find(button=>button.textContent==='Back').click()`,
        );
        assert.deepEqual(await selection(), ["team/pinned"]);
        assert.deepEqual(
          await e(
            `JSON.parse(localStorage.getItem('constellation-intent-v1:alice')).projects`,
          ),
          ["team/pinned"],
        );
      } else {
        assert.deepEqual(await selection(), original);
        assert.match(
          status,
          scenario === "empty"
            ? /no public pinned/
            : scenario === "failure"
              ? /Could not load pinned/
              : /Continue with GitHub/,
        );
      }
      assert.equal(
        calls.filter((url) => url.includes("/graphql")).length,
        scenario === "anonymous" ? 0 : 1,
      );
      assert.equal(
        calls.some(
          (url) => url.includes("/events") || url.includes("/commits?"),
        ),
        false,
      );
      assert.deepEqual(errors, []);
    },
  );
