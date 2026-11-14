# Provider integration guide

Constellation does not require an AI provider, and the core never knows one exists. Two optional adapters ship: one for Claude ([`src/ai/providers/anthropic.mjs`](../../src/ai/providers/anthropic.mjs)) and one for the chat-completions format that OpenAI, OpenRouter, Groq, Ollama and many others serve ([`src/ai/providers/openai-compatible.mjs`](../../src/ai/providers/openai-compatible.mjs)). Both are used by the [hosted reader](HOSTED-AI.md) and by visitors who bring their own model, and both are worked examples of everything below. To let another language model author a [`ConstellationSpec`](../constellation-spec.md), write one small adapter. Everything else (tools, validation, repair, limits, the Studio flow) is already provider-neutral.

## The adapter interface

```ts
interface ModelAdapter {
  name?: string;                                   // shown in the Studio: "Read by <name>."
  generate(request: ModelRequest, context: { signal?: AbortSignal }): Promise<ModelTurn>;
}

interface ModelRequest {
  system: string;                                  // instructions for the model
  messages: Message[];                             // the conversation so far
  tools: { name: string; description: string; input_schema: object }[];   // JSON Schema
}

type Message =
  | { role: 'user'; content: string; currentSpec?: object }               // currentSpec on follow-ups
  | { role: 'assistant'; toolCalls: ToolCall[] }
  | { role: 'tool'; id: string; name: string; content: string };          // JSON text

interface ToolCall { id: string; name: string; arguments: object | string }

interface ModelTurn {
  toolCalls?: ToolCall[];                          // inspect evidence, or submit_spec
  spec?: object | string;                          // alternative to calling submit_spec
  text?: string;                                   // ignored
}
```

`generate` is called once per model turn. Translate `request` into your provider's format, call it, and translate the answer back. That is the whole job.

- `tools` are the engine's [published definitions](../../schemas/constellation-tools.v1.json) plus `submit_spec`, the final-answer tool. Most providers accept `name`, `description` and a JSON Schema directly.
- When the model calls a tool, return it in `toolCalls`. The orchestrator runs it against the engine and sends the result back as a `tool` message on the next turn.
- When the model calls `submit_spec` (or you return `spec`), Rust validates it. If it is rejected, the next turn carries a `tool` message with `{ ok: false, diagnostics }`.
- Honour `context.signal` so a person can stop a request.

You do not validate the spec, retry, count attempts or handle diagnostics. `describeConstellation` does.

## Example adapter

This sketch talks to **your own** HTTPS endpoint, which holds the provider key and forwards the request. Replace the two mapping functions with your provider's format.

```js
export function createHttpModel({ endpoint, name = 'my model' }) {
  return {
    name,
    async generate({ system, messages, tools }, { signal } = {}) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        signal,
        body: JSON.stringify({ system, messages, tools }),   // map to your provider here or on the server
      });
      if (!response.ok) throw new Error(`Model endpoint answered ${response.status}`);
      const answer = await response.json();
      return { toolCalls: answer.toolCalls ?? [] };           // [{ id, name, arguments }]
    },
  };
}
```

Use it from your own code:

```js
import { createConstellationEngine } from '@constellation/spec';
import { describeConstellation, describePlan } from '@constellation/spec/ai';

const engine = createConstellationEngine(repositories, { projectShowcase });
const result = await describeConstellation({ adapter: createHttpModel({ endpoint: '/api/model' }), engine, prompt, currentSpec });
if (result.ok) showPlan(describePlan(result.compiled));    // nothing is applied yet
else showMessage(result.message);                          // result.reason, result.diagnostics
engine.destroy();
```

Or connect it to the hosted Studio flow on a page you serve by setting it before the Studio starts:

```html
<script type="module">
  import { createHttpModel } from './my-model.mjs';
  window.constellationModelAdapter = createHttpModel({ endpoint: '/api/model', name: 'Acme model' });
</script>
```

The public Studio at `mnichols08.github.io/constellation` has no model connected and uses the built-in phrase matcher.

## Credentials

