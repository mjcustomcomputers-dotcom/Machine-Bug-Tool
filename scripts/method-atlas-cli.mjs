// Local-only SQLite/D1 compatible Method Atlas builder and read-only query CLI.
// node scripts/method-atlas-cli.mjs init|status|query '{"dimensions":["MONEY"],...}'
// Every JSON-taking command also accepts: <command> --input-file <path>
// File input: regular file, <= 4 MiB, UTF-8 with optional BOM; never shell code.
// Arg/file/encoding/JSON-object checks precede opening the derived cache.
// Command-specific domain validation remains in the existing command handlers.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {buildExpectedAtlasRows,verifyAtlasSeedParity} from '../lib/atlas-seed-parity.mjs';
import {planNoahsArkReasoning} from '../lib/noahs-ark-reasoning.mjs';
import {readFileSync,mkdirSync,lstatSync,openSync,fstatSync,readSync,closeSync,constants} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {routeMethodAtlas} from '../lib/method-atlas-router.mjs';
import {detectMethodAtoms} from '../lib/atomic-method-detector.mjs';
import {traceMethodHooks} from '../lib/method-hook-cascade.mjs';
import {diagnoseMethod} from '../lib/method-diagnostic.mjs';
import {compileAtlasTaxonomy,queryMethodTaxonomy} from '../lib/method-reclassification.mjs';
import {planAtomicVariations,atomicVariationIdentityFields} from '../lib/atomic-variation-router.mjs';
import {inspectAtlasSQLite,traceInverseMethodEdges} from '../lib/sqlite-method-strategy.mjs';
import {reviewNativeMirrors,auditNativeDimensionClaims} from '../lib/native-mirror-dimension-audit.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema=readFileSync(resolve(ROOT,'method-atlas/schema.sql'),'utf8');
const baseCatalog=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/candidates.json'),'utf8'));
const extension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-2026-v2.json'),'utf8'));
const evidenceExtension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-evidence-intent-v3.json'),'utf8'));
const schoolExtension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-computation-schools-v4.json'),'utf8'));
const assuranceExtension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-nasa-chip-cloud-v5.json'),'utf8'));
const abnormalExtension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-abnormal-meta-v6.json'),'utf8'));
const opticalExtension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-optical-v8.json'),'utf8'));
const catalog={...baseCatalog,sources:[...baseCatalog.sources,...extension.sources,...evidenceExtension.sources,...schoolExtension.sources,...assuranceExtension.sources,...abnormalExtension.sources,...opticalExtension.sources],methods:[...baseCatalog.methods,...extension.methods,...evidenceExtension.methods,...schoolExtension.methods,...assuranceExtension.methods,...abnormalExtension.methods,...opticalExtension.methods]};
const methodRelations=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/method-relations.json'),'utf8'));
const compiledTaxonomy=compileAtlasTaxonomy(catalog.methods,catalog.sources);
const taxonomyPolicyText=readFileSync(resolve(ROOT,'method-atlas/reclassification-policy-v7.json'),'utf8');
const taxonomyCompilerText=readFileSync(resolve(ROOT,'lib/method-reclassification.mjs'),'utf8');
const DB_PATH=process.env.MPC_METHOD_ATLAS_DB??resolve(ROOT,'.sites-runtime/method-atlas.sqlite');
const parentByDimension={
 MONEY:'BL29',STATE:'BL12',TIME:'BL03',REPLAY:'BL15',RNG:'BL23',FINALITY:'BL13',
 GRAPH:'BL21',INFORMATION:'BL18',AUTHORITY:'BL08',FLOW:'BL27',INTERFACE:'BL17',
 IDENTITY:'BL10',VERSION:'BL19',QUEUE:'BL28',FAULT:'BL25',ENTITLEMENT:'BL31',
 GAME:'BL32',VERIFICATION:'BL23',INVARIANT:'BL21',COMPARISON:'BL22',
 RESOURCE:'BL31',UNIT:'BL29',UNCERTAINTY:'BL32',ANOMALY:'BL32',REDUCTION:'BL22',
 OPTIMIZATION:'BL22',NETWORK:'BL21',TOPOLOGY:'BL21',CRYPTO:'BL19',CHIP:'BL19',LOCK:'BL09',CLOUD:'BL19',OBSERVABILITY:'BL06',ADMIN:'BL08',CONNECTOR:'BL17',DIAGNOSTIC:'BL32',BOUNTY:'BL23',PRIVACY:'BL18',INTENT:'BL32',GOAL:'BL32',DECEPTION:'BL32',FORENSIC:'BL23',PROCESS:'BL12',RELATION:'BL21',SYNTHESIS:'BL22',CONTROL:'BL01',CONSISTENCY:'BL21',RESOURCE:'BL27',
 QUANTUM:'BL24',QUANTUM_INSPIRED:'BL22'
};
const columns={
 atlas_metadata:['key','value'],
 atlas_sources:['source_id','title','native_url','source_class','review_state','checked_on'],
 atlas_methods:['method_id','method_name','family','mechanism','required_input','falsifier','implementation_state','quantum_requirement','primary_source_id','provenance_state'],
 atlas_triggers:['method_id','dimension','trigger_strength'],
 atlas_classifiers:['classifier_id','method_id','question','missing_evidence','falsifier','classifier_state'],
 atlas_crosswalk:['method_id','parent_namespace','parent_native_id','link_status','basis'],
 atlas_method_relations:['method_id','related_method_id','relation_type','rationale','evidence_independent','link_status'],
 atlas_method_taxonomy:['method_id','axis','class_key','classification_basis','review_state']
};
const digest=value=>createHash('sha256').update(value).digest('hex');
const schemaRows=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE tbl_name GLOB 'atlas_*' ORDER BY type,name").all().map(r=>[r.type,r.name,r.tbl_name,r.sql]);
const rowsFor=(db,table)=>db.prepare('SELECT '+columns[table].join(',')+' FROM '+table).all().map(row=>columns[table].map(key=>row[key]));
const rowFingerprint=rows=>digest(JSON.stringify(Object.keys(columns).map(table=>[table,rows[table].map(row=>JSON.stringify(row)).sort()])));

