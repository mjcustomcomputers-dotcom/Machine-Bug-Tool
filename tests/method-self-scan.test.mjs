import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas} from '../scripts/method-atlas-cli.mjs';
import {methodCapsules} from '../lib/method-ark.mjs';
import {scanMethodsAgainstMethods} from '../lib/method-self-scan.mjs';

const columns={
 methods:'method_id,method_name,family,mechanism,required_input,falsifier,implementation_state,quantum_requirement,primary_source_id,provenance_state',
 sources:'source_id,title,native_url,source_class,review_state,checked_on',triggers:'method_id,dimension,trigger_strength',
 classifiers:'classifier_id,method_id,question,missing_evidence,falsifier,classifier_state',
 crosswalks:'method_id,parent_namespace,parent_native_id,link_status,basis',
 relations:'method_id,related_method_id,relation_type,rationale,evidence_independent,link_status',
 taxonomy:'method_id,axis,class_key,classification_basis,review_state'
};
const tables={methods:'atlas_methods',sources:'atlas_sources',triggers:'atlas_triggers',classifiers:'atlas_classifiers',crosswalks:'atlas_crosswalk',relations:'atlas_method_relations',taxonomy:'atlas_method_taxonomy'};
function productionSnapshot(){
 const db=new DatabaseSync(':memory:');
 try{
  loadMethodAtlas(db);
  return {implemented_capsules:methodCapsules(),...Object.fromEntries(Object.keys(tables).map(key=>[key,db.prepare(`SELECT ${columns[key]} FROM ${tables[key]}`).all()]))};
 }finally{db.close()}
}
const snapshot=productionSnapshot();
const baseline=scanMethodsAgainstMethods(snapshot);

test('full registered self scan accounts for every evaluator, candidate, diagonal and unordered pair',()=>{
 assert.equal(baseline.status,'STATIC_METHOD_SELF_SCAN_COMPLETE_WITH_OPEN_GAPS');
 assert.deepEqual(baseline.inventory,{
  implemented_evaluators:24,research_methods:239,classifiers:239,sources:65,triggers:478,crosswalks:444,taxonomy_tags:2597,
  directed_relations:212,unordered_declared_pairs:211,diagonal_identity_controls:239,unordered_cross_method_pairs:28441,
  total_matrix_rows:28680,matrix_rows_emitted:28680,matrix_rows_suppressed:0
 });
 assert.deepEqual(baseline.pair_scan.aggregates,{
  same_primary_source_id:704,same_exact_source_locator:816,same_locator_different_source_id:112,same_family:742,
  shared_dimension:3225,shared_trigger_profile:2105,shared_crosswalk_parent:7408,same_dimension_set:69,same_taxonomy_signature:12,
  same_classifier_question:0,declared_relation:211,no_core_static_link:24698,no_registered_metadata_overlap:20598
 });
 assert.equal(baseline.fingerprints.scan_sha256,'532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b');
 assert.equal(baseline.fingerprints.catalog_sha256,'2df642c901c23b2118faa74079e755158dabbb43e3e6d889d2cce2004f147753');
 assert.equal(baseline.fingerprints.pair_stream_sha256,'1c8897de9debc86e77b9802c89038cbcda42d08ec02949948dea07864940822d');
 assert.equal(baseline.pair_scan.rows.length,239*240/2);
 assert.equal(new Set(baseline.pair_scan.rows.map(row=>row.pair_key)).size,baseline.pair_scan.rows.length);
 assert.equal(baseline.pair_scan.suppressed_rows,0);
 assert.equal(baseline.canonical_promotion,false);
 assert.equal(baseline.method_execution_performed,false);
 assert.equal(baseline.independent_evidence_proven,false);
 assert.equal(baseline.equivalence_proven,false);
});

test('incoming-only nodes, reciprocal declarations, cycles and duplicate locators remain visible',()=>{
 const degree=baseline.relation_graph.degree.find(row=>row.method_id==='MHA-0035');
 assert.deepEqual(degree,{method_id:'MHA-0035',incoming:12,outgoing:0,total:12});
 assert.deepEqual(baseline.relation_graph.nontrivial_directed_cycles,[
  ['MHA-0087','MHA-0092','MHA-0115'],['MHA-0119','MHA-0138']
 ]);
 assert.equal(baseline.relation_graph.undirected_component_count,33);
 assert.equal(baseline.relation_graph.isolated_methods.length,15);
 assert.equal(baseline.relation_graph.maximum_shortest_directed_path,8);
 assert.equal(baseline.relation_graph.zero_incoming_count,145);
 assert.equal(baseline.relation_graph.zero_outgoing_count,42);
 assert.equal(baseline.relation_graph.same_source_id_edge_count,24);
 assert.equal(baseline.relation_graph.same_exact_source_locator_edge_count,31);
 assert.equal(baseline.relation_graph.degree.reduce((sum,row)=>sum+row.incoming+row.outgoing,0),2*baseline.inventory.directed_relations);
 assert.equal(new Set(baseline.relation_graph.strongly_connected_components.flat()).size,239);
 const reciprocal=baseline.relation_graph.reciprocal_pairs.find(row=>row.method_id_a==='MHA-0119'&&row.method_id_b==='MHA-0138');
 assert.deepEqual(reciprocal.a_to_b.map(row=>row.relation_type),['COMPLEMENT']);
 assert.deepEqual(reciprocal.b_to_a.map(row=>row.relation_type),['CROSS_CHECK']);
 assert.deepEqual(baseline.integrity.duplicate_source_locators,[{
  native_url:'https://www.nasa.gov/reference/system-engineering-handbook-appendix/',source_ids:['NASA_SE','V5_NASA_SE']
 }]);
 assert.deepEqual(baseline.integrity.duplicate_review_candidates.selected_stored_contract_fields,[]);
});

