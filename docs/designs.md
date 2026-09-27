# Reproducible README designs

The studio configures a self-contained SVG. It needs no account system, external fonts, JavaScript inside the exported image, or hosted database. The CLI and Action use the same rendering options as the studio.

## Randomize, then return to a design

Open **Reproducibility & optional effects**, choose **Randomize design**, and save the resulting **design code**, such as `v2:my-sky`. Paste that code and choose **Restore design code** to regenerate its coordinated theme, layout, node mappings, shapes, effects and background starfield. The original `v1` recipe keeps classic dust; `v2` adds seeded starfields. Existing codes continue to work. Codes use a deterministic PRNG, not a cryptographic hash or an authentication secret.

The code recreates the randomized visual recipe for the same account and repository data. It preserves your project filters. It resets manual colors, positions, selection, visibility, authored CSS, and motion overrides so these do not interfere with reproducing the recipe. Export JSON to preserve later edits, filters, and coordinates exactly. The JSON contains both the recipe code and the resulting explicit settings; CLI rendering does not need to regenerate the recipe.

**Seed mode** controls seeded palettes, glow variation, layout variation, background stars, ring identity and animation phases:

- `account`: use the lowercase GitHub username.
- `custom`: use the saved `seed` string.
- `random`: generate a seed once in the studio, then save it in the config. CLI configs using this mode must include the seed.

Randomize node hues still saves its explicit colors. Those colors override automatic color mappings. Clear manual colors to return to a mapped palette.

## Visual mappings

### Background starfield

The **Background starfield** section offers Off, Classic dust, Deep Space and Milky Way band. The generator creates up to 500 decorative stars with three apparent depth layers, small size/brightness differences, faint warm/cool tones and occasional brighter points. Milky Way concentrates stars around a curved band with faint haze. These remain behind the graph, do not receive focus or pointer events, and never count toward repository/node limits. Pair with a dark theme to get a space backdrop.

`starfield` accepts `mode` (`off`, `classic`, `space`, `milky-way`), `density` (0–100), `brightness` (0–1), `depth` (0–1), `twinkle` (boolean), and `seed` (up to 120 characters). An empty background seed follows the design seed. **Generate another starfield** changes only the background seed; copy/export JSON or a share link to preserve it. Increasing density extends a stable point sequence without moving existing stars. Compact output profiles reduce the decorative point budget.

Only a sparse subset twinkles, using CSS animation. Disabling Starlight animation, turning off twinkle, or requesting reduced motion produces a still sky. No JavaScript animation loop is added. Transparent exports retain stars but omit the band haze. Existing configs without `starfield` retain classic dust; a fresh studio starts with Deep Space stars, and `v2:` randomized designs save their own sky settings. The existing Background stars opacity control also affects the generated sky.

### Nodes and connections

`nodeSize` accepts `uniform`, `stars`, `activity`, `age`, `languages`, `topics`, or `membership`. Missing settings retain `legacy` sizing. Categories use bounded membership sizing for data-driven modes. Repository star and count metrics use logarithmic bounds; radii remain between 2.7 and 6 SVG units.

`nodeColorMode` accepts `custom`, `language`, `seeded`, `category`, or `contribution`. Contribution-style color measures repository recency, **not** the GitHub contribution calendar. Known languages use recognizable colors; other languages have deterministic fallback colors. Explicit `nodeColors` always win.

`nodeGlowMode` accepts `uniform`, `stars`, `activity`, or `seeded`. `connectionWeight` accepts `uniform`, `languages`, `topics`, or `overlap`; it changes width and opacity without increasing the number of graph connections.

Activity and age use the newest public repository update in the included data as a stable reference. Set `metricDate` to an ISO date to freeze another reference date. Missing dates get the smallest activity/age value. Relative repository filters (`updatedWithin`) intentionally use the current date.

## Themes and layouts

Built-in themes include GitHub Dark, Deep Space, Terminal Green, Solarized, Dracula, Synthwave, Monochrome, Contribution Graph, Rustacean, and JavaScript Yellow. They coordinate palettes, glow, secondary line opacity and selected shape/animation defaults. Applying a theme leaves project filters, placements, ring rotations and manual colors intact. Visual controls remain editable afterward. Configs can set `theme` to a preset name or use `visualTheme` alongside the existing `auto`, `light`, and `midnight` modes. Explicit config values override preset defaults. Try `"theme": "sudo"` for a small terminal easter egg.

