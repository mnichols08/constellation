# ADR-0011: An optional Claude reader and a local MCP server

- Status: Accepted
- Date: 2026-11-13
- Owners: Mikey Nichols
- Related: [ADR-0001](ADR-0001-AI-SEMANTIC-BOUNDARY.md), [ADR-0010](ADR-0010-CONSTELLATION-SPEC-ENGINE.md), [Hosted Claude](../../ai/HOSTED-AI.md), [MCP](../../mcp.md)

## Context

5.5.0 added the ConstellationSpec engine and a prompt flow whose only shipped reader was a phrase matcher. The owner wants descriptions read by a real model for signed-in visitors at no cost to them, a way to switch that off without breaking anything, a path for visitors to use their own model, an MCP server, and output that helps someone skimming a profile.

## Decision

1. **One provider module, outside the core path.** `src/ai/providers/anthropic.mjs` translates the neutral adapter request to and from the Claude Messages API. It imports nothing. `describe.mjs`, the engine, Rust and the scene know no provider. A test enforces that provider names appear only under `src/ai/providers/`.
2. **Two transports, one adapter.** Hosted: the Studio sends only the conversation and the visitor's GitHub sign-in to a function that holds the key. Direct: the visitor's own key goes from their browser to the provider and is kept in memory only.
3. **The key is server-side configuration.** `ANTHROPIC_API_KEY` exists only in the function's environment. The function fixes model, prompt, tools and output size, verifies the GitHub token, and counts skies per user per day.
4. **Off is a state, not an error.** A missing key, an off flag, a rejected key or an unavailable counter all make the status endpoint answer `available: false`. The Studio then offers the visitor's own key, their own assistant, and the matcher.
5. **The Studio uses the hosted reader only at its registered address,** like sign-in. Copies served elsewhere never contact it.
6. **A local, dependency-free MCP server** (`mcp/server.mjs`) exposes the engine's tools plus loading, a rule-based suggestion, plan text, SVG rendering and workflow text. The assistant brings its own model.
7. **One new engine tool, `portfolio_overview`,** gives a model the whole account in one bounded call. Guidance about what helps a reader lives in the system prompt and the MCP instructions, not in Rust.
8. **"Decide for me"** is an intent on the same flow. With no model it uses `suggestSpec`, fixed rules over the overview.

## Consequences

- The repository now names one provider. Adding another means one more file under `src/ai/providers/` and, for hosting, one more function.
- The spec WASM grows by about 10 KB (250 KB). Core, the standalone HTML runtime and their budgets are unchanged, and nothing here loads unless the sheet is opened.
- The function directory gains one dependency (`@netlify/blobs`) in its own `package.json`. The root package still has none.
- The daily limit is approximate under simultaneous requests.
- Visitors who use Claude send their description and public repository details to Anthropic. The sheet says so first.

## Alternatives considered

- **Ship the key in the page.** Rejected: anyone could read and spend it.
- **Count per IP instead of per GitHub user.** Rejected: shared addresses would share a limit and it would not match "after logging in".
- **Hosted (HTTP) MCP server.** Deferred: it needs hosting, auth and abuse handling for little gain over a local process.
- **Score repositories for "recruiter value" in Rust.** Rejected: it would present a judgement as evidence. The overview reports counts and declared roles only.

## Not verified

Live calls to Anthropic and a live Netlify deployment were not exercised. The wire format follows the published Messages API and is covered by tests against stand-ins.
