import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fixture from './fixtures/atomic-owner-variation.json' with {type:'json'};
import {routeProblem} from '../lib/universal-router.mjs';
import {callTool} from '../lib/tools.mjs';

const sourceText=await readFile(new URL('../lib/review-bridge.mjs',import.meta.url),'utf8');
const source={id:'BRIDGE',owner:'MPC repository',type:'SOURCE_CODE',version:'fixture-revision-1',time:'2026-10-09',native_locator:'repository:lib/review-bridge.mjs'};
const target={claim:'The bridge distinguishes explicit atomic execution from a planned model.',source_refs:['BRIDGE'],expected_support:'The returned execution summary uses the actual nested atomic receipt.',expected_counterevidence:'The summary reports no execution for a receipt with executed supplied models.'};
const record=()=>({source_ref:'BRIDGE',version:source.version,content:sourceText});
const base=()=>({
 problem:'Determine how the bridge reports supplied-model execution.',object_id:fixture.object_id,unit_of_analysis:'the bridge execution summary',domain_profile:'GENERAL',
 sources:[structuredClone(source)],structures:[{id:'SOURCE',type:'SOURCE_RECORD',subject_ids:[fixture.object_id],source_refs:['BRIDGE']}],
 questions:[{id:'BRIDGE-QUESTION',kind:'SOURCE_AUTHORITY',invariant:'Determine whether the bridge uses the model execution receipt.',structure_ids:['SOURCE'],rule_source_refs:['BRIDGE'],necessity:'REQUIRED',applicability:'APPLIES',lenses:[]}],
 workflow:{requested_phase:'AUTO'}
});
const withContent=()=>({...base(),workflow:{requested_phase:'AUTO',records:[record()]}});
const withAtomic=frame=>({...frame,atomic_review:structuredClone(fixture)});
const legacy=frame=>({namespace:'SYNTHETIC',object_id:frame.object_id,actor:'fixture-author',action:'acquire the record and analyze the supplied model',state_before:'record pointer',state_after:'record content',channel:'offline',invariant:frame.problem,context:'UMTB4:'+JSON.stringify(frame)});

test('A source pointer produces a concrete acquisition action with an exact completion condition',async()=>{
 const result=await routeProblem(base());
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');
 assert.equal(result.workflow.acquired_record_count,0);assert.equal(result.workflow.remaining_record_count,1);
 assert.deepEqual([result.next_action.source_ref,result.next_action.owner,result.next_action.native_locator,result.next_action.version],['BRIDGE',source.owner,source.native_locator,source.version]);
 assert.equal(result.next_action.kind,'ACQUIRE_RECORD');
 assert.match(result.next_action.target_fact,/bridge uses the model execution receipt/);
 assert.match(result.next_action.completion_condition,/content of BRIDGE at version fixture-revision-1/);
 assert.equal(result.next_action.ready_call,undefined);
 assert.equal(result.next_step,result.next_action.description);
});

test('Missing, empty and stale record content remain acquisition work',async()=>{
 for(const content of [undefined,'','   ']){
  const input=base();input.workflow.records=[{source_ref:'BRIDGE',version:source.version,...(content===undefined?{}:{content})}];
  const result=await routeProblem(input);assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.workflow.acquired_record_count,0);
 }
 const input=withContent();input.workflow.records[0].version='earlier-revision';
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');
 assert.equal(result.workflow.source_records[0].state,'CURRENT_VERSION_REQUIRED');
 assert.deepEqual(result.workflow.source_records[0].available_other_versions,['earlier-revision']);
 assert.equal(result.next_action.version,source.version);
});

