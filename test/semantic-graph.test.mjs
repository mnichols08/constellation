import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../src/constellation.mjs';
import { createProjectConstellation } from '../src/project-constellation.mjs';
import { semanticGraphFromScene, semanticGraphFromProjectConstellation, validateSemanticGraph, serializeSemanticGraph, parseSemanticGraph, semanticGraphFingerprint, projectSemanticGraphToScene } from '../src/semantic-graph.mjs';
import { validateScene } from '../src/scene.mjs';
import { renderSceneSVG } from '../src/renderer-svg.mjs';

test('developer semantic graphs ignore Scene presentation and ordering', () => {
  const scene=createScene('octocat',[{full_name:'octocat/alpha',name:'alpha',language:'JavaScript',topics:['tooling']},{full_name:'octocat/beta',name:'beta',language:'Rust',topics:[]}]);
  const graph=semanticGraphFromScene(scene);
  const changed=structuredClone(scene); changed.nodes.reverse(); changed.edges.reverse(); changed.nodes.forEach((node,i)=>{node.geometry.x+=50+i;node.style.color='#abcdef';}); changed.viewport.width+=200;
  assert.deepEqual(semanticGraphFromScene(changed),graph);
  assert.deepEqual(semanticGraphFromScene(createScene('octocat',[{full_name:'octocat/beta',name:'beta',language:'Rust',topics:[]},{full_name:'octocat/alpha',name:'alpha',language:'JavaScript',topics:['tooling']} ])),graph);
  const projected=projectSemanticGraphToScene(graph); assert.equal(validateScene(projected).valid,true); assert.match(renderSceneSVG(projected),/<svg/);
  assert.equal(graph.nodes.some(n=>'geometry' in n||'style' in n),false);
});

test('project graph preserves structural facts, ref, commit and truncation through JSON', () => {
  const model=createProjectConstellation({projectId:'owner/repo',ref:'main',commit:'abcdef1234567',visibility:'private',tree:[{path:'',type:'tree'},{path:'packages',type:'tree'},{path:'packages/core',type:'tree'},{path:'packages/core/package.json',type:'blob'},{path:'packages/core/src',type:'tree'},{path:'packages/core/src/index.js',type:'blob'}],contents:{'packages/core/package.json':'{"name":"repo","main":"src/index.js"}','packages/core/src/index.js':'export default 1;'}});
  const graph=semanticGraphFromProjectConstellation(model);
  assert.equal(graph.project.provenance.ref,'main'); assert.equal(graph.project.provenance.commit,'abcdef1234567'); assert.equal(graph.project.provenance.visibility,'private');
  assert.ok(graph.nodes.some(n=>n.kind==='project-root')); assert.ok(graph.nodes.some(n=>n.kind==='package')); assert.ok(graph.edges.some(e=>e.kind==='entry-of'));
  const roundTrip=parseSemanticGraph(serializeSemanticGraph(graph)); assert.deepEqual(roundTrip,graph);
  assert.equal(semanticGraphFingerprint(roundTrip),semanticGraphFingerprint(graph));
  const projected=projectSemanticGraphToScene(graph); assert.equal(validateScene(projected).valid,true); assert.match(renderSceneSVG(projected),/<svg/);
  assert.equal(JSON.stringify(graph).includes('export default 1'),false);
  const bounded=createProjectConstellation({projectId:'owner/large',tree:[{path:'',type:'tree'},{path:'a',type:'tree'},{path:'b',type:'tree'}]},{nodes:2});
  assert.equal(semanticGraphFromProjectConstellation(bounded).statistics.truncated,true);
});

test('semantic graph validator rejects duplicate IDs, secrets, endpoints and count mismatch', () => {
  const graph=semanticGraphFromScene(createScene('octocat',[{full_name:'octocat/alpha',name:'alpha'}]));
  const duplicate=structuredClone(graph); duplicate.nodes.push(structuredClone(duplicate.nodes[0])); assert.equal(validateSemanticGraph(duplicate).valid,false);
  const secret=structuredClone(graph); secret.nodes[0].label='ghp_abcdefghijklmnopqrstuvwxyz0123456789'; assert.equal(validateSemanticGraph(secret).valid,false);
  const stats=structuredClone(graph); stats.statistics.nodeCount++; assert.equal(validateSemanticGraph(stats).valid,false);
  const broken=structuredClone(graph); broken.edges.push({id:'bad',kind:'member-of',from:'missing',to:broken.nodes[0].id,provenance:[{category:'derived',source:'test'}],evidence:[]}); broken.statistics.edgeCount++; assert.equal(validateSemanticGraph(broken).valid,false);
});
