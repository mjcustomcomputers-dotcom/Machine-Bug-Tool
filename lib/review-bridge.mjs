import {outputContract} from './research.mjs';
import overlay from './method-overlay.json' with {type:'json'};
import {routeLegacySweep} from './universal-router.mjs';
export const reviewBridge=Object.freeze({
 version:'UMTB-4.0',mode:'SUPPLIED_EVIDENCE_REVIEW_ONLY',
 correspondence:[
  {workflow:'actor / authority_owner',legal:'actor / capacity / source owner',rule:'Do not substitute possession, permission, ownership, or capacity for one another.'},
  {workflow:'object_id / state_before / state_after',legal:'exact subject / procedural state / native record',rule:'Bind each state claim to the same subject, source version and quoted span.'},
  {workflow:'invariant / feedback',legal:'governing authority / evidence of application',rule:'Distinguish the stated rule from evidence that it was applied.'},
  {workflow:'value_object / timing_context',legal:'quantity / causation / finality',rule:'Separate displayed amounts, pending events and final authoritative outcomes.'}
 ],
 review_lenses:[
  {id:'information',question:'What did each actor know at the recorded time, and which source establishes it?'},
  {id:'stages',question:'Which recorded stage makes the outcome final, and which later stages remain unresolved?'},
  {id:'conservation',question:'Do quantities reconcile using consistent units and the same object and time window?'},
  {id:'hidden_state',question:'Is controller or accumulator state evidenced, inferred, or unknown?'},
  {id:'deferred_causation',question:'Could an earlier queued event explain the observed result? Preserve competing explanations.'},
  {id:'first_divergence',question:'Where do two supplied records first differ after identity and version are aligned?'},
  {id:'state_owner',question:'Which native authority owns the state being asserted?'},
  {id:'falsifier',question:'What supplied evidence would defeat the proposition?'}
 ],
 execution:'Review questions only; no game-theory solver, legal conclusion, exploit generation, or external testing.',
 continuation:{workflow_objects_per_call:1,priority_checks_max:48,classifier_ids_per_lookup:24,maxvar_ids_per_lookup:12,dependency_batch_max:3,parallel_calls_recommended:1,automatic_retries:0},
 evidence:'Use get_universal_contract, then validate_evidence_packet to check exact versions, subject references, spans and dependencies. Structural PASS does not establish truth or legal applicability.',
 canonical_promotion:false,court_release_allowed:false,external_action_authorized:false
});
export async function businessLogicSweep(args){return {...await routeLegacySweep(args),review_bridge:reviewBridge,recovered_registry:{id:'MBSS-1.0',branches:64,classifiers:512,lookup_tool:'get_research_registry',cross_reference_tool:'cross_reference_methods',status:'SEPARATE_RECOVERED_REVIEW_REGISTRY',automatically_evaluated:false},normal_answer_contract:outputContract,method_overlay:{overlay_id:overlay.overlay_id,source_sha256:overlay.source_sha256,status:overlay.status,branches:overlay.branches,limits:overlay.limits},method_execution:{status:'NOT_EXECUTED_BY_SWEEP',next_tool:'get_method_catalog',evaluation_tool:'evaluate_method',requires_explicit_model:true}}}