// Derive the reference projection once per process, outside the detector hot path.
// Ledger rows are append-only review history, not catalog seed rows: validate
// their table/index schema here but never hash, overwrite or reseed their data.
// SQL's former INSERT OR IGNORE crosswalk behavior is represented explicitly by
// retaining the first dimension for a repeated proposed parent.
const expectedRows=Object.fromEntries(Object.keys(columns).map(table=>[table,[]]));
let schemaFingerprint;
const reference=new DatabaseSync(':memory:');
try{
 reference.exec(schema);
 schemaFingerprint=digest(JSON.stringify(schemaRows(reference)));
 expectedRows.atlas_metadata=rowsFor(reference,'atlas_metadata');
}finally{reference.close()}
expectedRows.atlas_sources=catalog.sources.map(source=>columns.atlas_sources.map(key=>source[key]));
for(const method of catalog.methods){
 expectedRows.atlas_methods.push(columns.atlas_methods.map(key=>method[key]));
 expectedRows.atlas_classifiers.push(columns.atlas_classifiers.map(key=>key==='method_id'?method.method_id:method.classifier[key]));
 const parents=new Set();
 for(const [index,dimension] of method.dimensions.entries()){
  expectedRows.atlas_triggers.push([method.method_id,dimension,index===0?5:3]);
  const parent=parentByDimension[dimension];
  if(parent&&!parents.has(parent)){
   parents.add(parent);
   expectedRows.atlas_crosswalk.push([method.method_id,'BL',parent,'PROPOSED_STRUCTURAL_LINK','Candidate dimension '+dimension+'; no canonical adoption or semantic equivalence']);
  }
 }
}
expectedRows.atlas_method_relations=methodRelations.relationships.map(relation=>columns.atlas_method_relations.map(key=>key==='evidence_independent'?0:relation[key]));
expectedRows.atlas_method_taxonomy=compiledTaxonomy.tags.map(tag=>columns.atlas_method_taxonomy.map(key=>tag[key]));
const taxonomyPolicyFingerprint=digest(taxonomyPolicyText),taxonomyCompilerFingerprint=digest(taxonomyCompilerText);
const seedFingerprint=digest(JSON.stringify({
 schema_sha256:digest(schema),schema_fingerprint:schemaFingerprint,
 taxonomy_policy_sha256:taxonomyPolicyFingerprint,taxonomy_compiler_sha256:taxonomyCompilerFingerprint,
 source_records:digest(JSON.stringify([baseCatalog,extension,evidenceExtension,schoolExtension,assuranceExtension,abnormalExtension,opticalExtension,methodRelations])),
 materialized_projection:rowFingerprint(expectedRows)
}));
expectedRows.atlas_metadata.push(['seed_fingerprint',seedFingerprint]);
const contentFingerprint=rowFingerprint(expectedRows);
const expectedAtlasRows=buildExpectedAtlasRows({catalog,methodRelations,compiledTaxonomy,parentByDimension});
export const verifyCurrentAtlas=db=>verifyAtlasSeedParity(db,expectedAtlasRows,{seedFingerprint});
// Admission records a verified connection state, not later external mutations.
const admittedAtlasConnections=new WeakSet();

