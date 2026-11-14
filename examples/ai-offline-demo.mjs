// Offline prompt-to-constellation demo. No network, API key or model: a
// scripted stand-in replays prerecorded tool calls, and the real Rust engine
// validates, repairs against, and compiles what it submits.
//
// The same function runs in the browser page (examples/ai-offline-demo.html)
// and in the Node test suite, so it takes its dependencies as arguments.

export const demoAccount = 'ada';
export const demoReferenceDate = '2025-11-08T00:00:00Z';
export const demoPrompt = 'Make my constellation feel like a solar system. Put my most important Rust projects near the center, cluster similar projects together, and place old experiments toward the outskirts.';

const project = (name, language, languages, topics, stars, pushed, created, extra = {}) => ({
  name, full_name: `${demoAccount}/${name}`, html_url: `https://example.invalid/${demoAccount}/${name}`, description: `A synthetic ${language} project.`,
  language, languages, topics, stargazers_count: stars, pushed_at: `${pushed}T00:00:00Z`, updated_at: `${pushed}T00:00:00Z`, created_at: `${created}-01-01T00:00:00Z`, fork: false, archived: false, ...extra,
});

/** Synthetic repositories in the shape the GitHub API returns. */
export const demoRecords = [
  project('orbit-engine', 'Rust', { Rust: 9000, JavaScript: 1000 }, ['wasm', 'graphics', 'systems'], 420, '2025-11-03', 2023),
  project('lightbeam', 'Rust', { Rust: 5000 }, ['cli', 'systems'], 180, '2025-10-19', 2022),
  project('wayfinder', 'Rust', { Rust: 3000, Shell: 200 }, ['cli', 'tools'], 64, '2025-05-02', 2021),
  project('tiny-alloc', 'Rust', { Rust: 800 }, ['systems'], 9, '2022-11-04', 2020),
  project('constellation-ui', 'TypeScript', { TypeScript: 7000, CSS: 1500, HTML: 500 }, ['web', 'graphics', 'design-system'], 310, '2025-11-07', 2024),
  project('little-notes', 'TypeScript', { TypeScript: 4000, CSS: 600 }, ['web', 'tools'], 41, '2025-01-12', 2022),
  project('palette', 'TypeScript', { TypeScript: 1200, CSS: 900 }, ['web', 'design-system'], 15, '2024-06-26', 2021),
  project('weekend-synth', 'JavaScript', { JavaScript: 2500, HTML: 300 }, ['audio', 'creative-coding'], 22, '2023-05-23', 2019),
  project('tiny-worlds', 'JavaScript', { JavaScript: 3100 }, ['creative-coding', 'graphics'], 57, '2024-01-28', 2020),
  project('stargazer', 'Python', { Python: 6000 }, ['data', 'astronomy'], 96, '2025-07-21', 2021),
  project('field-notes', 'Python', { Python: 2000, 'Jupyter Notebook': 4000 }, ['data'], 12, '2022-04-18', 2018),
  project('moonrise', 'Python', { Python: 900 }, ['astronomy'], 3, '2018-09-26', 2016, { archived: true }),
  project('dotfiles', 'Shell', { Shell: 700 }, [], 5, '2025-09-19', 2015),
  project('old-blog', 'HTML', { HTML: 1200 }, ['web'], 1, '2016-07-18', 2014, { archived: true }),
];

/** Roles the developer curated. The engine treats these as declared, not observed. */
export const demoShowcase = Object.fromEntries([
  ['orbit-engine', 'featured'], ['lightbeam', 'featured'], ['constellation-ui', 'featured'], ['wayfinder', 'supporting'], ['little-notes', 'supporting'],
  ['stargazer', 'supporting'], ['tiny-alloc', 'experimental'], ['weekend-synth', 'experimental'], ['tiny-worlds', 'experimental'], ['moonrise', 'historical'], ['old-blog', 'historical'],
].map(([name, role]) => [`${demoAccount}/${name}`, { role }]));

const finalSpec = {
  schema_version: 1,
  focus: { kind: 'language', value: 'Rust' },
  groups: [{ name: 'Experiments', match: { role: 'experimental' }, placement: 'outer' }],
  relationships: [{ basis: 'shared_topic', strength: 1 }, { basis: 'shared_language', strength: 0.6 }],
  layout: { kind: 'radial', cluster_by: ['topic', 'language'] },
};

/**
 * Prerecorded model turns: look around, check an assumption, submit a spec
 * with a mistake a model might plausibly make, then fix it from the diagnostics.
 */
export const demoTurns = [
  { toolCalls: [{ id: 'call-1', name: 'list_languages', arguments: {} }, { id: 'call-2', name: 'list_topics', arguments: {} }] },
  { toolCalls: [{ id: 'call-3', name: 'preview_group', arguments: { group: finalSpec.groups[0] } }] },
  { toolCalls: [{ id: 'call-4', name: 'submit_spec', arguments: { spec: { ...finalSpec, layout: { kind: 'solar-system-rings', cluster_by: ['topic', 'language'] }, positions: [{ id: 'ada/orbit-engine', x: 450, y: 270 }] } } }] },
  { toolCalls: [{ id: 'call-5', name: 'submit_spec', arguments: { spec: finalSpec } }] },
];

/**
 * @param {object} deps `createConstellationEngine`, `specOptions` from the spec engine;
 *   `describeConstellation`, `createScriptedModel`, `describePlan` from the prompt layer.
 * @returns {Promise<object>} `{ ok, prompt, steps, plan, spec, compiled, config, records }`
 */
export async function runOfflineDemo({ createConstellationEngine, specOptions, describeConstellation, createScriptedModel, describePlan }) {
  const evidence = { projectShowcase: demoShowcase, referenceDate: demoReferenceDate };
  const engine = createConstellationEngine(demoRecords, evidence);
  const model = createScriptedModel(demoTurns, { name: 'prerecorded demo model' });
  const steps = [];
  try {
    const result = await describeConstellation({
      adapter: model, engine, prompt: demoPrompt, canvas: { round: true },
      onEvent(event) {
        if (event.type === 'tool_call') steps.push({ kind: 'tool', text: `The model called ${event.name}; the engine answered from repository evidence.` });
        if (event.type === 'validation') {
          steps.push(event.ok
            ? { kind: 'accepted', text: 'Rust validated the spec and compiled it.' }
            : { kind: 'rejected', text: `Rust rejected the spec: ${event.diagnostics.map((d) => `${d.code} at ${d.path || 'the document'}`).join('; ')}.` });
        }
        if (event.type === 'repair') steps.push({ kind: 'repair', text: `The diagnostics went back to the model for repair attempt ${event.attempt}.` });
      },
    });
    if (!result.ok) return { ok: false, prompt: demoPrompt, steps, message: result.message, diagnostics: result.diagnostics };
    const options = specOptions({ referenceDate: demoReferenceDate, projectShowcase: demoShowcase, maxRepos: demoRecords.length, animate: false, orbitShape: 'round', legend: false }, result.compiled);
    return {
      ok: true, prompt: demoPrompt, steps, repairs: result.repairs, toolCalls: result.toolCalls,
      spec: result.spec, compiled: result.compiled, plan: describePlan(result.compiled),
      config: { version: 7, account: demoAccount, options }, records: demoRecords,
    };
  } finally {
    engine.destroy();
  }
}
