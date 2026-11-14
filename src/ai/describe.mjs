// Provider-neutral orchestration between a language model and the semantic
// engine. JavaScript owns model networking; Rust owns every decision about
// whether a spec is valid and what it means.
//
//   prompt -> adapter.generate() -> tool calls -> engine.callTool()  (bounded)
//                                -> spec        -> engine.compileSpec()
//                                                   ok       -> result
//                                                   invalid  -> diagnostics -> model may repair (bounded)
//
// Nothing here mutates a scene or an engine: the caller applies a returned
// spec only after a person approves it. Model output is untrusted data; it is
// never evaluated, and only names from the published tool list are dispatched.

export const AI_LIMITS = Object.freeze({
  /** Extra attempts after an invalid or missing spec. */
  maxRepairs: 2,
  /** Tool calls across the whole request. */
  maxToolCalls: 12,
  /** Tool calls honoured from a single model turn. */
  maxToolCallsPerTurn: 6,
  /** Model turns across the whole request. */
  maxTurns: 12,
  maxPromptLength: 2000,
  /** Characters of one tool result returned to the model. */
  maxToolResultLength: 20000,
});

/** The final-answer tool. Adapters expose it like any other tool. */
export const SUBMIT_TOOL = 'submit_spec';

export const SYSTEM_PROMPT = [
  'You turn a person\'s description of a constellation of their code repositories into a ConstellationSpec.',
  'A ConstellationSpec states intent only: what to focus on, which groups exist, what relates repositories, and the kind of layout.',
  'Never include coordinates, sizes, colours, code or styles. The engine computes all geometry.',
  'Use the discovery tools to learn which languages, topics and repositories actually exist before naming them. Do not guess.',
  `When ready, call ${SUBMIT_TOOL} with the complete spec. If it is rejected you receive diagnostics with a code, a path and allowed values; fix exactly those and submit again.`,
  'If a current spec is given, revise it: keep everything the person did not ask to change.',
].join('\n');

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clip = (value, max) => (value.length > max ? `${value.slice(0, max)}…` : value);

/**
 * The tools a model may call: the engine's published definitions plus the
 * final-answer tool. Shape: `{ name, description, input_schema }`.
 */
export function modelTools(toolDefinitions) {
  const tools = toolDefinitions.tools.filter((tool) => tool.name !== 'compile_spec');
  const validate = toolDefinitions.tools.find((tool) => tool.name === 'validate_spec');
  return [...tools, {
    name: SUBMIT_TOOL,
    description: 'Submit the finished ConstellationSpec. The engine validates it and either accepts it or returns diagnostics to fix.',
    input_schema: structuredClone(validate.input_schema),
  }];
}

function normalizeTurn(turn) {
  if (!object(turn)) return { toolCalls: [], spec: undefined, malformed: true };
  const calls = Array.isArray(turn.toolCalls) ? turn.toolCalls.filter(object) : [];
  const toolCalls = calls.map((call, index) => {
    let args = call.arguments;
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = undefined; } }
    return { id: typeof call.id === 'string' ? call.id.slice(0, 120) : `call-${index + 1}`, name: String(call.name ?? '').slice(0, 80), arguments: object(args) ? args : {}, malformed: !object(args) };
  });
  let spec = turn.spec;
  if (typeof spec === 'string') { try { spec = JSON.parse(spec); } catch { spec = null; } }
  const submitted = toolCalls.find((call) => call.name === SUBMIT_TOOL);
  if (submitted) spec = submitted.arguments.spec ?? null;
  return { toolCalls: toolCalls.filter((call) => call.name !== SUBMIT_TOOL), spec, submitId: submitted?.id };
}

/**
 * Turn a description into a validated, compiled ConstellationSpec.
 *
 * @param {object} input
 * @param {{ generate(request: object, context: { signal?: AbortSignal }): Promise<object> }} input.adapter
 *   The only provider-specific piece. `request` is `{ system, messages, tools }`;
 *   the result is `{ toolCalls?: [{ id, name, arguments }], spec?: object, text?: string }`.
 * @param {object} input.engine A `createConstellationEngine()` instance.
 * @param {string} input.prompt What the person asked for.
 * @param {object} [input.currentSpec] The validated spec to revise, for follow-up requests.
 * @param {object} [input.canvas] `{ compact, round }` presentation facts for the preview.
 * @param {object} [input.toolDefinitions] Defaults to `engine.toolDefinitions()`.
 * @param {object} [input.limits] Tighter values for any `AI_LIMITS` entry.
 * @param {(event: object) => void} [input.onEvent] Progress events. They carry names,
 *   counts and diagnostics only: never the adapter, its configuration, prompts or model text.
 * @returns {Promise<object>} `{ ok: true, spec, compiled, repairs, toolCalls }` or
 *   `{ ok: false, reason, message, diagnostics, repairs, toolCalls }`.
 */
