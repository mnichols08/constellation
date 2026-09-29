# Accessibility

Static SVG exports include descriptive text and retain existing reduced-motion alternatives. Interactive exports and components provide labelled native controls, live status updates, keyboard-selectable nodes and visible focus. Tab reaches the canvas and current node target; arrows/Home/End navigate nodes; Enter/Space selects, Shift-select traces a path, Escape clears selection, and +/- zooms.

Timelines expose a native date range with actual date/evidence text. Then/Now comparison includes text counts, not color alone. Hierarchy uses breadcrumb buttons with the current scene identified; focus follows navigation. Story chapters use a labelled selector, Previous/Next controls, narration and heading focus. Autoplay is never required.

Reduced motion pauses SVG animation and disables CSS/node/camera transitions. Changing the system preference during an effect immediately applies its final state. Filters update keyboard targets and clear hidden selections. Resizing preserves the camera; narrow comparison views stack vertically.

Embedders should provide a useful page heading and record labels/descriptions, preserve visible control focus, and avoid custom CSS that hides content or reduces contrast. The component uses Shadow DOM for style isolation and composed events for host integration. Studio keeps ordinary design creation separate from optional layer/Story editors.

Browser tests exercise keyboard operation, reduced-motion changes, mobile sizing, breadcrumb focus, Story previews and Chromium's accessibility tree. These automated checks complement manual assistive-technology testing; they are not a claim of universal screen-reader coverage.

Temporal Stack provides labelled depth, rotation and tilt sliders, a year selector, Latest year and Reset perspective buttons. Year focus announces its evidence. Halos and camera changes are static with or without reduced motion. See [Temporal Stack](temporal-stack.md).
