// Daybreak: offline, source-declared defensive threat forecasting. This is an
// additive review adapter, not a scanner, attacker-attribution model, native
// MPC evaluator, Method Atlas method, or bounty evidence/promoter.
import {createHash} from 'node:crypto';

const VERSION='DAYBREAK_DEFENSIVE_FORECAST_V1';
const INPUT_VERSION='DAYBREAK_DEFENSIVE_FORECAST_INPUT_V1';
const ID=/^[A-Za-z0-9:._-]{1,100}$/u;
const DIGEST=/^[a-f0-9]{64}$/u;
const STATES=new Set(['SUPPORTED','REFUTED','UNKNOWN']);
const SIGNAL_STATES=new Set(['SOURCE_CODE_OBSERVED','PUBLIC_REPORT','HYPOTHESIS']);
const SCOPE=new Set(['UNKNOWN','DECLARED_IN_SCOPE','DECLARED_OUT_OF_SCOPE']);
const fail=code=>{throw Error(code);};
const keySort=(a,b)=>a.localeCompare(b);
const unique=arr=>new Set(arr).size===arr.length;
const sortUnique=arr=>[...arr].sort(keySort);
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const exactKeys=(o,keys,required=keys)=>isObject(o)&&Object.keys(o).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(o,k));
const boundedString=(x,max)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

