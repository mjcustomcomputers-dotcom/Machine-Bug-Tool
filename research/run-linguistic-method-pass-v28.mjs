#!/usr/bin/env node
// MPC V28 — synthetic linguistic method-on-method source/claim pass.
// No remote source authentication, messages sent or research hook execution.
import {runLinguisticMethodsOnMethodsV28} from '../lib/mpc-linguistic-method-router-v28.mjs';
import {auditControlledLinguisticOutputV28} from '../lib/mpc-linguistic-audit-v28.mjs';
import {bindExactQuoteSpanV28} from '../lib/mpc-linguistic-output-v28.mjs';
import {createHash} from 'node:crypto';

const ctx={source_commit:'8cf6888c46f040519b1342cfe21baf02431423ff',
 scope_id:'fixture:linguistic-pass',subject_id:'fixture:transaction'};
const ref=(id)=>({id,version:'v1',owner:'fixture:records'});
const core={actor:'Agency',patient:'notice',quantity:'ONE',event_time:'PAST',
 finality_state:'NONE',finality_owner:null,speech_act:'REPORT'};
const frames=[
 {id:'main',role:'MAIN',...core,action:'FILE',polarity:'AFFIRMED',
  evidence_state:'OBSERVED',support_refs:[ref('fixture:filing')],contrary_refs:[]},
 {id:'limitation',role:'LIMITATION',...core,action:'RECEIVE',polarity:'NEGATED',
  evidence_state:'CLAIMED',support_refs:[ref('fixture:delivery')],contrary_refs:[]},
 {id:'contrary',role:'CONTRARY',...core,action:'SETTLE',patient:'invoice',
  polarity:'UNKNOWN',event_time:'UNSPECIFIED',evidence_state:'CONTESTED',
  support_refs:[ref('fixture:ledger-a')],contrary_refs:[ref('fixture:ledger-b')]}
];
const packet={...ctx,world:'RECORD',format:'LEGAL',frames};
const out=runLinguisticMethodsOnMethodsV28({...packet,max_methods:8});
const adversary=structuredClone(out.rendered_output);
const candidate=adversary.clauses.find(c=>c.claim_id==='limitation');
candidate.exact_text=candidate.exact_text.replace('did not receive','did receive');
adversary.document=adversary.clauses.map(c=>c.exact_text).join('\n\n');
const bad=auditControlledLinguisticOutputV28(packet,adversary);
const text='Text fixture: "the notice was filed."';
const quote=bindExactQuoteSpanV28({...ctx,source_ref:'fixture:quote',
 source_owner:'fixture:records',source_version:'v1',source_text:text,
 source_sha256:createHash('sha256').update(text).digest('hex'),
 start_utf16:text.indexOf('the notice'),end_utf16:text.indexOf('the notice')+10,
 claimed_quote:'the notice'});
console.log(JSON.stringify({
 kind:'MPC_V28_LINGUISTIC_METHOD_ON_METHOD_SYNTHETIC_PASS',
 parent_source_commit:ctx.source_commit,declared_input_world:packet.world,
 declared_sources_authenticated:false,research_hooks:34,
 controlled_claim_count:out.rendered_output.clauses.length,
 source_scoped_roles:out.rendered_output.ordered_claim_ids,
 independent_replay_state:out.audit_receipt.state,
 tampered_negation_replay_state:bad.state,
 quote_span_state:quote.status,
 hypothetical_method_links:out.hypothetical_links.length,
 new_scholarly_research_methods_executed:out.research_hooks_executed,
 finite_render_audit_methods_executed:out.output_methods_executed,
 original_renderer_replaced:false,external_actions:0,
 source_authentication:false,canonical_promotion:false
},null,2));
