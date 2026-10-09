import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/atomic-owner-variation.json' with {type:'json'};
import {reviewAtomicVariants,atomicContract} from '../lib/atomic-review.mjs';
import {getMethodArk,methodArkInventory} from '../lib/method-ark.mjs';
import {callTool,toolList} from '../lib/tools.mjs';
import {handleMcp} from '../lib/mcp.mjs';

const base=()=>structuredClone(fixture);
const transform=(operator,atom_ids=[],extra={})=>({id:'T',operator,atom_ids,rationale:'Synthetic controlled comparison.',material_change_basis:'The supplied variable may change the selected invariant.',source_refs:['FIXTURE'],...extra});
const isolated=(t,edit=()=>{})=>{const b=base();b.mode='PLAN';b.models=[];b.checks=[];b.transforms=[t];edit(b);return b};
const state=async(t,edit)=>{const r=await reviewAtomicVariants(isolated(t,edit));return r.variants[0]};
const value=(v,id)=>v.atoms.find(a=>a.id===id)?.value;

test('Atom swap is a model-bound counterexample with original source and all classifier IDs preserved',async()=>{
 const input=base(),before=structuredClone(input),r=await callTool('review_atomic_variants',input);
 assert.deepEqual(input,before);assert.deepEqual(r.original_atoms,input.atoms);
 assert.equal(r.baseline.invariant_checks[0].state,'HOLDS');assert.equal(r.variants[0].invariant_checks[0].state,'VIOLATED');
 assert.equal(r.variants[0].status,'MODEL_COUNTEREXAMPLE_CANDIDATE');assert.equal(r.variants[0].evidence_state,'TEST_ONLY_COUNTERFACTUAL');
 assert.equal(r.explicit_model_evaluations,2);assert.equal(r.methods_accounted,24);
 assert.equal(r.classifier_accounting.caller_referenced_ids.length+r.classifier_accounting.not_selected_ids.length,384);
 assert.equal(r.classifier_accounting.registry_binding.business_logic_pack_fingerprint,'7db8a73e32016a8d3df560f649125221615b42a669231ec066ce74fee9d8a58d');
 const packet=r.variants[0].model_results[0].method_packet;
 assert.deepEqual(Object.keys(packet),atomicContract.method_packet_fields);assert.equal(packet['LEGAL EFFECT CLAIMED?'],'NO');
 assert.equal(r.reconciliation.status,'NOT_PERFORMED_REVIEW_REQUIRED');assert.equal(r.canonical_promotion,false);assert.equal(r.source_records_modified,false);
 assert.equal(r.hook_accounting.length,10);assert.ok(r.hook_accounting.every(h=>h.execution_performed===false));
});

test('PLAN is the default and unavailable model values remain UNKNOWN',async()=>{
 const input=base();delete input.mode;const r=await reviewAtomicVariants(input);
 assert.equal(r.explicit_model_evaluations,0);assert.equal(r.baseline.model_results[0].execution,'SCHEMA_VALID_NOT_EXECUTED');
 assert.equal(r.baseline.invariant_checks[0].state,'UNKNOWN');assert.equal(r.variants[0].new_model_counterexamples.length,0);
});

test('Finite value transforms preserve exact typed values and immutable base',async()=>{
 assert.equal(value(await state(transform('SUBSTITUTE',['OWNER-A'],{values:['other']})),'OWNER-A'),'other');
 assert.equal(value(await state(transform('STATE DIFFERENCE',['NUMBER-A'],{values:[7]})),'NUMBER-A'),7);
 const swap=await state(transform('SWAP',['OWNER-A','OWNER-B']));assert.equal(value(swap,'OWNER-A'),'beta');assert.equal(value(swap,'OWNER-B'),'alpha');
 assert.equal(value(await state(transform('REORDER / PERMUTE',['NUMBER-A','NUMBER-B'],{permutation:['NUMBER-B','NUMBER-A']})),'NUMBER-A'),2);
 assert.equal(value(await state(transform('PERTURB',['NUMBER-A'],{delta:0.5})),'NUMBER-A'),1.5);
 const masked=await state(transform('MASK / HIDE CHANNEL',['OWNER-A']));assert.equal(value(masked,'OWNER-A'),null);assert.equal(masked.atoms[0].epistemic_state,'UNKNOWN');
 await assert.rejects(()=>state(transform('SWAP',['OWNER-A','NUMBER-A'])),/SAME_DECLARED_COORDINATE/);
 await assert.rejects(()=>state(transform('PERTURB',['OWNER-A'],{delta:1})),/NUMERIC_ATOM/);
});

