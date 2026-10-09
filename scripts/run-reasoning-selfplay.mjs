#!/usr/bin/env node
// Bounded offline reasoning exploration with append-only run receipts.
// The only mutable pointer belongs to this NEW local lab, never a native MPC
// research controller. A lock prevents two local writers from racing it.
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,existsSync,renameSync,unlinkSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonical} from '../lib/universal.mjs';
import {runReasoningSelfplay} from '../lib/reasoning-selfplay.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const VERSION='MPC_LOCAL_REASONING_CURSOR_V1';
const hash=raw=>createHash('sha256').update(typeof raw==='string'||Buffer.isBuffer(raw)?raw:canonical(raw)).digest('hex');
const safeJson=(path,limit=32*1024*1024)=>{
 const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error('REGULAR_BOUNDED_JSON_REQUIRED');
 return JSON.parse(readFileSync(path,'utf8'));
};
const put=(path,value)=>writeFileSync(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{encoding:'utf8',flag:'wx'});
const checkedHash=(value,field)=>{if(typeof value!=='string'||!/^[a-f0-9]{64}$/u.test(value))throw Error('INVALID_'+field);};
const htmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export const reasoningRuntimeFiles=Object.freeze([
 'scripts/run-reasoning-selfplay.mjs','lib/reasoning-selfplay.mjs','lib/finite-information-reasoning.mjs',
 'lib/finite-stochastic-observation.mjs',
 'lib/finite-imperfect-information-regret.mjs',
 'lib/finite-budget-sensitive-search.mjs',
 'lib/finite-adaptive-two-stage-choice.mjs',
 'lib/finite-abstraction-refinement.mjs','lib/noahs-ark-reasoning.mjs','lib/methods.mjs','lib/schema.mjs','lib/universal.mjs',
 'lib/atomic-models.mjs','lib/atomic-source-pointers.json','lib/forensic-models.mjs','lib/forensic-source-pointers.json',
 'lib/deferred-models.mjs','lib/method-overlay.json',
 'method-atlas/candidates.json','method-atlas/expansion-2026-v2.json','method-atlas/expansion-evidence-intent-v3.json',
 'method-atlas/expansion-computation-schools-v4.json','method-atlas/expansion-nasa-chip-cloud-v5.json',
 'method-atlas/expansion-abnormal-meta-v6.json','method-atlas/expansion-optical-v8.json','method-atlas/method-relations.json'
]);

export function reasoningEngineIdentity(root=ROOT){
 const files=reasoningRuntimeFiles.map(path=>{const full=resolve(root,path),stat=lstatSync(full);if(!stat.isFile()||stat.isSymbolicLink())throw Error('REGULAR_RUNTIME_SOURCE_REQUIRED:'+path);
  const bytes=readFileSync(full);return {path,bytes:bytes.length,sha256:hash(bytes)};}).sort((a,b)=>a.path.localeCompare(b.path));
 return {engine_fingerprint:hash(files),files,meaning:'Exact local runtime and catalog bytes, not external source authenticity'};
}

function readCursor(path){
 const cursor=safeJson(path,8*1024*1024),allowed=['version','engine_fingerprint','seed','next_seed','last_status','seen_case_fingerprints','last_run','last_scan_sha256','prior_cursor_sha256','cursor_sha256'];
 if(!cursor||typeof cursor!=='object'||Array.isArray(cursor)||Object.keys(cursor).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(cursor,k))||cursor.version!==VERSION)throw Error('INVALID_REASONING_CURSOR');
 const {cursor_sha256,...body}=cursor;checkedHash(cursor_sha256,'CURSOR_HASH');
 if(hash(body)!==cursor_sha256)throw Error('REASONING_CURSOR_DIGEST_MISMATCH');
 for(const field of ['engine_fingerprint','last_scan_sha256'])checkedHash(cursor[field],field);
 if(cursor.prior_cursor_sha256!==null)checkedHash(cursor.prior_cursor_sha256,'PRIOR_CURSOR_HASH');
 for(const field of ['seed','next_seed'])if(!Number.isInteger(cursor[field])||cursor[field]<1||cursor[field]>0xffffffff)throw Error('INVALID_REASONING_CURSOR_SEED');
 if(!['BOUNDED_SELF_CHALLENGES_PASS','COUNTEREXAMPLES_REQUIRE_REVIEW'].includes(cursor.last_status)||typeof cursor.last_run!=='string'||!/^[A-Za-z0-9_.-]{1,150}$/u.test(cursor.last_run))throw Error('INVALID_REASONING_CURSOR_STATE');
 if(!Array.isArray(cursor.seen_case_fingerprints)||cursor.seen_case_fingerprints.length>65536||new Set(cursor.seen_case_fingerprints).size!==cursor.seen_case_fingerprints.length)throw Error('INVALID_REASONING_CURSOR_CASES');
 cursor.seen_case_fingerprints.forEach(x=>checkedHash(x,'CASE_HASH'));
 const priorPath=resolve(dirname(path),cursor.last_run,'scan.json'),stat=lstatSync(priorPath);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024||hash(readFileSync(priorPath))!==cursor.last_scan_sha256)throw Error('PRIOR_SCAN_READBACK_MISMATCH');
 const scan=safeJson(priorPath);
 if(scan.engine_fingerprint!==cursor.engine_fingerprint||scan.seed!==cursor.seed||scan.next_seed!==cursor.next_seed||scan.status!==cursor.last_status||
  canonical(scan.seen_case_fingerprints)!==canonical(cursor.seen_case_fingerprints))throw Error('CURSOR_PRIOR_SCAN_SEMANTIC_MISMATCH');
 return cursor;
}

