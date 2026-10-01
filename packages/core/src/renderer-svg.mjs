import { composeLayers, selectionForScene } from "./scene-layers.mjs";
import { renderNodeIcon } from "./theme-packs.mjs";
import { assertScene } from "./scene.mjs";
import { ringOccupancy } from "./scaling.mjs";
import { codingRhythmOptions } from "./coding-rhythm.mjs";
import { visualCSS } from "./visual-style.mjs";
import { historyOptions } from "./history/settings.mjs";
import { referenceDate } from "./history/historical-snapshot.mjs";
import { projectLifecycle } from "./history/project-lifecycle.mjs";
import { historyLayers, historyCSS } from "./history/history-svg.mjs";
import { renderTimeLapse } from "./history/time-lapse-svg.mjs";
import {
  renderCodingRhythm,
  codingRhythmCSS,
  rhythmDescription,
} from "./coding-rhythm-svg.mjs";
import { renderCredit } from "./github-mark.mjs";
import { renderAccountSun } from "./account-sun.mjs";
import {
  starfieldOptions,
  renderStarfield,
  renderClassicDust,
  starfieldCSS,
} from "./starfield.mjs";
import { activityOptions, activityForNode } from "./activity.mjs";
import { activityMarkup, activityCSS } from "./activity-effects.mjs";
import { asteroidFieldMarkup, asteroidFieldCSS } from "./asteroid-field.mjs";
import {
  connectionWeight,
  shapeDefinitions,
  decoration,
} from "./visual-mapping.mjs";
import { profileDimensions } from "./export-image.mjs";
import { focusSVG } from "./selection.mjs";
import { perspectiveOptions, perspectiveMarkup } from "./perspective.mjs";
import {
  animateRingSVG,
  ringAnimationOptions,
  floatingAnimationOptions,
} from "./ring-animation.mjs";
import { rustAvailable } from "./engine.mjs";
import { renderTemporalStackSVG } from "./temporal-stack-svg.mjs";

import { repositoryLanguages } from "./constellation.mjs";
const hash = (value) => {
  let n = [...value].reduce(
    (n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) >>> 0,
    7,
  );
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
const themes = {
  midnight: {
    background: "#080e20",
    foreground: "#e6edff",
    accent: "#9ab9ff",
    line: "#3e537e",
    star: "#f6d99b",
  },
  light: {
    background: "#f7f8fc",
    foreground: "#18213a",
    accent: "#395bbe",
    line: "#aab6d3",
    star: "#966500",
  },
};

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char],
  );
const boundedText = (value, limit) =>
  Array.from(String(value ?? ""))
    .slice(0, limit)
    .join("");

