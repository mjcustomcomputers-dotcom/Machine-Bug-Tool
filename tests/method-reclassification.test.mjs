import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loadMethodAtlas,dbAdapter,statusMethodAtlas} from '../scripts/method-atlas-cli.mjs';
import {routeMethodAtlas} from '../lib/method-atlas-router.mjs';
import {queryMethodTaxonomy,compileAtlasTaxonomy,taxonomyPurposeKeys} from '../lib/method-reclassification.mjs';
import first from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
const records=[first,v2,v3,v4,v5,v6];
const rawMethods=records.flatMap(x=>x.methods);
const rawSources=records.flatMap(x=>x.sources);
const fixture=()=>{const db=new DatabaseSync(':memory:');loadMethodAtlas(db);return {db,adapter:dbAdapter(db)};};

test('Every candidate has a typed taxonomy without ID replacement or method execution',()=>{
 const rawMethodsSnapshot=structuredClone(rawMethods);
 const a=compileAtlasTaxonomy(rawMethods,rawSources);
 assert.equal(a.method_count,231);
 assert.equal(a.tag_count,2511);
 assert.deepEqual(rawMethods,rawMethodsSnapshot);
 assert.equal(new Set(rawMethods.map(m=>m.method_id)).size,231);
 assert.deepEqual(new Set(a.tags.map(t=>t.method_id)),new Set(rawMethods.map(m=>m.method_id)));
 assert.ok(a.tags.every(x=>x.review_state==='PROPOSED' && x.method_id.startsWith('MHA-')));
 assert.equal(a.canonical_promotion,false);
 assert.equal(a.method_execution_performed,false);
});
test('SQLite persists typed classifications across all 231 methods and 9 axes',()=>{
 const {db}=fixture();
 try{
  const status=statusMethodAtlas(db);
  assert.equal(status.validation,'STRUCTURAL_INVENTORY_PASS');
  assert.equal(status.taxonomy_tags,2511);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT method_id) AS n FROM atlas_method_taxonomy").get().n,231);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT axis) AS n FROM atlas_method_taxonomy").get().n,9);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_method_taxonomy WHERE review_state!='PROPOSED'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM atlas_method_taxonomy WHERE method_id LIKE 'MAXVAR%'").get().n,0);
 }finally{db.close()}
});
test('Family discipline, function and workflow stage no longer depend on institution name matching',async()=>{
 const {db,adapter}=fixture();
 try{
  const r=await queryMethodTaxonomy(adapter,{method_ids:['MHA-0224','MHA-0192'],limit:24});
  assert.ok(r.tags.some(t=>t.method_id==='MHA-0224'&&t.axis==='PURPOSE'&&t.class_key==='ROUTE'));
  assert.ok(r.tags.some(t=>t.method_id==='MHA-0192'&&t.axis==='PURPOSE'&&t.class_key==='DIAGNOSE_METHOD'));
  assert.ok(r.tags.some(t=>t.method_id==='MHA-0224'&&t.axis==='WORKFLOW_STAGE'&&t.class_key==='METHOD_ROUTING'));
  assert.equal(r.source_authentication,false);
  assert.equal(r.no_method_executed,true);
 }finally{db.close()}
});
test('Indexed purpose filter selects applicable methods without fabricating execution',async()=>{
 const {db,adapter}=fixture();
 try{
  const args={dimensions:['GRAPH','DIAGNOSTIC'],purpose:'ROUTE',subject_ids:['fixture:case'],source_refs:['fixture:method-receipt'],max_candidates:12};
  const r=await routeMethodAtlas(adapter,args);
  assert.ok(r.selected_methods.some(m=>m.method_id==='MHA-0224'));
  const allowed=new Set(r.method_taxonomy.filter(t=>t.axis==='PURPOSE'&&t.class_key==='ROUTE').map(t=>t.method_id));
  assert.ok(r.selected_methods.every(m=>allowed.has(m.method_id)));
  assert.ok(r.deferred_methods.some(d=>d.reason==='PURPOSE_CLASS_MISMATCH'));
  assert.equal(r.no_method_executed,true);
  const blocked=await routeMethodAtlas(adapter,{...args,source_refs:[]});
  assert.equal(blocked.selected_methods.length,0);
  assert.equal(blocked.status,'BLOCKED_MISSING_TYPED_BINDINGS');
 }finally{db.close()}
});
test('Unknown taxonomy families, dimensions and filters fail closed',async()=>{
 const x=structuredClone(rawMethods);
 x[0].family='MADE_UP_FAMILY';
 assert.throws(()=>compileAtlasTaxonomy(x,rawSources),/UNCLASSIFIED_METHOD_FAMILY/);
 const y=structuredClone(rawMethods);
 y[0].dimensions=['MADE_UP_SIGNAL'];
 assert.throws(()=>compileAtlasTaxonomy(y,rawSources),/UNCLASSIFIED_TYPED_DIMENSION/);
 const {db,adapter}=fixture();
 try{
  await assert.rejects(()=>routeMethodAtlas(adapter,{dimensions:['GRAPH'],subject_ids:['fixture:case'],source_refs:['fixture:record'],purpose:'NOT_REAL'}),/UNKNOWN_ROUTING_PURPOSE/);
  await assert.rejects(()=>queryMethodTaxonomy(adapter,{axis:'BOGUS'}),/UNKNOWN_TAXONOMY_AXIS/);
  await assert.rejects(()=>queryMethodTaxonomy(adapter,{axis:'PURPOSE',class_key:'route;delete',limit:10}),/INVALID_TAXONOMY_CLASS_FILTER/);
  assert.ok(taxonomyPurposeKeys().includes('DIAGNOSE_METHOD'));
 }finally{db.close()}
});
