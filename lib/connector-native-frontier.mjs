// Bounded next-source-read planner over the source bridge reconciliation receipt.
// It suggests host connector work; it never invokes any connector or trusts supplied
// capability/previous-read assertions as proof of native source authenticity.
const CONNECTOR_TO_SOURCE = Object.freeze({
 GOOGLE_DRIVE:'GOOGLE_DRIVE', DROPBOX:'DROPBOX', GITHUB:'GITHUB'
});
function validKey(v){return typeof v==='string'&&/^(GOOGLE_DRIVE|DROPBOX|GITHUB):[A-Za-z0-9_.:\/-]{1,300}$/u.test(v)}
function dedup(xs){return new Set(xs).size===xs.length}
export function planNativeSourceFrontier(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!['reconciliation','capabilities','already_read_keys','max_actions'].includes(k)))throw Error('FRONTIER_INPUT_REQUIRED');
 const {reconciliation:r}=input;
 if(!r||typeof r!=='object'||r.version!=='MPC_CONNECTOR_BRIDGE_1.1'||!Array.isArray(r.groups)||r.groups.length>32)throw Error('FRONTIER_RECONCILIATION_REQUIRED');
 const caps=input.capabilities??[],read=input.already_read_keys??[],limit=input.max_actions??3;
 if(!Array.isArray(caps)||caps.length>12||!Array.isArray(read)||read.length>32||!read.every(validKey)||!dedup(read)||
   !Number.isInteger(limit)||limit<1||limit>3)throw Error('FRONTIER_BUDGET_OR_CAPABILITIES');
 const capabilities=new Map();
 for(const c of caps){
  if(!c||typeof c!=='object'||!Object.keys(CONNECTOR_TO_SOURCE).includes(c.surface)||typeof c.available!=='boolean'||
    !Array.isArray(c.operations)||!c.operations.every(x=>typeof x==='string'))throw Error('FRONTIER_BAD_CAPABILITY');
  if(capabilities.has(c.surface))throw Error('FRONTIER_DUPLICATE_CAPABILITY');
  capabilities.set(c.surface,c.available&&c.operations.includes('READ'));
 }
 const ordering=r.groups.map(g=>{
  if(!validKey(g.native_key)||!['NATIVE_SOURCE_PRESENT','PROJECTION_ONLY_UNVERIFIED','CONFLICTING_NATIVE_VERSIONS'].includes(g.status))throw Error('FRONTIER_INVALID_NATIVE_GROUP');
  const focus=g.native_key===r.current_pointer;
  const urgency=focus?100:g.status==='CONFLICTING_NATIVE_VERSIONS'?80:g.status==='PROJECTION_ONLY_UNVERIFIED'?70:
   g.projection_version_difference_requires_review?50:10;
  return {g,urgency,focus};
 }).sort((a,b)=>b.urgency-a.urgency||a.g.native_key.localeCompare(b.g.native_key));
 const selected=[],blocked=[],already=[];
 const readSet=new Set(read);
 for(const {g,focus} of ordering){
  const native_source=g.native_key.slice(0,g.native_key.indexOf(':'));
  const reason=focus?'VERIFY_CONTROLLING_NATIVE_POINTER':
   g.status==='CONFLICTING_NATIVE_VERSIONS'?'RESOLVE_CONFLICTING_NATIVE_VERSIONS':
   g.status==='PROJECTION_ONLY_UNVERIFIED'?'FETCH_MISSING_NATIVE_ORIGINAL':
   g.projection_version_difference_requires_review?'COMPARE_INDEXED_PROJECTION_WITH_NATIVE':'VERIFY_NATIVE_OWNER_AND_VERSION';
  if(readSet.has(g.native_key)&&g.status==='NATIVE_SOURCE_PRESENT'&&!g.projection_version_difference_requires_review){
   already.push({native_key:g.native_key,reason:'SAME_SESSION_READ_ALREADY_ACCOUNTED_NOT_FRESHNESS_PROOF'});continue
  }
  const ready=capabilities.get(native_source)===true;
  const step={native_key:g.native_key,native_source,reason,
    native_pointer:g.native_pointers[0]??null,projection_pointer:g.projection_pointers[0]??null,
    session_capability_declared:ready,host_call_performed:false,source_authenticated:false,
    next:'Read the native object by exact ID using the actual host connector and read back its owner/version'};
  if(!ready){blocked.push({...step,state:'NATIVE_READ_CONNECTOR_UNAVAILABLE'});continue}
  if(selected.length<limit)selected.push({...step,state:'NATIVE_READ_REQUIRED'});
 }
 return {
  version:'MPC_CONNECTOR_FRONTIER_1.0',status:selected.length?'NEXT_NATIVE_READS_READY':
   blocked.length?'BLOCKED_NATIVE_CONNECTOR_CAPABILITY':'NO_ADDITIONAL_READ_SELECTED',
  current_pointer:r.current_pointer??null,selected_actions:selected,
  unavailable_actions:blocked,already_accounted_in_session:already,
  max_actions:limit,host_connector_calls:0,actual_state_changes:0,
  source_authentication:false,canonical_promotion:false,external_target_actions:false,
  next_action:selected.length?'Run the first selected native host read only, then update this receipt from actual evidence.':
   blocked.length?'Connect the named native provider or leave the source unresolved; never substitute Dash index as native read.':
   'No new native read suggested on unchanged supplied session state; verify fresh source ownership when required.'
 };
}
