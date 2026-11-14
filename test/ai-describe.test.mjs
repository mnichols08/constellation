import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createConstellationEngine } from '../src/constellation-spec.mjs';
import { describeConstellation, modelTools, AI_LIMITS, SUBMIT_TOOL, SYSTEM_PROMPT } from '../src/ai/describe.mjs';
import { createScriptedModel, createKeywordModel, interpretDescription } from '../src/ai/fake-model.mjs';
import { describePlan, planChanges, describeFailure } from '../src/ai/plan.mjs';

const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const evidence = await read('./fixtures/ai/evidence.json');
const scripts = await read('./fixtures/ai/model-scripts.json');

function setup(t, script) {
  const engine = createConstellationEngine(evidence);
  t.after(() => engine.destroy());
  const events = [];
  const adapter = Array.isArray(script) ? createScriptedModel(script) : script;
  return { engine, adapter, events, run: (prompt = 'Rust in the middle, experiments outside', extra = {}) => describeConstellation({ adapter, engine, prompt, onEvent: (event) => events.push(event), ...extra }) };
}

test('happy path: the model inspects real evidence, then submits a spec that Rust accepts', async (t) => {
  const { adapter, events, run, engine } = setup(t, scripts.happy_path_with_discovery);
  const before = JSON.stringify([engine.summary(), [...engine.edges().pairs]]);
  const result = await run();
  assert.equal(result.ok, true);
  assert.deepEqual([result.repairs, result.toolCalls], [0, 3]);
  assert.equal(result.spec.groups[0].id, 'experiments');
  assert.equal(result.compiled.groups[0].total, 3);
  assert.equal(result.compiled.nodes.find((node) => node.id === 'ada/orbit-engine').band, 'center');
  // The request carries provider-neutral tools and the model saw grounded tool results.
  const [first, second, third] = adapter.requests;
  assert.equal(first.system, SYSTEM_PROMPT);
  assert.deepEqual(first.tools.map((tool) => tool.name), ['list_languages', 'list_topics', 'find_repositories', 'describe_repository', 'preview_group', 'validate_spec', SUBMIT_TOOL]);
  assert.deepEqual(first.messages, [{ role: 'user', content: 'Rust in the middle, experiments outside' }]);
  assert.deepEqual(second.messages.slice(1).map((message) => [message.role, message.name || message.toolCalls.length]), [['assistant', 2], ['tool', 'list_languages'], ['tool', 'list_topics']]);
  assert.equal(JSON.parse(second.messages[2].content).languages[0].name, 'Rust');
  assert.equal(JSON.parse(third.messages.at(-1).content).total, 3, 'preview_group answered from evidence');
  assert.deepEqual(events.map((event) => event.type), ['model_turn', 'tool_call', 'tool_call', 'model_turn', 'tool_call', 'model_turn', 'validation', 'done']);
  // Describing is a preview: the engine is exactly as it was.
  assert.equal(JSON.stringify([engine.summary(), [...engine.edges().pairs]]), before);
  assert.equal(engine.appliedSpec(), null);
});

test('invalid specs are repaired from structured diagnostics within the retry cap', async (t) => {
  for (const [name, codes] of [['malformed_then_corrected', ['missing_field']], ['unsupported_fields_then_corrected', ['unknown_field', 'unknown_field', 'invalid_value', 'unknown_field', 'empty_filter']]]) {
    const { adapter, events, run } = setup(t, scripts[name]);
    const result = await run();
    assert.equal(result.ok, true, name);
    assert.equal(result.repairs, 1, name);
    // The second request shows the model exactly what Rust rejected.
    const feedback = JSON.parse(adapter.requests[1].messages.at(-1).content);
    assert.equal(feedback.ok, false);
    assert.deepEqual(feedback.diagnostics.map((d) => d.code).sort(), [...codes].sort(), name);
    assert.ok(feedback.diagnostics.every((d) => typeof d.path === 'string' && d.message));
    assert.deepEqual(events.filter((event) => event.type === 'validation').map((event) => event.ok), [false, true], name);
  }
  const { adapter, run } = setup(t, scripts.unsupported_fields_then_corrected);
  await run();
  const diagnostics = JSON.parse(adapter.requests[1].messages.at(-1).content).diagnostics;
  assert.deepEqual(diagnostics.find((d) => d.path === 'layout.kind').allowed, ['radial', 'clustered', 'solar_system', 'web', 'timeline']);
  assert.ok(diagnostics.some((d) => d.path === 'positions'), 'coordinates are refused, not ignored');
});

