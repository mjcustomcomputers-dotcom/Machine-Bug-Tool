import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {exportReasoningIntelligence} from '../scripts/export-reasoning-intelligence.mjs';
import {reasoningEngineIdentity,reasoningRuntimeFiles} from '../scripts/run-reasoning-selfplay.mjs';

test('Portable export executes copied source, preserves bytes and continues the saved seed without a repository',()=>{
 const parent=mkdtempSync(join(tmpdir(),'mpc portable intelligence Ω ')),output=join(parent,'new bundle');
 const result=exportReasoningIntelligence({output_directory:output,seed:20261009,rounds:1});
 assert.equal(result.status,'PORTABLE_REASONING_LAB_CREATED');
 assert.equal(result.run.summary.failed,0);
 assert.equal(result.engine_fingerprint,reasoningEngineIdentity().engine_fingerprint);
 const original=readFileSync(join(result.run.output_directory,'scan.json'));
 const receipt=JSON.parse(readFileSync(join(result.run.output_directory,'receipt.json'),'utf8'));
 assert.equal(receipt.git.commit,null);
 const manifest=JSON.parse(readFileSync(join(output,'MANIFEST.json'),'utf8'));
 assert.ok(!manifest.files.some(x=>x.path==='Runs/latest.json'));
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(join(output,file.path))).digest('hex'),file.sha256);
 const next=JSON.parse(execFileSync(process.execPath,[join(output,'scripts/run-reasoning-selfplay.mjs'),'--output-root',join(output,'Runs'),'--rounds','1'],{cwd:parent,encoding:'utf8'}));
 assert.equal(next.seed,result.run.next_seed);assert.equal(next.summary.failed,0);
 assert.deepEqual(readFileSync(join(result.run.output_directory,'scan.json')),original);
 assert.ok(existsSync(join(output,'OPEN-REPORT.html')));
 const workflow=JSON.parse(execFileSync(process.execPath,[join(output,'scripts/run-evidence-workflow.mjs'),'--input',join(output,'data/evidence-workflow-example.json'),'--output',join(output,'workflow.json')],{cwd:parent,encoding:'utf8'}));
 assert.equal(workflow.work_stage,'EVIDENCE_ACQUISITION');
 assert.equal(workflow.next_action.kind,'ACQUIRE_RECORD');
 const comparison=JSON.parse(execFileSync(process.execPath,[join(output,'scripts/run-local-live-intelligence.mjs'),'--output',join(output,'comparison.json')],{cwd:parent,encoding:'utf8'}));
 assert.equal(comparison.cases,48);assert.equal(comparison.classifications.MISSING_LIVE_OBSERVATION,48);
 assert.throws(()=>exportReasoningIntelligence({output_directory:output,rounds:1}),/OUTPUT_ALREADY_EXISTS/);
 assert.deepEqual(readFileSync(join(result.run.output_directory,'scan.json')),original);
});

test('PowerShell manifest admission covers every executed reasoning source file',()=>{
 const script=readFileSync(new URL('../scripts/Run-Reasoning-Intelligence.ps1',import.meta.url),'utf8');
 const block=script.split('$requiredRuntimePaths = @(')[1].split('\n    )')[0];
 const listed=new Set([...block.matchAll(/'([^']+)'/gu)].map(match=>match[1]));
 for(const path of reasoningRuntimeFiles)assert.ok(listed.has(path),path);
});
