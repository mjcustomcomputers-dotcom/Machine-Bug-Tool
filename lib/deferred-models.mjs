// Finite, caller-supplied bookkeeping models; names are analogies, not machine specifications.
const s={type:'string',minLength:1,maxLength:200};
const amount={type:'integer',minimum:0,maximum:1000000000};
const obj=p=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
const events=items=>({type:'array',items,minItems:0,maxItems:64});
const kind=(...values)=>({type:'string',enum:values});
export const deferredSchemas={
 claw_accumulator:obj({unit:s,opening:amount,threshold:{...amount,minimum:1},events:events(obj({id:s,kind:kind('ACCRUE','RESET','AWARD_RECORDED'),amount,source_ref:s}))}),
 coin_pusher_deferred:obj({unit:s,opening_pending:amount,events:events(obj({id:s,kind:kind('DEPOSIT','RELEASE','REMOVE'),amount,source_ref:s}))}),
 casino_meter_finality:obj({unit:s,records:events(obj({id:s,meter_amount:amount,finalized_amount:amount,paid_amount:amount,meter_ref:s,finality_ref:{type:'string',maxLength:200},payment_ref:{type:'string',maxLength:200}}))})
};
function unique(xs){if(new Set(xs).size!==xs.length)throw Error('DUPLICATE_ID')}
export const deferredFunctions={
 claw_accumulator({unit,opening,threshold,events}){
  unique(events.map(e=>e.id));let balance=opening,awards=0;const trace=[];
  for(const e of events){const before=balance;if(e.kind==='ACCRUE')balance+=e.amount;else if(e.kind==='RESET'){if(e.amount>balance)throw Error('RESET_EXCEEDS_ACCUMULATOR');balance-=e.amount}else awards+=e.amount;
   trace.push({id:e.id,kind:e.kind,before,after:balance,threshold_reached:balance>=threshold,source_ref:e.source_ref});}
  return {unit,closing_accumulator:balance,threshold_reached:balance>=threshold,recorded_award_units:awards,trace,award_entitlement_inferred:false,reset_policy:'EXPLICIT_RESET_ONLY',hidden_machine_behavior_inferred:false};
 },
 coin_pusher_deferred({unit,opening_pending,events}){
  unique(events.map(e=>e.id));let pending=opening_pending,released=0,removed=0;const trace=[];
  for(const e of events){const before=pending;if(e.kind==='DEPOSIT')pending+=e.amount;else{if(e.amount>pending)throw Error('OUTFLOW_EXCEEDS_PENDING');pending-=e.amount;if(e.kind==='RELEASE')released+=e.amount;else removed+=e.amount}trace.push({id:e.id,kind:e.kind,before,pending,source_ref:e.source_ref})}
  return {unit,pending,released,removed,trace,released_is_paid:false,current_depositor_owns_release:false,causation_established:false,release_timing_predicted:false};
 },
 casino_meter_finality({unit,records}){
  unique(records.map(r=>r.id));return {unit,records:records.map(r=>{if(r.finalized_amount&&!r.finality_ref.trim())throw Error('FINALITY_REFERENCE_REQUIRED');if(r.paid_amount&&!r.payment_ref.trim())throw Error('PAYMENT_REFERENCE_REQUIRED');return {...r,meter_minus_finalized:r.meter_amount-r.finalized_amount,finalized_minus_paid:r.finalized_amount-r.paid_amount,meter_equals_finalized:r.meter_amount===r.finalized_amount,finalized_equals_paid:r.finalized_amount===r.paid_amount}}),meter_proves_finality:false,equal_amounts_prove_same_state:false,source_references_authenticated:false,legal_entitlement_determined:false};
 }
};
export const deferredDescriptors=[
 ['claw_accumulator','claw-machine accumulator','COMPUTATION','Explicit accrual/reset ledger and caller-supplied threshold. Threshold reach does not prove an award, payout probability, or hidden machine policy.'],
 ['coin_pusher_deferred','coin-pusher deferred state','COMPUTATION','Carry pending inventory across supplied events; distinguish release from removal. No attribution of releases to the latest deposit and no timing prediction.'],
 ['casino_meter_finality','casino meter/finality separation','COMPUTATION','Compare displayed, declared finalized and paid amounts independently with separate source references. Equality does not establish finality, authenticity, or entitlement.']
];
