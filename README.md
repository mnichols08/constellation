# GitHub Constellation

Create a constellation of your public GitHub projects and keep it updated in your README.

Explore [History & Evolution](docs/designs.md#history--evolution): contribution orbits, language eras, stellar ages, open-source galaxies, and animated growth. See the [showcase gallery](examples/README.md#history--evolution).

Use **Nodes → Refine layout** for optional overlap reduction (intensity 0–10). Manual and hidden pairs stay fixed. Tab to studio nodes and press Enter or Space to select them; Shift-select traces a path. The filter summary reports omitted labels and their reasons.

Refinement defaults to off; enabling it does not guarantee collision-free labels. **Lock positions** controls dragging. Saved manual placements stay protected regardless of that switch.

The [standalone core API](docs/core-api.md) includes rendering, validation and filter reports. Run `node src/cli.mjs validate --config settings.json` to check a config; use `--dry-run --explain` with generation flags to inspect filtering without writing an SVG.

![Example GitHub constellation](./dist/constellation.svg)

The default setup needs no personal access token, fork, or config file. **Live pinned-repository previews require a personal access token and the local studio.** Daily workflows—including pinned constellations—use GitHub's automatic token. Use the defaults below or [customize your constellation in the studio](https://mnichols08.github.io/constellation/).

## Quick start

1. Open your public profile repository, `YOUR_USERNAME/YOUR_USERNAME`. If it does not exist, [create a public repository](https://github.com/new) named exactly like your username and initialize it with a README.
2. Add `.github/workflows/constellation.yml` on its default branch:

```yaml
name: Daily constellation
on:
  workflow_dispatch:
  schedule:
    - cron: '17 6 * * *'
permissions:
  contents: write
concurrency:
  group: constellation-output
  cancel-in-progress: false
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mnichols08/constellation@v1
        with:
          publish: 'true'
```

3. Open **Actions → Daily constellation → Run workflow**. Once it succeeds, copy the README snippet from the run summary into your profile README. Or use this, replacing both occurrences of `YOUR_USERNAME`:

```md
[![My GitHub constellation](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_USERNAME/output/constellation.svg)](https://github.com/mnichols08/constellation)
```

The image updates daily without changing your README. The workflow uses the repository owner as the GitHub username and preserves other files on the `output` branch, including Metrics images.

## Set up

1. Open the [constellation studio](https://mnichols08.github.io/constellation/), enter your GitHub username, and click **Load GitHub**.
2. Choose your projects, languages, topics, layout, and colors. Use **Advanced CSS overrides** for custom styling. Light and dark palettes are included automatically.
3. Under **Save → Daily GitHub workflow**, enter the **Repository running this workflow**, such as `mnichols08/mnichols08` for a profile README. Use a public repository so everyone can view the image.
4. Click **Add to my GitHub profile** to open GitHub with the workflow and your settings already filled in. Commit it to the default branch. If you already have the workflow, replace its contents using **Copy workflow**. **Download workflow** is also available; save it as `.github/workflows/constellation.yml`.
5. In that repository, open **Actions → Daily constellation → Run workflow**. The workflow creates an `output` branch and saves `constellation.svg` at its root. Existing files on that branch are preserved.
6. In the studio, click **Copy README snippet**, paste it into your README, and commit the change.

GitHub supplies `GITHUB_TOKEN` automatically; you do not need to create a personal token. Keep the workflow's `contents: write` permission, and ensure repository rules allow Actions to write to `output`.

## Action inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `username` | Repository owner | GitHub username or profile URL to visualize. |
| `token` | `${{ github.token }}` | Token for public API requests and profile pins; Actions supplies it automatically. |
| `publish` | `'false'` | Set to `'true'` to commit the image to the output branch. Requires checkout and `contents: write`. |
| `output` | `constellation.svg` | Generated SVG path in the workspace. Publishing uses its filename at the branch root. |
| `output-branch` | `output` | Destination branch; unrelated files are preserved. |
| `config` | Empty | Path to a JSON configuration file in the checked-out repository. |
| `config-json` | Empty | Inline JSON settings from the studio; use instead of `config`. |

The `svg` output contains the generated workspace path. Use an Ubuntu runner for the documented setup. The action installs Node.js 22 automatically.

## Troubleshooting

- **No Run workflow button:** commit the workflow to your repository's default branch and enable Actions for the repository.
- **Publishing is denied:** keep `permissions: contents: write` and check that repository or organization rules permit Actions to push to the output branch.
- **The README image is missing:** run the workflow successfully once, confirm the repository is public, and check that the image URL names the repository running the workflow.
- **The installation button is unavailable:** enter a valid `owner/repository`. Very large CSS settings require copying or downloading the workflow instead of opening a prefilled link.

## Embed the image

The studio generates this snippet for you. If adding it manually, replace `OWNER/REPOSITORY` with the repository **running the workflow**:

```md
[![GitHub constellation](https://raw.githubusercontent.com/OWNER/REPOSITORY/output/constellation.svg)](https://github.com/mnichols08/constellation)

Made with [GitHub Constellation](https://github.com/mnichols08/constellation) by [@mnichols08](https://github.com/mnichols08).
```

The image updates daily. Clicking it takes viewers to this project's GitHub repository. You can also run the workflow manually at any time.

## Change your configuration

**Nodes → Refine layout** adds a static overlap-reduction pass, off by default. Set intensity from 0–10; manual and hidden node/label pairs stay fixed. Ring snapping constrains moves to ring points or movable-pair swaps; turn it off for free nudges. The setting `"layoutRefinement": { "enabled": true, "intensity": 5 }` works in the studio, config files, workflows and share links. See [layout refinement](docs/designs.md#refine-layout) for bounds and limitations.

The studio keeps the live design beside a compact inspector (above it on mobile). Choose **Look**, **Motion**, **Projects**, **Nodes**, or **Save** to reveal one group of controls at a time. Settings scroll independently of the preview. **Hide controls** gives the design the full workspace; click a node to open its editor. Language/topic filters are under **Projects**, and workflow setup is under **Save**.

Click **View full screen** to explore the original SVG at full resolution. Drag to pan, scroll or pinch to zoom, or use the zoom buttons. **Fit** centers the entire image; **100%** uses its exported dimensions. Double-click zooms in (Shift-double-click zooms out). Arrow keys pan, `+` / `−` zoom, `0` fits, and `1` restores 100%. **Close** or Escape returns to the studio without changing the design. If browser fullscreen is unavailable, the viewer fills the browser window.

Start with a theme in **Look**, or use **Randomize design** to vary visual settings, filters, activity and history layers. **Include motion → Animation parts** controls which layers may animate, including each ring independently. Save the resulting `v5:…` code to replay the choices; `v1`–`v4` codes still work. Export JSON to retain later manual edits. See the [randomizer guide](docs/designs.md#randomize-then-return-to-a-design).

**Recent activity** adds Glow, Pulse, Comet trails, or Ripple to repositories with recent public GitHub events. The daily workflow refreshes the image, so active projects brighten and older activity fades. Node size, colors and placement keep their existing meaning. Choose a 24-hour, 7-day, 30-day or automatic window; reduced motion retains a static halo, trail or ring. Activity is off by default.

[Try the Active Developer example](examples/active-developer.json), or add `"activityEffect": "comet", "activityWindow": "7d"` to your config. Public events are fetched once per account load/refresh, never while customizing. Fetch failures produce a diagnostic and still generate the image. GitHub's [events API](https://docs.github.com/en/rest/activity/events#list-public-events-for-a-user) can be delayed and has a limited history; this is a visual activity signal, not exact contribution tracking. See [activity settings and scoring](docs/designs.md#recent-public-activity).

**Background starfield** generates a layered Deep Space sky or a Milky Way band, with adjustable density, brightness, depth and subtle twinkle. Generate another background without moving projects, or reuse its saved seed. Background stars are decorative and never become graph nodes. Old configs and `v1:` designs keep classic dust; `v2:`–`v5:` designs include the generated starfield.

Map node size to stars, activity, age, language/topic counts, or category membership. Map glow to stars or activity, choose language/seeded/category colors, and weight connections by shared metadata. Manual node colors still override mappings. Try **Galaxy** for language clusters or **Solar System** for major repositories and their related nodes. Rings distribute points across all four rings before adding another point to a ring.

**Repository filters** adds minimum stars, archived status, recent updates, name matching and project sorting. **Config, presets & export** saves account-specific local drafts and named presets and imports/exports versioned JSON. Use **Share link** in the toolbar to copy a public URL with the current settings, manual positions, and custom CSS. Tokens and API caches are excluded. Links over 8,000 characters require a JSON download instead.

You can also pass settings directly in a link, for example `https://mnichols08.github.io/constellation/?user=octocat&preset=project-map&arrangement=galaxy&maxRepos=25`. For an organization, use `?organization=github&preset=organization-community`; add `user=USERNAME` to focus on that person. Links load current public data; download the SVG to share a fixed image. See [URL parameters and sharing](docs/designs.md#url-parameters-and-sharing).

Choose Profile README, Repository README, Compact, Hero or Transparent output profiles, then download SVG or a high-resolution static PNG. Optional shapes, compact legends and lightweight effects stay inside the SVG. Keyboard selection, arrow-key placement and reduced-motion support remain available.

See the [example designs](examples/README.md) and [design/config guide](docs/designs.md) for reproducible codes, mapping details, config compatibility, share-link limits, output sizes, and generating multiple images.

Adjust your settings in the studio, download a new workflow, replace `.github/workflows/constellation.yml`, and run it again. When upgrading an older workflow, replace the whole file to remove its old image-commit step.

Customization reuses saved project data. Click **Load data** when adding projects that have not been loaded, or **Refresh data from GitHub** when you want fresh data.

Use **Show node labels** beside the chart to turn labels on or off at any node count. Labels that cannot fit without overlapping are omitted. Your choice is included in the downloaded SVG and exported workflow.

**Nodes represent** switches between a combined chart and separate repository, language, and topic views. In repository view, connections use shared languages or topics. In language/topic view, each category is a node and connections mean that two categories appear in the same repository. Node size reflects the number of matching repositories. Click a category to see its repository links, or Shift-click another to trace a path. Topic nodes use GitHub repository topics, so `agile` or `good-first-issue` appears when a matching repository has that topic; issue labels are not fetched.

Existing filters and the project limit determine the underlying repository pool in every view. Category views show up to the 100 most represented categories, with the total shown in the filter summary. Categories with no shared repository remain isolated nodes. Their grouping and shared-repository connections are computed in Rust.

Under **Visual styles → Individual nodes**, choose a node and its color. Clicking a node in the chart also selects it in this control. Custom colors apply to that node and its glow in both light and dark mode; **Use palette color** removes the individual override. Colors stay with their node across filters, layouts, and views for the current account during the studio session. Exported workflows and SVGs include these colors and the selected node type. Configuration uses `nodeMode` (`combined`, `repositories`, `languages`, or `topics`) and `nodeColors`, keyed by `owner/repository`, `language:CSS`, or `topic:agile`, with six-digit hex values.

Each node and its label stay attached. **Lock positions** starts enabled and prevents either from moving. Unlock it to drag the node or its label: both move together, preserving the label's offset. Arrow keys move the focused pair, and Shift moves faster. Hidden labels follow their nodes too, and connections update while dragging. Manual placements may overlap.

Manual positions are shared across node views, and kept separately for each account, format, and arrangement during the current studio session. **Reset node & label positions** restores the automatic layout across node views for the current format and arrangement. SVG and workflow exports preserve node positions and relative `labelOffsets`, so labels follow their nodes when the graph changes. Existing configurations with absolute `labelPositions` remain supported. The position lock controls editing in the studio and is not exported.

The studio starts in **Repositories + languages + topics** view (`nodeMode: "combined"`). Repositories connect directly to their language and topic nodes in the same chart. All membership connections are retained. Language nodes have a solid outline; topic nodes have a dashed outline. Unlock positions to place JavaScript, TypeScript and HTML together, with Rust and C++ elsewhere. Moving a node or its label keeps the pair attached, and manual placements follow the node when switching views. The combined graph retains up to 100 repositories and the most represented categories within a 256-node limit; the filter summary reports omitted nodes.

Under **Visual styles → Individual nodes**, select any node to recolor it, turn off **Show label**, or turn off **Show node**. Hiding a node also hides its incident connections without rearranging the remaining nodes. Hidden nodes stay in the selector so they can be restored; **Show all nodes and labels for this account** resets visibility. The global **Show labels** setting must also be enabled. Automatic label placement may omit labels where space is tight. Category details still list their member repositories, including hidden ones. Visibility settings follow node IDs across views during the session and are included in SVG/workflow exports as `hiddenNodes` and `hiddenLabels` arrays (for example, `["language:JavaScript", "topic:agile"]`).


For a one-time image without Actions, click **Download SVG**, commit the file to your repository, and embed it with `[![GitHub constellation](./constellation.svg)](https://github.com/mnichols08/constellation)`.

## Preview locally

### Pinned repositories and required token setup

Choose **Project source → Pinned repositories** to build the graph from the public repositories pinned to a profile. Pins can belong to other owners; pinned gists and private repositories are excluded. All public pins are considered regardless of the project-limit slider, while fork, language, topic, and explicit repository filters still apply. Repository, language, and topic node views all work with pins. Click **Refresh data from GitHub** after changing your profile pins; daily workflows fetch the current pins on every run.

**You must create a personal access token to load live pins in the local studio or run pinned generation locally.** GitHub's [pinnedItems field](https://docs.github.com/en/graphql/reference/users) is accessed through its authenticated GraphQL API. The hosted studio can demonstrate sample pins and export a pinned workflow, but cannot load live pins without a local authenticated server.

1. Open [GitHub's fine-grained token creation form](https://github.com/settings/personal-access-tokens/new).
2. Give the token a name and expiration, choose your account as resource owner, and select **Public repositories**. Fine-grained tokens already include public repository read access; additional write permissions are unnecessary for loading pins. See [GitHub's GraphQL authentication guide](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql).
3. Create and copy the token. In the root of this local project, create or edit `.env`:

   ```dotenv
   GH_TOKEN=YOUR_TOKEN_HERE
   ```

4. Run `npm run preview`, open http://127.0.0.1:4173, choose **Pinned repositories**, and load your GitHub username. Restart the server after changing the token. Keep `.env` out of Git; the server keeps the token out of the browser and exports.
5. If the token expires or is revoked, replace it in `.env` and restart. Authentication failures keep the previous chart and exports rather than substituting all repositories.

For local CLI generation, add `"repoSource": "pinned"` to your JSON config and run:

```sh
node --env-file=.env src/cli.mjs --username YOUR_USERNAME --config constellation.config.json
```

**You do not need to create a personal token for the daily Actions workflow.** The exported workflow uses the action's default `${{ github.token }}` input. GitHub [creates this token automatically for each job](https://docs.github.com/en/actions/concepts/security/github_token). To configure pins without the studio, add this under the action step's `with` block:

```yaml
config-json: '{"repoSource":"pinned"}'
```

### Studio features

The studio uses the Workshop's charcoal, olive, and yellow palette. Click a star to reveal its connected projects and repository links. Shift-click another star (or Shift+Enter on a focused star) to trace the shortest path through the displayed connections. Escape or **Clear selection** clears the highlight. Visual bridges and decorative ring points are excluded from traversal. These interactions are available in the studio; README images remain ordinary SVGs.

**Arrangement** offers the original star field, **Identity orbits**, and **Connected clusters**. The cluster layout settles once, so there is no continuous physics loop. **Identity rings** adds a reproducible account signature behind the graph. The four rings use the account name as metadata, so changing filters does not change the signature. Arrangement, ring visibility, colors, and manual placements all survive SVG and workflow export.

With Node.js 22 or later, run `npm run preview` and open http://127.0.0.1:4173.

For authenticated local requests, add `GH_TOKEN=YOUR_TOKEN` to `.env` in this project, then restart the preview server. `GITHUB_TOKEN` and `gh_token` also work. The server loads `.env` automatically and keeps the token out of the browser. Without a token it uses public requests. The hosted static studio continues to use public requests.

Run `npm test` to verify changes. See [Releasing](.github/RELEASING.md) for version tags and Marketplace publishing.

## Rust engine

The graph physics, layout coordinates, shared-connection selection, spanning forest, shortest paths, and identity geometry run in Rust compiled to WebAssembly. The same checked-in module powers the browser and the Node.js daily action. JavaScript handles GitHub requests, filtering, SVG markup, label placement, editing, and DOM events; CSS handles animation and highlighting. Layout results are cached across style edits. Rust is not required to use the studio or action.

Source lives in `rust/constellation-core`. It incorporates Mikey Nichols's [graph engine](https://gist.github.com/mnichols08/4f0dc93973ae00cabf76baa56bd78a4c) and [identity generator](https://gist.github.com/mnichols08/e4a1080f19480abafa7f0249d16b0c3f); the palette follows [the Workshop](https://mnix.dev/lab).

To change the Rust engine, install Rust and the matching bindings tool, then rebuild the browser assets:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.128 --locked
npm run test:rust
npm run build:rust
npm test
```

Commit `Cargo.lock` and both files in `src/wasm` together with Rust changes. If WebAssembly cannot load in a browser, the original repository star field, individual colors, and direct-neighbor exploration remain available; the studio disables category nodes, Rust-only arrangements, and rings. This fallback does not provide pathfinding.

**Randomize node hues** assigns evenly spaced, randomly shuffled hues to every node in the current view, including hidden nodes. Click again for a new palette. **Color lines with nodes** blends each connection from one endpoint’s color to the other’s; turning the switch off restores the normal line palette without changing node colors. Individual recoloring updates connected lines too. The chosen colors and `colorConnections` switch are preserved in SVG and workflow exports.

**Snap nodes to ring points** is enabled by default. Unlock positions to move a node or its attached label to the nearest available ring point, regardless of distance. Occupied visible nodes swap places; hidden nodes reserve their points. Snapping applies during dragging and to arrow-key moves, even when ring decoration is hidden. Rust generates exactly one ring point per node, up to the graph’s 256-node limit: three nodes produce three points. Each point is associated with a node; hiding that node also hides its point while reserving its placement. Existing point coordinates stay stable as the graph grows, with new points added in the widest gaps. Snapping skips points where the attached label would cross the chart bounds. Arrow keys select the nearest available point in that direction. Turn snapping off for free placement. Turning snapping off keeps existing placements; node positions and the `snapToRings` preference are included in exports.

The default **On identity ring points** arrangement (`arrangement: "rings"`) places every node directly on its own ring point automatically. The assignment is deterministic for the same account and node set, and extra points accommodate larger graphs. Manual placements override automatic placement; resetting positions returns nodes to their assigned ring points. Star field, Identity orbits, and Connected clusters remain available as alternatives.

Use the four **Ring 1–4** sliders to rotate each ring’s points independently from 0° to 360°. In the default ring arrangement, nodes follow their points automatically. Manually snapped placements, attached labels, and connections move with their points too; freely positioned nodes retain their placements. The slider works independently of the drag lock. SVG and workflow exports preserve the `ringRotations` angles and updated manual placements.

The arrangement controls have four independent rotation sliders: **Ring 1 (inner)** through **Ring 4 (outer)**. Each slider shifts only its own ring’s points and attached nodes. Exports store `ringRotations` as four angles in inner-to-outer order. Older `ringRotation` configurations still rotate all four rings together.

Each ring slider moves its arc line together with its points. Connection paths and their color gradients remain attached to the moving node endpoints.

**Ring animation** has an **Animate rings** toggle, a 0–6 RPM speed slider, and a clockwise/counterclockwise direction selector for each ring. Zero RPM keeps that ring still. **Lock rings together** copies Ring 1’s speed and direction to all four rings while retaining their starting angular offsets. Ring arcs, points, attached nodes, labels, and connections animate together; freely positioned nodes stay put. Connections use straight animated lines so both endpoints can follow independently rotating rings. Animation uses native SVG animation, including in image exports, without a JavaScript frame loop. Viewers requesting reduced motion see the starting arrangement. Turn animation off to return to the starting arrangement and edit placements. Workflow exports preserve the `ringAnimation` settings.

The sidebar groups controls into collapsible sections. **Rings & motion** shows one selected ring at a time, with its starting angle, speed, direction, steady/eased timing, and **Spin** or **Sway** motion. Sway has an adjustable angular range. All prior controls remain available in the position, project, connection, and style sections.

**Floating nodes** animates nodes that are not attached to a ring point. Choose **Drift**, **Bob up and down**, or **Small orbit**, adjust movement and cycle duration, and animate them independently of the rings. Labels, connections, and gradients follow their endpoints; motion stays within the chart bounds. Pause both kinds of motion before editing placements. These settings export as `floatingAnimation`; ring motion also stores `modes`, `amplitudes`, and `easing`. Reduced-motion preferences retain a still view.

The studio now starts in **Full atlas** with a randomized hue for every node. Colors are assigned once as nodes enter the session and stay stable across other edits; **Randomize node hues** reshuffles them, and palette-reset controls still work.

**Perspective** adds a tilted view with side-to-side angle, viewing tilt, and scale controls. Enable **Animate perspective shifts** to adjust the shift amount and cycle duration. The shared view transform keeps rings, floating nodes, labels, and connections together; static tilted views still support accurate dragging and snapping. Pause motion to edit placements. Perspective settings and native SVG animation are preserved in exports, with a still view for reduced-motion preferences.

**Perspective → Follow your view** supports live pointer tilt on desktop and device tilt on supported phones/tablets. Click **Enable device tilt** to request sensor access, then hold the device comfortably to establish a neutral position; **Recenter device tilt** resets it. The device mode requires a secure context (HTTPS or localhost) and may request browser permission ([browser API requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)). CSS renders the 3D tilt; a small event-driven handler supplies its angles. Reduced-motion preferences pause tracking. Turn live tilt off to edit positions. Live tracking only affects the studio preview; exported SVGs retain their configured perspective and animation.

Selecting a node now updates **Download SVG**, the style preview, and the workflow to the same highlighted constellation. Shift-selecting a second node exports the highlighted path. Unrelated nodes remain dimmed, matching the interactive view; colors, perspective, and animation are preserved. **Clear selection** restores full-constellation exports. Workflows save `selection: { "start": "node-id", "end": "optional-node-id" }`; if the selected node disappears from later data, the full graph is shown instead.

## Organization universes

Load a GitHub organization automatically, or enter a username plus an organization to highlight shared projects and collaborators. Explore community, collaboration, technology and era views with bounded contributor scans and cached public data. See [organization setup, limits and data coverage](docs/organizations.md).
