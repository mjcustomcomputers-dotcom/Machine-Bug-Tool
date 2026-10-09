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
  steps,cache_proposals_not_persisted:proposed,skipped_body_count:steps.filter(x=>x.skip_body).length,
  dash_projection_is_evidence:false,native_authentication:false,persistence_performed:false};
}

export function planHotResume({project,expected_controller,live_controller,mode='TEST',source_records=[],cache_entries=[],capabilities=[],current_source_pointer=null}){
 if(!MODES.has(mode)||!nonblank(project,60)||!Array.isArray(capabilities)||capabilities.length>12)fail('HOT_RESUME_BOOT_INPUT');
 if(controllerIdentity(expected_controller).split('|')[0]!==project)fail('HOT_RESUME_WRONG_PROJECT');
 const pinned_id=controllerIdentity(expected_controller);
 if(live_controller===null||live_controller===undefined)return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_NATIVE_CONTROLLER_NOT_READ',controller_key:pinned_id,
  next_action:'Fetch native Airtable controller by exact pinned ID; do not use older Drive or Dash snapshot.',host_actions_performed:false,write_performed:false};
 const actual_id=controllerIdentity(live_controller);
 if(actual_id!==pinned_id)return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_CONTROLLER_MISMATCH',controller_key:pinned_id,
  next_action:'Resolve the live native controller identity conflict, without writes.',host_actions_performed:false,write_performed:false};
 if(!nonblank(live_controller.checkpoint_id,300)||!nonblank(live_controller.cursor,3000)||!nonblank(live_controller.next_action,3000)||!nonblank(live_controller.observed_at,80))
  return {version:'MPC_HOT_RESUME_V10',project,mode,state:'BLOCKED_INCOMPLETE_LIVE_CONTROLLER',controller_key:pinned_id,
   next_action:'Refresh the native controller checkpoint, cursor, next action and observation time.',host_actions_performed:false,write_performed:false};
 const cache=planVersionCache({source_records,cache_entries});
 const sourceKeys=new Set(cache.steps.map(x=>x.native_key));
 const badPointer=current_source_pointer!==null&&(!nonblank(current_source_pointer,350)||!sourceKeys.has(current_source_pointer));
 const state=badPointer?'BLOCKED_SOURCE_POINTER':cache.status==='BLOCKED_NATIVE_CONFLICT'?'BLOCKED_SOURCE_CONFLICT':'RESUME_PLANNED';
 return {version:'MPC_HOT_RESUME_V10',project,mode,state,controller_key:pinned_id,
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
 return {...base,mode,state,host_action_called:false,write_performed:false,authorization_conferred:false,
  approval_is_caller_declared_not_verified:true,
  next_step:state==='READY_FOR_SEPARATE_HOST_CALL_AND_READBACK'?'Host must independently verify approval, program rules, CAS support and native readback; this plan performs nothing.':'No host action permitted by this plan.'};
}
