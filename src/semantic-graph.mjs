import { createScene } from './constellation.mjs';
import { validateScene } from './scene.mjs';
import { createProjectConstellationScene } from './project-constellation-scene.mjs';
import { validateProjectConstellation, PROJECT_CONSTELLATION_VERSION } from './project-constellation.mjs';
import { validateEvidence, EVIDENCE_VERSION } from './evidence.mjs';

export const SEMANTIC_GRAPH_VERSION = 1;
export const SEMANTIC_GRAPH_LIMITS = Object.freeze({ nodes: 4096, edges: 16384, groups: 256, memberships: 32768, string: 4096, jsonBytes: 16 * 1024 * 1024, evidenceFacts: 32768 });
export const SEMANTIC_NODE_KINDS = Object.freeze(['developer','project','semantic-group','language','topic','project-root','package','directory','module','entry-point']);
export const SEMANTIC_EDGE_KINDS = Object.freeze(['member-of','repository-owner','uses-language','has-topic','project-relationship','contains','workspace-member','entry-of','imports']);
const safeText = value => typeof value === 'string' && value.length > 0 && value.length <= SEMANTIC_GRAPH_LIMITS.string && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) && !/(?:gh[pousr]_[A-Za-z\d]{20,}|github_pat_[A-Za-z\d_]{20,}|bearer\s+\S+)/i.test(value);
const obj = value => value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const clone = value => JSON.parse(JSON.stringify(value));
const idHash = value => { let h=2166136261; for (const c of value) h=Math.imul(h^c.codePointAt(0),16777619); return (h>>>0).toString(16).padStart(8,'0'); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : obj(value) ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const canonicalGraph = graph => {
  const value=canonical(graph);
  for(const key of ['nodes','edges','groups']) if(Array.isArray(value[key])) value[key].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(value.evidence){value.evidence.facts.sort((a,b)=>a.id.localeCompare(b.id));value.evidence.subjects.sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));for(const s of value.evidence.subjects)s.facts.sort();}
  return value;
};
const validProvenance = p => obj(p) && ['source','user','derived'].includes(p.category) && safeText(p.source) && Object.keys(p).every(k=>['category','source','ref','commit'].includes(k)) && (p.ref===undefined||safeText(p.ref)) && (p.commit===undefined||typeof p.commit==='string'&&/^[a-f\d]{7,64}$/i.test(p.commit));
function safeTree(value, depth=0) {
  if (depth > 8) throw new Error('Semantic graph value exceeds nesting bounds.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { if (value.length > SEMANTIC_GRAPH_LIMITS.string || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value) || /(?:gh[pousr]_[A-Za-z\d]{20,}|github_pat_[A-Za-z\d_]{20,}|bearer\s+\S+)/i.test(value)) throw new Error('Semantic graph contains unsafe or oversized text.'); return value; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Semantic graph contains a non-finite number.'); return value; }
  if (Array.isArray(value)) { if(value.length>4096) throw new Error('Semantic graph value exceeds collection bounds.'); return value.map(x=>safeTree(x,depth+1)); }
  if (!obj(value)) throw new Error('Semantic graph must contain plain JSON values.');
  const keys=Object.keys(value); if(keys.length>256 || keys.some(k=>['__proto__','constructor','prototype'].includes(k)||!safeText(k))) throw new Error('Semantic graph contains an unsafe key.');
  return Object.fromEntries(keys.sort().map(k=>[k,safeTree(value[k],depth+1)]));
}
function finish(subject, nodes, edges, extras={}) {
  nodes.sort((a,b)=>a.id.localeCompare(b.id)); edges.sort((a,b)=>a.id.localeCompare(b.id));
  const graph={ version:SEMANTIC_GRAPH_VERSION, kind:'constellation-semantic-graph', subject, nodes, edges, ...extras };
  graph.statistics={ nodeCount:nodes.length, edgeCount:edges.length, truncated:extras.statistics?.truncated===true, limitations:[...(extras.statistics?.limitations||[])].sort() };
  const result=validateSemanticGraph(graph); if(!result.valid) throw new Error(`Invalid semantic graph: ${result.errors.join(' ')}`);
  return graph;
}
function portableEvidence(attachment) {
  const source=attachment&&validateEvidence(attachment)?attachment:{version:EVIDENCE_VERSION,facts:[],subjects:[]};
  const byKey=new Map(); for(const fact of source.facts){const key=JSON.stringify([fact.kind,fact.value,fact.provenance,fact.source||null]);byKey.set(fact.id,key);}
  const stableIdByKey=new Map(); for(const key of [...new Set(byKey.values())].sort()) stableIdByKey.set(key,`fact:${idHash(key)}${idHash(`${key}#`)}`);
  const facts=[...stableIdByKey].map(([key,id])=>{const [kind,value,provenance,sourceName]=JSON.parse(key);return {id,kind,value,provenance,...(sourceName?{source:sourceName}:{})};}).sort((a,b)=>a.id.localeCompare(b.id));
  const subjects=source.subjects.map(s=>({kind:s.kind,id:s.id,facts:[...new Set(s.facts.map(id=>stableIdByKey.get(byKey.get(id))).filter(Boolean))].sort()})).sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  return {evidence:{version:EVIDENCE_VERSION,facts,subjects},subjectFacts:new Map(subjects.map(s=>[s.id,s.facts]))};
}
function projectMetadataFromScene(scene) {
  const account=scene.metadata?.account || scene.presentation?.graph?.focus || 'unknown';
  const projects=scene.nodes.filter(n=>n.metadata?.nodeKind==='repository' || n.metadata?.full_name?.includes('/'));
  const nodes=[{id:`developer:${account}`,kind:'developer',label:account,properties:{},provenance:[{category:'source',source:'github-profile'}],evidenceIds:[]}];
  const edges=[];
  const {evidence,subjectFacts}=portableEvidence(scene.evidence);
  for(const p of projects){
    const id=p.metadata.full_name;
    nodes.push({id,kind:'project',label:p.metadata.name||id,properties:safeTree({description:p.metadata.description||'',url:p.metadata.html_url||'',language:p.metadata.language||null,topics:(p.metadata.topics||[]).slice(0,32),family:p.metadata.projectFamily||null}),provenance:[{category:'source',source:p.metadata.pluginSource||p.metadata.source||'github'}],evidenceIds:subjectFacts.get(id)||[]});
    edges.push({id:`owner:${idHash(`repository-owner:${id}:${account}`)}`,kind:'repository-owner',from:id,to:`developer:${account}`,provenance:[{category:'derived',source:'repository-owner'}],evidence:[]});
    const language=p.metadata.language;
    if(typeof language==='string'&&language.length&&language.length<=160){const lid=`language:${idHash(language.toLowerCase())}`;if(!nodes.some(n=>n.id===lid))nodes.push({id:lid,kind:'language',label:language,properties:{},provenance:[{category:'source',source:'github-repository-metadata'}],evidenceIds:[]});edges.push({id:`uses-language:${idHash(`${id}:${lid}`)}`,kind:'uses-language',from:id,to:lid,provenance:[{category:'source',source:'github-repository-metadata'}],evidence:[]});}
    for(const topic of (p.metadata.topics||[]).slice(0,32)){if(typeof topic!=='string'||!topic.length||topic.length>160)continue;const tid=`topic:${idHash(topic.toLowerCase())}`;if(!nodes.some(n=>n.id===tid))nodes.push({id:tid,kind:'topic',label:topic,properties:{},provenance:[{category:'source',source:'github-repository-metadata'}],evidenceIds:[]});edges.push({id:`has-topic:${idHash(`${id}:${tid}`)}`,kind:'has-topic',from:id,to:tid,provenance:[{category:'source',source:'github-repository-metadata'}],evidence:[]});}
  }
  const projectIds=new Set(projects.map(p=>p.metadata.full_name));
  for(const pair of scene.presentation?.options?.projectRelationships||[]){if(!Array.isArray(pair)||pair.length!==2||!pair.every(id=>projectIds.has(id)))continue;const [a,b]=[...pair].sort();edges.push({id:`project-relationship:${idHash(`${a}:${b}`)}`,kind:'project-relationship',from:a,to:b,provenance:[{category:'user',source:'user-project-relationship'}],evidence:{source:'user-project-relationship',projects:[a,b]}});}
  const groups=scene.semanticGroups?.groups||[];
  for(const g of groups){
    nodes.push({id:g.id,kind:'semantic-group',label:g.label,properties:safeTree({groupKind:g.kind,members:g.members,basis:g.basis||[]}),provenance:[{category:g.provenance,source:g.provenance==='user'?'user-project-family':'derived-repository-owner'}],evidenceIds:subjectFacts.get(g.id)||[]});
    for(const member of g.members) edges.push({id:`member:${idHash(`${member}:${g.id}`)}`,kind:'member-of',from:member,to:g.id,provenance:[{category:g.provenance,source:g.provenance==='user'?'user-project-family':'derived-repository-owner'}],evidence:[]});
  }
  const relationships=scene.edges.filter(e=>e.metadata?.structuralKind || e.metadata?.relationshipKind || e.metadata?.projectRelationship);
  // Scene edges without an explicit factual relationship declaration are omitted (including visual bridges).
  for(const e of relationships){
    const kind=e.metadata.structuralKind;
    if(SEMANTIC_EDGE_KINDS.includes(kind)) edges.push({id:e.id,kind,from:e.from,to:e.to,provenance:[{category:'source',source:'scene-relationship'}],evidence:safeTree(e.metadata.evidence||[])});
  }
  return finish({kind:'developer',id:account},nodes,edges,{evidence,groups:safeTree(groups.map(g=>({id:g.id,kind:g.kind,provenance:g.provenance,members:g.members,basis:g.basis||[]}))),statistics:{truncated:scene.presentation?.pipeline?.truncated===true,limitations:scene.presentation?.pipeline?.truncated?['source-pipeline-bounded']:[]}});
}
export function semanticGraphFromScene(scene) {
  const validation=validateScene(scene); if(!validation.valid) throw new Error(`Invalid Scene: ${validation.errors.join(' ')}`);
  return projectMetadataFromScene(scene);
}

export function semanticGraphFromProjectConstellation(model) {
  const validation=validateProjectConstellation(model); if(!validation.valid) throw new Error(`Invalid project constellation: ${validation.errors.join(' ')}`);
  const nodes=model.nodes.map(n=>({id:n.id,kind:n.kind,label:n.label,properties:safeTree({path:n.path,projectId:model.projectId,parent:n.parent,source:n.source,metadata:n.metadata}),provenance:[{category:'source',source:n.source==='manifest'?'package-manifest':'repository-tree',ref:model.provenance.ref,...(model.provenance.commit?{commit:model.provenance.commit}:{})}],evidenceIds:[]}));
  const edges=model.edges.map(e=>({id:e.id,kind:e.kind,from:e.from,to:e.to,provenance:[{category:'source',source:e.evidence.source,ref:model.provenance.ref,...(model.provenance.commit?{commit:model.provenance.commit}:{})}],evidence:safeTree(e.evidence)}));
  return finish({kind:'project',id:model.projectId},nodes,edges,{project:{version:PROJECT_CONSTELLATION_VERSION,projectId:model.projectId,manifestPaths:[...model.manifestPaths].sort(),provenance:safeTree(model.provenance),statistics:safeTree(model.statistics)},statistics:{truncated:model.statistics.truncated,limitations:model.statistics.limitation?[model.statistics.limitation]:[]}});
}
function projectModelFromGraph(graph){
  const p=graph.project;
  return {version:p.version,projectId:p.projectId,manifestPaths:p.manifestPaths,provenance:p.provenance,statistics:p.statistics,nodes:graph.nodes.map(n=>({id:n.id,path:n.properties.path,kind:n.kind,label:n.label,parent:n.properties.parent,source:n.properties.source,metadata:n.properties.metadata||{}})),edges:graph.edges.map(e=>({id:e.id,from:e.from,to:e.to,kind:e.kind,evidence:e.evidence}))};
}

export function validateSemanticGraph(graph) {
  const errors=[]; const fail=s=>{if(!errors.includes(s)) errors.push(s);};
  if(!obj(graph)||graph.version!==SEMANTIC_GRAPH_VERSION||graph.kind!=='constellation-semantic-graph'){return {valid:false,errors:['Invalid semantic graph version or kind.']};}
  if(!obj(graph.subject)||!['developer','project'].includes(graph.subject.kind)||!safeText(graph.subject.id)) fail('Invalid semantic subject.');
  if(!Array.isArray(graph.nodes)||graph.nodes.length>SEMANTIC_GRAPH_LIMITS.nodes||!Array.isArray(graph.edges)||graph.edges.length>SEMANTIC_GRAPH_LIMITS.edges) return {valid:false,errors:['Semantic graph exceeds node or edge bounds.']};
  const ids=new Set(); let memberTotal=0;
  for(const n of graph.nodes){ if(!obj(n)||!safeText(n.id)||ids.has(n.id)||!SEMANTIC_NODE_KINDS.includes(n.kind)||!safeText(n.label)||!obj(n.properties)||!Array.isArray(n.provenance)||n.provenance.length<1||n.provenance.length>16||n.provenance.some(p=>!validProvenance(p))||!Array.isArray(n.evidenceIds)||n.evidenceIds.length>64||new Set(n.evidenceIds).size!==n.evidenceIds.length||n.evidenceIds.some(id=>!safeText(id))) fail('Invalid or duplicate semantic node.'); else { ids.add(n.id); try{safeTree(n);}catch{fail('Unsafe semantic node data.');} } }
  const edgeIds=new Set();
  for(const e of graph.edges||[]){ if(!obj(e)||!safeText(e.id)||edgeIds.has(e.id)||!SEMANTIC_EDGE_KINDS.includes(e.kind)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to||!Array.isArray(e.provenance)||!e.provenance.length||e.provenance.some(p=>!validProvenance(p))||!(Array.isArray(e.evidence)||obj(e.evidence))) fail('Invalid or duplicate semantic edge.'); else {edgeIds.add(e.id);try{safeTree(e); }catch{fail('Unsafe semantic edge data.');}} }
  if(graph.evidence!==undefined && (!validateEvidence(graph.evidence,new Set([...ids,...(graph.evidence.subjects||[]).map(s=>s.id)])))) fail('Invalid Evidence v1 attachment.');
  const factIds=new Set(graph.evidence?.facts?.map(f=>f.id)||[]); for(const n of graph.nodes||[])if(n.evidenceIds?.some(id=>!factIds.has(id)))fail('Semantic node references missing evidence.');
  const stats=graph.statistics;
  if(!obj(stats)||stats.nodeCount!==graph.nodes.length||stats.edgeCount!==graph.edges.length||typeof stats.truncated!=='boolean'||!Array.isArray(stats.limitations)||stats.limitations.length>128||stats.limitations.some(x=>!safeText(x))) fail('Inconsistent semantic graph statistics.');
  if(graph.subject?.kind==='project'){
    if(!obj(graph.project)||graph.project.version!==PROJECT_CONSTELLATION_VERSION||graph.project.projectId!==graph.subject.id||!Array.isArray(graph.project.manifestPaths)||!obj(graph.project.provenance)||!obj(graph.project.statistics))fail('Project graph metadata is inconsistent.');
    else {try{const projectValidation=validateProjectConstellation(projectModelFromGraph(graph));if(!projectValidation.valid)fail('Project graph does not preserve a valid Project Constellation.');}catch{fail('Project graph does not preserve a valid Project Constellation.');}}
  }
  if(graph.groups!==undefined&&(!Array.isArray(graph.groups)||graph.groups.length>SEMANTIC_GRAPH_LIMITS.groups))fail('Invalid semantic group inventory.');
  if(graph.groups){for(const g of graph.groups){if(!obj(g)||!safeText(g.id)||!['project-family','repository-owner'].includes(g.kind)||!['user','derived'].includes(g.provenance)||!Array.isArray(g.members)||g.members.length<2||g.members.some(id=>!ids.has(id)))fail('Invalid semantic group or membership.');memberTotal+=g.members.length;}if(memberTotal>SEMANTIC_GRAPH_LIMITS.memberships)fail('Semantic group membership exceeds bounds.');}
  try{safeTree(graph);}catch{fail('Unsafe or oversized semantic graph data.');}
  try{ if(new TextEncoder().encode(JSON.stringify(graph)).length>SEMANTIC_GRAPH_LIMITS.jsonBytes) fail('Semantic graph exceeds serialized size bound.'); }catch{fail('Semantic graph is not serializable JSON.');}
  return {valid:errors.length===0,errors};
}
export function serializeSemanticGraph(graph) {
  const result=validateSemanticGraph(graph); if(!result.valid) throw new Error(`Invalid semantic graph: ${result.errors.join(' ')}`);
  const json=JSON.stringify(canonicalGraph(graph),null,2)+'\n'; if(new TextEncoder().encode(json).length>SEMANTIC_GRAPH_LIMITS.jsonBytes) throw new Error('Semantic graph exceeds 16 MiB.'); return json;
}
export function parseSemanticGraph(json) {
  if(typeof json!=='string'||json.length>SEMANTIC_GRAPH_LIMITS.jsonBytes||new TextEncoder().encode(json).length>SEMANTIC_GRAPH_LIMITS.jsonBytes) throw new Error('Semantic graph JSON exceeds 16 MiB.');
  const graph=JSON.parse(json); const result=validateSemanticGraph(graph); if(!result.valid) throw new Error(`Invalid semantic graph: ${result.errors.join(' ')}`); return canonicalGraph(graph);
}
export function semanticGraphFingerprint(graph) { let h=2166136261; for(const c of serializeSemanticGraph(graph)) h=Math.imul(h^c.codePointAt(0),16777619); return `sg1:${(h>>>0).toString(16).padStart(8,'0')}`; }

export function projectSemanticGraphToScene(graph, options={}, runtime={}) {
  const result=validateSemanticGraph(graph); if(!result.valid) throw new Error(`Invalid semantic graph: ${result.errors.join(' ')}`);
  let scene;
  if(graph.subject.kind==='project'){
    const model=projectModelFromGraph(graph);
    const v=validateProjectConstellation(model); if(!v.valid) throw new Error(`Project graph cannot be projected: ${v.errors.join(' ')}`);
    scene=createProjectConstellationScene(model,options,runtime).scene;
  } else {
    const developer=graph.nodes.find(n=>n.kind==='developer');
    const records=graph.nodes.filter(n=>n.kind==='project').map(n=>({full_name:n.id,name:n.label,description:n.properties.description||'',language:n.properties.language||null,topics:n.properties.topics||[]}));
    scene=createScene(developer?.label||graph.subject.id,records,{...options,maxRepos:Math.max(1,Math.min(100,records.length||1)),includeRepos:records.map(r=>r.full_name)},runtime);
    if(graph.nodes.length>2048)throw new Error('Developer graph is larger than Scene v1 node bounds.');
    const present=new Set(scene.nodes.map(n=>n.id)), centerX=scene.viewport.width/2,centerY=scene.viewport.height/2;
    for(const node of graph.nodes){if(present.has(node.id))continue;const index=scene.nodes.length,angle=-Math.PI/2+index*2.399963229728653,radius=55+Math.sqrt(index)*19;
      scene.nodes.push({id:node.id,geometry:{x:centerX+Math.cos(angle)*radius,y:centerY+Math.sin(angle)*radius,radius:node.kind==='developer'?9:6},metadata:{full_name:node.id,name:node.label,description:`Semantic ${node.kind}`,nodeKind:node.kind,semanticKind:node.kind,provenance:node.provenance,evidenceIds:node.evidenceIds},style:{color:null,glow:null,opacity:1,shape:node.kind==='semantic-group'?'hexagon':node.kind==='developer'?'star':'circle'},interaction:{hidden:false,labelHidden:false}});
      scene.labels.push({id:node.id,x:centerX+Math.cos(angle)*radius+12,y:centerY+Math.sin(angle)*radius+4,text:node.label,hidden:false,focal:false});present.add(node.id);
    }
    const existing=new Set(scene.edges.map(e=>e.id));
    for(const edge of graph.edges){const id=`semantic:${edge.id}`;if(existing.has(id))continue;const from=scene.nodes.find(n=>n.id===edge.from),to=scene.nodes.find(n=>n.id===edge.to);if(!from||!to)continue;
      scene.edges.push({id,from:edge.from,to:edge.to,metadata:{key:id,shared:[],sharedLanguages:[],sharedTopics:[],sharedRepositories:[],strength:1,structuralKind:edge.kind,semanticProvenance:edge.provenance,semanticEvidence:edge.evidence},geometry:{distance:(to.geometry.x-from.geometry.x)**2+(to.geometry.y-from.geometry.y)**2},style:{primary:true}});
    }
    scene.presentation.totalConnections=scene.edges.length;scene.presentation.graph.nodeCount=scene.nodes.length;
    if(graph.evidence)scene.evidence=clone(graph.evidence);
  }
  const validation=validateScene(scene); if(!validation.valid) throw new Error(`Projected Scene invalid: ${validation.errors.join(' ')}`); return scene;
}
