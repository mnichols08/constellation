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

Scene serialization includes layer records and deterministic order. Config v6
accepts an optional `layers` object:

```json
{
  "version": 6,
  "layers": {
    "rings": { "visible": false },
    "starfield": { "opacity": 0.25, "order": 8 },
    "labels": { "visible": false }
  }
}
```

Visibility defaults to true, opacity to 1. Order is an integer priority from
-1000 to 1000; ties retain the default layer order. Scenes store the resulting
unique ascending order. Ordering applies within each fixed phase. The background
must remain behind decorations, connections behind nodes, and nodes behind labels;
invalid combinations fail validation. Moving dust in front of nodes is supported.

Selection supports visibility only; its intensity remains controlled by highlight
styling. Effects controls background decoration; activity and glow stay attached
to nodes. Hiding nodes does not implicitly hide labels, allowing label-only views.
Controls persist through v6 config, scene and workflow export. They never change
layout coordinates or source data. Missing controls preserve existing SVG bytes.

## Studio

Open **Layers**, then choose the layer to inspect. Only that layer's generic
controls appear. **Open layer settings** reveals its existing appearance or
behavior controls and moves keyboard focus there. **Reset this layer** restores
its defaults. Invalid ordering leaves the previous scene intact and reports the
constraint beside the controls. The scene summary reports visible nodes and
relationships from the compiled scene.

The layer selector uses native keyboard navigation. The Layers tab participates
in the existing arrow/Home/End tab navigation. Entering a username and generating
a graphic still uses the ordinary Look panel; no layer editing is required.
