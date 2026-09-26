export function username(value = '') {
  const name = value.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/$/, '').replace(/^@/, '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(name)) throw new Error('Enter a GitHub username or profile URL.');
  return name;
}

export async function fetchRepositories(account, { token, signal, fetchImpl = fetch } = {}) {
  const name = username(account);
  const repositories = [];
  for (let page = 1; page <= 100; page++) {
    const response = await fetchImpl(`https://api.github.com/users/${name}/repos?type=owner&sort=full_name&per_page=100&page=${page}`, {
      signal: signal || AbortSignal.timeout(20000),
      headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (response.status === 404) throw new Error('GitHub account not found.');
    if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached. Try again later or use GITHUB_TOKEN in the generator.');
    if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Unexpected GitHub response.');
    repositories.push(...batch.filter(repo => repo.private !== true));
    if (batch.length < 100) return repositories;
  }
  throw new Error('Account exceeds the 10,000 repository limit.');
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export function selectRepositoryPool(repositories, { maxRepos = 45, includeForks = true, includeRepos } = {}) {
  if (!Number.isInteger(maxRepos) || maxRepos < 1 || maxRepos > 100) throw new Error('maxRepos must be an integer between 1 and 100.');
  return repositories.filter(repo => repo.private !== true && (includeForks || !repo.fork) && (!includeRepos || includeRepos.includes(repo.name)))
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || a.full_name.localeCompare(b.full_name)).slice(0, maxRepos);
}

export function selectRepositories(repositories, options = {}) {
  const { languages, topics, showOther = false } = options;
  for (const [key, value] of Object.entries({ languages, topics })) {
    if (value !== undefined && value !== null && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw new Error(`${key} must be an array of names or null for all.`);
  }
  return selectRepositoryPool(repositories, options).filter(repo => {
    const detected = repositoryLanguages(repo);
    if (!showOther && !detected.length) return false;
    const matchesLanguage = languages == null || detected.some(language => languages.includes(language)) || (showOther && !detected.length && languages.includes('Other'));
    const matchesTopic = topics == null || (repo.topics || []).some(topic => topics.includes(topic));
    return matchesLanguage && matchesTopic;
  });
}

export function sharedConnections(from, to, { languages, topics, connectionBasis = 'languages' } = {}) {
  const sharedLanguages = connectionBasis === 'topics' ? [] : repositoryLanguages(from).filter(language => (languages == null || languages.includes(language)) && repositoryLanguages(to).includes(language));
  const sharedTopics = connectionBasis === 'languages' ? [] : [...new Set(from.topics || [])].filter(topic => (topics == null || topics.includes(topic)) && (to.topics || []).includes(topic)).sort();
  return { sharedLanguages, sharedTopics, shared: [...sharedLanguages, ...sharedTopics.map(topic => `#${topic}`)] };
}

export function repositoryLanguages(repo) {
  // A fetched empty result means no detected code, not a failed lookup.
  return repo.languages ? Object.keys(repo.languages).filter(key => repo.languages[key] > 0).sort() : repo.language ? [repo.language] : [];
}

export async function fetchRepositoryLanguages(repositories, { token, signal, fetchImpl = fetch, cache = new Map(), onProgress = () => {} } = {}) {
  const publicRepos = repositories.filter(repo => repo.private !== true);
  let next = 0, completed = 0, failure;
  const results = new Array(publicRepos.length);
  async function worker() {
    while (next < publicRepos.length && !failure) {
      const index = next++, repo = publicRepos[index];
      try {
        if (repo.languages) { results[index] = repo; onProgress(++completed, publicRepos.length); continue; }
        if (!cache.has(repo.full_name)) {
          const request = (async () => {
            const parts = repo.full_name.split('/');
            if (parts.length !== 2 || !parts.every(part => /^[a-z\d_.-]+$/i.test(part))) throw new Error('Invalid repository name.');
            const response = await fetchImpl(`https://api.github.com/repos/${parts.map(encodeURIComponent).join('/')}/languages`, {
              signal: signal || AbortSignal.timeout(20000),
              headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached while loading languages. Try later or use GITHUB_TOKEN with the generator.');
            if (!response.ok) throw new Error(`Could not load languages for ${repo.full_name} (${response.status}).`);
            const languages = await response.json();
            if (!languages || Array.isArray(languages) || typeof languages !== 'object' || Object.values(languages).some(bytes => !Number.isFinite(bytes) || bytes < 0)) throw new Error('Unexpected GitHub language response.');
            return languages;
          })();
          cache.set(repo.full_name, request);
          request.catch(() => { if (cache.get(repo.full_name) === request) cache.delete(repo.full_name); });
        }
        results[index] = { ...repo, languages: await cache.get(repo.full_name) };
        onProgress(++completed, publicRepos.length);
      } catch (error) { failure = error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, publicRepos.length) }, worker));
  if (failure) throw failure;
  return results;
}
const hash = value => {
  let n = [...value].reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) >>> 0, 7);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
export const themes = {
  midnight: { background: '#080e20', foreground: '#e6edff', accent: '#9ab9ff', line: '#3e537e', star: '#f6d99b' },
  light: { background: '#f7f8fc', foreground: '#18213a', accent: '#395bbe', line: '#aab6d3', star: '#966500' },
};

export function renderConstellation(account, repositories, options = {}) {
  const name = username(account);
  const { theme = 'auto', colors = {}, animate = true, maxRepos = 45, includeForks = true, css = '', layout = 'atlas', title, includeRepos, bridges = false, connectionDensity = 'balanced', connectionBasis = 'languages' } = options;
  if (!['languages', 'topics', 'both'].includes(connectionBasis)) throw new Error('Connection basis must be languages, topics or both.');
  if (!['balanced', 'all'].includes(connectionDensity)) throw new Error('Connection density must be balanced or all.');
  if (!['atlas', 'compact'].includes(layout)) throw new Error('Layout must be atlas or compact.');
  if (title !== undefined && (typeof title !== 'string' || title.length > 60)) throw new Error('Title must be a string of up to 60 characters.');
  if (includeRepos !== undefined && (!Array.isArray(includeRepos) || includeRepos.some(value => typeof value !== 'string'))) throw new Error('includeRepos must be an array of repository names.');
  const compact = layout === 'compact';
  const height = compact ? 280 : 560;
  if (theme !== 'auto' && !themes[theme]) throw new Error('Theme must be auto, midnight or light.');
  if (!Number.isInteger(maxRepos) || maxRepos < 1 || maxRepos > 100) throw new Error('maxRepos must be an integer between 1 and 100.');
  const palette = { ...themes[theme === 'auto' ? 'light' : theme], ...colors };
  const variables = values => Object.entries(values).map(([key, value]) => `--sky-${key}:${value}`).join(';');
  const paletteCSS = `svg{${variables(palette)}}` + (theme === 'auto' ? `@media(prefers-color-scheme:dark){svg{${variables({ ...themes.midnight, ...colors })}}}` : '');
  for (const [key, color] of Object.entries(palette)) {
    if (!Object.hasOwn(themes.midnight, key) || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) throw new Error('Colors must use known palette keys and 3 or 6 digit hex values.');
  }
  // CSS is local, trusted configuration, but must never escape its XML text node.
  const repos = selectRepositories(repositories, options);
  const groups = [...new Set(repos.map(repo => repo.language || 'Other'))].sort();
  const hubs = groups.map(language => ({ language }));
  // A deterministic, account-seeded star field uses the full card instead of
  // narrow language columns that turn cross-language links into long fans.
  const ordered = [...repos].sort((a, b) => hash(a.full_name) - hash(b.full_name) || a.full_name.localeCompare(b.full_name));
  const centerY = compact ? 126 : 270;
  const spreadY = compact ? 88 : 192;
  const phase = (hash(name) % 628) / 100;
  const stars = ordered.map((repo, index) => {
    const angle = index * 2.399963 + phase;
    const radius = ordered.length === 1 ? 0 : Math.sqrt((index + .6) / Math.max(1, ordered.length));
    return { repo, hub: hubs.find(hub => hub.language === (repo.language || 'Other')),
      x: 450 + Math.cos(angle) * radius * 368,
      y: centerY + Math.sin(angle) * radius * spreadY };
  });
  const dust = Array.from({ length: 85 }, (_, i) => `<circle cx="${20 + hash(`${name}:x:${i}`) % 860}" cy="${(compact ? 58 : 90) + hash(`${name}:y:${i}`) % (compact ? 180 : 405)}" r="${i % 3 ? '.6' : '1'}" opacity=".25"/>`).join('');
  // Compare complete language sets, including secondary HTML/CSS/JavaScript.
  const candidates = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const from = stars[i], to = stars[j];
      const relation = sharedConnections(from.repo, to.repo, options);
      if (relation.shared.length) candidates.push({ from, to, ...relation, key: `${i}:${j}`, distance: (from.x - to.x) ** 2 + (from.y - to.y) ** 2 });
    }
  }
  const selectedEdges = new Set();
  if (connectionDensity === 'all') candidates.forEach(edge => selectedEdges.add(edge));
  else {
    // Show up to four strongest neighbours per star. Prefer cross-region links
    // at equal overlap so secondary-language relationships stay visible.
    for (const star of stars) {
      const neighbours = candidates.filter(edge => edge.from === star || edge.to === star)
        .sort((a, b) => b.shared.length - a.shared.length || Number(b.from.hub !== b.to.hub) - Number(a.from.hub !== a.to.hub) || a.distance - b.distance || a.key.localeCompare(b.key));
      neighbours.slice(0, 4).forEach(edge => selectedEdges.add(edge));
    }
  }
  // Emphasize a short spanning forest of genuine relationships. All selected
  // secondary links remain present, but recede behind the local constellation.
  const parent = new Map(stars.map(star => [star, star]));
  const root = star => parent.get(star) === star ? star : root(parent.get(star));
  const backbone = new Set();
  for (const edge of [...selectedEdges].sort((a, b) => a.distance - b.distance || b.shared.length - a.shared.length || a.key.localeCompare(b.key))) {
    if (root(edge.from) !== root(edge.to)) {
      backbone.add(edge);
      parent.set(root(edge.from), root(edge.to));
    }
  }
  const edges = [...selectedEdges].sort((a, b) => Number(backbone.has(a)) - Number(backbone.has(b))).map(edge => {
    const { from, to, shared, sharedLanguages, sharedTopics } = edge;
    const dx = to.x - from.x, dy = to.y - from.y;
    const length = Math.sqrt(edge.distance) || 1;
    const bend = Math.min(18, length * .08) * (hash(edge.key) % 2 ? 1 : -1);
    const cx = (from.x + to.x) / 2 - dy / length * bend;
    const cy = (from.y + to.y) / 2 + dx / length * bend;
    return `<path class="shared-language" data-from="${escape(from.repo.full_name)}" data-to="${escape(to.repo.full_name)}" data-languages="${escape(sharedLanguages.join(', '))}" data-topics="${escape(sharedTopics.join(', '))}" data-emphasis="${backbone.has(edge) ? 'primary' : 'secondary'}" d="M${from.x.toFixed(1)} ${from.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}"><title>${escape(from.repo.name)} ↔ ${escape(to.repo.name)} · ${escape(shared.join(', '))}</title></path>`;
  }).join('');
  // Join language regions with the shortest available visual bridges. These are
  // composition guides, not inferred technical relationships or dependencies.
  const bridgeLines = [];
  if (bridges && hubs.length > 1) {
    const joined = new Set([hubs[0]]);
    while (joined.size < hubs.length) {
      let best = { distance: Infinity };
      for (const from of stars.filter(star => joined.has(star.hub))) {
        for (const to of stars.filter(star => !joined.has(star.hub))) {
          const distance = (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
          if (distance < best.distance) best = { from, to, distance };
        }
      }
      bridgeLines.push(`<path d="M${best.from.x.toFixed(1)} ${best.from.y.toFixed(1)}L${best.to.x.toFixed(1)} ${best.to.y.toFixed(1)}"><title>Visual bridge: ${escape(best.from.repo.name)} to ${escape(best.to.repo.name)}. No technical relationship implied.</title></path>`);
      joined.add(best.to.hub);
    }
  }
  const points = stars.map(({ repo, x, y }) => {
    const radius = 2.7 + Math.min(3.3, Math.log2((repo.stargazers_count || 0) + 1) / 2);
    return `<g class="repository"><title>${escape(repo.full_name)} · ${repo.stargazers_count || 0} stars${repo.fork ? ' · fork' : ''} · ${escape(repositoryLanguages(repo).join(', ') || 'No detected languages')}</title><circle class="star-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius + 4).toFixed(1)}"/><circle class="star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" style="animation-delay:-${hash(repo.full_name) % 60 / 10}s"/><circle class="star-core" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"/></g>`;
  }).join('');
  // Short labels for small collections, with simple collision avoidance. Larger
  // skies retain the repository descriptions without an unreadable text cloud.
  const labelBoxes = [];
  const labels = repos.length <= 18 ? stars.map(star => {
    const text = star.repo.name.length > 22 ? star.repo.name.slice(0, 20) + '…' : star.repo.name;
    const width = text.length * 5.6;
    for (const dy of [17, -13, 29, -25]) {
      const x = Math.max(34 + width / 2, Math.min(866 - width / 2, star.x));
      const y = star.y + dy;
      const box = { left: x - width / 2 - 4, right: x + width / 2 + 4, top: y - 10, bottom: y + 3 };
      if (box.top < 18 || box.bottom > height - 40) continue;
      if (labelBoxes.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
      if (stars.some(other => other !== star && other.x > box.left - 5 && other.x < box.right + 5 && other.y > box.top - 5 && other.y < box.bottom + 5)) continue;
      labelBoxes.push(box);
      return `<text class="repo-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${escape(text)}</text>`;
    }
    return '';
  }).join('') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}" role="img" aria-labelledby="title description">
<title id="title">${escape(title ?? `${name}’s GitHub constellation`)}</title>
<desc id="description">${repos.length} public repositories arranged in a deterministic star field. Solid lines connect projects through selected ${connectionBasis === 'both' ? 'languages and topics' : connectionBasis}; detected languages include secondary languages; dotted bridges join nearby groups visually and do not represent dependencies. ${selectedEdges.size} of ${candidates.length} shared connections shown. Brighter paths emphasize nearby relationships; faint paths preserve the remaining selected overlaps. Star size reflects GitHub stars. ${repos.map(repo => escape(repo.name)).join(', ')}.</desc>
<defs><radialGradient id="nebula"><stop stop-color="var(--sky-accent)" stop-opacity=".13"/><stop offset="1" stop-color="var(--sky-background)" stop-opacity="0"/></radialGradient><filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="2"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<style>
${paletteCSS}
svg{background:var(--sky-background);color:var(--sky-foreground);font:13px system-ui,sans-serif}text{fill:currentColor}.background{fill:var(--sky-background)}.dust{fill:var(--sky-foreground)}.connections{fill:none;stroke:var(--sky-line);stroke-width:.9;opacity:.8}.shared-language{stroke-linecap:round}.shared-language[data-emphasis="primary"]{stroke:var(--sky-accent);opacity:.62}.shared-language[data-emphasis="secondary"]{opacity:.13}.star{fill:var(--sky-star);${animate ? 'animation:twinkle 6s ease-in-out infinite;' : ''}}.language circle{fill:var(--sky-accent)}.language text{text-anchor:middle;fill:var(--sky-accent);font-weight:600}.repo-label{text-anchor:middle;font-size:10px;paint-order:stroke;stroke:var(--sky-background);stroke-width:3px;stroke-linejoin:round}.caption{font-size:12px;opacity:.65}.heading{font-size:23px;font-weight:600}@keyframes twinkle{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.star{animation:none}}
.star{filter:url(#glow)}.star-halo{fill:var(--sky-star);opacity:.07}.star-core{fill:var(--sky-foreground);opacity:.9;pointer-events:none}.language text{font-size:10px;letter-spacing:2px;font-weight:500}.repo-label{fill:var(--sky-foreground);opacity:.68}.heading{font-size:20px;letter-spacing:-.5px}.chart-guide{fill:none;stroke:var(--sky-line);stroke-width:.5;opacity:.28}
.bridges{fill:none;stroke:var(--sky-accent);stroke-width:1;stroke-dasharray:2 5;opacity:.35}
.credit{font-size:9px;opacity:.65;fill:var(--sky-accent);text-anchor:end}a{text-decoration:none}
${compact ? '.heading{font-size:17px}.language text{font-size:13px;letter-spacing:.5px}.caption{font-size:12px;opacity:.8}.connections{stroke-width:.9;opacity:.8}' : ''}
${escape(css)}
</style>
<rect class="background" width="900" height="${height}" rx="${compact ? 12 : 18}"/>
<ellipse cx="440" cy="${height / 2}" rx="420" ry="${height * .43}" fill="url(#nebula)"/>

<g class="dust">${dust}</g><g class="bridges">${bridgeLines.join('')}</g><g class="connections">${edges}</g>${points}${labels}
${repos.length ? '' : `<text x="450" y="${height / 2}" text-anchor="middle">${selectRepositoryPool(repositories, options).length ? 'No projects match these filters.' : 'No public repositories to show yet.'}</text>`}
<a href="https://github.com/mnichols08/github-constellation" target="_blank" rel="noopener noreferrer"><text class="credit" x="868" y="${height - 14}">mnichols08/github-constellation</text></a>
</svg>\n`;
}
