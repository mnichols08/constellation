import { mountRepositoryPicker } from "./repository-picker.mjs";
import {
  defaultIntent,
  choicesFor,
  validateIntent,
} from "./onboarding-model.mjs";
import { recommendProjects } from "./onboarding-model.mjs";
import { analyzeDeveloperProfile } from "./engine.mjs";

export function mountOnboarding(
  host,
  {
    repositories,
    access,
    account,
    profile,
    initial,
    year,
    findRepositories,
    loadPinned,
    prepareProjects,
    generate,
    customize,
    useDesign,
    save,
    enterPath,
  },
) {
  let intent = initial || defaultIntent(repositories()),
    step = 0,
    busy = false,
    picker;
  if (enterPath && !initial) intent.topology = "later";
  if (access?.mode === "public") intent = { ...intent, activity: "none" };
  const heading = document.createElement("h2");
  heading.tabIndex = -1;
  const progress = document.createElement("p");
  const body = document.createElement("div");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.id = "guided-status";
  const actions = document.createElement("div");
  actions.className = "guided-actions";
  host.replaceChildren(progress, heading, body, status, actions);
  const button = (parent, label, run) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (
      (label === "Contributed to" &&
        access?.capabilities.contributionDiscovery === false) ||
      (label === "Pinned repositories" &&
        access?.capabilities.pinnedRepositories === false)
    ) {
      element.disabled = true;
      element.title = "Sign in with GitHub to load this data.";
    }
    element.addEventListener("click", run);
    parent.append(element);
    return element;
  };
  function radios(title, key, entries, parent = body) {
    const field = document.createElement("fieldset"),
      legend = document.createElement("legend");
    legend.textContent = title;
    field.append(legend);
    for (const [value, text] of entries) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "radio";
      input.name = `guided-${key}`;
      input.value = value;
      if (
        key === "activity" &&
        value !== "none" &&
        access?.capabilities.activity === false
      )
        input.disabled = true;
      input.checked = intent[key] === value;
      input.addEventListener("change", () => {
        intent[key] = value;
      });
      label.append(input, document.createTextNode(text));
      field.append(label);
    }
    parent.append(field);
  }
  const available = () => choicesFor(repositories(), intent.projects, year);
  const steps = () => [
    "projects",
    "showcase",
    "topology",
    "relationships",
    "activity",
    "universe",
  ];
  function curateShowcase() {
    intent.projectShowcase ||= {};
    const selected = repositories().filter((repo) =>
      intent.projects.includes(repo.full_name),
    );
    const list = document.createElement("ol");
    list.className = "showcase-curation-list";
    const note = document.createElement("p");
    note.textContent =
      "Choose the roles that reflect your intent. Recommendations do not assign roles automatically.";
    body.append(note, list);
    const featured = () =>
      Object.entries(intent.projectShowcase)
        .filter(([, entry]) => entry.role === "featured")
        .sort((a, b) => a[1].priority - b[1].priority);
    const reorder = () => {
      const ordered = featured();
      ordered.forEach(([id], index) => {
        intent.projectShowcase[id].priority = index + 1;
      });
    };
    for (const repo of selected) {
      const item = document.createElement("li");
      const name = document.createElement("strong");
      name.textContent = repo.name;
      const details = document.createElement("span");
      details.textContent = repo.description || repo.full_name;
      const label = document.createElement("label");
      label.textContent = `Role for ${repo.name}`;
      const role = document.createElement("select");
      role.setAttribute("aria-label", `Role for ${repo.name}`);
      for (const [value, text] of [
        ["", "No role"],
        ["featured", "Featured"],
        ["supporting", "Supporting"],
        ["experimental", "Experimental"],
        ["historical", "Historical"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        role.append(option);
      }
      const existing = intent.projectShowcase[repo.full_name];
      role.value = existing?.role || "";
      role.addEventListener("change", () => {
        if (!role.value) delete intent.projectShowcase[repo.full_name];
        else
          intent.projectShowcase[repo.full_name] = {
            role: role.value,
            priority:
              role.value === "featured"
                ? Math.max(
                    0,
                    ...featured().map(([, entry]) => entry.priority),
                  ) + 1
                : 1,
          };
        reorder();
        item.dataset.role = role.value;
      });
      label.append(role);
      item.append(name, details, label);
      if (existing?.role === "featured") {
        const up = button(item, "Move featured project up", () => {
          const ordered = featured(),
            index = ordered.findIndex(([id]) => id === repo.full_name);
          if (index > 0) {
            [ordered[index - 1], ordered[index]] = [
              ordered[index],
              ordered[index - 1],
            ];
            ordered.forEach(([id], rank) => {
              intent.projectShowcase[id].priority = rank + 1;
            });
            curateShowcase();
          }
        });
        up.setAttribute("aria-label", `Move ${repo.name} up in featured order`);
        const down = button(item, "Move featured project down", () => {
          const ordered = featured(),
            index = ordered.findIndex(([id]) => id === repo.full_name);
          if (index >= 0 && index < ordered.length - 1) {
            [ordered[index + 1], ordered[index]] = [
              ordered[index],
              ordered[index + 1],
            ];
            ordered.forEach(([id], rank) => {
              intent.projectShowcase[id].priority = rank + 1;
            });
            curateShowcase();
          }
        });
        down.setAttribute(
          "aria-label",
          `Move ${repo.name} down in featured order`,
        );
      }
      list.append(item);
    }
  }
  function filters(kind) {
    const names = available()[kind];
    const note = document.createElement("p");
    note.textContent =
      kind === "languages"
        ? "Highlight technologies across your selected projects. None uses the existing empty language filter and may leave no visible projects."
        : "Focus on projects with these topics. Skip keeps every topic.";
    body.append(note);
    const choices = document.createElement("div");
    choices.className = "guided-actions";
    body.append(choices);
    for (const [label, value] of [
      ["Recommended", null],
      ["All", null],
      [kind === "topics" ? "Skip" : "None", kind === "topics" ? null : []],
    ])
      button(choices, label, () => {
        intent[kind] = value;
        if (kind === "topics" && label === "Skip") save(intent);
        draw();
      });
    const field = document.createElement("fieldset"),
      legend = document.createElement("legend");
    legend.textContent = "Choose specific " + kind;
    field.append(legend);
    for (const name of names) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = intent[kind] === null || intent[kind].includes(name);
      input.addEventListener("change", () => {
        const selected = new Set(intent[kind] ?? names);
        input.checked ? selected.add(name) : selected.delete(name);
        intent[kind] = [...selected].sort();
      });
      label.append(input, document.createTextNode(name));
      field.append(label);
    }
    body.append(field);
  }
  function draw() {
    host.hidden = false;
    document.documentElement.dataset.entry = "guided";
    const list = steps();
    step = Math.min(step, list.length - 1);
    const current = list[step];
    progress.textContent = `@${account} · Step ${step + 1} of ${list.length} · Projects → Roles → Developer evidence → Relationships → Activity → Universe → Preview`;
    heading.textContent = {
      projects: "Choose what matters",
      showcase: "Which projects should stand out?",
      topology: "What does your selected work show?",
      relationships: "What should your constellation reveal?",
      activity: "Add a little life",
      universe: "Choose your universe",
    }[current];
    body.replaceChildren();
    actions.replaceChildren();
    status.textContent = "";
    if (current === "projects") {
      const welcome = document.createElement("p");
      welcome.className = "guided-identity";
      welcome.textContent =
        "Welcome, @" +
        account +
        "." +
        (profile?.name ? " " + profile.name : "") +
        " · " +
        repositories().length +
        " public projects";
      const avatar = profile?.avatar || profile?.avatar_url;
      if (
        typeof avatar === "string" &&
        avatar.startsWith("https://avatars.githubusercontent.com/")
      ) {
        const img = document.createElement("img");
        img.src = avatar;
        img.alt = "";
        img.width = 48;
        img.height = 48;
        welcome.prepend(img);
      }
      body.append(welcome);
      const note = document.createElement("p");
      note.textContent =
        "Recommended balances recent work, popularity, project detail and original projects. You can change every selection.";
      body.append(note);
      const shortcuts = document.createElement("div");
      shortcuts.className = "guided-actions";
      body.append(shortcuts);
      for (const [mode, label] of [
        ["recommended", "Recommended"],
        ["recent", "Recently active"],
        ["popular", "Most starred"],
        ["all", "All"],
        ["contributed", "Contributed to"],
      ])
        button(shortcuts, label, () =>
          mode === "contributed"
            ? picker.contributed()
            : picker.select(
                mode === "all"
                  ? repositories()
                      .filter((repo) => !repo.private)
                      .map((repo) => repo.full_name)
                  : recommendProjects(repositories(), mode),
              ),
        );
      button(shortcuts, "Pinned repositories", async () => {
        if (busy || picker.busy()) return;
        busy = true;
        host.setAttribute("aria-busy", "true");
        for (const control of host.querySelectorAll("button, input, select"))
          control.disabled = true;
        status.textContent = "Loading pinned repositories…";
        try {
          if (!loadPinned)
            throw Error("Continue with GitHub to choose pinned repositories.");
          const pinned = (await loadPinned()).filter((repo) => !repo.private);
          if (!pinned.length) {
            status.textContent =
              "This account has no public pinned repositories. Your selection is unchanged.";
            return;
          }
          const names = pinned.map((repo) => repo.full_name);
          picker.update(
            account,
            repositories(),
            { includeRepos: names },
            pinned,
          );
          picker.select(names);
          status.textContent = `Selected ${names.length} pinned repositories. You can change any selection.`;
        } catch (error) {
          status.textContent = error.message;
        } finally {
          busy = false;
          host.removeAttribute("aria-busy");
          for (const control of host.querySelectorAll("button, input, select"))
            control.disabled = false;
          const scope = host.querySelector('[id$="contribution-scope"]');
          const organization = host.querySelector(
            '[id$="contribution-organization"]',
          );
          if (organization) organization.disabled = scope?.value === "all";
        }
      });
      const pool = document.createElement("div");
      body.append(pool);
      picker = mountRepositoryPicker(pool, {
        prefix: "guided-",
        guided: true,
        access,
        apply() {},
        message: (text) => {
          status.textContent = text;
        },
        findRepositories,
      });
      picker.update(
        account,
        repositories(),
        { includeRepos: intent.projects },
        repositories().filter((repo) =>
          intent.projects.includes(repo.full_name),
        ),
      );
    }
    if (current === "relationships") {
      radios("Emphasize", "relationships", [
        ["auto", "Let Constellation decide"],
        ["projects", "Projects and how they connect"],
        ["languages", "Languages across my work"],
        ["topics", "Topics across my work"],
        ["everything", "Everything together"],
      ]);
      const details = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = "Refine languages and topics";
      details.append(summary);
      const marker = body.children.length;
      filters("languages");
      if (available().topics.length) filters("topics");
      for (const child of [...body.children].slice(marker))
        details.append(child);
      body.append(details);
    }
    if (current === "showcase") curateShowcase();
    if (current === "topology") {
      const selected = repositories().filter((repo) =>
        intent.projects.includes(repo.full_name),
      );
      let preview;
      try {
        preview = analyzeDeveloperProfile({
          repositories: selected.map((repo) => ({
            name: repo.full_name,
            languages: repo.languages || {},
            language_names: repo.language ? [repo.language] : [],
            topics: repo.topics || [],
            role: intent.projectShowcase?.[repo.full_name]?.role || "",
          })),
        });
      } catch {
        /* Older bundles can still browse setup; they cannot claim a profile preview. */
      }
      const strongest = preview
        ? [...preview.dimensions]
            .filter((dimension) => dimension.score >= 0.2)
            .sort(
              (left, right) =>
                right.score - left.score || left.id.localeCompare(right.id),
            )
            .slice(0, 3)
            .map((dimension) => dimension.id)
        : [];
      const summary = document.createElement("p");
      summary.setAttribute("aria-live", "polite");
      summary.textContent = !preview
        ? "Developer evidence preview is unavailable in this build."
        : strongest.length
          ? `Your selected work currently shows strongest evidence in: ${strongest.join(" · ")}.`
          : "Your selected work does not yet contain enough recognized language or topic evidence to describe a technical emphasis.";
      body.append(summary);
      radios("Emphasis", "topology", [
        ["automatic", "Let my selected projects speak for themselves"],
        ...(preview
          ? preview.dimensions.map((dimension) => [
              dimension.id,
              `Emphasize ${dimension.id[0].toUpperCase()}${dimension.id.slice(1)}`,
            ])
          : []),
        ["later", "Customize later"],
      ]);
    }
    if (current === "activity" && access?.mode === "public") {
      const note = document.createElement("p");
      note.textContent =
        "Sign in with GitHub to load activity. You can create and export your constellation without it.";
      body.append(note);
    }
    if (current === "activity")
      radios("Use real public activity", "activity", [
        ["none", "○ No activity — a still sky"],
        ["subtle", "✦ Recent glow — light around active projects"],
        ["asteroids", "⁙ Commit asteroids — clusters of recent commits"],
        ["orbit", "◌ Contribution orbit — public activity around your work"],
        ["recent", "◎ Recent activity — gently pulsing projects"],
        ["surprise", "✧ Choose an activity effect for me"],
      ]);
    if (current === "universe") {
      radios("Structure", "history", [
        ["current", "✧ Single constellation"],
        ["rings", "◎ Identity rings"],
        ["galaxy", "⁙ Connected galaxy"],
        ["dimension", "▱ Dimensional universe"],
        ...(available().history.eligible
          ? [
              ["history", "◷ Evolution through time"],
              ["3d", "▱ Universe through time"],
            ]
          : []),
      ]);
      const note = document.createElement("p");
      note.textContent = `History begins in ${available().history.firstYear}. Retrospective layers use creation dates and current metadata, not historical star counts.`;
      if (available().history.eligible) body.append(note);
    }
    if (current === "universe") {
      radios("Dimension (for dimensional universe)", "dimension", [
        ["language", "Languages"],
        ["repository", "Repositories"],
        ["topic", "Topics"],
      ]);
      radios("Feel", "vibe", [
        ["cosmic", "Cosmic"],
        ["clean", "Clean"],
        ["technical", "Technical"],
        ["classic", "Classic"],
        ["surprise", "Surprise me"],
      ]);
      radios("Motion", "motion", [
        ["automatic", "Automatic"],
        ["still", "Still"],
      ]);
    }
    if (step)
      button(actions, "Back", () => {
        step--;
        draw();
      });
    button(
      actions,
      step === list.length - 1 ? "Generate my constellation" : "Continue",
      async () => {
        if (busy) return;
        if (current === "projects") {
          if (picker.busy()) {
            status.textContent = "Wait for repository discovery to finish.";
            return;
          }
          intent.projects = picker.selection();
          if (!intent.projects.length || intent.projects.length > 100) {
            status.textContent = "Choose 1–100 projects to continue.";
            return;
          }
          if (prepareProjects) {
            busy = true;
            host.setAttribute("aria-busy", "true");
            for (const button of host.querySelectorAll("button"))
              button.disabled = true;
            try {
              await prepareProjects(intent.projects, (text) => {
                status.textContent = text;
              });
            } catch (error) {
              status.textContent = error.message;
              return;
            } finally {
              busy = false;
              host.removeAttribute("aria-busy");
              for (const button of host.querySelectorAll("button"))
                button.disabled = false;
            }
          }
          const next = available();
          for (const kind of ["languages", "topics"])
            if (intent[kind]?.length) {
              const matching = intent[kind].filter((name) =>
                next[kind].includes(name),
              );
              intent[kind] = matching.length ? matching : null;
            }
          if (!next.topics.length) intent.topics = null;
          if (
            !next.history.eligible &&
            ["history", "3d", "surprise"].includes(intent.history)
          )
            intent.history = "current";
        }
        if (current === "topics" && !intent.topics?.length)
          intent.topics = null;
        try {
          intent = validateIntent(intent);
        } catch (error) {
          status.textContent = error.message;
          return;
        }
        save(intent);
        if (step < steps().length - 1) {
          step++;
          draw();
        } else await run();
      },
    );
    button(actions, "Open full Studio", customize);
    heading.focus();
  }
  async function run(refreshActivity = false, fresh = false) {
    if (busy) return;
    busy = true;
    host.setAttribute("aria-busy", "true");
    for (const button of host.querySelectorAll("button"))
      button.disabled = true;
    status.textContent = "Creating your constellation…";
    try {
      const diagnostic = await generate(
        intent,
        refreshActivity === true,
        fresh ? null : `smart-${account.toLowerCase()}`,
      );
      result(diagnostic);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      busy = false;
      host.removeAttribute("aria-busy");
      for (const button of host.querySelectorAll("button"))
        button.disabled = false;
    }
  }
  function result(diagnostic = "") {
    document.documentElement.dataset.entry = "result";
    document.querySelector(".observatory")?.after(host);
    document.querySelector(".observatory")?.scrollIntoView({ block: "start" });
    progress.textContent = `@${account}`;
    heading.textContent = "Your constellation is ready";
    body.replaceChildren();
    actions.replaceChildren();
    status.textContent = diagnostic || "Your project map is ready. Choose what you want to do next.";
    button(actions, "Explore my work", useDesign);
    button(actions, "Show my technical focus", () => {
      intent.topology = "automatic";
      intent.history = "current";
      run();
    });
    if (available().history.eligible)
      button(actions, "Show my project history", () => {
        intent.topology = "later";
        intent.history = "history";
        run();
      });
    button(actions, "Create a README graphic", () => {
      intent.topology = "later";
      intent.history = "current";
      intent.motion = "still";
      intent.vibe = "clean";
      run();
    });
    button(actions, "Customize", customize);
    const more = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "More options";
    const extra = document.createElement("div");
    extra.className = "guided-actions";
    button(extra, "Generate another", () => run(false, true));
    button(extra, "Edit answers", () => {
      step = 0;
      draw();
    });
    if (diagnostic) button(extra, "Retry activity", () => run(true));
    more.append(summary, extra);
    actions.append(more);
    heading.focus({ preventScroll: true });
  }
  if (enterPath) {
    heading.textContent = 'What would you like to make?';
    progress.textContent = `@${account} · ${repositories().length} public projects loaded`;
    const note = document.createElement("p");
    note.textContent = "Start with a clear project map. You can shape it or explore other views afterward.";
    body.append(note);
    button(actions, "Generate my project map", run);
    button(actions, "Show my technical focus", () => { intent.topology = "automatic"; run(); });
    if (available().history.eligible)
      button(actions, "Show my project history", () => { intent.topology = "later"; intent.history = "history"; run(); });
    button(actions, "Customize the design", customize);
    const more = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "More ways to start";
    const extra = document.createElement("div");
    extra.className = "guided-actions";
    for (const [label,path] of [["Choose a visual preset","preset"],["Explore the full Studio","studio"],["Open a saved constellation","saved"],["Take the Studio tour","tour"],["Quick guided generator","guided"]]) button(extra,label,()=>path === "guided" ? draw() : enterPath(path));
    more.append(summary, extra);
    body.append(more);
    heading.focus();
  } else draw();
  return {
    edit() {
      step = 0;
      draw();
    },
  };
}