test('taxonomy identity and distinct source IDs never become equivalence or independence claims',()=>{
 const taxonomyTwin=baseline.pair_scan.rows.find(row=>row.pair_key==='MHA-0015|MHA-0016');
 assert.equal(taxonomyTwin.evidence_vector.same_taxonomy_signature,true);
 assert.equal(taxonomyTwin.evidence_vector.exact_stored_field_matches.includes('mechanism'),false);
 assert.equal(taxonomyTwin.assessment.equivalence_status,'NOT_ESTABLISHED');
 assert.equal(taxonomyTwin.assessment.independence_status,'NOT_ESTABLISHED');
 const aliased=baseline.pair_scan.rows.find(row=>row.method_id_a!==row.method_id_b&&row.evidence_vector.same_exact_source_locator&&
  !row.evidence_vector.same_primary_source_id);
 assert.ok(aliased);
 assert.equal(aliased.assessment.source_lineage_status,'STATIC_SOURCE_LOCATOR_OVERLAP');
 assert.equal(aliased.assessment.independence_status,'NOT_ESTABLISHED');
 const crosswalkOnly=baseline.pair_scan.rows.find(row=>row.pair_key==='MHA-0001|MHA-0004');
 assert.ok(crosswalkOnly.evidence_vector.shared_crosswalk_parents.length>0);
 assert.equal(crosswalkOnly.assessment.metadata_overlap_status,'REGISTERED_METADATA_OVERLAP_OBSERVED');
 const diagonal=baseline.pair_scan.rows.find(row=>row.pair_key==='MHA-0195|MHA-0195');
 assert.equal(diagonal.comparison_kind,'IDENTITY_CONTROL_ONLY');
 assert.equal(diagonal.assessment.corroboration,'NOT_CORROBORATION');
});

test('input order is immaterial and the prior fingerprint stops zero-static-delta loops',()=>{
 const reversed=Object.fromEntries(Object.entries(snapshot).map(([key,value])=>[key,[...value].reverse()]));
 const reordered=scanMethodsAgainstMethods(reversed);
 assert.equal(reordered.fingerprints.scan_sha256,baseline.fingerprints.scan_sha256);
 assert.equal(reordered.fingerprints.pair_stream_sha256,baseline.fingerprints.pair_stream_sha256);
 const stopped=scanMethodsAgainstMethods(snapshot,{prior_fingerprint:baseline.fingerprints.scan_sha256});
 assert.equal(stopped.status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 assert.equal(stopped.fingerprints.scan_delta,'ZERO_STATIC_SCAN_DELTA');
});

test('a stored method change changes the catalog fingerprint without becoming evidence',()=>{
 const changed=structuredClone(snapshot);
 changed.methods[0].mechanism+=' [metamorphic fixture]';
 const result=scanMethodsAgainstMethods(changed,{prior_fingerprint:baseline.fingerprints.scan_sha256});
 assert.equal(result.status,'STATIC_METHOD_SELF_SCAN_COMPLETE_WITH_OPEN_GAPS');
 assert.equal(result.fingerprints.scan_delta,'CHANGED_STATIC_SCAN_INPUT_OR_DERIVATION');
 assert.notEqual(result.fingerprints.scan_sha256,baseline.fingerprints.scan_sha256);
 assert.equal(result.method_execution_performed,false);
 assert.equal(result.source_authentication,false);
});

test('classifier drift blocks the self contract and malformed repeat identities fail closed',()=>{
 const changed=structuredClone(snapshot);changed.methods[0].required_input+=' [mismatch fixture]';
 const result=scanMethodsAgainstMethods(changed);
 assert.equal(result.status,'BLOCKED_STATIC_SELF_CONTRACT_MISMATCH');
 assert.ok(result.self_contracts[0].mismatches.includes('REQUIRED_INPUT_MISSING_EVIDENCE'));
 assert.throws(()=>scanMethodsAgainstMethods(snapshot,{prior_fingerprint:'bad'}),/INVALID_PRIOR_SELF_SCAN_FINGERPRINT/);
});

test('malformed catalogs fail before pair claims are emitted',()=>{
 const cases=[
  [value=>value.methods.push({...value.methods[0]}),/DUPLICATE_METHOD_ID/],
  [value=>{value.methods[0].primary_source_id='missing'},/UNRESOLVED_METHOD_SOURCE/],
  [value=>value.relations.push({...value.relations[0]}),/DUPLICATE_RELATIONS_ROW/],
  [value=>value.relations.push({...value.relations[0],method_id:'MHA-0001',related_method_id:'MHA-0001'}),/SELF_RELATION_REJECTED/],
  [value=>value.relations.push({...value.relations[0],method_id:'MHA-9999'}),/UNRESOLVED_RELATION_ENDPOINT/],
  [value=>{value.methods=[...value.methods,...value.methods,...value.methods]},/METHODS_OVER_CAP/],
  [value=>{value.triggers=Object.assign(Array(2),{1:value.triggers[0]})},/TRIGGERS_ARRAY_REQUIRED/],
  [value=>{delete value.implemented_capsules[0].input_schema.properties[value.implemented_capsules[0].required_inputs[0]]},/IMPLEMENTED_REQUIRED_SCHEMA_PROPERTY_MISSING/],
  [value=>{value.implemented_capsules[0].method_id='unregistered_fixture'},/IMPLEMENTED_REGISTRY_ID_MISMATCH/]
 ];
 for(const [mutate,expected] of cases){const value=structuredClone(snapshot);mutate(value);assert.throws(()=>scanMethodsAgainstMethods(value),expected)}
});
