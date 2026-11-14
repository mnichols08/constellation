# Tech stack maps

See which languages, frameworks and services an account's public repositories declare, and which ones are used together. It works for an organization, your own account or any other public account.

## In the Studio

1. Open any account or the example sky.
2. Press **Tech stack** in the top bar. On a phone, or from any screen size, **Map a tech stack** at the top of the **Layout** tab does the same.
3. Sign in with GitHub if you haven't. This view needs sign-in because it reads a file from every public repository, which uses your own request limit. You return to the sheet afterwards.
4. Enter an account, or press **Use my account**, then press **Map tech stack**.

A large organization can take several minutes. You can cancel at any time, and closing the sheet also cancels. Everything else in the Studio works without signing in.

The result stays in the sheet. It doesn't change your design, your undo history or your share links. **Download interactive page** saves a single HTML file you can send to someone, and it contains no sign-in details.

## At a glance

The result opens with a short summary meant for someone who has a minute, such as a recruiter:

- **A headline**: the main languages of current work, and how many repositories were updated in the last year.
- **Used together**: the frontend, backend and data technologies that are declared in the same repositories, found from the account's own repositories. The largest combination that is still common is shown, up to four.
- **Where to look**: each leading technology with how many repositories declare it, the years it was active, and one or two repositories that show it, as links.
- **Testing and build tools** on their own line, so test runners and bundlers don't crowd out the stack.

How the dates and order work:

- **Years** run from when the first repository declaring a technology was created to the last push to any of them. **Now** means one of them was pushed to in the last year; anything else is marked as earlier work and faded on the card.
- **Order** puts current technologies first, then those in more repositories that were worked on for a month or more, then by count. A weekend experiment still counts, but it doesn't lead.
- **Examples** prefer repositories you marked as featured in the open design (when the map is of that account), then live over archived, sustained over brief, then stars.

These are counts and dates. They say what is declared and when repositories were active, not how well anyone knows a technology.

## Reading the map

- **Star area** shows how many repositories declare a technology.
- **Lines** join technologies declared in the same repositories, and thicker lines mean more repositories. The map draws each technology's closest partner and the most-shared pairs across groups, not every pair.
- **Selecting a star** frames it with its direct links and dims the rest.
- **Tables** under the map list every technology detected, including rarer ones left off the map to keep it readable, with the years each was active.

## What it counts

Public, non-fork, non-empty repositories, using their default branch.

- **Technologies** come from `package.json`, `requirements*.txt`, `Pipfile`, `pyproject.toml`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`, `go.mod`, `pubspec.yaml` and `*.csproj` files up to three folders deep, plus Docker files and `manage.py`. The list of recognized technologies is hand-curated in `src/tech-stack/catalog.mjs`.
- **Languages** come from GitHub, and don't count below 2% of a repository's code.

**Declared doesn't mean used.** Some entries are starter-kit defaults: Create React App installs Testing Library, for example. **Counts aren't quality.** They count repositories, not people, and an unfinished project counts the same as a finished one. The map reports what it couldn't read, and says when GitHub's request limit stopped a scan early.

## Put it on a GitHub profile

A README can't run a sign-in, so the profile version is a workflow. GitHub redraws the image every day with the repository's own access.

There are two images:

- **Summary card** (the default): the headline, the stacks used together, and a dated bar for each technology. It can be read without explanation.
- **Star map**: the map from the sheet, which shows how technologies connect.

1. Map an account in the Studio, then scroll to **Add it to a GitHub profile**.
2. Check the **Repository for the workflow** (usually `YOUR_USERNAME/YOUR_USERNAME`; for an organization, its `.github` repository) and press **Create the file on GitHub**. Commit the file at `.github/workflows/tech-stack.yml`.
3. On the repository's **Actions** page, run **Daily tech stack map** once.
4. Paste the README snippet from the same section into your README.
5. Optional: **Copy the list** and paste it under the image. An image can't hold links, so this list is how a reader gets from a technology to the projects that show it. It is a snapshot; paste a new one when your work changes. It sits between two marker comments so it is easy to replace.

Or write the step yourself:

```yaml
- uses: mnichols08/constellation@v5
  with:
    tech-stack: 'true'
    tech-stack-style: card          # or: map
    tech-stack-featured: 'shop,blog' # optional: repositories to show first as examples
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

An output name ending in `.svg` writes the README image (`--tech-stack-style card` or `map`), `.md` writes the README list with links, and any other name writes the interactive page. `--tech-stack-featured shop,blog` names repositories to show first as examples.

A token is required. It is used only for requests to GitHub and never written to the page.

## On a local preview

`npm run preview` uses `GH_TOKEN` from `.env`, and the scan runs through a fixed route on the local server, so the token never reaches the browser. That route builds its own queries and can't forward arbitrary GraphQL.

See [ADR-0009](architecture/decisions/ADR-0009-TECH-STACK-VIEW.md) for why this view works this way.
