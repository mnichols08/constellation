# ADR-0009: Tech stack view, locked behind the viewer's own GitHub sign-in

- Status: Accepted
- Date: 2026-11-05
- Owners: Mikey Nichols
- Related: [ADR-0008](ADR-0008-STUDIO-REBUILD.md), [GitHub sign-in](../../github-oauth.md), [Tech stack maps](../../tech-stack.md)

## Context

REST repository metadata supplies languages and topics, so existing technology maps can show "JavaScript" but not "React". Naming frameworks means reading a manifest from each repository. That is one or more requests per repository, which an anonymous visitor's limit of 60 requests an hour can't pay for, and which a shared proxy must not pay for ([GitHub sign-in](../../github-oauth.md) forbids one).

## Decision

Add a Tech stack sheet to the Studio that only a signed-in viewer can use. It scans an organization, or any account including the viewer's own, using the viewer's token and request limit. The rest of the Studio stays open to anonymous visitors.

The gate is enforced in the Studio engine: `engine.scanTechStack` throws before any request when there is no session or local token. The button only explains the gate.

## Why this layer?

- **Rust** owns which technologies link and where stars sit (`tech_stack_layout`), as it owns other spatial and graph work. It validates and bounds its input and gives the same output for the same input.
- **JavaScript** owns GitHub networking, orchestration and manifest reading (`src/tech-stack/`). Manifest reading stays here because it is lookup tables over text in a module the CLI and Studio share, and Rust would add a build cost without improving correctness.
- **The Studio sheet** owns presentation. A shadow root keeps the map's styles from reaching the Studio map behind it.

## Alternatives considered

- **Require sign-in for the whole Studio.** Rejected: it ends anonymous public exploration, which the docs and tests promise, for a cost only this view has.
- **A layout card in the existing gallery.** Rejected: a card implies a change to the current design, but this view reads different data and shouldn't enter designs, drafts or share links.
- **A paste-your-token field on the hosted site.** Rejected: GitHub sign-in already gives a short-lived, read-only token without asking people to handle a secret. The local-only token form is unchanged.
- **Authoring the layout in JavaScript.** Rejected: `AGENTS.md` assigns layout to Rust. Existing organization layouts in JavaScript are older than this decision and unchanged.

## Consequences

### Positive
- Maps name real frameworks and show which are declared together, for any account.
- A viewer's scan spends only their own request limit.

### Negative / tradeoffs
- A large organization takes several minutes: 1,521 repositories took about eight, because GitHub times out on large pages and listing is sequential.
- The technology list is hand-curated, so libraries outside it aren't shown. The page says so.
- Counts show what manifests declare, not what is used. The page says so.

## Compatibility

- Config/schema impact: none. Results never enter options, drafts or share links.
- Core API impact: additive (`scanTechStack`, `githubTransport`, `techStackQuery`, `techStackModel`, `createTechStackScene`, `renderTechStackHTML`). The CLI gains `--tech-stack`.
- Web Component impact: none.
- Migration strategy: none needed.

## Security / trust impact

- **Tokens** stay in the session's page memory, or in the local server for local previews. They never reach scans, scenes or pages. `session.fetch` confines them to `https://api.github.com`.
- **Private data:** queries ask for `privacy:PUBLIC` and results filter `isPrivate` again, because a personal token can often read more than a GitHub App token can.
- **Untrusted input:** repository names, paths and manifest text. Queries come only from `techStackQuery`, which validates each field and quotes every string, and the local server route uses it too, so it can't forward arbitrary GraphQL. Manifests are parsed as data and never executed, and their text is discarded once read.
- **Limits:** repositories, requests, page size, folders, manifest count and size, batch size and concurrency are all bounded, retries are capped, and every scan can be cancelled. Closing the sheet cancels it. Signing out clears the result.
- **Claims:** evidence is not evaluation. The page says counts don't measure quality.

## Testing strategy

Rust unit tests cover determinism, bounds, real co-occurrence counts and invalid input. `test/tech-stack.test.mjs` covers classification, the query builder, paging, limits, cancellation, the sign-in gate and token confinement. `test/preview-server.test.mjs` covers the local route. `e2e/tech-stack.spec.mjs` covers the gate, scan, map, tables, cancel, rate limit and sign-out on every viewport, with an axe check.

## Rollback strategy

Remove the Layout panel section and the `tech-stack` dialog registration. Nothing is persisted, so no data needs migrating.
