#!/usr/bin/env node
// V26 finite synthetic proof exercise; NO external source, network or target actions.
import {routeMethodsOnMethodsV26} from '../lib/mpc-v26-meta-router.mjs';
import {knowledgeJoinV26,compareVectorClockIntervalsV26,verifyEd25519BytesV26,
 planMinimalDistinguishingQuestionsV26,reviewDeclaredCapabilitySandboxV26,
 simulateFiniteLemonsScreenV26} from '../lib/mpc-v26-meta-primitives.mjs';
const ctx={source_commit:'bc134031b2d251de5ac0093d9a13aca0a8d955c6',
 scope_id:'synthetic:v26_lab',subject_id:'synthetic:business'};
const atom=(id,dimension)=>({id,dimension,state:'SYNTHETIC',
 source_ref:'fixture:'+id,source_owner:'fixture:lab',source_version:'v1',
 scope_id:ctx.scope_id,subject_id:ctx.subject_id});
const rout=routeMethodsOnMethodsV26({...ctx,world:'SYNTHETIC',atoms:[
 atom('tiers','QUALITY_TIERS'),atom('buyer','BUYER_BELIEF')]});
const prior=routeMethodsOnMethodsV26({...ctx,world:'SYNTHETIC',atoms:[
 atom('tiers','QUALITY_TIERS'),atom('buyer','BUYER_BELIEF')],previous_fingerprint:rout.fingerprint});
const vectors=compareVectorClockIntervalsV26({...ctx,
 left:{id:'earlier',source_ref:'fixture:a',clock_domain:'clock:one',
 vector:{a:1,b:0},wall_min_ms:50,wall_max_ms:60},
 right:{id:'later',source_ref:'fixture:b',clock_domain:'clock:one',
 vector:{a:2,b:1},wall_min_ms:10,wall_max_ms:20}});
const pub='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const signature='e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
const crypto=verifyEd25519BytesV26({...ctx,message_base64:'',
 public_key_hex:pub,signature_hex:signature,key_owner_ref:'fixture:unknown-owner',
 message_source_ref:'fixture:rfc8032',signature_source_ref:'fixture:rfc8032'});
const questions=[{id:'Q1',cost:2,source_ref:'fixture:one'},
 {id:'Q2',cost:1,source_ref:'fixture:two'},
 {id:'Q3',cost:9,source_ref:'fixture:three'}];
const hypotheses=[{id:'a',predictions:{Q1:'YES',Q2:'YES',Q3:'YES'}},
 {id:'b',predictions:{Q1:'NO',Q2:'YES',Q3:'NO'}},
 {id:'c',predictions:{Q1:'NO',Q2:'NO',Q3:'YES'}}];
const q=planMinimalDistinguishingQuestionsV26({...ctx,questions,hypotheses,max_questions:3});
const sandbox=reviewDeclaredCapabilitySandboxV26({...ctx,parent_allowed:['READ_SOURCE'],
 child_requested:['READ_SOURCE','NETWORK'],needed_for_method:['READ_SOURCE'],revoked:[]});
const lemons=simulateFiniteLemonsScreenV26({...ctx,buyer_value_multiplier:1,
 tiers:[{id:'good',quality:90,reservation_price:80,quantity:1},
 {id:'low',quality:20,reservation_price:5,quantity:1}]});
console.log(JSON.stringify({kind:'MPC_V26_META_METHOD_SCIENCE_SYNTHETIC_PASS',
 profile:rout.profile,phase:rout.phase,selected_research_methods:rout.selected_methods.map(x=>x.id),
 zero_delta_stop:prior.status,contradiction_lattice:knowledgeJoinV26('SUPPORT','REFUTE'),
 clock_contradiction_state:vectors.state,
 cryptographic_signature_state:crypto.state,
 owner_authenticated:crypto.public_key_owner_authenticated,
 minimal_question_ids:q.selected_question_ids,question_executions:q.questions_asked,
 nested_sandbox_state:sandbox.state,real_sandbox_enforced:sandbox.sandbox_enforcement_performed,
 toy_lemon_remaining:lemons.final_active_tier_ids,
 actual_remote_actions:0,source_authentication:false,
 native_registry_mutation:false,canonical_promotion:false},null,2));
