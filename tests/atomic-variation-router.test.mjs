import test from 'node:test';
import assert from 'node:assert/strict';
import {planAtomicVariations,atomicVariationContract,atomicVariationIdentityFields} from '../lib/atomic-variation-router.mjs';
import {compileAtlasTaxonomy} from '../lib/method-reclassification.mjs';
import a from '../method-atlas/candidates.json' with {type:'json'};
import b from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import c from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import d from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import e from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import f from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import g from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
const catalogs=[a,b,c,d,e,f,g],methods=catalogs.flatMap(x=>x.methods),sources=catalogs.flatMap(x=>x.sources);
const taxonomy=compileAtlasTaxonomy(methods,sources).tags;
const atom=(overrides={})=>({id:'a1',subject_id:'fixture:item',dimensions:['TIME','INTERFACE','DIAGNOSTIC'],source_refs:['fixture:internal'],external_source_refs:['fixture:outside'],evidence_digest:'a'.repeat(64),...overrides});
const run=(overrides={})=>planAtomicVariations({methods,taxonomy,atoms:[atom()],...overrides});
test('All 239 methods considered per atom in both directions and both boundaries',()=>{
 assert.equal(methods.length,239);
 const r=run();
 assert.equal(r.expected_slots,956);
 assert.equal(r.slots_considered,956);
 assert.equal(r.complete_consideration,true);
 assert.equal(r.ledger_rows.length,956);
 assert.deepEqual(r.directions,['FORWARD','BACKWARD']);
 assert.deepEqual(r.boundaries,['INTERNAL_MODEL','EXTERNAL_SOURCE']);
 assert.equal(r.actual_method_execution,false);
 assert.equal(r.external_network_actions,false);
 assert.equal(atomicVariationContract.physical_optics,false);
});
test('Repeat without material input delta uses prior exact ledger and never re-asks method',()=>{
 const first=run(),second=run({prior:first.ledger_rows});
 assert.equal(second.ledger_rows.length,0);
 assert.equal(second.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
 assert.equal(second.slots_considered,956);
});
test('Changed evidence digest reopens relevant consideration without declaring result proven',()=>{
 const first=run(),second=run({atoms:[atom({evidence_digest:'b'.repeat(64)})],prior:first.ledger_rows});
 assert.equal(second.ledger_rows.length,956);
 assert.equal(second.decision_counts.CACHED_NO_MATERIAL_DELTA??0,0);
 assert.equal(second.canonical_promotion,false);
});
test('Changed cross-reference source is allowed only for named method and changes that method cache',()=>{
 const first=run(),second=run({prior:first.ledger_rows,cross_reference:{method_ids:['MHA-0232'],source_refs:['fixture:new-corroborator'],reason:'Check optical link source independently'}});
 const uncached=second.ledger_rows;
 assert.equal(uncached.length,4);
 assert.ok(uncached.every(x=>x.method_id==='MHA-0232'));
 assert.ok(second.decision_counts.REOPEN_DECLARED_CROSS_REFERENCE>=1);
 const third=run({prior:[...first.ledger_rows,...second.ledger_rows],cross_reference:{method_ids:['MHA-0232'],source_refs:['fixture:new-corroborator'],reason:'Same words again'}});
 assert.equal(third.ledger_rows.length,0);
});
test('Every synthetic variation is considered but not treated as an executed transformation',()=>{
 const r=run({variations:[{id:'v1',atom_id:'a1',kind:'REMOVE',variant_digest:'c'.repeat(64)},{id:'v2',atom_id:'a1',kind:'INVERT_EDGE',variant_digest:'d'.repeat(64)}]});
 assert.equal(r.expected_slots,239*4*3);
 assert.equal(r.variations_total,2);
 assert.equal(r.variation_executed,false);
 const unchanged=run({variations:[{id:'v1',atom_id:'a1',kind:'MASK_CHANNEL',variant_digest:'a'.repeat(64)}]});
 assert.ok(unchanged.decision_counts.NO_MATERIAL_VARIATION>0);
});
test('Without external source binding, external lane is blocked not silently omitted',()=>{
 const r=run({atoms:[atom({external_source_refs:[]})]});
 assert.equal(r.slots_considered,956);
 assert.ok(r.decision_counts.EXTERNAL_SOURCE_UNBOUND>0);
 assert.equal(r.ledger_rows.filter(x=>x.boundary==='EXTERNAL_SOURCE').length,478);
});
test('Invalid evidence, missing method taxonomy and extra atoms reject',()=>{
 assert.throws(()=>run({atoms:[atom({evidence_digest:'bogus'})]}),/EVIDENCE_DIGEST_REQUIRED/);
 assert.throws(()=>run({taxonomy:[]}),/TAXONOMY_REQUIRED/);
 assert.throws(()=>run({atoms:[atom(),atom()]}),/DUPLICATE_ATOM_ID/);
 assert.throws(()=>run({atoms:[atom({dimensions:[]})]}),/EMPTY_ATOM_DIMENSIONS/);
});


test('Historical evidence and cross-reference contexts remain independently cacheable on reverse traversal',()=>{
 const first=run();
 const shifted=run({prior:first.ledger_rows,atoms:[atom({evidence_digest:'b'.repeat(64)})]});
 const returned=run({prior:[...first.ledger_rows,...shifted.ledger_rows]});
 assert.equal(returned.ledger_rows.length,0);
 const crossRef={method_ids:['MHA-0232'],source_refs:['fixture:extra'],reason:'New corroborating source'};
 const different=run({prior:[...first.ledger_rows,...shifted.ledger_rows],cross_reference:crossRef});
 const again=run({prior:[...first.ledger_rows,...shifted.ledger_rows,...different.ledger_rows]});
 assert.equal(different.ledger_rows.length,4);
 assert.equal(again.ledger_rows.length,0);
});

test('source roles and exact subject IDs have distinct cache identities even when IDs contain role prefixes',()=>{
 const firstAtom=atom({source_refs:['core','external:foo'],external_source_refs:['bar']});
 const nextAtom=atom({source_refs:['core','external:bar'],external_source_refs:['foo']});
 const first=run({atoms:[firstAtom]});
 const moved=run({atoms:[nextAtom],prior:first.ledger_rows});
 assert.equal(moved.ledger_rows.length,956);
 assert.equal(moved.decision_counts.CACHED_NO_MATERIAL_DELTA??0,0);
 assert.notEqual(first.ledger_rows[0].source_signature,moved.ledger_rows[0].source_signature);
 const history=[...first.ledger_rows,...moved.ledger_rows];
 assert.equal(run({atoms:[firstAtom],prior:history}).decision_counts.CACHED_NO_MATERIAL_DELTA,956);
 assert.equal(run({atoms:[{...firstAtom,subject_id:'fixture:Item'}],prior:history}).ledger_rows.length,956);
 const crossBase=atom({source_refs:['core','cross:fixture:extra']});
 const crossFirst=run({atoms:[crossBase]});
 const crossMoved=run({atoms:[atom({source_refs:['core']})],prior:crossFirst.ledger_rows,cross_reference:{method_ids:['MHA-0232'],source_refs:['fixture:extra'],reason:'A separate source role'}});
 assert.equal(crossMoved.ledger_rows.length,956);
 assert.ok(crossMoved.ledger_rows.some(row=>row.method_id==='MHA-0232'));
});

test('variation kind is retained in independent history when a label and digest are reused',()=>{
 const variant={id:'v1',atom_id:'a1',kind:'REMOVE',variant_digest:'b'.repeat(64)};
 const removed=run({variations:[variant]});
 const inverted=run({variations:[{...variant,kind:'INVERT_EDGE'}],prior:removed.ledger_rows});
 assert.equal(inverted.ledger_rows.length,956);
 assert.equal(inverted.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
 assert.ok(inverted.ledger_rows.every(row=>row.variation_kind==='INVERT_EDGE'));
 const rewind=run({variations:[variant],prior:[...removed.ledger_rows,...inverted.ledger_rows]});
 assert.equal(rewind.ledger_rows.length,0);
 assert.equal(rewind.decision_counts.CACHED_NO_MATERIAL_DELTA,1912);
 assert.ok(removed.ledger_rows.filter(row=>row.variant_id==='v1').every(row=>row.variation_kind==='REMOVE'));
});

test('native REVERSE method taxonomy supports the BACKWARD lane only',()=>{
 for(const id of ['MHA-0112','MHA-0116']){
  const method=methods.find(m=>m.method_id===id);
  const tags=taxonomy.filter(t=>t.method_id===id);
  assert.equal(tags.find(t=>t.axis==='DIRECTION').class_key,'REVERSE');
  const r=planAtomicVariations({methods:[method],taxonomy:tags,atoms:[atom({dimensions:method.dimensions})]});
  assert.ok(r.ledger_rows.filter(row=>row.direction==='FORWARD').every(row=>row.decision==='DIRECTION_UNSUPPORTED'));
  assert.ok(r.ledger_rows.filter(row=>row.direction==='BACKWARD').every(row=>row.decision==='TRIGGERED_INPUT_REVIEW_REQUIRED'));
  assert.equal(r.slots_considered,4);
 }
});

test('changed method definitions and taxonomy reopen only the changed method even if its decision is identical',()=>{
 const first=run(),id='MHA-0232';
 for(const field of ['required_input','falsifier','primary_source_id']){
  const changedMethods=methods.map(m=>m.method_id===id?{...m,[field]:m[field]+'-new-declared-state'}:m);
  const changed=run({methods:changedMethods,prior:first.ledger_rows});
  assert.equal(changed.ledger_rows.length,4);
  assert.ok(changed.ledger_rows.every(row=>row.method_id===id));
  assert.equal(changed.decision_counts.CACHED_NO_MATERIAL_DELTA,952);
  const previous=first.ledger_rows.find(row=>row.method_id===id);
  assert.notEqual(changed.ledger_rows[0].method_signature,previous.method_signature);
  assert.equal(changed.ledger_rows[0].decision,previous.decision);
  assert.equal(run({prior:[...first.ledger_rows,...changed.ledger_rows]}).ledger_rows.length,0);
 }
 const tag=taxonomy.find(t=>t.axis==='DIRECTION'&&t.class_key==='BIDIRECTIONAL');
 const changedTags=taxonomy.map(t=>t===tag?{...t,class_key:'COMPARATIVE'}:t);
 const changed=run({taxonomy:changedTags,prior:first.ledger_rows});
 assert.equal(changed.ledger_rows.length,4);
 assert.ok(changed.ledger_rows.every(row=>row.method_id===tag.method_id));
});

test('planning preserves frozen caller state and ignores source or taxonomy presentation order',()=>{
 const freeze=value=>{
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}
  return value;
 };
 const input={methods:structuredClone(methods),taxonomy:structuredClone(taxonomy),atoms:[atom({dimensions:['TIME','STATE'],source_refs:['fixture:z','fixture:a'],external_source_refs:['outside:z','outside:a']})],cross_reference:{method_ids:['MHA-0233','MHA-0232'],source_refs:['cross:z','cross:a'],reason:'Original reason'}};
 const snapshot=JSON.stringify(input);
 const first=planAtomicVariations(freeze(input));
 assert.equal(JSON.stringify(input),snapshot);
 const reordered=structuredClone(input);
 reordered.methods.reverse();reordered.taxonomy.reverse();
 reordered.atoms[0].dimensions.reverse();reordered.atoms[0].source_refs.reverse();reordered.atoms[0].external_source_refs.reverse();
 reordered.cross_reference.method_ids.reverse();reordered.cross_reference.source_refs.reverse();
 reordered.cross_reference.reason='Reworded reason without a source change';
 const again=planAtomicVariations(freeze({...reordered,prior:first.ledger_rows}));
 assert.equal(again.ledger_rows.length,0);
 assert.equal(again.decision_counts.CACHED_NO_MATERIAL_DELTA,956);
});

test('sparse and coerced source, variation, taxonomy and prior inputs reject within declared bounds',()=>{
 for(const field of ['source_refs','external_source_refs','dimensions']){
  assert.throws(()=>run({atoms:[atom({[field]:Array(1)})]}),/INVALID_/);
  assert.throws(()=>run({atoms:[atom({[field]:[7]})]}),/INVALID_/);
 }
 for(const value of [undefined,null,7,['a'.repeat(64)],{}]){
  assert.throws(()=>run({variations:[{id:'v',atom_id:'a1',kind:'REMOVE',variant_digest:value}]}),/INVALID_VARIATION/);
 }
 assert.throws(()=>run({variations:[{id:'v',atom_id:7,kind:'REMOVE',variant_digest:'b'.repeat(64)}]}),/INVALID_VARIATION_ATOM_ID/);
 assert.throws(()=>run({cross_reference:{method_ids:Array(1),source_refs:['source'],reason:'Invalid pointer'}}),/INVALID_CROSSREF_METHODS/);
 assert.throws(()=>run({methods:Array(1)}),/METHOD_INVENTORY_BOUNDS/);
 assert.throws(()=>run({taxonomy:Array(1)}),/TAXONOMY_REQUIRED/);
 assert.throws(()=>run({prior:Array(1)}),/PRIOR_RECEIPT_BOUNDS/);
 assert.throws(()=>run({atoms:Array.from({length:9},(_,i)=>atom({id:'a'+i}))}),/ATOM_BATCH_BOUNDS/);
 assert.throws(()=>run({variations:Array.from({length:5},(_,i)=>({id:'v'+i,atom_id:'a1',kind:'REMOVE',variant_digest:'b'.repeat(64)}))}),/VARIATION_BOUNDS/);
 assert.throws(()=>run({methods:Array(513).fill(methods[0])}),/METHOD_INVENTORY_BOUNDS/);
 const priorLimit=atomicVariationContract.max_atoms*(atomicVariationContract.max_variants_per_request+1)*atomicVariationContract.max_methods*4;
 assert.throws(()=>run({prior:Array(priorLimit+1).fill({})}),/PRIOR_RECEIPT_BOUNDS/);
 assert.throws(()=>run({methods:methods.map((m,i)=>i?m:{...m,required_input:'x'.repeat(32769)})}),/METHOD_STATE_BOUNDS/);
 const badTags=taxonomy.map(t=>t.axis==='DIRECTION'?{...t,class_key:'BACKWARD'}:t);
 assert.throws(()=>run({taxonomy:badTags}),/INVALID_METHOD_DIRECTION/);
});

test('the maximum atom and variation batch retains a complete unique four-slot matrix',()=>{
 const atoms=Array.from({length:8},(_,i)=>atom({id:'a'+i}));
 const variations=Array.from({length:4},(_,i)=>({id:'v'+i,atom_id:'a'+i,kind:'SUBSTITUTE',variant_digest:'b'.repeat(64)}));
 const r=run({atoms,variations});
 assert.equal(r.slots_considered,239*4*(8+4));
 assert.equal(r.ledger_rows.length,r.expected_slots);
 const identities=r.ledger_rows.map(row=>JSON.stringify(atomicVariationIdentityFields.map(field=>row[field])));
 assert.equal(new Set(identities).size,r.expected_slots);
 assert.equal(r.variation_executed,false);
 assert.equal(r.source_authentication,false);
});

test('conflicting or legacy prior identities cannot be silently rewritten or accepted',()=>{
 const first=run(),row=first.ledger_rows[0];
 const decision=row.decision==='DIMENSION_NOT_MATCHED'?'SOURCE_UNBOUND':'DIMENSION_NOT_MATCHED';
 const conflict={...row,decision};
 assert.throws(()=>run({prior:[...first.ledger_rows,conflict]}),/CONFLICTING_PRIOR_DECISION/);
 assert.throws(()=>run({prior:[conflict,...first.ledger_rows.slice(1)]}),/CONFLICTING_PRIOR_DECISION/);
 const legacy={...row,source_signature:'fixture:internal|external:fixture:outside'};
 delete legacy.method_signature;
 assert.throws(()=>run({prior:[legacy]}),/PRIOR_IDENTITY_VERSION_UNSUPPORTED/);
 assert.throws(()=>run({prior:[{...row,evidence_digest:['a'.repeat(64)]}]}),/INVALID_PRIOR_DIGEST/);
});

test('maximum-width dimension signatures remain cacheable on a repeated plan',()=>{
 const dimensions=Array.from({length:8},(_,i)=>String.fromCharCode(65+i).repeat(40));
 const input={methods:[{method_id:'MHA-0001',dimensions}],taxonomy:[{method_id:'MHA-0001',axis:'DIRECTION',class_key:'BIDIRECTIONAL'}],atoms:[atom({dimensions})]};
 const first=planAtomicVariations(input);
 assert.equal(first.ledger_rows[0].dimension_signature.length,327);
 const second=planAtomicVariations({...input,prior:first.ledger_rows});
 assert.equal(second.ledger_rows.length,0);
 assert.equal(second.decision_counts.CACHED_NO_MATERIAL_DELTA,4);
});