test('Ablation, projection, edge inversion and null-edge tests expose exact changes',async()=>{
 assert.equal((await state(transform('REMOVE / ABLATE',['OWNER-A']))).atoms.length,3);
 assert.deepEqual((await state(transform('PROJECT / REDUCE',['OWNER-A']))).atoms.map(a=>a.id),['OWNER-A']);
 const edge=b=>b.atoms[1].depends_on=['OWNER-A'];
 const inverted=await state(transform('INVERT EDGE',['OWNER-A','OWNER-B']),edge);
 assert.deepEqual(inverted.atoms[0].depends_on,['OWNER-B']);assert.deepEqual(inverted.atoms[1].depends_on,[]);
 const removed=await state(transform('NULL / NO-EDGE TEST',['OWNER-A','OWNER-B']),edge);assert.deepEqual(removed.atoms[1].depends_on,[]);
 const missing=await state(transform('REMOVE / ABLATE',['OWNER-A']),edge);assert.deepEqual(missing.unresolved_dependencies,[{atom_id:'OWNER-B',missing_dependency:'OWNER-A'}]);
});

test('Restore resolves immutable originals after removal inside composition',async()=>{
 const b=base();b.models=[];b.checks=[];
 b.transforms=[transform('REMOVE / ABLATE',['OWNER-A'],{id:'REMOVE'}),transform('RESTORE',['OWNER-A'],{id:'RESTORE'}),transform('COMPOSE',[],{id:'COMPOSE',components:['REMOVE','RESTORE']})];
 const r=await reviewAtomicVariants(b);assert.equal(value(r.variants[2],'OWNER-A'),'alpha');assert.equal(r.variants[2].atoms.length,b.atoms.length);
 assert.equal(r.variants[2].changed_atoms.length,0);assert.equal(r.variants[2].status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 assert.equal(r.variants[1].status,'BOUNDED_VARIANT_REVIEW');
});

test('Recursive expansion keeps source-owned parent identity and does not claim semantic minimality',async()=>{
 const child={...base().atoms[0],id:'CHILD',parent_id:'OWNER-A',depth:1,variable:'child-value',value:'child'};
 const v=await state(transform('EXPAND / RECURSE',['OWNER-A'],{children:[child]}));assert.equal(v.atoms.length,5);assert.equal(v.atoms.at(-1).parent_id,'OWNER-A');
 const wrong={...child,subject:{...child.subject,native_id:'another'}};
 await assert.rejects(()=>state(transform('EXPAND / RECURSE',['OWNER-A'],{children:[wrong]})),/SUBJECT_MISMATCH/);
 await assert.rejects(()=>state(transform('EXPAND / RECURSE',['OWNER-A'],{children:[child,child]})),/DUPLICATE_ATOM_DEFINITION/);
});

test('Cross-product pagination materializes only the selected alternatives and binds the baseline fingerprint',async()=>{
 const b=isolated(transform('CROSS PRODUCT',[],{choices:[{atom_id:'NUMBER-A',values:[1,3]},{atom_id:'NUMBER-B',values:[2,4]}]}));b.max_variants=2;
 const first=await reviewAtomicVariants(b);assert.equal(first.generated_variant_count,4);assert.equal(first.next_variant_offset,2);
 const second=await reviewAtomicVariants({...b,variant_offset:2,expected_base_fingerprint:first.base_fingerprint});
 assert.deepEqual(second.variants.map(v=>[value(v,'NUMBER-A'),value(v,'NUMBER-B')]),[[3,2],[3,4]]);assert.equal(second.next_variant_offset,null);
 assert.equal(second.variant_materialization,'REQUESTED_PAGE_ONLY');
 const changed=structuredClone(b);changed.atoms[0].value='changed';changed.expected_base_fingerprint=first.base_fingerprint;
 await assert.rejects(()=>reviewAtomicVariants(changed),/STALE_ATOMIC_BASE/);
});

test('Alternatives vary one choice; sensitivity removes one atom; invariant control has no change',async()=>{
 const alternatives=await reviewAtomicVariants(isolated(transform('ALTERNATIVE-MODEL SET',[],{choices:[{atom_id:'NUMBER-A',values:[3,4]},{atom_id:'NUMBER-B',values:[5]}]})));
 assert.deepEqual(alternatives.variants.map(v=>[value(v,'NUMBER-A'),value(v,'NUMBER-B')]),[[3,2],[4,2],[1,5]]);
 const sensitivity=await reviewAtomicVariants(isolated(transform('QUALITATIVE SENSITIVITY / LOAD-BEARING TEST',['OWNER-A','OWNER-B'])));
 assert.deepEqual(sensitivity.variants.map(v=>v.controlled_atom),['OWNER-A','OWNER-B']);assert.ok(sensitivity.variants.every(v=>v.atoms.length===3));
 assert.equal((await state(transform('INVARIANT TEST'))).changed_atoms.length,0);
});

test('Removed bindings and masked nonnullable model inputs cannot generate a false invariant pass',async()=>{
 const b=base();b.transforms=[transform('REMOVE / ABLATE',['OWNER-A'])];
 let r=await reviewAtomicVariants(b);assert.equal(r.variants[0].model_results[0].execution,'BLOCKED_MISSING_ATOM');assert.equal(r.variants[0].invariant_checks[0].state,'UNKNOWN');
 b.transforms=[transform('MASK / HIDE CHANNEL',['OWNER-A'])];r=await reviewAtomicVariants(b);assert.equal(r.variants[0].model_results[0].execution,'BLOCKED_INVALID_VARIANT_MODEL');
 assert.equal(r.variants[0].new_model_counterexamples.length,0);
});

test('Cross-project sources, unregistered references, type collapse and ambiguous atom pointers reject',async()=>{
 const cases=[b=>b.sources[0].project_id='OTHER',b=>b.atoms[0].classifier_refs[0].native_id=999,b=>b.atoms[0].subject.native_id=7,b=>b.models[0].input.left.owner='mismatch',b=>b.models[0].bindings[0].input_pointer='/__proto__/owner'];
 for(const change of cases){const b=base();change(b);await assert.rejects(()=>reviewAtomicVariants(b))}
 const b=base();b.checks=[{...b.checks[0],target:'ATOM',subject_id:'OWNER-A',pointer:'/value',expected:'alpha'}];
 await assert.rejects(()=>reviewAtomicVariants(b),/ATOM_CHECK_POINTER/);
});

test('Evaluation and composition budgets never become a completed proof',async()=>{
 const b=base();b.transforms=Array.from({length:16},(_,i)=>transform('INVARIANT TEST',[],{id:'T'+i}));b.max_variants=16;
 b.models=[b.models[0],{...b.models[0],id:'SECOND'}];const r=await reviewAtomicVariants(b);
 assert.equal(r.execution_complete,false);assert.equal(r.next_execution_variant_offset,15);assert.equal(r.pending_execution_frontier.length,2);assert.equal(r.explicit_model_evaluations,32);assert.ok(r.variants.at(-1).model_results.every(m=>m.execution==='NOT_EXECUTED_BUDGET'));
 assert.ok(r.variants.at(-1).invariant_checks.every(c=>c.state==='UNKNOWN'));
 const c=isolated(transform('INVARIANT TEST',[],{id:'T0'}));
 for(let i=1;i<8;i++)c.transforms.push(transform('COMPOSE',[],{id:'T'+i,components:Array(8).fill('T'+(i-1))}));
 c.variant_offset=7;c.max_variants=1;await assert.rejects(()=>reviewAtomicVariants(c),/TRANSFORM_WORK_BUDGET/);
});

test('Ark pages cover all method layers exactly and never label hooks executable',()=>{
 assert.deepEqual(methodArkInventory,{...methodArkInventory,implemented_evaluators:24,research_hooks:10,framework_operators:15,reduction_methods:12,transformations:17,mirrors:15,object_coordinates:25,jacket_axes:14});
 for(const layer of methodArkInventory.layers){let offset=0,seen=[];while(offset!==null){const r=getMethodArk({catalog_layer:layer,offset,limit:5});seen.push(...r.methods);offset=r.next_offset;assert.ok(seen.length<=24)}
  const total=getMethodArk({catalog_layer:layer}).total;assert.equal(seen.length,total);assert.equal(new Set(seen.map(m=>m.method_id??m.lookup_id)).size,total);
  if(layer==='METHOD_HOOKS')assert.ok(seen.every(h=>h.implementation_state==='RESEARCH_HOOK_IMPLEMENTATION_REQUIRED'&&h.canonical_method_id===null));
 }
});

test('Actual MCP handler exposes and executes atom review with authentication and compatible UMTB4 path',async()=>{
 const args=base();const request=(name,arguments_,auth=false)=>new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'oai-authenticated-user-id':'atomic-test','oai-authenticated-user-email':'atomic@example.invalid'}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:arguments_}})});
 assert.equal((await handleMcp(request('review_atomic_variants',args))).status,401);
 const response=await handleMcp(request('review_atomic_variants',args,true));assert.equal(response.status,200);const rpc=await response.json();assert.equal(rpc.result.isError,false);assert.equal(rpc.result.structuredContent.explicit_model_evaluations,2);
 const routed=await callTool('business_logic_sweep',{namespace:'SYNTHETIC',object_id:args.object_id,actor:'fixture-author',action:'synthetic review',state_before:'synthetic baseline',state_after:'synthetic variant',channel:'offline',invariant:'Native key equality',context:'UMTB4:'+JSON.stringify({problem:'Synthetic owner check',object_id:args.object_id,unit_of_analysis:'object owner',domain_profile:'GENERAL',atomic_review:args})});
 assert.equal(routed.method_execution_performed,true);assert.equal(routed.atomic_review.variants[0].status,'MODEL_COUNTEREXAMPLE_CANDIDATE');
 assert.equal(toolList.length,20);assert.ok(new TextEncoder().encode(JSON.stringify(toolList)).length<400000);
});
