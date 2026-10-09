// V10 additive pure planner: NO transport, persistence, target traffic or proof promotion.
// Use the existing V9 reconciler; do not replace canonical MPC classifiers or methods.
import {reconcileConnectorRecords,planConnectorDispatch} from './chatgpt-connector-bridge.mjs';
const fail=(code)=>{throw new Error(code)};
const isObj=(x)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonblank=(x,max=2000)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const airtableId=(prefix,x)=>typeof x==='string'&&new RegExp('^'+prefix+'[A-Za-z0-9]{14}$').test(x);
const sha256=(x)=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const MODES=new Set(['TEST','RECON','COMMIT']);
const CONSEQUENTIAL=new Set(['WRITE_CHECKPOINT','CODE_UPDATE','TARGET_TEST']);
const NATIVE=new Set(['GOOGLE_DRIVE','DROPBOX','GITHUB']);

// Discovery-facing classifier. Native gate/decision IDs remain authoritative.
// An unproven path routes toward evidence or a different method, never an
// invented success. This layer cannot override source, scope or finality gates.
const DISCOVERY_ROUTES=Object.freeze({
 DIMENSION_NOT_MATCHED:['ALTERNATE_METHOD','Find a method with a matching typed atom dimension.'],
 DIRECTION_UNSUPPORTED:['INVERT_OR_TRANSFER','Review the inverse direction or a complementary method.'],
 SOURCE_UNBOUND:['ACQUIRE_PRIMARY_SOURCE','Resolve the source owner and bind the precise native record.'],
 EXTERNAL_SOURCE_UNBOUND:['ACQUIRE_INDEPENDENT_SOURCE','Find a separately owned source for the external evidence boundary.'],
 NO_MATERIAL_VARIATION:['CHANGE_ATOM_OR_VARIABLE','Try a source-supported variable change with a material difference.'],
 CACHED_NO_MATERIAL_DELTA:['REUSE_CACHE_ADVANCE','Reuse the prior answer and move to the next unresolved atom.'],
 TRIGGERED_INPUT_REVIEW_REQUIRED:['BUILD_BOUND_MODEL','Supply the typed input and run the applicable method independently.'],
 REOPEN_DECLARED_CROSS_REFERENCE:['CROSS_METHOD_REVIEW','Follow the named new cross-method source reference.'],
 FETCH_NATIVE_NOT_DASH:['FETCH_NATIVE_SOURCE','Retrieve the source from its native owner and revision.'],
 NEEDS_NATIVE_SHA256_OR_FRESH_BODY:['REFRESH_SOURCE_DIGEST','Read native metadata or the exact source body to establish a digest.'],
 UNCHANGED_NATIVE_VERSION_AND_DIGEST:['REUSE_VERIFIED_CACHE','Skip the unchanged body and continue the next bounded object.'],
 CHANGED_OR_UNVERIFIED_NATIVE:['REVIEW_SOURCE_DELTA','Compare the changed native source and preserve its provenance.'],
 NEW_NATIVE_VERSION:['INGEST_NEW_SOURCE','Record the native source version and classify the new evidence.'],
 BLOCKED_NATIVE_CONFLICT:['RECONCILE_NATIVE_CONFLICT','Resolve competing native revisions before advancing.'],
 BLOCKED_SOURCE_CONFLICT:['RECONCILE_NATIVE_CONFLICT','Resolve the conflicting source owner/version before advancing.'],
 BLOCKED_SOURCE_POINTER:['RESOLVE_NATIVE_POINTER','Find the exact native source referenced by the controller.'],
 BLOCKED_CONTROLLER_MISMATCH:['RESOLVE_CONTROLLER_IDENTITY','Verify the authoritative controller identity.'],
 BLOCKED_NATIVE_CONTROLLER_NOT_READ:['FETCH_LIVE_CONTROLLER','Retrieve the native controller by its exact record ID.'],
 BLOCKED_INCOMPLETE_LIVE_CONTROLLER:['COMPLETE_CONTROLLER_FIELDS','Retrieve the missing live controller fields.'],
 RESUME_PLANNED:['ADVANCE_BOUNDED_PASS','Continue the exact next action from the verified controller.'],
 BLOCKED_TEST_READ_ONLY:['EXPLORE_READ_ONLY','Continue passive analysis or synthetic computation within TEST mode.'],
 BLOCKED_RECON_MODE:['STAY_IN_RECON','Continue bounded evidence analysis; change mode only with explicit authorization.'],
 NEEDS_EXPLICIT_USER_APPROVAL:['OBTAIN_USER_APPROVAL','Obtain explicit action approval before any consequential host call.'],
 NEEDS_PROGRAM_SCOPE_AUTHORIZATION:['VERIFY_PROGRAM_SCOPE','Verify current program scope and authorized owned account first.'],
 NEEDS_NATIVE_CONDITIONAL_WRITE_GUARD:['ESTABLISH_VERSION_GUARD','Use a host-supported conditional native write or leave this action pending.'],
 UNAVAILABLE_IN_SESSION:['RESOLVE_CAPABILITY','Check whether the registered connector supports the requested operation.'],
 READY_FOR_SEPARATE_HOST_CALL_AND_READBACK:['VERIFY_AND_READ_BACK','Host independently validates authority, executes the authorized action and verifies native readback.'],
 FALSIFIED_BY_VERIFIED_EVIDENCE:['RETAIN_FALSIFIER_PIVOT','Preserve the proven counterexample and explore an independently scoped hypothesis.']
});
export function classifyDiscoveryPath(raw_state){
 if(!nonblank(raw_state,128))fail('DISCOVERY_PATH_STATE_REQUIRED');
 const route=Object.hasOwn(DISCOVERY_ROUTES,raw_state)?DISCOVERY_ROUTES[raw_state]:
  ['REVIEW_UNMAPPED_STATE','Inspect the exact registered classifier meaning before selecting a pathway.'];
 return {raw_state,pathway_class:route[0],next_move:route[1],
  native_classifier_preserved:true,source_gate_preserved:true,authorization_gate_preserved:true};
}

