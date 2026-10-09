import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {buildMethodSelfScanUiPayload,expandMethodSelfScanUiPair} from '../lib/method-self-scan-ui.mjs';
import {
 analyzeResearchInput,
 buildConnectorRequest,
 buildResearchWorkbenchPayload,
 parseResearchWorkbenchInput,
 parseWorkbenchQuery,
 renderResearchWorkbench
} from '../lib/research-workbench-ui.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const exporter=join(root,'scripts','export-method-self-scan.mjs');
const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const sha256Base64=raw=>createHash('sha256').update(raw).digest('base64');
const call=args=>spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});

function capabilityFixture(){
 return {
  format_version:'MPC_OFFLINE_CAPABILITIES_1.0',
  recorded_at_utc:'2026-10-09T12:00:00.000Z',
  scope:'CURRENT_SESSION_CAPABILITY_OBSERVATION_SEPARATE_FROM_STATIC_SCAN',
  surfaces:[
   {name:'GITHUB_PLUGIN',locator:'plugin://github@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'GIT_REMOTE',locator:'mjcustomcomputers-dotcom/Machine-Bug-Tool',capability_status:'AVAILABLE_SOURCE_GIT_ONLY',protected_call_status:'NOT_APPLICABLE',scope:'CURRENT_SESSION'},
   {name:'MPC_MACHINE_LEGAL_SKILL',locator:'skill://Plugin_8ac3267f78148191a431496c9ea0c0be',capability_status:'SKILL_AVAILABLE_CONNECTOR_UNAVAILABLE',protected_call_status:'NOT_APPLICABLE',scope:'CURRENT_SESSION'},
   {name:'MPC_MACHINE_LEGAL_CONNECTOR',locator:'plugin://mpc-machine-legal@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'MPC_BUGTOOLS',locator:'plugin://dev-ec58381195008191a0b03b8066d2b5b6@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'GOOGLE_DRIVE',locator:'plugin://google-drive@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'DROPBOX',locator:'plugin://app-69b31dc2110c8191b8b47dc98fe5a052@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'DROPBOX_DASH',locator:'plugin://app-69ca45719b948191999f401a2108740b@openai-curated-remote',capability_status:'UNAVAILABLE_SCHEMA_NOT_EXPOSED',protected_call_status:'NOT_RUN_TOOL_UNAVAILABLE',scope:'CURRENT_SESSION'},
   {name:'DAYBREAK_SELECTION',locator:'product://daybreak-model-selection',capability_status:'NOT_OBSERVED_CURRENT_TASK',protected_call_status:'NOT_OBSERVED_CURRENT_TASK',scope:'CURRENT_SESSION'}
  ],
  prior_evidence:[
   {name:'MPC_RUNTIME_STATUS',receipt_sha256:'1'.repeat(64),scope:'PRIOR_SESSION_PRESERVED_NOT_CURRENT_ACCESS'},
   {name:'GOOGLE_DRIVE_WORKBOOK',receipt_sha256:'2'.repeat(64),scope:'PRIOR_SESSION_PRESERVED_NOT_CURRENT_ACCESS'},
   {name:'DROPBOX_DASH_SEARCH',receipt_sha256:'3'.repeat(64),scope:'PRIOR_SESSION_PRESERVED_NOT_CURRENT_ACCESS'}
  ],
  boundaries:{credentials_included:false,current_session_protected_calls:0,exporter_network_calls:0,exporter_connector_calls:0,
   daybreak_status:'PRIOR_USER_REPORTED_DAYBREAK_BLUE_PRESERVED'}
 };
}

function embeddedPayload(html){
 const embedded=html.match(/<div id="workbench-data" hidden>([^]*?)<\/div>/u);
 assert.ok(embedded);
 return JSON.parse(Buffer.from(embedded[1],'base64').toString('utf8'));
}

test('offline exporter creates a checksum-bound MPC Research Workbench without stale public names',t=>{
 const temp=mkdtempSync(join(tmpdir(),'research workbench Ω '));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const output=join(temp,'offline product'),capabilitiesPath=join(temp,'capabilities.json'),capabilities=capabilityFixture();
 writeFileSync(capabilitiesPath,JSON.stringify(capabilities,null,2)+'\n');
 const created=call([exporter,'--output-dir',output,'--capabilities-file',capabilitiesPath]);
 assert.equal(created.status,0,created.stderr);
 const result=JSON.parse(created.stdout);
 assert.equal(result.status,'STATIC_METHOD_SELF_SCAN_COMPLETE_WITH_OPEN_GAPS');
 assert.equal(result.scan_sha256,'532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b');
 const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
 assert.equal(manifest.format_version,'MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0');
 for(const required of [
  'method-atlas.sqlite','Run-MPC-Research-Workbench.ps1','Install-MPC-Research-Workbench.ps1',
  'MPC-Research-Workbench.html','OPEN-MPC-RESEARCH-WORKBENCH.cmd','START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd',
  'lib/research-workbench-ui.mjs','lib/research-workbench-store.mjs','scripts/research-workbench-server.mjs',
  'capabilities.json','MPC-RESEARCH-WORKBENCH.md'
 ])assert.ok(manifest.artifacts.some(row=>row.path===required),required);
 for(const stale of ['MPC-Method-Lab.html','OPEN-MPC-METHOD-LAB.cmd','MPC-Method-Self-Scan.cmd']){
  assert.equal(manifest.artifacts.some(row=>row.path===stale),false,stale);
 }
 for(const artifact of manifest.artifacts){
  const raw=readFileSync(join(output,...artifact.path.split('/')));
  assert.equal(raw.length,artifact.bytes,artifact.path);
  assert.equal(sha256(raw),artifact.sha256,artifact.path);
 }

 const databasePath=join(output,'method-atlas.sqlite'),before=readFileSync(databasePath);
 const db=new DatabaseSync(databasePath,{readOnly:true});
 try{
  assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n,239);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offline_scan_methods').get().n,239);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offline_scan_implemented').get().n,24);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM offline_scan_pairs').get().n,28680);
  const reciprocal=db.prepare("SELECT a_to_b_json,b_to_a_json FROM offline_scan_pairs WHERE pair_key='MHA-0119|MHA-0138'").get();
  assert.deepEqual(JSON.parse(reciprocal.a_to_b_json).map(row=>row.relation_type),['COMPLEMENT']);
  assert.deepEqual(JSON.parse(reciprocal.b_to_a_json).map(row=>row.relation_type),['CROSS_CHECK']);
  const savedFingerprint=JSON.parse(db.prepare("SELECT value_json FROM offline_scan_metadata WHERE key='fingerprints'").get().value_json);
  assert.equal(savedFingerprint.scan_sha256,result.scan_sha256);
 }finally{db.close()}

 const direct=readFileSync(join(output,'OPEN-MPC-RESEARCH-WORKBENCH.cmd'));
 assert.match(direct.toString('ascii'),/start "" "%MPC_APP%"/u);
 assert.match(direct.toString('ascii'),/MPC-Research-Workbench\.html/u);
 assert.doesNotMatch(direct.toString('ascii'),/powershell|\.ps1|node(?:\.exe)?/iu);
 assert.ok(direct.includes(Buffer.from('\r\n')));
 const hosted=readFileSync(join(output,'START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd'),'ascii');
 assert.match(hosted,/node\.exe "%~dp0scripts\\research-workbench-server\.mjs" --root "%~dp0\." --open/u);
 assert.doesNotMatch(hosted,/powershell|ExecutionPolicy|https?:\/\//iu);
 const powershell=readFileSync(join(output,'Run-MPC-Research-Workbench.ps1'),'utf8');
 assert.match(powershell,/Get-FileHash/u);
 assert.match(powershell,/--prior-scan/u);
 assert.match(powershell,/MPC-Research-Workbench\.html/u);
 const installer=readFileSync(join(output,'Install-MPC-Research-Workbench.ps1'),'utf8');
 assert.match(installer,/OPEN-MPC-RESEARCH-WORKBENCH\.cmd/u);
 assert.match(installer,/%~dp0MPC-Research-Workbench\\MPC-Research-Workbench\.html/u);
 assert.doesNotMatch(installer,/C:\\Users\\|ExecutionPolicy\s+(?:Bypass|Unrestricted)/iu);
 assert.doesNotMatch(installer,/\$psLauncher|Desktop '.*\.ps1'/u);

 const scan=JSON.parse(readFileSync(join(output,'scan.json'),'utf8'));
 const receipt=JSON.parse(readFileSync(join(output,'receipt.json'),'utf8'));
 const html=readFileSync(join(output,'MPC-Research-Workbench.html'),'utf8');
 assert.ok(Buffer.byteLength(html)<5*1024*1024,`GUI bytes: ${Buffer.byteLength(html)}`);
 assert.match(html,/MPC Research Workbench/u);
 assert.match(html,/type="search"/u);
 assert.match(html,/analysis-input/u);
 assert.match(html,/Import TXT \/ JSON \/ CSV/u);
 assert.match(html,/Connection truth board/u);
 assert.match(html,/Custom GPT \/ AI host/u);
 assert.match(html,/store-input/u);
 assert.match(html,/Daybreak selection \/ availability/u);
 assert.match(html,/Open dependencies & coverage/u);
 assert.match(html,/Content-Security-Policy/u);
 assert.match(html,/connect-src 'self'/u);
 assert.match(html,/script-src 'sha256-[A-Za-z0-9+/=]+'/u);
 assert.match(html,/style-src 'sha256-[A-Za-z0-9+/=]+'/u);
 assert.doesNotMatch(html,/unsafe-inline|unsafe-eval/iu);
 assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/iu);
 const style=html.match(/<style>([^]*?)<\/style>/u)?.[1],script=html.match(/<script>([^]*?)<\/script>/u)?.[1];
 assert.ok(style&&script);
 assert.ok(html.includes(`style-src 'sha256-${sha256Base64(style)}'`));
 assert.ok(html.includes(`script-src 'sha256-${sha256Base64(script)}'`));
 assert.doesNotThrow(()=>new Script(script));
 assert.equal((script.match(/\bfetch\s*\(/gu)??[]).length,1);
 assert.match(script,/const apiPaths=new Set\(\['\/api\/workbench\/status','\/api\/workbench\/runs','\/api\/workbench\/queue'\]\)/u);
 assert.match(script,/location\.protocol!==['"]http:['"]&&location\.protocol!==['"]https:['"]/u);
 assert.doesNotMatch(script,/\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon|innerHTML)\b|document\.write/u);
 const ui=embeddedPayload(html);
 const expectedUi=buildResearchWorkbenchPayload(scan,{capabilities,build_commit:receipt.source_before.commit,
  working_tree_dirty:receipt.source_before.working_tree_dirty});
 assert.deepEqual(ui,expectedUi);
 assert.equal(ui.build.commit,receipt.source_before.commit);
 assert.equal(ui.build.working_tree_dirty,receipt.source_before.working_tree_dirty);
 assert.equal(ui.methods.length,239);
 assert.equal(ui.implemented_methods.length,24);
 assert.equal(ui.sources.length,65);
 assert.equal(ui.pairs.length,28680);
 assert.equal(ui.edges.length,212);
 assert.equal(ui.daybreak.status,'PRIOR_USER_REPORTED_DAYBREAK_BLUE_PRESERVED');
 assert.equal(ui.daybreak.connector_access_independent,true);
 assert.ok(ui.coverage_gaps.some(value=>/structured author, professor, institution, book/iu.test(value)));
 assert.ok(ui.coverage_gaps.some(value=>/GUI, UX, HCI, accessibility, WCAG or Nielsen/iu.test(value)));
 const github=ui.connections.find(row=>row.provider==='GITHUB'),git=ui.connections.find(row=>row.provider==='GIT_REMOTE');
 const mpc=ui.connections.find(row=>row.provider==='MPC_MACHINE_LEGAL'),mpcSkill=ui.connections.find(row=>row.provider==='MPC_MACHINE_LEGAL_SKILL');
 const bugtools=ui.connections.find(row=>row.provider==='MPC_BUGTOOLS'),gmail=ui.connections.find(row=>row.provider==='GMAIL');
 assert.match(github.status,/UNAVAILABLE_SCHEMA_NOT_EXPOSED/u);
 assert.match(git.status,/AVAILABLE_SOURCE_GIT_ONLY/u);
 assert.notEqual(github.status,git.status);
 assert.notEqual(mpc.status,mpcSkill.status);
 assert.equal(bugtools.current[0].protected_call_verified,false);
 assert.ok(bugtools.prior.some(row=>row.receipt_sha256==='1'.repeat(64)));
 assert.equal(bugtools.connected_claim,false);
 assert.equal(gmail.status,'HOST_BRIDGE_REQUIRED_NOT_CONFIGURED');
 assert.ok(ui.connections.every(row=>row.connected_claim===false));

 const legacyUi=buildMethodSelfScanUiPayload(scan);
 for(let index=0;index<scan.pair_scan.rows.length;index++){
  const source=scan.pair_scan.rows[index],packed=legacyUi.pairs[index],evidence=source.evidence_vector;
  assert.equal(legacyUi.methods[packed[0]].method_id,source.method_id_a);
  assert.equal(legacyUi.methods[packed[1]].method_id,source.method_id_b);
  const mask=(evidence.same_primary_source_id?1:0)|(evidence.same_exact_source_locator?2:0)|(evidence.same_family?4:0)|
   (evidence.same_dimension_set?8:0)|(evidence.same_taxonomy_signature?16:0)|(evidence.same_classifier_question?32:0);
  assert.equal(packed[2],mask,source.pair_key);
  assert.deepEqual(packed.slice(3).map(value=>legacyUi.status_values[value]),Object.values(source.assessment),source.pair_key);
  assert.deepEqual(expandMethodSelfScanUiPair(legacyUi,packed),source,source.pair_key);
 }

 const hostile=structuredClone(scan);
 hostile.methods[0].method_name='</script><svg onload=alert(1)> & \u2028';
 const hostileHtml=renderResearchWorkbench(hostile,{capabilities,build_commit:'a'.repeat(40)});
 assert.doesNotMatch(hostileHtml,/<svg onload/iu);
 assert.equal(embeddedPayload(hostileHtml).methods[0].method_name,hostile.methods[0].method_name);

 const rerunDir=join(output,'runs','zero delta');
 const rerun=call([
  join(output,'scripts','portable-method-self-scan.mjs'),'--database',databasePath,
  '--capsules',join(output,'implemented-capsules.json'),'--manifest',join(output,'manifest.json'),
  '--output-dir',rerunDir,'--prior-scan',join(output,'scan.json')
 ]);
 assert.equal(rerun.status,0,rerun.stderr);
 assert.equal(JSON.parse(rerun.stdout).status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 assert.deepEqual(readFileSync(databasePath),before);
 assert.equal(existsSync(join(rerunDir,'manifest.json')),true);
 assert.equal(existsSync(join(rerunDir,'MPC-Research-Workbench.html')),true);
 assert.equal(existsSync(join(rerunDir,'START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd')),false);
 assert.deepEqual(readFileSync(join(rerunDir,'capabilities.json')),readFileSync(join(output,'capabilities.json')));
 const repeatUi=embeddedPayload(readFileSync(join(rerunDir,'MPC-Research-Workbench.html'),'utf8'));
 assert.equal(repeatUi.build.commit,receipt.source_before.commit);
 assert.equal(repeatUi.build.working_tree_dirty,receipt.source_before.working_tree_dirty);
 assert.deepEqual(repeatUi.connections,ui.connections);
 assert.equal(repeatUi.daybreak.status,ui.daybreak.status);

 const rejected=call([exporter,'--output-dir',output]);
 assert.equal(rejected.status,1);
 assert.match(rejected.stderr,/EEXIST/u);
 assert.deepEqual(readFileSync(databasePath),before);
 const repeated=join(temp,'repeat product');
 const repeat=call([exporter,'--output-dir',repeated,'--prior-scan',join(output,'scan.json'),'--capabilities-file',capabilitiesPath]);
 assert.equal(repeat.status,0,repeat.stderr);
 assert.equal(JSON.parse(repeat.stdout).status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 const unsafe=join(temp,'unsafe capabilities.json'),unsafeOutput=join(temp,'unsafe product');
 writeFileSync(unsafe,JSON.stringify({access_token:'TOP-SECRET-FIXTURE'}));
 const denied=call([exporter,'--output-dir',unsafeOutput,'--capabilities-file',unsafe]);
 assert.equal(denied.status,1);
 assert.match(denied.stderr,/CAPABILITIES_SCHEMA_MISMATCH/u);
 assert.equal(existsSync(unsafeOutput),false);
 const tamperedOutput=join(temp,'tampered repeat');
 writeFileSync(join(output,'capabilities.json'),'{}\n');
 const tampered=call([
  join(output,'scripts','portable-method-self-scan.mjs'),'--database',databasePath,
  '--capsules',join(output,'implemented-capsules.json'),'--manifest',join(output,'manifest.json'),'--output-dir',tamperedOutput
 ]);
 assert.equal(tampered.status,1);
 assert.match(tampered.stderr,/BUNDLE_FILE_CHECKSUM_MISMATCH/u);
 assert.equal(existsSync(tamperedOutput),false);
});

test('workbench parses data, ranks hooks and builds non-executing connector requests deterministically',async t=>{
 const temp=mkdtempSync(join(tmpdir(),'workbench helper '));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const output=join(temp,'source product'),created=call([exporter,'--output-dir',output]);
 assert.equal(created.status,0,created.stderr);
 const scan=JSON.parse(readFileSync(join(output,'scan.json'),'utf8'));

 assert.deepEqual(parseResearchWorkbenchInput('alpha\nbeta',{formatHint:'TXT'}).profile,{
  format:'TEXT',utf8_bytes:10,line_count:2,semantic_schema_inferred:false
 });
 const jsonA=parseResearchWorkbenchInput('{"z":1,"a":{"b":2}}',{formatHint:'JSON'});
 const jsonB=parseResearchWorkbenchInput({a:{b:2},z:1},{formatHint:'JSON'});
 assert.equal(jsonA.canonical_text,jsonB.canonical_text);
 assert.deepEqual(jsonA.profile,{format:'JSON',utf8_bytes:19,root_type:'object',item_count:2,semantic_schema_inferred:false});
 const csv=parseResearchWorkbenchInput('name,value\r\n"alpha, beta","quoted"\r\nlast,row',{formatHint:'CSV'});
 assert.equal(csv.profile.format,'CSV');
 assert.equal(csv.profile.row_count,3);
 assert.equal(csv.profile.column_count,2);
 assert.equal(csv.profile.header_inferred,false);
 assert.throws(()=>parseResearchWorkbenchInput('{bad',{formatHint:'JSON'}),/WORKBENCH_JSON_INVALID/u);
 assert.throws(()=>parseResearchWorkbenchInput('a,b\n1',{formatHint:'CSV'}),/WORKBENCH_CSV_RAGGED_ROWS/u);
 assert.throws(()=>parseResearchWorkbenchInput('a,"bad',{formatHint:'CSV'}),/WORKBENCH_CSV_UNCLOSED_QUOTE/u);
 assert.throws(()=>parseResearchWorkbenchInput('x'.repeat(262145)),/WORKBENCH_INPUT_TOO_LARGE/u);

 const runs=[
  analyzeResearchInput(scan,'x',{query:'"hidden markov"',formatHint:'TEXT',limit:5}),
  analyzeResearchInput(scan,{a:'x'},{query:'"hidden markov"',formatHint:'JSON',limit:5}),
  analyzeResearchInput(scan,'a,b\n1,2',{query:'"hidden markov"',formatHint:'CSV',limit:5})
 ];
 for(const run of runs){
  assert.equal(run.methods[0].method_id,'MHA-0023');
  assert.equal(run.method_execution_performed,false);
  assert.equal(run.source_authentication,false);
  assert.equal(run.independent_evidence_proven,false);
 }
 assert.deepEqual(runs[0],analyzeResearchInput(scan,'x',{query:'"hidden markov"',formatHint:'TEXT',limit:5}));
 assert.throws(()=>parseWorkbenchQuery('mystery:value'),/WORKBENCH_UNKNOWN_FACET:mystery/u);
 const andQuery=analyzeResearchInput(scan,'',{query:'discipline:PHYSICS purpose:REDUCE',limit:100});
 assert.deepEqual(andQuery.methods.map(row=>row.method_id),['MHA-0001']);
 const orQuery=analyzeResearchInput(scan,'',{query:'purpose:REDUCE purpose:DETECT',limit:100});
 assert.ok(orQuery.methods.some(row=>row.method_id==='MHA-0001'));
 assert.ok(orQuery.result_count>andQuery.result_count);
 const namespaceQuery=analyzeResearchInput(scan,'',{query:'model-kind:FORMAL_OR_QUANTITATIVE workflow-stage:MODEL_VALIDATION',limit:100});
 assert.ok(namespaceQuery.methods.some(row=>row.method_id==='MHA-0001'));

 const requestContent={summary:'Local derived analysis',method_ids:['MHA-0023']};
 const requestArtifact=JSON.stringify(requestContent,null,2)+'\n';
 const requestInput={provider:'GITHUB',action:'CREATE_NEW_BRANCH_ARTIFACT',label:'Reviewed local result',payload:{
  run_id:null,artifact_name:'analysis.json',artifact_sha256:sha256(requestArtifact),artifact_bytes:Buffer.byteLength(requestArtifact),
  media_type:'application/json',destination_hint:'NEW_BRANCH_ONLY',content:requestContent
 }};
 const queued=buildConnectorRequest(requestInput);
 assert.deepEqual(queued,buildConnectorRequest(requestInput));
 assert.match(queued.request_id,/^WRQ-[a-f0-9]{24}$/u);
 assert.equal(queued.state,'QUEUED_LOCALLY_NOT_SENT');
 assert.equal(queued.host_action_called,false);
 assert.equal(queued.host_action_performed,false);
 assert.equal(queued.write_performed,false);
 assert.equal(queued.provider_receipt,null);
 assert.throws(()=>buildConnectorRequest({...requestInput,action:'CREATE_NEW'}),/WORKBENCH_CONNECTOR_ACTION_NOT_ALLOWED/u);
 assert.throws(()=>buildConnectorRequest({...requestInput,label:' '}),/WORKBENCH_CONNECTOR_LABEL_REQUIRED/u);
 assert.throws(()=>buildConnectorRequest({...requestInput,payload:{constructor:'unsafe'}}),/WORKBENCH_UNSAFE_OBJECT_KEY_REJECTED/u);
 assert.throws(()=>buildConnectorRequest({...requestInput,payload:{access_token:'unsafe'}}),/WORKBENCH_CREDENTIAL_FIELD_REJECTED/u);
 assert.throws(()=>buildConnectorRequest({...requestInput,payload:{note:'github_pat_'+'A'.repeat(44)}}),/WORKBENCH_CREDENTIAL_VALUE_REJECTED/u);
});
