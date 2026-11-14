// The tools the Constellation MCP server offers. Kept apart from the wire
// protocol (server.mjs) so they can be tested directly.
//
// An assistant connected to this server does the thinking; everything it can
// do here is bounded and checked by the same Rust engine the Studio uses:
// read public repository details, validate a ConstellationSpec against them,
// draw the result and write the files a GitHub profile needs. It cannot run
// commands, read other files, or write outside the folder it was started in.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute, sep } from 'node:path';
import { createConstellationEngine, specOptions, constellationToolDefinitions } from '../src/spec-register.mjs';
import { username, fetchRepositories, createScene } from '../src/constellation.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';
import { renderWorkflow, readmeSnippet, installationLinks } from '../src/export.mjs';
import { describePlan } from '../src/ai/plan.mjs';
import { suggestSpec } from '../src/ai/fake-model.mjs';

export const GUIDANCE = [
  'These tools build a GitHub Constellation: a map of someone’s public repositories for their profile README.',
  'Work in this order: load_account, portfolio_overview, then inspect with the list/find/preview tools, write a ConstellationSpec, check it with validate_spec, show the person describe_plan, and only then render_sky or readme_workflow.',
  'The person may describe the sky they want, or ask you to decide. When deciding, arrange it for someone skimming the profile, such as a recruiter: work marked featured (or, failing that, the most starred and recently updated) nearest the centre, at most three plainly named groups, stale or archived work further out, and no more than about 16 repositories when there are many.',
  'A spec states intent only. It never contains coordinates, colours, code or markup; the engine does the geometry.',
  'Use only what the tools report. Do not state or imply skill, seniority, quality or fit for a job: this arranges public evidence, it does not assess a person.',
].join('\n');

const ROLES = ['featured', 'supporting', 'experimental', 'historical'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const specSchema = { type: 'object', description: 'A ConstellationSpec (schema_version 1). See validate_spec for the full schema.' };

const OWN_TOOLS = [
  {
    name: 'load_account',
    description: 'Load a GitHub account’s public repositories. Call this first; every other tool works on the loaded account. Optionally mark repositories with the roles the developer wants (featured, supporting, experimental, historical); roles are the developer’s own curation and are reported as declared.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['account'],
      properties: {
        account: { type: 'string', description: 'GitHub username or profile URL.' },
        roles: { type: 'object', description: 'Repository name -> role.', additionalProperties: { enum: ROLES } },
      },
    },
  },
  {
    name: 'suggest_sky',
    description: 'A reasonable ConstellationSpec chosen by fixed rules from the account overview, with the plan in plain words. Deterministic and model-free: use it as a starting point when the person says "you decide", then improve it.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'describe_plan',
    description: 'What a spec would do, in plain words, with the repositories each part matches and why. Show this to the person before rendering anything.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['spec'], properties: { spec: specSchema } },
  },
  {
    name: 'render_sky',
    description: 'Draw the constellation for a spec as an SVG image and save it in the current folder. Returns where it was saved and what it shows.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['spec'],
      properties: {
        spec: specSchema,
        output: { type: 'string', description: 'File to write, relative to the current folder. Must end in .svg. Default constellation.svg.' },
        shape: { enum: ['wide', 'compact'], description: 'wide suits a README banner (default); compact is squarer.' },
      },
    },
  },
  {
    name: 'readme_workflow',
    description: 'Everything needed to put the constellation on a GitHub profile and keep it fresh daily: a GitHub Actions workflow carrying the spec, where to save it, and the README snippet. Returns text only; nothing is written or pushed.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['spec'],
      properties: {
        spec: specSchema,
        repository: { type: 'string', description: 'Repository that holds the profile README. Default: the account’s own profile repository.' },
        filename: { type: 'string', description: 'Image filename. Default constellation.svg.' },
        shape: { enum: ['wide', 'compact'] },
      },
    },
  },
];

/**
 * @param {{ env?: Record<string, string | undefined>, cwd?: string, fetchImpl?: typeof fetch }} [host]
 */
