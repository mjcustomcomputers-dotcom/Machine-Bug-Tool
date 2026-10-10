#!/usr/bin/env node
// Source-bounded synthetic methodology demonstration; does not contact anyone.
import {reviewBehavioralAtoms,planBehavioralEvidenceAcquisition,
 planBehavioralMethodInteractions,auditChoiceArchitecture,
 auditBehavioralExperimentProtocol,planBehavioralInteractionControls} from '../lib/behavioral-meta-methods-v23.mjs';
const source_commit='fa36798a6c61bd8953a0d77e2eea202b82f8ea77';
const scope_id='fixture:gold-method',subject_id='fixture:buyer-customer';
const ctx={source_commit,scope_id,subject_id};
const kinds=['GOAL','CAPABILITY','OPPORTUNITY','MOTIVATION','ABILITY','PROMPT',
 'POLICY_CONSTRAINTS','USER_JOURNEY','CHOICE_INTERFACE','EXIT_PATH','DISCLOSURE',
 'OFFER_TERMS','BUYER_SITUATION','BUYER_PROBLEM','BUYER_IMPLICATION',
 'BUYER_OUTCOME','PROGRESS_CONTEXT','SOLUTION_CAPABILITY','EXPERIMENT_CONSTRAINTS',
 'TECHNIQUE_DESCRIPTION','DELIVERY_DETAILS','PRIMARY_OUTCOME','STOPPING_RULE'];
const atoms=kinds.map((dimension,i)=>({id:'atom:'+i,...{scope_id,subject_id},
 dimension,state:'SYNTHETIC',source_ref:'fixture:observation-'+i,
 source_owner:'MPC_SYNTHETIC_LAB',source_version:'r1'}));
const input={...ctx,world:'SYNTHETIC',intent:'AUDIT',atoms};
const r=reviewBehavioralAtoms(input);
const p=planBehavioralEvidenceAcquisition(input);
const m=planBehavioralMethodInteractions(input);
const q=auditChoiceArchitecture({...ctx,choice:{accept_steps:1,decline_steps:5,
 consent_default:'PRESELECTED_ACCEPT',fee_disclosure:'AFTER_COMMIT',
 scarcity_claim:'UNSUPPORTED',exit_reversible:false,truth_claim:'UNVERIFIED',
 evidence_refs:['fixture:ui','fixture:terms']}});
const protocol=auditBehavioralExperimentProtocol({...ctx,protocol:{consent:'EXPLICIT',purpose:'MUTUAL_VALUE',
 assignment:'RANDOMIZED',experimental_unit:'fixture:session',variants:['base','candidate'],
 primary_outcome:'fixture:customer-comprehension',welfare_outcome:'fixture:informed-choice',
 harm_outcome:'fixture:unwanted-signups',stopping_rule:'FIXED_HORIZON',
 multiplicity_plan:'SINGLE_COMPARISON',delivery_version:'v1',
 precommitment_ref:'fixture:analysis-plan',source_refs:['fixture:trial-plan']}});
const factorial=planBehavioralInteractionControls({source_commit,scope_id,max_cases:24,factors:[
 {name:'DISCLOSURE',values:['EARLY','LATE']},
 {name:'CHOICE_DEFAULT',values:['OPT_IN','PRESELECT']},
 {name:'DECLINE',values:['SIMPLE','FRICTION']},
 {name:'NEEDS_INQUIRY',values:['DISCOVER','PUSH']},
 {name:'PROMPT_TIMING',values:['TIMELY','LATE']}
]});
console.log(JSON.stringify({
 kind:'MPC_V23_SYNTHETIC_BEHAVIORAL_METHOD_SCIENCE_PASS',
 source_commit,hook_contracts:r.method_count,atoms:r.atom_count,
 research_applicable_hooks:r.applicable_research_hooks,
 method_links:m.linked_pairs,ready_method_compositions:m.candidate_pairs,
 primary_record_targets:p.candidate_primary_records.length,
 unexecuted_method_output_types:p.unexecuted_method_output_types.length,
 choice_audit_state:q.state,potential_dark_pattern_signals:q.possible_dark_pattern_flags,
 protocol_review_state:protocol.state,
 factorial_design:{worlds:factorial.design.exhaustive_worlds,
  proposed_cases:factorial.design.cases.length,
  required_two_way_pairs:factorial.design.total_pairs,
  planned_pair_coverage:factorial.design.covered_pairs,
  independent_design_replay:factorial.independent_design_audit.state},
 methods_executed:0,target_actions:false,psychological_traits_inferred:0,
 effect_sizes_estimated:0,canonical_promotion:false
},null,2));
