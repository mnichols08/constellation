import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { browser, openBrowser } from '../scripts/browser-harness.mjs';
import { createScene } from '../src/constellation.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';
import { createPreviewServer } from '../scripts/preview-server.mjs';
import { repositories, options } from './fixtures/recruiter.mjs';

test('recruiter SVG at README widths: text bounds, moon cap, frozen layout and reduced motion', { skip: !browser, timeout: 120000 }, async t => {
  const svg = renderSceneSVG(createScene('alice', repositories, options));
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<style>body{margin:0;background:#0d1117}svg{width:100%;height:auto;display:block}</style>${svg}`); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, cdp, errors, waitFor } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await waitFor(`document.querySelectorAll('.planet').length===12`);
  await mkdir('.cache/recruiter', { recursive: true });
  await writeFile('.cache/recruiter/animated.svg', svg);
  await writeFile('.cache/recruiter/static.svg', renderSceneSVG(createScene('alice', repositories, { ...options, animate: false })));
  for (const width of [800, 1000, 1200]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: Math.ceil(width * 940 / 1200), deviceScaleFactor: 1, mobile: false });
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const metrics = await evaluate(`(() => {
      const labels = [...document.querySelectorAll('.project-label')].map(el => el.getBoundingClientRect());
      return { overflow: [...document.querySelectorAll('text')].filter(el => {const b=el.getBoundingClientRect();return b.left < -1 || b.right > innerWidth+1}).map(el=>el.textContent),
        overlap: labels.some((a,i)=>labels.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),
        maxMoons: Math.max(...[...document.querySelectorAll('.moons')].map(el=>el.children.length)),
        activePlanets: [...document.querySelectorAll('.planet,.repo-label')].some(el=>getComputedStyle(el).animationName!=='none') };
    })()`);
    assert.deepEqual(metrics.overflow, []); assert.equal(metrics.overlap, false); assert.equal(metrics.maxMoons, 6); assert.equal(metrics.activePlanets, false);
    await writeFile(`.cache/recruiter/${width}.png`, Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  }
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.moons')).animationName`), 'none');
  await evaluate(`document.querySelector('.key').style.display='none'`);
  assert.equal(await evaluate(`document.querySelectorAll('.planet').length`), 12);
  await writeFile('.cache/recruiter/without-key.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  const metadataOnly = renderSceneSVG(createScene('alice', repositories, { ...options, theme: 'light', animate: false, commitFieldData: undefined, organizationData: undefined }));
  await evaluate(`document.body.innerHTML=${JSON.stringify(metadataOnly)};`);
  await waitFor(`document.querySelectorAll('.planet.unknown').length===12`);
  assert.equal(await evaluate(`document.querySelectorAll('.moons').length`), 0);
  assert.match(await evaluate(`document.body.textContent`), /contributors unknown/);
  await writeFile('.cache/recruiter/metadata-only.png', Buffer.from((await cdp('Page.captureScreenshot')).data, 'base64'));
  assert.deepEqual(errors, []);
});

test('Studio recruiter selection, relationships and export survive config', { skip: !browser, timeout: 120000 }, async t => {
  const server = createPreviewServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const { evaluate, waitFor, errors } = await openBrowser(t, `http://127.0.0.1:${server.address().port}`);
  await waitFor(`document.querySelector('#open-studio')?.disabled===false`);
  await evaluate(`document.querySelector('#open-studio').click(); const select=document.querySelector('#design-readmePresentation'); select.value='recruiter'; select.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(`document.querySelector('#preview').firstChild.shadowRoot.querySelector('.developer')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('#preview').firstChild.shadowRoot.querySelector('.repo-label')).fontSize`), '20px');
  await evaluate(`const field=document.querySelector('#project-relationships');field.value='alice/atlas ↔ alice/atlas-mobile';field.dispatchEvent(new Event('change',{bubbles:true}));`);
  await waitFor(`document.querySelector('#design-readmePresentation').value==='recruiter'`);
  await evaluate(`document.querySelector('#copy-config').click()`);
  const config = JSON.parse(await evaluate(`document.querySelector('#config-json').value`));
  assert.equal(config.readmePresentation, 'recruiter');
  assert.deepEqual(config.projectRelationships, options.projectRelationships);
  assert.deepEqual(errors, []);
});
