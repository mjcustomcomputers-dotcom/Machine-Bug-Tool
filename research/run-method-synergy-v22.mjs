#!/usr/bin/env node
// Deterministic source-bound synthetic demonstration; no provider/network/target actions.
import research from './method-synergy-frontier-v22.json' with {type:'json'};
import {proposeMethodSynergies,planMethodInteractionCoverage,auditMethodInteractionCoverage} from '../lib/method-synergy-v22.mjs';
const source_commit=research.baseline_git_commit,scope_id='synthetic:method-frontier';
const observedTypes=['SOURCE_GRAPH','DERIVATION_RULES','CLAIM_DEPENDENCIES','COMPONENT_MODEL',
  'OBSERVED_CONTRADICTION','FACTOR_DOMAINS','ORACLE_RESULTS'];
const observations=observedTypes.map(type=>({type,scope_id,source_ref:'fixture:'+type.toLowerCase(),state:'SYNTHETIC'}));
const compositions=proposeMethodSynergies({source_commit,scope_id,hooks:research.hooks,observations});
const factorInputs={source_commit,scope_id,max_cases:24,factors:[
  {name:'SOURCE_VERSION',values:['FRESH','STALE']},
  {name:'ORACLE_STATE',values:['AVAILABLE','UNKNOWN']},
  {name:'EVENT_CLOCK',values:['COMPARABLE','MISALIGNED']},
  {name:'METHOD_ORDER',values:['AB','BA']},
  {name:'EVIDENCE_LINEAGE',values:['DISTINCT','SHARED']}
]};
const design=planMethodInteractionCoverage(factorInputs);
const audit=auditMethodInteractionCoverage(factorInputs,design);
console.log(JSON.stringify({kind:'MPC_V22_METHODS_ON_METHODS_SYNTHETIC_PASS',
  baseline_source_commit:source_commit,frontier_research_hooks:research.hooks.length,
  matching_pairs:compositions.matching_dependency_pairs,ready_composition_candidates:compositions.candidates,
  pair_states:compositions.pairs.map(({from,to,state})=>({from,to,state})),
  test_design:{worlds:design.exhaustive_worlds,cases:design.cases.length,pairs:design.total_pairs,
   covered:design.covered_pairs,complete:design.complete_design,state:design.state},
  independent_design_audit:audit.state,method_execution:'NOT_EXECUTED',target_actions:false,
  native_evaluator_registry_unchanged:true,canonical_promotion:false},null,2));