// Defensive opportunity patterns. Preconditions are documented review gates,
// not instructions for contacting a target or claims about a person's intent.
const RULES=Object.freeze({
 TLS_CERTIFICATE_CHECK_DISABLED:{
  family:'CREDENTIAL_CONFIDENTIALITY',category:'MITM_REQUIRED',
  forecast:'A network-positioned adversary could threaten authenticated transport if no compensating guard exists.',
  prerequisites:[['NETWORK_INTERCEPTION_POSITION','Network interception precondition',3],['SENSITIVE_AUTHENTICATED_TRAFFIC','Sensitive authenticated traffic on affected transport',1],['COMPENSATING_TRANSPORT_GUARD_ABSENT','No compensating certificate/pinning guard',2]],
  falsifier:'Certificate verification is enforced in the actual affected transport, or the proposed interception precondition is excluded.',
  mitigation:'Validate TLS certificates; test strict verification in an isolated owned development fixture.',
  method_refs:['MHA-0037','MHA-0093','MHA-0118']
 },
 UNBOUND_BEARER_DESTINATION:{
  family:'CREDENTIAL_CONFIDENTIALITY',category:'UNTRUSTED_DESTINATION',
  forecast:'An untrusted destination reaching an authenticated request constructor could cause a bearer token to cross the intended origin boundary.',
  prerequisites:[['UNTRUSTED_DESTINATION_REACHABLE','Untrusted input can determine the authenticated URL',2],['BEARER_SENT_TO_DESTINATION','Bearer token attached for that destination',1],['ORIGIN_ALLOWLIST_ABSENT','No effective allowlist or token stripping',1]],
  falsifier:'Only constant or allowlisted origins reach authenticated requests, or bearer headers are stripped for foreign origins.',
  mitigation:'Bind authenticated transport to the expected origin, and strip bearer headers on untrusted destinations.',
  method_refs:['MHA-0038','MHA-0093','MHA-0118']
 },
 SENSITIVE_TOKEN_LOGGING:{
  family:'CREDENTIAL_CONFIDENTIALITY',category:'LOG_EXPOSURE',
  forecast:'Token-bearing diagnostic output could expose privileged credentials if logs reach another principal during the token lifetime.',
  prerequisites:[['REAL_SECRET_LOGGED','A real active token is logged',2],['UNAUTHORIZED_LOG_READER','Another principal can read the log',2],['TOKEN_USABLE_WHEN_READ','Token remains usable when disclosed',2]],
  falsifier:'Only inert/redacted sample text is logged, logs are access-isolated, or tokens cannot be used.',
  mitigation:'Redact tokens; avoid logging secrets and bound log access and retention.',
  method_refs:['MHA-0093','MHA-0098','MHA-0118']
 },
 DISPLAY_INTERNAL_ID_CONFLATION:{
  family:'RESOURCE_IDENTITY',category:'IDENTITY_BINDING',
  forecast:'A display identifier reused as an internal resource key could resolve the wrong owner or finalization object.',
  prerequisites:[['DISPLAY_ID_DIFFERS_FROM_INTERNAL','Display and internal identifiers differ in a supported configuration',1],['LOOKUP_CONSUMES_DISPLAY_AS_INTERNAL','A subsequent resource lookup uses display value as internal key',1],['CROSS_OBJECT_COLLISION_OR_AUTH_EFFECT','The mismatch reaches a different owned object or security-sensitive action',3]],
  falsifier:'Every finalizer resolves an immutable internal identity with owner binding; display values are presentation only.',
  mitigation:'Persist and resolve canonical internal IDs; validate owner/campaign and finality at action time.',
  method_refs:['MHA-0100','MHA-0037','MHA-0093']
 },
 WEBHOOK_PAYMENT_ID_CONFLATION:{
  family:'RESOURCE_IDENTITY',category:'PAYMENT_FINALITY',
  forecast:'Confusing a delivery/event identifier with its payment object could misroute a finality decision when authoritative state is not rechecked.',
  prerequisites:[['DELIVERY_EVENT_RESOURCE_IDS_DISTINCT','Delivery, event and resource IDs differ',1],['FINALIZER_USES_WRONG_ID','A finalizer accepts the wrong identity without type/owner enforcement',2],['FINANCIAL_OR_AUTHORIZATION_EFFECT','A recorded effect crosses the payment/authorization boundary',3]],
  falsifier:'Event is typed and authenticated and the finalizer re-fetches the owner-bound Payment before state transition.',
  mitigation:'Preserve delivery/event/resource ID types and independently reconcile canonical Payment state.',
  method_refs:['MHA-0100','MHA-0093','MHA-0118']
 },
 IDEMPOTENCY_FINALITY_GAP:{
  family:'PAYMENT_FINALITY',category:'REPLAY',
  forecast:'A missing finalization guard could allow an otherwise identical logical operation to produce multiple unauthorized effects.',
  prerequisites:[['EQUIVALENT_OPERATION_REPEATED','Two inputs represent the same logical operation',2],['FINALIZER_NOT_IDEMPOTENT','The finalizer accepts a second effect',2],['DUPLICATE_STATE_EFFECT','Independent state shows duplicate paid/credit effect',3]],
  falsifier:'A stable idempotency/owner key reconciles both attempts to one terminal financial event.',
  mitigation:'Bind idempotency to one owner/object/operation and reconcile terminal state atomically.',
  method_refs:['MHA-0096','MHA-0037','MHA-0118']
 }
});
export const defensiveForecastPatterns=Object.freeze(Object.keys(RULES).sort(keySort));
export const defensiveForecastContract=Object.freeze({version:VERSION,input_version:INPUT_VERSION,max_sources:32,max_signals:12,max_predicates_per_signal:8,network_calls:0,connector_calls:0,target_actions:false,authenticated_source_proof:false,actor_attribution:false,empirical_likelihoods:false,new_native_method_ids:0,automated_bounty_promotion:false});