function controllerIdentity(x){
 if(!isObj(x)||x.provider!=='AIRTABLE'||!nonblank(x.project,60)||!['TARGET_CONTROL','CANDIDATE_BRANCH'].includes(x.role)||
    !airtableId('app',x.base_id)||!airtableId('tbl',x.table_id)||!airtableId('rec',x.record_id))fail('HOT_RESUME_CONTROLLER_IDENTITY');
 return [x.project,x.role,x.provider,x.base_id,x.table_id,x.record_id].join('|');
}
function validateCache(entries){
 if(!Array.isArray(entries)||entries.length>32)fail('HOT_RESUME_CACHE_LIMIT');
 const cache=new Map();
 for(const e of entries){
  if(!isObj(e)||!nonblank(e.native_key,350)||!nonblank(e.version,250)||!sha256(e.digest)||!nonblank(e.observed_at,80))fail('HOT_RESUME_CACHE_RECORD');
  const [surface,...id]=e.native_key.split(':');
  if(!NATIVE.has(surface)||!id.join(':'))fail('HOT_RESUME_CACHE_NATIVE_KEY');
  if(cache.has(e.native_key))fail('HOT_RESUME_DUPLICATE_CACHE_KEY');
  cache.set(e.native_key,e);
 }
 return cache;
}
export function planVersionCache({source_records,cache_entries=[]}){
 if(!Array.isArray(source_records))fail('HOT_RESUME_SOURCE_RECORDS');
 const previous=validateCache(cache_entries);
 // This existing V9 function is *only* a native-identity grouping and conflict gate.
 const reconciled=reconcileConnectorRecords({objective:'V10 source metadata delta',records:source_records,current_pointer:null});
 const steps=[];const proposed=[];
 for(const group of reconciled.groups){
  const direct=source_records.filter(r=>r.surface===r.native_source&&!r.projection_of&&NATIVE.has(r.native_source)&&r.native_source+':'+r.native_id===group.native_key);
  const cached=previous.get(group.native_key);
  if(group.status==='CONFLICTING_NATIVE_VERSIONS'){
   steps.push({native_key:group.native_key,state:'BLOCKED_NATIVE_CONFLICT',skip_body:false});continue;
  }
  if(group.status!=='NATIVE_SOURCE_PRESENT'||direct.length===0){
   steps.push({native_key:group.native_key,state:'FETCH_NATIVE_NOT_DASH',skip_body:false});continue;
  }
  // An untrusted/projection duplicate never supplies a version or digest for this decision.
  const record=direct[0];
  if(!sha256(record.content_digest)){
   steps.push({native_key:group.native_key,state:'NEEDS_NATIVE_SHA256_OR_FRESH_BODY',skip_body:false});continue;
  }
  if(cached&&cached.version===record.version&&cached.digest===record.content_digest){
   steps.push({native_key:group.native_key,state:'UNCHANGED_NATIVE_VERSION_AND_DIGEST',skip_body:true});continue;
  }
  steps.push({native_key:group.native_key,state:cached?'CHANGED_OR_UNVERIFIED_NATIVE':'NEW_NATIVE_VERSION',skip_body:false});
  proposed.push({native_key:group.native_key,version:record.version,digest:record.content_digest,observed_at:record.observed_at??'HOST_OBSERVATION_REQUIRED'});
 }
 return {version:'MPC_VERSION_CACHE_V10',status:steps.some(x=>x.state==='BLOCKED_NATIVE_CONFLICT')?'BLOCKED_NATIVE_CONFLICT':'METADATA_PLAN_ONLY',
  steps:steps.map(step=>({...step,discovery_path:classifyDiscoveryPath(step.state)})),
  cache_proposals_not_persisted:proposed,skipped_body_count:steps.filter(x=>x.skip_body).length,
  dash_projection_is_evidence:false,native_authentication:false,persistence_performed:false};
}

