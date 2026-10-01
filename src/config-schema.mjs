import { validateProjectRelationships } from "./recruiter.mjs";
import { renderSceneSVG } from "./renderer-svg.mjs";
import { commitHistoryOptions } from "./commit-constellation.mjs";
import { rhythmDefaults, resolveRhythmTimezone } from "./coding-rhythm.mjs";
import { createScene, username } from "./constellation.mjs";
import { visualCSS } from "./visual-style.mjs";
import { sizingModes } from "./node-sizing.mjs";
import { historyFields } from "./history/settings.mjs";
import { organizationFields } from "./organization/settings.mjs";
import { pluginOptions } from "./plugin-host.mjs";
import { validateThemePack } from "./theme-packs.mjs";
import { randomizeDesign } from "./design-randomizer.mjs";
import { validateLayoutReference } from "./layout-host.mjs";
import { accountSunMode } from "./account-sun.mjs";
import { validateSemanticOptions } from './semantic-studio.mjs';

export const CONFIG_VERSION = 7;
export const MAX_CONFIG_BYTES = 250000;
const projectShowcaseRoles = [
  "featured",
  "supporting",
  "experimental",
  "historical",
];
const readmePresentations = [
  "recruiter",
  "full-universe",
  "featured-work",
  "current-focus",
  "technology-identity",
  "project-journey",
];
const fields = new Set(
  "theme layout maxRepos animate includeForks bridges connectionDensity connectionBasis languages topics showOther css repoSource arrangement profileEmphasis ringAnimation perspective floatingAnimation ringRotation ringRotations identityRing snapToRings nodeMode hiddenNodes hiddenLabels colorConnections nodeColors labelOffsets labelPositions starPositions selection colors title includeRepos minStars includeArchived updatedWithin repoQuery sortBy sizingMode exportProfile visualStyle customCSS seedMode seed nodeSize nodeColorMode nodeGlowMode connectionWeight nodeShape effect legend visualTheme metricDate majorMetric designCode starfield activityEffect activityWindow activityDetail activityConnections activityMetricDate projectShowcase projectRelationships readmePresentation ringOrganization featuredTreatment".split(
    " ",
  ),
);
for (const key of Object.keys(rhythmDefaults)) fields.add(key);
for (const key of historyFields) fields.add(key);
for (const key of organizationFields) fields.add(key);
for (const key of ["starlightAnimate", "activityAnimate"]) fields.add(key);
fields.add("layoutRefinement");
fields.add("commitHistory");
fields.add("plugins");
fields.add("themePack");
fields.add("nodeCap");
fields.add("simplifyAbove");
fields.add("layers");
fields.add("timeline");
fields.add("temporalStack");
fields.add("temporalGeometry");
fields.add("ringPlacements");
fields.add("accountSun");
fields.add('ringMeaning');
fields.add('semanticLegend');
fields.add("transforms");
fields.add("mappings");
fields.add("layoutEngine");
fields.add("layoutOptions");
export const configFields = [...fields];
const nested = {
  layoutRefinement: "enabled intensity",
  ringAnimation: "enabled linked speeds directions modes easing amplitudes",
  perspective: "enabled animate horizontal vertical zoom range duration",
  floatingAnimation: "enabled mode amplitude duration",
  selection: "start end",
  starfield: "mode density brightness depth twinkle seed",
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function inspect(value, depth = 0) {
  if (depth > 8) throw new Error("Configuration is too deeply nested.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Configuration contains a non-finite number.");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw new Error("Unsafe configuration key.");
      inspect(child, depth + 1);
    }
}

