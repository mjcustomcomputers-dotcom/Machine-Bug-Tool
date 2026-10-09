import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planNoahsArkReasoning} from '../lib/noahs-ark-reasoning.mjs';
import first from '../method-atlas/candidates.json' with {type:'json'};
import v2 from '../method-atlas/expansion-2026-v2.json' with {type:'json'};
import v3 from '../method-atlas/expansion-evidence-intent-v3.json' with {type:'json'};
import v4 from '../method-atlas/expansion-computation-schools-v4.json' with {type:'json'};
import v5 from '../method-atlas/expansion-nasa-chip-cloud-v5.json' with {type:'json'};
import v6 from '../method-atlas/expansion-abnormal-meta-v6.json' with {type:'json'};
import v8 from '../method-atlas/expansion-optical-v8.json' with {type:'json'};
import links from '../method-atlas/method-relations.json' with {type:'json'};

// Exercise the real candidate definitions and declared edges. These are local
// counterfactual readiness inputs, not executions of the named research hooks.
const methods=[first,v2,v3,v4,v5,v6,v8].flatMap(x=>x.methods);
const methodMap=new Map(methods.map(m=>[m.method_id,m]));
const relations=links.relationships;
const states=['AVAILABLE','MISSING','UNKNOWN'];
const atom={subject_id:'fixture:planner-selftest',atom_id:'fixture:challenge-readiness',
 dimensions:['DIAGNOSTIC','VERIFICATION'],source_refs:['fixture:owned-source'],external_source_refs:[]};
const receipt=(method_id,input_state='AVAILABLE',negative_control_state='AVAILABLE',falsifier_state='AVAILABLE',estimated_cost_units=100)=>
 ({method_id,input_state,negative_control_state,falsifier_state,estimated_cost_units});
const primary=receipt('MHA-0225','AVAILABLE','AVAILABLE','AVAILABLE',1);
const run=(overrides={})=>planNoahsArkReasoning({methods,relations,atom,method_receipts:[primary,
 receipt('MHA-0217','MISSING'),receipt('MHA-0090')],max_selected:1,max_pairs:1,...overrides});
const permutations=Array.from({length:8},(_,mask)=>({
 methods:mask&1?[...methods].reverse():methods,
 relations:mask&2?[...relations].reverse():relations,
 reverse_receipts:Boolean(mask&4)
}));
const projection=x=>JSON.stringify({selected:x.selected_methods,pairs:x.proposed_pairs,outcome:x.outcome_vector});
const decisionFor=state=>state==='AVAILABLE'?'STRUCTURAL_METHOD_CANDIDATE':
 state==='MISSING'?'BLOCKED_REQUIRED_INPUTS':'NEEDS_INPUT_SCHEMA_REVIEW';
const limitedFailure=(failures,value)=>{failures.count++;if(failures.examples.length<3)failures.examples.push(value)};
const noPromotion=x=>x.no_method_executed===true&&x.no_source_authentication===true&&
 x.independent_evidence_proven===false&&x.authorization_conferred===false&&
 x.target_actions_performed===false&&x.canonical_promotion===false&&
 x.proposed_pairs.every(p=>p.challenger_executed===false&&p.native_evidence_independence==='NOT_ESTABLISHED');

test('MHA-0225 own registered falsifier selects the available cross-check over an unavailable challenge',()=>{
 assert.equal(methods.length,239);
 assert.equal(relations.length,212);
 assert.equal(methodMap.get('MHA-0225').falsifier,
  'Falsifier lacks required input but a distinct complementary check is ready');
 assert.deepEqual(relations.filter(e=>e.method_id==='MHA-0225').map(e=>[e.related_method_id,e.relation_type]).sort(),
  [['MHA-0090','CROSS_CHECK'],['MHA-0217','CHALLENGE']]);
 const x=run();
 assert.deepEqual(x.selected_methods.map(m=>m.method_id),['MHA-0225']);
 assert.equal(x.proposed_pairs[0].challenger_method_id,'MHA-0090');
 assert.equal(x.proposed_pairs[0].challenger_readiness,'STRUCTURAL_METHOD_CANDIDATE');
 assert.ok(noPromotion(x));
});

