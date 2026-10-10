// Move the existing controls, preserving their state, IDs and event listeners.
export function mountStudioLayout() {
  const $ = (selector) => document.querySelector(selector);
  const sidebar = $(".controls");
  const download = $(".download");
  const tabs = document.createElement("div");
  tabs.className = "studio-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Customize");
  const scroll = document.createElement("div");
  scroll.className = "inspector-scroll";
  const panels = new Map();
  const body = $(".studio-body");
  const fold = (title, ...nodes) => {
    const details = document.createElement("details");
    details.className = "control-section";
    const summary = document.createElement("summary");
    summary.textContent = title;
    const content = document.createElement("div");
    content.className = "control-section-body";
    content.append(...nodes);
    details.append(summary, content);
    return details;
  };
  const advancedPanel = document.createElement("section");
  advancedPanel.id = "panel-nodes";
  advancedPanel.className = "inspector-panel design-controls";
  advancedPanel.hidden = true;
  advancedPanel.setAttribute("role", "group");
  advancedPanel.setAttribute("aria-label", "Advanced layout controls");
  for (const [id, title] of [
    ["projects", "Content"],
    ["look", "Design"],
    ["layers", "Layout"],
    ["motion", "Motion"],
    ["save", "Export"],
  ]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `tab-${id}`;
    tab.textContent = title;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `panel-${id}`);
    const panel = document.createElement("section");
    panel.id = `panel-${id}`;
    panel.className = "inspector-panel design-controls";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.addEventListener("click", () => activate(id));
    tabs.append(tab);
    scroll.append(panel);
    panels.set(id, { tab, panel });
  }
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "toggle-customization";
  toggle.className = "secondary";
  toggle.setAttribute("aria-controls", "studio-inspector");
  sidebar.id = "studio-inspector";
  function visible(show) {
    sidebar.hidden = !show;
    body.classList.toggle("preview-only", !show);
    toggle.setAttribute("aria-expanded", String(show));
    toggle.textContent = show ? "Hide controls" : "Customize";
  }
  function activate(id) {
    visible(true);
    for (const [key, { tab, panel }] of panels) {
      panel.hidden = key !== id;
      tab.setAttribute("aria-selected", String(key === id));
      tab.tabIndex = key === id ? 0 : -1;
    }
    scroll.scrollTop = 0;
  }
  tabs.addEventListener("keydown", (event) => {
    const entries = [...panels];
    const index = entries.findIndex(([, value]) => value.tab === event.target);
    if (
      index < 0 ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? entries.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + entries.length) %
            entries.length;
    activate(entries[next][0]);
    entries[next][1].tab.focus();
  });
  toggle.addEventListener("click", () => visible(sidebar.hidden));
  const panel = (id) => id === "nodes" ? advancedPanel : panels.get(id).panel;
  const field = (id, target) => {
    const label = $(`label[for="${id}"]`),
      input = $(`#${id}`);
    target.append(label);
    if (!label.contains(input)) target.append(input);
  };
  const section = (id, target) => {
    const details = $(`#${id}`).closest("details");
    target.append(details);
    return details;
  };

  const look = panel("look");
  field("design-visualTheme", look);
  section("design-accountSun", look);
  section('design-ringMeaning', look);
  section('design-readmePresentation', panel('projects'));
  field("profile-emphasis", panel("layers"));
  panel("layers").append($("#profile-dimension-controls"));
  field("arrangement", panel("layers"));
  field("layout", panel("save"));
  panel("layers").append($("#temporal-stack-controls"));
  section("design-sky-mode", look);
  section("design-nodeSize", look).querySelector("summary").textContent =
    "Node appearance";
  section("palette-controls", look);
  field("design-starlightAnimate", panel("motion"));
  section("design-seed", look).querySelector("summary").textContent =
    "Seed & finishing touches";
  look.append(
    fold(
      "Advanced CSS",
      $("#generated-css").closest("details"),
      $("#custom-css").closest("details"),
    ),
  );
  for (const id of [
    "animate-rings",
    "perspective-enabled",
    "animate-floating",
    "design-activityEffect",
    "design-codingRhythmStyle",
  ])
    section(id, panel("motion"));
  field("animate", panel("motion"));
  section("repo-source", panel("projects"));
  panel("projects").append($("label[for='import-semantic-graph']"), $("#import-semantic-graph"), $("#semantic-graph-status"), $("#semantic-graph-mode-help"));
  section("project-families", panel("projects"));
  panel("projects").append($("#organization-controls"));
  section("history-mode", panel("projects"));
  panel("projects").append(fold("Languages & topics", $(".graph-filters")));
  section("repository-search", panel("projects"));
  section("repository-history-open", panel("projects"));
  section("design-minStars", panel("projects"));
  panel("projects").append(
    fold(
      "Selected project, connections & appearance",
      $("#graph-explorer"),
      section("color-node", panel("nodes")),
    ),
  );
  panel("projects").append(
    fold("Account & connection help", $(".form-note"), $("#token-help")),
    $(".stats"),
    $("#engine-status"),
  );
  field("node-mode", panel("nodes"));
  panel("nodes").append($("#node-mode-help"));
  for (const id of [
    "lock-stars",
    "design-refinement-enabled",
    "connection-density",
  ])
    section(id, panel("nodes"));
  section("download-config", panel("save"));
  panel("save").append($("#download-semantic-graph"), $("#download-semantic-markdown"));
  const layerControls = $("#layer-controls");
  const advancedLayout = fold("Advanced layout controls", advancedPanel, layerControls);
  advancedLayout.addEventListener("toggle", () => {
    advancedPanel.hidden = !advancedLayout.open;
  });
  panel("layers").append(advancedLayout);
  const workflow = $("#workflow").closest(".editor-panel");
  panel("save").append(
    $("#copy-markdown"),
    fold("Daily GitHub workflow", workflow),
    $("#snippet-panel"),
  );

  // Only the active panel scrolls; the live canvas never moves with its controls.
  sidebar.replaceChildren(tabs, scroll);
  for (const { panel: content } of panels.values()) {
    content.addEventListener(
      "toggle",
      (event) => {
        const opened = event.target;
        if (opened.parentElement !== content || !opened.open) return;
        for (const details of content.querySelectorAll(":scope > details"))
          if (details !== opened) details.open = false;
        if (!content.hidden)
          scroll.scrollTop +=
            opened.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top -
            12;
      },
      true,
    );
  }
  const launcher = $(".design-launcher");
  $(".design-launcher-title").remove();
  const codes = fold("Design code", $(".design-code-controls"));
  codes.classList.add("design-code-menu");
  launcher.append(codes, toggle, download);
  codes.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      codes.open = false;
      codes.querySelector("summary").focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!codes.contains(event.target)) codes.open = false;
  });
  const explanation = fold("About Constellation", $(".about"));
  explanation.className = "studio-about";
  $("main").append(explanation);
  $(".customization").hidden = true;
  $("#style-preview").hidden = true;
  $(".intro h1").textContent = "Your code, written in the stars.";
  $("#account-form button").textContent = "Build constellation";
  document.body.classList.add("studio-ready");
  $(".preview-action-buttons").append($("#open-constellation-library"));
  activate("look");
  // Header wrapping and system fonts vary across platforms. Measure the space
  // above/below the canvas instead of assuming a fixed toolbar height.
  function fitWorkspace() {
    const top = body.getBoundingClientRect().top + window.scrollY;
    const footer =
      $(".status-bar").getBoundingClientRect().height +
      $(".preview-actions").getBoundingClientRect().height;
    body.style.setProperty(
      "--studio-height",
      `${Math.max(220, window.innerHeight - top - footer - 12)}px`,
    );
  }
  const sizing = new ResizeObserver(fitWorkspace);
  for (const element of [
    $(".masthead"),
    $(".intro"),
    $(".studio-header"),
    launcher,
    $("#studio-tour"),
    $(".preview-actions"),
    $(".status-bar"),
  ])
    sizing.observe(element);
  window.addEventListener("resize", fitWorkspace);
  fitWorkspace();
  function reveal(element) {
    const targetPanel = element?.closest?.('[role="tabpanel"]');
    const match = [...panels].find(([, value]) =>
      value.panel === targetPanel || value.panel.contains(element),
    );
    if (!match) return;
    activate(match[0]);
    for (let parent = element; parent; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
      if (advancedPanel.contains(element) && parent === advancedLayout)
        advancedPanel.hidden = false;
    }
    element?.focus?.({ preventScroll: true });
  }
  document.addEventListener("click", (event) => {
    if (!event.target.closest('a[href="#token-help"]')) return;
    event.preventDefault();
    reveal($("#token-help"));
    $("#token-help summary").focus({ preventScroll: true });
  });
  return { reveal };
}
