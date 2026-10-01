import test from "node:test";
import assert from "node:assert/strict";
import { createScene } from "../src/constellation.mjs";
import { renderSceneSVG } from "../src/renderer-svg.mjs";
import { normalizeConfig } from "../src/config-schema.mjs";
import { validateScene } from "../src/scene.mjs";
import { createOrganizationData } from "../src/organization/data.mjs";

const repositories = [
  { name: "ui", full_name: "elsewhere/ui", private: false, fork: false, stargazers_count: 20, language: "TypeScript", languages: { TypeScript: 90, CSS: 10 }, topics: ["react"], updated_at: "2026-08-01T00:00:00Z" },
  { name: "core", full_name: "source/core", private: false, fork: false, stargazers_count: 10, language: "Rust", languages: { Rust: 100 }, topics: ["wasm"], updated_at: "2026-08-01T00:00:00Z" },
];
const options = {
  arrangement: "account-system",
  referenceDate: "2026-09-01T00:00:00.000Z",
  accountSystem: { enabled: true, center: { type: "organization", login: "chosen-org" }, grouping: "technical", moons: { enabled: true, types: ["contributors"], maxPerPlanet: 4, maxScanRepositories: 25 } },
  accountSystemData: { records: {
    "elsewhere/ui": [{ login: "sam", type: "User", contributions: 3 }, { login: "chosen-org", type: "Organization", contributions: 8 }, { login: "unknown", contributions: 2 }],
    "source/core": [{ login: "sam", type: "User", contributions: 7 }, { login: "dependabot[bot]", type: "Bot", contributions: 4 }],
  } },
  stewardship: { enabled: true },
  stewardshipData: { repositories: [
    { id: "elsewhere/ui", knownMask: 7, presentMask: 5, inheritedMask: 4, behavior: { observedIssues: 0 } },
    { id: "source/core", knownMask: 1, presentMask: 1, behavior: { observedClosures: 2 } },
  ] },
};

test("account-system keeps source and chosen center separate with canonical evidenced moons", () => {
  const scene = createScene("source", repositories, options);
  assert.equal(scene.accountSystem.center.id, "github:organization:chosen-org");
  assert.deepEqual(scene.accountSystem.planets.map((planet) => planet.id).sort(), ["elsewhere/ui", "source/core"]);
  const sam = scene.accountSystem.moons.find((moon) => moon.login === "sam");
  assert.equal(sam.parent, "source/core");
  assert.equal(scene.accountSystem.moons.filter((moon) => moon.login === "sam").length, 1);
  assert.equal(scene.accountSystem.relations.filter((relation) => relation.identity === sam.id).length, 2);
  assert.equal(scene.accountSystem.moons.find((moon) => moon.login === "unknown").actor_type, "Unknown");
  assert.equal(scene.accountSystem.moons.some((moon) => moon.login === "chosen-org"), false);
  assert.equal(validateScene(scene).valid, true);
  const svg = renderSceneSVG(scene);
  assert.match(svg, /chosen center/);
  assert.match(svg, /not evidence of ownership, employment, leadership, or contribution/);
  assert.match(svg, /steward-unknown/);
  assert.match(svg, /effective\/inherited/);
});

test("planet anchors do not move when moons change and manual positions win", () => {
  const base = { ...options, starPositions: { "elsewhere/ui": { x: 111, y: 123 } } };
  const withMoons = createScene("source", repositories, base);
  const withoutMoons = createScene("source", repositories, { ...base, accountSystem: { ...base.accountSystem, moons: { ...base.accountSystem.moons, enabled: false } } });
  const positions = (scene) => Object.fromEntries(scene.accountSystem.planets.map((planet) => [planet.id, planet.position]));
  assert.deepEqual(positions(withMoons), positions(withoutMoons));
  assert.deepEqual(positions(withMoons)["elsewhere/ui"], [111, 123]);
});

test("settings are opt-in and contradictory activation is rejected", () => {
  assert.doesNotThrow(() => normalizeConfig({ arrangement: "rings" }));
  assert.throws(() => normalizeConfig({ arrangement: "rings", accountSystem: { enabled: true, center: { type: "user", login: "me" } } }), /must agree/);
  assert.doesNotThrow(() => normalizeConfig({ arrangement: "account-system", accountSystem: { enabled: true, center: { type: "user", login: "me" } } }));
});

test("scene validation rejects dangling moon parents and impossible stewardship masks", () => {
  const scene = createScene("source", repositories, options);
  const dangling = structuredClone(scene); dangling.accountSystem.moons[0].parent = "missing/repository";
  assert.equal(validateScene(dangling).valid, false);
  const impossible = structuredClone(scene); impossible.stewardship.repositories[0].present_mask = 127;
  assert.equal(validateScene(impossible).valid, false);
});

test("stewardship acquisition counts bounded requests and preserves unknown failures", async () => {
  let requests = 0, writes = 0;
  const fetchImpl = async (url) => {
    requests++;
    if (url.includes("source/core")) return { ok: false, status: 404, headers: new Headers() };
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({ files: { readme: { html_url: "https://github.com/elsewhere/ui/blob/main/README.md" }, license: null, contributing: { html_url: "https://github.com/elsewhere/.github/blob/main/CONTRIBUTING.md" }, code_of_conduct_file: null, issue_template: null, pull_request_template: null } }) };
  };
  const loader = createOrganizationData({ fetchImpl, token: "memory-only", storage: { getItem: () => null, setItem: () => writes++ } });
  const snapshot = await loader.stewardship(repositories.map((repo) => ({ ...repo, has_discussions: repo.name === "ui" })), { stewardship: { enabled: true, maxScanRepositories: 25, scan: "active" } });
  assert.equal(snapshot.requests, 2);
  assert.equal(requests, 2);
  assert.equal(writes, 0);
  const known = snapshot.repositories.find((row) => row.id === "elsewhere/ui");
  assert.equal(known.knownMask, 127);
  assert.equal(known.presentMask & 1, 1);
  assert.equal(known.inheritedMask & 4, 4);
  const failed = snapshot.repositories.find((row) => row.id === "source/core");
  assert.equal(failed.knownMask & 63, 0);
  assert.equal(failed.provenance, "unavailable");
});