export function normalizeConfig(input, { trustedCSS = false } = {}) {
  if (!object(input)) throw new Error("Configuration must be a JSON object.");
  inspect(input);
  if (JSON.stringify(input).length > MAX_CONFIG_BYTES)
    throw new Error("Configuration is too large.");
  const options = Object.fromEntries(
    Object.entries(input).filter(([key]) => fields.has(key)),
  );
  validateLayoutReference(options);
  validateSemanticOptions(options);
  commitHistoryOptions(options);
  if ("plugins" in options) pluginOptions(options.plugins);
  if ("accountSun" in options) accountSunMode(options.accountSun);
  if ("themePack" in options)
    validateThemePack(options.themePack, { reference: true });
  for (const key of [
    "animate",
    "includeForks",
    "bridges",
    "showOther",
    "snapToRings",
    "identityRing",
    "colorConnections",
  ]) {
    if (key in options && typeof options[key] !== "boolean")
      throw new Error(`${key} must be boolean.`);
  }
  for (const key of ["css", "customCSS"]) {
    if (key in options && typeof options[key] !== "string")
      throw new Error(`${key} must be text.`);
    // Keep CSS self-contained. XML text escaping remains the renderer's responsibility.
    if (
      !trustedCSS &&
      options[key] &&
      /(?:@import|url\s*\(|expression\s*\(|\\)/i.test(
        options[key].replace(/\/\*[\s\S]*?\*\//g, ""),
      )
    )
      throw new Error(
        "Imported CSS must be self-contained, without URLs, imports, escapes or expressions.",
      );
  }
  for (const [key, names] of Object.entries(nested))
    if (key in options) {
      if (!object(options[key])) throw new Error(`${key} must be an object.`);
      if (
        Object.keys(options[key]).some(
          (name) => !names.split(" ").includes(name),
        )
      )
        throw new Error(`Unknown ${key} field.`);
    }
  if (
    options.selection &&
    Object.values(options.selection).some(
      (value) => value !== null && typeof value !== "string",
    )
  )
    throw new Error("Selection must contain node IDs.");
  validateProjectRelationships(options.projectRelationships);
  if ("projectShowcase" in options) {
    if (!object(options.projectShowcase))
      throw new Error(
        "projectShowcase must be an object keyed by owner/repository.",
      );
    for (const [key, value] of Object.entries(options.projectShowcase)) {
      if (!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(key))
        throw new Error(
          `projectShowcase.${key} must use an owner/repository ID.`,
        );
      if (!value || !object(value))
        throw new Error(`projectShowcase.${key} must be an object.`);
      if (
        Object.keys(value).some(
          (field) => !["role", "priority"].includes(field),
        ) ||
        value.role === undefined
      )
        throw new Error(
          `projectShowcase.${key} must contain a role and may contain priority.`,
        );
      if (
        value.role !== undefined &&
        !projectShowcaseRoles.includes(value.role)
      )
        throw new Error(
          `projectShowcase.${key}.role must be featured, supporting, experimental or historical.`,
        );
      if (
        value.priority !== undefined &&
        (!Number.isInteger(value.priority) ||
          value.priority < 1 ||
          value.priority > 9999)
      )
        throw new Error(
          `projectShowcase.${key}.priority must be an integer between 1 and 9999.`,
        );
    }
  }
  if (
    "readmePresentation" in options &&
    !readmePresentations.includes(options.readmePresentation)
  )
    throw new Error(
      "readmePresentation must be recruiter, full-universe, featured-work, current-focus, technology-identity or project-journey.",
    );
  if (
    "ringOrganization" in options &&
    !["identity", "importance", "activity", "manual"].includes(
      options.ringOrganization,
    )
  )
    throw new Error(
      "ringOrganization must be identity, importance, activity or manual.",
    );
  if (
    "featuredTreatment" in options &&
    !["star", "label", "spotlight"].includes(options.featuredTreatment)
  )
    throw new Error("featuredTreatment must be star, label or spotlight.");
  if (
    "profileEmphasis" in options &&
    ![
      "automatic",
      "interface",
      "services",
      "data",
      "systems",
      "tooling",
      "automation",
    ].includes(options.profileEmphasis)
  )
    throw new Error(
      "profileEmphasis must be automatic or a developer evidence dimension.",
    );
  for (const key of [
    "nodeColors",
    "colors",
    "starPositions",
    "labelPositions",
    "labelOffsets",
    "visualStyle",
  ])
    if (key in options && !object(options[key]))
      throw new Error(`${key} must be an object.`);
  for (const key of ["starPositions", "labelPositions", "labelOffsets"])
    if (options[key]) {
      if (
        Object.values(options[key]).some(
          (point) =>
            !object(point) ||
            Object.keys(point).some((key) => !["x", "y"].includes(key)) ||
            Math.abs(point.x) > 10000 ||
            Math.abs(point.y) > 10000,
        )
      )
        throw new Error("Invalid manual coordinates.");
    }
  if (
    options.sizingMode !== undefined &&
    !sizingModes.includes(options.sizingMode)
  )
    throw new Error("Invalid sizing mode.");
  if (
    options.designCode !== undefined &&
    (typeof options.designCode !== "string" ||
      !/^v[123456]:[a-z\d-]{1,103}$/i.test(options.designCode))
  )
    throw new Error("Invalid design code.");
  if (options.nodeSize !== undefined && !sizingModes.includes(options.nodeSize))
    throw new Error("Invalid node size mode.");
  if (
    options.majorMetric !== undefined &&
    !["stars", "updated"].includes(options.majorMetric)
  )
    throw new Error("Invalid major repository metric.");
  if (options.visualStyle) {
    const allowed =
      "light dark lineWidth lineOpacity secondaryOpacity bridgeOpacity glow dustOpacity labelSize labels".split(
        " ",
      );
    if (
      Object.keys(options.visualStyle).some((key) => !allowed.includes(key)) ||
      typeof options.visualStyle.labels !== "boolean"
    )
      throw new Error("Invalid visual style fields.");
    visualCSS(options.visualStyle);
  }
  if ("codingRhythmTimezone" in options)
    options.codingRhythmTimezone = resolveRhythmTimezone(
      options.codingRhythmTimezone,
    );
  // A dimensional layer needs repository membership, which is unavailable during
  // data-independent config validation. Validate its settings on an ordinary empty
  // scene; compilation checks selected membership once actual records are loaded.
  const dimensional =
    options.temporalStack?.axis && options.temporalStack.axis !== "year";
  const probe = dimensional
    ? {
        ...options,
        arrangement:
          options.arrangement === "temporal-stack"
            ? options.temporalStack.innerArrangement || "rings"
            : options.arrangement,
        temporalStack: { ...options.temporalStack, enabled: false },
      }
    : options;
  // Reuse the rendering validators, including legacy fields and motion settings.
  renderSceneSVG(
    createScene("validation", [], {
      ...probe,
      layoutEngine: undefined,
      layoutOptions: undefined,
      ...(options.themePack && !options.themePack.preset
        ? { themePack: undefined }
        : {}),
    }),
    { interactive: true },
  );
  return JSON.parse(JSON.stringify(options));
}

export function parseConfig(value, fallbackAccount = "your-universe") {
  if (typeof value === "string" && value.length > MAX_CONFIG_BYTES)
    throw new Error("Configuration is too large.");
  const input =
    typeof value === "string"
      ? /^v[1-6]:/i.test(value.trim())
        ? randomizeDesign(value.trim())
        : JSON.parse(value)
      : value;
  if (!object(input)) throw new Error("Configuration must be a JSON object.");
  inspect(input);
  if ("version" in input && ![1, 6, CONFIG_VERSION].includes(input.version))
    throw new Error(
      "Unsupported configuration version. Use constellation migrate for legacy design codes or configs.",
    );
  return {
    version: CONFIG_VERSION,
    account: username(input.account || fallbackAccount),
    options: normalizeConfig(
      "options" in input && "version" in input ? input.options : input,
      { trustedCSS: [6, CONFIG_VERSION].includes(input.version) },
    ),
  };
}

export const serializeConfig = (account, options) => {
  const value = parseConfig({ version: CONFIG_VERSION, account, options });
  return JSON.stringify(
    { version: value.version, account: value.account, ...value.options },
    null,
    2,
  );
};
