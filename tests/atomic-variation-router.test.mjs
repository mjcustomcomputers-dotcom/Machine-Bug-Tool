import test from 'node:test';
import assert from 'node:assert/strict';
import {planAtomicVariations,atomicVariationContract} from '../lib/atomic-variation-router.mjs';
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
