// Exact semantic integrity of the derived SQLite Method Atlas seed.
// Counts and a stored seed_fingerprint do NOT prove table contents still match
// immutable bundled JSON. This routine checks pinned per-row values and keys.
// It never authenticates the underlying real-world publication or target.
import {createHash} from 'node:crypto';

const SPEC=Object.freeze({
 atlas_sources:['source_id','title','native_url','source_class','review_state','checked_on'],
 atlas_methods:['method_id','method_name','family','mechanism','required_input','falsifier','implementation_state','quantum_requirement','primary_source_id','provenance_state'],
 atlas_triggers:['method_id','dimension','trigger_strength'],
 atlas_classifiers:['classifier_id','method_id','question','missing_evidence','falsifier','classifier_state'],
 atlas_crosswalk:['method_id','parent_namespace','parent_native_id','link_status','basis'],
 atlas_method_relations:['method_id','related_method_id','relation_type','rationale','evidence_independent','link_status'],
 atlas_method_taxonomy:['method_id','axis','class_key','classification_basis','review_state']
});
const PIN=/^[a-f0-9]{64}$/u;
const fail=s=>{throw Error(s)};
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const tuples=(rows,columns)=>rows.map(x=>columns.map(k=>x[k])).sort((a,b)=>{
 const left=JSON.stringify(a),right=JSON.stringify(b);
 return left<right?-1:left>right?1:0;
});
export function buildExpectedAtlasRows({catalog,methodRelations,compiledTaxonomy,parentByDimension}){
 if(!catalog||!Array.isArray(catalog.sources)||!Array.isArray(catalog.methods)||
 !Array.isArray(methodRelations?.relationships)||!Array.isArray(compiledTaxonomy?.tags)||
 !parentByDimension||typeof parentByDimension!=='object')fail('ATLAS_PARITY_INPUTS_REQUIRED');
 const rows=Object.fromEntries(Object.keys(SPEC).map(table=>[table,[]]));
 rows.atlas_sources=catalog.sources.map(x=>({...x}));
 for(const m of catalog.methods){
  rows.atlas_methods.push({...m});
  m.dimensions.forEach((dimension,i)=>{
   rows.atlas_triggers.push({method_id:m.method_id,dimension,trigger_strength:i===0?5:3});
  });
  rows.atlas_classifiers.push({method_id:m.method_id,...m.classifier});
  const used=new Set();
  for(const dimension of m.dimensions){
   const parent=parentByDimension[dimension];
   if(!parent||used.has(parent))continue;
   used.add(parent);
   rows.atlas_crosswalk.push({method_id:m.method_id,parent_namespace:'BL',parent_native_id:parent,
    link_status:'PROPOSED_STRUCTURAL_LINK',
    basis:'Candidate dimension '+dimension+'; no canonical adoption or semantic equivalence'});
  }
 }
 rows.atlas_method_relations=methodRelations.relationships.map(r=>({...r,evidence_independent:0}));
 rows.atlas_method_taxonomy=compiledTaxonomy.tags.map(x=>({...x}));
 return rows;
}

export function verifyAtlasSeedParity(db,expectedRows,{seedFingerprint}){
 if(!db||typeof db.prepare!=='function'||!expectedRows||!PIN.test(seedFingerprint))fail('ATLAS_PARITY_INPUTS_REQUIRED');
 const receipt=[];
 for(const [table,columns] of Object.entries(SPEC)){
  const expected=expectedRows[table];
  if(!Array.isArray(expected))fail('MISSING_EXPECTED_ATLAS_TABLE:'+table);
  const actual=db.prepare('SELECT '+columns.join(',')+' FROM '+table).all();
  const expectedValues=tuples(expected,columns),actualValues=tuples(actual,columns);
  const expectedHash=hash(expectedValues),actualHash=hash(actualValues);
  receipt.push({table,expected_count:expectedValues.length,actual_count:actualValues.length,
    matching:expectedValues.length===actualValues.length&&expectedHash===actualHash,
    expected_sha256:expectedHash,actual_sha256:actualHash});
 }
 const stored=db.prepare("SELECT value FROM atlas_metadata WHERE key='seed_fingerprint'").get();
 const seedMatches=stored?.value===seedFingerprint;
 const mismatched=receipt.filter(t=>!t.matching).map(t=>t.table);
 if(!seedMatches)mismatched.push('atlas_metadata.seed_fingerprint');
 return {version:'MPC_ATLAS_SEMANTIC_PARITY_V12',
  status:mismatched.length?'BLOCKED_ATLAS_SEMANTIC_DRIFT':'ATLAS_CONTENT_PARITY_PASS',
  mismatched_tables:mismatched,seed_fingerprint_matches:seedMatches,
  tables_checked:receipt.length,rows_checked:receipt.reduce((n,x)=>n+x.actual_count,0),
  tables:receipt,reference:'BUNDLED_REPO_SOURCE_NOT_EXTERNAL_AUTHENTICATION',
  repair_policy:'DO_NOT_OVERWRITE;REBUILD_FRESH_DERIVED_CACHE_AFTER_REVIEW',
  no_canonical_promotion:true,no_external_actions:true};
}