test('an unknown repository is corrected through a discovery tool', async (t) => {
  const { run } = setup(t, scripts.unknown_repository_then_discovery);
  const result = await run();
  assert.equal(result.ok, true);
  assert.deepEqual([result.repairs, result.toolCalls], [1, 1]);
  assert.deepEqual(result.spec.focus, { kind: 'repository', value: 'ada/lightbeam' });
});

test('repeated invalid output fails safely once retries are exhausted', async (t) => {
  const { adapter, events, run, engine } = setup(t, scripts.never_valid);
  const result = await run();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'repair_limit');
  assert.equal(result.repairs, AI_LIMITS.maxRepairs);
  assert.equal(adapter.requests.length, AI_LIMITS.maxRepairs + 1, 'the model is asked no more than the cap allows');
  assert.equal(adapter.remaining, 2, 'the valid spec later in the script is never reached');
  assert.equal(result.diagnostics[0].path, '', 'prose instead of a spec is an invalid answer');
  assert.equal(result.spec, undefined);
  assert.equal(engine.appliedSpec(), null);
  assert.equal(events.at(-1).type, 'failed');
  // A caller may tighten the cap, but not remove it.
  const strict = setup(t, scripts.never_valid);
  assert.equal((await strict.run(undefined, { limits: { maxRepairs: 0 } })).repairs, 0);
  assert.equal(strict.adapter.requests.length, 1);
  const greedy = setup(t, Array.from({ length: 100 }, () => ({ spec: { schema_version: 9 } })));
  await greedy.run(undefined, { limits: { maxRepairs: 1e9, maxTurns: 1e9 } });
  assert.ok(greedy.adapter.requests.length <= AI_LIMITS.maxTurns * 4);
});

test('tool use is bounded and only published tools ever reach the engine', async (t) => {
  const flood = setup(t, Array.from({ length: 10 }, () => scripts.tool_flood[0]));
  const flooded = await flood.run();
  assert.equal(flooded.reason, 'tool_limit');
  assert.equal(flooded.toolCalls, AI_LIMITS.maxToolCalls);
  assert.equal(flood.events.filter((event) => event.type === 'tool_call').length, AI_LIMITS.maxToolCalls);

  const calls = [];
  const hostile = setup(t, scripts.hostile_tool_calls);
  const callTool = hostile.engine.callTool;
  hostile.engine.callTool = (name, args) => { calls.push(name); return callTool(name, args); };
  const result = await hostile.run();
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['describe_repository'], 'unknown names and malformed arguments are answered without the engine');
  assert.equal(globalThis.pwned, undefined);
  assert.equal({}.polluted, undefined);
  const replies = hostile.adapter.requests[1].messages.filter((message) => message.role === 'tool').map((message) => JSON.parse(message.content).diagnostics[0].code);
  assert.deepEqual(replies, ['unknown_tool', 'unknown_tool', 'unknown_tool', 'invalid_type', 'unknown_repository']);

  const endless = setup(t, Array.from({ length: 40 }, () => ({ toolCalls: [] })));
  assert.equal((await endless.run(undefined, { limits: { maxRepairs: 4 } })).reason, 'repair_limit');
});

test('provider failures, secrets and cancellation never leak into events or results', async (t) => {
  const secret = 'sk-live-0123456789';
  const failing = { name: 'broken', apiKey: secret, headers: { authorization: `Bearer ${secret}` }, async generate() { throw new Error(`401 from https://api.example.test/v1?key=${secret}`); } };
  const { events, run } = setup(t, failing);
  const result = await run();
  assert.equal(result.reason, 'adapter_error');
  assert.ok(result.error instanceof Error, 'the caller still gets the original error to handle');
  const { error, ...shareable } = result;
  assert.ok(!JSON.stringify([events, shareable]).includes(secret));
  assert.ok(!JSON.stringify(events).includes('Rust in the middle'), 'events never carry the prompt');

  // A working adapter with credentials: none of its fields reach events or the engine.
  const keyed = { ...createScriptedModel(scripts.happy_path_with_discovery), apiKey: secret };
  const good = setup(t, keyed);
  const seen = [];
  const callTool = good.engine.callTool;
  good.engine.callTool = (name, args) => { seen.push(JSON.stringify([name, args])); return callTool(name, args); };
  assert.equal((await good.run()).ok, true);
  assert.ok(!JSON.stringify([good.events, seen]).includes(secret));

  const controller = new AbortController();
  const slow = setup(t, { async generate(_request, { signal }) { controller.abort(); signal.throwIfAborted(); } });
  assert.equal((await slow.run(undefined, { signal: controller.signal })).reason, 'aborted');
});

