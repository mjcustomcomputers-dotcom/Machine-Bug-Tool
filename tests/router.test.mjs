import test from 'node:test';import assert from 'node:assert/strict';
import {callTool} from '../lib/tools.mjs';
import {routeProblem} from '../lib/universal-router.mjs';
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

test('Compatibility frame exposes DNA and renderer through existing sweep',async()=>{const b=base();b.method_lookup={method_id:'identity_graph'};b.presentation={format:'EXPLAINER',audience:'general',headline_claim_id:'a',lead_claim_id:'a',claims:[{id:'a',text:'Identity remains unresolved.',role:'MAIN',epistemic_state:'INFERRED',finality_state:'NONE',finality_owner:null,source_refs:[]}]};const r=await callTool('business_logic_sweep',{namespace:'fixture',object_id:b.object_id,actor:'reviewer',action:'compare',state_before:'unknown',state_after:'unknown',channel:'records',invariant:b.problem,context:'UMTB4:'+JSON.stringify(b)});assert.equal(r.method_dna.methods[0].method_id,'identity_graph');assert.equal(r.rendered_output.status,'EVIDENCE_PRESERVING_RENDER');assert.match(r.next_step,/get_universal_contract/)});


test('Method frontier cannot select a model from a structurally blocked question',async()=>{
 const b=base();b.structures=[];
 const r=await routeProblem(b);
 assert.equal(r.selected_methods.length,0);
 assert.equal(r.method_frontier.policy,'EVIDENCE_GATED_GREEDY_QUESTION_COVERAGE_V1');
 assert.equal(r.method_candidates[0].structurally_eligible,false);
 assert.equal(r.deferred_methods[0].reason,'STRUCTURE_OR_SOURCE_BLOCKED');
 assert.equal(r.method_frontier.external_action_authorized,false);
});
test('Method frontier moves a later required question ahead of optional first candidates',async()=>{
 const b=base();
 b.questions[0].necessity='OPTIONAL';
 b.structures.push({id:'actors',type:'ACTOR',subject_ids:['booking'],source_refs:['s1']});
 b.questions.push({id:'q-required',kind:'ACTOR_CAPACITY',invariant:'Which actor has capacity?',structure_ids:['actors'],rule_source_refs:['s1'],necessity:'REQUIRED',applicability:'APPLIES',lenses:[]});
 const r=await routeProblem(b);
 assert.equal(r.selected_methods[0].method,'authority_graph');
 assert.equal(r.selected_methods[0].selection_reason,'DECLARED_QUESTION_COVERAGE');
 assert.equal(r.method_frontier.selected_count,2);
 assert.equal(r.method_execution_performed,false);
});