function gitIdentity(){try{
 const top=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 if(resolve(top)!==ROOT)throw Error('PORTABLE_COPY_INSIDE_OTHER_CHECKOUT');
 return {commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(),
 working_tree_dirty:Boolean(execFileSync('git',['status','--porcelain=v1','--untracked-files=normal'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()),scope:'CHECKOUT_HEAD_METADATA;EXACT_RUNTIME_FINGERPRINT_IS_BINDING'};}
 catch{return {commit:null,working_tree_dirty:null,scope:'PORTABLE_RUNTIME_SOURCE_FINGERPRINT_IS_BINDING'};}}

function reportHtml(scan,receipt){
 const groups=[...new Set(scan.cases.map(c=>c.family))].map(family=>({family,cases:scan.cases.filter(c=>c.family===family)}));
 const table=groups.map(({family,cases})=>`<tr><td>${htmlEscape(family.replaceAll('_',' '))}</td><td>${cases.length}</td><td>${cases.filter(c=>c.passed).length}</td><td>${cases.filter(c=>!c.passed).length}</td></tr>`).join('');
 const key=scan.cases.find(c=>c.family==='information_value'&&c.anchor_regression);
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MPC reasoning intelligence pass</title>
 <style>body{font:16px/1.55 system-ui,sans-serif;background:#101921;color:#e7edf1;margin:0}main{max-width:1080px;margin:auto;padding:40px 28px}h1{font-size:38px;line-height:1.1}h2{margin-top:34px;color:#86dfce}.kicker{color:#86dfce;letter-spacing:.13em;font-size:13px}.stats{display:flex;flex-wrap:wrap;gap:16px}.card{background:#1b2a35;border:1px solid #304654;border-radius:10px;padding:18px 24px;flex:1;min-width:160px}.card b{font-size:30px;display:block}table{border-collapse:collapse;width:100%;margin:18px 0}td,th{text-align:left;padding:10px;border-bottom:1px solid #304654}th{color:#a7bdcc}code{overflow-wrap:anywhere;color:#86dfce}a{color:#8dcbff}.muted{color:#afbec8}p{max-width:94ch}details{padding:14px;border:1px solid #304654;margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}@media print{body{background:white;color:#15202b}h2,.kicker,code{color:#17574d}.card{background:#eef5f4}.muted{color:#42545d}}</style>
 <main><div class="kicker">DAYBREAK · MPC · EXECUTED REASONING PASS</div><h1>Methods testing their own reasoning</h1>
 <p>This pass executes finite synthetic decision, information, accounting, timing and abstraction models. Each result retains the supplied assumptions, an expected relationship and a reproducible receipt.</p>
 <div class="stats"><div class="card"><b>${scan.summary.cases_executed}</b>executed scenarios</div><div class="card"><b>${scan.summary.native_evaluator_calls}</b>native model evaluations</div><div class="card"><b>${scan.summary.distinct_native_evaluators}</b>distinct native evaluators</div><div class="card"><b>${scan.summary.failed}</b>unexpected failures</div></div>
 <p><strong>Status:</strong> ${htmlEscape(scan.status)}. Seed ${scan.seed}; next seed ${scan.next_seed}. ${scan.summary.new_exploratory_cases} new exploratory parameterizations; ${scan.summary.anchor_replays} deliberate regression checks; ${scan.summary.duplicates_skipped} exact duplicate cases skipped.</p>
 <h2>What the experiments test</h2><p>The planner must choose a ready linked check when its preferred challenger lacks inputs. Hidden-state policies must respect what the actor can see. A proposed observation must improve the actual decision enough to justify its supplied cost. A supplied simultaneous strategy must expose every profitable unilateral deviation. A bounded search must stop when expansion cost cannot improve net utility. A two-stage computation policy may buy a different second check after different first results, but only when exhaustive contingent-policy scoring justifies it. An abstract failure path must replay on the concrete state graph. Native methods separately reconcile fault trees, ledger balances, equilibrium payoffs and event prerequisites.</p>
 <table><thead><tr><th>Experiment family</th><th>Cases</th><th>Passed</th><th>Unexpected failure</th></tr></thead><tbody>${table}</tbody></table>
 <h2>Poker-style information boundary</h2><p>In the fair hidden-bit control, ordinary guessing has value <strong>0.5</strong>; the omniscient upper bound is <strong>1</strong>. Secretly choosing according to the hidden bit is rejected. A legitimate reveal costing 0.1 has net information value <strong>0.4</strong>. A repeated already-known observation adds zero. Displayed values are rounded projections of exact rational computations on the supplied binary64 inputs; the receipts retain exact fractions and numerical residuals.</p>
 ${key?`<details><summary>Measured hidden-bit result</summary><pre>${htmlEscape(JSON.stringify(key.observed,null,2))}</pre></details>`:''}
 <h2>Continuity and evidence</h2><p>Every run creates a new directory. The local lab verifies its prior scan and cursor before advancing the seed. If runtime or catalog bytes change, it replays the previous seed with the new source. Its cursor is separate from the existing MPC research controllers.</p><p>Engine fingerprint: <code>${receipt.engine.engine_fingerprint}</code><br>Checkout HEAD, when available: <code>${receipt.git.commit??'portable bundle'}</code><br>Working tree dirty: ${receipt.git.working_tree_dirty??'not applicable'}<br>Completed: ${receipt.completed_at_utc}</p>
 <p><a href="scan.json">Complete scenario receipts</a> · <a href="summary.json">Compact measured summary</a> · <a href="cursor.json">Next-pass cursor</a> · <a href="receipt.json">Execution receipt</a></p>
 <h2>Scope of the result</h2><p class="muted">The native inventory remains 24 evaluators and 239 research candidates. This pass adds local adapters and an experiment runner. It does not train the language model, solve arbitrary poker, establish real-world source truth, contact bounty targets, alter the historical controller, or deploy the hosted service. New structural experiment families still require reviewed code. Passing these finite cases is not a general intelligence score.</p>
 <h2>Research basis</h2><p><a href="https://proceedings.neurips.cc/paper/2007/file/08d98638c6fcd194a4b1e6992063e944-Paper.pdf">CFR: information-set constraints</a>; <a href="https://www.cs.cmu.edu/~emc/papers/Papers%20In%20Refereed%20Journals/Counterexample-guided%20abstraction%20refinement.pdf">counterexample-guided abstraction refinement</a>; <a href="https://arxiv.org/pdf/2002.12543">metamorphic testing</a>; <a href="https://papers.neurips.cc/paper/5552-algorithm-selection-by-rational-metareasoning-as-a-model-of-human-strategy-selection.pdf">decision value and computation cost</a>. These are method foundations; the receipts establish what this implementation actually ran.</p></main></html>`;
}

export async function runLocalReasoningPass({output_root=resolve(ROOT,'.sites-runtime/reasoning-intelligence'),seed,rounds=24}={}){
 if(seed!==undefined&&(!Number.isInteger(seed)||seed<1||seed>0xffffffff)||!Number.isInteger(rounds)||rounds<1||rounds>64)throw Error('INVALID_LOCAL_REASONING_BUDGET');
 const base=resolve(output_root);mkdirSync(base,{recursive:true});
 if(lstatSync(base).isSymbolicLink()||!lstatSync(base).isDirectory())throw Error('REGULAR_OUTPUT_DIRECTORY_REQUIRED');
 const lockPath=resolve(base,'runner.lock'),cursorPath=resolve(base,'latest.json');
 let lock;try{lock=openSync(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error('LOCAL_REASONING_WRITER_BUSY_PRESERVE_LOCK');throw error;}
 let temporaryCursor=null;
 try{
  const engine=reasoningEngineIdentity(),prior=existsSync(cursorPath)?readCursor(cursorPath):null;
  const changed=Boolean(prior&&prior.engine_fingerprint!==engine.engine_fingerprint);
  const replay=Boolean(prior&&(changed||prior.last_status==='COUNTEREXAMPLES_REQUIRE_REVIEW'));
  const selectedSeed=seed??(prior?(replay?prior.seed:prior.next_seed):20261009);
  const start=new Date().toISOString(),runName=start.replaceAll(':','-').replaceAll('.','-')+'-'+selectedSeed+'-'+randomBytes(4).toString('hex');
  const output=resolve(base,runName);mkdirSync(output,{recursive:false});
  const result=await runReasoningSelfplay({seed:selectedSeed,rounds,prior_case_fingerprints:changed?[]:prior?.seen_case_fingerprints??[],
   engine_fingerprint:engine.engine_fingerprint,prior_engine_fingerprint:prior?.engine_fingerprint??null});
  const scanPath=resolve(output,'scan.json');put(scanPath,result);const scanSha=hash(readFileSync(scanPath));
  const cursorBody={version:VERSION,engine_fingerprint:engine.engine_fingerprint,seed:result.seed,next_seed:result.next_seed,last_status:result.status,
   seen_case_fingerprints:result.seen_case_fingerprints,last_run:runName,last_scan_sha256:scanSha,prior_cursor_sha256:prior?.cursor_sha256??null};
  const cursor={...cursorBody,cursor_sha256:hash(cursorBody)};
  put(resolve(output,'cursor.json'),cursor);
  const receipt={version:'MPC_REASONING_EXECUTION_RECEIPT_V1',started_at_utc:start,completed_at_utc:new Date().toISOString(),
   engine,git:gitIdentity(),runtime:{node:process.version,platform:process.platform,architecture:process.arch},
   scan_sha256:scanSha,prior_cursor_sha256:prior?.cursor_sha256??null,source_changed_since_prior:changed,replayed_previous_seed:replay&&seed===undefined,
   output_directory:output,network_calls:0,connector_calls:0,native_research_controller_modified:false,hosted_deployment:false};
  put(resolve(output,'summary.json'),{version:result.version,status:result.status,seed:result.seed,next_seed:result.next_seed,...result.summary,next_action:result.next_action,limitations:result.limitations});
  put(resolve(output,'receipt.json'),receipt);put(resolve(output,'REPORT.html'),reportHtml(result,receipt));
  const files=['scan.json','cursor.json','summary.json','receipt.json','REPORT.html'].map(path=>({path,sha256:hash(readFileSync(resolve(output,path)))}));
  put(resolve(output,'manifest.json'),{version:'MPC_REASONING_RUN_MANIFEST_V1',files});
  // Verify saved bytes before committing this lab's cursor last.
  for(const file of files)if(hash(readFileSync(resolve(output,file.path)))!==file.sha256)throw Error('RUN_READBACK_MISMATCH');
  if(prior){if(readCursor(cursorPath).cursor_sha256!==prior.cursor_sha256)throw Error('CURSOR_CHANGED_DURING_RUN');}
  else if(existsSync(cursorPath))throw Error('CURSOR_CREATED_DURING_RUN');
  temporaryCursor=resolve(base,'cursor-'+randomBytes(8).toString('hex')+'.tmp');put(temporaryCursor,cursor);renameSync(temporaryCursor,cursorPath);temporaryCursor=null;
  if(readCursor(cursorPath).cursor_sha256!==cursor.cursor_sha256)throw Error('CURSOR_READBACK_MISMATCH');
  return {status:result.status,output_directory:output,summary:result.summary,seed:result.seed,next_seed:result.next_seed,engine_fingerprint:engine.engine_fingerprint,cursor_sha256:cursor.cursor_sha256};
 }finally{
  if(temporaryCursor&&existsSync(temporaryCursor))unlinkSync(temporaryCursor);
  closeSync(lock);unlinkSync(lockPath);
 }
}

function parseArguments(argv){
 const input={},seen=new Set();for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];
  if(!['--output-root','--seed','--rounds'].includes(key)||!value||seen.has(key))throw Error('USAGE_OPTIONAL_OUTPUT_ROOT_SEED_ROUNDS');seen.add(key);
  if(key==='--output-root')input.output_root=value;else{if(!/^[0-9]+$/u.test(value))throw Error('INTEGER_ARGUMENT_REQUIRED');input[key.slice(2)]=Number(value);}}
 return input;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runLocalReasoningPass(parseArguments(process.argv.slice(2)));console.log(JSON.stringify(result,null,2));if(result.summary.failed)process.exitCode=1;}
 catch(error){console.error(error.message);process.exitCode=1;}
}
