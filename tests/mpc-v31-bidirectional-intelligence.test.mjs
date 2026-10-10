import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../research/bidirectional-intelligence-methods-v31.json' with {type:'json'};
import {validateHornModelV31,forwardHornV31,backwardHornV31,compareDirectionsV31,
 forwardWithSeedModificationsV31,bidirectionalV31Contract}
 from '../lib/mpc-v31-bidirectional-logic.mjs';
import {diagnoseDeclaredConflictsV31,abduceFiniteGoalV31,
 calculateMinimalRetractionCutsV31,metamorphicBidirectionalChecksV31,
 selectMethodPortfolioV31,auditMethodPortfolioV31,diagnosticV31Contract}
 from '../lib/mpc-v31-diagnostic-methods.mjs';

const ctx={source_commit:'1749089a1666cfa47daf0d2b2a131d02f568cf54',
 scope_id:'fixture:method-intelligence',subject_id:'fixture:evidence-job',
 source_ref:'fixture:model',source_owner:'fixture:operator',source_version:'rev1'};
const fact=(id,symbol,state='SYNTHETIC',source_ref='fixture:'+id,source_version='rev1')=>
 ({id,symbol,state,source_ref,source_owner:'fixture:operator',source_version});
const rule=(id,premises,conclusion,source_ref='fixture:'+id)=>
 ({id,premises,conclusion,source_ref,source_owner:'fixture:operator',source_version:'rev1'});
const model=()=>({...ctx,world:'SYNTHETIC',goal:'GOAL',
 facts:[fact('fA','A'),fact('fB','B'),fact('fC','C')],
 rules:[rule('rAND',['A','B'],'X'),rule('rX',['X'],'GOAL'),
  rule('rOR',['C'],'GOAL'),rule('rLOOP1',['L'],'M'),rule('rLOOP2',['M'],'L')]});
const minimal=x=>x.map(a=>a.join('|')).sort();
const diagnosis=()=>({...ctx,assumptions:[
 {id:'a',cost:1,source_ref:'fixture:a'},
 {id:'b',cost:9,source_ref:'fixture:b'},
 {id:'c',cost:1,source_ref:'fixture:c'}],
 conflicts:[{id:'conflict1',assumption_ids:['a','b'],source_ref:'fixture:c1'},
  {id:'conflict2',assumption_ids:['b','c'],source_ref:'fixture:c2'}]});
