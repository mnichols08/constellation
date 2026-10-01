import { analyzeStewardship } from "./engine.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const login = (value, name) => {
  if (typeof value !== "string" || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value)) throw new Error(`${name} must be a GitHub login.`);
  return value;
};
const integer = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return value;
};

export function accountSystemOptions(options = {}, account = "account") {
  const value = options.accountSystem ?? {};
  if (!object(value)) throw new Error("accountSystem must be an object.");
  const allowed = ["enabled", "center", "grouping", "moons"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unknown accountSystem field.");
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw new Error("accountSystem.enabled must be boolean.");
  const active = options.arrangement === "account-system";
  if (value.enabled !== undefined && value.enabled !== active) throw new Error("accountSystem.enabled must agree with arrangement: account-system.");
  const center = value.center ?? { type: options.accountData?.type === "Organization" ? "organization" : "user", login: account };
  if (!object(center) || Object.keys(center).some((key) => !["type", "login"].includes(key)) || !["user", "organization"].includes(center.type)) throw new Error("accountSystem.center must be a user or organization identity.");
  const moons = value.moons ?? {};
  if (!object(moons) || Object.keys(moons).some((key) => !["enabled", "types", "maxPerPlanet", "maxScanRepositories"].includes(key))) throw new Error("Invalid accountSystem.moons settings.");
  if (moons.enabled !== undefined && typeof moons.enabled !== "boolean") throw new Error("accountSystem.moons.enabled must be boolean.");
  const types = moons.types ?? ["contributors"];
  if (!Array.isArray(types) || types.some((type) => type !== "contributors")) throw new Error("Only contributor moons are supported in v3.8.");
  return { active, center: { type: center.type, login: login(center.login, "accountSystem.center.login") }, grouping: ["technical", "uniform"].includes(value.grouping) ? value.grouping : value.grouping === undefined ? "technical" : (() => { throw new Error("accountSystem.grouping must be technical or uniform."); })(), moons: { enabled: moons.enabled ?? false, types, maxPerPlanet: integer(moons.maxPerPlanet ?? 4, 1, 12, "maxPerPlanet"), maxScanRepositories: integer(moons.maxScanRepositories ?? 25, 1, 25, "maxScanRepositories") } };
}

export function stewardshipOptions(options = {}) {
  const value = options.stewardship ?? {};
  if (!object(value)) throw new Error("stewardship must be an object.");
  const allowed = ["enabled", "tier", "detail", "scan", "maxScanRepositories", "presence", "behavior", "discussions", "anchors", "recurrence"];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Unknown stewardship field.");
  for (const key of ["enabled", "presence", "behavior", "discussions", "anchors", "recurrence"]) if (value[key] !== undefined && typeof value[key] !== "boolean") throw new Error(`stewardship.${key} must be boolean.`);
  if (value.tier !== undefined && !["basic", "enhanced"].includes(value.tier)) throw new Error("stewardship.tier must be basic or enhanced.");
  return { enabled: value.enabled ?? false, tier: value.tier ?? "basic", detail: value.detail ?? "auto", scan: value.scan ?? "showcased", maxScanRepositories: integer(value.maxScanRepositories ?? 25, 1, 25, "stewardship.maxScanRepositories"), presence: value.presence ?? true, behavior: value.behavior ?? true, discussions: value.discussions ?? true, anchors: value.anchors ?? true, recurrence: value.recurrence ?? true };
}

export function compileStewardship(options = {}, repositoryIds = []) {
  const settings = stewardshipOptions(options);
  if (!settings.enabled) return undefined;
  const allowed = new Set(repositoryIds);
  const records = (options.stewardshipData?.repositories || []).filter((row) => allowed.has(row.id)).slice(0, settings.maxScanRepositories).map((row) => ({ id: row.id, known_mask: row.knownMask ?? 0, present_mask: row.presentMask ?? 0, inherited_mask: row.inheritedMask ?? 0, behavior: row.behavior || {} }));
  return analyzeStewardship({ repositories: records });
}
