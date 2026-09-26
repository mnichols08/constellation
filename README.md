# GitHub Constellation

Create a constellation of your public GitHub projects and keep it updated in your README.

## Set up

1. Open the [constellation studio](https://mnichols08.github.io/constellation/), enter your GitHub username, and click **Find my stars**.
2. Choose your projects, languages, topics, layout, and colors. Use **Advanced CSS overrides** for custom styling. Light and dark palettes are included automatically.
3. Under **Your daily workflow**, enter the **Repository running this workflow**, such as `mnichols08/mnichols08` for a profile README. Use a public repository so everyone can view the image.
4. Click **Download workflow** and save it as `.github/workflows/constellation.yml` in that repository. Commit and push it to the default branch. The file includes your settings and CSS and uses the repository owner's GitHub username automatically.
5. In that repository, open **Actions → Daily constellation → Run workflow**. The workflow creates an `output` branch and saves `constellation.svg` at its root. Existing files on that branch are preserved.
6. In the studio, click **Copy README snippet**, paste it into your README, and commit the change.

GitHub supplies `GITHUB_TOKEN` automatically; you do not need to create a personal token. Keep the workflow's `contents: write` permission, and ensure repository rules allow Actions to write to `output`.

## Embed the image

The studio generates this snippet for you. If adding it manually, replace `OWNER/REPOSITORY` with the repository **running the workflow**:

```md
[![GitHub constellation](https://raw.githubusercontent.com/OWNER/REPOSITORY/output/constellation.svg)](https://github.com/OWNER/REPOSITORY/blob/output/constellation.svg)

Made with [GitHub Constellation](https://github.com/mnichols08/constellation) by [@mnichols08](https://github.com/mnichols08).
```

The image updates daily. You can also run the workflow manually at any time.

## Change your configuration

Adjust your settings in the studio, download a new workflow, replace `.github/workflows/constellation.yml`, and run it again. When upgrading an older workflow, replace the whole file to remove its old image-commit step.

Customization reuses saved project data. Click **Load data** when adding projects that have not been loaded, or **Refresh data from GitHub** when you want fresh data.

For a one-time image without Actions, click **Download SVG**, commit the file to your repository, and embed it with `![GitHub constellation](./constellation.svg)`.
