import test from 'node:test';
import assert from 'node:assert/strict';
import first from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import v8 from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
import relations from '../method-atlas/method-relations.json' with {type:'json'};
const methods=[first,v2,v3,v4,v5,v6,v8].flatMap(x=>x.methods);
const IDs=new Set(methods.map(x=>x.method_id));
test('Every one of 212 cross-method links resolves to the exact four-digit native MHA ID',()=>{
 assert.equal(methods.length,239);
 assert.equal(relations.relationships.length,212);
 const edgeIDs=new Set();
 for(const e of relations.relationships){
  assert.match(e.method_id,/^MHA-\d{4}$/);
  assert.match(e.related_method_id,/^MHA-\d{4}$/);
  assert.ok(IDs.has(e.method_id),'unknown source '+e.method_id);
  assert.ok(IDs.has(e.related_method_id),'unknown target '+e.related_method_id);
  assert.equal(e.evidence_independent,false);
  assert.ok(['CHALLENGE','CROSS_CHECK','COMPLEMENT'].includes(e.relation_type));
  const key=[e.method_id,e.related_method_id,e.relation_type].join('|');
  assert.ok(!edgeIDs.has(key),'duplicate '+key);
  edgeIDs.add(key);
 }
});
test('Optical cross-reference ID namespaces were repaired without changing methods',()=>{
 const optical=relations.relationships.filter(x=>Number(x.method_id.split('-')[1])>=232);
 assert.equal(optical.length,8);
 assert.ok(optical.every(x=>/^MHA-02(3[2-9])$/.test(x.method_id)));
 assert.ok(optical.every(x=>IDs.has(x.related_method_id)));
});
