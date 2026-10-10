# Story Clarity v1

Story Clarity is an internal, deterministic presentation analyzer for a final
composed scene. It is separate from Graph Quality and candidate recommendation:
it returns structured diagnostics and bounded suggestions but does not score,
rank, or select story candidates.

## Input and output

The JS scene adapter supplies project IDs and authored roles, coordinates,
estimated label rectangles, relationship endpoints and types, group membership,
legend bounds, and target SVG dimensions. Estimated text bounds use a
conservative glyph-width approximation. They are not browser font measurements.

The Rust/WASM analyzer returns `version: 1`, diagnostics with stable codes,
severity, and affected IDs, plus suggestions such as moving or suppressing a
label or reducing visible relationship annotations. It never changes the scene.
The renderer may apply only bounded presentation adjustments to static Profile
Story exports; explicit manual labels and positions keep precedence.

Diagnostics cover estimated label collisions and bounds, featured prominence,
featured/supporting hierarchy, relationship density and label crossings,
crowded groups, relationship-style differentiation, and legend overlap. A
missing diagnostic does not prove that browser-rendered text cannot overlap.
Browser geometry regression tests check actual text and legend rectangles at
480px and 900px.

## Limits and determinism

Input is limited to 1 MiB, 512 projects, 1,024 labels, 4,096 relationships, and
128 groups. Output is capped at 256 diagnostics and 256 suggestions. IDs and
diagnostics are sorted so reordered records produce identical output. Numeric
geometry must be finite and bounded. No DOM, network, generated code, or
developer assessment is involved.

## Static Profile Story exports

Profile Story provides a wide 900px export and a compact 480px export from the
same selected candidate scene. Both retain the same projects and evidence.
Compact output prioritizes Featured and Supporting labels, reduces secondary
labels and visible relationship annotations, and scales role labels for the
smaller intrinsic width. Connection patterns retain non-color distinctions and
accessible SVG titles. The SVG remains understandable with JavaScript
disabled. Reduced-motion preferences do not remove static information.

Suggestions are presentation guidance. They do not change evidence, semantic
selection, project identity, or user-authored layout.

## Human comprehension review

The automated geometry checks establish that labels and legends fit; they do
not establish that a person understands the story. Before treating the visual
hierarchy as user validated, show the static export without coaching and ask a
reviewer to answer:

1. Which project is featured, and what visual cue made that clear?
2. Which projects support it, and what evidence connects them?
3. What does each visible connection style mean?
4. Is anything important missing or difficult to distinguish?

Record answers for both 480px and 900px exports, including uncertainty and any
misread relationship. No participant study has been run for this release, so
comprehension remains an explicit human-review item rather than a measured
claim.
