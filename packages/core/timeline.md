# Timelines and historical evidence

Timelines compile a bounded series of scenes through the same Rust/WASM layouts and mappings as ordinary visualizations. Every timeline has an explicit reference date and ends with the current input records at that date. SVG renders that final scene as a static fallback; HTML and the web component add Previous date/Next date controls with an evidence label.

```js
import { createTimeline, renderSceneHTML } from '@constellation/core';
const scene = createTimeline('example', currentRecords, {
  referenceDate: '2026-09-01T00:00:00Z', animate: false,
}, {
  snapshots: [{ date: '2024-01-01', records: savedRecordsFrom2024 }],
});
const html = renderSceneHTML(scene);
```

Snapshots contain actual records saved by your source. Their star counts, styles, relationships and other values are used as supplied. Constellation cannot reconstruct historical star counts, project architecture or contributor membership from today's GitHub response.

Alternatively provide `{ dates: ['2022-01-01', '2024-01-01'] }`. These frames include only projects with known creation dates at or before each date. Future update timestamps and unsupported archive state are removed, but other metrics remain current. The UI explicitly calls these **creation-date views using current metadata**, not historical snapshots. Unknown creation dates are omitted from retrospective frames and remain available in the current view. With neither dates nor snapshots, known creation dates supply the frames.

`temporalMetadata(records)` reports known created/updated dates and source-provided release publication dates. Missing dates remain null; no events are invented. The model uses `timeline.version: 1`, ISO date IDs, ascending frames, and evidence values `snapshot`, `current-metadata`, or `current`. Dates must be unique, no later than the reference date, with at most 64 frames including the current frame.

Configuration can include a `timeline` object with `referenceDate` and either `dates` or `snapshots`. The same `createScene` pipeline compiles it, so CLI HTML export needs no special flags beyond `--format html`. Large snapshot datasets are better supplied through the programmatic API than stored in a share URL. Existing v6 config size limits still apply. The legacy SVG time-lapse feature remains compatible and independent of this explicit timeline model.

The interactive runtime exposes `setFrame(index)` and `frameIndex`, and emits `timeline-change` with `{ index, date, evidence }`. Controls use ordinary buttons and announce the displayed date. Frames are precompiled, requiring no network access or graph recalculation while navigating an export.

## Frame changes

Each supplied snapshot runs through the same transforms, mappings and layout, so nodes can appear/disappear, grow, change color/opacity and relationships, or move. Runtime transitions interpolate shared-node geometry over 300 ms and fade arriving/departing nodes. Shared node groups retain DOM identity; frame navigation preserves camera, local filter and theme. Selection persists only when its nodes remain visible.

Reduced-motion preferences disable interpolation and fades, including when the preference changes during a transition. Rapid navigation cancels the previous transition and cleans up temporary departure graphics. The runtime interpolates compiled coordinates; it does not duplicate Rust layout or path algorithms.
