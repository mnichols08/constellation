import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fetchPinnedRepositories } from '../src/constellation.mjs';

const allowed = new Map([
  ...['scene', 'scene-layers', 'studio-layers', 'renderer-svg', 'data-pipeline', 'data-transforms', 'data-mappings'].map(name => [`/src/${name}.mjs`, [`../src/${name}.mjs`, 'text/javascript']]),
  ['/src/scaling.mjs', ['../src/scaling.mjs', 'text/javascript']],
  ...['plugin-host', 'json-feed-source', 'theme-packs'].map(name => [`/src/${name}.mjs`, [`../src/${name}.mjs`, 'text/javascript']]),
  ['/src/filter-explanation.mjs', ['../src/filter-explanation.mjs', 'text/javascript']],
  ...['settings', 'model', 'data', 'graph', 'studio'].map(name => [`/src/organization/${name}.mjs`, [`../src/organization/${name}.mjs`, 'text/javascript']]),
  ...['settings', 'historical-snapshot', 'project-lifecycle', 'contribution-history', 'language-history', 'external-contributions', 'history-svg', 'time-lapse-svg', 'studio-history'].map(name => [`/src/history/${name}.mjs`, [`../src/history/${name}.mjs`, 'text/javascript']]),
  ['/', ['../index.html', 'text/html']],
  ['/profiles/preview.html', ['../profiles/preview.html', 'text/html']],
  ['/src/studio-layout.css', ['../src/studio-layout.css', 'text/css']],
  ['/src/preview.css', ['../src/preview.css', 'text/css']],
  ...['preview', 'preview-data', 'constellation', 'export', 'visual-style', 'label-editor', 'engine', 'graph-explorer', 'ring-animation', 'perspective', 'live-tilt', 'selection', 'artifact-layouts', 'config-schema', 'config-store', 'design-randomizer', 'design-randomizer-v5', 'randomize-parts', 'layout-refinement', 'studio-randomize-motion', 'export-image', 'image-viewer', 'node-sizing', 'repository-filters', 'repository-picker', 'seeded-random', 'share-link', 'studio-config-form', 'studio-design', 'studio-presets', 'studio-layout', 'themes', 'visual-mapping', 'starfield', 'coding-rhythm', 'coding-rhythm-svg', 'activity', 'activity-effects', 'github-activity', 'github-mark', 'sample-activity'].map(name => [`/src/${name}.mjs`, [`../src/${name}.mjs`, 'text/javascript']]),
  ['/src/wasm/constellation_core.js', ['../src/wasm/constellation_core.js', 'text/javascript']],
  ['/src/wasm/constellation_core_bg.wasm', ['../src/wasm/constellation_core_bg.wasm', 'application/wasm']],
  ...['constellation', 'mnichols08', 'mnichols08-dark', 'mnichols08-light'].map(name => [`/dist/${name}.svg`, [`../dist/${name}.svg`, 'image/svg+xml']]),
]);

export function createPreviewServer({ token, fetchImpl = fetch } = {}) {
  return createServer(async (req, res) => {
    const port = req.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (!hosts.includes(req.headers.host)) { res.writeHead(403); res.end('Forbidden host'); return; }
    const origin = `http://${req.headers.host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      res.writeHead(403); res.end('Cross-site requests are not allowed'); return;
    }
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end('Method not allowed'); return; }
    const url = new URL(req.url, origin);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (url.pathname.startsWith('/api/github/')) {
      const path = url.pathname.slice('/api/github'.length);
      const pinned = /^\/users\/([a-z\d][a-z\d-]{0,38})\/pinned$/i.exec(path);
      if (pinned && !url.search) {
        res.setHeader('Content-Type', 'application/json');
        if (!token) { res.writeHead(401); res.end(JSON.stringify({ message: 'Pinned repositories need GH_TOKEN in the local server .env file.' })); return; }
        try {
          res.end(JSON.stringify(await fetchPinnedRepositories(pinned[1], { token, fetchImpl })));
        } catch (error) {
          res.writeHead(502);
          res.end(JSON.stringify({ message: error.message.startsWith('GitHub') || error.message.startsWith('Could not load pinned') ? error.message : 'Could not load pinned repositories from GitHub.' }));
        }
        return;
      }
      const accountInfo = /^\/(users|orgs)\/[a-z\d][a-z\d-]{0,38}$/i.test(path);
      const repoList = /^\/(users|orgs)\/[a-z\d][a-z\d-]{0,38}\/repos$/i.test(path);
      const publicEvents = /^\/(users\/[a-z\d][a-z\d-]{0,38}\/events\/public|orgs\/[a-z\d][a-z\d-]{0,38}\/events)$/i.test(path);
      const languages = /^\/repos\/[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]+\/languages$/i.test(path);
      const contributors = /^\/repos\/[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]+\/contributors$/i.test(path);
      const repoMetadata = /^\/repos\/[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]+$/i.test(path);
      const contributionSearch = path === '/search/issues' && /^author:[a-z\d][a-z\d-]{0,38} org:[a-z\d][a-z\d-]{0,38} is:pr is:public$/i.test(url.searchParams.get('q') || '');
      if ((!repoList && !languages && !publicEvents && !accountInfo && !contributors && !repoMetadata && !contributionSearch) || [...url.searchParams.keys()].some(key => !(contributionSearch ? ['q', 'per_page', 'page', 'sort', 'order'] : (publicEvents || contributors) ? ['per_page', 'page'] : accountInfo || repoMetadata ? [] : ['type', 'sort', 'per_page', 'page']).includes(key))) {
        res.writeHead(404); res.end('Not found'); return;
      }
      try {
        const upstream = await fetchImpl(`https://api.github.com${path}${url.search}`, {
          headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal: AbortSignal.timeout(20000), redirect: 'error',
        });
        res.setHeader('Content-Type', 'application/json');
        for (const header of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after']) {
          const value = upstream.headers.get(header);
          if (value) res.setHeader(header, value);
        }
        if (!upstream.ok) {
          res.writeHead(upstream.status);
          res.end(JSON.stringify({ message: upstream.status === 401 ? 'The local GitHub token was rejected.' : 'GitHub request failed.' }));
          return;
        }
        res.end(await upstream.text());
      } catch {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Could not reach GitHub from the local server.' }));
      }
      return;
    }
    const entry = allowed.get(url.pathname);
    if (!entry) { res.writeHead(404); res.end('Not found'); return; }
    try {
      let content = await readFile(new URL(entry[0], import.meta.url));
      if (url.pathname === '/') {
        content = content.toString().replace('<head>', `<head>\n<meta name="constellation-api" content="/api/github">\n<meta name="constellation-auth" content="${token ? 'authenticated' : 'public'}">`);
      }
      res.setHeader('Content-Type', `${entry[1]}; charset=utf-8`);
      res.end(content);
    } catch {
      res.writeHead(500); res.end('Could not load preview');
    }
  });
}
