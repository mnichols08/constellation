#!/usr/bin/env node
import { normalizeRecords, toGraphRecords } from "./data-pipeline.mjs";
import { serializeScene, sceneStatistics } from "./scene.mjs";
import { codingRhythmOptions, deriveCodingRhythm } from "./coding-rhythm.mjs";
import { needsHistoryEvents } from "./history/settings.mjs";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  username,
  fetchRepositories,
  fetchRepositoryLanguages,
  selectRepositoryPool,
  selectRepositories,
  explainFilters,
  rustAvailable,
  engineError,
  createPluginHost,
  renderSceneSVG,
  renderSceneHTML,
  migrateConfig,
  migrateWorkflow,
} from "../packages/core/src/core-api.mjs";
import { loadConfig } from "./config.mjs";
import {
  aggregateActivity,
  activityOptions,
  normalizePublicEvents,
} from "./activity.mjs";
import { fetchPublicActivity } from "./github-activity.mjs";
import { createCommitFieldData } from "./commit-field.mjs";
import {
  createOrganizationData,
  attachFocusEvidence,
} from "./organization/data.mjs";
import {
  organizationOptions,
  needsContributorData,
} from "./organization/settings.mjs";
import {
  createContributedRepositories,
  loadSelectedRepositories,
} from "./contributed-repositories.mjs";
import { createRepositoryCommits } from "./repository-commits.mjs";
import { commitHistoryOptions } from "./commit-constellation.mjs";
import { createCliRequestCache } from "./cli-request-cache.mjs";
import { loadAccountAvatar } from "./account-sun.mjs";

