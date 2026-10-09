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
import {buildMethodSelfScanUiPayload,expandMethodSelfScanUiPair,renderMethodSelfScanUi} from '../lib/method-self-scan-ui.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const exporter=join(root,'scripts','export-method-self-scan.mjs');
const sha256=raw=>createHash('sha256').update(raw).digest('hex');
const sha256Base64=raw=>createHash('sha256').update(raw).digest('base64');
const call=args=>spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});

test('offline exporter creates a checksum-bound SQLite and PowerShell product without overwrite',t=>{
 const temp=mkdtempSync(join(tmpdir(),'method self scan Ω '));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const output=join(temp,'offline product');
 const created=call([exporter,'--output-dir',output]);
 assert.equal(created.status,0,created.stderr);
 const result=JSON.parse(created.stdout);
 assert.equal(result.status,'STATIC_METHOD_SELF_SCAN_COMPLETE_WITH_OPEN_GAPS');
 assert.equal(result.scan_sha256,'532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b');
 const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
 assert.equal(manifest.format_version,'MPC_METHOD_SELF_SCAN_OFFLINE_MANIFEST_1.0');
 assert.ok(manifest.artifacts.some(row=>row.path==='method-atlas.sqlite'));
 assert.ok(manifest.artifacts.some(row=>row.path==='Run-Method-Self-Scan.ps1'));
 assert.ok(manifest.artifacts.some(row=>row.path==='Install-Method-Self-Scan.ps1'));
 assert.ok(manifest.artifacts.some(row=>row.path==='MPC-Method-Lab.html'));
 assert.ok(manifest.artifacts.some(row=>row.path==='MPC-Method-Self-Scan.cmd'));
 for(const artifact of manifest.artifacts){
  const raw=readFileSync(join(output,...artifact.path.split('/')));
  assert.equal(raw.length,artifact.bytes,artifact.path);
  assert.equal(sha256(raw),artifact.sha256,artifact.path);
 }
 const databasePath=join(output,'method-atlas.sqlite'),before=readFileSync(databasePath);
 const db=new DatabaseSync(databasePath,{readOnly:true});
 try{
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
 const rejected=call([exporter,'--output-dir',output]);
 assert.equal(rejected.status,1);
 assert.match(rejected.stderr,/EEXIST/);
 assert.deepEqual(readFileSync(databasePath),before);
 const powershell=readFileSync(join(output,'Run-Method-Self-Scan.ps1'),'utf8');
 assert.match(powershell,/Get-FileHash/);
 assert.match(powershell,/--prior-scan/);
 assert.match(powershell,/MPC-Method-Lab\.html/);
 const installer=readFileSync(join(output,'Install-Method-Self-Scan.ps1'),'utf8');
 assert.match(installer,/start `"`" `"%MPC_APP%`"/);
 assert.match(installer,/MPC-Method-Lab\.html/);
 assert.doesNotMatch(installer,/ExecutionPolicy\s+(?:Bypass|Unrestricted)/iu);
 const launcher=readFileSync(join(output,'MPC-Method-Self-Scan.cmd'));
 assert.match(launcher.toString('ascii'),/start "" "%MPC_APP%"/);
 assert.doesNotMatch(launcher.toString('ascii'),/powershell|\.ps1/iu);
 assert.ok(launcher.includes(Buffer.from('\r\n')));
 const scan=JSON.parse(readFileSync(join(output,'scan.json'),'utf8'));
 const html=readFileSync(join(output,'MPC-Method-Lab.html'),'utf8');
 assert.ok(Buffer.byteLength(html)<3*1024*1024,`GUI bytes: ${Buffer.byteLength(html)}`);
 assert.match(html,/Content-Security-Policy/);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/script-src 'sha256-[A-Za-z0-9+/=]+'/);
 assert.match(html,/style-src 'sha256-[A-Za-z0-9+/=]+'/);
 assert.doesNotMatch(html,/unsafe-inline|unsafe-eval/iu);
 assert.doesNotMatch(html,/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/iu);
 const style=html.match(/<style>([^]*?)<\/style>/u)?.[1],script=html.match(/<script>([^]*?)<\/script>/u)?.[1];
 assert.ok(style&&script);
 assert.ok(html.includes(`style-src 'sha256-${sha256Base64(style)}'`));
 assert.ok(html.includes(`script-src 'sha256-${sha256Base64(script)}'`));
 assert.doesNotThrow(()=>new Script(script));
 assert.doesNotMatch(script,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/u);
 const embedded=html.match(/<div id="data" hidden>([^]*?)<\/div>/u);
 assert.ok(embedded);
 const ui=JSON.parse(Buffer.from(embedded[1],'base64').toString('utf8'));
 assert.equal(ui.methods.length,239);
 assert.equal(ui.pairs.length,28680);
 assert.equal(ui.edges.length,212);
 const expectedUi=buildMethodSelfScanUiPayload(scan);
 assert.deepEqual(ui,expectedUi);
 for(let index=0;index<scan.pair_scan.rows.length;index++){
  const source=scan.pair_scan.rows[index],packed=ui.pairs[index],evidence=source.evidence_vector;
  assert.equal(ui.methods[packed[0]].method_id,source.method_id_a);
  assert.equal(ui.methods[packed[1]].method_id,source.method_id_b);
  const mask=(evidence.same_primary_source_id?1:0)|(evidence.same_exact_source_locator?2:0)|(evidence.same_family?4:0)|
   (evidence.same_dimension_set?8:0)|(evidence.same_taxonomy_signature?16:0)|(evidence.same_classifier_question?32:0);
  assert.equal(packed[2],mask,source.pair_key);
  assert.deepEqual(packed.slice(3).map(value=>ui.status_values[value]),Object.values(source.assessment),source.pair_key);
  assert.deepEqual(expandMethodSelfScanUiPair(ui,packed),source,source.pair_key);
 }
 const hostile=structuredClone(scan);
 hostile.methods[0].method_name='</script><img src=x onerror=alert(1)> & \u2028';
 const hostileHtml=renderMethodSelfScanUi(hostile);
 assert.doesNotMatch(hostileHtml,/<img src=x/iu);
 const hostileEmbedded=hostileHtml.match(/<div id="data" hidden>([^]*?)<\/div>/u);
 const hostileUi=JSON.parse(Buffer.from(hostileEmbedded[1],'base64').toString('utf8'));
 assert.equal(hostileUi.methods[0].method_name,hostile.methods[0].method_name);
 const repeated=join(temp,'repeat product');
 const repeat=call([exporter,'--output-dir',repeated,'--prior-scan',join(output,'scan.json')]);
 assert.equal(repeat.status,0,repeat.stderr);
 assert.equal(JSON.parse(repeat.stdout).status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 const unsafe=join(temp,'unsafe capabilities.json'),unsafeOutput=join(temp,'unsafe product');
 writeFileSync(unsafe,JSON.stringify({access_token:'TOP-SECRET-FIXTURE'}));
 const denied=call([exporter,'--output-dir',unsafeOutput,'--capabilities-file',unsafe]);
 assert.equal(denied.status,1);
 assert.match(denied.stderr,/CAPABILITIES_SCHEMA_MISMATCH/);
 assert.equal(existsSync(unsafeOutput),false);
});
