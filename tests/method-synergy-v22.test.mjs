import test from 'node:test';
import assert from 'node:assert/strict';
import {synergyContract,proposeMethodSynergies,planMethodInteractionCoverage,auditMethodInteractionCoverage} from '../lib/method-synergy-v22.mjs';
const source_commit='761c4445ec1b7c063dc70cb599e37b7eb5f7487e';
const scope_id='synthetic:method-synergy';
const hook=(id,requires,produces,needs_order=false)=>({id,requires,produces,needs_order,sources:['https://example.org/primary']});
const input=()=>({source_commit,scope_id,hooks:[
  hook('RH-V22-01',['MODEL','OBSERVATION'],['CONFLICT_SET']),
  hook('RH-V22-02',['CONFLICT_SET'],['DIAGNOSIS']),
  hook('RH-V22-03',['TRACE','DEPENDENCIES'],['SCHEDULES'],true),
 ],observations:[
 {type:'MODEL',state:'SYNTHETIC',source_ref:'fixture:model',scope_id},
 {type:'OBSERVATION',state:'SYNTHETIC',source_ref:'fixture:obs',scope_id},
 {type:'TRACE',state:'SYNTHETIC',source_ref:'fixture:trace',scope_id,clock_domain:'clock:1'},
 {type:'DEPENDENCIES',state:'SYNTHETIC',source_ref:'fixture:dep',scope_id,clock_domain:'clock:2'}
 ]});
test('source-bound ordered composition is a candidate, never method execution',()=>{
 const r=proposeMethodSynergies(input());
 assert.equal(r.matching_dependency_pairs,1);
 assert.equal(r.candidates,1);
 assert.deepEqual(r.pairs[0].bridge,['CONFLICT_SET']);
 assert.equal(r.pairs[0].state,'RESEARCH_COMPOSITION_CANDIDATE');
 assert.equal(r.pairs[0].method_execution,'NOT_EXECUTED');
 assert.equal(r.pairs[0].independent_evidence,'NOT_ESTABLISHED');
 assert.equal(r.execution,'NOT_EXECUTED');
});
test('missing, unknown and mismatched scope never turn into proof',()=>{
 const x=input(); x.observations[1].state='UNKNOWN';
 assert.equal(proposeMethodSynergies(x).pairs[0].state,'INPUT_ACQUISITION_REQUIRED');
 x.observations[1].scope_id='different';
 assert.throws(()=>proposeMethodSynergies(x),/INVALID_OBSERVATION_BINDING/);
 const y=input(); y.hooks.push(hook('RH-V22-04',['SCHEDULES','MODEL'],['REPORT'],true));
 assert.equal(proposeMethodSynergies(y).pairs.find(p=>p.from==='RH-V22-03').state,'CLOCK_ALIGNMENT_REQUIRED');
});
test('duplicate names, unsafe claims, source drift and budgets reject',()=>{
 const x=input();x.hooks[1].id=x.hooks[0].id;
 assert.throws(()=>proposeMethodSynergies(x),/INVALID_HOOK_ID/);
 const y=input(); y.hooks[0].sources=[];
 assert.throws(()=>proposeMethodSynergies(y),/RESEARCH_SOURCE_REQUIRED/);
 const z=input(); z.source_commit='garbage';
 assert.throws(()=>proposeMethodSynergies(z),/INVALID_SOURCE_SCOPE/);
 const t=input();t.hooks.push(hook('RH-V22-04',['CONFLICT_SET'],['X']));t.hooks.push(hook('RH-V22-04',['X'],['Y']));
 assert.throws(()=>proposeMethodSynergies(t),/INVALID_HOOK_ID/);
});
const coverage=()=>({source_commit,scope_id,factors:[
  {name:'ORACLE',values:['KNOWN','UNKNOWN']},
  {name:'CLOCK',values:['ALIGNED','DIFFERENT']},
  {name:'SOURCE',values:['FRESH','STALE']},
  {name:'ORDER',values:['AB','BA']}
 ], max_cases:24});
test('finite pairwise selection gives complete deterministic design and independent audit',()=>{
 const a=planMethodInteractionCoverage(coverage()),b=planMethodInteractionCoverage(coverage());
 assert.deepEqual(a,b);
 assert.equal(a.total_pairs,24);
 assert.equal(a.complete_design,true);
 assert.ok(a.cases.length<16);
 assert.equal(a.tests_executed,0);
 assert.equal(auditMethodInteractionCoverage(coverage(),a).state,'DESIGN_REPLAY_CONSISTENT');
});
test('explicit case budget remains incomplete and tampered receipt is contradicted',()=>{
 const x=coverage();x.max_cases=1;
 const r=planMethodInteractionCoverage(x);
 assert.equal(r.state,'BOUNDED_INCOMPLETE_TEST_DESIGN');
 assert.ok(r.missing_pairs.length>0);
 assert.equal(auditMethodInteractionCoverage(x,r).state,'DESIGN_REPLAY_CONSISTENT');
 r.complete_design=true;
 assert.equal(auditMethodInteractionCoverage(x,r).state,'DESIGN_CLAIM_CONTRADICTED');
});
test('no silent source version or factor mutation in independent replay',()=>{
 const x=coverage(), r=planMethodInteractionCoverage(x);
 x.source_commit='0000000000000000000000000000000000000000';
 assert.throws(()=>auditMethodInteractionCoverage(x,r),/DESIGN_SOURCE_DRIFT/);
 const q=coverage(),d=planMethodInteractionCoverage(q);
 d.cases[0].assignments[0].value='PHANTOM';
 assert.throws(()=>auditMethodInteractionCoverage(q,d),/INVALID_CASE_VALUE/);
 assert.equal(synergyContract.canonical_promotion,false);
});
test('cartesian explosion and malicious factor names fail before enumeration',()=>{
 const x=coverage();x.factors=[...Array(6)].map((_,i)=>({name:'F_'+i,values:['A','B','C','D']}));
 assert.equal(planMethodInteractionCoverage(x).exhaustive_worlds,4096);
 x.factors.push({name:'F_6',values:['A','B']});
 assert.throws(()=>planMethodInteractionCoverage(x),/INVALID_FACTORS/);
 const y=coverage(); y.factors[0].name='__proto__';
 assert.throws(()=>planMethodInteractionCoverage(y),/INVALID_FACTOR_NAME/);
});

test('research hook overlay remains noncanonical and indexed, with declared primary sources',async()=>{
 const {default:registry}=await import('../research/method-synergy-frontier-v22.json',{with:{type:'json'}});
 assert.equal(registry.identity_class,'NONCANONICAL_RESEARCH_HOOKS');
 assert.equal(registry.original_mha_count_unchanged,239);
 assert.equal(registry.original_evaluators_unchanged,24);
 assert.equal(registry.original_method_hooks_unchanged,10);
 assert.equal(registry.canonical_promotion,false);
 assert.equal(registry.hooks.length,13);
 assert.equal(new Set(registry.hooks.map(x=>x.id)).size,13);
 for(const hook of registry.hooks){
  assert.match(hook.id,/^RH-V22-[0-9]{2}$/);
  assert.ok(hook.sources.every(s=>s.startsWith('https://')));
  assert.equal(hook.implementation_state.includes('RESEARCH_CONTRACT_ONLY')||
   hook.implementation_state.includes('LOCAL_BOUNDED_TEST_DESIGN')||
   hook.implementation_state.includes('COVERAGE_DESIGN_REPLAY_ONLY'),true);
 }
});