test('requests are checked before any model is contacted', async (t) => {
  const { adapter, run, engine } = setup(t, []);
  assert.equal((await run('   ')).reason, 'invalid_prompt');
  assert.equal((await run('x'.repeat(AI_LIMITS.maxPromptLength + 1))).reason, 'invalid_prompt');
  assert.equal(adapter.requests.length, 0);
  assert.equal((await describeConstellation({ engine, prompt: 'hi' })).reason, 'no_adapter');
  assert.equal((await describeConstellation({ adapter, prompt: 'hi' })).reason, 'no_engine');
  // The model-facing tools are the engine's definitions plus one final-answer tool.
  const tools = modelTools(engine.toolDefinitions());
  assert.ok(!tools.some((tool) => tool.name === 'compile_spec'));
  assert.deepEqual(tools.at(-1).input_schema, engine.toolDefinitions().tools.find((tool) => tool.name === 'validate_spec').input_schema);
});

test('follow-up requests revise the current spec and are validated like any other', async (t) => {
  const { run, adapter } = setup(t, createKeywordModel());
  const first = await run('Put my Rust projects near the centre and old experiments on the outskirts. Keep similar projects together.');
  assert.equal(first.ok, true);
  assert.deepEqual(first.spec.focus, { kind: 'language', value: 'Rust' });
  assert.equal(first.spec.groups.find((group) => group.id === 'experiments').placement, 'outer');
  assert.deepEqual(first.spec.layout, { kind: 'radial', cluster_by: ['topic', 'language'] });
  assert.equal(adapter.offline, true);

  const second = await run('Make topics matter more than languages and show only the top 10', { currentSpec: first.spec });
  assert.equal(second.ok, true);
  assert.deepEqual(second.spec.focus, first.spec.focus, 'untouched parts of the plan are kept');
  assert.deepEqual(second.spec.groups, first.spec.groups);
  assert.deepEqual(second.spec.relationships, [{ basis: 'shared_topic', strength: 1 }, { basis: 'shared_language', strength: 0.6 }]);
  assert.equal(second.spec.ranking.limit, 10);
  assert.deepEqual(planChanges(first.spec, second.spec), ['Shows your 10 most starred projects.']);

  const third = await run('Actually make it a web with no lines, calm and still', { currentSpec: second.spec });
  assert.equal(third.ok, true);
  assert.equal(third.spec.layout.kind, 'web');
  assert.ok(third.spec.groups.every((group) => group.placement === undefined), 'placement is dropped where it cannot apply');
  assert.deepEqual(third.spec.relationships, []);
  assert.equal(third.spec.style.motion, 'still');
  // A hand-edited spec is a valid starting point for the next request.
  const manual = { schema_version: 1, groups: [{ id: 'mine', label: 'Mine', match: { stars: { min: 50 } }, placement: 'inner' }] };
  const fourth = await run('move experiments to the outskirts', { currentSpec: manual });
  assert.deepEqual(fourth.spec.groups.map((group) => [group.id, group.placement]), [['mine', 'inner'], ['experiments', 'outer']]);
});

test('the phrase matcher is deterministic, grounded in real names and honest about what it cannot read', () => {
  const context = { languages: ['Rust', 'TypeScript', 'Go', 'C'], topics: ['web', 'creative-coding', 'data'] };
  const read = (prompt, extra) => interpretDescription(prompt, { ...context, ...extra });
  assert.deepEqual(read('Put my Rust work in the middle'), read('Put my Rust work in the middle'));
  assert.deepEqual(read('focus on typescript').focus, { kind: 'language', value: 'TypeScript' });
  assert.equal(read('I want to go faster and see more').focus, undefined, 'a short language name is not matched as an ordinary word');
  assert.deepEqual(read('everything written in Go please').focus, { kind: 'language', value: 'Go' });
  assert.equal(read('Put my COBOL projects in the centre').focus, undefined, 'a language the account does not have is never invented');
  assert.deepEqual(read('highlight my creative coding projects').focus, { kind: 'topic', value: 'creative-coding' });
  assert.deepEqual(read('asdf qwerty zxcv'), { schema_version: 1 });
  assert.equal(read('a galaxy of clusters by topic').layout.kind, 'clustered');
  assert.equal(read('show me a timeline of my work').layout.kind, 'timeline');
  assert.equal(read('make it feel like a solar system').layout.kind, 'solar_system');
  assert.equal(read('make it feel like a solar system with Rust near the center').layout.kind, 'radial');
  assert.deepEqual(read('just the top five, round orbits, hide the rings'), { schema_version: 1, ranking: { limit: 5 }, style: { orbit_shape: 'round', rings: false } });
});