export async function describeConstellation({ adapter, engine, prompt, currentSpec, canvas, toolDefinitions, limits = {}, signal, onEvent } = {}) {
  const limit = { ...AI_LIMITS };
  for (const [key, value] of Object.entries(limits)) {
    // Callers may tighten limits, never remove them.
    if (key in AI_LIMITS && Number.isInteger(value) && value >= 0) limit[key] = Math.min(value, AI_LIMITS[key] * 4);
  }
  let repairs = 0;
  let toolCalls = 0;
  const emit = (event) => { try { onEvent?.(event); } catch {} };
  const fail = (reason, message, diagnostics = []) => {
    emit({ type: 'failed', reason, repairs, toolCalls, diagnostics: diagnostics.map(({ code, path }) => ({ code, path })) });
    return { ok: false, reason, message, diagnostics, repairs, toolCalls };
  };
  if (typeof adapter?.generate !== 'function') return fail('no_adapter', 'No model adapter is available.');
  if (typeof engine?.callTool !== 'function' || typeof engine?.compileSpec !== 'function') return fail('no_engine', 'A ConstellationEngine is required.');
  const request = typeof prompt === 'string' ? prompt.trim() : '';
  if (!request) return fail('invalid_prompt', 'Describe the constellation you want.');
  if (request.length > limit.maxPromptLength) return fail('invalid_prompt', `Descriptions can be at most ${limit.maxPromptLength} characters.`);

  const tools = modelTools(toolDefinitions ?? engine.toolDefinitions());
  const allowed = new Set(tools.map((tool) => tool.name));
  const messages = [{ role: 'user', content: request, ...(object(currentSpec) ? { currentSpec: structuredClone(currentSpec) } : {}) }];

  for (let turn = 0; turn < limit.maxTurns; turn += 1) {
    if (signal?.aborted) return fail('aborted', 'The request was cancelled.');
    let raw;
    try {
      raw = await adapter.generate({ system: SYSTEM_PROMPT, messages: structuredClone(messages), tools: structuredClone(tools) }, { signal });
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return fail('aborted', 'The request was cancelled.');
      // Provider errors can embed keys or URLs; they are returned to the caller, never logged.
      return { ...fail('adapter_error', 'The model could not be reached.'), error };
    }
    const result = normalizeTurn(raw);
    emit({ type: 'model_turn', turn: turn + 1, toolCalls: result.toolCalls.length, submitted: result.spec !== undefined });

    if (result.toolCalls.length && result.spec === undefined) {
      const calls = result.toolCalls.slice(0, limit.maxToolCallsPerTurn);
      messages.push({ role: 'assistant', toolCalls: calls.map(({ id, name, arguments: args }) => ({ id, name, arguments: args })) });
      for (const call of calls) {
        if (toolCalls >= limit.maxToolCalls) return fail('tool_limit', `The model asked for more than ${limit.maxToolCalls} lookups.`);
        toolCalls += 1;
        // Only published tool names reach the engine; everything else is answered here.
        const output = allowed.has(call.name) && !call.malformed
          ? engine.callTool(call.name, call.arguments)
          : { ok: false, diagnostics: [{ code: call.malformed ? 'invalid_type' : 'unknown_tool', severity: 'error', path: '', message: call.malformed ? 'Tool arguments must be a JSON object' : 'Unknown tool', allowed: [...allowed] }] };
        emit({ type: 'tool_call', name: allowed.has(call.name) ? call.name : 'unknown', ok: output.ok === true });
        messages.push({ role: 'tool', id: call.id, name: call.name, content: clip(JSON.stringify(output), limit.maxToolResultLength) });
      }
      continue;
    }

    // A final answer: Rust decides whether it is valid. Nothing is applied here.
    const outcome = object(result.spec)
      ? engine.compileSpec(result.spec, canvas)
      : { ok: false, diagnostics: [{ code: 'missing_field', severity: 'error', path: '', message: `Call ${SUBMIT_TOOL} with a ConstellationSpec object` }] };
    const diagnostics = Array.isArray(outcome.diagnostics) ? outcome.diagnostics : [];
    emit({ type: 'validation', ok: outcome.ok === true, diagnostics: diagnostics.map(({ code, path, severity }) => ({ code, path, severity })) });
    if (outcome.ok === true) {
      emit({ type: 'done', repairs, toolCalls });
      return { ok: true, spec: outcome.compiled.spec, compiled: outcome.compiled, diagnostics, repairs, toolCalls };
    }
    if (repairs >= limit.maxRepairs) {
      return fail('repair_limit', `The description could not be turned into a valid plan after ${repairs + 1} attempts.`, diagnostics);
    }
    repairs += 1;
    emit({ type: 'repair', attempt: repairs });
    messages.push({ role: 'assistant', toolCalls: [{ id: result.submitId || `submit-${repairs}`, name: SUBMIT_TOOL, arguments: { spec: object(result.spec) ? result.spec : null } }] });
    messages.push({ role: 'tool', id: result.submitId || `submit-${repairs}`, name: SUBMIT_TOOL, content: clip(JSON.stringify({ ok: false, diagnostics }), limit.maxToolResultLength) });
  }
  return fail('turn_limit', `The model did not finish within ${limit.maxTurns} turns.`);
}
