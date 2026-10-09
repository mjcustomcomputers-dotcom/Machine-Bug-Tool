// Local-only SQLite/D1 compatible Method Atlas builder and read-only query CLI.
// node scripts/method-atlas-cli.mjs init|status|query '{"dimensions":["MONEY"],...}'
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {routeMethodAtlas} from '../lib/method-atlas-router.mjs';
import {detectMethodAtoms} from '../lib/atomic-method-detector.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema=readFileSync(resolve(ROOT,'method-atlas/schema.sql'),'utf8');
const baseCatalog=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/candidates.json'),'utf8'));
const extension=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/expansion-2026-v2.json'),'utf8'));
const catalog={...baseCatalog,sources:[...baseCatalog.sources,...extension.sources],methods:[...baseCatalog.methods,...extension.methods]};
const methodRelations=JSON.parse(readFileSync(resolve(ROOT,'method-atlas/method-relations.json'),'utf8'));
const DB_PATH=process.env.MPC_METHOD_ATLAS_DB??resolve(ROOT,'.sites-runtime/method-atlas.sqlite');
const parentByDimension={
 MONEY:'BL29',STATE:'BL12',TIME:'BL03',REPLAY:'BL15',RNG:'BL23',FINALITY:'BL13',
 GRAPH:'BL21',INFORMATION:'BL18',AUTHORITY:'BL08',FLOW:'BL27',INTERFACE:'BL17',
 IDENTITY:'BL10',VERSION:'BL19',QUEUE:'BL28',FAULT:'BL25',ENTITLEMENT:'BL31',
 GAME:'BL32',VERIFICATION:'BL23',INVARIANT:'BL21',COMPARISON:'BL22',
 RESOURCE:'BL31',UNIT:'BL29',UNCERTAINTY:'BL32',ANOMALY:'BL32',REDUCTION:'BL22',
 OPTIMIZATION:'BL22',NETWORK:'BL21',TOPOLOGY:'BL21',CRYPTO:'BL19',
 QUANTUM:'BL24',QUANTUM_INSPIRED:'BL22'
};
const run=(db,sql,values)=>db.prepare(sql).run(...values);
export function loadMethodAtlas(db){
 db.exec(schema);
 // Canonical MPC tables are never opened or altered. All writes are atlas_-prefixed.
 db.exec('BEGIN TRANSACTION');
 try{
  for(const s of catalog.sources){
   run(db,'INSERT OR IGNORE INTO atlas_sources (source_id,title,native_url,source_class,review_state,checked_on) VALUES (?,?,?,?,?,?)',
      [s.source_id,s.title,s.native_url,s.source_class,s.review_state,s.checked_on]);
  }
  for(const m of catalog.methods){
   run(db,'INSERT OR IGNORE INTO atlas_methods (method_id,method_name,family,mechanism,required_input,falsifier,implementation_state,quantum_requirement,primary_source_id,provenance_state) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [m.method_id,m.method_name,m.family,m.mechanism,m.required_input,m.falsifier,m.implementation_state,m.quantum_requirement,m.primary_source_id,m.provenance_state]);
   for(const [index,dimension] of m.dimensions.entries()){
    run(db,'INSERT OR IGNORE INTO atlas_triggers (method_id,dimension,trigger_strength) VALUES (?,?,?)',
       [m.method_id,dimension,index===0?5:3]);
   }
   run(db,'INSERT OR IGNORE INTO atlas_classifiers (classifier_id,method_id,question,missing_evidence,falsifier,classifier_state) VALUES (?,?,?,?,?,?)',
      [m.classifier.classifier_id,m.method_id,m.classifier.question,m.classifier.missing_evidence,m.classifier.falsifier,m.classifier.classifier_state]);
   for(const dimension of m.dimensions){
    const parent=parentByDimension[dimension];if(!parent)continue;
    run(db,'INSERT OR IGNORE INTO atlas_crosswalk (method_id,parent_namespace,parent_native_id,link_status,basis) VALUES (?,?,?,?,?)',
      [m.method_id,'BL',parent,'PROPOSED_STRUCTURAL_LINK','Candidate dimension '+dimension+'; no canonical adoption or semantic equivalence']);
   }
  }
  for(const relation of methodRelations.relationships){
    run(db,'INSERT OR IGNORE INTO atlas_method_relations (method_id,related_method_id,relation_type,rationale,evidence_independent,link_status) VALUES (?,?,?,?,?,?)',
      [relation.method_id,relation.related_method_id,relation.relation_type,relation.rationale,0,relation.link_status]);
  }
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 return statusMethodAtlas(db);
}
export function statusMethodAtlas(db){
 const count=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
 const methods=count('atlas_methods'),classifiers=count('atlas_classifiers'),sources=count('atlas_sources'),triggers=count('atlas_triggers'),crosswalk=count('atlas_crosswalk');
 const methodRelationsCount=count('atlas_method_relations');
 const mismatch=methods!==catalog.methods.length||classifiers!==methods||sources!==catalog.sources.length||methodRelationsCount!==methodRelations.relationships.length;
 return {schema_version:catalog.atlas_version,methods,classifiers,sources,triggers,proposed_crosswalk:crosswalk,method_relations:methodRelationsCount,source_record_authoritative:false,method_execution_performed:false,canonical_registry_modified:false,validation:mismatch?'INVENTORY_MISMATCH':'STRUCTURAL_INVENTORY_PASS'};
}
export function dbAdapter(db){
 return {prepare(sql){return {bind(...values){return {all(){return {results:db.prepare(sql).all(...values)}}}}}}};
}
const calledAsMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsMain){
 const command=process.argv[2]??'status';
 if(!['init','status','query','detect'].includes(command))throw Error('USAGE_INIT_STATUS_QUERY_DETECT');
 mkdirSync(dirname(DB_PATH),{recursive:true});
 const db=new DatabaseSync(DB_PATH);
 try{
  const stats=loadMethodAtlas(db);
  if(command==='query'||command==='detect'){
   if(!process.argv[3])throw Error('QUERY_JSON_REQUIRED');
   const query=JSON.parse(process.argv[3]);
   const result=command==='detect'?await detectMethodAtoms(dbAdapter(db),query):await routeMethodAtlas(dbAdapter(db),query);
   process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else process.stdout.write(JSON.stringify({...stats,sqlite_path:DB_PATH},null,2)+'\n');
 }finally{db.close()}
}
