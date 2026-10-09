import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,dbAdapter,statusMethodAtlas} from '../scripts/method-atlas-cli.mjs';
import {detectMethodAtoms} from '../lib/atomic-method-detector.mjs';
const atom=(id,dimension,depends_on=[],extra={})=>({
 id,subject_id:'fixture:transaction-001',dimension,source_refs:['fixture:ledger-001'],
 epistemic_state:'OBSERVED',depends_on,...extra
});
const fresh=()=>{const db=new DatabaseSync(':memory:');loadMethodAtlas(db);return {db,adapter:dbAdapter(db)};};
test('Method cross references are seeded with exact typed source-linked candidates',()=>{
 const {db}=fresh();
 try{
  const stat=statusMethodAtlas(db);
  assert.equal(stat.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(stat.method_relations,36);
  assert.equal(db.prepare("SELECT count(*) AS n FROM atlas_method_relations WHERE evidence_independent!=0").get().n,0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM atlas_method_relations WHERE link_status!='PROPOSED_METHOD_COMPARISON'").get().n,0);
 }finally{db.close()}
});
test('Bitset signature and candidate selection are atom permutation invariant',async()=>{
 const {db,adapter}=fresh();try{
  const atoms=[atom('credit','MONEY'),atom('close','STATE',['credit']),atom('receipt','FINALITY',['close'])];
  const a=await detectMethodAtoms(adapter,{atoms,domain_profile:'BUSINESS'});
  const b=await detectMethodAtoms(adapter,{atoms:[atoms[2],atoms[0],atoms[1]],domain_profile:'BUSINESS'});
  assert.equal(a.status,'DETECTED_STRUCTURAL_METHOD_CANDIDATES');
  assert.equal(a.dimension_bitset_hex,b.dimension_bitset_hex);
  assert.deepEqual(a.method_route.selected_methods.map(x=>x.method_id),b.method_route.selected_methods.map(x=>x.method_id));
  assert.deepEqual(a.atom_graph.traversal_order,['credit','close','receipt']);
  assert.equal(a.atom_graph.edge_count,2);
  assert.equal(a.automatic_execution,false);
  assert.equal(a.verification_by_other_methods_performed,false);
 }finally{db.close()}
});
test('Detector proposes distinct second-method challenges without claiming independent evidence',async()=>{
 const {db,adapter}=fresh();try{
  const result=await detectMethodAtoms(adapter,{atoms:[atom('credit','MONEY'),atom('state','STATE')] ,domain_profile:'GAMING',max_candidates:12});
  assert.ok(result.cross_method_review.length>0);
  assert.ok(result.cross_method_review.every(x=>x.link_status==='PROPOSED_METHOD_COMPARISON' && x.independent_evidence_proven===false));
  assert.ok(result.cross_method_review.every(x=>x.candidate_state==='PROPOSED_CROSS_METHOD_REVIEW_NOT_EXECUTED'));
  assert.ok(result.cross_method_review.every(x=>x.evidence_independent===0));
 }finally{db.close()}
});
test('Unknown or unbound atom blocks selection but retains structural frontier',async()=>{
 const {db,adapter}=fresh();try{
  const result=await detectMethodAtoms(adapter,{atoms:[atom('record','STATE',[],{source_refs:[],epistemic_state:'UNKNOWN'})]});
  assert.equal(result.status,'BLOCKED_STRUCTURAL_EVIDENCE_GATE');
  assert.equal(result.method_route.selected_count,0);
  assert.deepEqual(result.evidence_completeness.unknown_or_unbound_atom_ids,['record']);
  assert.ok(result.stop_condition.includes('Resolve'));
 }finally{db.close()}
});
test('Cycles and missing dependency edges fail closed',async()=>{
 const {db,adapter}=fresh();try{
  const cyc=await detectMethodAtoms(adapter,{atoms:[atom('a','MONEY',['b']),atom('b','STATE',['a'])]});
  assert.equal(cyc.status,'BLOCKED_STRUCTURAL_EVIDENCE_GATE');
  assert.equal(cyc.atom_graph.acyclic,false);
  assert.equal(cyc.method_route.selected_methods.length,0);
  await assert.rejects(()=>detectMethodAtoms(adapter,{atoms:[atom('a','STATE',['nonexistent'])]}),/UNRESOLVED_ATOM_DEPENDENCY/);
 }finally{db.close()}
});
test('Clock-domain mismatches remain unresolved; same-clock inverted event blocks',async()=>{
 const {db,adapter}=fresh();try{
  const a=atom('a','TIME',[],{observed_at:'2026-10-08T01:00:00Z',clock_domain:'server'});
  const b=atom('b','STATE',['a'],{observed_at:'2026-10-08T00:30:00Z',clock_domain:'server'});
  const inverted=await detectMethodAtoms(adapter,{atoms:[a,b]});
  assert.equal(inverted.status,'BLOCKED_STRUCTURAL_EVIDENCE_GATE');
  assert.deepEqual(inverted.atom_graph.temporal_precedence_conflicts,[['a','b']]);
  b.clock_domain='device';
  const mixed=await detectMethodAtoms(adapter,{atoms:[a,b]});
  assert.equal(mixed.atom_graph.temporal_precedence_conflicts.length,0);
  assert.deepEqual(mixed.atom_graph.unreconciled_clock_domain_edges,[['a','b']]);
  assert.equal(mixed.stages.at(-1).state,'NOT_EXECUTED_REQUIRES_NATIVE_CONTROL_AND_FALSIFIER');
 }finally{db.close()}
});
test('Typed detector refuses extra fields, duplicate atoms, huge batches and wrong time syntax',async()=>{
 const {db,adapter}=fresh();try{
  await assert.rejects(()=>detectMethodAtoms(adapter,{atoms:[atom('a','STATE'),atom('a','MONEY')]}),/DUPLICATE_ATOM_ID/);
  await assert.rejects(()=>detectMethodAtoms(adapter,{atoms:[{...atom('a','STATE'),arbitrary:'injection'}]}),/UNKNOWN_ATOM_FIELD/);
  await assert.rejects(()=>detectMethodAtoms(adapter,{atoms:[atom('a','STATE',[],{observed_at:'tomorrow',clock_domain:'utc'})]}),/INVALID_OBSERVED_TIMESTAMP/);
  await assert.rejects(()=>detectMethodAtoms(adapter,{atoms:Array.from({length:33},(_,i)=>atom('a'+i,'STATE'))}),/ATOM_BATCH_BOUNDS/);
  assert.equal(statusMethodAtlas(db).methods,74);
 }finally{db.close()}
});
test('Detector emits seven distinct stage receipts without inventing model execution',async()=>{
 const {db,adapter}=fresh();try{
  const result=await detectMethodAtoms(adapter,{atoms:[atom('a','GRAPH')]});
  assert.deepEqual(result.stages.map(x=>x.stage),['QUICK_SOLID_STATE','INDUCTION','REDUCTION','TRAVERSAL','TRANSFORMATION','SYNCHRONICITY','VERIFICATION']);
  assert.equal(result.stages[0].state,'STRUCTURAL_CHECK_COMPLETED');
  assert.equal(result.stages[4].state,'NOT_EXECUTED_REQUIRES_SUPPLIED_MODEL');
  assert.equal(result.target_traffic,false);
  assert.equal(result.canonical_promotion,false);
  assert.equal(result.independent_evidence_proven,false);
 }finally{db.close()}
});
