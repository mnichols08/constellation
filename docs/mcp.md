# Connect your own assistant (MCP)

Constellation includes a small [Model Context Protocol](https://modelcontextprotocol.io) server. Connect it to an assistant you already use (Claude Desktop, Claude Code, or any other MCP client) and ask for a sky in your own words, or tell it to decide. The assistant does the thinking with its own model and account; the server gives it the same engine the Studio uses to look at your repositories, check a plan, draw it and write the README workflow.

- Local: it runs on your computer over stdio. Nothing is hosted.
- No API key, and no dependencies to install.
- It reads public GitHub data only, and writes only inside the folder it was started in.

## Set up

You need Node.js 22 or later and a copy of this repository.

```bash
git clone https://github.com/mnichols08/constellation.git
```

**Claude Code**

```bash
claude mcp add --transport stdio constellation -- node /path/to/constellation/mcp/server.mjs
```

**Claude Desktop** and other clients that use a JSON configuration:

```json
{
  "mcpServers": {
    "constellation": {
      "command": "node",
      "args": ["/path/to/constellation/mcp/server.mjs"],
      "env": { "GITHUB_TOKEN": "optional" }
    }
  }
}
```

`GITHUB_TOKEN` is optional. Without it GitHub allows about 60 requests an hour, which is enough for a few accounts. A token with no scopes raises the limit; the server sends it only to `api.github.com`.

The image is saved in the folder the server runs in. Claude Code starts it in your project folder; for Claude Desktop, ask for the workflow instead, or set a working folder in your client if it supports one.

## Use it

Ask in plain words:

> Load my GitHub account `octocat` and decide on a constellation that helps a recruiter see my current work first. Show me the plan before drawing anything.

> Put my Rust projects in the middle, group the experiments on the outside, and give me the workflow for my profile README.

A good session goes: load the account, look at the overview, propose a plan, show it to you, then draw it or hand you the workflow.

## Tools

| Tool | What it does |
| --- | --- |
| `load_account` | Loads an account's public repositories. Optional `roles` mark repositories as featured, supporting, experimental or historical. |
| `portfolio_overview` | One bounded snapshot: counts, how recently things were updated, your declared roles, top languages and topics, most starred and most recently updated. |
| `list_languages`, `list_topics` | What the account uses. |
| `find_repositories`, `describe_repository`, `preview_group` | Search, inspect one repository, and see what a group would match and why. |
| `validate_spec`, `compile_spec` | Check a [ConstellationSpec](constellation-spec.md) and resolve it against the repositories. |
| `suggest_sky` | A starting spec chosen by fixed rules, with no model. |
| `describe_plan` | What a spec would do, in plain words. |
| `render_sky` | Draws the SVG and saves it in the current folder. |
| `readme_workflow` | The GitHub Actions workflow, where to save it and the README snippet. Text only; nothing is pushed. |

The eight engine tools are the ones published in [`schemas/constellation-tools.v1.json`](../schemas/constellation-tools.v1.json).

## What it can and cannot do

- A spec states intent only: no coordinates, colours, code or markup. Rust validates it and does the geometry, exactly as in the Studio.
- The server cannot run commands, read your files, push to GitHub or call a model.
- `render_sky` refuses absolute paths, paths that leave the folder, and anything that is not `.svg`.
- It reports public metadata and the roles you set. It is told, and tells the assistant, not to state or imply skill, seniority or fit for a job. See [recruiter evidence](recruiter-evidence.md).
- An assistant can still write something misleading in its own reply. Read the plan before you publish.

## Test without the network

Set `CONSTELLATION_MCP_FIXTURE` to a JSON file holding an array of repositories in GitHub's API shape. `load_account` reads that file instead of calling GitHub. `npm test` exercises the server this way, including a real stdio round trip.
