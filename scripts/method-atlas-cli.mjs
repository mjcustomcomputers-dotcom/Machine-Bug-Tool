// Local-only SQLite/D1 compatible Method Atlas builder and read-only query CLI.
// node scripts/method-atlas-cli.mjs init|status|query '{"dimensions":["MONEY"],...}'
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {buildExpectedAtlasRows,verifyAtlasSeedParity} from '../lib/atlas-seed-parity.mjs';
import {planNoahsArkReasoning} from '../lib/noahs-ark-reasoning.mjs';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {routeMethodAtlas} from '../lib/method-atlas-router.mjs';
import {detectMethodAtoms} from '../lib/atomic-method-detector.mjs';
import {traceMethodHooks} from '../lib/method-hook-cascade.mjs';
import {diagnoseMethod} from '../lib/method-diagnostic.mjs';
import {compileAtlasTaxonomy,queryMethodTaxonomy} from '../lib/method-reclassification.mjs';
import {planAtomicVariations} from '../lib/atomic-variation-router.mjs';
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
const seedFingerprint=createHash('sha256').update(JSON.stringify({
 sources:catalog.sources,methods:catalog.methods,methodRelations:methodRelations.relationships,taxonomy:compiledTaxonomy.tags
})).digest('hex');
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
const run=(db,sql,values)=>db.prepare(sql).run(...values);
const expectedAtlasRows=buildExpectedAtlasRows({catalog,methodRelations,compiledTaxonomy,parentByDimension});
export const verifyCurrentAtlas=db=>verifyAtlasSeedParity(db,expectedAtlasRows,{seedFingerprint});
export function loadMethodAtlas(db){
 db.exec(schema);
 const stored=db.prepare("SELECT value FROM atlas_metadata WHERE key='seed_fingerprint'").get();
 if(stored && stored.value!==seedFingerprint)throw Error('ATLAS_SEED_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED');
 if(!stored && db.prepare('SELECT COUNT(*) AS n FROM atlas_methods').get().n!==0)
  throw Error('UNPINNED_LEGACY_ATLAS_REBUILD_PRIVATE_CACHE_REQUIRED');
 // Check populated derived caches BEFORE any attempted INSERT OR IGNORE.
 // A matching stored digest is merely metadata; it does not prove rows match.
 if(stored && verifyCurrentAtlas(db).status!=='ATLAS_CONTENT_PARITY_PASS')
  throw Error('ATLAS_SEMANTIC_DRIFT_REBUILD_PRIVATE_CACHE_REQUIRED');
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
  for(const row of compiledTaxonomy.tags){
   run(db,'INSERT OR IGNORE INTO atlas_method_taxonomy (method_id,axis,class_key,classification_basis,review_state) VALUES (?,?,?,?,?)',
     [row.method_id,row.axis,row.class_key,row.classification_basis,row.review_state]);
  }
  run(db,"INSERT OR IGNORE INTO atlas_metadata (key,value) VALUES ('seed_fingerprint',?)",[seedFingerprint]);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 const status=statusMethodAtlas(db);
 if(status.validation!=='STRUCTURAL_INVENTORY_PASS')throw Error('ATLAS_SEED_PARITY_FAILED_AFTER_IMPORT');
 return status;
}
export function statusMethodAtlas(db){
 const count=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
 const methods=count('atlas_methods'),classifiers=count('atlas_classifiers'),sources=count('atlas_sources'),triggers=count('atlas_triggers'),crosswalk=count('atlas_crosswalk');
 const methodRelationsCount=count('atlas_method_relations');
 const taxonomyCount=count('atlas_method_taxonomy');
 const parity=verifyCurrentAtlas(db);
 const mismatch=methods!==catalog.methods.length||classifiers!==methods||sources!==catalog.sources.length||methodRelationsCount!==methodRelations.relationships.length||taxonomyCount!==compiledTaxonomy.tag_count||parity.status!=='ATLAS_CONTENT_PARITY_PASS';
 return {schema_version:catalog.atlas_version,seed_fingerprint:seedFingerprint,methods,classifiers,sources,triggers,proposed_crosswalk:crosswalk,method_relations:methodRelationsCount,taxonomy_tags:taxonomyCount,taxonomy_version:compiledTaxonomy.taxonomy_version,semantic_parity:{status:parity.status,mismatched_tables:parity.mismatched_tables,rows_checked:parity.rows_checked,tables_checked:parity.tables_checked},source_record_authoritative:false,method_execution_performed:false,canonical_registry_modified:false,validation:mismatch?'INVENTORY_MISMATCH':'STRUCTURAL_INVENTORY_PASS'};
}
export function dbAdapter(db){
 return {prepare(sql){return {bind(...values){return {all(){return {results:db.prepare(sql).all(...values)}}}}}}};
}
const calledAsMain=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(calledAsMain){
 const command=process.argv[2]??'status';
 if(!['init','status','query','detect','cascade','diagnose','classify','variation','sql-audit','reverse-links','mirrors','dimension-audit','audit-seed','reason'].includes(command))throw Error('USAGE_INIT_STATUS_QUERY_DETECT_CASCADE_DIAGNOSE_CLASSIFY_VARIATION');
 mkdirSync(dirname(DB_PATH),{recursive:true});
 const db=command==='audit-seed'?new DatabaseSync(DB_PATH,{readOnly:true}):new DatabaseSync(DB_PATH);
 try{
  if(command==='audit-seed'){
   process.stdout.write(JSON.stringify(verifyCurrentAtlas(db),null,2)+'\n');
  }else{
  const stats=loadMethodAtlas(db);
  if(['query','detect','cascade','diagnose','classify','variation','sql-audit','reverse-links','mirrors','dimension-audit','reason'].includes(command)){
   if(!process.argv[3])throw Error('QUERY_JSON_REQUIRED');
   const query=JSON.parse(process.argv[3]);
   let result;
   if(command==='variation'){
     const prior=[];
     // Only bounded exact subject/atom records; no broad external source discovery.
     for(const atom of query.atoms??[]){
       if(typeof atom.subject_id!=='string'||typeof atom.id!=='string')continue;
       prior.push(...db.prepare('SELECT * FROM atlas_variation_ledger WHERE subject_id=? AND atom_id=?').all(atom.subject_id,atom.id));
     }
     result=planAtomicVariations({methods:catalog.methods,taxonomy:compiledTaxonomy.tags,atoms:query.atoms,variations:query.variations??[],prior,cross_reference:query.cross_reference??null});
     if(result.ledger_rows.length){
       db.exec('BEGIN TRANSACTION');
       try {
         const put=db.prepare(`INSERT OR IGNORE INTO atlas_variation_ledger
           (subject_id,atom_id,variant_id,variation_kind,method_id,direction,boundary,evidence_digest,variant_digest,source_signature,dimension_signature,decision)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
         for(const row of result.ledger_rows)put.run(row.subject_id,row.atom_id,row.variant_id,row.variation_kind,row.method_id,row.direction,row.boundary,row.evidence_digest,row.variant_digest,row.source_signature,row.dimension_signature,row.decision);
         db.exec('COMMIT');
       }catch(error){db.exec('ROLLBACK');throw error}
     }
     result={...result,ledger_rows:undefined,ledger_saved_to_derived_local_cache:true,stored_record_count:db.prepare('SELECT COUNT(*) AS n FROM atlas_variation_ledger').get().n};
   }else result=command==='sql-audit'?inspectAtlasSQLite(db,query):
     command==='reverse-links'?traceInverseMethodEdges(db,query):
     command==='mirrors'?reviewNativeMirrors(query):
     command==='dimension-audit'?auditNativeDimensionClaims(query):
     command==='reason'?planNoahsArkReasoning({methods:catalog.methods,relations:methodRelations.relationships,...query}):
     command==='detect'?await detectMethodAtoms(dbAdapter(db),query):command==='cascade'?await traceMethodHooks(dbAdapter(db),query):command==='diagnose'?diagnoseMethod(query):command==='classify'?await queryMethodTaxonomy(dbAdapter(db),query):await routeMethodAtlas(dbAdapter(db),query);
   process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else process.stdout.write(JSON.stringify({...stats,sqlite_path:DB_PATH},null,2)+'\n');
  }
 }finally{db.close()}
}
