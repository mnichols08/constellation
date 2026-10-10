import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';
import { createScene } from '../src/constellation.mjs';
import { semanticGraphFromScene } from '../src/semantic-graph.mjs';
import { generateStoryCandidates } from '../src/story-candidates.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';

test('static Profile Story labels, pathways, and legends fit in real 480px and 900px browsers', {
  skip: !browser && 'Set CONSTELLATION_BROWSER to a Chromium executable.',
  timeout: 120000,
}, async t => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    full_name: `visual/story-${String(index).padStart(2, '0')}`,
    name: index < 3 ? `Featured system ${index}` : `Long project title ${index}`,
    language: ['Rust', 'JavaScript', 'Python'][index % 3],
    topics: [`area-${index % 3}`, `tools-${index % 2}`],
  }));
  const showcase = Object.fromEntries(records.slice(0, 6).map((repo, index) => [repo.full_name, { role: index < 3 ? 'featured' : 'supporting', priority: index + 1 }]));
  const graph = semanticGraphFromScene(createScene('visual', records, {
    nodeMode: 'repositories', showOther: true, projectShowcase: showcase,
    seed: 'story-clarity-browser', theme: 'light',
  }));
  const candidate = generateStoryCandidates(graph, { projectShowcase: showcase, seed: 'story-clarity-browser' }).find(item => item.id === 'projects');
  const responses = new Map();
  for (const width of [480, 900]) for (const theme of ['light', 'midnight']) {
    const scene = { ...candidate.scene, presentation: { ...candidate.scene.presentation, options: { ...candidate.scene.presentation.options, exportProfile: 'readme', theme } } };
    const svg = renderSceneSVG(scene, { targetWidth: width });
    assert.doesNotMatch(svg, /<script\b/i, 'essential meaning is static SVG');
    responses.set(`/${width}/${theme}`, svg);
  }
  const server = createServer((request, response) => {
    const svg = responses.get(new URL(request.url, 'http://localhost').pathname);
    response.writeHead(svg ? 200 : 404, { 'content-type': 'image/svg+xml; charset=utf-8' });
    response.end(svg || 'missing');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { cdp, evaluate, errors } = await openBrowser(t, `${base}/480/light`);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  const browserData = [];
  for (const width of [480, 900]) for (const theme of ['light', 'midnight']) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.navigate', { url: `${base}/${width}/${theme}` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('Boolean(document.querySelector("svg")?.querySelector(".star"))')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const report = await evaluate(`(() => {
      const svg=document.querySelector('svg');
      if (!svg) return null;
      const rect=svg.getBoundingClientRect();
      const labels=[...svg.querySelectorAll('text.repo-label')].filter(el=>getComputedStyle(el).display!=='none').map(el=>({id:el.dataset.repo, role:el.dataset.role||'', r:(()=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}})()}));
      const featured=labels.filter(x=>x.role==='featured');
      const overlaps=[];
      for(let i=0;i<featured.length;i++)for(let j=i+1;j<featured.length;j++){const a=featured[i].r,b=featured[j].r;if(a.x<b.right&&b.x<a.right&&a.y<b.bottom&&b.y<a.bottom)overlaps.push([featured[i].id,featured[j].id])}
      const legend=svg.querySelector('.story-relationship-legend')?.getBoundingClientRect();
      const paths=[...svg.querySelectorAll('path[data-relationship-type]')];
      return {width:rect.width,height:rect.height,projectCount:svg.querySelectorAll('circle.star[data-kind="repository"]').length,labels,featuredCount:featured.length,featuredOverlaps:overlaps,labelsInside:labels.every(x=>x.r.x>=rect.x-1&&x.r.right<=rect.right+1&&x.r.y>=rect.y-1&&x.r.bottom<=rect.bottom+1),legendInside:!legend||(legend.left>=rect.left-1&&legend.right<=rect.right+1&&legend.top>=rect.top-1&&legend.bottom<=rect.bottom+1),relationshipTypes:[...new Set(paths.map(x=>x.dataset.relationshipType))],styles:[...new Set(paths.map(x=>getComputedStyle(x).strokeDasharray))],pathCount:paths.length,hasPathTitles:paths.every(x=>!!x.querySelector('title')?.textContent)};
    })()`);
    assert.ok(report, `SVG did not load for ${width}px ${theme}`);
    assert.equal(report.width, width);
    assert.equal(report.projectCount, 12, 'the bounded story keeps project identities');
    assert.ok(report.featuredCount >= 3, 'featured labels remain visible');
    assert.deepEqual(report.featuredOverlaps, [], 'featured labels do not collide');
    assert.equal(report.labelsInside, true, 'visible project labels fit in the SVG viewport');
    assert.equal(report.legendInside, true, 'relationship legend stays in the SVG viewport');
    assert.ok(report.pathCount > 0 && report.hasPathTitles, 'every pathway keeps accessible evidence titles');
    if (report.relationshipTypes.length > 1) assert.ok(report.styles.length > 1, 'relationship types use distinct line patterns');
    browserData.push({ width, theme, report });
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await evaluate('({labels:document.querySelectorAll("svg text.repo-label").length,paths:document.querySelectorAll("svg path[data-relationship-type]").length})');
  assert.ok(reduced.labels >= 3 && reduced.paths > 0, 'reduced motion preserves static story information');
  assert.deepEqual(errors, []);
  assert.equal(browserData.length, 4);
});
