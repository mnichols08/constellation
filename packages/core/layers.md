# Scene layers

Scenes compose nine logical layers: background, effects, rings, starfield,
annotations, connections, nodes, labels and selection. Each layer has a stable ID,
type, numeric order and fixed rendering phases. SVG rendering consumes these
records instead of assembling an unrelated global order.

| Phase | Contributions in default order |
| --- | --- |
| backdrop | background, effects, starfield |
| underlay | historical/organization/rhythm annotations |
| world | rings, classic starfield dust, connections, nodes, labels |
| overlay | captions, legends, timestamps, empty-state text and credit |
| interaction | selection/highlight |

The world phase is inside the existing perspective camera and historical scene
markers. Underlay and overlay annotations have different placement but share one
logical layer identity. Starfield similarly controls both background stars and
classic world dust. Selection applies the existing graph highlight pass after
composition. Node-local activity/glow remains attached to node geometry.

This phased composition is deliberate: blindly sorting all SVG fragments into
one flat list would break perspective, animated historical frames and node-attached
effects. Layer phases are validated internal semantics rather than editable
configuration. Defaults preserve the 2.0 SVG byte fixtures and Studio editing hooks.

Scene serialization includes the layer records and deterministic order. Layer
controls and Studio editing are introduced in subsequent 2.2 patches; the current
records establish the rendering boundary without changing ordinary generation.
