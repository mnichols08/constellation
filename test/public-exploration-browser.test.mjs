import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { browser, openBrowser } from "../scripts/browser-harness.mjs";
import { createPreviewServer } from "../scripts/preview-server.mjs";

test(
  "anonymous onboarding completes with primary languages, manual projects and capability gates",
  { skip: !browser, timeout: 120000 },
  async (t) => {
    let proxyCalls = 0;
    const server = createPreviewServer({
      fetchImpl: async () => {
        proxyCalls++;
        throw Error("Anonymous proxy request");
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
    await cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: `
    const originalFetch = window.fetch; window.publicCalls = [];
    const repo = name => ({name:name.split('/')[1],full_name:name,private:false,language:'JavaScript',topics:['tools'],description:'Public project',created_at:'2020-01-01',updated_at:'2026-01-01',stargazers_count:10});
    window.fetch = async (url, options) => {
      if (!String(url).startsWith('https://api.github.com/')) return originalFetch(url, options);
      publicCalls.push(String(url));
      if (String(url).includes('/repos?')) return Response.json(Array.from({length:100}, (_,i)=>repo('alice/project'+i)));
      if (String(url).endsWith('/repos/team/shared')) return Response.json(repo('team/shared'));
      if (String(url).endsWith('/users/alice')) return Response.json({login:'alice',type:'User',public_repos:200});
      throw Error('Unexpected GitHub request: '+url);
    };`,
    });
    await cdp("Page.reload");
    await wait(`document.querySelector('#open-studio')?.disabled===false`);
    assert.match(
      await e(`document.querySelector('.form-note').textContent`),
      /Public mode.*100 public repositories/,
    );
    await e(
      `document.querySelector('#username').value='alice';document.querySelector('#account-form').requestSubmit()`,
    );
    await wait(`(!!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')) || (document.querySelector('#guided-setup h2')?.textContent === 'What would you like to make?' && !document.querySelector('#guided-setup').hasAttribute('aria-busy'))`);
    await e(`[...document.querySelectorAll('#guided-setup button')].find(b => b.textContent === 'Quick guided generator')?.click()`);
    await wait(
      `!!document.querySelector('#guided-repository-search') && !document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
    );
    assert.equal(await e("publicCalls.length"), 2);
    for (const label of ["Pinned repositories", "Contributed to"])
      assert.equal(
        await e(
          `[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent===${JSON.stringify(label)}).disabled`,
        ),
        true,
      );
    assert.equal(
      await e(
        `document.querySelector('#guided-find-contributed-repositories').disabled`,
      ),
      true,
    );
    assert.match(
      await e(
        `document.querySelector('#guided-repository-discovery-status').textContent`,
      ),
      /Sign in.*manually/,
    );
    await e(
      `document.querySelector('#guided-add-repository-name').value='https://github.com/team/shared';document.querySelector('#guided-add-public-repository').click()`,
    );
    await wait(
      `!!document.querySelector('#guided-repository-picker-list input[value="team/shared"]') && !document.querySelector('#guided-add-public-repository').disabled`,
    );
    assert.equal(await e("publicCalls.length"), 3);
    assert.equal(
      await e(
        `document.querySelector('#guided-repository-picker-list input[value="team/shared"]').checked`,
      ),
      true,
    );
    const click = async (label) => {
      await e(
        `[...document.querySelectorAll('#guided-setup button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`,
      );
      await wait(
        `!document.querySelector('#guided-setup').hasAttribute('aria-busy')`,
      );
    };
    await click("Continue");
    await e(
      `const role=document.querySelector('select[aria-label="Role for shared"]');role.value='featured';role.dispatchEvent(new Event('change'))`,
    );
    await click("Continue"); // topology
    await click("Continue"); // relationships
    assert.match(
      await e(`document.querySelector('#guided-setup').textContent`),
      /JavaScript/,
    );
    await click("Continue"); // activity
    assert.equal(
      await e(
        `document.querySelector('[name="guided-activity"][value="orbit"]').disabled`,
      ),
      true,
    );
    assert.equal(
      await e(
        `document.querySelector('[name="guided-activity"][value="asteroids"]').disabled`,
      ),
      true,
    );
    await click("Continue");
    await click("Generate my constellation");
    await wait(`document.documentElement.dataset.entry==='result'`);
    const exported = await e(
      `fetch(document.querySelector('.download').href).then(response=>response.text())`,
    );
    assert.match(exported, /<svg/);
    assert.match(exported, /shared/);
    assert.match(exported, /JavaScript/);
    assert.equal(await e("publicCalls.length"), 3);
    await click("Customize");
    await wait(`document.documentElement.dataset.entry==='studio'`);
    await e(`document.querySelector('#repository-history-open').click()`);
    assert.equal(
      await e(`document.querySelector('#commit-load').disabled`),
      true,
    );
    assert.equal(
      await e(`document.querySelector('#commit-constellation').disabled`),
      true,
    );
    assert.match(
      await e(`document.querySelector('#commit-status').textContent`),
      /Sign in/,
    );
    await e(`document.querySelector('#repository-history-close').click()`);
    // Presentation edits retain the public snapshot and don't start hydration.
    await e(
      `document.querySelector('#max-repos').value='8';document.querySelector('#max-repos').dispatchEvent(new Event('input'))`,
    );
    assert.equal(await e("publicCalls.length"), 3);
    assert.equal(proxyCalls, 0);
    assert.deepEqual(errors, []);
  },
);
