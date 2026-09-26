# GitHub Constellation

Create a constellation of your public GitHub projects and keep it updated in your README.

![Example GitHub constellation](./dist/constellation.svg)

No personal access token, fork, or config file is needed. Use the defaults below or [customize your constellation in the studio](https://mnichols08.github.io/constellation/).

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

1. Open the [constellation studio](https://mnichols08.github.io/constellation/), enter your GitHub username, and click **Find my stars**.
2. Choose your projects, languages, topics, layout, and colors. Use **Advanced CSS overrides** for custom styling. Light and dark palettes are included automatically.
3. Under **Your daily workflow**, enter the **Repository running this workflow**, such as `mnichols08/mnichols08` for a profile README. Use a public repository so everyone can view the image.
4. Click **Add to my GitHub profile** to open GitHub with the workflow and your settings already filled in. Commit it to the default branch. If you already have the workflow, replace its contents using **Copy workflow**. **Download workflow** is also available; save it as `.github/workflows/constellation.yml`.
5. In that repository, open **Actions → Daily constellation → Run workflow**. The workflow creates an `output` branch and saves `constellation.svg` at its root. Existing files on that branch are preserved.
6. In the studio, click **Copy README snippet**, paste it into your README, and commit the change.

GitHub supplies `GITHUB_TOKEN` automatically; you do not need to create a personal token. Keep the workflow's `contents: write` permission, and ensure repository rules allow Actions to write to `output`.

## Action inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `username` | Repository owner | GitHub username or profile URL to visualize. |
| `token` | `${{ github.token }}` | Token for public GitHub API requests. |
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

Adjust your settings in the studio, download a new workflow, replace `.github/workflows/constellation.yml`, and run it again. When upgrading an older workflow, replace the whole file to remove its old image-commit step.

Customization reuses saved project data. Click **Load data** when adding projects that have not been loaded, or **Refresh data from GitHub** when you want fresh data.

For a one-time image without Actions, click **Download SVG**, commit the file to your repository, and embed it with `[![GitHub constellation](./constellation.svg)](https://github.com/mnichols08/constellation)`.

## Preview locally

With Node.js 22 or later, run `npm run preview` and open http://127.0.0.1:4173.

For authenticated local requests, add `GH_TOKEN=YOUR_TOKEN` to `.env` in this project, then restart the preview server. `GITHUB_TOKEN` and `gh_token` also work. The server loads `.env` automatically and keeps the token out of the browser. Without a token it uses public requests. The hosted static studio continues to use public requests.

Run `npm test` to verify changes. See [Releasing](.github/RELEASING.md) for version tags and Marketplace publishing.