async function main() {
  const token =
    process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.gh_token;
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      format: { type: "string", default: "svg" },
      username: { type: "string" },
      output: { type: "string" },
      config: { type: "string" },
      from: { type: "string" },
      workflow: { type: "string" },
      fixture: { type: "string" },
      "activity-fixture": { type: "string" },
      scene: { type: "boolean" },
      "scene-json": { type: "boolean" },
      "reference-date": { type: "string" },
      "refresh-data": { type: "boolean", default: false },
      "dry-run": { type: "boolean" },
      explain: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: constellation [build|validate|migrate] [options]\n\n  --format svg|html   Build static SVG or interactive HTML\n  --config FILE       Read JSON settings (or use CONSTELLATION_CONFIG_JSON)\n  --from VALUE        Migrate a design code or share URL\n  --workflow FILE     Migrate an existing v1/v2 workflow\n  --username NAME     GitHub account for generation or code migration\n  --fixture FILE      Read repositories offline\n  --output FILE       Destination (migration defaults to stdout)\n  --dry-run           Compute without writing SVG, cache or Action outputs\n  --scene             Inspect scene statistics and diagnostics without SVG\n  --scene-json        Inspect the normalized scene as JSON without SVG\n  --reference-date DATE  Use a fixed ISO date for reproducible generation\n  --explain           Print filter report as JSON on stdout\n  --refresh-data      Refresh fetched data\n  --version           Print installed version\n\nvalidate and migrate make no GitHub requests. See docs/migration-v3.md.",
    );
    return;
  }
  if (values.version) {
    console.log(
      JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
      ).version,
    );
    return;
  }
  if (!rustAvailable)
    throw new Error(
      `Could not load the Rust engine: ${engineError?.message}. Restore the core package WASM or run npm run build:rust and npm run build:core.`,
    );
  if (
    positionals.length > 1 ||
    (positionals.length &&
      !["build", "validate", "migrate"].includes(positionals[0]))
  )
    throw new Error("Expected build, validate, migrate, or generation flags.");
  if (!["svg", "html"].includes(values.format))
    throw new Error("--format must be svg or html.");
  if (positionals[0] === "migrate") {
    if (
      [values.config, values.from, values.workflow].filter(Boolean).length !== 1
    )
      throw new Error(
        "migrate requires exactly one of --config FILE, --from CODE_OR_URL, or --workflow FILE.",
      );
    const input =
      values.from || (await readFile(values.config || values.workflow, "utf8"));
    const settings = {
      account:
        values.username ||
        process.env.CONSTELLATION_USERNAME ||
        "your-universe",
    };
    const result = values.workflow
      ? migrateWorkflow(input, settings)
      : JSON.stringify(migrateConfig(input, settings), null, 2) + "\n";
    if (values.output && !values["dry-run"]) {
      await mkdir(dirname(values.output), { recursive: true });
      await writeFile(values.output, result);
    } else process.stdout.write(result);
    return;
  }
  if (values.scene && values["scene-json"])
    throw new Error("Use either --scene or --scene-json.");
  if (
    (values.scene || values["scene-json"]) &&
    positionals.length &&
    positionals[0] !== "build"
  )
    throw new Error("Scene inspection is a generation option.");
  if (values["scene-json"] && values.explain)
    throw new Error(
      "--scene-json cannot share stdout with --explain; use --scene --explain.",
    );
  if (
    values["reference-date"] &&
    !Number.isFinite(Date.parse(values["reference-date"]))
  )
    throw new Error("--reference-date must be a valid ISO date.");
  const inspectScene = values.scene || values["scene-json"];
  const configPath = values.config || process.env.CONSTELLATION_CONFIG;
  const config = await loadConfig(
    configPath,
    process.env.CONSTELLATION_CONFIG_JSON,
  );
  if (positionals[0] === "validate") {
    if (!configPath && !process.env.CONSTELLATION_CONFIG_JSON)
      throw new Error(
        "validate requires --config file.json or CONSTELLATION_CONFIG_JSON.",
      );
    console.log(JSON.stringify({ valid: true, errors: [] }));
    return;
  }
  const account = username(
    values.username || process.env.CONSTELLATION_USERNAME,
  );
  const configuredCacheTTL = Number(
    process.env.CONSTELLATION_GITHUB_CACHE_TTL_MS,
  );
  const apiRequestCache = createCliRequestCache({
    fetchImpl: fetch,
    refresh: values["refresh-data"],
    dryRun: values["dry-run"],
    ttlMs:
      Number.isFinite(configuredCacheTTL) && configuredCacheTTL > 0
        ? configuredCacheTTL
        : undefined,
  });
  const fetchImpl = apiRequestCache.fetch;
  const cacheFile = ".cache/constellation-organization.json";
  let savedCache = "{}";
  try {
    savedCache = await readFile(cacheFile, "utf8");
  } catch {}
  const organization = createOrganizationData({
    token,
    fetchImpl,
    storage: {
      getItem: () => savedCache,
      setItem: (_key, value) => {
        savedCache = value;
      },
    },
  });
  const accountData = values.fixture
    ? {
        login: account,
        type: config.accountType === "organization" ? "Organization" : "User",
      }
    : await organization.resolve(account, config, values["refresh-data"]);
  const settings = organizationOptions(config);
  if (settings.contributors.strategy === "deep")
    console.warn(
      "Deep contributor scan: up to " +
        settings.contributors.maxRepositories +
        " API requests. Cached results will be reused; coverage remains bounded.",
    );
  const focus =
    !values.fixture &&
    accountData.type === "Organization" &&
    config.organizationUser
      ? await organization.focusRepositories(account, config.organizationUser, {
          refresh: values["refresh-data"],
        })
      : null;
  const discovery =
    !values.fixture &&
    accountData.type === "Organization" &&
    config.repoSource !== "pinned"
      ? await organization.discover(account, config, {
          refresh: values["refresh-data"],
        })
      : null;
  let listed = values.fixture
    ? JSON.parse(await readFile(values.fixture, "utf8"))
    : discovery?.repositories ||
      (await fetchRepositories(account, {
        token,
        repoSource: config.repoSource,
        fetchImpl,
      }));
  if (focus && config.repoSource !== "pinned")
    listed = [
      ...new Map(
        [...listed, ...focus.repositories].map((repo) => [
          repo.full_name,
          repo,
        ]),
      ).values(),
    ];
  if (!values.fixture)
    listed = await loadSelectedRepositories(
      listed,
      config,
      createContributedRepositories({ token, fetchImpl }),
      { refresh: values["refresh-data"] },
    );
  config.accountData = accountData;
  if (config.nodeMode === "commits" && !values.fixture) {
    const history = commitHistoryOptions(config);
    if (history)
      config.commitHistoryData = await createRepositoryCommits({
        token,
        fetchImpl,
      }).load(history.repository, {
        branch: history.branch,
        refresh: values["refresh-data"],
      });
  }
  if (needsContributorData(config)) {
    const targets =
      accountData.type === "Organization"
        ? listed
        : selectRepositoryPool(listed, config);
    config.organizationData = values.fixture
      ? {
          records: Object.fromEntries(
            targets.map((repo) => [repo.full_name, repo.contributors || []]),
          ),
          scanned: targets.length,
          selected: targets.length,
          metadataComplete: true,
        }
      : {
          ...(await organization.contributors(targets, config, {
            refresh: values["refresh-data"],
          })),
          discovered: listed.length,
          metadataComplete: discovery?.complete ?? true,
        };
    config.organizationData = attachFocusEvidence(
      config.organizationData,
      focus,
      config.organizationUser,
      listed,
    );
    if (!values.fixture && !values["dry-run"] && !inspectScene) {
      await mkdir(dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, savedCache);
    }
    if (discovery?.diagnostic) console.warn(discovery.diagnostic);
    if (config.organizationData.diagnostic)
      console.warn(config.organizationData.diagnostic);
  }
  let enriched = listed;
  if (!values.fixture && config.nodeMode !== "commits") {
    try {
      enriched = await fetchRepositoryLanguages(
        selectRepositoryPool(listed, config),
        { token, fetchImpl },
      );
    } catch (error) {
      if (accountData.type !== "Organization") throw error;
      console.warn(
        "Language details incomplete; using primary languages. " +
          error.message,
      );
    }
  }
  // Retain the full public list for historical selection without fetching languages
  // for every repository. Older frames can use their known primary language.
  const byName = new Map(enriched.map((repo) => [repo.full_name, repo]));
  const pluginHost = createPluginHost();
  const repos = [
    ...listed.map((repo) => byName.get(repo.full_name) || repo),
    ...(await pluginHost.load(config, {
      account,
      refresh: values["refresh-data"],
    })),
  ];
  const reportingRepos = toGraphRecords(
    normalizeRecords(repos, { deferIdentityCheck: true }).records,
  );
  const generatedAt = new Date(
    values["reference-date"] || Date.now(),
  ).toISOString();
  let activityData, codingRhythmData, historyData, commitFieldData;
  if (
    needsHistoryEvents(config) ||
    activityOptions(config).activityEffect !== "off" ||
    (codingRhythmOptions(config).codingRhythm &&
      config.codingRhythmStyle !== "hidden")
  ) {
    const snapshot = values["activity-fixture"]
      ? {
          events: normalizePublicEvents(
            JSON.parse(await readFile(values["activity-fixture"], "utf8")),
          ),
          asOf: config.activityMetricDate || generatedAt,
        }
      : values.fixture
        ? { events: [], asOf: config.activityMetricDate || generatedAt }
        : await fetchPublicActivity(account, {
            token,
            fetchImpl,
            asOf: generatedAt,
            accountType:
              accountData.type === "Organization" ? "organization" : "user",
          });
    if (snapshot.diagnostic) console.warn(snapshot.diagnostic);
    historyData = snapshot;
    codingRhythmData = deriveCodingRhythm(
      snapshot.events,
      config,
      config.activityMetricDate || snapshot.asOf,
    );
    activityData = aggregateActivity(
      snapshot.events,
      selectRepositories(reportingRepos, config),
      config,
      snapshot.asOf,
    );
  }
  if (config.activityEffect === "asteroids" && !values.fixture) {
    const result = await createCommitFieldData({ token, fetchImpl }).load(
      selectRepositories(reportingRepos, config),
      { refresh: values["refresh-data"] },
    );
    commitFieldData = result.snapshots;
    for (const diagnostic of result.diagnostics) console.warn(diagnostic);
    if (selectRepositories(reportingRepos, config).length > 12)
      console.warn(
        "Commit asteroids cover the first 12 selected repositories per generation.",
      );
  }
  if (inspectScene) {
    const diagnostics = [];
    const scene = pluginHost.createScene(
      account,
      repos,
      {
        ...config,
        activityData,
        codingRhythmData,
        historyData,
        commitFieldData,
        generatedAt,
      },
      { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) },
    );
    const result = values["scene-json"]
      ? serializeScene(scene)
      : JSON.stringify(
          {
            ...sceneStatistics(scene),
            diagnostics,
            cache: pluginHost.pipelineCacheStatistics,
            ...(values.explain
              ? { filters: explainFilters(reportingRepos, config) }
              : {}),
          },
          null,
          2,
        ) + "\n";
    if (values.output && !values["dry-run"]) {
      if (/[\r\n]/.test(values.output)) throw new Error("Invalid output path.");
      await mkdir(dirname(values.output), { recursive: true });
      await writeFile(values.output, result);
    } else process.stdout.write(result);
    return;
  }
  if (config.accountSun === "avatar" && !values.fixture && !values["dry-run"])
    config.accountData = { ...config.accountData, avatarData: await loadAccountAvatar(account) };
  const scene = pluginHost.createScene(account, repos, {
    ...config,
    activityData,
    codingRhythmData,
    historyData,
    commitFieldData,
    generatedAt,
  });
  const svg =
    values.format === "html"
      ? renderSceneHTML(scene, { title: account + " constellation" })
      : renderSceneSVG(scene);
  if (values.explain)
    console.log(
      JSON.stringify({
        ...explainFilters(reportingRepos, config),
        ...(config.transforms?.length || config.mappings
          ? { pipeline: sceneStatistics(scene).pipeline }
          : {}),
      }),
    );
  if (values["dry-run"]) return;
  const output =
    values.output ||
    process.env.CONSTELLATION_OUTPUT ||
    (values.format === "html"
      ? "dist/constellation.html"
      : "dist/constellation.svg");
  if (/[\r\n]/.test(output)) throw new Error("Invalid output path.");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, svg);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `${values.format === "html" ? "html" : "svg"}=${output}\n`,
    );
  (values.explain ? console.error : console.log)(
    `Generated ${output} for @${account}.`,
  );
}
try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
