import { renderNodeIcon } from './theme-packs.mjs';
import { ringOccupancy } from './scaling.mjs';
import { codingRhythmOptions } from './coding-rhythm.mjs';
import { visualCSS } from './visual-style.mjs';
import { historyOptions } from './history/settings.mjs';
import { referenceDate } from './history/historical-snapshot.mjs';
import { projectLifecycle } from './history/project-lifecycle.mjs';
import { historyLayers, historyCSS } from './history/history-svg.mjs';
import { renderTimeLapse } from './history/time-lapse-svg.mjs';
import { renderCodingRhythm, codingRhythmCSS, rhythmDescription } from './coding-rhythm-svg.mjs';
import { githubMark } from './github-mark.mjs';
import { starfieldOptions, renderStarfield, starfieldCSS } from './starfield.mjs';
import { activityOptions, activityForNode } from './activity.mjs';
import { activityMarkup, activityCSS } from './activity-effects.mjs';
import { connectionWeight, shapeDefinitions, decoration } from './visual-mapping.mjs';
import { nodeRadius } from './node-sizing.mjs';
import { profileDimensions } from './export-image.mjs';
import { focusSVG } from './selection.mjs';
import { perspectiveOptions, perspectiveMarkup } from './perspective.mjs';
import { animateRingSVG, ringAnimationOptions, floatingAnimationOptions } from './ring-animation.mjs';
import { rustAvailable } from './engine.mjs';

import { repositoryLanguages } from './constellation.mjs';
const hash = value => {
  let n = [...value].reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) >>> 0, 7);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