function normalizeSource(x){
 if(!exactKeys(x,['id','owner','revision','locator','sha256'])||!ID.test(x.id)||!boundedString(x.owner,140)||!boundedString(x.revision,180)||!boundedString(x.locator,1100)||!DIGEST.test(x.sha256))fail('INVALID_FORECAST_SOURCE');
 return {id:x.id,owner:x.owner,revision:x.revision,locator:x.locator,sha256:x.sha256};
}
function sourceRefs(refs,sourceSet,emptyAllowed=false){
 if(!Array.isArray(refs)||refs.length>8||refs.length<Number(!emptyAllowed)||refs.some(id=>typeof id!=='string'||!sourceSet.has(id))||!unique(refs))fail('INVALID_FORECAST_SOURCE_REFS');
 return sortUnique(refs);
}
function normalizeSignal(x,sourceSet){
 if(!exactKeys(x,['id','pattern','evidence_state','source_ids','predicates','known_public_issue'],['id','pattern','evidence_state','source_ids','predicates'])||!ID.test(x.id)||!Object.hasOwn(RULES,x.pattern)||!SIGNAL_STATES.has(x.evidence_state)||typeof (x.known_public_issue??false)!=='boolean')fail('INVALID_FORECAST_SIGNAL');
 const source_ids=sourceRefs(x.source_ids,sourceSet,x.evidence_state==='HYPOTHESIS');
 const pr=RULES[x.pattern].prerequisites;
 if(!Array.isArray(x.predicates)||x.predicates.length>8)fail('INVALID_FORECAST_PREDICATES');
 const seen=new Set();const predicates=x.predicates.map(row=>{
  if(!exactKeys(row,['id','state','source_ids','check_cost'],['id','state','source_ids'])||!pr.some(p=>p[0]===row.id)||seen.has(row.id)||!STATES.has(row.state))fail('INVALID_FORECAST_PREDICATE');
  seen.add(row.id);const refs=sourceRefs(row.source_ids,sourceSet,row.state==='UNKNOWN');
  if(row.state==='UNKNOWN'&&refs.length||row.state!=='UNKNOWN'&&!refs.length||row.check_cost!==undefined&&(!Number.isInteger(row.check_cost)||row.check_cost<1||row.check_cost>5))fail('INVALID_FORECAST_PREDICATE_EVIDENCE');
  return {id:row.id,state:row.state,source_ids:refs,check_cost:row.check_cost??pr.find(p=>p[0]===row.id)[2]};
 });
 const mapped=new Map(predicates.map(p=>[p.id,p]));
 return {id:x.id,pattern:x.pattern,evidence_state:x.evidence_state,source_ids,predicates:pr.map(([id,,cost])=>mapped.get(id)??{id,state:'UNKNOWN',source_ids:[],check_cost:cost}),known_public_issue:x.known_public_issue??false};
}
function normalized(input){
 if(!exactKeys(input,['schema_version','case_id','sources','signals','program'],['schema_version','case_id','sources','signals','program'])||input.schema_version!==INPUT_VERSION||!ID.test(input.case_id)||!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>32||!Array.isArray(input.signals)||input.signals.length<1||input.signals.length>12)fail('INVALID_FORECAST_INPUT');
 const sources=input.sources.map(normalizeSource).sort((a,b)=>keySort(a.id,b.id));
 if(!unique(sources.map(s=>s.id)))fail('DUPLICATE_FORECAST_SOURCE');
 const ids=new Set(sources.map(s=>s.id));
 const signals=input.signals.map(s=>normalizeSignal(s,ids)).sort((a,b)=>keySort(a.id,b.id));
 if(!unique(signals.map(s=>s.id)))fail('DUPLICATE_FORECAST_SIGNAL');
 const p=input.program;
 if(!exactKeys(p,['scope','excluded_categories'],['scope','excluded_categories'])||!SCOPE.has(p.scope)||!Array.isArray(p.excluded_categories)||p.excluded_categories.length>10||p.excluded_categories.some(x=>!Object.values(RULES).some(r=>r.category===x))||!unique(p.excluded_categories))fail('INVALID_FORECAST_PROGRAM');
 return {schema_version:INPUT_VERSION,case_id:input.case_id,sources,signals,program:{scope:p.scope,excluded_categories:sortUnique(p.excluded_categories)}};
}

