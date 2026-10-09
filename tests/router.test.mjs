import test from 'node:test';import assert from 'node:assert/strict';
import {callTool} from '../lib/tools.mjs';
import {routeProblem} from '../lib/universal-router.mjs';
import atomicFixture from './fixtures/atomic-owner-variation.json' with {type:'json'};
const base=()=>({problem:'Same advertised booking product differs between country surfaces; price flow access before',object_id:'booking',unit_of_analysis:'two supplied representations',domain_profile:'BUSINESS',sources:[{id:'s1',owner:'fixture',type:'SYNTHETIC',version:'1',time:'2026-10-07',native_locator:'fixture:1'}],structures:[{id:'rep',type:'REPRESENTATION',subject_ids:['booking'],source_refs:['s1']}],questions:[{id:'q1',kind:'IDENTITY',invariant:'Are these representations the same object?',structure_ids:['rep'],rule_source_refs:['s1'],necessity:'REQUIRED',applicability:'APPLIES',lenses:[]}]});
test('Typed identity selects two branches/two children; keywords do not activate money or replay',async()=>{const r=await routeProblem(base());assert.deepEqual(r.required_branches,['BL10','BL11']);assert.equal(r.selected_classifier_ids.length,2);assert.ok(r.dormant_branches.includes('BL29'));assert.ok(r.dormant_branches.includes('BL15'));assert.equal(r.classifiers_accounted,384);assert.equal(r.coverage_is_applicability,false);assert.equal(r.method_execution_performed,false);assert.equal(r.selected_methods.length,1);assert.ok(r.selected_methods[0].inverse_method)});
test('No typed records yields no activations',async()=>{const b=base();delete b.structures;const r=await routeProblem(b);assert.deepEqual(r.blocked_branches,['BL10','BL11']);assert.equal(r.selected_classifier_ids.length,0)});
test('Unsupported child lens stays blocked even with a source reference',async()=>{const b=base();b.questions[0].lenses=[{lens:'DUPLICATE_OR_REPLAY',source_refs:['s1']}];const r=await routeProblem(b);assert.equal(r.selected_classifier_ids.length,2);assert.equal(r.blocked_classifier_ids.length,2)});
test('Six states partition canonical branches and children',async()=>{const b=base();b.questions.push({...b.questions[0],id:'q2',kind:'MONEY',applicability:'UNKNOWN'},{...b.questions[0],id:'q3',kind:'REPLAY',applicability:'NOT_APPLICABLE'});const r=await routeProblem(b);for(const suffix of ['branches','classifier_ids']){const ids=['required','active','watch','blocked','dormant','not_applicable'].flatMap(x=>r[x+'_'+suffix]);assert.equal(new Set(ids).size,suffix==='branches'?32:384)}});
test('Unknown references and missing finality owner reject',async()=>{const b=base();b.sources=[];await assert.rejects(()=>routeProblem(b),/UNRESOLVED/);await assert.rejects(()=>routeProblem({...base(),finality_state:'FINALIZED'}),/FINALITY_OWNER/)});
test('Source locator changes receipt hash, no authentication claimed',async()=>{const b=base(),a=await routeProblem(b);b.sources[0].native_locator='fixture:2';const r=await routeProblem(b);assert.notEqual(a.input_fingerprint,r.input_fingerprint);assert.equal(r.source_refs_authenticated,false)});
test('Discovery by function finds fault tree with explicit unimplemented inverse',async()=>{const r=await callTool('get_method_ark',{function_query:'starts from observed bad outcome and reasons backward through necessary causes'});assert.equal(r.methods[0].method_id,'fault_tree');assert.equal(r.methods[0].inversion_pair.implementation_state,'REVIEW_METADATA_ONLY')});
test('Existing connector context routes through UMTB4 without automatic model execution',async()=>{const b=base();const r=await callTool('business_logic_sweep',{namespace:'fixture',object_id:b.object_id,actor:'reviewer',action:'compare',state_before:'unknown',state_after:'unknown',channel:'records',invariant:b.problem,context:'UMTB4:'+JSON.stringify(b)});assert.equal(r.selected_classifier_ids.length,2);assert.equal(r.universal_router_version,'UMTB-4.0');assert.equal(r.method_execution_performed,false)});
test('Renderer keeps claim states, context high, exact headline in body',async()=>{const claims=[{id:'a',text:'The supplied descriptions differ.',role:'MAIN',epistemic_state:'INFERRED',finality_state:'NONE',finality_owner:null,source_refs:[]},{id:'b',text:'Different regional configurations remain possible.',role:'CONTEXT',epistemic_state:'INFERRED',finality_state:'NONE',finality_owner:null,source_refs:[]}];const r=await callTool('render_output',{format:'EXPLAINER',audience:'general',claims,headline_claim_id:'a',lead_claim_id:'a'});assert.deepEqual(r.claims,claims);assert.deepEqual(r.ordered_claim_ids,['a','b']);assert.equal(r.factual_validation,false);await assert.rejects(()=>callTool('render_output',{format:'EXPLAINER',audience:'general',claims,headline_claim_id:'invented',lead_claim_id:'a'}),/UNRESOLVED/)});
test('Model inputs are not fabricated and invalid mathematical inputs reject',async()=>{const r=await routeProblem(base());assert.equal(r.selected_methods[0].input_readiness,'BLOCKED_MISSING_MODEL');await assert.rejects(()=>routeProblem({...base(),models:[{method:'nash',input:{}}]}))});