test('Actual supplied text advances acquisition to analysis and model formulation',async()=>{
 const input=withContent(),result=await routeProblem(input);
 assert.equal(result.work_stage,'ANALYSIS');assert.equal(result.workflow.acquired_record_count,1);assert.equal(result.workflow.remaining_record_count,0);
 assert.equal(result.next_action.kind,'FORMULATE_MODEL');assert.equal(result.next_action.method,'identity');
 assert.deepEqual(result.next_action.required_model_fields,['left','right']);
 assert.equal(result.workflow.source_records[0].content_excerpt,sourceText.slice(0,600));
 assert.match(result.workflow.source_records[0].content_fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(result.source_refs_authenticated,false);
});

test('Verification starts with a specific claim, source content and both outcome conditions',async()=>{
 const input=withContent();input.workflow.verification_target=structuredClone(target);
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'VERIFICATION');assert.equal(result.next_action.kind,'VERIFY_CLAIM');
 assert.equal(result.next_action.target_fact,target.claim);
 assert.equal(result.next_action.expected_support,target.expected_support);
 assert.equal(result.next_action.expected_counterevidence,target.expected_counterevidence);
 assert.equal(result.workflow.acquired_record_count,1);
 input.workflow.requested_phase='ANALYSIS';
 assert.equal((await routeProblem(input)).work_stage,'ANALYSIS');
});

test('An underspecified verification request stays in analysis with the missing target fields',async()=>{
 const input=withContent();input.workflow.requested_phase='VERIFICATION';
 let result=await routeProblem(input);
 assert.equal(result.work_stage,'ANALYSIS');assert.equal(result.next_action.kind,'FORMULATE_VERIFICATION_TARGET');
 assert.deepEqual(result.next_action.missing_fields,['claim','source_refs','expected_support','expected_counterevidence']);
 input.workflow.verification_target={claim:target.claim};result=await routeProblem(input);
 assert.deepEqual(result.next_action.missing_fields,['source_refs','expected_support','expected_counterevidence']);
});

test('Explicit acquisition defers supplied atomic execution while retaining ready models and the original request',async()=>{
 const input=withAtomic(base());input.workflow.requested_phase='EVIDENCE_ACQUISITION';
 const original=structuredClone(input),result=await routeProblem(input);
 assert.deepEqual(input,original);
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.method_execution_performed,false);
 assert.equal(result.atomic_review.explicit_model_evaluations,0);
 assert.equal(result.atomic_review.baseline.model_results[0].execution,'SCHEMA_VALID_NOT_EXECUTED');
 assert.deepEqual(result.workflow.model_execution,{requested_mode:'EXECUTE_SUPPLIED_MODELS',effective_mode:'PLAN',deferred:true,explicit_model_evaluations:0,ready_models:[{model_id:'IDENTITY-MODEL',method:'identity',state:'READY_AFTER_EVIDENCE_ACQUISITION'}]});
 assert.equal(result.atomic_review.baseline.invariant_checks[0].state,'UNKNOWN');
 const planned=await callTool('review_atomic_variants',{...structuredClone(fixture),mode:'PLAN'});
 assert.deepEqual(result.atomic_review,planned);
});

test('Acquisition completion leads to analysis on the same records and preserved atomic request',async()=>{
 const input=withAtomic(withContent());input.workflow.requested_phase='EVIDENCE_ACQUISITION';
 let result=await routeProblem(input);
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.next_action.kind,'BEGIN_ANALYSIS');
 assert.equal(result.workflow.remaining_record_count,0);assert.equal(result.atomic_review.explicit_model_evaluations,0);
 input.workflow.requested_phase='ANALYSIS';result=await routeProblem(input);
 assert.equal(result.work_stage,'ANALYSIS');assert.equal(result.workflow.model_execution.deferred,false);
 assert.equal(result.atomic_review.explicit_model_evaluations,2);assert.equal(result.next_action.kind,'INTERPRET_MODEL_RESULTS');
});

test('Verification source gaps and AUTO source gaps defer model execution',async()=>{
 for(const requested_phase of ['AUTO','VERIFICATION']){
  const input=withAtomic(base());input.workflow={requested_phase,verification_target:structuredClone(target)};
  const result=await routeProblem(input);
  assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.workflow.model_execution.effective_mode,'PLAN');
  assert.equal(result.atomic_review.explicit_model_evaluations,0);assert.equal(result.next_action.source_ref,'BRIDGE');
 }
});

