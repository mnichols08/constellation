import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createScene } from '../src/constellation.mjs';
import { semanticGraphFromScene, serializeSemanticGraph } from '../src/semantic-graph.mjs';

test('CLI imports canonical graph files offline and rejects ambiguous acquisition inputs', async () => {
  const directory=await mkdtemp(join(tmpdir(),'constellation-graph-'));
  try {
    const file=join(directory,'alice.semantic-graph.json');
    const graph=semanticGraphFromScene(createScene('alice',[{full_name:'alice/project',name:'Project',language:'Rust'}]));
    const json=serializeSemanticGraph(graph);
    await writeFile(file,json);
    const run=args=>spawnSync(process.execPath,['src/cli.mjs',...args],{encoding:'utf8',cwd:process.cwd(),env:{...process.env,GITHUB_TOKEN:'',GH_TOKEN:'',CONSTELLATION_CONFIG:''}});
    const output=run(['--semantic-graph',file,'--format','json']);
    assert.equal(output.status,0,output.stderr);
    assert.equal(output.stdout,json);
    const markdown=run(['--semantic-graph',file,'--format','markdown']);
    assert.equal(markdown.status,0,markdown.stderr);
    assert.match(markdown.stdout,/alice/);
    const ambiguous=run(['--semantic-graph',file,'--username','alice']);
    assert.notEqual(ambiguous.status,0);
    assert.match(ambiguous.stderr,/cannot be combined/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