test('Compatibility frame exposes DNA and renderer through existing sweep',async()=>{const b=base();b.method_lookup={method_id:'identity_graph'};b.presentation={format:'EXPLAINER',audience:'general',headline_claim_id:'a',lead_claim_id:'a',claims:[{id:'a',text:'Identity remains unresolved.',role:'MAIN',epistemic_state:'INFERRED',finality_state:'NONE',finality_owner:null,source_refs:[]}]};const r=await callTool('business_logic_sweep',{namespace:'fixture',object_id:b.object_id,actor:'reviewer',action:'compare',state_before:'unknown',state_after:'unknown',channel:'records',invariant:b.problem,context:'UMTB4:'+JSON.stringify(b)});assert.equal(r.method_dna.methods[0].method_id,'identity_graph');assert.equal(r.rendered_output.status,'EVIDENCE_PRESERVING_RENDER');assert.equal(r.work_stage,'EVIDENCE_ACQUISITION');assert.equal(r.next_action.source_ref,'s1');assert.equal(r.next_step,r.next_action.description)});

const priorityFrame=()=>{
 const frame=base(),rows=[
  ['CONFIG','CONFIGURATION','CONFIGURATION'],['ALTERNATIVES','ALTERNATIVES','HYPOTHESES'],
  ['PRECONDITION','CONTROL_PRECONDITION','CONTROL_ACTION'],['ORDER','ORDER','EVENT_TRACE'],
  ['OWNER','SOURCE_AUTHORITY','SOURCE_RECORD']
 ];
 frame.structures=rows.map(([id,,type])=>({id,type,subject_ids:[frame.object_id],source_refs:['s1']}));
 frame.questions=rows.map(([id,kind],i)=>({id,kind,invariant:'Synthetic invariant '+id,structure_ids:[id],rule_source_refs:['s1'],necessity:i===4?'REQUIRED':'OPTIONAL',applicability:i===4?'APPLIES':'UNKNOWN',lenses:[]}));
 frame.models=[{method:'identity',input:structuredClone(atomicFixture.models[0].input)}];
 return frame;
};
function* permutations(items){
 if(!items.length){yield [];return}
 for(let i=0;i<items.length;i++)for(const rest of permutations(items.filter((_,n)=>n!==i)))yield [items[i],...rest];
}
test('A required supplied model is retained under the selection cap for every order of the same questions',async()=>{
 const input=priorityFrame(),original=structuredClone(input),reference=await routeProblem(input);
 assert.equal(reference.selected_methods[0].method,'identity');
 assert.equal(reference.selected_methods[0].routing_state,'REQUIRED');
 assert.equal(reference.selected_methods[0].input_readiness,'SCHEMA_VALID_CALLER_MODEL');
 assert.equal(reference.method_candidates.length,5);assert.equal(reference.selected_methods.length,4);assert.equal(reference.remaining_method_count,1);
 assert.equal(reference.method_selection_implementation_revision,'UMTB4-PRIORITY-1');
 for(const questions of permutations(input.questions)){
  const result=await routeProblem({...input,questions});
  assert.deepEqual(result.selected_methods,reference.selected_methods);
  assert.deepEqual(result.method_candidates,reference.method_candidates);
  assert.deepEqual(result.required_classifier_ids,reference.required_classifier_ids);
  assert.equal(result.method_execution_performed,false);assert.equal(result.classifiers_accounted,384);
 }
 assert.deepEqual(input,original);
});
test('Readiness breaks equal required priority without treating schema validation as execution',async()=>{
 const input=priorityFrame();input.questions=input.questions.filter(q=>['ALTERNATIVES','OWNER'].includes(q.id));
 for(const question of input.questions){question.necessity='REQUIRED';question.applicability='APPLIES'}
 const result=await routeProblem(input);
 assert.deepEqual(result.selected_methods.map(m=>m.method),['identity','ach']);
 assert.ok(result.selected_methods.every(m=>m.routing_state==='REQUIRED'));
 assert.equal(result.selected_methods[1].input_readiness,'BLOCKED_MISSING_MODEL');
 assert.equal(result.method_execution_performed,false);assert.equal(result.atomic_review,null);
});
test('A missing required model remains ahead of ready optional work',async()=>{
 const input=priorityFrame();input.questions=input.questions.filter(q=>['ALTERNATIVES','OWNER'].includes(q.id));
 const required=input.questions.find(q=>q.id==='ALTERNATIVES');required.necessity='REQUIRED';required.applicability='APPLIES';
 input.questions.find(q=>q.id==='OWNER').necessity='OPTIONAL';
 const result=await routeProblem(input);
 assert.deepEqual(result.selected_methods.map(m=>[m.method,m.routing_state,m.input_readiness]),[
  ['ach','REQUIRED','BLOCKED_MISSING_MODEL'],['identity','ACTIVE','SCHEMA_VALID_CALLER_MODEL']
 ]);
});
test('Shared-method priority merges question states and retains stable question identities',async()=>{
 const input=priorityFrame();input.questions=input.questions.filter(q=>['CONFIG','OWNER'].includes(q.id));
 input.structures.push({id:'COMPARE',type:'COMPARISON',subject_ids:[input.object_id],source_refs:['s1']});
 input.questions.push({...input.questions[0],id:'A-REQUIRED-COMPARE',kind:'COMPARISON',structure_ids:['COMPARE'],necessity:'REQUIRED',applicability:'APPLIES'});
 const first=await routeProblem(input),second=await routeProblem({...input,questions:input.questions.toReversed()});
 assert.deepEqual(first.method_candidates,second.method_candidates);
 const method=first.method_candidates.find(m=>m.method==='metamorphic');
 assert.equal(method.routing_state,'REQUIRED');assert.deepEqual(method.question_ids,['A-REQUIRED-COMPARE','CONFIG']);
 assert.equal(first.selected_methods[0].method,'identity');
});