export function createConstellationTools({ env = process.env, cwd = process.cwd(), fetchImpl = fetch } = {}) {
  const engineTools = constellationToolDefinitions().tools.map(({ name, description, input_schema }) => ({ name, description, inputSchema: input_schema }));
  const engineNames = new Set(engineTools.map((tool) => tool.name));
  const definitions = [OWN_TOOLS[0], ...engineTools, ...OWN_TOOLS.slice(1)];
  let loaded = null;

  class ToolError extends Error {}
  const need = () => { if (!loaded) throw new ToolError('No account is loaded yet. Call load_account first.'); return loaded; };

  async function repositoriesFor(account) {
    // Offline use and tests: a JSON file of repositories in GitHub's API shape.
    if (env.CONSTELLATION_MCP_FIXTURE) {
      const records = JSON.parse(await readFile(env.CONSTELLATION_MCP_FIXTURE, 'utf8'));
      if (!Array.isArray(records)) throw new ToolError('The fixture file must hold a JSON array of repositories.');
      return records;
    }
    try {
      return await fetchRepositories(account, { token: env.GITHUB_TOKEN || env.GH_TOKEN || undefined, fetchImpl });
    } catch (error) {
      // GitHub's own message is safe to pass on; it never contains the token.
      throw new ToolError(`GitHub could not load @${account}: ${String(error?.message || error).slice(0, 300)}${env.GITHUB_TOKEN || env.GH_TOKEN ? '' : ' (Set GITHUB_TOKEN to raise the rate limit.)'}`);
    }
  }

  function compile(spec, shape) {
    const { engine } = need();
    if (!object(spec)) throw new ToolError('spec must be a ConstellationSpec object.');
    const outcome = engine.compileSpec(spec, { compact: shape === 'compact' });
    if (outcome.ok !== true) return { failed: { ok: false, diagnostics: outcome.diagnostics, hint: 'Fix the diagnostics and try again. validate_spec explains each one.' } };
    return { compiled: outcome.compiled, diagnostics: outcome.diagnostics || [] };
  }
  const optionsFor = (compiled, shape) => specOptions({
    projectShowcase: need().showcase, maxRepos: Math.min(need().repositories.length, 100), layout: shape === 'compact' ? 'compact' : 'atlas',
  }, compiled);
  const planOf = (compiled) => { const plan = describePlan(compiled); return { sections: plan.sections, notes: plan.notes }; };

  const own = {
    async load_account({ account, roles } = {}) {
      let name;
      try { name = username(String(account ?? '')); } catch (error) { throw new ToolError(String(error.message)); }
      const repositories = await repositoriesFor(name);
      const showcase = {};
      if (roles !== undefined) {
        if (!object(roles)) throw new ToolError('roles must map repository names to a role.');
        const known = new Map(repositories.map((repo) => [String(repo.name).toLowerCase(), repo.full_name || `${name}/${repo.name}`]));
        for (const [repo, role] of Object.entries(roles)) {
          const id = known.get(String(repo).split('/').pop().toLowerCase());
          if (!id) throw new ToolError(`@${name} has no public repository named ${String(repo).slice(0, 100)}.`);
          if (!ROLES.includes(role)) throw new ToolError(`Role for ${repo} must be one of: ${ROLES.join(', ')}.`);
          showcase[id] = { role };
        }
      }
      loaded?.engine.destroy();
      loaded = { account: name, repositories, showcase, engine: createConstellationEngine(repositories, { projectShowcase: showcase }) };
      return { ok: true, account: name, repositories: repositories.length, overview: loaded.engine.callTool('portfolio_overview', {}) };
    },
    async suggest_sky() {
      const { engine } = need();
      const spec = suggestSpec(engine.callTool('portfolio_overview', {}));
      const { compiled, failed } = compile(spec);
      return failed || { ok: true, spec: compiled.spec, plan: planOf(compiled), note: 'Chosen by fixed rules, not a model. Adjust it to what the person wants.' };
    },
    async describe_plan({ spec } = {}) {
      const { compiled, failed, diagnostics } = compile(spec);
      return failed || { ok: true, plan: planOf(compiled), diagnostics };
    },
    async render_sky({ spec, output = 'constellation.svg', shape } = {}) {
      const { compiled, failed } = compile(spec, shape);
      if (failed) return failed;
      if (typeof output !== 'string' || isAbsolute(output) || !/\.svg$/i.test(output) || /[\0<>:"|?*]/.test(output)) throw new ToolError('output must be a relative path ending in .svg.');
      const target = resolve(cwd, output);
      const inside = relative(cwd, target);
      if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new ToolError('output must stay inside the current folder.');
      const { account, repositories } = need();
      const scene = createScene(account, repositories, optionsFor(compiled, shape));
      const svg = renderSceneSVG(scene);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, svg);
      return { ok: true, saved: inside.split(sep).join('/'), bytes: Buffer.byteLength(svg), repositories_shown: compiled.nodes.length, plan: planOf(compiled) };
    },
    async readme_workflow({ spec, repository, filename = 'constellation.svg', shape } = {}) {
      const { compiled, failed } = compile(spec, shape);
      if (failed) return failed;
      const { account } = need();
      const repo = repository === undefined ? account : String(repository).split('/').pop();
      if (!/^[\w.-]{1,100}$/.test(repo)) throw new ToolError('repository must be a GitHub repository name.');
      let workflow;
      try { workflow = renderWorkflow(account, { account, ...optionsFor(compiled, shape) }, { filename }); }
      catch (error) { throw new ToolError(String(error.message)); }
      let links, snippet;
      try { links = installationLinks(`${account}/${repo}`, workflow); snippet = readmeSnippet(account, `${account}/${repo}`, filename); }
      catch (error) { throw new ToolError(String(error.message)); }
      return {
        ok: true,
        steps: [
          `Save the workflow as .github/workflows/constellation.yml in ${account}/${repo}.`,
          'Run it once from the repository’s Actions tab (it then runs daily).',
          'Add the README snippet where the image should appear.',
        ],
        workflow_path: '.github/workflows/constellation.yml',
        workflow,
        readme_snippet: snippet,
        check_runs: links.actions,
        new_repository_link: links.create,
      };
    },
  };

  return {
    definitions,
    /** @returns {Promise<{ ok: boolean, value: object }>} `ok: false` is a tool-level error the assistant can act on. */
    async call(name, args) {
      const input = args === undefined || args === null ? {} : args;
      if (!object(input)) return { ok: false, value: { ok: false, message: 'Arguments must be a JSON object.' } };
      try {
        if (engineNames.has(name)) return { ok: true, value: need().engine.callTool(name, input) };
        if (Object.hasOwn(own, name)) return { ok: true, value: await own[name](input) };
        return { ok: false, value: { ok: false, message: `Unknown tool: ${String(name).slice(0, 80)}` } };
      } catch (error) {
        if (error instanceof ToolError) return { ok: false, value: { ok: false, message: error.message } };
        // Unexpected failures are reported without internals.
        return { ok: false, value: { ok: false, message: 'The tool failed unexpectedly.' } };
      }
    },
    close() { loaded?.engine.destroy(); loaded = null; },
  };
}