test('plans read as plain sentences, separate evidence from interpretation and flag what matched nothing', async (t) => {
  const { engine } = setup(t, []);
  const { compiled } = engine.compileSpec(await read('../examples/specs/solar-system-rust-focus.json'));
  const plan = describePlan(compiled);
  assert.deepEqual(plan.sections.map((section) => section.id), ['focus', 'group-experiments', 'lines', 'layout']);
  assert.equal(plan.sections[0].text, 'Projects written in Rust sit nearest the centre. 4 projects match.');
  assert.deepEqual(plan.sections[0].projects.map((project) => project.name), ['lightbeam', 'orbit-engine', 'tiny-alloc', 'wayfinder']);
  assert.equal(plan.sections[1].text, 'Projects you marked experimental, placed on the outer ring. 3 projects match.');
  assert.deepEqual(plan.sections[1].projects[0], { name: 'tiny-alloc', id: 'ada/tiny-alloc', reasons: ['curated role: experimental'] });
  assert.equal(plan.sections[2].text, 'Lines join projects that share topics, and more faintly languages.');
  assert.equal(plan.sections[3].text, 'Rings: distance from the centre follows this plan. Similar projects sit side by side, by topic and language.');
  assert.deepEqual([plan.changes, plan.notes, plan.unchanged], [[], [], false]);

  const noisy = engine.compileSpec({ schema_version: 1, focus: { kind: 'language', value: 'COBOL' }, groups: [{ name: 'Giants', match: { stars: { min: 99999 } } }], ranking: { by: 'recency', limit: 5 }, style: { motion: 'still' } }).compiled;
  const second = describePlan(noisy, { previousSpec: compiled.spec });
  assert.deepEqual(second.notes, ['None of your projects use COBOL.', '“Giants” matches none of your projects, so it changes nothing.', 'Nothing matches what you asked to put at the centre.']);
  assert.equal(second.sections.find((section) => section.id === 'showing').text, 'Your 5 most recently updated projects, out of 15.');
  assert.ok(second.changes.includes('The “Experiments” group is removed.') && second.changes.includes('New group “Giants”.'));
  assert.equal(describePlan(compiled, { previousSpec: compiled.spec }).unchanged, true);
  // Sections list at most eight projects and say how many more there are.
  const many = describePlan(engine.compileSpec({ schema_version: 1, groups: [{ name: 'All', match: { fork: false } }] }).compiled);
  assert.deepEqual([many.sections[0].projects.length, many.sections[0].more], [8, 6]);

  assert.match(describeFailure({ reason: 'repair_limit', diagnostics: [{ severity: 'error', message: 'Value is not in the supported vocabulary' }] }), /could not be turned into a plan \(value is not in the supported vocabulary\)/);
  assert.match(describeFailure({ reason: 'adapter_error' }), /Nothing was changed/);
  for (const reason of ['tool_limit', 'turn_limit', 'aborted', 'whatever']) assert.ok(describeFailure({ reason }).length > 10);
});

test('the AI layer is optional: core rendering imports none of it and no provider SDK exists in the repo', async () => {
  const root = new URL('../src/', import.meta.url);
  const core = ['core-api.mjs', 'constellation.mjs', 'layout-api.mjs', 'config-schema.mjs', 'engine.mjs', 'web-component.mjs', 'renderer-svg.mjs', 'renderer-html.mjs', 'spec-host.mjs'];
  for (const file of core) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.ok(!/(?:from|import)\s*\(?\s*['"][^'"]*(?:\/ai\/|constellation-spec|spec-register|constellation_spec)/.test(source), `${file} must not load the AI or spec modules`);
  }
  for (const file of await readdir(new URL('ai/', root))) {
    const source = await readFile(new URL(`ai/${file}`, root), 'utf8');
    assert.ok(!/from\s+['"](?!\.)/.test(source), `${file} imports only local modules`);
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|\beval\s*\(|new Function/.test(source), `${file} performs no networking or code evaluation`);
    assert.ok(!/openai|anthropic|gemini|claude|gpt-/i.test(source), `${file} names no provider`);
  }
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies || {}), []);
});