test('Legacy explicit supplied-model execution remains analysis without a fictional acquisition requirement',async()=>{
 const input=withAtomic(base());delete input.workflow;
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'ANALYSIS');assert.equal(result.workflow.analysis_basis,'EXPLICIT_SUPPLIED_MODELS');
 assert.equal(result.workflow.required_record_count,0);assert.equal(result.workflow.remaining_record_count,0);
 assert.equal(result.atomic_review.explicit_model_evaluations,2);
 assert.equal(result.next_action.kind,'INTERPRET_MODEL_RESULTS');
 assert.match(result.fact_summary.at(-1),/Executed 2 supplied-model evaluations/);
});

test('Compatibility bridge leads with acquisition and accurately reports deferred execution',async()=>{
 const input=withAtomic(base());input.workflow.requested_phase='EVIDENCE_ACQUISITION';
 const result=await callTool('business_logic_sweep',legacy(input));
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.next_action.source_ref,'BRIDGE');
 assert.equal(result.method_execution.status,'MODELS_READY_AFTER_EVIDENCE_ACQUISITION');
 assert.equal(result.method_execution.next_tool,null);
 assert.equal(result.method_execution.explicit_model_evaluations,0);assert.equal(result.method_execution.successful_model_receipts,0);
 assert.equal(result.method_execution.requested_mode,'EXECUTE_SUPPLIED_MODELS');assert.equal(result.method_execution.effective_mode,'PLAN');
 assert.equal(result.method_execution.deferred,true);
});

test('The current claim uses its own sources instead of waiting for unrelated watch records',async()=>{
 const input=withContent();input.workflow.verification_target=structuredClone(target);
 input.sources.push({...source,id:'UNRELATED',native_locator:'repository:unrelated-record'});
 input.structures.push({id:'OTHER',type:'HYPOTHESES',subject_ids:[input.object_id],source_refs:['UNRELATED']});
 input.questions.push({...input.questions[0],id:'OPTIONAL-WATCH',kind:'ALTERNATIVES',structure_ids:['OTHER'],rule_source_refs:['UNRELATED'],necessity:'OPTIONAL',applicability:'UNKNOWN'});
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'VERIFICATION');assert.equal(result.workflow.required_record_count,1);
 assert.equal(result.workflow.source_records[0].source_ref,'BRIDGE');
});

test('Changed source versions reopen acquisition; changed content has a different evidence fingerprint',async()=>{
 const input=withContent(),first=await routeProblem(input);
 input.workflow.records[0].content+='\nChanged supplied content.\n';
 const changed=await routeProblem(input);assert.notEqual(first.workflow.evidence_fingerprint,changed.workflow.evidence_fingerprint);
 input.sources[0].version='fixture-revision-2';
 const next=await routeProblem(input);
 assert.equal(next.work_stage,'EVIDENCE_ACQUISITION');assert.equal(next.next_action.version,'fixture-revision-2');
 assert.equal(next.workflow.acquired_record_count,0);
});

test('Record identity must resolve to one declared source and version',async()=>{
 let input=withContent();input.workflow.records[0].source_ref='UNDECLARED';
 await assert.rejects(()=>routeProblem(input),/WORKFLOW_RECORD_SOURCE_NOT_DECLARED/);
 input=withContent();input.workflow.records.push(structuredClone(input.workflow.records[0]));
 await assert.rejects(()=>routeProblem(input),/DUPLICATE_WORKFLOW_SOURCE_VERSION/);
 input=withContent();input.workflow.verification_target={...target,source_refs:['UNLOCATED']};
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.next_action.kind,'LOCATE_RECORD');
 assert.equal(result.next_action.source_ref,'UNLOCATED');assert.equal(result.next_action.native_locator,null);
});

test('An unframed task begins with locating the fact-bearing record',async()=>{
 const input={problem:'Find the source of the reported state change.',object_id:'source-discovery',unit_of_analysis:'one state change',domain_profile:'GENERAL',workflow:{requested_phase:'AUTO'}};
 const result=await routeProblem(input);
 assert.equal(result.work_stage,'EVIDENCE_ACQUISITION');assert.equal(result.next_action.kind,'LOCATE_RECORD');
 assert.equal(result.next_action.target_fact,input.problem);assert.equal(result.workflow.remaining_record_count,1);
 assert.equal(result.next_action.owner,null);assert.equal(result.next_action.ready_call,undefined);
});