export function planHotResume({project,expected_controller,live_controller,mode='TEST',source_records=[],cache_entries=[],capabilities=[],current_source_pointer=null}){
 if(!MODES.has(mode)||!nonblank(project,60)||!Array.isArray(capabilities)||capabilities.length>12)fail('HOT_RESUME_BOOT_INPUT');
 if(controllerIdentity(expected_controller).split('|')[0]!==project)fail('HOT_RESUME_WRONG_PROJECT');
 const pinned_id=controllerIdentity(expected_controller);
 if(live_controller===null||live_controller===undefined)return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_NATIVE_CONTROLLER_NOT_READ',controller_key:pinned_id,
  discovery_path:classifyDiscoveryPath('BLOCKED_NATIVE_CONTROLLER_NOT_READ'),
  next_action:'Fetch native Airtable controller by exact pinned ID; do not use older Drive or Dash snapshot.',host_actions_performed:false,write_performed:false};
 const actual_id=controllerIdentity(live_controller);
 if(actual_id!==pinned_id)return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_CONTROLLER_MISMATCH',controller_key:pinned_id,
  discovery_path:classifyDiscoveryPath('BLOCKED_CONTROLLER_MISMATCH'),
  next_action:'Resolve the live native controller identity conflict, without writes.',host_actions_performed:false,write_performed:false};
 if(!nonblank(live_controller.checkpoint_id,300)||!nonblank(live_controller.cursor,3000)||!nonblank(live_controller.next_action,3000)||!nonblank(live_controller.observed_at,80))
  return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_INCOMPLETE_LIVE_CONTROLLER',controller_key:pinned_id,
   discovery_path:classifyDiscoveryPath('BLOCKED_INCOMPLETE_LIVE_CONTROLLER'),
   next_action:'Refresh the native controller checkpoint, cursor, next action and observation time.',host_actions_performed:false,write_performed:false};
 const cache=planVersionCache({source_records,cache_entries});
 const sourceKeys=new Set(cache.steps.map(x=>x.native_key));
 const badPointer=current_source_pointer!==null&&(!nonblank(current_source_pointer,350)||!sourceKeys.has(current_source_pointer));
 const state=badPointer?'BLOCKED_SOURCE_POINTER':cache.status==='BLOCKED_NATIVE_CONFLICT'?'BLOCKED_SOURCE_CONFLICT':'RESUME_PLANNED';
 return {version:'MPC_HOT_RESUME_V10',project,mode,state,controller_key:pinned_id,discovery_path:classifyDiscoveryPath(state),
  checkpoint_id:live_controller.checkpoint_id,cursor:live_controller.cursor,
  next_action:state==='RESUME_PLANNED'?live_controller.next_action:'Resolve the missing/conflicting native source before resuming.',
  source_cache:cache,capability_surfaces:capabilities.filter(c=>c.available===true).map(c=>c.surface),
  boot_order:['EXACT_NATIVE_CONTROLLER','MATCH_NATIVE_IDENTITY','RECONCILE_VERSION_METADATA','FETCH_ONLY_REQUIRED_SOURCE','SELECT_BOUND_METHODS','EXPLICITLY_AUTHORIZE_WRITE','VERIFY_NATIVE_READBACK'],
  controller_is_caller_supplied_not_independently_authenticated:true,
  methods_executed:0,source_authentication:false,canonical_promotion:false,host_actions_performed:false,write_performed:false};
}

export function planModeDispatch({mode='TEST',capabilities,operation,surface,object_id,user_approved=false,native_precondition=null,scope_approved=false}){
 if(!MODES.has(mode)||!nonblank(object_id,350))fail('HOT_RESUME_DISPATCH_INPUT');
 const base=planConnectorDispatch({capabilities,operation,surface,object_id});
 let state=base.state;
 if(CONSEQUENTIAL.has(operation)){
  if(mode==='TEST')state='BLOCKED_TEST_READ_ONLY';
  else if(mode==='RECON'&&operation!=='WRITE_CHECKPOINT')state='BLOCKED_RECON_MODE';
  else if(state==='UNAVAILABLE_IN_SESSION')state='UNAVAILABLE_IN_SESSION';
  else if(user_approved!==true)state='NEEDS_EXPLICIT_USER_APPROVAL';
  else if(operation==='TARGET_TEST'&&scope_approved!==true)state='NEEDS_PROGRAM_SCOPE_AUTHORIZATION';
  else if(operation!=='TARGET_TEST'&&(!isObj(native_precondition)||native_precondition.kind!=='NATIVE_CONDITIONAL_VERSION'||
     native_precondition.supported_by_host!==true||!nonblank(native_precondition.expected_version,300)))state='NEEDS_NATIVE_CONDITIONAL_WRITE_GUARD';
  else state='READY_FOR_SEPARATE_HOST_CALL_AND_READBACK';
 }
 return {...base,mode,state,discovery_path:classifyDiscoveryPath(state),host_action_called:false,write_performed:false,authorization_conferred:false,
  approval_is_caller_declared_not_verified:true,
  next_step:state==='READY_FOR_SEPARATE_HOST_CALL_AND_READBACK'?'Host must independently verify approval, program rules, CAS support and native readback; this plan performs nothing.':'No host action permitted by this plan.'};
}