const themes = {
  midnight: { background: '#111111', foreground: '#f3f3f4', accent: '#e3de13', line: '#555a38', star: '#e3de13' },
  light: { background: '#fafaf3', foreground: '#202516', accent: '#595600', line: '#838d66', star: '#8b8500' },
};

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function renderSceneSVG(visualScene) {
  if (visualScene.kind === 'time-lapse') {
    const { account, repositories, options, reference } = visualScene.presentation;
    return renderTimeLapse(account, repositories, options, (_account, _repositories, settings) => {
      const frame = settings.history.mode === 'historical' ? visualScene.frames.find(frame => frame.year === settings.history.year)?.scene : visualScene.latest;
      if (!frame) throw new Error('Missing time-lapse scene frame.');
      return renderSceneSVG(frame);
    }, reference);
  }
  const { options, graph, sourceHasRepositories, nodeMode, hasHistory } = visualScene.presentation;
  const { account: name, seed } = visualScene.metadata;
  const { theme = 'auto', colors = {}, animate = true, css = '', layout = 'atlas', title, bridges = false, connectionBasis = 'languages' } = options;
  const compact = layout === 'compact', height = visualScene.viewport.viewBox[3];
  const profile = { ...profileDimensions(options.exportProfile, height), width: visualScene.viewport.width, height: visualScene.viewport.height };
  const centerY = compact ? 126 : 270, spreadY = compact ? 88 : 192;
  const clock = Date.parse(visualScene.metadata.referenceDate), reference = clock;
  const temporal = historyOptions(options), sky = starfieldOptions(options.starfield);
  const activitySettings = activityOptions(options), rhythmSettings = codingRhythmOptions(options);
  const recent = id => activitySettings.activityEffect === 'off' ? null : activityForNode(id, options.activityData);
  const transparent = options.transparentTheme || options.exportProfile === 'transparent';
  const palette = { ...themes[theme === 'auto' ? 'light' : theme], ...colors };
  const perspective = perspectiveOptions(options.perspective), floatingAnimation = floatingAnimationOptions(options.floatingAnimation), ringAnimation = ringAnimationOptions(options.ringAnimation);
  const ringRotations = options.ringRotations ?? Array(4).fill(options.ringRotation ?? 0);
  const { arrangement = rustAvailable ? 'rings' : 'field', identityRing = true } = options;
  const colorConnections = options.colorConnections ?? false;
  const combinedMode = nodeMode === 'combined', categoryMode = nodeMode !== 'repositories' && !combinedMode;
  const stableOverview = options.nodeCap > 100;
  const hubs = new Map();
  const stars = visualScene.nodes.map(node => {
    const language = node.metadata.language || 'Other';
    if (!hubs.has(language)) hubs.set(language, { language });
    return { repo: node.metadata, x: node.geometry.x, y: node.geometry.y, radius: node.geometry.radius, hub: hubs.get(language), node };
  });
  const repos = stars.map(star => star.repo), ordered = repos;
  const hiddenNodes = new Set(visualScene.nodes.filter(node => node.interaction.hidden).map(node => node.id));
  const nodeColors = Object.fromEntries(visualScene.nodes.filter(node => node.style.color).map(node => [node.id, node.style.color]));
  const visibleStars = stars.filter(star => !hiddenNodes.has(star.repo.full_name));
  const byId = new Map(stars.map(star => [star.repo.full_name, star]));
  const selectedEdges = new Set(visualScene.edges.map(edge => ({ ...edge.metadata, from: byId.get(edge.from), to: byId.get(edge.to), distance: edge.geometry.distance, primary: edge.style.primary })));
  const backbone = new Set([...selectedEdges].filter(edge => edge.primary));
  const generatedLabel = options.generatedAt ? 'Generated ' + new Date(options.generatedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC' : '';
  const variables = values => Object.entries(values).map(([key, value]) => `--sky-${key}:${value}`).join(';');
  const paletteCSS = `svg{${variables(palette)}}` + (theme === 'auto' ? `@media(prefers-color-scheme:dark){svg{${variables({ ...themes.midnight, ...colors })}}}` : '');
  const organizationEras = arrangement === 'era-rings' ? [...new Set(repos.map(repo => repo.organizationGroup || repo.name))].sort() : [];
  const eraRings = organizationEras.map((era, i) => `<ellipse class="organization-era-ring" cx="450" cy="${centerY}" rx="${(365 * (i + 1) / (organizationEras.length + 1)).toFixed(1)}" ry="${((compact ? 85 : 190) * (i + 1) / (organizationEras.length + 1)).toFixed(1)}" fill="none" stroke="var(--sky-accent)" stroke-opacity=".18" stroke-dasharray="2 5"><title>${escape(era)}</title></ellipse>`).join('');
  const historyLayer = hasHistory ? historyLayers(name, visualScene.presentation.historyRepositories, options, { centerY, spreadY, height }) : { markup: '', note: '', description: '' };
  const dust = Array.from({ length: profile.dustCount }, (_, i) => `<circle cx="${20 + hash(`${options.seedMode ? seed : name}:x:${i}`) % 860}" cy="${(compact ? 58 : 90) + hash(`${options.seedMode ? seed : name}:y:${i}`) % (compact ? 180 : 405)}" r="${i % 3 ? '.6' : '1'}" opacity=".25"/>`).join('');
  const edges = [...selectedEdges].sort((a, b) => Number(backbone.has(a)) - Number(backbone.has(b))).map((edge, index) => {
    const { from, to, shared, sharedLanguages, sharedTopics, sharedRepositories = [] } = edge;
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.sqrt(edge.distance) || 1;
    const bend = Math.min(18, length * .08) * (hash(edge.key) % 2 ? 1 : -1);
    const cx = (from.x + to.x) / 2 - dy / length * bend;
    const cy = (from.y + to.y) / 2 + dx / length * bend;
    const gradientId = `connection-color-${index}`;
    const gradient = colorConnections ? `<defs><linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}"><stop stop-color="${nodeColors[from.repo.full_name] || 'var(--sky-star)'}"/><stop offset="1" stop-color="${nodeColors[to.repo.full_name] || 'var(--sky-star)'}"/></linearGradient></defs>` : '';
    const weight = connectionWeight(edge, options.connectionWeight) || (graph.focus ? {} : null);
    if (graph.focus) { const direct = from.repo.full_name === graph.focus || to.repo.full_name === graph.focus; weight.width = direct ? 2.5 : 1; weight.opacity = direct ? .95 : from.repo.organizationFocus && to.repo.organizationFocus ? .3 : .05; }
    const activeWeight = activitySettings.activityConnections ? Math.max(recent(from.repo.full_name)?.score || 0, recent(to.repo.full_name)?.score || 0) : 0;
    const edgeStyle = [colorConnections ? `stroke:url(#${gradientId})` : '', weight ? `stroke-width:${weight.width.toFixed(2)};opacity:${weight.opacity.toFixed(2)}` : '', activeWeight ? `opacity:${Math.min(.85, (weight?.opacity ?? (backbone.has(edge) ? .62 : .13)) + activeWeight * .2).toFixed(3)}` : ''].filter(Boolean).join(';');
    return `${gradient}<path class="shared-language"${edgeStyle ? ` style="${edgeStyle}"` : ''} data-from="${escape(from.repo.full_name)}" data-to="${escape(to.repo.full_name)}" data-languages="${escape(sharedLanguages.join(', '))}" data-topics="${escape(sharedTopics.join(', '))}" data-repositories="${escape(sharedRepositories.join(', '))}" data-emphasis="${backbone.has(edge) ? 'primary' : 'secondary'}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}"><title>${escape(from.repo.name)} ↔ ${escape(to.repo.name)} · ${escape(shared.join(', '))}</title></path>`;
  }).join('');
  // Join language regions with the shortest available visual bridges. These are
  // composition guides, not inferred technical relationships or dependencies.
  const bridgeLines = [];
  if (bridges && !combinedMode && !categoryMode && visibleStars.length > 1) {
    const joined = new Set([visibleStars[0].hub]);
    while (joined.size < new Set(visibleStars.map(star => star.hub)).size) {
      let best = { distance: Infinity };
      for (const from of visibleStars.filter(star => joined.has(star.hub))) {
        for (const to of visibleStars.filter(star => !joined.has(star.hub))) {
          const distance = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
          if (distance < best.distance) best = { from, to, distance };
        }
      }
      bridgeLines.push(`<path d="M${best.from.x.toFixed(1)} ${best.from.y.toFixed(1)}L${best.to.x.toFixed(1)} ${best.to.y.toFixed(1)}"><title>Visual bridge: ${escape(best.from.repo.name)} to ${escape(best.to.repo.name)}. No technical relationship implied.</title></path>`);
      joined.add(best.to.hub);
    }
  }
  const points = visibleStars.map(({ repo, x, y, node }) => {
    const customIcon = renderNodeIcon(node.icon, { x, y, radius: nodeRadius(repo, options.nodeSize || options.sizingMode, reference) });
    const lifecycle = temporal.stellarAges.enabled && (!repo.nodeKind || repo.nodeKind === 'repository') ? projectLifecycle(repo, clock, temporal.stellarAges.thresholds, options.historyData?.events || []) : null;
    const lifecycleAttributes = lifecycle ? ` data-lifecycle="${lifecycle === 'archived' && !temporal.stellarAges.showArchivedRemnants ? 'quiet' : lifecycle}" data-age-mode="${temporal.stellarAges.mode}"` : '';
    const radius = node.geometry.radius;
    const glow = node.style.glow;
    const shape = node.style.shape;
    const activity = !repo.nodeKind || repo.nodeKind === 'repository' ? recent(repo.full_name) : null;
    const activityAttributes = activity ? ` data-activity-score="${activity.score.toFixed(3)}" data-activity-count="${activity.eventCount}" data-latest-activity="${activity.latestEventAt}"` : '';
    const activityLayer = activityMarkup({ x, y, radius, id: repo.full_name, activity, effect: activitySettings.activityEffect, detail: activitySettings.activityDetail, seed, animate: animate && options.activityAnimate !== false });
    const phaseHour = rhythmSettings.codingRhythm && rhythmSettings.codingRhythmStyle !== 'hidden' && rhythmSettings.codingRhythmProjectHints ? options.codingRhythmData?.projectHours?.[repo.full_name] : undefined;
    const phaseHint = Number.isInteger(phaseHour) && phaseHour >= 0 && phaseHour < 24 ? ` style="opacity:${(.065 + phaseHour / 24 * .025).toFixed(3)}"` : '';
    const starStyle = `${customIcon ? "fill:transparent;stroke:none;" : ""}${repo.organizationFocus ? "stroke:var(--sky-accent);stroke-width:1.5;" : ""}${shape !== 'circle' ? `clip-path:url(#shape-${shape});` : ''}${glow !== null ? `filter:drop-shadow(0 0 ${(glow * 4).toFixed(2)}px var(--node-color,var(--sky-star)));` : ''}`;
    const tooltip = repo.nodeKind && repo.nodeKind !== 'repository' ? `${repo.name} · ${repo.representedCount || repo.members.length} repositories · ${repo.members.join(', ')}` : `${repo.full_name} · ${repo.stargazers_count || 0} stars${repo.fork ? ' · fork' : ''} · ${repositoryLanguages(repo).join(', ') || 'No detected languages'}`;
    return `<g class="repository"${graph.focus && !repo.organizationFocus ? ' opacity=".22"' : ""}${repo.organizationFocal ? ' data-organization-user="true"' : ""}${repo.organizationFocus ? ' data-organization-focus="true"' : ""}${lifecycleAttributes}${activityAttributes}${Object.hasOwn(nodeColors, repo.full_name) ? ` style="--node-color:${nodeColors[repo.full_name]}"` : ''}><title>${escape(tooltip)}${lifecycle ? ` · ${lifecycle}` : ''}</title>${activityLayer}<circle class="star-halo"${phaseHint} cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius + 4).toFixed(1)}"/><circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" data-repo="${escape(repo.full_name)}" data-label="${escape(repo.name)}" data-kind="${repo.nodeKind || 'repository'}" data-members="${escape(JSON.stringify(repo.members || [repo.full_name]))}" style="${starStyle}animation-delay:-${hash(options.seedMode ? `${seed}:${repo.full_name}` : repo.full_name) % 60 / 10}s"/><circle class="star-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"${customIcon ? ' style="display:none"' : ''}/>${customIcon}</g>`;
  }).join('');
  const labels = visualScene.labels.map(label => label.focal
    ? `<text class="repo-label organization-person-label" data-repo="${escape(label.id)}" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}" style="font-size:15px;font-weight:700">${escape(label.text)}</text>`
    : `<text class="repo-label" data-repo="${escape(label.id)}" x="${label.x.toFixed(1)}" y="${label.y.toFixed(1)}"${label.hidden ? ' style="display:none"' : ''}>${escape(label.text)}</text>`).join('');
  if (options.snapToRings !== undefined && typeof options.snapToRings !== 'boolean') throw new Error('snapToRings must be a boolean.');
  const geometry = visualScene.geometry.identity;
  const ringMarkup = geometry ? Array.from({ length: 4 }, (_, index) => {
    const ring = geometry.slice(2 + index * 22, 24 + index * 22);
    return `<g><circle class="identity-arc" data-ring="${index}" cx="240" cy="240" r="${ring[0]}" stroke-dasharray="${ring[2]} ${ring[3]}" transform="rotate(${(ring[1] + ringRotations[index]) % 360} 240 240)"/></g>`;
  }).join('') : '';
  const ringPoints = visualScene.geometry.ringPoints;
  const occupiedAt = stableOverview ? ringOccupancy(stars) : null;
  const pointMarkup = Array.from({ length: ringPoints.length / 3 }, (_, i) => {
    const [x, y, radius] = ringPoints.slice(i * 3, i * 3 + 3);
    const sx = Number((450 + (x - 240) * 368 / 172).toFixed(1));
    const sy = Number((centerY + (y - 240) * spreadY / 172).toFixed(1));
    const owner = ordered[i];
    const hidden = hiddenNodes.has(owner.full_name);
    const occupied = occupiedAt ? occupiedAt(sx, sy) : stars.filter(star => Math.hypot(star.x - sx, star.y - sy) < 1).map(star => star.repo.full_name);
    if (hidden && !occupied.includes(owner.full_name)) occupied.push(owner.full_name);
    return `<circle class="identity-point" data-node="${escape(owner.full_name)}"${hidden ? ' style="display:none"' : ''} cx="${x}" cy="${y}" r="${radius}" data-snap-x="${sx}" data-snap-y="${sy}" data-occupied="${escape(JSON.stringify(occupied))}"/>`;
  }).join('');
  const camera = perspectiveMarkup(perspective, centerY, height);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${profile.width}" height="${profile.height}" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title description">
<title id="title">${escape(title ?? `${name}’s GitHub constellation`)}</title>
<desc id="description">${graph.organization ? escape(`Organization universe. ${visibleStars.length} nodes, ${selectedEdges.size} bounded connections. Contributor diamonds connect through shared projects; project and technology views show repository relationships. Contributor size reflects represented repository count. ${graph.note}`) : `${visibleStars.length} ${combinedMode ? `repository, language and topic nodes from ${graph.repositoryCount} public repositories` : categoryMode ? `${nodeMode} from ${graph.repositoryCount} public repositories` : 'public repositories'} arranged in a deterministic ${arrangement === 'rings' ? 'identity ring point layout' : arrangement === 'field' ? 'star field' : arrangement === 'orbital' ? 'orbital layout' : 'force layout'}. ${combinedMode ? `Lines connect repositories directly to their languages and topics. Showing ${visibleStars.length} of ${graph.total} nodes.` : categoryMode ? `Solid lines connect ${nodeMode} appearing in the same repository. Showing ${repos.length} of ${graph.total} categories, ranked by repository count.` : `Solid lines connect projects through selected ${connectionBasis === 'both' ? 'languages and topics' : connectionBasis}; detected languages include secondary languages; dotted bridges join nearby groups visually and do not represent dependencies.`} ${selectedEdges.size} of ${visualScene.presentation.totalConnections} shared connections shown. Brighter paths emphasize nearby relationships; faint paths preserve the remaining selected overlaps. Star size reflects ${combinedMode ? 'GitHub stars for repositories and repository count for categories' : categoryMode ? 'repository count' : 'GitHub stars'}. ${geometry ? 'Identity rings are seeded by the account name; ring points provide placement anchors for nodes. ' : ''}${visibleStars.map(star => escape(star.repo.name)).join(', ')}.${escape(rhythmDescription(options.codingRhythmData, rhythmSettings))}${escape(historyLayer.description)} ${escape(graph.note || "")}`}</desc>
<defs>${graph.organization || options.nodeShape && options.nodeShape !== 'circle' ? shapeDefinitions : ''}<radialGradient id="nebula"><stop stop-color="var(--sky-background)" stop-opacity=".13"/><stop offset="1" stop-color="var(--sky-background)" stop-opacity="0"/></radialGradient><filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>
${hasHistory ? historyCSS : ''}${paletteCSS}${rhythmSettings.codingRhythm ? codingRhythmCSS : ''}
svg{background:transparent;border:none;outline:none;color:var(--sky-foreground);font:13px system-ui,sans-serif}text{fill:currentColor}.background{fill:none;stroke:none}.dust{fill:var(--sky-foreground)}.connections{fill:none;stroke:var(--sky-line);stroke-width:.9;opacity:.8}.shared-language{stroke-linecap:round}.shared-language[data-emphasis="primary"]{stroke:var(--sky-accent);opacity:.62}.shared-language[data-emphasis="secondary"]{opacity:.13}.star{fill:var(--sky-star);${animate && options.starlightAnimate !== false ? 'animation:twinkle 6s ease-in-out infinite;' : ''}}.language circle{fill:var(--sky-accent)}.language text{text-anchor:middle;fill:var(--sky-accent);font-weight:600}.repo-label{text-anchor:middle;font-size:10px;stroke:none}.caption{font-size:12px;opacity:.65}.heading{font-size:23px;font-weight:600}@keyframes twinkle{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.star{animation:none}}
.star{filter:url(#glow)}.star-halo{fill:var(--sky-star);opacity:.07}.star-core{fill:var(--sky-foreground);opacity:.9;pointer-events:none}.language text{font-size:10px;letter-spacing:2px;font-weight:500}.repo-label{fill:var(--sky-foreground);opacity:.68}.heading{font-size:20px;letter-spacing:-.5px}.chart-guide{fill:none;stroke:var(--sky-line);stroke-width:.5;opacity:.28}
.bridges{fill:none;stroke:var(--sky-accent);stroke-width:1;stroke-dasharray:2 5;opacity:.35}
.identity-ring{fill:none;stroke:var(--sky-accent);stroke-width:.65;opacity:.14;pointer-events:none}.identity-point{fill:var(--sky-accent);stroke:none}
.star[data-kind="language"]{stroke:var(--sky-foreground);stroke-width:.8}.star[data-kind="topic"]{stroke:var(--sky-foreground);stroke-width:1;stroke-dasharray:2 2}
.star,.star-halo{fill:var(--node-color,var(--sky-star))}
.credit{font-size:9px;opacity:.65;fill:var(--sky-accent);text-anchor:end}a{text-decoration:none}
.generated-at{font-size:9px;opacity:.6;fill:var(--sky-foreground);text-anchor:start}
${compact ? '.heading{font-size:17px}.language text{font-size:13px;letter-spacing:.5px}.caption{font-size:12px;opacity:.8}.connections{stroke-width:.9;opacity:.8}' : ''}
${options.visualStyle ? escape(visualCSS(options.visualStyle)) : ''}${escape(css)}${activitySettings.activityEffect !== 'off' ? activityCSS : ''}
${['space', 'milky-way'].includes(sky.mode) ? starfieldCSS : ''}
${transparent ? 'svg{background:transparent!important}.background{fill:none!important}' : ''}
</style>
<rect class="background" width="900" height="${height}" rx="${compact ? 12 : 18}"/>
${transparent ? '' : `<ellipse cx="440" cy="${height / 2}" rx="420" ry="${height * .43}" fill="url(#nebula)"/>`}

${decoration(options, height, visibleStars)}
${renderStarfield(seed, sky, { height, detail: profile.dustCount / 85, animate, transparent })}
<!--history-scene-start-->${eraRings}${historyLayer.markup}${renderCodingRhythm(options.codingRhythmData, rhythmSettings, { centerY, spreadY, height, legend: options.legend })}${camera.start}${geometry ? `<g class="identity-ring" aria-hidden="true"${identityRing ? '' : ' style="display:none"'} transform="translate(450 ${centerY}) scale(${368 / 172} ${spreadY / 172}) translate(-240 -240)">${ringMarkup}${pointMarkup}</g>` : ''}${sky.mode === 'classic' ? `<g class="dust">${dust}</g>` : ''}<g class="bridges">${bridgeLines.join('')}</g><g class="connections">${edges}</g>${points}${labels}${camera.end}<!--history-scene-end-->${historyLayer.note}${options.organizationUser && graph.organization ? `<g class="organization-focus-caption"><text x="450" y="26" text-anchor="middle" font-size="16" font-weight="600">@${escape(options.organizationUser)} → ${escape(name)}</text><text x="450" y="43" text-anchor="middle" font-size="10">${graph.focus ? `${graph.focusProjects.length} connected projects · bright lines show direct participation` : "No verified connection in the loaded results; expand or refresh the scan"}</text></g>` : ""}${graph.organization ? `<text class="organization-coverage" x="450" y="${height - 34}" text-anchor="middle" font-size="9">${escape(`${graph.nodeCount} nodes · ${graph.repositoryCount} selected projects · ${options.organizationData?.scanned || 0} repositories scanned for contributors`)}<title>${escape(graph.note)}</title></text>` : ""}
${visibleStars.length ? '' : `<text x="450" y="${height / 2}" text-anchor="middle">${repos.length ? 'All nodes are hidden. Restore visibility in Individual nodes.' : categoryMode && graph.repositoryCount ? `No ${nodeMode} in the matching repositories.` : sourceHasRepositories ? 'No projects match these filters or historical year.' : options.repoSource === 'pinned' ? 'No public pinned repositories match this selection.' : 'No public repositories to show yet.'}</text>`}
${options.legend ? `<text class="mapping-legend" x="32" y="${height - 30}" font-size="9">${escape(`Size: ${options.nodeSize || options.sizingMode || 'legacy'} · Glow: ${options.nodeGlowMode || 'uniform'} · Color: ${options.nodeColorMode || 'custom'} · Links: ${options.connectionWeight || 'uniform'}${activitySettings.activityEffect !== 'off' ? ` · ${activitySettings.activityEffect}: public activity / ${['1d', '7d', '30d'].includes(options.activityData?.window) ? options.activityData.window : activitySettings.activityWindow}` : ''}`)}</text>` : ''}
${generatedLabel ? `<text class="generated-at" x="32" y="${height - 14}">${generatedLabel}</text>` : ''}
<a href="https://github.com/mnichols08/constellation" target="_blank" rel="noopener noreferrer">${githubMark.replace('<svg ', `<svg x="744" y="${height - 23}" `)}<text class="credit" x="868" y="${height - 14}">mnichols08/constellation</text></a>
</svg>\n`;
  return animateRingSVG(focusSVG(svg, options.selection), ringAnimation, geometry, visibleStars, centerY, spreadY, escape, floatingAnimation, Array.from({ length: ringPoints.length / 3 }, (_, i) => ({ x: 450 + (ringPoints[i * 3] - 240) * 368 / 172, y: centerY + (ringPoints[i * 3 + 1] - 240) * spreadY / 172 })));
}
