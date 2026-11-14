# Tech stack maps

See which languages, frameworks and services an account's public repositories declare, and which ones are used together. It works for an organization, your own account or any other public account.

## In the Studio

1. Open any account or the example sky.
2. Press **Tech stack** in the top bar. On a phone, or from any screen size, **Map a tech stack** at the top of the **Layout** tab does the same.
3. Sign in with GitHub if you haven't. This view needs sign-in because it reads a file from every public repository, which uses your own request limit. You return to the sheet afterwards.
4. Enter an account, or press **Use my account**, then press **Map tech stack**.

A large organization can take several minutes. You can cancel at any time, and closing the sheet also cancels. Everything else in the Studio works without signing in.

The result stays in the sheet. It doesn't change your design, your undo history or your share links. **Download interactive page** saves a single HTML file you can send to someone, and it contains no sign-in details.

## Reading the map

- **Star area** shows how many repositories declare a technology.
- **Lines** join technologies declared in the same repositories, and thicker lines mean more repositories. The map draws each technology's closest partner and the most-shared pairs across groups, not every pair.
- **Selecting a star** frames it with its direct links and dims the rest.
- **Tables** under the map list every technology detected, including rarer ones left off the map to keep it readable.

## What it counts

Public, non-fork, non-empty repositories, using their default branch.

- **Technologies** come from `package.json`, `requirements*.txt`, `Pipfile`, `pyproject.toml`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`, `go.mod`, `pubspec.yaml` and `*.csproj` files up to three folders deep, plus Docker files and `manage.py`. The list of recognized technologies is hand-curated in `src/tech-stack/catalog.mjs`.
- **Languages** come from GitHub, and don't count below 2% of a repository's code.

**Declared doesn't mean used.** Some entries are starter-kit defaults: Create React App installs Testing Library, for example. **Counts aren't quality.** They count repositories, not people, and an unfinished project counts the same as a finished one. The map reports what it couldn't read, and says when GitHub's request limit stopped a scan early.

## Put it on a GitHub profile

A README can't run a sign-in, so the profile version is a workflow. GitHub redraws the map every day with the repository's own access and saves it as an image.

1. Map an account in the Studio, then scroll to **Add it to a GitHub profile**.
2. Check the **Repository for the workflow** (usually `YOUR_USERNAME/YOUR_USERNAME`; for an organization, its `.github` repository) and press **Create the file on GitHub**. Commit the file at `.github/workflows/tech-stack.yml`.
3. On the repository's **Actions** page, run **Daily tech stack map** once.
4. Paste the README snippet from the same section into your README.

Or write the step yourself:

```yaml
- uses: mnichols08/constellation@v5
  with:
    tech-stack: 'true'
    publish: 'true'
    output: tech-stack.svg
```

`tech-stack` ignores `config`, `config-json`, `story` and `target-width`: the map is drawn from what the repositories declare, not from a design. The image's title, description and caption say how many repositories were counted, flag a partial scan, and state that manifests declare technologies without proving use. Your Studio sign-in is never written into the workflow. It can run beside a constellation workflow; both publish to the same `output` branch and never at the same moment.

The image is static. For hover details and the full tables, use **Download interactive page**. **Download image (SVG)** saves a one-time image without a workflow.

## From the command line

```sh
GH_TOKEN=... node src/cli.mjs --tech-stack --username chingu-voyages --output chingu-tech-stack.html
GH_TOKEN=... node src/cli.mjs --tech-stack --username chingu-voyages --output chingu-tech-stack.svg
```

An output name ending in `.svg` writes the README image; any other name writes the interactive page.

A token is required. It is used only for requests to GitHub and never written to the page.

## On a local preview

`npm run preview` uses `GH_TOKEN` from `.env`, and the scan runs through a fixed route on the local server, so the token never reaches the browser. That route builds its own queries and can't forward arbitrary GraphQL.

See [ADR-0009](architecture/decisions/ADR-0009-TECH-STACK-VIEW.md) for why this view works this way.