test('MHA-0225 bounded input/control/cost sweep is invariant under all independent list reversals',t=>{
 // 3^2 input assignments * 3^4 independent control assignments * 2^2 costs.
 // Eight list-order variants are repeated observations, not eight new models.
 let cases=0,executions=0,reorderFailures=0,boundaryFailures=0;
 const failures={count:0,examples:[]};
 for(const challengeInput of states)for(const crossInput of states)
 for(const challengeControl of states)for(const challengeFalsifier of states)
 for(const crossControl of states)for(const crossFalsifier of states)
 for(const challengeCost of [1,100])for(const crossCost of [1,100]){
  cases++;
  const receipts=[primary,receipt('MHA-0217',challengeInput,challengeControl,challengeFalsifier,challengeCost),
   receipt('MHA-0090',crossInput,crossControl,crossFalsifier,crossCost)];
  // The actual MHA-0225 falsifier: only an available alternative can displace
  // its unavailable challenge. Comparable readiness keeps the original edge priority.
  const expected=challengeInput!=='AVAILABLE'&&crossInput==='AVAILABLE'?'MHA-0090':'MHA-0217';
  const expectedState=decisionFor(expected==='MHA-0090'?crossInput:challengeInput);
  let original;
  for(const p of permutations){
   const x=run({methods:p.methods,relations:p.relations,
    method_receipts:p.reverse_receipts?[...receipts].reverse():receipts});
   executions++;
   const pair=x.proposed_pairs[0],view=projection(x);
   if(original!==undefined&&view!==original)reorderFailures++;
   original??=view;
   if(pair?.challenger_method_id!==expected||pair?.challenger_readiness!==expectedState){
    limitedFailure(failures,{challengeInput,crossInput,challengeControl,challengeFalsifier,
     crossControl,crossFalsifier,challengeCost,crossCost,expected,actual:pair?.challenger_method_id});
   }
   if(x.method_consideration.length!==239||x.selected_methods.length!==1||
    x.selected_methods[0].method_id!=='MHA-0225'||!noPromotion(x))boundaryFailures++;
  }
 }
 t.diagnostic(JSON.stringify({sweep:'MHA_0225_INPUT_CONTROLS_COST_ORDER',base_cases:cases,
  order_variants:permutations.length,planner_executions:executions,pair_failures:failures.count,
  reorder_failures:reorderFailures,boundary_failures:boundaryFailures}));
 assert.equal(cases,2916);
 assert.equal(executions,23328);
 assert.equal(reorderFailures,0);
 assert.equal(boundaryFailures,0);
 assert.equal(failures.count,0,JSON.stringify(failures.examples));
});

test('All native two-edge choices preserve relation and ID priority when readiness is comparable',t=>{
 const groups=[...Map.groupBy(relations,e=>e.method_id)].filter(([,edges])=>edges.length===2);
 const priority=['CHALLENGE','CROSS_CHECK','COMPLEMENT'];
 let cases=0,executions=0,reorderFailures=0;
 const failures={count:0,examples:[]};
 for(const [id,edges] of groups){
  const dimensions=[...new Set([id,...edges.map(e=>e.related_method_id)]
   .flatMap(method_id=>methodMap.get(method_id).dimensions))];
  const configuredAtom={...atom,dimensions};
  for(const leftInput of states)for(const rightInput of states){
   cases++;
   const inputs=[leftInput,rightInput];
   const receipts=[receipt(id,'AVAILABLE','AVAILABLE','AVAILABLE',1),
    ...edges.map((e,i)=>receipt(e.related_method_id,inputs[i]))];
   const available=edges.filter((e,i)=>inputs[i]==='AVAILABLE');
   // Require a ready native alternative if one exists; otherwise retain an
   // explicit evidence target. Edge semantics and ID order resolve either set.
   const expected=(available.length?available:edges).toSorted((a,b)=>
    priority.indexOf(a.relation_type)-priority.indexOf(b.relation_type)||
    a.related_method_id.localeCompare(b.related_method_id))[0];
   let original;
   for(const p of permutations){
    const x=run({methods:p.methods,relations:p.relations,atom:configuredAtom,
     method_receipts:p.reverse_receipts?[...receipts].reverse():receipts});
    executions++;
    const pair=x.proposed_pairs[0],view=projection(x);
    if(original!==undefined&&view!==original)reorderFailures++;
    original??=view;
    if(x.selected_methods[0]?.method_id!==id||pair?.challenger_method_id!==expected.related_method_id||
     pair?.relation_type!==expected.relation_type||!noPromotion(x)){
     limitedFailure(failures,{id,leftInput,rightInput,expected:expected.related_method_id,
      primary:x.selected_methods[0]?.method_id,actual:pair?.challenger_method_id});
    }
   }
  }
 }
 t.diagnostic(JSON.stringify({sweep:'ALL_NATIVE_TWO_EDGE_CHOICES',native_primary_methods:groups.length,
  base_cases:cases,order_variants:permutations.length,planner_executions:executions,
  pair_failures:failures.count,reorder_failures:reorderFailures}));
 assert.equal(groups.length,15);
 assert.equal(cases,135);
 assert.equal(executions,1080);
 assert.equal(reorderFailures,0);
 assert.equal(failures.count,0,JSON.stringify(failures.examples));
});

