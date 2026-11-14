# Hosted Claude for "Describe your sky"

This guide is for whoever runs the Studio. It explains how to let signed-in visitors have Claude read their description without bringing a key, how to switch that off, and what happens when it is off.

## The three readers

| Reader | Needs | Where the words go |
| --- | --- | --- |
| Built-in phrase matcher | Nothing | Nowhere. It runs in the browser. |
| A model of the visitor's own | A service, a model name and their key, entered in the sheet | From the visitor's browser straight to that service. |
| Claude, provided by the site | GitHub sign-in | To your function, which adds your key and forwards to Anthropic. |

A fourth route needs none of this: visitors can connect their own assistant through the [MCP server](../mcp.md).

The Studio picks, in order: an adapter the page connected, the visitor's own key, the site's Claude (when it is on, the visitor is signed in and has requests left), then the matcher. **Decide for me** works with every reader; with the matcher it uses fixed rules.

The model only proposes a [ConstellationSpec](../constellation-spec.md). The Rust engine validates it and draws. See [AI architecture](AI-ARCHITECTURE.md).

## Turn it on

The function ships in `auth/netlify/functions/describe.mjs`, next to the sign-in exchange, at `/api/describe`.

1. In the Netlify site's environment variables, add `ANTHROPIC_API_KEY`. Put it nowhere else: not in the repository, a workflow, `netlify.toml` or page code.
2. `STUDIO_ORIGIN` is already set for sign-in; the function answers only that origin.
3. Deploy. `netlify.toml` installs the function's one dependency (`@netlify/blobs`, for the daily count) from `auth/netlify/package.json`.
4. `index.html` already points the Studio at the function with `<meta name="constellation-ai">`. A fork changes this to its own address or removes it.

| Variable | Meaning | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Your key. Missing means off. | none |
| `CONSTELLATION_AI` | `off` switches the feature off and keeps the key. | on |
| `CONSTELLATION_AI_DAILY_LIMIT` | Skies per GitHub user per UTC day. `0` is off. | 10 |
| `CONSTELLATION_AI_MODEL` | Model id. Required with `openai`. | `claude-haiku-5-5` |
| `CONSTELLATION_AI_PROVIDER` | `anthropic`, or `openai` for any service that speaks the chat-completions format. | `anthropic` |
| `CONSTELLATION_AI_BASE_URL` | With `openai`: the service's base address, https only, for example `https://openrouter.ai/api/v1`. | none |
| `CONSTELLATION_AI_API_KEY` | With `openai`: that service's key. | none |
| `CONSTELLATION_AI_LABEL` | What the Studio calls the reader ("Read by …"). | `Claude`, or the model id |

Set a spending limit on the key in the Anthropic Console as well. The daily count limits each user, not the number of users.

## Use another model for the site's reader

Set `CONSTELLATION_AI_PROVIDER=openai` with the address, key and model of any service that speaks the chat-completions format. The function calls it server to server, so a service that refuses calls from web pages still works here. Sign-in, the daily limit, the fixed prompt and tools, and the off switch behave exactly the same.

- The Studio asks the function which format it speaks and what to call the reader, so no Studio change or deploy is needed.
- A provider that is not fully configured (no address, key or model, an http address, or an unknown provider name) reports itself off. It never falls back to a different provider.
- No output limit is sent with `openai`, because services disagree on its name. Use a model and an account limit you are comfortable with.
- The model must support tool calls.

## Switch it off

Set `CONSTELLATION_AI=off`, or remove `ANTHROPIC_API_KEY`. No deploy of the Studio is needed.

Off is a normal state, not an error:

- `GET /api/describe` answers `200 { "available": false }`.
- The Studio stops offering the site's Claude. The sheet shows the matcher as the reader and, under **Who reads this, and other ways**, offers the visitor's own key and connecting their own assistant.
- If it is switched off between the check and a request, the visitor reads one sentence ("Claude isn't available here right now. Nothing was changed.") and the next try uses the matcher.
- A key Anthropic rejects, or a store that cannot count, is treated the same way: the function reports itself off rather than failing or running without a limit.

## What the function allows

- Only requests from `STUDIO_ORIGIN`, with a GitHub token that `api.github.com/user` accepts. The token proves who is asking; it is not forwarded to Anthropic or stored.
- Only a conversation. The model, system prompt, tool list and output size are fixed on the server, so the endpoint cannot be used as a general proxy. Messages may contain text, the model's own blocks, calls to the published tools and their results; anything else is refused.
- Ten skies a day per GitHub user by default. A sky is one description (up to a dozen short model turns). The count is kept in Netlify Blobs under the user's numeric id and the date, nothing else. It is checked before the model is called. Two requests arriving at the same instant can both pass a check, so treat the limit as close, not exact; the turn cap and Netlify's own rate limit (60 requests a minute per address) bound the overshoot.
- Responses carry only the model's turn and the requests left. No usage, ids or upstream errors are passed on.

## What is sent to Anthropic

The visitor's description, and the tool results the model asks for: repository names, descriptions, languages, topics, stars, dates, and whether a repository is archived or a fork. All of it is public GitHub data. The sheet says this before the visitor uses Claude. No token, email or private repository is sent.

## The visitor's own key

A pasted key is held in memory for that tab and sent only to `api.anthropic.com`. It is not written to storage, the address, a design, an export or a log, and it is gone on reload. The browser calls Anthropic directly using the header Anthropic requires for that. A key in a browser is visible to that browser's own extensions and to anyone using the unlocked computer; the sheet says the key stays in the tab and that usage is billed to its owner.

## Not verified here

The function and the Studio are covered by tests with stand-ins for GitHub, Anthropic and the store. A live deployment was not exercised when this was written: after setting the key, open the Studio, sign in, and run **Decide for me** once.