export function renderSceneSVG(visualScene, renderOptions) {
  assertScene(visualScene);
  if (visualScene.temporalStack)
    return renderTemporalStackSVG(visualScene, renderOptions);
  if (visualScene.kind === "time-lapse") {
    const { account, repositories, options, reference } =
      visualScene.presentation;
    return renderTimeLapse(
      account,
      repositories,
      {
        ...options,
        layers: Object.fromEntries(
          visualScene.latest.layers.map((layer) => [
            layer.id,
            { visible: layer.visible, opacity: layer.opacity },
          ]),
        ),
      },
      (_account, _repositories, settings) => {
        const frame =
          settings.history.mode === "historical"
            ? visualScene.frames.find(
                (frame) => frame.year === settings.history.year,
              )?.scene
            : visualScene.latest;
        if (!frame) throw new Error("Missing time-lapse scene frame.");
        return renderSceneSVG(frame);
      },
      reference,
    );
  }
  const { options, graph, sourceHasRepositories, nodeMode, hasHistory } =
    visualScene.presentation;
  const { account: name, seed } = visualScene.metadata;
  const {
    theme = "auto",
    colors = {},
    animate = true,
    css = "",
    layout = "atlas",
    title,
    bridges = false,
    connectionBasis = "languages",
  } = options;
  const compact = layout === "compact",
    height = visualScene.viewport.viewBox[3];
  const profile = {
    ...profileDimensions(options.exportProfile, height),
    width: visualScene.viewport.width,
    height: visualScene.viewport.height,
  };
  const centerY = compact ? 126 : 270,
    spreadY = compact ? 88 : 192;
  const clock = Date.parse(visualScene.metadata.referenceDate),
    reference = clock;
  const temporal = historyOptions(options),
    sky = starfieldOptions(options.starfield);
  const activitySettings = activityOptions(options),
    rhythmSettings = codingRhythmOptions(options);
  const recent = (id) =>
    activitySettings.activityEffect === "off"
      ? null
      : activityForNode(id, options.activityData);
  const transparent =
    options.transparentTheme || options.exportProfile === "transparent";
  const palette = { ...themes[theme === "auto" ? "light" : theme], ...colors };
  const perspective = perspectiveOptions(options.perspective),
    floatingAnimation = floatingAnimationOptions(options.floatingAnimation),
    ringAnimation = ringAnimationOptions(options.ringAnimation);
  const ringRotations =
    options.ringRotations ?? Array(4).fill(options.ringRotation ?? 0);
  const {
    arrangement = rustAvailable ? "rings" : "field",
    identityRing = true,
  } = options;
  const colorConnections = options.colorConnections ?? false;
  const combinedMode = nodeMode === "combined",
    categoryMode = nodeMode !== "repositories" && !combinedMode;
  const stableOverview = options.nodeCap > 100;
  const hubs = new Map();
  const stars = visualScene.nodes.map((node) => {
    const language = node.metadata.language || "Other";
    if (!hubs.has(language)) hubs.set(language, { language });
    const entry =
      options.projectShowcase?.[node.metadata.full_name] ||
      options.projectShowcase?.[node.metadata.name] ||
      null;
    return {
      repo: node.metadata,
      x: node.geometry.x,
      y: node.geometry.y,
      radius: node.geometry.radius,
      hub: hubs.get(language),
      node,
      showcase: entry
        ? {
            role: entry.role || null,
            priority: Number.isInteger(entry.priority) ? entry.priority : null,
          }
        : null,
    };
  });
  const repos = stars.map((star) => star.repo),
    ordered = repos;
  const hiddenNodes = new Set(
    visualScene.nodes
      .filter((node) => node.interaction.hidden)
      .map((node) => node.id),
  );
  const nodeColors = Object.fromEntries(
    visualScene.nodes
      .filter((node) => node.style.color)
      .map((node) => [node.id, node.style.color]),
  );
  const visibleStars = stars.filter(
    (star) => !hiddenNodes.has(star.repo.full_name),
  );
  const showcaseRoles = new Set(
    [...visibleStars].flatMap((star) =>
      star.showcase?.role ? [star.showcase.role] : [],
    ),
  );
  const featuredTreatment = options.featuredTreatment || "label";
  const roleCSS = showcaseRoles.size
    ? `
.repo-label[data-role="featured"]{fill:var(--sky-foreground);opacity:1;font-weight:700}.repo-label[data-role="supporting"]{opacity:.82}.repo-label[data-role="experimental"]{opacity:.72}.repo-label[data-role="historical"]{opacity:.55}
.star[data-role="featured"]{stroke:var(--sky-foreground);stroke-width:1.1}.star[data-role="supporting"]{stroke:var(--sky-foreground);stroke-width:.8}.star[data-role="experimental"]{opacity:.8}.star[data-role="historical"]{opacity:.65}${featuredTreatment === "star" ? '.repo-label[data-role="featured"]{font-weight:600;opacity:.76}' : ""}${featuredTreatment === "spotlight" ? ".showcase-spotlight{font-size:9px;pointer-events:none;fill:var(--sky-foreground)}.showcase-spotlight .spotlight-name{font-size:10px;font-weight:700}.showcase-spotlight .spotlight-detail{opacity:.78}" : ""}`
    : "";
  const spotlightIds = new Set();
  if (
    featuredTreatment === "spotlight" &&
    !["compact", "wide", "readme", "repository"].includes(options.exportProfile)
  ) {
    const candidates = [...visibleStars]
      .filter(
        (star) =>
          star.showcase?.role === "featured" &&
          (!star.repo.nodeKind || star.repo.nodeKind === "repository"),
      )
      .sort(
        (a, b) =>
          (a.showcase.priority ?? 9999) - (b.showcase.priority ?? 9999) ||
          a.repo.full_name.localeCompare(b.repo.full_name),
      );
    for (const star of candidates) {
      if (spotlightIds.size === 3) break;
      if (
        [...spotlightIds].some((id) => {
          const other = visibleStars.find((item) => item.repo.full_name === id);
          return Math.hypot(other.x - star.x, other.y - star.y) < 132;
        })
      )
        continue;
      spotlightIds.add(star.repo.full_name);
    }
  }
  const showcaseDescription = [...visibleStars]
    .filter((star) => star.showcase?.role)
    .map(
      (star) =>
        `${star.repo.name}: ${star.showcase.role}${star.showcase.priority ? `, priority ${star.showcase.priority}` : ""}`,
    )
    .join(". ");
  const hasShowcaseDescription = Boolean(
    showcaseDescription ||
    options.readmePresentation ||
    options.ringOrganization ||
    options.featuredTreatment,
  );
  const profileDescriptionMarkup = visualScene.developerProfile
    ? `<desc id="developer-profile-description">${escape(visualScene.developerProfile.signature)}. ${visualScene.developerProfile.dimensions
        .filter((dimension) => dimension.evidence.length)
        .map(
          (dimension) =>
            `${dimension.id}: ${dimension.evidence.map((item) => `${item.repository}, ${item.reason}`).join("; ")}`,
        )
        .join(". ")}</desc>\n`
    : "";
  const showcaseDescriptionMarkup =
    profileDescriptionMarkup +
    (hasShowcaseDescription
      ? `<desc id="showcase-description">${showcaseDescription ? `Project showcase roles: ${escape(showcaseDescription)}.` : "No explicit project showcase roles are set."}${options.readmePresentation === "current-focus" && !Object.keys(options.activityData?.repositories || {}).length ? " Current-focus presentation has no recent activity snapshot; existing ordering is retained." : ""}</desc>\n`
      : "");
  const byId = new Map(stars.map((star) => [star.repo.full_name, star]));
  const selectedEdges = new Set(
    visualScene.edges.map((edge) => ({
      ...edge.metadata,
      from: byId.get(edge.from),
      to: byId.get(edge.to),
      distance: edge.geometry.distance,
      primary: edge.style.primary,
    })),
  );
  const backbone = new Set([...selectedEdges].filter((edge) => edge.primary));
  const generatedLabel = options.generatedAt
    ? "Generated " +
      new Date(options.generatedAt)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ") +
      " UTC"
    : "";
  const variables = (values) =>
    Object.entries(values)
      .map(([key, value]) => `--sky-${key}:${value}`)
      .join(";");
  const paletteCSS =
    `svg{${variables(palette)}}` +
    (theme === "auto"
      ? `@media(prefers-color-scheme:dark){svg{${variables({ ...themes.midnight, ...colors })}}}`
      : "");
  const organizationEras =
    arrangement === "era-rings"
      ? [
          ...new Set(repos.map((repo) => repo.organizationGroup || repo.name)),
        ].sort()
      : [];
  const eraRings = organizationEras
    .map(
      (era, i) =>
        `<ellipse class="organization-era-ring" cx="450" cy="${centerY}" rx="${((365 * (i + 1)) / (organizationEras.length + 1)).toFixed(1)}" ry="${(((compact ? 85 : 190) * (i + 1)) / (organizationEras.length + 1)).toFixed(1)}" fill="none" stroke="var(--sky-accent)" stroke-opacity=".18" stroke-dasharray="2 5"><title>${escape(era)}</title></ellipse>`,
    )
    .join("");
  const historyLayer = hasHistory
    ? historyLayers(
        name,
        visualScene.presentation.historyRepositories,
        options,
        { centerY, spreadY, height },
      )
    : { markup: "", note: "", description: "" };
  const dust = renderClassicDust(options.seedMode ? seed : name, {
    compact,
    count: profile.dustCount,
  });
  const edges = [...selectedEdges]
    .sort((a, b) => Number(backbone.has(a)) - Number(backbone.has(b)))
    .map((edge, index) => {
      const {
        from,
        to,
        shared,
        sharedLanguages,
        sharedTopics,
        sharedRepositories = [],
      } = edge;
      const featuredEdge =
        from.showcase?.role === "featured" || to.showcase?.role === "featured";
      const dx = to.x - from.x,
        dy = to.y - from.y;
      const length = Math.sqrt(edge.distance) || 1;
      const bend = Math.min(18, length * 0.08) * (hash(edge.key) % 2 ? 1 : -1);
      const cx = (from.x + to.x) / 2 - (dy / length) * bend;
      const cy = (from.y + to.y) / 2 + (dx / length) * bend;
      const gradientId = `connection-color-${index}`;
      const gradient = colorConnections
        ? `<defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}"><stop stop-color="${nodeColors[from.repo.full_name] || "var(--sky-star)"}"/><stop offset="1" stop-color="${nodeColors[to.repo.full_name] || "var(--sky-star)"}"/></linearGradient></defs>`
        : "";
      const weight =
        connectionWeight(edge, options.connectionWeight) ||
        (graph.focus || featuredEdge ? {} : null);
      if (graph.focus) {
        const direct =
          from.repo.full_name === graph.focus ||
          to.repo.full_name === graph.focus;
        weight.width = direct ? 2.5 : 1;
        weight.opacity = direct
          ? 0.95
          : from.repo.organizationFocus && to.repo.organizationFocus
            ? 0.3
            : 0.05;
      }
      if (featuredEdge) {
        weight.width = Math.max(weight.width || 0, 1.6);
        weight.opacity = Math.max(weight.opacity || 0, 0.78);
      }
      const activeWeight = activitySettings.activityConnections
        ? Math.max(
            recent(from.repo.full_name)?.score || 0,
            recent(to.repo.full_name)?.score || 0,
          )
        : 0;
      const edgeStyle = [
        colorConnections ? `stroke:url(#${gradientId})` : "",
        weight
          ? `stroke-width:${weight.width.toFixed(2)};opacity:${weight.opacity.toFixed(2)}`
          : "",
        activeWeight
          ? `opacity:${Math.min(0.85, (weight?.opacity ?? (backbone.has(edge) ? 0.62 : 0.13)) + activeWeight * 0.2).toFixed(3)}`
          : "",
      ]
        .filter(Boolean)
        .join(";");
      return `${gradient}<path class="shared-language"${edgeStyle ? ` style="${edgeStyle}"` : ""}${featuredEdge ? ' data-showcase="featured"' : ""} data-from="${escape(from.repo.full_name)}" data-to="${escape(to.repo.full_name)}" data-languages="${escape(sharedLanguages.join(", "))}" data-topics="${escape(sharedTopics.join(", "))}" data-repositories="${escape(sharedRepositories.join(", "))}" data-emphasis="${backbone.has(edge) ? "primary" : "secondary"}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}"><title>${escape(from.repo.name)} ↔ ${escape(to.repo.name)} · ${escape(shared.join(", "))}</title></path>`;
    })
    .join("");
  // Join language regions with the shortest available visual bridges. These are
  // composition guides, not inferred technical relationships or dependencies.
  const bridgeLines = [];
  if (bridges && !combinedMode && !categoryMode && visibleStars.length > 1) {
    const joined = new Set([visibleStars[0].hub]);
    while (joined.size < new Set(visibleStars.map((star) => star.hub)).size) {
      let best = { distance: Infinity };
      for (const from of visibleStars.filter((star) => joined.has(star.hub))) {
        for (const to of visibleStars.filter((star) => !joined.has(star.hub))) {
          const distance = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
          if (distance < best.distance) best = { from, to, distance };
        }
      }
      bridgeLines.push(
        `<path d="M${best.from.x.toFixed(1)} ${best.from.y.toFixed(1)}L${best.to.x.toFixed(1)} ${best.to.y.toFixed(1)}"><title>Visual bridge: ${escape(best.from.repo.name)} to ${escape(best.to.repo.name)}. No technical relationship implied.</title></path>`,
      );
      joined.add(best.to.hub);
    }
  }
  const profileNodeAffinities = new Map(
    (visualScene.developerProfile?.nodes || []).map((item) => [
      item.node,
      item.dimensions,
    ]),
  );
  const profileDimensionIds =
    visualScene.developerProfile?.dimensions.map((dimension) => dimension.id) ||
    [];
  const profileDimensionAttributes = (id) => {
    const affinity = profileNodeAffinities.get(id);
    if (!affinity) return "";
    const dimensions = profileDimensionIds.filter(
      (_dimension, index) => affinity[index] > 0,
    );
    return dimensions.length
      ? ` data-profile-dimensions="${escape(dimensions.join(" "))}"`
      : "";
  };
  const points = visibleStars
    .map(({ repo, x, y, node, showcase }) => {
      const customIcon = renderNodeIcon(node.icon, {
        x,
        y,
        radius: node.geometry.radius,
      });
      const lifecycle =
        temporal.stellarAges.enabled &&
        (!repo.nodeKind || repo.nodeKind === "repository")
          ? projectLifecycle(
              repo,
              clock,
              temporal.stellarAges.thresholds,
              options.historyData?.events || [],
            )
          : null;
      const lifecycleAttributes = lifecycle
        ? ` data-lifecycle="${lifecycle === "archived" && !temporal.stellarAges.showArchivedRemnants ? "quiet" : lifecycle}" data-age-mode="${temporal.stellarAges.mode}"`
        : "";
      const radius = node.geometry.radius;
      const glow = node.style.glow;
      const shape = node.style.shape;
      const role = showcase?.role || "";
      const profileAttributes = profileDimensionAttributes(repo.full_name);
      const priority = showcase?.priority ?? 0;
      const activity =
        !repo.nodeKind || repo.nodeKind === "repository"
          ? recent(repo.full_name)
          : null;
      const activityAttributes = activity
        ? ` data-activity-score="${activity.score.toFixed(3)}" data-activity-count="${escape(activity.eventCount)}" data-latest-activity="${escape(activity.latestEventAt)}"`
        : "";
      const activityLayer =
        activitySettings.activityEffect === "asteroids"
          ? !repo.nodeKind || repo.nodeKind === "repository"
            ? asteroidFieldMarkup({
                x,
                y,
                radius,
                id: repo.full_name,
                snapshot:
                  options.commitFieldData?.[repo.full_name.toLowerCase()],
                reference: clock,
                animate: animate && options.activityAnimate !== false,
              })
            : ""
          : activityMarkup({
              x,
              y,
              radius,
              id: repo.full_name,
              activity,
              effect: activitySettings.activityEffect,
              detail: activitySettings.activityDetail,
              seed,
              animate: animate && options.activityAnimate !== false,
            });
      const phaseHour =
        rhythmSettings.codingRhythm &&
        rhythmSettings.codingRhythmStyle !== "hidden" &&
        rhythmSettings.codingRhythmProjectHints
          ? options.codingRhythmData?.projectHours?.[repo.full_name]
          : undefined;
      const phaseHint =
        Number.isInteger(phaseHour) && phaseHour >= 0 && phaseHour < 24
          ? ` style="opacity:${(0.065 + (phaseHour / 24) * 0.025).toFixed(3)}"`
          : "";
      const roleOverlay = role
        ? ` data-role="${escape(role)}" data-showcase-priority="${priority}"`
        : "";
      const starStyle = `${customIcon ? "fill:transparent;stroke:none;" : ""}${repo.organizationFocus ? "stroke:var(--sky-accent);stroke-width:1.5;" : ""}${shape !== "circle" ? `clip-path:url(#shape-${shape});` : ""}${glow !== null ? `filter:drop-shadow(0 0 ${(glow * 4).toFixed(2)}px var(--node-color,var(--sky-star)));` : ""}`;
      const groupStyle =
        (Object.hasOwn(nodeColors, repo.full_name)
          ? `--node-color:${nodeColors[repo.full_name]}`
          : "") +
        (node.style.opacity !== undefined && node.style.opacity !== 1
          ? `;opacity:${(node.style.opacity * (graph.focus && !repo.organizationFocus ? 0.22 : 1)).toFixed(4)}${node.style.opacity === 0 ? ";display:none" : ""}`
          : "");
      const createdYear =
        options.readmePresentation === "project-journey" &&
        repo.created_at &&
        Number.isFinite(Date.parse(repo.created_at))
          ? ` · Created ${new Date(repo.created_at).getUTCFullYear()}`
          : "";
      const tooltip = repo.commit
        ? `${repo.commit.author} · ${repo.commit.date || "Date unknown"} · ${repo.commit.subject} · ${repo.commit.sha}${repo.commit.parents > 1 ? " · merge commit" : ""}`
        : repo.nodeKind && repo.nodeKind !== "repository"
          ? Array.isArray(repo.members)
            ? `${repo.name} · ${repo.representedCount || repo.members.length} repositories · ${repo.members.join(", ")}`
            : `${repo.name} · ${repo.nodeKind}`
          : `${repo.full_name} · ${repo.stargazers_count || 0} stars${repo.fork ? " · fork" : ""} · ${repositoryLanguages(repo).join(", ") || "No detected languages"}${role ? ` · Role: ${role}` : ""}${createdYear}`;
      let spotlightMarkup = "";
      if (spotlightIds.has(repo.full_name)) {
        const description =
          typeof repo.description === "string"
            ? boundedText(repo.description.trim(), 54)
            : "";
        const technologies = boundedText(
          repositoryLanguages(repo)
            .slice(0, 3)
            .map((value) => boundedText(value, 18))
            .join(" · "),
          60,
        );
        const align = x > 610 ? "end" : "start",
          calloutX =
            x > 610
              ? Math.max(36, x - radius - 8)
              : Math.min(864, x + radius + 8);
        const calloutY = Math.max(24, Math.min(height - 48, y - 14));
        const accessible = `${repo.name}, Featured${description ? `. ${description}` : ""}${technologies ? `. ${technologies}` : ""}`;
        spotlightMarkup = `<g class="showcase-spotlight" role="group" aria-label="${escape(accessible)}" text-anchor="${align}"><text class="spotlight-name" x="${calloutX.toFixed(1)}" y="${calloutY.toFixed(1)}">${escape(repo.name.toUpperCase().slice(0, 28))}</text>${description ? `<text class="spotlight-detail" x="${calloutX.toFixed(1)}" y="${(calloutY + 12).toFixed(1)}">${escape(description)}</text>` : ""}${technologies ? `<text class="spotlight-detail" x="${calloutX.toFixed(1)}" y="${(calloutY + (description ? 24 : 12)).toFixed(1)}">${escape(technologies)}</text>` : ""}</g>`;
      }
      return `<g class="repository${role ? ` showcase-${role}` : ""}"${profileAttributes}${graph.focus && !repo.organizationFocus ? ' opacity=".22"' : ""}${repo.organizationFocal ? ' data-organization-user="true"' : ""}${repo.organizationFocus ? ' data-organization-focus="true"' : ""}${roleOverlay}${lifecycleAttributes}${activityAttributes}${groupStyle ? ` style="${groupStyle}"` : ""}><title>${escape(tooltip)}${lifecycle ? ` · ${lifecycle}` : ""}</title>${activityLayer}<circle class="star-halo"${phaseHint} cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius + 4).toFixed(1)}"/><circle class="star${role ? ` role-${role}` : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" data-repo="${escape(repo.full_name)}" data-label="${escape(repo.name)}" data-kind="${escape(repo.nodeKind || "repository")}"${profileAttributes}${roleOverlay}${repo.commit ? ` data-commit="${escape(repo.commit.repository + "/commit/" + repo.commit.sha)}"` : ""} data-members="${escape(JSON.stringify(repo.members || [repo.full_name]))}" style="${starStyle}animation-delay:-${(hash(options.seedMode ? `${seed}:${repo.full_name}` : repo.full_name) % 60) / 10}s"/><circle class="star-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"${customIcon ? ' style="display:none"' : ""}/>${customIcon}${spotlightMarkup}</g>`;
    })
    .join("");
  const labels = visualScene.labels
    .map((label) => {
      const repo = visibleStars.find(
        (star) => star.repo.full_name === label.id,
      )?.repo;
      const role =
        visibleStars.find((star) => star.repo.full_name === label.id)?.showcase
          ?.role || "";
      const roleAttr = role ? ` data-role="${escape(role)}"` : "";
      const profileAttr = profileDimensionAttributes(label.id);
      return label.focal
        ? `<text class="repo-label organization-person-label" data-repo="${escape(label.id)}"${profileAttr}${roleAttr} x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" style="font-size:15px;font-weight:700">${escape(label.text)}</text>`
        : `<text class="repo-label" data-repo="${escape(label.id)}"${profileAttr}${roleAttr} x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}"${label.hidden ? ' style="display:none"' : ""}>${escape(label.text)}</text>`;
    })
    .join("");
  if (
    options.snapToRings !== undefined &&
    typeof options.snapToRings !== "boolean"
  )
    throw new Error("snapToRings must be a boolean.");
  const geometry = visualScene.geometry.identity;
  const ringMarkup = geometry
    ? Array.from({ length: 4 }, (_, index) => {
        const ring = geometry.slice(2 + index * 22, 24 + index * 22);
        return `<g><circle class="identity-arc" data-ring="${index}" cx="240" cy="240" r="${ring[0]}" stroke-dasharray="${ring[2]} ${ring[3]}" transform="rotate(${(ring[1] + ringRotations[index]) % 360} 240 240)"/></g>`;
      }).join("")
    : "";
  const ringPoints = visualScene.geometry.ringPoints;
  const occupiedAt = stableOverview ? ringOccupancy(stars) : null;
  const pointMarkup = Array.from({ length: ringPoints.length / 3 }, (_, i) => {
    const [x, y, radius] = ringPoints.slice(i * 3, i * 3 + 3);
    const sx = Number((450 + ((x - 240) * 368) / 172).toFixed(1));
    const sy = Number((centerY + ((y - 240) * spreadY) / 172).toFixed(1));
    const owner = ordered[i];
    const hidden = hiddenNodes.has(owner.full_name);
    const occupied = occupiedAt
      ? occupiedAt(sx, sy)
      : stars
          .filter((star) => Math.hypot(star.x - sx, star.y - sy) < 1)
          .map((star) => star.repo.full_name);
    if (hidden && !occupied.includes(owner.full_name))
      occupied.push(owner.full_name);
    return `<circle class="identity-point" data-node="${escape(owner.full_name)}"${hidden ? ' style="display:none"' : ""} cx="${x}" cy="${y}" r="${radius}" data-snap-x="${sx}" data-snap-y="${sy}" data-occupied="${escape(JSON.stringify(occupied))}"/>`;
  }).join("");
  const camera = perspectiveMarkup(perspective, centerY, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title description${hasShowcaseDescription ? " showcase-description" : ""}${visualScene.developerProfile ? " developer-profile-description" : ""}">
<title id="title">${escape(title ?? `${name}’s GitHub constellation`)}</title>
${showcaseDescriptionMarkup}<desc id="description">${graph.commits ? escape(graph.note || "Commit constellation") : graph.organization ? escape(`Organization universe. ${visibleStars.length} nodes, ${selectedEdges.size} bounded connections. Contributor diamonds connect through shared projects; project and technology views show repository relationships. Contributor size reflects represented repository count. ${graph.note}`) : `${visibleStars.length} ${combinedMode ? `repository, language and topic nodes from ${graph.repositoryCount} public repositories` : categoryMode ? `${nodeMode} from ${graph.repositoryCount} public repositories` : "public repositories"} arranged in a deterministic ${arrangement === "rings" ? "identity ring point layout" : arrangement === "field" ? "star field" : arrangement === "orbital" ? "orbital layout" : "force layout"}. ${combinedMode ? `Lines connect repositories directly to their languages and topics. Showing ${visibleStars.length} of ${graph.total} nodes.` : categoryMode ? `Solid lines connect ${nodeMode} appearing in the same repository. Showing ${repos.length} of ${graph.total} categories, ranked by repository count.` : `Solid lines connect projects through selected ${connectionBasis === "both" ? "languages and topics" : connectionBasis}; detected languages include secondary languages; dotted bridges join nearby groups visually and do not represent dependencies.`} ${selectedEdges.size} of ${visualScene.presentation.totalConnections} shared connections shown. Brighter paths emphasize nearby relationships; faint paths preserve the remaining selected overlaps. Star size reflects ${combinedMode ? "GitHub stars for repositories and repository count for categories" : categoryMode ? "repository count" : "GitHub stars"}. ${geometry ? "Identity rings are seeded by the account name; ring points provide placement anchors for nodes. " : ""}${visibleStars.map((star) => escape(star.repo.name)).join(", ")}.${escape(rhythmDescription(options.codingRhythmData, rhythmSettings))}${escape(historyLayer.description)} ${escape(graph.note || "")}`}</desc>
<defs>${graph.organization || (options.nodeShape && options.nodeShape !== "circle") ? shapeDefinitions : ""}<radialGradient id="nebula"><stop stop-color="var(--sky-background)" stop-opacity=".13"/><stop offset="1" stop-color="var(--sky-background)" stop-opacity="0"/></radialGradient><filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>
${hasHistory ? historyCSS : ""}${paletteCSS}${rhythmSettings.codingRhythm ? codingRhythmCSS : ""}
svg{background:transparent;border:none;outline:none;color:var(--sky-foreground);font:13px system-ui,sans-serif}text{fill:currentColor}.background{fill:none;stroke:none}.dust{fill:var(--sky-foreground)}.connections{fill:none;stroke:var(--sky-line);stroke-width:.9;opacity:.8}.shared-language{stroke-linecap:round}.shared-language[data-emphasis="primary"]{stroke:var(--sky-accent);opacity:.62}.shared-language[data-emphasis="secondary"]{opacity:.13}.star{fill:var(--sky-star);${animate && options.starlightAnimate !== false ? "animation:twinkle 6s ease-in-out infinite;" : ""}}.language circle{fill:var(--sky-accent)}.language text{text-anchor:middle;fill:var(--sky-accent);font-weight:600}.repo-label{text-anchor:middle;font-size:10px;stroke:none}.caption{font-size:12px;opacity:.65}.heading{font-size:23px;font-weight:600}@keyframes twinkle{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.star{animation:none}}
.star{filter:url(#glow)}.star-halo{fill:var(--sky-star);opacity:.07}.star-core{fill:var(--sky-foreground);opacity:.9;pointer-events:none}.language text{font-size:10px;letter-spacing:2px;font-weight:500}.repo-label{fill:var(--sky-foreground);opacity:.68}${roleCSS}.heading{font-size:20px;letter-spacing:-.5px}.chart-guide{fill:none;stroke:var(--sky-line);stroke-width:.5;opacity:.28}
.bridges{fill:none;stroke:var(--sky-accent);stroke-width:1;stroke-dasharray:2 5;opacity:.35}
.identity-ring{fill:none;stroke:var(--sky-accent);stroke-width:.65;opacity:.14;pointer-events:none}.identity-point{fill:var(--sky-accent);stroke:none}
.star[data-kind="language"]{stroke:var(--sky-foreground);stroke-width:.8}.star[data-kind="topic"]{stroke:var(--sky-foreground);stroke-width:1;stroke-dasharray:2 2}${showcaseRoles.size ? `.star[data-role="featured"]{stroke:var(--sky-foreground);stroke-width:1.1}.star[data-role="supporting"]{stroke:var(--sky-foreground);stroke-width:.8}.star[data-role="experimental"]{opacity:.8}.star[data-role="historical"]{opacity:.65}` : ""}
.star,.star-halo{fill:var(--node-color,var(--sky-star))}
.credit{font-size:9px;opacity:.65;fill:var(--sky-accent);text-anchor:end}a{text-decoration:none}
.generated-at{font-size:9px;opacity:.6;fill:var(--sky-foreground);text-anchor:start}
${compact ? ".heading{font-size:17px}.language text{font-size:13px;letter-spacing:.5px}.caption{font-size:12px;opacity:.8}.connections{stroke-width:.9;opacity:.8}" : ""}
${options.visualStyle ? escape(visualCSS(options.visualStyle)) : ""}${escape(css)}${activitySettings.activityEffect === "asteroids" ? asteroidFieldCSS : activitySettings.activityEffect !== "off" ? activityCSS : ""}
${["space", "milky-way"].includes(sky.mode) ? starfieldCSS : ""}
${transparent ? "svg{background:transparent!important}.background{fill:none!important}" : ""}
</style>
${composeLayers(visualScene, "backdrop", {
  background: `<rect class="background" width="900" height="${height}" rx="${compact ? 12 : 18}"/>
${transparent ? "" : `<ellipse cx="440" cy="${height / 2}" rx="420" ry="${height * 0.43}" fill="url(#nebula)"/>`}

`,
  effects: `${decoration(options, height, visibleStars)}
`,
  starfield: `${renderStarfield(seed, sky, { height, detail: profile.dustCount / 85, animate, transparent })}`,
})}
<!--history-scene-start-->${composeLayers(visualScene, "underlay", { annotations: `${eraRings}${historyLayer.markup}${renderCodingRhythm(options.codingRhythmData, rhythmSettings, { centerY, spreadY, height, legend: options.legend })}` })}${camera.start}${composeLayers(visualScene, "world", { rings: `${geometry ? `<g class="identity-ring" aria-hidden="true"${identityRing ? "" : ' style="display:none"'} transform="translate(450 ${centerY}) scale(${368 / 172} ${spreadY / 172}) translate(-240 -240)">${ringMarkup}${pointMarkup}</g>` : ""}`, starfield: `${sky.mode === "classic" ? `<g class="dust">${dust}</g>` : ""}`, connections: `<g class="bridges">${bridgeLines.join("")}</g><g class="connections">${edges}</g>`, nodes: `${renderAccountSun(name, options, centerY, escape)}${points}`, labels: `${labels}` })}${camera.end}<!--history-scene-end-->${composeLayers(
    visualScene,
    "overlay",
    {
      annotations: `${(visualScene.annotations || []).map((annotation) => `<text class="scene-annotation" x="${annotation.x}" y="${annotation.y}">${escape(annotation.text)}</text>`).join("")}${historyLayer.note}${options.organizationUser && graph.organization ? `<g class="organization-focus-caption"><text x="450" y="26" text-anchor="middle" font-size="16" font-weight="600">@${escape(options.organizationUser)} → ${escape(name)}</text><text x="450" y="43" text-anchor="middle" font-size="10">${graph.focus ? `${graph.focusProjects.length} connected projects · bright lines show direct participation` : "No verified connection in the loaded results; expand or refresh the scan"}</text></g>` : ""}${graph.organization ? `<text class="organization-coverage" x="450" y="${height - 34}" text-anchor="middle" font-size="9">${escape(`${graph.nodeCount} nodes · ${graph.repositoryCount} selected projects · ${options.organizationData?.scanned || 0} repositories scanned for contributors`)}<title>${escape(graph.note)}</title></text>` : ""}
${visibleStars.length ? "" : `<text x="450" y="${height / 2}" text-anchor="middle">${repos.length ? "All nodes are hidden. Restore visibility in Individual nodes." : graph.emptyMessage ? escape(graph.emptyMessage) : categoryMode && graph.repositoryCount ? `No ${nodeMode} in the matching repositories.` : sourceHasRepositories ? "No projects match these filters or historical year." : options.repoSource === "pinned" ? "No public pinned repositories match this selection." : "No public repositories to show yet."}</text>`}
${options.legend ? `<text class="mapping-legend" x="32" y="${height - 30}" font-size="9">${escape(`Size: ${options.nodeSize || options.sizingMode || "legacy"} · Glow: ${options.nodeGlowMode || "uniform"} · Color: ${options.nodeColorMode || "custom"} · Links: ${options.connectionWeight || "uniform"}${activitySettings.activityEffect === "asteroids" ? " · Asteroids: latest 24 loaded commits per repository" : activitySettings.activityEffect !== "off" ? ` · ${activitySettings.activityEffect}: public activity / ${["1d", "7d", "30d"].includes(options.activityData?.window) ? options.activityData.window : activitySettings.activityWindow}` : ""}`)}</text>` : ""}
${generatedLabel ? `<text class="generated-at" x="32" y="${height - 14}">${generatedLabel}</text>` : ""}
`,
    },
  )}${renderCredit(height)}
</svg>\n`;
  return animateRingSVG(
    focusSVG(svg, selectionForScene(visualScene)),
    ringAnimation,
    geometry,
    visibleStars,
    centerY,
    spreadY,
    escape,
    floatingAnimation,
    Array.from({ length: ringPoints.length / 3 }, (_, i) => ({
      x: 450 + ((ringPoints[i * 3] - 240) * 368) / 172,
      y: centerY + ((ringPoints[i * 3 + 1] - 240) * spreadY) / 172,
    })),
  );
}