export function statusMethodAtlas(db){
 admittedAtlasConnections.delete(db);
 const actualSchema=schemaRows(db);
 if(!actualSchema.length)throw Error('ATLAS_NOT_INITIALIZED');
 if(!actualSchema.some(row=>row[0]==='table'&&row[1]==='atlas_metadata'))throw Error('UNPINNED_LEGACY_ATLAS_REBUILD_PRIVATE_CACHE_REQUIRED');
 if(digest(JSON.stringify(actualSchema))!==schemaFingerprint)throw Error('ATLAS_SCHEMA_DRIFT_EXPORT_HISTORY_AND_USE_NEW_PRIVATE_CACHE_REQUIRED');
 const stored=db.prepare("SELECT value FROM atlas_metadata WHERE key='seed_fingerprint'").get();
 if(!stored)throw Error('UNPINNED_LEGACY_ATLAS_REBUILD_PRIVATE_CACHE_REQUIRED');
 if(stored.value!==seedFingerprint)throw Error('ATLAS_SEED_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED');
 const actualRows=Object.fromEntries(Object.keys(columns).map(table=>[table,rowsFor(db,table)]));
 if(rowFingerprint(actualRows)!==contentFingerprint)throw Error('ATLAS_CACHE_CONTENT_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED');
 const parity=verifyCurrentAtlas(db);
 if(parity.status!=='ATLAS_CONTENT_PARITY_PASS')throw Error('ATLAS_CACHE_CONTENT_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED');
 admittedAtlasConnections.add(db);
 return {
  schema_version:catalog.atlas_version,
  seed_fingerprint:stored.value,schema_fingerprint:schemaFingerprint,content_fingerprint:contentFingerprint,
  taxonomy_policy_sha256:taxonomyPolicyFingerprint,taxonomy_compiler_sha256:taxonomyCompilerFingerprint,
  methods:actualRows.atlas_methods.length,classifiers:actualRows.atlas_classifiers.length,sources:actualRows.atlas_sources.length,
  triggers:actualRows.atlas_triggers.length,proposed_crosswalk:actualRows.atlas_crosswalk.length,method_relations:actualRows.atlas_method_relations.length,
  taxonomy_tags:actualRows.atlas_method_taxonomy.length,taxonomy_version:compiledTaxonomy.taxonomy_version,
  semantic_parity:{status:parity.status,mismatched_tables:parity.mismatched_tables,rows_checked:parity.rows_checked,tables_checked:parity.tables_checked},
  source_record_authoritative:false,method_execution_performed:false,canonical_registry_modified:false,validation:'STRUCTURAL_INVENTORY_PASS'
 };
}

