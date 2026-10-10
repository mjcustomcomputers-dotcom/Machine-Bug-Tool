import test from 'node:test';
import assert from 'node:assert/strict';
import frontier from '../research/behavioral-meta-method-frontier-v23.json' with {type:'json'};
import {
 behavioralMetaContract,reviewBehavioralAtoms,planBehavioralMethodInteractions,
 auditChoiceArchitecture,auditBehavioralExperimentProtocol,planBehavioralInteractionControls
} from '../lib/behavioral-meta-methods-v23.mjs';

const source_commit='fa36798a6c61bd8953a0d77e2eea202b82f8ea77';
const scope_id='fixture:case-23',subject_id='fixture:buyer-23';
const shared={source_commit,scope_id,subject_id};
const factors=['GOAL','CAPABILITY','OPPORTUNITY','MOTIVATION','PROMPT','ABILITY','POLICY_CONSTRAINTS',
 'USER_JOURNEY','CHOICE_INTERFACE','EXIT_PATH','DISCLOSURE','OFFER_TERMS','BUYER_SITUATION',
 'BUYER_PROBLEM','BUYER_IMPLICATION','BUYER_OUTCOME','PROGRESS_CONTEXT','SOLUTION_CAPABILITY',
 'EXPERIMENT_CONSTRAINTS','TECHNIQUE_DESCRIPTION','DELIVERY_DETAILS','PRIMARY_OUTCOME','STOPPING_RULE'];
const atom=(dimension,i,state='SYNTHETIC')=>({
 id:'fixture:atom-'+i,scope_id,subject_id,dimension,state,
 source_ref:'fixture:record-'+i,source_owner:'SYNTHETIC_LAB',source_version:'r1'});
const sample=()=>({...shared,world:'SYNTHETIC',intent:'AUDIT',
 atoms:factors.map((dim,i)=>atom(dim,i))});
const consent={consent:'EXPLICIT',purpose:'MUTUAL_VALUE',
 truthful_disclosure:true,decline_path:'CLEAR',sensitive_targeting:false,covert_targeting:false};
const choice=()=>({...shared,choice:{accept_steps:1,decline_steps:1,
 consent_default:'ACTIVE_OPT_IN',fee_disclosure:'BEFORE_COMMIT',
 scarcity_claim:'NONE',exit_reversible:true,truth_claim:'DOCUMENTED',
 evidence_refs:['fixture:ui-frame','fixture:offer-terms']}});
const experiment=()=>({...shared,protocol:{consent:'EXPLICIT',purpose:'USER_BENEFIT',
 assignment:'RANDOMIZED',experimental_unit:'fixture:person',
 variants:['baseline','candidate'],primary_outcome:'fixture:outcome',
 welfare_outcome:'fixture:informed-choice',harm_outcome:'fixture:friction',
 stopping_rule:'FIXED_HORIZON',multiplicity_plan:'SINGLE_COMPARISON',
 delivery_version:'v1',precommitment_ref:'fixture:analysis-plan',
 source_refs:['fixture:protocol','fixture:source-window']}});