test('V31 overlay records 36 source-linked hooks and preserves canonical MPC counts',()=>{
 assert.equal(manifest.namespace,'RH_V31_NONCANONICAL_RESEARCH');
 assert.equal(manifest.hooks.length,36);
 assert.equal(new Set(manifest.hooks.map(x=>x.id)).size,36);
 assert.equal(manifest.original_native_evaluators,24);
 assert.equal(manifest.original_atlas_candidates,239);
 assert.equal(bidirectionalV31Contract.max_facts,12);
 assert.equal(diagnosticV31Contract.max_assumptions,12);
 const families=manifest.hooks.reduce((a,h)=>(a[h.family]=(a[h.family]||0)+1,a),{});
 assert.deepEqual(families,{LOGIC:12,DIAGNOSIS:8,FALSIFICATION:8,PORTFOLIO:8});
 assert.ok(manifest.hooks.every(h=>h.source_urls.length>0&&h.source_urls.every(x=>x.startsWith('https://'))));
});
test('AND/OR forward closure keeps both minimal source facts for alternate proofs',()=>{
 const r=forwardHornV31(model());
 assert.equal(r.status,'GOAL_DERIVABLE_IN_FINITE_MODEL');
 assert.deepEqual(minimal(r.goal_minimal_fact_supports),['fA|fB','fC']);
 assert.deepEqual(r.all_symbol_supports.X,[['fA','fB']]);
 assert.equal(r.source_authenticated,false);
 assert.equal(r.canonical_promotion,false);
});
test('independent backward proof agrees on exact minimal fact antichain',()=>{
 const r=compareDirectionsV31(model());
 assert.equal(r.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
 assert.equal(r.exact_minimal_provenance_agreement,true);
 assert.deepEqual(r.forward.goal_minimal_fact_supports,r.backward.goal_minimal_fact_supports);
 assert.deepEqual(minimal(r.backward.goal_minimal_fact_supports),['fA|fB','fC']);
 assert.equal(r.forward.direction,'FORWARD');
 assert.equal(r.backward.direction,'BACKWARD');
});
test('missing AND premise cannot be replaced by the other premise alone',()=>{
 const x=model();x.facts=x.facts.filter(f=>f.id!=='fB'&&f.id!=='fC');
 const r=compareDirectionsV31(x);
 assert.equal(r.forward.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
 assert.equal(r.backward.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
 assert.deepEqual(r.forward.goal_minimal_fact_supports,[]);
 assert.equal(r.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
});
test('unknown and claimed sources do not enter either finite proof closure',()=>{
 const x=model();x.world='RECORD';
 x.facts=x.facts.map(f=>({...f,state:f.id==='fA'?'OBSERVED':'CLAIMED'}));
 const r=compareDirectionsV31(x);
 assert.equal(r.forward.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
 assert.deepEqual(r.forward.declared_unknown_fact_ids,['fB','fC']);
 assert.equal(r.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
});
test('circular unseeded rules never bootstrap a conclusion',()=>{
 const x={...model(),goal:'L',facts:[],
  rules:[rule('r1',['L'],'M'),rule('r2',['M'],'L')]};
 const r=compareDirectionsV31(x);
 assert.deepEqual(r.forward.goal_minimal_fact_supports,[]);
 assert.deepEqual(r.backward.goal_minimal_fact_supports,[]);
 assert.ok(r.backward.cycle_symbols.length>0);
 assert.equal(r.state,'FORWARD_BACKWARD_PROOF_AGREEMENT');
});
test('seeded cycle retains the original seed as sole minimum support',()=>{
 const x={...model(),goal:'L',facts:[fact('seed','L')],
  rules:[rule('r1',['L'],'M'),rule('r2',['M'],'L')]};
 assert.deepEqual(forwardHornV31(x).goal_minimal_fact_supports,[['seed']]);
 assert.deepEqual(backwardHornV31(x).goal_minimal_fact_supports,[['seed']]);
});
test('direct goal source absorbs longer circular or indirect superset proof',()=>{
 const x=model();x.facts.push(fact('direct','GOAL'));
 x.rules.push(rule('r4',['GOAL','A'],'GOAL'));
 const f=forwardHornV31(x),b=backwardHornV31(x);
 assert.deepEqual(minimal(f.goal_minimal_fact_supports),['direct','fA|fB','fC']);
 assert.deepEqual(f.goal_minimal_fact_supports,b.goal_minimal_fact_supports);
});
test('multiple direct sources sharing same atom remain distinct proof witnesses',()=>{
 const x={...model(),rules:[],goal:'A',
  facts:[fact('one','A'),fact('two','A')]};
 assert.deepEqual(forwardHornV31(x).goal_minimal_fact_supports,[['one'],['two']]);
 assert.deepEqual(backwardHornV31(x).goal_minimal_fact_supports,[['one'],['two']]);
});
test('forward and backward find no proof with no seed and positive Horn rules',()=>{
 const x={...model(),facts:[],rules:[rule('r',['Z'],'GOAL')]};
 const a=backwardHornV31(x);
 assert.equal(a.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
 assert.ok(a.missing_leaf_symbols.includes('Z'));
 assert.equal(a.goal_minimal_fact_supports.length,0);
});
test('strict typed source collision rejects two revisions of the same native record',()=>{
 const x=model();x.facts[1].source_ref=x.facts[0].source_ref;
 x.facts[1].source_version='other';
 assert.throws(()=>forwardHornV31(x),/V31_NATIVE_SOURCE_VERSION_CONFLICT/);
});
test('rule owner conflict and evidence-world mixing reject inferred source authority',()=>{
 const x=model();x.rules[0].source_ref=x.facts[0].source_ref;
 x.rules[0].source_owner='other';
 assert.throws(()=>validateHornModelV31(x),/V31_NATIVE_SOURCE_VERSION_CONFLICT/);
 const y=model();y.world='RECORD';
 assert.throws(()=>forwardHornV31(y),/INVALID_HORN_FACT/);
});
test('syntactic injection, empty rule body and duplicate rule/fact IDs fail closed',()=>{
 const x=model();x.facts[0].private_password='secret';
 assert.throws(()=>validateHornModelV31(x),/INVALID_HORN_FACT_FIELDS/);
 const y=model();y.rules[0].premises=[];
 assert.throws(()=>validateHornModelV31(y),/INVALID_HORN_RULE/);
 const z=model();z.rules[0].id=z.facts[0].id;
 assert.throws(()=>validateHornModelV31(z),/INVALID_HORN_RULE/);
});
test('unbound inverse is not derived from a forward implication',()=>{
 const x={...model(),facts:[fact('fGoal','GOAL')],
  rules:[rule('only',['A'],'GOAL')]};
 assert.equal(compareDirectionsV31(x).forward.status,'GOAL_DERIVABLE_IN_FINITE_MODEL');
 const reversed={...x,goal:'A'};
 assert.equal(compareDirectionsV31(reversed).forward.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
});
test('valid seed removal recomputes the original model without permanent mutation',()=>{
 const x=model(),before=JSON.stringify(x);
 const r=forwardWithSeedModificationsV31(x,{remove_seed_ids:['fC']});
 assert.deepEqual(r.goal_minimal_fact_supports,[['fA','fB']]);
 assert.equal(r.hypothetical_model_only,true);
 assert.equal(JSON.stringify(x),before);
});
test('hypothetical seeds supply only model-local derived goal routes',()=>{
 const x={...model(),facts:[]},r=forwardWithSeedModificationsV31(x,{
  hypothetical_seeds:[{id:'hC',symbol:'C'}]});
 assert.deepEqual(r.goal_minimal_fact_supports,[['hC']]);
 assert.equal(r.hypothetical_model_only,true);
 assert.deepEqual(forwardHornV31(x).goal_minimal_fact_supports,[]);
});
test('invalid retraction/assumption substitutions reject',()=>{
 assert.throws(()=>forwardWithSeedModificationsV31(model(),{remove_seed_ids:['foreign']}),
  /INVALID_SEED_RETRACTION/);
 assert.throws(()=>forwardWithSeedModificationsV31(model(),{hypothetical_seeds:[{id:'fA',symbol:'Q'}]}),
  /INVALID_HYPOTHETICAL_SEED/);
 assert.throws(()=>forwardWithSeedModificationsV31(model(),{run_shell:true}),
  /INVALID_SEED_MODIFICATIONS_FIELDS/);
});
test('Reiter minimal conflict hitting sets distinguish one component from paired alternative',()=>{
 const r=diagnoseDeclaredConflictsV31(diagnosis());
 assert.equal(r.state,'DECLARED_MINIMAL_CONFLICT_HITTING_SETS');
 assert.deepEqual(r.diagnoses.map(d=>d.assumption_ids),[['a','c'],['b']]);
 assert.deepEqual(r.diagnoses.map(d=>d.declared_cost),[2,9]);
 assert.ok(r.diagnoses.every(x=>x.all_declared_conflicts_hit&&x.subset_minimal));
 assert.equal(r.actual_faults_verified,false);
});
test('reordered conflicts and assumptions preserve minimal diagnosis sets',()=>{
 const x=diagnosis(),y={...x,assumptions:x.assumptions.slice().reverse(),
  conflicts:x.conflicts.slice().reverse()};
 assert.deepEqual(diagnoseDeclaredConflictsV31(x).diagnoses,
  diagnoseDeclaredConflictsV31(y).diagnoses);
});
test('diagnosis costs only rank declared hypotheses, not empirical likelihood',()=>{
 const x=diagnosis();
 x.assumptions.find(x=>x.id==='b').cost=1;
 const r=diagnoseDeclaredConflictsV31(x);
 assert.deepEqual(r.diagnoses.map(d=>d.assumption_ids),[['b'],['a','c']]);
 assert.equal(r.source_authenticated,false);
});
test('diagnosis rejects duplicate assumptions and unknown conflict members',()=>{
 const x=diagnosis();x.assumptions[1].id='a';
 assert.throws(()=>diagnoseDeclaredConflictsV31(x),/INVALID_DIAGNOSIS_ASSUMPTION/);
 const y=diagnosis();y.conflicts[0].assumption_ids=['other'];
 assert.throws(()=>diagnoseDeclaredConflictsV31(y),/INVALID_DIAGNOSIS_CONFLICT/);
});
test('abduction ranks two independent missing-explanation families by declared costs',()=>{
 const x={...model(),facts:[]};
 const r=abduceFiniteGoalV31(x,[
  {id:'hA',symbol:'A',cost:1,source_ref:'fixture:hA'},
  {id:'hB',symbol:'B',cost:1,source_ref:'fixture:hB'},
  {id:'hC',symbol:'C',cost:5,source_ref:'fixture:hC'}
 ]);
 assert.equal(r.state,'MINIMAL_ABDUCTIVE_EXPLANATIONS');
 assert.deepEqual(r.explanations.map(x=>x.assumption_ids),[['hA','hB'],['hC']]);
 assert.deepEqual(r.explanations.map(x=>x.cost),[2,5]);
 assert.equal(r.hypotheses_observed,false);
});
test('abduction respects a preexisting supported goal without adding hypotheses',()=>{
 const r=abduceFiniteGoalV31(model(),[
 {id:'guess',symbol:'D',cost:2,source_ref:'fixture:assumption'}]);
 assert.equal(r.state,'GOAL_ALREADY_SUPPORTED');
 assert.deepEqual(r.explanations[0].assumption_ids,[]);
 assert.equal(r.assessed_subsets,0);
});
test('abduction returns no invented explanation from irrelevant candidates',()=>{
 const x={...model(),facts:[]};
 const r=abduceFiniteGoalV31(x,[{id:'hD',symbol:'D',cost:1,source_ref:'fixture:hD'}]);
 assert.equal(r.state,'NO_EXPLANATION_IN_SUPPLIED_ASSUMPTION_SET');
 assert.deepEqual(r.explanations,[]);
});
test('abduction refuses fake source fields, reused fact ids and unjustified cost',()=>{
 const x={...model(),facts:[]};
 assert.throws(()=>abduceFiniteGoalV31(x,[{id:'x',symbol:'A',cost:0,source_ref:'a'}]),
  /INVALID_ABDUCTION_CANDIDATE/);
 assert.throws(()=>abduceFiniteGoalV31(model(),[{id:'fA',symbol:'A',cost:1,source_ref:'a'}]),
  /INVALID_ABDUCTION_CANDIDATE/);
 assert.throws(()=>abduceFiniteGoalV31(x,[{id:'x',symbol:'A',cost:1,source_ref:'a',
  speculative_probability:0.5}]),/INVALID_ABDUCTION_CANDIDATE_FIELDS/);
});
test('two distinct goal proof paths have exactly two minimal withdrawal cuts',()=>{
 const r=calculateMinimalRetractionCutsV31(model());
 assert.equal(r.state,'MINIMUM_RETRACTION_DUALITY_REPLAY_PASSED');
 assert.deepEqual(r.candidate_cuts.map(c=>c.withdraw_fact_ids),[['fA','fC'],['fB','fC']]);
 assert.ok(r.candidate_cuts.every(c=>c.subset_minimal&&c.breaks_goal_in_declared_model));
 assert.equal(r.source_records_modified,false);
});
test('single conjunction proof has two distinct singleton withdrawals',()=>{
 const x=model();x.facts=x.facts.filter(x=>x.id!=='fC');
 const r=calculateMinimalRetractionCutsV31(x);
 assert.deepEqual(r.candidate_cuts.map(c=>c.withdraw_fact_ids),[['fA'],['fB']]);
});
test('unsupported goal before counterfactual yields no invented cuts',()=>{
 const x={...model(),facts:[]};
 const r=calculateMinimalRetractionCutsV31(x);
 assert.equal(r.state,'GOAL_NOT_SUPPORTED_BEFORE_RETRACTION');
 assert.deepEqual(r.candidate_cuts,[]);
 assert.equal(r.tests_performed,0);
});
test('metamorphic order, duplicate rule, irrelevant seed each preserve goal supports',()=>{
 const r=metamorphicBidirectionalChecksV31(model());
 assert.equal(r.all_controls_pass,true);
 assert.deepEqual(r.controls.map(x=>x.name),[
  'RULE_REORDER','DUPLICATE_RULE','IRRELEVANT_DECLARED_SYMBOL'
 ]);
 assert.ok(r.controls.every(x=>x.pass&&x.synthetic_control_only));
});
test('metamorphic proof tests preserve exact input identity unchanged',()=>{
 const x=model(),snapshot=JSON.stringify(x);
 metamorphicBidirectionalChecksV31(x);
 assert.equal(JSON.stringify(x),snapshot);
});
test('method tournament compares actual per-case work counts and chooses a bounded engine',()=>{
 const r=selectMethodPortfolioV31(model());
 assert.equal(r.comparison_state,'BIDIRECTIONAL_AND_METAMORPHIC_ORACLES_PASS');
 assert.equal(r.bidirectional_receipt.exact_minimal_provenance_agreement,true);
 assert.equal(r.metamorphic_controls.all_controls_pass,true);
 assert.ok(['FORWARD','BACKWARD','TIE_FORWARD_DEFAULT'].includes(r.selected_method));
 assert.match(r.compact_output,/METHOD  /);
 assert.equal(r.compact_output.split('\n').length,4);
});
test('goal with many irrelevant rules selects query-focused backward engine',()=>{
 const x={...model(),goal:'Z',facts:[],
  rules:[rule('r1',['U'],'V'),rule('r2',['V'],'X'),rule('r3',['A'],'B'),
   rule('r4',['B'],'C'),rule('r5',['C'],'D')]};
 const r=selectMethodPortfolioV31(x);
 assert.equal(r.selected_method,'BACKWARD');
 assert.equal(r.bidirectional_receipt.forward.status,'GOAL_UNSUPPORTED_IN_FINITE_MODEL');
});
test('replay checks source goal, minimal support, work metrics and authority flags',()=>{
 const r=selectMethodPortfolioV31(model());
 const a=auditMethodPortfolioV31(model(),r);
 assert.equal(a.state,'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH');
 assert.deepEqual(a.issues,[]);
 assert.equal(a.expected_selected_method,r.selected_method);
});
test('forged portfolio winner and source proofs fail independent method audit',()=>{
 const x=model(),r=selectMethodPortfolioV31(x),tamper=structuredClone(r);
 tamper.selected_method='FAKE';
 tamper.workload_metrics.forward_rule_checks=0;
 tamper.bidirectional_receipt.forward.goal_minimal_fact_supports=[['fake']];
 tamper.source_authenticated=true;
 const audit=auditMethodPortfolioV31(x,tamper);
 assert.equal(audit.state,'METHOD_TOURNAMENT_RECEIPT_REJECTED');
 assert.ok(audit.issues.includes('SOURCE_GOAL_OR_SELECTED_METHOD_CHANGED'));
 assert.ok(audit.issues.includes('ACTUAL_ALGORITHM_WORK_UNITS_CHANGED'));
 assert.ok(audit.issues.includes('MINIMAL_SOURCE_PROOFS_CHANGED'));
 assert.ok(audit.issues.includes('FALSE_SOURCE_OR_ACTION_PROMOTION'));
});

test('hostile coverage review blocks method selection when rule/fact budgets skip controls',()=>{
 const input={...model(),facts:Array.from({length:12},(_,i)=>fact('f'+i,'A'+i)),
  rules:Array.from({length:24},(_,i)=>rule('r'+i,['A'+(i%12)],
    i===0?'GOAL':'B'+i))};
 const checks=metamorphicBidirectionalChecksV31(input);
 assert.equal(checks.controls.length,1);
 assert.equal(checks.all_controls_pass,true);
 assert.equal(checks.coverage_complete,false);
 assert.deepEqual(checks.omitted_controls,['DUPLICATE_RULE','IRRELEVANT_DECLARED_SYMBOL']);
 const p=selectMethodPortfolioV31(input);
 assert.equal(p.selected_method,'NONE_PENDING_REVIEW');
 assert.equal(p.comparison_state,'METHOD_COMPARISON_COVERAGE_INCOMPLETE');
 assert.equal(auditMethodPortfolioV31(input,p).state,
  'SOURCE_BOUND_METHOD_TOURNAMENT_REPLAY_MATCH');
});
test('independent portfolio audit rejects forged compact result even when logical proof is untouched',()=>{
 const x=model(),p=selectMethodPortfolioV31(x);
 const broken=structuredClone(p);
 broken.compact_output=broken.compact_output.replace('ORACLES_PASS','VERIFIED_FINALLY');
 assert.equal(auditMethodPortfolioV31(x,broken).state,'METHOD_TOURNAMENT_RECEIPT_REJECTED');
 assert.ok(auditMethodPortfolioV31(x,broken).issues.includes('COMPACT_METHOD_OUTPUT_DRIFT'));
 const summary=structuredClone(p);
 summary.next_action='Publish all these facts now.';
 assert.ok(auditMethodPortfolioV31(x,summary).issues.includes('COMPACT_METHOD_OUTPUT_DRIFT'));
});