export function forecastDefensiveThreats(input){
 const data=normalized(input),review=[];
 for(const signal of data.signals){
  const rule=RULES[signal.pattern];
  const gates=rule.prerequisites.map(([id,description])=>({...signal.predicates.find(p=>p.id===id),description}));
  const refuted=gates.filter(g=>g.state==='REFUTED'),open=gates.filter(g=>g.state==='UNKNOWN');
  const path_state=signal.evidence_state==='HYPOTHESIS'?'UNVERIFIED_SOURCE_SIGNAL':refuted.length?'REFUTED_PRECONDITION':open.length?'OPEN_CONDITIONAL_PATH':'PRECONDITIONS_DECLARED_SUPERSET_NO_IMPACT_PROOF';
  const eligibility=signal.known_public_issue?'KNOWN_PUBLIC_PRIOR_REPORT':data.program.scope==='DECLARED_OUT_OF_SCOPE'?'OUT_OF_SCOPE_DECLARED':data.program.excluded_categories.includes(rule.category)?'PROGRAM_EXCLUSION_DECLARED':data.program.scope==='UNKNOWN'?'SCOPE_NOT_ESTABLISHED':'SOURCE_PATH_ONLY_IMPACT_NOT_VERIFIED';
  review.push({signal_id:signal.id,pattern:signal.pattern,family:rule.family,category:rule.category,observation_state:signal.evidence_state,
   source_ids:signal.source_ids,path_state,program_eligibility:eligibility,predicted_opportunity:rule.forecast,
   supported_preconditions:gates.filter(g=>g.state==='SUPPORTED'),refuted_preconditions:refuted,missing_preconditions:open,
   falsifier:rule.falsifier,defensive_control:rule.mitigation,existing_atlas_review_refs:rule.method_refs,
   atlas_method_execution:false,source_authentication:false,attacker_identity_inferred:false,actual_target_exploitation_observed:false,
   bounty_discovery_minted:false,eligible_to_submit:false});
 }
 // A missing predicate is a useful next read only if no counterexample or
 // program exclusion already blocks that conditional path. Leverage is the
 // number of nonblocked candidate paths needing the identical proof gate.
 const candidates=[];
 for(const row of review){
  if(row.path_state!=='OPEN_CONDITIONAL_PATH'||row.program_eligibility!=='SOURCE_PATH_ONLY_IMPACT_NOT_VERIFIED')continue;
  for(const g of row.missing_preconditions)candidates.push({id:g.id,signal_id:row.signal_id,description:g.description,cost:g.check_cost});
 }
 const aggregated=new Map();
 for(const c of candidates){const r=aggregated.get(c.id)??{predicate_id:c.id,description:c.description,dependent_signal_ids:[],lowest_declared_check_cost:c.cost};
  r.dependent_signal_ids.push(c.signal_id);r.lowest_declared_check_cost=Math.min(r.lowest_declared_check_cost,c.cost);aggregated.set(c.id,r);}
 const next_checks=[...aggregated.values()].map(c=>({...c,dependent_signal_ids:sortUnique(c.dependent_signal_ids),unresolved_path_count:c.dependent_signal_ids.length,mode:'REVIEW_EXISTING_SOURCE_OR_AUTHORIZED_OWNED_RECORD_ONLY'}))
  .sort((a,b)=>b.unresolved_path_count-a.unresolved_path_count||a.lowest_declared_check_cost-b.lowest_declared_check_cost||keySort(a.predicate_id,b.predicate_id));
 // The same source supporting distinct code observations is NOT independent
 // evidence; nor does two-pattern agreement establish attacker motivation.
 const overlaps=[];
 for(let i=0;i<review.length;i++)for(let j=i+1;j<review.length;j++){
  if(review[i].family!==review[j].family)continue;
  const common=review[i].source_ids.filter(s=>review[j].source_ids.includes(s));
  overlaps.push({signal_ids:[review[i].signal_id,review[j].signal_id],family:review[i].family,
   source_relationship:common.length?'SHARED_DECLARED_SOURCE':'DISTINCT_DECLARED_SOURCES_NOT_VERIFIED_INDEPENDENT',shared_source_ids:common,
   interpretation:'Alternative conditional threat paths, not independent proof of impact or actual attacker behavior.'});
 }
 return {version:VERSION,status:'OFFLINE_DEFENSIVE_HYPOTHESES_ONLY',case_id:data.case_id,input_fingerprint:digest(data),
  summary:{source_records_declared:data.sources.length,signals_reviewed:review.length,conditional_paths_open:review.filter(x=>x.path_state==='OPEN_CONDITIONAL_PATH').length,
   blocked_by_falsifier:review.filter(x=>x.path_state==='REFUTED_PRECONDITION').length,known_public_priors:review.filter(x=>x.program_eligibility==='KNOWN_PUBLIC_PRIOR_REPORT').length,
   real_impact_witnesses_authenticated:0,bounty_ready_findings:0},
  forecasts:review,source_dependency_checks:overlaps,next_passive_review_check:next_checks[0]??null,all_unresolved_checks:next_checks,
  safeguards:{...defensiveForecastContract,program_scope_is_caller_declared:true,source_refs_are_caller_declared:true,forecast_is_not_attribution_or_probability:true,requires_authorized_native_evidence_before_promotion:true,
   no_bounty_target_reads_performed:true,original_mpc_architecture_untouched:true}};
}