test('new sourced overlay is separate from original registries and method execution',()=>{
 assert.equal(frontier.methods.length,16);
 assert.equal(frontier.identity_class,'NONCANONICAL_RESEARCH_OVERLAY');
 assert.equal(frontier.native_evaluator_count_unchanged,24);
 assert.equal(frontier.original_atlas_candidate_count_unchanged,239);
 assert.equal(frontier.canonical_promotion,false);
 assert.equal(behavioralMetaContract.native_evaluators_added,0);
 assert.equal(new Set(frontier.methods.map(x=>x.id)).size,16);
 for(const m of frontier.methods){
  assert.match(m.id,/^RH-V23-[0-9]{2}$/);
  assert.ok(m.source_urls.length>0);
  assert.ok(m.source_urls.every(x=>x.startsWith('https://')));
  assert.ok(m.falsifier.length>12);
  assert.equal(m.no_target_actions,true);
 }
});
test('explicit synthetic atoms route COM-B, Fogg, SPIN, nudge methods without executing them',()=>{
 const r=reviewBehavioralAtoms(sample());
 assert.equal(r.atom_count,factors.length);
 assert.equal(r.method_count,16);
 assert.equal(r.safety_gate.state,'LOCAL_AUDIT_ONLY');
 assert.ok(r.applicable_research_hooks>=4);
 for(const key of ['RH-V23-01','RH-V23-02','RH-V23-06','RH-V23-07','RH-V23-09']){
  assert.equal(r.recommendations.find(x=>x.id===key).state,'RESEARCH_APPLICABLE_NOT_EXECUTED');
 }
 assert.equal(r.source_authentication,false);
 assert.equal(r.inferred_psychological_traits,0);
 assert.equal(r.method_executions,0);
 assert.equal(r.canonical_promotion,false);
});
test('missing customer evidence stays acquisition not psychographic inference',()=>{
 const x=sample();x.atoms=x.atoms.filter(x=>x.dimension!=='BUYER_PROBLEM');
 const r=reviewBehavioralAtoms(x);
 const spin=r.recommendations.find(x=>x.id==='RH-V23-09');
 assert.equal(spin.state,'EVIDENCE_ACQUISITION_REQUIRED');
 assert.deepEqual(spin.missing_or_unverified,['BUYER_PROBLEM']);
 assert.equal(r.inferred_psychological_traits,0);
});
test('unknown, claimed and contradictory atoms preserve separate epistemic states',()=>{
 const x=sample(),i=x.atoms.findIndex(a=>a.dimension==='GOAL');
 x.atoms[i].state='UNKNOWN';
 let r=reviewBehavioralAtoms(x);
 assert.equal(r.recommendations.find(x=>x.id==='RH-V23-01').state,'EVIDENCE_ACQUISITION_REQUIRED');
 x.atoms[i].state='SYNTHETIC';
 x.atoms.push({...atom('GOAL',999),state:'UNKNOWN'});
 r=reviewBehavioralAtoms(x);
 assert.equal(r.dimensions.find(x=>x.dimension==='GOAL').state,'SUPPLIED_AS_PRESENT');
 const y={...shared,world:'RECORD',intent:'AUDIT',
  atoms:[atom('GOAL',1,'OBSERVED'),atom('GOAL',2,'CONTRADICTED'),atom('MOTIVATION',3,'CLAIMED')]};
 r=reviewBehavioralAtoms(y);
 assert.equal(r.dimensions.find(x=>x.dimension==='GOAL').state,'CONTESTED');
 assert.equal(r.dimensions.find(x=>x.dimension==='MOTIVATION').state,'CLAIMED_UNVERIFIED');
});
test('atom owner/scope/version/subject failures and unrequested raw psychological fields reject',()=>{
 const x=sample();x.atoms[0].subject_id='fixture:other';
 assert.throws(()=>reviewBehavioralAtoms(x),/INVALID_ATOM_PROVENANCE_OR_STATE/);
 const y=sample();y.atoms[0].source_version='';
 assert.throws(()=>reviewBehavioralAtoms(y),/INVALID_ATOM_PROVENANCE_OR_STATE/);
 const z=sample();z.atoms[0].personality_guess='high-conversion-target';
 assert.throws(()=>reviewBehavioralAtoms(z),/INVALID_ATOM_FIELDS/);
 const w=sample();w.world='RECORD';
 assert.throws(()=>reviewBehavioralAtoms(w),/SYNTHETIC_REAL_WORLD_MIX/);
});
test('intervention designs fail closed on no permission and covert targeting',()=>{
 const x=sample();x.intent='INTERVENTION_DESIGN';
 let r=reviewBehavioralAtoms(x);
 assert.equal(r.safety_gate.state,'INTERVENTION_DESIGN_BLOCKED');
 assert.equal(r.recommendations[0].state,'ETHICS_GATE_BLOCKED');
 const blockedChain=planBehavioralMethodInteractions(x);
 assert.equal(blockedChain.safety_gate.state,'INTERVENTION_DESIGN_BLOCKED');
 assert.ok(blockedChain.edges.every(e=>e.state==='ETHICS_GATE_BLOCKED'));
 assert.equal(blockedChain.candidate_pairs,0);
 x.safeguards={...consent,covert_targeting:true};
 r=reviewBehavioralAtoms(x);
 assert.ok(r.safety_gate.reasons.includes('COVERT_TARGETING_NOT_EXCLUDED'));
 x.safeguards={...consent,sensitive_targeting:true};
 r=reviewBehavioralAtoms(x);
 assert.ok(r.safety_gate.reasons.includes('SENSITIVE_TARGETING_NOT_EXCLUDED'));
 x.safeguards={...consent};
 r=reviewBehavioralAtoms(x);
 assert.equal(r.safety_gate.state,'DESIGN_RESEARCH_REVIEW_ONLY');
 assert.equal(r.method_executions,0);
});
test('methods-on-methods link needs to intervention function without promoting hypothesis to fact',()=>{
 const x=sample();
 const a=planBehavioralMethodInteractions(x),b=planBehavioralMethodInteractions(x);
 assert.deepEqual(a,b);
 const route=a.edges.find(e=>e.from==='RH-V23-01'&&e.to==='RH-V23-03');
 assert.equal(route.state,'RESEARCH_COMPOSITION_CANDIDATE');
 assert.deepEqual(route.via,['BARRIER_HYPOTHESIS']);
 assert.equal(route.output_status,'HYPOTHETICAL_UNEXECUTED');
 assert.equal(route.behavior_change_established,false);
 assert.equal(a.method_execution,'NOT_EXECUTED');
 assert.equal(a.linked_pairs,a.edges.length);
 assert.equal(a.considered_pairs,240);
});
test('missing upstream input removes method chain applicability',()=>{
 const x=sample();x.atoms=x.atoms.filter(a=>a.dimension!=='CAPABILITY');
 const out=planBehavioralMethodInteractions(x);
 const route=out.edges.find(e=>e.from==='RH-V23-01'&&e.to==='RH-V23-03');
 assert.equal(route.state,'NEEDS_SOURCE_ACQUISITION');
 assert.ok(route.missing_upstream.includes('CAPABILITY'));
});
test('choice audit identifies explicit asymmetric decline and hidden information as concerns, not legal findings',()=>{
 const x=choice();
 x.choice.decline_steps=5;
 x.choice.consent_default='PRESELECTED_ACCEPT';
 x.choice.fee_disclosure='AFTER_COMMIT';
 x.choice.scarcity_claim='UNSUPPORTED';
 x.choice.truth_claim='FALSE';
 x.choice.exit_reversible=false;
 const r=auditChoiceArchitecture(x);
 assert.equal(r.possible_dark_pattern_flags,6);
 assert.equal(r.state,'POTENTIAL_DARK_PATTERN_REVIEW');
 assert.equal(r.consumer_harm_proven,false);
 assert.equal(r.legal_violation_determined,false);
 assert.equal(r.choice_optimization_performed,false);
});
test('fair-looking layout still remains limited to supplied fields and unauthenticated source',()=>{
 const r=auditChoiceArchitecture(choice());
 assert.equal(r.state,'NO_LISTED_SIGNALS_IN_SUPPLIED_FIELDS');
 assert.equal(r.source_authenticated,false);
 const x=choice();x.choice.fee_disclosure='UNKNOWN';
 const q=auditChoiceArchitecture(x);
 assert.equal(q.state,'MORE_EVIDENCE_REQUIRED');
 assert.ok(q.flags.some(f=>f.id==='FEE_DISCLOSURE_UNKNOWN'));
});
test('choice audit rejects malformed inputs and duplicate native source records',()=>{
 const x=choice();x.choice.accept_steps=-1;
 assert.throws(()=>auditChoiceArchitecture(x),/INVALID_CHOICE_OBSERVATION/);
 const y=choice();y.choice.evidence_refs=['fixture:ui-frame','fixture:ui-frame'];
 assert.throws(()=>auditChoiceArchitecture(y),/INVALID_CHOICE_OBSERVATION/);
 const z=choice();z.choice.hidden_factor='poverty-targeting';
 assert.throws(()=>auditChoiceArchitecture(z),/INVALID_CHOICE_FIELDS/);
});
test('experiment protocol audit demands autonomy, welfare/harms and predeclared inference boundaries',()=>{
 const r=auditBehavioralExperimentProtocol(experiment());
 assert.equal(r.state,'PROTOCOL_STRUCTURE_READY_FOR_HUMAN_REVIEW');
 assert.equal(r.tests_executed,0);
 assert.equal(r.causal_effect_estimated,false);
 assert.equal(r.preregistration_authenticated,false);
 assert.equal(r.human_approval_required,true);
});
test('missing welfare/harms, weak stopping, non-random assignment and multiplicity trigger separate gaps',()=>{
 const x=experiment();
 x.protocol.variants=['a','b','c'];
 x.protocol.assignment='OBSERVATIONAL';
 x.protocol.stopping_rule='PEEK_AND_STOP';
 x.protocol.multiplicity_plan='MISSING';
 x.protocol.consent='UNKNOWN';
 x.protocol.harm_outcome='';
 const r=auditBehavioralExperimentProtocol(x);
 assert.equal(r.state,'PROTOCOL_GAPS_REQUIRE_REVIEW');
 for(const code of ['MISSING_HARM_OUTCOME','CONSENT_NOT_EXPLICIT','CAUSAL_RANDOM_ASSIGNMENT_NOT_DECLARED',
  'OPTIONAL_STOPPING_CONTROL_ABSENT','MULTIPLE_COMPARISON_PLAN_MISSING'])
  assert.ok(r.issues.includes(code),code);
});
test('protocol and source context cannot be hijacked with unmodeled extra fields',()=>{
 const x=experiment();
 x.protocol.secret_inference='sensitive-data';
 assert.throws(()=>auditBehavioralExperimentProtocol(x),/INVALID_EXPERIMENT_PROTOCOL_FIELDS/);
 const y=experiment();y.source_commit='not-a-commit';
 assert.throws(()=>auditBehavioralExperimentProtocol(y),/INVALID_BEHAVIORAL_SOURCE_CONTEXT/);
});
test('V22 combinatorial method used, auditable and not a sales-effect experiment',()=>{
 const p={source_commit,scope_id,max_cases:24,factors:[
  {name:'GOAL',values:['STATED','UNKNOWN']},
  {name:'DISCLOSURE',values:['EARLY','LATE']},
  {name:'DECLINE',values:['SIMPLE','FRICTION']},
  {name:'PROMPT',values:['TIMELY','MISTIMED']},
  {name:'SALES_DISCOVERY',values:['NEEDS_FIRST','PUSH_FIRST']}
 ]};
 const r=planBehavioralInteractionControls(p);
 assert.equal(r.design.exhaustive_worlds,32);
 assert.equal(r.design.total_pairs,40);
 assert.equal(r.design.covered_pairs,40);
 assert.equal(r.independent_design_audit.state,'DESIGN_REPLAY_CONSISTENT');
 assert.equal(r.tests_executed,0);
 assert.equal(r.clinical_or_sales_effectiveness_proven,false);
});
test('V22 pair-budget stays bounded and reports incomplete fixture plans',()=>{
 const p={source_commit,scope_id,max_cases:1,factors:[
  {name:'FRAMING',values:['NEUTRAL','GAIN']},
  {name:'DEFAULT',values:['NONE','PRESELECTED']},
  {name:'TIMING',values:['EARLY','LATE']}
 ]};
 const r=planBehavioralInteractionControls(p);
 assert.equal(r.design.state,'BOUNDED_INCOMPLETE_TEST_DESIGN');
 assert.ok(r.design.missing_pairs.length>0);
 assert.equal(r.independent_design_audit.state,'DESIGN_REPLAY_CONSISTENT');
});
