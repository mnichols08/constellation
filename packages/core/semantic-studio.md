# Semantic Studio — make the constellation explain itself

Version 3.8.0 adds optional meanings to the existing Studio. After loading an account, choose **Teach me the Studio**, **Start from a preset**, **Surprise me**, or **Open a saved constellation**. The quick guided generator remains available. Nothing requires completing a tour.

The Content section's Detail control selects Automatic, Groups or Projects. Automatic follows camera scale with hysteresis; Groups and Projects lock the semantic projection. Studio stores this as `semanticZoom: { "mode": "auto" | "groups" | "projects" }` in Config v7. See [Semantic Groups](semantic-groups.md) for thresholds and legacy-config normalization.

The eleven-step tour highlights real controls and the real SVG preview. **Try it** applies ordinary editable settings. Back, Skip step, Exit and Escape remain available. **Teach me the Studio** restarts; **Resume tour** recalls the last step in this browser. Only the step number is stored separately from the design. Named designs are never overwritten by a tutorial step; save explicitly to retain a new named design.

## Reading a constellation

| Encoding | What it says | Missing evidence |
| --- | --- | --- |
| Identity rings (default) | Account-seeded geometric anchors; distance has no importance meaning | No project classification |
| Capability rings | Six sectors use strongest Developer Topology affinity; stronger evidence is closer | Outer no-evidence band |
| Showcase rings | Featured, Supporting, Experimental, Historical, then Unassigned, inner to outer | Explicit Unassigned band |
| Repository update rings | Within 30 days, 31–180, 181–365, older, then unavailable/future dates | Explicit unavailable/future band |
| Era rings | Creation dates, oldest inside; five-year units merged into at most five dated bands | Separate outer unavailable band |
| Developer Profile Sun | Six labelled rays; longer rays mean more evidence across selected projects | Zero-length ray, dimension label and no-evidence description |
| Color, size and glow | Selected mappings, described in Explain | Existing mapper fallbacks; authored colors take precedence |
| Ring motion, floating, twinkle, camera motion | Decorative presentation | No motion required to read evidence |

Profile evidence reuses Rust Developer Topology: languages, topics and authored role weights. Scores are bounded evidence indicators, not percentages of expertise, job titles or skill assessments. Select a ray, focus it with the keyboard, or use dimension buttons to inspect contributing repositories and reasons. SVG descriptions contain those reasons. Labels survive monochrome rendering.

Capability ties use stable order: Interface, Services, Data, Systems, Tooling, Automation. Strength bands use the existing 0–1 affinity: at least 0.67, at least 0.34, positive but below 0.34, and zero. These thresholds describe the evidence model, not measured ability. Ring rotation 1 rotates the capability composition together so sectors stay aligned; other semantic modes use per-band rotation controls.

Recency uses `pushed_at`, falling back to `updated_at`, relative to the configuration’s reference date. It is **not contribution activity**. Era rings use creation dates of surviving repositories and current metadata, **not historical snapshots**. Existing temporal views and recorded snapshots remain separate features.

## Change the story

New presets describe featured work, developer evidence, repository updates and creation eras. Each explains node, ring, color, size, connection and motion mappings before applying. Existing presets and named user presets continue to work. Presets use loaded data; use explicit loading controls for unavailable evidence.

Randomize supports Style, Layout/composition, Repository selection, Ring mapping, Connections, Animation and Full design. **Lock parts I like** preserves selected aspects even in a full draw. Locking semantic composition also locks its arrangement and repository node representation. Authored showcase roles are always preserved. **What changed** lists changed parts; **Undo randomization** restores the preceding configuration. Locks and Undo are session controls, not exported facts.

Partial and locked draws store explicit configuration and clear the recipe code: one seed cannot reproduce a composition assembled from several draws. Unlocked full draws retain v6 replay; v1–v6 recipes are unchanged.

**Explain this graphic** updates with the configuration and distinguishes evidence from decoration. **Include explanation in exported graphic** appends a reading guide below the SVG; leave it off for compact README images. Accessible descriptions are always included. Profile Sun and semantic band labels are visible without hover.

## Compatibility and limits

Additive fields: `accountSun: "profile"`, `ringMeaning: "identity" | "capability" | "showcase" | "activity" | "era"`, and `semanticLegend: true | false`. Existing `accountSun: "sun"` means Identity. Absent new fields retain legacy visuals. Config JSON, shares, CLI/Action workflows and generated Core copies use the same schema and renderer.

Semantic rings apply to repository nodes in the built-in Rings arrangement. Other arrangements retain their layouts; Explain reports inactive ring mappings. Manual node positions override bands. Refinement and decorative ring/floating motion do not move semantic nodes between evidence bands; switch to Identity for those free-form effects. Camera presentation, styles, colors, selections, CSS, temporal geometry and exports remain editable.

Rust `semantic_layout` accepts at most 256 normalized repository records and 1,000,000 input bytes. It validates dates, roles, evidence and finite rotations, rejects duplicate IDs, sorts IDs deterministically, and returns profile scores/evidence, categories, bands, sectors, positions, ray geometry and label anchors. Native and WASM share the algorithm. Dates are explicit inputs; Rust reads no clock or network and uses no system randomness. Oversized input reports an error rather than dropping projects.

No tour step, semantic switch, Profile Sun selection, Explain action, preset application or random draw requests more GitHub data. Public exploration retains its initial two-request budget. Explicit loading, repository addition, refresh and enrichment retain capability checks.