**Galaxy** groups primary languages into distinct clusters. **Solar System** selects up to four major nodes by stars or recent update (`majorMetric: "stars"` or `"updated"`) and positions related nodes around them. Ties use repository names. These arrangements feed deterministic positions into the existing Rust scene engine; manual coordinates override them. Existing field, orbital, force and ring arrangements remain available.

Ring points now spread across all four rings before a ring receives another point. Adding nodes retains existing point coordinates. Hidden nodes still reserve their own points so hiding a node does not rearrange the chart.

Optional `nodeShape` values are `circle`, `star`, `diamond`, `hexagon`, `square`, and `mixed`. Shapes use shared SVG clip definitions and retain the existing animated circle anchors. `effect` offers `none`, `grid`, `scanlines`, or `coordinates` (small hexadecimal IDs). Effects are static, lightweight decorations. `legend: true` adds a compact explanation of the selected visual mappings. Reduced-motion behavior remains active.

## Portable config and local drafts

**Config, presets & export** supports copying/downloading JSON, pasting/importing JSON, file import, named local presets, and restoring/resetting the account draft. Drafts save automatically in localStorage, independently of sessionStorage GitHub data. Storage failures leave the studio usable and report how to download the design instead. Presets are local to the browser and GitHub account; deleting a preset does not delete an exported file.

New files have `version: 1` and ordinary human-readable render options. An optional `account` identifies the studio account; the Action still uses its configured username or repository owner. Old unversioned Action/config payloads continue to work. Imports validate nested values, reject prototype keys and future versions, and exclude tokens, caches and unknown runtime fields. Imported CSS must be self-contained: no imports, external URLs, CSS escapes or expressions. Existing trusted unversioned CLI CSS behavior is retained.

**Copy share link** includes account, filters, mappings, theme/palettes, seed/design code, colors, visibility, ring settings and graph selection. It excludes manual coordinates, label offsets and authored CSS. Links stop at 8,000 characters; download JSON for larger designs. Opening a valid link takes precedence over a saved local draft. Sharing a config fetches current public repository data, not a frozen API snapshot. Pins still require the existing local authenticated preview.

## Output profiles and file size

Profiles use the same SVG renderer:

| Profile | Dimensions | Labels and decoration |
| --- | --- | --- |
| Profile README | 900 × 560 | Full labels, 85 dust points |
| Repository README | 900 × 280 | At most 60% label candidates, 45 dust points |
| Compact | 600 × 186.67 | At most 35% label candidates, 25 dust points |
| Hero | 1440 × 896 | Full labels and decoration |
| Transparent | Current layout dimensions | No background or nebula |

All profiles keep attribution and existing collision-aware labels. PNG download uses browser SVG → Image → Canvas at 2×–3× resolution; it captures a static frame and does not replace animated SVG. If the browser cannot rasterize the SVG, SVG download remains available. Output size is shown in the studio. Static example fixtures are tested under 250 KiB for 24 repositories; dense graphs and native motion can be substantially larger. Balanced connections, fewer labels, and disabled motion keep README payloads smaller.

## Multiple images

Use separate config files and output paths; no dashboard is needed:

```yaml
- uses: mnichols08/constellation@v1
  with:
    config: examples/deep-space.json
    output: constellation-all.svg
- uses: mnichols08/constellation@v1
  with:
    config: constellation-rust.json
    output: constellation-rust.svg
```

For the Rust image, include `"languages": ["Rust"]` in its config. Use a revision containing these features until they are included in the published Action version. Existing `publish: true` preserves other files in the output branch.

## Tests

Run `npm test` and `npm run test:rust`. `npm test` includes a dependency-free Chromium DevTools test when Chrome/Chromium is found (or set `CONSTELLATION_BROWSER` to its executable). This verifies code restoration, config import, presets, local draft restoration, shared views, filters, keyboard selection and PNG rasterization without GitHub API calls. Run `npm run build:rust` after Rust changes and include the generated `src/wasm` assets.
