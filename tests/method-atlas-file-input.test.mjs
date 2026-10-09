import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../scripts/method-atlas-cli.mjs',import.meta.url));
const maxFileBytes=4*1024*1024;
function workspace(t){
 const dir=mkdtempSync(join(tmpdir(),'mpc input Ω '));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return dir;
}
function call(dir,args,db=join(dir,'atlas.sqlite')){
 return spawnSync(process.execPath,[cli,...args],{
  cwd:dir,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,
  env:{...process.env,MPC_METHOD_ATLAS_DB:db}
 });
}
function value(result){
 assert.equal(result.status,0,result.stderr);
 assert.equal(result.error,undefined);
 return JSON.parse(result.stdout);
}
function rejection(result,pattern){
 assert.equal(result.status,1,result.stderr);
 assert.equal(result.error,undefined);
 assert.equal(result.stdout,'');
 assert.match(result.stderr,pattern);
}

test('file JSON preserves quotes, Windows backslashes, Unicode and shell metacharacters as data',t=>{
 const dir=workspace(t);
 const marker=join(dir,'must-not-exist');
 // Keep the payload within its domain's 200-character limit independently of
 // Windows TEMP/user-profile path length. The child cwd still binds the marker.
 const owner='Owner "quoted" C:\\Cases\\Ω; & | `echo` $(New-Item "must-not-exist") < > 漢字 😀';
 assert.ok(owner.length<=200);
 const payload={reported_branch_count:32,reported_dimension_count:356,registry_owner:owner};
 const name='request Ω & $ value.json';
 const path=join(dir,name),bytes=Buffer.from(JSON.stringify(payload));
 writeFileSync(path,bytes);
 const inline=value(call(dir,['dimension-audit',JSON.stringify(payload)]));
 const fromFile=value(call(dir,['dimension-audit','--input-file',name]));
 assert.deepEqual(fromFile,inline);
 assert.equal(fromFile.claim.registry_owner,owner);
 assert.equal(fromFile.claim.accepted_as_canonical,false);
 assert.equal(fromFile.source_authentication,false);
 assert.equal(existsSync(marker),false);
 assert.deepEqual(readFileSync(path),bytes);
});

const cases={
 query:{dimensions:['GRAPH'],source_refs:['fixture:native'],subject_ids:['fixture:subject']},
 detect:{atoms:[{id:'fixture:atom',subject_id:'fixture:subject',coordinate:'PROCESS',epistemic_state:'SYNTHETIC',source_refs:['fixture:native'],depends_on:[]}]},
 cascade:{root_method_ids:['MHA-0053']},
 diagnose:{method_id:'MHA-0053',implementation_state:'RESEARCH_HOOK',required_inputs:[],provided_inputs:[],source_refs:[],oracle_state:'NOT_SUPPLIED',negative_control_state:'NOT_RUN'},
 classify:{method_ids:['MHA-0053']},
 variation:{atoms:[{id:'fixture:atom',subject_id:'fixture:subject',dimensions:['MONEY','FINALITY'],source_refs:['fixture:native'],external_source_refs:['fixture:external'],evidence_digest:'a'.repeat(64)}]},
 'sql-audit':{},
 'reverse-links':{root_method_id:'MHA-0053'},
 mirrors:{atoms:[{atom_id:'fixture:atom',native_subject_id:'fixture:subject',source_refs:['fixture:native'],evidence_digest:'a'.repeat(64)}]},
 'dimension-audit':{},
 reason:{atom:{subject_id:'fixture:subject',atom_id:'fixture:atom',dimensions:['MONEY','FINALITY'],source_refs:['fixture:native'],external_source_refs:[]},method_receipts:[{method_id:'MHA-0053',input_state:'AVAILABLE',negative_control_state:'AVAILABLE',falsifier_state:'AVAILABLE',estimated_cost_units:2}]}
};
// The full self-scan has a dedicated export/manifest test because its complete
// matrix is intentionally tens of MiB rather than a compact CLI response.
test('every compact JSON command accepts UTF-8 BOM file input with the same result as inline JSON',async t=>{
 const dir=workspace(t);
 for(const [command,payload] of Object.entries(cases))await t.test(command,()=>{
  const path=join(dir,command+' request 漢字.json');
  const json=JSON.stringify(payload);
  writeFileSync(path,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(json)]));
  const file=value(call(dir,[command,'--input-file',path],join(dir,command+'-file.sqlite')));
  const inline=value(call(dir,[command,json],join(dir,command+'-inline.sqlite')));
  assert.deepEqual(file,inline);
 });
});

