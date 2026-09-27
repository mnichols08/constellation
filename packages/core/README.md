# Core API

`@constellation/core` is an ESM package for Node 22+ and browsers with WebAssembly. It includes its WASM binary and has no runtime npm dependencies. Build it with `npm run build:core`, then run `npm pack ./packages/core`. The package works without the CLI, GitHub Action, studio, or Rust toolchain. The generated package is committed so the Action needs no install step. Edit `src/`, then rebuild the package.

```js
import { renderConstellation, validateConfig, explainFilters } from '@constellation/core';
const result = validateConfig({ maxRepos: 45, layoutRefinement: { enabled: true, intensity: 5 } });
if (!result.valid) throw new Error(JSON.stringify(result.errors));
const svg = renderConstellation('octocat', repositories, result.config.options);
const explanation = explainFilters(repositories, result.config.options);
```

`renderConstellation(account, repositories, options, { onDiagnostic }?)` returns SVG text. Supply public repository metadata (`name`, `full_name`, `language`, optional `languages`, `topics`, star counts and dates). For reproducible temporal layouts, provide `referenceDate`. The diagnostic callback receives `{ code, node, reason }` for omitted labels.

`validateConfig(objectOrJSON)` returns `{ valid, errors, config? }`. Errors contain `path` and `message`; valid configs contain `account`, `version` and normalized `options`. `parseConfig`, `serializeConfig`, and `normalizeConfig` retain the existing JSON preset format.

`explainFilters(repositories, options)` returns counts (`loaded`, `pool`, `included`, `rendered`, `omittedByGraphLimit`) and node ID lists (`excludedBeforeCategories`, `excludedByCategories`, `hidden`). The studio uses the same counts. Selection applies metadata filters and the project limit before language/topic filters.

`graphNodes`, `selectRepositories`, and `selectRepositoryPool` expose the existing projection and filtering steps. `rustAvailable` and `engineError` describe WASM initialization. GitHub acquisition helpers remain available separately from rendering through `fetchRepositories` and `fetchRepositoryLanguages`.

CLI: `node src/cli.mjs validate --config settings.json` validates without fetching GitHub. Generation accepts `--dry-run` (compute without writing SVG, cache or Action outputs) and `--explain` (print the filter report as JSON). Use `--fixture repositories.json` for offline runs.
