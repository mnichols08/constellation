import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createPreviewServer } from "../scripts/preview-server.mjs";
import { browser, openBrowser } from "../scripts/browser-harness.mjs";

test(
  "Studio explores combined developer dimensions without changing graph edges",
  { skip: !browser, timeout: 30000 },
  async (t) => {
    const server = createPreviewServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(
      () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    );
    const { evaluate, waitFor, errors } = await openBrowser(
      t,
      `http://127.0.0.1:${server.address().port}`,
    );
    await waitFor(
      'Boolean(document.querySelector("#preview")?.firstChild?.shadowRoot?.querySelector(".star"))',
    );
    await evaluate('document.querySelector("#open-studio").click()');
    await waitFor('Boolean(document.querySelector("#profile-emphasis"))');
    await evaluate(
      'const control=document.querySelector("#arrangement"); control.value="profile"; control.dispatchEvent(new Event("input",{bubbles:true})); control.dispatchEvent(new Event("change",{bubbles:true}));',
    );
    await waitFor(
      '!document.querySelector("#profile-dimension-controls").hidden && document.querySelectorAll("#profile-dimension-buttons button").length === 6',
    );
    const before = await evaluate(
      'document.querySelector("#preview").firstChild.shadowRoot.querySelectorAll(".shared-language").length',
    );
    await evaluate(
      'document.querySelector("#profile-dimension-buttons [data-profile-dimension=systems]").click()',
    );
    assert.ok(
      await evaluate(
        'document.querySelector("#preview").firstChild.shadowRoot.querySelector("svg[data-profile-selection]")',
      ),
    );
    assert.ok(
      await evaluate(
        'document.querySelector("#preview").firstChild.shadowRoot.querySelectorAll(".repository[data-profile-related]").length > 0',
      ),
    );
    await evaluate(
      'document.querySelector("#profile-dimension-buttons [data-profile-dimension=tooling]").click()',
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#profile-dimension-buttons [data-profile-dimension=systems]").getAttribute("aria-pressed")',
      ),
      "true",
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#profile-dimension-buttons [data-profile-dimension=tooling]").getAttribute("aria-pressed")',
      ),
      "true",
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#preview").firstChild.shadowRoot.querySelectorAll(".shared-language").length',
      ),
      before,
    );
    assert.match(
      await evaluate(
        'document.querySelector("#profile-dimension-summary").textContent',
      ),
      /supporting repositories/,
    );
    await evaluate(
      'document.querySelector("#profile-dimension-clear").click()',
    );
    assert.equal(
      await evaluate(
        'document.querySelector("#preview").firstChild.shadowRoot.querySelector("svg").hasAttribute("data-profile-selection")',
      ),
      false,
    );
    assert.deepEqual(errors, []);
  },
);