test('invalid argument, file, encoding and JSON-object input leaves new and existing caches untouched',async t=>{
 const dir=workspace(t),valid=join(dir,'valid.json'),bad=join(dir,'bad.json'),large=join(dir,'large.json');
 writeFileSync(valid,'{}');
 writeFileSync(bad,'{"dimensions":');
 writeFileSync(large,' '.repeat(maxFileBytes+1));
 const utf16le=join(dir,'utf16-le.json'),utf16be=join(dir,'utf16-be.json'),utf16NoBom=join(dir,'utf16-no-bom.json'),invalidUtf8=join(dir,'invalid-utf8.json');
 writeFileSync(utf16le,Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('{}','utf16le')]));
 writeFileSync(utf16be,Buffer.from([0xfe,0xff,0,0x7b,0,0x7d]));
 writeFileSync(utf16NoBom,Buffer.from('{}','utf16le'));
 writeFileSync(invalidUtf8,Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x28,0x22,0x7d]));
 const nonObject=join(dir,'array.json'),empty=join(dir,'empty.json');
 writeFileSync(nonObject,'[]');writeFileSync(empty,'');
 const existing=join(dir,'existing','atlas.sqlite');
 value(call(dir,['init'],existing));
 const link=join(dir,'linked input');
 // A junction needs no Windows symbolic-link privilege; POSIX uses a regular
 // file symlink. Both must fail the actual regular-file admission gate.
 symlinkSync(process.platform==='win32'?join(dir,'existing'):valid,link,process.platform==='win32'?'junction':'file');
 const before=readFileSync(existing),existingEntries=readdirSync(join(dir,'existing'));
 const rejects=[
  {name:'missing JSON',args:['query'],error:/QUERY_JSON_REQUIRED/},
  {name:'unknown flag',args:['query','--bogus',valid],error:/UNKNOWN_CLI_OPTION/},
  {name:'missing file value',args:['query','--input-file'],error:/USAGE_INPUT_FILE_REQUIRES_ONE_PATH/},
  {name:'empty file value',args:['query','--input-file',''],error:/USAGE_INPUT_FILE_REQUIRES_ONE_PATH/},
  {name:'flag instead of path',args:['query','--input-file','--bogus'],error:/USAGE_INPUT_FILE_REQUIRES_ONE_PATH/},
  {name:'unsupported equals flag',args:['query','--input-file='+valid],error:/UNKNOWN_CLI_OPTION/},
  {name:'mixed inline and file',args:['query','{}','--input-file',valid],error:/UNEXPECTED_CLI_ARGUMENTS/},
  {name:'extra file argument',args:['query','--input-file',valid,'{}'],error:/USAGE_INPUT_FILE_REQUIRES_ONE_PATH/},
  {name:'unexpected status input',args:['status','--input-file',valid],error:/UNEXPECTED_CLI_ARGUMENTS/},
  {name:'unexpected init input',args:['init','{}'],error:/UNEXPECTED_CLI_ARGUMENTS/},
  {name:'unknown command',args:['bogus','--input-file',valid],error:/USAGE_INIT_STATUS/},
  {name:'missing file',args:['query','--input-file',join(dir,'not found.json')],error:/ENOENT/},
  {name:'directory input',args:['query','--input-file',dir],error:/INPUT_FILE_REGULAR_FILE_REQUIRED/},
  {name:'symlink or junction input',args:['query','--input-file',link],error:/INPUT_FILE_REGULAR_FILE_REQUIRED/},
  {name:'oversize file',args:['query','--input-file',large],error:/INPUT_FILE_TOO_LARGE_MAX_4194304_BYTES/},
  {name:'UTF-16 little endian',args:['query','--input-file',utf16le],error:/INPUT_FILE_UTF8_REQUIRED/},
  {name:'UTF-16 big endian',args:['query','--input-file',utf16be],error:/INPUT_FILE_UTF8_REQUIRED/},
  {name:'UTF-16 without BOM',args:['query','--input-file',utf16NoBom],error:/INPUT_FILE_UTF8_REQUIRED/},
  {name:'invalid UTF-8',args:['query','--input-file',invalidUtf8],error:/INPUT_FILE_UTF8_REQUIRED/},
  {name:'malformed JSON file',args:['query','--input-file',bad],error:/INVALID_INPUT_JSON/},
  {name:'malformed inline JSON',args:['query','{"dimensions":'],error:/INVALID_INPUT_JSON/},
  {name:'non-object JSON file',args:['query','--input-file',nonObject],error:/QUERY_JSON_OBJECT_REQUIRED/},
  {name:'null inline JSON',args:['query','null'],error:/QUERY_JSON_OBJECT_REQUIRED/},
  {name:'empty file',args:['query','--input-file',empty],error:/INVALID_INPUT_JSON/}
 ];
 for(const [index,entry] of rejects.entries())await t.test(entry.name,()=>{
  const freshParent=join(dir,'must-not-create-'+index),freshDb=join(freshParent,'atlas.sqlite');
  rejection(call(dir,entry.args,freshDb),entry.error);
  assert.equal(existsSync(freshParent),false,'invalid transport input must not create a cache directory');
  rejection(call(dir,entry.args,existing),entry.error);
  assert.deepEqual(readFileSync(existing),before,'invalid transport input must not change existing database bytes');
  assert.deepEqual(readdirSync(join(dir,'existing')),existingEntries,'no journal or sidecar may be created');
 });
});

