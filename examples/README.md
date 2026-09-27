# Example designs

Import a JSON file into the studio, or use it with the CLI/Action. These previews use synthetic projects and fixed dates; run `node scripts/generate-examples.mjs` to reproduce them without GitHub API requests.

| Design | Config | Preview |
| --- | --- | --- |
| Deep Space · Galaxy clusters, seeded colors, activity glow | [deep-space.json](deep-space.json) | ![Deep Space constellation](gallery/deep-space.svg) |
| Terminal · balanced rings, squares, scanlines | [terminal.json](terminal.json) | ![Terminal constellation](gallery/terminal.svg) |
| Minimal · monochrome, transparent, no motion | [minimal.json](minimal.json) | ![Minimal constellation](gallery/minimal.svg) |
| Solar System · major projects, language colors, mixed shapes | [solar-system.json](solar-system.json) | ![Solar System constellation](gallery/solar-system.svg) |
| Milky Way · seeded stars, depth and subtle twinkling | [starfield.json](starfield.json) | ![Milky Way background starfield](gallery/starfield.svg) |

| Active Developer · language colors and public-activity comet trails | [active-developer.json](active-developer.json) | ![Active Developer comet trails](gallery/active-developer.svg) |

Use **Randomize design** for another coordinated starting point. Enable **Include motion** for a randomized animation. Save its `v3:…` code to replay the recipe, or download JSON to keep all subsequent changes. Existing `v1:…` codes retain their classic dust background. Existing `v2:` codes retain their starfield recipe. See the [design guide](../docs/designs.md).

Active Developer uses [synthetic public events](fixtures/public-events.json) and a fixed `activityMetricDate`. Remove that date for live daily generation.
