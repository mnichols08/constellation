# Documentation

Start here, then open the guide for the task you have. Most pages are reference guides; you do not need to read them in order.

## Use Constellation

| I want to… | Read |
| --- | --- |
| Publish a graphic in my profile README | [Daily profile graphic](#publish-a-profile-graphic) |
| Set up the Studio or return to a saved design | [Guided setup](guided-setup.md) |
| Understand what a README map communicates | [README Showcase](readme-showcase.md) |
| Explore an organization | [Organization maps](organizations.md) |
| Explore projects over time or by language/topic | [Universe dimensions](temporal-stack.md) |
| See commit history or recent activity | [History and activity](history.md) |
| Find settings, presets, exports, or share links | [Designs and configuration](designs.md) |
| Make the map accessible | [Accessibility](accessibility.md) |

### Publish a profile graphic

1. Open the [Studio](https://mnichols08.github.io/constellation/) and select **Continue with GitHub** or **Explore a public account**.
2. Choose projects and a design. In **Save**, open **Daily GitHub workflow** and enter the repository that will run the workflow, usually `YOUR_USERNAME/YOUR_USERNAME`.
3. Add the generated workflow at `.github/workflows/constellation.yml` on the repository's default branch. It needs `contents: write` permission to publish the image to the `output` branch.
4. Run **Actions → Daily constellation → Run workflow**, then copy the README snippet from the run summary.

GitHub provides the workflow token automatically. To refresh the image manually, run the workflow again. For a one-time image, download an SVG from the Studio and commit it yourself. See [GitHub OAuth](github-oauth.md) only if you operate a hosted Studio and need to configure sign-in.

## Build or embed

| I want to… | Read |
| --- | --- |
| Embed a custom element in a web page | [Web component](web-component.md) |
| Export an interactive, offline HTML file | [Interactive HTML](interactive-html.md) |
| Render or validate data from JavaScript/Node | [Core API](core-api.md) |
| Load JSON sources or transform data | [Data pipeline](data-pipeline.md) |
| Add a theme, layout, or extension | [Extension authoring](extension-authoring.md) |
| Understand scene structure and rendering | [Scene API](scene-api.md) · [Renderer API](renderer-api.md) · [Layout API](layout-api.md) |

## Understand the project

| Topic | Read |
| --- | --- |
| System overview and ownership boundaries | [Architecture](architecture.md) · [Rust/WASM boundary](architecture/RUST-WASM-BOUNDARY.md) |
| Evidence, security, and privacy | [Security model](security-model.md) · [Security and trust](engineering/SECURITY-AND-TRUST.md) |
| Tests and quality checks | [Testing and quality](engineering/TESTING-AND-QUALITY.md) |
| Performance limits | [Performance budgets](engineering/PERFORMANCE-BUDGETS.md) |
| AI-assisted interpretation | [AI specification](ai/AI-CONSTELLATION-SPEC.md) · [Implementation playbook](ai/AI-IMPLEMENTATION-PLAYBOOK.md) |
| Planned work | [Roadmap](ROADMAP.md) |

## More guides

[Timeline](timeline.md) · [Hierarchical scenes](hierarchical-scenes.md) · [Story mode](story-mode.md) · [Semantic Studio](semantic-studio.md) · [Layers](layers.md) · [Plugins](plugins.md) · [Scaling](scaling.md) · [GitHub data cache](github-data-cache.md) · [Migration from v2](migration-v2.md) · [Design examples](readme-showcase.md)

## GitHub data and privacy

Public exploration makes bounded requests from your browser to GitHub and can work without sign-in. Signing in enables additional authenticated data. A local `GH_TOKEN` is used only by the local development server or CLI; do not put tokens in configs, share links, or exported graphics. Customizing a loaded design does not make additional GitHub requests. Details and limits are described in the [security model](security-model.md), [GitHub cache guide](github-data-cache.md), and [GitHub OAuth guide](github-oauth.md).