test('the file byte bound is inclusive and counts UTF-8 bytes rather than characters',t=>{
 const dir=workspace(t),exact=join(dir,'exact limit.json'),over=join(dir,'multi-byte over.json');
 const json=JSON.stringify({registry_owner:'Ω'});
 const jsonBytes=Buffer.byteLength(json,'utf8');
 writeFileSync(exact,Buffer.concat([Buffer.from(json),Buffer.alloc(maxFileBytes-jsonBytes,0x20)]));
 assert.equal(readFileSync(exact).length,maxFileBytes);
 const result=value(call(dir,['dimension-audit','--input-file',exact]));
 assert.equal(result.claim.registry_owner,'Ω');
 // JavaScript string length is below the limit, but UTF-8 byte size exceeds it.
 const tooLarge=JSON.stringify({registry_owner:'Ω'.repeat(maxFileBytes/2)});
 assert.ok(tooLarge.length<maxFileBytes);
 assert.ok(Buffer.byteLength(tooLarge,'utf8')>maxFileBytes);
 writeFileSync(over,tooLarge);
 const newParent=join(dir,'do-not-create');
 rejection(call(dir,['dimension-audit','--input-file',over],join(newParent,'atlas.sqlite')),/INPUT_FILE_TOO_LARGE_MAX_4194304_BYTES/);
 assert.equal(existsSync(newParent),false);
});

test('file transport retains existing command-specific domain rejection',t=>{
 const dir=workspace(t),path=join(dir,'invalid typed query.json');
 const query={dimensions:['GRAPH'],source_refs:['fixture:native'],subject_ids:['fixture:subject'],unknown:true};
 writeFileSync(path,JSON.stringify(query));
 rejection(call(dir,['query','--input-file',path]),/UNKNOWN_ROUTER_FIELD/);
 rejection(call(dir,['query',JSON.stringify(query)]),/UNKNOWN_ROUTER_FIELD/);
 // Domain validation belongs to the existing handlers. Only the transport,
 // JSON syntax and top-level object gate promise rejection before DB opening.
});