- **Do not put a provider key in a browser.** Anything shipped to a page is public. Route requests through an endpoint you control and keep the key there.
- Keep credentials inside the adapter's closure or on your server. The orchestrator never reads adapter fields other than `name` and `generate`.
- Nothing from the adapter is passed to the engine or WASM, and nothing from it is written to a spec, configuration, scene, share link or export.
- Progress events (`onEvent`) carry only event types, tool names, counts and diagnostic codes and paths. They never include the prompt, model text, adapter fields or error messages, so they are safe to log.
- If `generate` throws, the caller receives `{ ok: false, reason: 'adapter_error', error }`. The original `Error` may contain a URL or key from your provider; treat `error` as sensitive and do not show or log it. The Studio shows a fixed sentence.

## What the model is told

`SYSTEM_PROMPT` (exported from `src/ai/describe.mjs`) tells the model to state intent only, to use the discovery tools before naming a language, topic or repository, to call `submit_spec` when ready, to fix exactly what diagnostics report, and to keep everything the person did not ask to change when a current spec is given. You may append provider-specific formatting instructions in your adapter. Do not weaken the instruction against coordinates and code; Rust rejects them regardless.

## Limits

| Limit | Default | Meaning |
| --- | --- | --- |
| `maxRepairs` | 2 | further attempts after an invalid or missing spec |
| `maxToolCalls` | 12 | tool calls per request |
| `maxToolCallsPerTurn` | 6 | tool calls honoured from one turn |
| `maxTurns` | 12 | model turns per request |
| `maxPromptLength` | 2,000 | characters |
| `maxToolResultLength` | 20,000 | characters of one tool result sent back |

Pass `limits` to lower any of them. Values above four times the default are capped, and no limit can be disabled. Failure reasons: `invalid_prompt`, `no_adapter`, `no_engine`, `adapter_error`, `aborted`, `tool_limit`, `turn_limit`, `repair_limit`.

## Test without a provider

`createScriptedModel(turns)` replays prerecorded turns and records every request, so the full flow runs in CI with no network or credentials:

```js
import { createScriptedModel } from '@constellation/spec/ai';

const model = createScriptedModel([
  { toolCalls: [{ id: '1', name: 'list_languages', arguments: {} }] },
  { toolCalls: [{ id: '2', name: 'submit_spec', arguments: { spec: { schema_version: 1, layout: { kind: 'spiral' } } } }] },   // rejected
  { toolCalls: [{ id: '3', name: 'submit_spec', arguments: { spec: { schema_version: 1 } } }] },                              // accepted
]);
const result = await describeConstellation({ adapter: model, engine, prompt: 'anything' });
// result.ok === true, result.repairs === 1, model.requests[2].messages.at(-1) holds the diagnostics
```

Fixtures for valid, malformed, unsupported, self-correcting, never-valid and hostile outputs are in `test/fixtures/ai/model-scripts.json`; `test/ai-describe.test.mjs` shows how each is asserted. Test your adapter the same way: feed it recorded provider responses and assert the `ModelTurn` it returns.

## Checklist

- [ ] The adapter returns only `{ toolCalls }` or `{ spec }` and never executes model output.
- [ ] The provider key is on a server you control, not in page source.
- [ ] `signal` cancels the request.
- [ ] Errors thrown by `generate` are not logged or displayed verbatim.
- [ ] The flow passes with `createScriptedModel` in your CI.

## The chat-completions adapter

```js
import { createOpenAICompatibleModel, directChatTransport } from '@constellation/spec/ai/openai-compatible';

const adapter = createOpenAICompatibleModel({
  name: 'my model',
  send: directChatTransport({ baseUrl: 'https://openrouter.ai/api/v1', model: 'vendor/model-name', apiKey }),
});
```

- The address must be https, or http to `localhost` for a model on the same computer. Addresses carrying sign-in details or a query are refused.
- The request holds `model`, `messages` and `tools` and nothing else, so it works across services that disagree on optional settings.
- Calling a service from a web page only works if that service allows it. Public reports disagree about which do, and it can change, so nothing here assumes it: a refused call is reported as `ModelUnavailable` with reason `blocked`. A server-side caller, such as the hosted function, is not affected.
- A local model must be told to trust the page's address (for Ollama, the `OLLAMA_ORIGINS` setting).
- The model must support tool calls. One that does not will answer in words, and the flow reports that it made no plan.

