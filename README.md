# GitHub Constellation

Turn your public GitHub repositories into a small animated night sky for your README. Repositories form a spaced star field and connect through their detected languages or GitHub topics; larger stars represent repositories with more GitHub stars. Solid connections describe any shared language, including secondary HTML, CSS, and JavaScript; dotted bridges join the composition visually. Neither represents software dependencies.

![GitHub constellation](https://raw.githubusercontent.com/mnichols08/github-constellation/output/constellation.svg)

[Open the constellation studio](https://mnichols08.github.io/github-constellation/) to customize and download your own SVG, README snippet, and daily workflow.

## GitHub Pages

The studio is a static site with no build step. In your repository's **Settings → Pages**, choose **Deploy from a branch**, **main**, and **/ (root)**. The `.nojekyll` file serves the site directly, and relative asset paths support project sites. Changes pushed to `main` are published automatically. The hosted studio uses the public GitHub API without a token; `.env` is only for local generation and is excluded from Git.

## Compact profile variant

For a busy README, set `layout` to `compact` to generate a 900 × 280 card instead of the 900 × 560 atlas. The preview defaults to this compact format. A custom accessible `title` (up to 60 characters; not drawn on the image) and an optional `includeRepos` array of exact repository names let you make a personal selection; privacy, fork filtering, and `maxRepos` still apply. Selected repositories are ranked by stars within that set. Small maps (up to 18 projects) include short project labels with collision avoidance. Larger maps omit visible labels to keep the sky legible. Both layouts omit visible headers. Generated images show their generation time in UTC at the bottom left and the linked `mnichols08/github-constellation` credit at the bottom right. The timestamp records SVG creation, including local style edits using cached data; it does not claim the GitHub data was refreshed. Daily workflows stamp each new image at runtime. Style the timestamp with `.generated-at`.

Mikey’s charcoal/yellow and cream/olive variants are in [dist/mnichols08-dark.svg](dist/mnichols08-dark.svg) and [dist/mnichols08-light.svg](dist/mnichols08-light.svg). Run `npm run generate:profile` to regenerate both from one GitHub snapshot. See [the profile embed guide](profiles/README.md) for placement and a theme-aware `<picture>` snippet. With the preview server running, open [/profiles/preview.html](http://127.0.0.1:4173/profiles/preview.html) to see both at README width.

## Try your own account

Requires Node.js 22 or later. There are no runtime dependencies.

```sh
npm run preview
```

Open http://127.0.0.1:4173 to explore the sample sky, then enter a GitHub username or profile URL. Customize the appearance, project limit, animation, and fork inclusion without fetching again. Download the matching SVG and copy a README snippet. Set the repository that will run the workflow, then copy its README snippet. The snippet loads `constellation.svg` directly from that repository’s `output` branch; run the workflow once to create it. The sample contains fictional projects and is labeled as a demo. The preview uses public GitHub API requests in your browser, without a token. Full language breakdowns require one additional API request per displayed repository. The controller retains account lists and language data in this tab, including across reloads when browser storage is available. Customization never makes GitHub requests. Increasing the project pool shows a **Load data** button for missing languages and keeps the previous image and exports until you click it. Submitting a previously loaded account reuses saved data; **Refresh data from GitHub** explicitly fetches a fresh snapshot. Successful lookups survive partial failures so retries only request missing data. GitHub rate limits may temporarily prevent lookups; failed lookups retain the previous map rather than silently using incomplete language data. Set `PORT` to use a different local port.

```sh
npm run generate -- --username mnichols08
npm run generate -- --username octocat --config constellation.config.json --output dist/octocat.svg
npm test
```

Set `GITHUB_TOKEN` in your environment for authenticated API requests. Never place a token in the preview page or commit one. Only public repositories are rendered. Repositories are fetched with pagination (up to 10,000), then the top 45 by stars are displayed by default. Forks are included; starred repositories belonging to others and gists are not part of this first version.

## Create a token for local generation

A personal access token authenticates local generator requests when public API limits get in the way. The browser preview does not use it. The daily workflow already uses GitHub’s automatic `GITHUB_TOKEN`, so it needs no personal token. [GitHub workflow authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

1. Open [Create a fine-grained personal access token](https://github.com/settings/personal-access-tokens/new). You can also find it under your account’s **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Name it **GitHub Constellation**, choose an expiration (for example, 30 days), and select your own account as the resource owner.
3. For repository access, choose **Public repositories**. Leave additional permissions unset: this generator reads public repository metadata and language information; it needs no write access or private-repository access. [GitHub’s token guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token), [language endpoint permissions](https://docs.github.com/en/rest/repos/repos#list-repository-languages).
4. Generate the token and copy it into a local `.env` file at the project root, replacing the placeholder below:

```dotenv
GH_TOKEN=YOUR_TOKEN_HERE
```

Keep `.env` out of Git; this project already ignores it. Do not paste the token into the controller, CSS, README, or workflow YAML. To replace an expired token, generate a new one and update the same `.env` entry. Revoke any exposed token in GitHub’s token settings.

For local authenticated testing, the generators accept `GITHUB_TOKEN`, `GH_TOKEN`, or `gh_token` (in that order). If the token is in your ignored `.env`, load it explicitly:

```sh
node --env-file=.env src/cli.mjs --username YOUR_USERNAME --config constellation.config.json
node --env-file=.env scripts/generate-profile.mjs
```

The browser preview remains token-free; `.env` is not served by the preview server or included in exported workflows.

The first command generates your account’s map; the second generates this project’s prepared `mnichols08` profile variants. Replace `YOUR_USERNAME` with your GitHub username.

## Daily README workflow

The controller includes **Visual styles** with separate light/dark color pickers and sliders for line weight, line visibility, glow, background stars, and label size, plus optional **Advanced CSS overrides** and a live **Your daily workflow** output. Adjust the image, then copy or download `constellation.yml` into `.github/workflows/` in your README repository. Every controller setting and the exact CSS are embedded through the action’s `config-json` input; no separate CSS or JSON file is required. The sample workflow uses the repository owner, while a loaded account exports that username. Run **Daily constellation** manually once from the Actions tab. This export requires the version of the action containing `config-json` to be published; copying a workflow does not publish local action changes.

`config-json` and `config` are alternatives; supplying both fails explicitly. Inline configuration supports `css`, while `cssFile` remains available for file-based configuration. Custom CSS is passed as data, not shell code; literal dollar signs are JSON-escaped in the YAML so CSS cannot turn into GitHub workflow expressions.

Each image contains a small **mnichols08/github-constellation** credit with a link for standalone SVG viewing. Since README images do not expose internal SVG links, the controller’s README snippet links the whole image to its file on the caller repository’s output branch and includes separate project and creator-credit links. CSS is embedded in the SVG because [SVG image mode does not load external stylesheets or fonts](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image).

Add this to `.github/workflows/constellation.yml` in your profile repository (or any repository containing your README):

```yaml
name: GitHub constellation
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
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
      - uses: mnichols08/github-constellation@main
        with:
          username: ${{ github.repository_owner }}
          token: ${{ secrets.GITHUB_TOKEN }}
          output: constellation.svg
          publish: 'true'
          output-branch: output
          # config: constellation.config.json
```

Run the workflow once, then embed the image. Replace `OWNER/REPOSITORY` with the repository **running the workflow**, which can differ from the account being rendered:

```md
[![My GitHub constellation](https://raw.githubusercontent.com/OWNER/REPOSITORY/output/constellation.svg)](https://github.com/OWNER/REPOSITORY/blob/output/constellation.svg)

Made with [GitHub Constellation](https://github.com/mnichols08/github-constellation) by [@mnichols08](https://github.com/mnichols08).
```

With `publish: 'true'`, the action creates the `output` branch if needed and commits only the generated SVG at its root. Existing files, including Metrics images, are preserved. It uses the caller checkout’s `origin` and credentials, so publication goes to the repository running the workflow. Keep the checkout step and `contents: write` permission. There is no need to pre-create the branch or add a separate commit step. If you have an older exported workflow, replace it with a new export and remove its old “Save constellation” step.

`output` sets the generated file path (default `constellation.svg`); its filename is used at the root of `output-branch` (default `output`). `publish` defaults to `'false'` for generation-only use; the studio’s exported workflow enables it. The local CLI still defaults to `dist/constellation.svg`. The studio’s repository field affects copied image links, not the workflow’s publication destination. A public repository is needed for a publicly readable raw image.

The included workflow uses `./` to run this action within its own repository. Run it manually once after pushing. Scheduled workflows run from the default branch, use UTC, and can be delayed by GitHub. Branch rules must allow writes to `output`. Publication never force-pushes and retries against the latest branch if another workflow updates it. Unchanged images are not committed. `@main` works for initial development; pin a reviewed commit or use a release tag for a fixed version.

## Customize

Copy `constellation.config.json` into the repository running the workflow, then provide its path using the action's `config` input:

```json
{
  "theme": "midnight",
  "animate": true,
  "maxRepos": 45,
  "includeForks": true,
  "colors": {
    "background": "#080e20",
    "foreground": "#e6edff",
    "accent": "#9ab9ff",
    "line": "#3e537e",
    "star": "#f6d99b"
  },
  "cssFile": "constellation.css"
}
```

Themes: `auto` (default), `midnight`, and `light`. The controller and adaptive SVG follow the viewer’s color-scheme preference without a toggle. Visual controls generate CSS for both palettes; custom overrides are appended last. See [embedded SVG color-scheme behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme#embedded_elements). Colors accept 3 or 6 digit hex values. `maxRepos` accepts 1–100. Set `animate` to `false` for a static image. `cssFile` is optional, resolved relative to the JSON file, and embedded in the SVG. Use trusted local CSS. Example:

```css
.connections { opacity: .35; }
.star { animation-duration: 9s; }
.credit { font-family: monospace; }
```

Classes include `.background`, `.credit`, `.dust`, `.connections`, `.repository`, `.star`, `.repo-label`, and `.language`. Custom CSS can also be supplied as a `css` string. Avoid external fonts, scripts, and remote resources: README SVGs are rendered in image mode. The default CSS respects reduced-motion preferences. Individual repository labels appear for maps of 18 repositories or fewer; larger maps retain SVG descriptions.

## Design and limits

Positions are deterministic for the same account and repository data. The workflow refreshes data daily while CSS animates the saved SVG whenever it is displayed. No server or browser is required for generation. The CLI and daily action fetch full language breakdowns only for displayed repositories, with at most three concurrent requests. Language failures stop generation before replacing the previous output. Offline fixtures may include a `languages` object mapping names to byte counts; older fixtures without it use their primary language only. An empty account produces an explicit empty state; API failures fail the workflow without replacing the previous image. The README image cannot accept usernames or expose interactive repository links; use the separate preview for account entry.

Stars use a deterministic, account-seeded layout across the full card. Curved links avoid the long fans caused by narrow language columns. A short spanning forest of genuine relationships is emphasized; the remaining selected links stay visible at lower opacity. The visual controller includes a secondary-connection opacity slider. Connections compare the complete language sets from [GitHub’s repository languages endpoint](https://docs.github.com/en/rest/repos/repos#list-repository-languages), including any language with a positive byte count. Each repository appears once. `connectionDensity: "balanced"` selects the four strongest overlaps per repository, preferring cross-group links for equal overlap; edges are deduplicated. `connectionDensity: "all"` draws every pair that shares at least one detected language. The controller offers both modes and exports the selected mode in the workflow. Optional dotted decorative bridges are off by default (`bridges: false`) and never imply a technical relationship. Soft glow, background dust, and chart guides give the exported SVG depth without external assets.

The static preview can be hosted from this repository root; it consists of `index.html`, `src/preview.css`, and the browser modules `src/preview.mjs`, `src/constellation.mjs`, `src/export.mjs`, and `src/visual-style.mjs`. Hosting is not configured automatically.

## References

- [GitHub composite actions](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action)
- [GitHub repository API](https://docs.github.com/en/rest/repos/repos#list-repositories-for-a-user)
- [SVG image capabilities and restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
- [Scheduled GitHub workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Choose your graph

Use the language and topic chips above the preview to select any number of categories. **All** means no filter for that row; **None** intentionally produces an empty selection. Projects match any selected value within each row, and must match both rows when both are filtered. **Include Other** is off by default; Other means no detected language, not simply a missing primary-language field.

Filters apply within the ranked **project pool** set by the project limit, fork setting, and optional `includeRepos`. Increase the limit to explore more repositories. Full language data is fetched for that pool before filtering so secondary languages are not missed. Topic names come directly from GitHub repository topics; descriptions are never used to guess topics.

The export carries `languages` and `topics` (arrays, or `null` for all), `showOther`, and `connectionBasis` (`languages`, `topics`, or `both`). Connections use only the selected categories. Every selected relationship stays in the all-connections SVG even when styled faintly. The daily action uses exactly the same pool, filtering, and connection logic.
