import { createPortableExport } from './portable-export.mjs';
import { parseScene, serializeScene, SCENE_VERSION } from './scene.mjs';
import { parseSemanticGraph, semanticGraphFingerprint } from './semantic-graph.mjs';
import { renderSceneSVG } from './renderer-svg.mjs';
import { renderSceneHTML } from './renderer-html.mjs';

export const PORTFOLIO_ARTIFACT_VERSION = 1;
export const PORTFOLIO_ARTIFACT_LIMITS = Object.freeze({ manifestBytes: 16 * 1024, fileBytes: 16 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, files: 12 });
const encoder = new TextEncoder();
const safeName = name => typeof name === 'string' && name.length <= 128 && /^[a-z0-9][a-z0-9._-]*$/i.test(name) && !name.includes('..');
const digest = async bytes => {
  if (!globalThis.crypto?.subtle) throw new Error('Portfolio artifact validation requires Web Crypto SHA-256.');
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export async function createPortfolioArtifact(input, options) {
  const portable = createPortableExport(input, options);
  const scene = options?.scene ? parseScene(typeof options.scene === 'string' ? options.scene : serializeScene(options.scene)) : portable.scene;
  const graph = portable.graph;
  const renderedSVG = renderSceneSVG(scene);
  const renderedHTML = renderSceneHTML(scene, { title: `${graph.subject.id} constellation`, semanticMetadata: { subjectLabel: `${graph.subject.kind === 'developer' ? 'Developer' : 'Project'}: ${graph.subject.id}`, version: graph.version, fingerprint: portable.fingerprint, truncated: graph.statistics.truncated, privateSource: graph.project?.provenance?.visibility === 'private' } });
  const files = { ...portable.files, 'constellation.svg': renderedSVG, 'constellation.html': renderedHTML, 'scene.json': `${serializeScene(scene)}\n` };
  delete files['manifest.json'];
  const artifacts = {};
  for (const [name, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (!safeName(name)) throw new Error(`Unsafe portfolio artifact path: ${name}`);
    const bytes = encoder.encode(content);
    artifacts[name] = { size: bytes.byteLength, sha256: await digest(bytes) };
  }
  const manifest = {
    version: PORTFOLIO_ARTIFACT_VERSION,
    constellationVersion: options?.constellationVersion || '4.7.0',
    sceneVersion: SCENE_VERSION,
    semanticGraphVersion: portable.manifest.semanticGraphVersion,
    semanticMarkdownVersion: portable.manifest.semanticMarkdownVersion,
    subject: { ...portable.manifest.subject },
    fingerprint: portable.fingerprint,
    entryPoints: { interactive: 'constellation.html', static: 'constellation.svg', scene: 'scene.json' },
    runtime: { mode: 'embedded-html', wasm: 'embedded', assets: [] },
    artifacts,
  };
  const manifestJSON = `${JSON.stringify(manifest, null, 2)}\n`;
  await validatePortfolioArtifact(manifestJSON, files);
  return Object.freeze({ ...portable, scene, manifest, files: Object.freeze({ ...files, 'manifest.json': manifestJSON }) });
}

export async function validatePortfolioArtifact(manifestInput, files) {
  let manifest;
  try {
    const raw = typeof manifestInput === 'string' ? manifestInput : JSON.stringify(manifestInput);
    if (raw.length > PORTFOLIO_ARTIFACT_LIMITS.manifestBytes || encoder.encode(raw).byteLength > PORTFOLIO_ARTIFACT_LIMITS.manifestBytes) throw new Error('Manifest exceeds 16 KiB.');
    manifest = JSON.parse(raw);
  } catch (error) { throw new Error(`Invalid portfolio manifest: ${error.message}`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid portfolio manifest: expected an object.');
  if (manifest.version !== PORTFOLIO_ARTIFACT_VERSION) throw new Error('Unsupported portfolio artifact version.');
  if (manifest.sceneVersion !== SCENE_VERSION) throw new Error('Unsupported Scene version.');
  if (manifest.semanticGraphVersion !== 1 || manifest.semanticMarkdownVersion !== 1) throw new Error('Unsupported semantic contract version.');
  if (!/^4\.7\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.constellationVersion || '')) throw new Error('Incompatible Constellation package version. Expected the 4.7.x line.');
  const subjectId = manifest.subject?.id;
  const validSubject = manifest.subject?.kind === 'developer' ? /^[A-Za-z0-9-]{1,39}$/.test(subjectId || '')
    : manifest.subject?.kind === 'project' ? /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(subjectId || '') : false;
  if (!validSubject) throw new Error('Invalid portfolio project identity.');
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Portfolio assets are missing.');
  if (!manifest.artifacts || typeof manifest.artifacts !== 'object' || Array.isArray(manifest.artifacts)) throw new Error('Invalid portfolio artifact metadata.');
  const entries = Object.entries(manifest.artifacts);
  if (!entries.length || entries.length > PORTFOLIO_ARTIFACT_LIMITS.files) throw new Error('Invalid portfolio artifact count.');
  const listedNames = new Set(entries.map(([name]) => name));
  const fileNames = Object.keys(files);
  if (fileNames.length > PORTFOLIO_ARTIFACT_LIMITS.files + 1) throw new Error('Invalid portfolio asset count.');
  for (const name of fileNames) if (name !== 'manifest.json' && !listedNames.has(name)) throw new Error(`Unexpected portfolio asset: ${name}`);
  for (const name of listedNames) if (!Object.hasOwn(files, name)) throw new Error(`Missing portfolio asset: ${name}`);
  let total = 0;
  for (const [name, metadata] of entries) {
    if (!safeName(name) || name.endsWith('.js') || name.endsWith('.mjs') || name.endsWith('.wasm') || /\.(?:exe|dll|bat|cmd|ps1|sh|py|rb|com|msi)$/i.test(name) || name.endsWith('.html') && name !== 'constellation.html') throw new Error(`Unsafe or unexpected executable artifact: ${name}`);
    if (!Object.hasOwn(files, name) || typeof files[name] !== 'string') throw new Error(`Missing portfolio asset: ${name}`);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > PORTFOLIO_ARTIFACT_LIMITS.fileBytes || !/^[a-f0-9]{64}$/.test(metadata.sha256 || '')) throw new Error(`Invalid size or digest metadata for ${name}.`);
    if (files[name].length > metadata.size) throw new Error(`Invalid size or digest metadata for ${name}.`);
    const bytes = encoder.encode(files[name]);
    if (bytes.byteLength > PORTFOLIO_ARTIFACT_LIMITS.fileBytes || metadata.size !== bytes.byteLength) throw new Error(`Invalid size or digest metadata for ${name}.`);
    if (await digest(bytes) !== metadata.sha256) throw new Error(`Portfolio asset digest mismatch: ${name}.`);
    total += bytes.byteLength;
    if (total > PORTFOLIO_ARTIFACT_LIMITS.totalBytes) throw new Error('Portfolio artifact exceeds 32 MiB.');
  }
  for (const required of ['scene.json', 'constellation.svg', 'constellation.html']) if (!Object.hasOwn(manifest.artifacts, required)) throw new Error(`Required portfolio asset is missing: ${required}.`);
  const graphName = entries.find(([name]) => name.endsWith('.semantic-graph.json'))?.[0];
  if (!graphName) throw new Error('Required Semantic Graph data is missing.');
  let scene, graph;
  try { scene = parseScene(files['scene.json']); } catch (error) { throw new Error(`Invalid portfolio Scene: ${error.message}`); }
  try { graph = parseSemanticGraph(files[graphName]); } catch (error) { throw new Error(`Invalid portfolio Semantic Graph: ${error.message}`); }
  if (graph.subject.kind !== manifest.subject.kind || graph.subject.id !== manifest.subject.id || semanticGraphFingerprint(graph) !== manifest.fingerprint) throw new Error('Portfolio identity or Semantic Graph fingerprint mismatch.');
  if (graph.subject.kind === 'developer') {
    const projectIds = new Set(graph.nodes.filter(node => node.kind === 'project').map(node => node.id));
    for (const node of scene.nodes) {
      const id = node.metadata?.full_name || (node.metadata?.nodeKind === 'repository' ? node.id : null);
      if (id && /^[^/]+\/[^/]+$/.test(id) && !projectIds.has(id)) throw new Error(`Scene project identity is absent from Semantic Graph: ${id}.`);
    }
  }
  if (!/^<svg\b/i.test(files['constellation.svg']) || /<script\b/i.test(files['constellation.svg'])) throw new Error('Static SVG fallback is invalid or executable.');
  const html = files['constellation.html'];
  if (!/<meta http-equiv="Content-Security-Policy"/i.test(html) || !html.includes('wasm-unsafe-eval') || !html.includes('constellation-scene') || !html.includes('<script type="module">') || !html.includes('__wbg_init') || !html.includes('atob(')) throw new Error('Interactive HTML is missing its offline runtime or CSP policy.');
  if (!manifest.entryPoints || manifest.entryPoints.interactive !== 'constellation.html' || manifest.entryPoints.static !== 'constellation.svg' || manifest.entryPoints.scene !== 'scene.json') throw new Error('Invalid portfolio entry points.');
  if (manifest.runtime?.mode !== 'embedded-html' || manifest.runtime.wasm !== 'embedded' || !Array.isArray(manifest.runtime.assets) || manifest.runtime.assets.length) throw new Error('Invalid or unsupported portfolio runtime assets.');
  return Object.freeze({ manifest, totalBytes: total, files: entries.length });
}
