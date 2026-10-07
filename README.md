# Constellation

Turn GitHub project data into an interactive map, an embeddable experience, or a graphic for your profile README.

[Open the Studio](https://mnichols08.github.io/constellation/) · [Browse examples](examples/README.md) · [Documentation](docs/README.md)

![Example GitHub constellation](./dist/constellation.svg)

## Get started

### Make a profile graphic

1. Open the [Constellation Studio](https://mnichols08.github.io/constellation/) and explore a public account or sign in with GitHub.
2. Choose projects and a visual style, then open **Save → Daily GitHub workflow**.
3. Add the workflow to your profile repository (`YOUR_USERNAME/YOUR_USERNAME`) and run **Actions → Daily constellation → Run workflow**.
4. Copy the README snippet from the workflow summary.

The workflow publishes `constellation.svg` to an `output` branch. GitHub supplies its token automatically; you do not need to create a personal access token. For setup details and troubleshooting, see [Daily profile graphic](docs/README.md#publish-a-profile-graphic).

### Download a one-time graphic

In the Studio, choose **Download SVG** or **Download PNG**. No workflow is needed. A downloaded SVG is static and can be committed to any repository.

### Use the command line

Requires Node.js 22 or newer.

```sh
npm install
node src/cli.mjs --username YOUR_USERNAME --output constellation.svg
```

Pass `--config settings.json` to use a saved configuration. See the [CLI and configuration guide](docs/designs.md) for options, fixtures, validation, and migration.

## What the map means

Constellation visualizes repository metadata such as languages, topics, stars, and dates. You choose which projects to include and what they represent. A visual arrangement or score is not an assessment of skill or professional ability. Read about the evidence and limits of each view in the [README Showcase guide](docs/readme-showcase.md) and [Developer Topology guide](docs/developer-topology.md).

Public exploration works without signing in and uses limited public GitHub data. Sign-in enables additional account data such as pins and full language breakdowns. See [GitHub data and privacy](docs/README.md#github-data-and-privacy).

## Explore and share

- **Studio:** curate projects, filter views, save named designs, and export SVG, PNG, config, or a share link.
- **README Showcase:** assign project roles and choose a compact presentation for your profile. [Guide](docs/readme-showcase.md)
- **Universe:** compare projects by year, language, repository, or topic. [Guide](docs/temporal-stack.md)
- **Organization maps:** explore public organization repositories and collaboration data. [Guide](docs/organizations.md)
- **History and activity:** view repository commits or limited recent public activity. These are partial signals, not a complete contribution calendar. [History](docs/history.md)
- **Interactive exports:** use an offline HTML file or framework-free web component. [HTML](docs/interactive-html.md) · [Web component](docs/web-component.md)

## Run locally

```sh
npm install
npm run preview
```

Open <http://127.0.0.1:4173>. Public data works without a token. For authenticated local requests, create a `.env` file with `GH_TOKEN=...`; keep it private and out of Git. The hosted Studio does not need your token for public exploration.

## Develop

Constellation is framework-independent. JavaScript handles GitHub and browser APIs, Rust/WASM handles graph and layout computation, and HTML/CSS/SVG present the result. Rust/WASM is bundled; using the Studio or Action does not require a Rust toolchain.

```sh
npm test
```

When changing the Rust engine, build the WASM assets and core package as described in [Core development](docs/core-api.md). Before changing architecture or public contracts, read [the engineering contract](AGENTS.md) and [architecture guide](docs/architecture.md).

## Documentation

Use the [documentation map](docs/README.md) to find guides by task. The [changelog](CHANGELOG.md) records releases; [v3 migration](docs/migration-v3.md) covers older configurations and workflows.