export function loadMethodAtlas(db){
 admittedAtlasConnections.delete(db);
 // Existing caches are inspected before any schema or seed write. A stale or
 // modified derived cache must be replaced at a new path, never partially healed.
 if(schemaRows(db).length){
  const verified=statusMethodAtlas(db);
  db.exec('PRAGMA foreign_keys=ON');
  return verified;
 }
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('BEGIN TRANSACTION');
 try{
  db.exec(schema);
  for(const table of Object.keys(columns)){
   const insert=db.prepare('INSERT INTO '+table+' ('+columns[table].join(',')+') VALUES ('+columns[table].map(()=>'?').join(',')+')');
   const rows=table==='atlas_metadata'?expectedRows.atlas_metadata.filter(row=>row[0]==='seed_fingerprint'):expectedRows[table];
   for(const row of rows)insert.run(...row);
  }
  const verified=statusMethodAtlas(db);
  db.exec('COMMIT');
  return verified;
 }catch(error){admittedAtlasConnections.delete(db);db.exec('ROLLBACK');throw error}
}
export function dbAdapter(db){
 // This is an admission check for a trusted local connection, not a lock or
 // per-query/cross-connection authenticity guarantee. Keep the cache unchanged
 // while using the adapter; reopen through loadMethodAtlas after source changes.
 statusMethodAtlas(db);
 return {prepare(sql){return {bind(...values){return {all(){return {results:db.prepare(sql).all(...values)}}}}}}};
}
// Use an atlas connection already admitted by loadMethodAtlas. Validate the
// entire supplied request before touching history, then read and append within
// one transaction. Historical contexts are never scanned or overwritten.
export function runAtomicVariationReview(db,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('VARIATION_INPUT_REQUIRED');
 if(Object.keys(input).some(k=>!['atoms','variations','cross_reference'].includes(k)))throw Error('UNKNOWN_VARIATION_INPUT');
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw Error('DATABASE_ADAPTER_REQUIRED');
 const planInput={...input,methods:catalog.methods,taxonomy:compiledTaxonomy.tags};
 const initial=planAtomicVariations(planInput);
 if(!admittedAtlasConnections.has(db))throw Error('ATLAS_CONNECTION_NOT_ADMITTED');
 db.exec('BEGIN IMMEDIATE');
 try{
  const lookup=db.prepare('SELECT * FROM atlas_variation_ledger WHERE '+atomicVariationIdentityFields.map(field=>field+'=?').join(' AND '));
  const prior=[];
  for(const row of initial.ledger_rows){
   const found=lookup.get(...atomicVariationIdentityFields.map(field=>row[field]));
   if(found)prior.push(found);
  }
  const result=prior.length?planAtomicVariations({...planInput,prior}):initial;
  let inserted=0;
  if(result.ledger_rows.length){
   const fields=[...atomicVariationIdentityFields,'decision'];
   const put=db.prepare('INSERT INTO atlas_variation_ledger ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')');
   for(const row of result.ledger_rows){
    const changed=put.run(...fields.map(field=>row[field])).changes;
    if(changed!==1&&changed!==1n)throw Error('VARIATION_LEDGER_INSERT_CONFLICT');
    inserted++;
   }
  }
  const stored_record_count=db.prepare('SELECT COUNT(*) AS n FROM atlas_variation_ledger').get().n;
  db.exec('COMMIT');
  const {ledger_rows,...receipt}=result;
  return {...receipt,ledger_new_or_changed:inserted,ledger_saved_to_derived_local_cache:true,stored_record_count};
 }catch(error){
  try{db.exec('ROLLBACK')}catch{}
  throw error;
 }
}
// The CLI owns the versioned catalog. A caller may supply the atom/readiness,
// never substitute a smaller method list or erase declared challenger links.
export function runNoahsArkReasoning(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('REASONING_INPUT_REQUIRED');
 if(Object.keys(input).some(k=>!['atom','method_receipts','max_selected','max_pairs'].includes(k)))throw Error('UNKNOWN_REASONING_INPUT');
 return planNoahsArkReasoning({...input,methods:catalog.methods,relations:methodRelations.relationships});
}
const INPUT_FILE_MAX_BYTES=4*1024*1024;
const JSON_COMMANDS=new Set(['query','detect','cascade','diagnose','classify','variation','sql-audit','reverse-links','mirrors','dimension-audit','reason']);
function readInputFile(path){
 const listed=lstatSync(path);
 if(!listed.isFile())throw Error('INPUT_FILE_REGULAR_FILE_REQUIRED');
 if(listed.size>INPUT_FILE_MAX_BYTES)throw Error('INPUT_FILE_TOO_LARGE_MAX_4194304_BYTES');
 // Check the opened descriptor as well, and bound the read even if the file
 // changes after stat. O_NONBLOCK prevents a replaced FIFO from hanging open.
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NONBLOCK??0)|(constants.O_NOFOLLOW??0));
 let bytes;
 try{
  const before=fstatSync(fd);
  if(!before.isFile())throw Error('INPUT_FILE_REGULAR_FILE_REQUIRED');
  if(before.dev!==listed.dev||before.ino!==listed.ino)throw Error('INPUT_FILE_CHANGED_DURING_READ');
  if(before.size>INPUT_FILE_MAX_BYTES)throw Error('INPUT_FILE_TOO_LARGE_MAX_4194304_BYTES');
  const buffer=Buffer.alloc(INPUT_FILE_MAX_BYTES+1);
  let length=0;
  while(length<buffer.length){
   const count=readSync(fd,buffer,length,buffer.length-length,null);
   if(count===0)break;
   length+=count;
  }
  if(length>INPUT_FILE_MAX_BYTES)throw Error('INPUT_FILE_TOO_LARGE_MAX_4194304_BYTES');
  const after=fstatSync(fd);
  if(length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error('INPUT_FILE_CHANGED_DURING_READ');
  bytes=buffer.subarray(0,length);
 }finally{closeSync(fd)}
 // Windows PowerShell's UTF-16 output is not UTF-8 JSON. Reject it rather
 // than replacing undecodable bytes or silently changing source values.
 if(bytes.includes(0)||(bytes[0]===0xff&&bytes[1]===0xfe)||(bytes[0]===0xfe&&bytes[1]===0xff))throw Error('INPUT_FILE_UTF8_REQUIRED');
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{throw Error('INPUT_FILE_UTF8_REQUIRED')}
}
function cliInput(command,args){
 if(!JSON_COMMANDS.has(command)){
  if(args.length)throw Error('UNEXPECTED_CLI_ARGUMENTS');
  return undefined;
 }
 if(!args.length)throw Error('QUERY_JSON_REQUIRED');
 let text;
 if(args[0]==='--input-file'){
  if(args.length!==2||!args[1]||args[1].startsWith('--'))throw Error('USAGE_INPUT_FILE_REQUIRES_ONE_PATH');
  text=readInputFile(args[1]);
 }else{
  if(args[0].startsWith('--'))throw Error('UNKNOWN_CLI_OPTION');
  if(args.length!==1)throw Error('UNEXPECTED_CLI_ARGUMENTS');
  text=args[0];
 }
 let input;
 try{input=JSON.parse(text)}catch{throw Error('INVALID_INPUT_JSON')}
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('QUERY_JSON_OBJECT_REQUIRED');
 return input;
}
const calledAsMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsMain){
 const command=process.argv[2]??'status';
 if(!['init','status','audit-seed',...JSON_COMMANDS].includes(command))throw Error('USAGE_INIT_STATUS_QUERY_DETECT_CASCADE_DIAGNOSE_CLASSIFY_VARIATION');
 const query=cliInput(command,process.argv.slice(3));
 mkdirSync(dirname(DB_PATH),{recursive:true});
 const db=command==='audit-seed'?new DatabaseSync(DB_PATH,{readOnly:true}):new DatabaseSync(DB_PATH);
 try{
  if(command==='audit-seed'){
   process.stdout.write(JSON.stringify(verifyCurrentAtlas(db),null,2)+'\n');
  }else{
  const stats=loadMethodAtlas(db);
  if(JSON_COMMANDS.has(command)){
   let result;
   if(command==='variation'){
     result=runAtomicVariationReview(db,query);
   }else result=command==='sql-audit'?inspectAtlasSQLite(db,query):
     command==='reverse-links'?traceInverseMethodEdges(db,query):
     command==='mirrors'?reviewNativeMirrors(query):
     command==='dimension-audit'?auditNativeDimensionClaims(query):
     command==='reason'?runNoahsArkReasoning(query):
     command==='detect'?await detectMethodAtoms(dbAdapter(db),query):command==='cascade'?await traceMethodHooks(dbAdapter(db),query):command==='diagnose'?diagnoseMethod(query):command==='classify'?await queryMethodTaxonomy(dbAdapter(db),query):await routeMethodAtlas(dbAdapter(db),query);
   process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else process.stdout.write(JSON.stringify({...stats,sqlite_path:DB_PATH},null,2)+'\n');
  }
 }finally{db.close()}
}