test('Available input without typed applicability cannot displace a ready cross-check',()=>{
 const x=run({atom:{...atom,dimensions:['VERIFICATION']},method_receipts:[primary,
  receipt('MHA-0217','AVAILABLE','AVAILABLE','AVAILABLE',1),receipt('MHA-0090')]});
 assert.deepEqual(x.selected_methods.map(m=>m.method_id),['MHA-0225']);
 assert.equal(x.method_consideration.find(m=>m.method_id==='MHA-0217').decision,'DORMANT_NO_TYPED_TRIGGER');
 assert.equal(x.proposed_pairs[0].challenger_method_id,'MHA-0090');
 assert.equal(x.proposed_pairs[0].challenger_readiness,'STRUCTURAL_METHOD_CANDIDATE');
});

test('No applicable ready pair retains its original explicitly unready evidence target',()=>{
 for(const state of ['MISSING','UNKNOWN']){
  const x=run({atom:{...atom,dimensions:['DIAGNOSTIC']},method_receipts:[primary,
   receipt('MHA-0217',state),receipt('MHA-0090')]});
  assert.equal(x.proposed_pairs[0].challenger_method_id,'MHA-0217');
  assert.equal(x.proposed_pairs[0].challenger_readiness,decisionFor(state));
  assert.equal(x.method_consideration.find(m=>m.method_id==='MHA-0090').decision,'DORMANT_NO_TYPED_TRIGGER');
  assert.ok(noPromotion(x));
 }
 const omitted=run({method_receipts:[primary]});
 assert.equal(omitted.proposed_pairs[0].challenger_method_id,'MHA-0217');
 assert.equal(omitted.proposed_pairs[0].challenger_readiness,'NEEDS_INPUT_SCHEMA_REVIEW');
});

test('Missing native source prevents every choice even when all inputs and controls are declared ready',()=>{
 for(const external_source_refs of [[],['fixture:external-only']]){
  const x=run({atom:{...atom,source_refs:[],external_source_refs},
   method_receipts:[primary,receipt('MHA-0217'),receipt('MHA-0090')]});
  assert.equal(x.status,'BLOCKED_NATIVE_SOURCE');
  assert.equal(x.method_consideration.length,239);
  assert.equal(x.selected_methods.length,0);
  assert.equal(x.proposed_pairs.length,0);
  assert.ok(noPromotion(x));
 }
});

test('Pair budgets and absent declared links do not manufacture fallback relationships',()=>{
 assert.deepEqual(run({max_pairs:0}).proposed_pairs,[]);
 assert.deepEqual(run({relations:relations.filter(e=>e.method_id!=='MHA-0225')}).proposed_pairs,[]);
 const x=run({max_pairs:8});
 assert.equal(x.proposed_pairs.length,1);
 assert.equal(x.proposed_pairs[0].challenger_method_id,'MHA-0090');
});

test('Reordering methods, dimensions, relations and readiness preserves the complete plan and inputs',()=>{
 const receipts=[primary,receipt('MHA-0217','UNKNOWN'),receipt('MHA-0090')];
 const input={methods,relations,atom,method_receipts:receipts,max_selected:1,max_pairs:1};
 const before=JSON.stringify(input);
 const x=planNoahsArkReasoning(input);
 const y=planNoahsArkReasoning({...input,
  methods:[...methods].reverse().map(m=>({...m,dimensions:[...m.dimensions].reverse()})),
  relations:[...relations].reverse(),method_receipts:[...receipts].reverse(),
  atom:{...atom,dimensions:[...atom.dimensions].reverse()}});
 assert.deepEqual(y,x);
 assert.equal(JSON.stringify(input),before);
});

test('Historical operative receipt plan is unchanged and is only read for comparison',()=>{
 const url=new URL('../docs/validation/MPC-V13-OPERATIVE-STATE.json',import.meta.url);
 const before=readFileSync(url,'utf8'),state=JSON.parse(before),c=state.config;
 const planned=planNoahsArkReasoning({methods,relations,atom:c.atom,method_receipts:c.method_readiness,
  max_selected:c.max_selected,max_pairs:c.max_pairs});
 assert.deepEqual(planned,state.plan);
 assert.equal(state.revision,1);
 assert.equal(state.event_sequence,6);
 assert.equal(c.source_revision.commit,'4ffde83e587db829b9cd2124c0a8587e868402d6');
 assert.equal(readFileSync(url,'utf8'),before);
});
