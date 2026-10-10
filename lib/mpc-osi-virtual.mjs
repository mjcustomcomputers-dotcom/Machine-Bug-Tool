import {createHash} from 'node:crypto';
import {META_TRUTH,generateMetaMethodGraph,createMpcMetaCache} from './mpc-meta-logic.mjs';

// Virtual observation stack, NOT a claim to implement the ISO networking OSI model.
// Each layer reports only bounded coverage, dependencies and candidate methods.
export const MPC_VOSI_VERSION='MPC_VIRTUAL_OBSERVATION_STACK_1';
export const MPC_VOSI_LAYERS=Object.freeze({
  SCREEN:Object.freeze(['PIXELS','CROP_AND_MASK','OCR_DECODE','LEXICAL_CUES','INTERPRETATION','DEPENDENCY_DELTA','HUMAN_REVIEW']),
  NETWORK:Object.freeze(['OS_ENDPOINT_TABLE','SNAPSHOT_SCOPE','TRANSPORT_METADATA','PROCESS_MAPPING','STATE_DELTA','INTERPRETATION','HUMAN_REVIEW'])
});
const HEX=/^[0-9a-f]{64}$/u;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hex=value=>typeof value==='string'&&HEX.test(value);
const checkId=(value,label)=>{if(typeof value!=='string'||!ID.test(value))fail('VOSI_'+label+'_INVALID');return value;};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const number=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const quality=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const knownState=value=>['INITIAL','TEXT_CHANGED','TEXT_UNCHANGED'].includes(value);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);
  for(const child of Object.values(value))freeze(child);}return value;};
const status=(id,truth,reason,deps)=>({layer_id:id,truth,reason,depends_on:deps});
function checkGraphCache(cache){
  if(cache!==null&&cache!==undefined&&
    (typeof cache.get!=='function'||typeof cache.set!=='function'))fail('VOSI_META_CACHE_INVALID');
}
function candidateGraph({kind,project,session,sourceDigest,atoms,cache}){
  checkGraphCache(cache);
  const key={project_id:project,session_id:session,source_digest:sourceDigest,method_version:MPC_VOSI_VERSION};
  const hit=cache?.get(key);
  if(hit)return {graph:hit,cache_state:'HIT'};
  const graph=generateMetaMethodGraph({source_digest:sourceDigest,atoms,max_nodes:9,max_depth:3});
  cache?.set(key,graph);
  return {graph,cache_state:'MISS'};
}
function shell(kind,scope,observed,graph,cache_state,layers,route){
  return freeze({kind:'MPC_VIRTUAL_OBSERVATION_MODEL',version:MPC_VOSI_VERSION,
    modality:kind,scope,observed,virtual_layers:layers,router:route,
    method_generation:graph,meta_cache:cache_state,
    classifier_replaced:false,independent_evidence_proven:false,
    original_registry_unchanged:true,source_authentication:false,external_action_authorized:false});
}
function latencyRoute({confidence,truncated,area,changed,matched}){
  if(confidence===null)return {stage:'EVIDENCE_REVIEW',action:'CHECK_OCR_CONFIDENCE_UNKNOWN',
    reason:'OCR confidence not reported. Read the original pixels before trusting exact words.',automatic_recapture:false};
  if(truncated||confidence<70)return {stage:'ACQUISITION_REFINEMENT',
    action:'USER_RECAPTURE_SMALLER_CROP_OR_COMPARE_CONTRAST',
    reason:'The current OCR text is truncated or low-confidence. Reduce visual clutter, use a smaller crop, or compare image treatment.',
    automatic_recapture:false};
  if(matched>0)return {stage:'ANALYSIS',action:'REVIEW_SOURCE_BOUND_CUES',
    reason:'Lexical cues need source-context inspection; they do not authorize any action.',automatic_recapture:false};
  if(changed==='TEXT_UNCHANGED')return {stage:'CACHE_REUSE',action:'KEEP_EXISTING_CLASSIFICATION',
    reason:'No new OCR text; native reuse avoids restating unchanged hypotheses.',automatic_recapture:false};
  if(area!==null&&area>4_194_304)return {stage:'ACQUISITION_REFINEMENT',action:'OFFER_TARGETED_NATIVE_CROP',
    reason:'Large pixel area; an operator-selected crop may reduce OCR work without changing on-screen resolution.',automatic_recapture:false};
  return {stage:'SOURCE_REVIEW',action:'COMPARE_ORIGINAL_TEXT',
    reason:'No configured cue matched; absence of a match is not evidence of absence of risk.',automatic_recapture:false};
}
/** Consume already validated MPC OCR metadata; never store or reparse screen pixels. */
export function buildScreenVirtualOsi({
  project_id,session_id,source_id,frame_sha256,text_sha256,
  confidence=null,truncated=false,recognized_characters=0,
  cue_ids=[],change_state='INITIAL',frame_width=null,frame_height=null,
  cache=null
}={}){
  const project=checkId(project_id,'PROJECT'),session=checkId(session_id,'SESSION'),source=checkId(source_id,'SOURCE');
  if(!hex(frame_sha256)||!hex(text_sha256))fail('VOSI_SCREEN_DIGEST_INVALID');
  if(confidence!==null&&quality(confidence)===null||typeof truncated!=='boolean'||
    !Number.isSafeInteger(recognized_characters)||recognized_characters<0||recognized_characters>200_000||
    !Array.isArray(cue_ids)||cue_ids.length>12||cue_ids.some(id=>typeof id!=='string'||!/^[A-Z_]{2,48}$/u.test(id))||
    !knownState(change_state))fail('VOSI_SCREEN_INPUT_INVALID');
  const width=frame_width===null?null:number(frame_width),height=frame_height===null?null:number(frame_height);
  if((frame_width!==null&&(width===null||width<=0))||(frame_height!==null&&(height===null||height<=0)))fail('VOSI_FRAME_INVALID');
  const area=width!==null&&height!==null?width*height:null;
  if(area!==null&&(!Number.isSafeInteger(area)||area>300_000_000))fail('VOSI_FRAME_INVALID');
  const cues=[...new Set(cue_ids)].sort();
  const sourceDigest=digest([MPC_VOSI_VERSION,'SCREEN',project,session,source,frame_sha256,text_sha256,
    confidence,truncated,recognized_characters,cues,change_state,area]);
  const readable=confidence===null?META_TRUTH.UNKNOWN:
    confidence<70||truncated?META_TRUTH.NO:META_TRUTH.YES;
  const cueObserved=cues.length?META_TRUTH.YES:META_TRUTH.NO;
  const {graph,cache_state}=candidateGraph({kind:'SCREEN',project,session,sourceDigest,
    atoms:[{id:'OCR_READABILITY_DECLARED',truth:readable,
      meaning:'The OCR engine reported confidence at least 70 and no truncation.',depends_on:['TEXT_DIGEST']},
    {id:'LEXICAL_CUE_MATCH_OBSERVED',truth:cueObserved,
      meaning:'At least one of the configured lexical rules matched this particular OCR transcript.',depends_on:['TEXT_DIGEST']}],cache});
  const l=MPC_VOSI_LAYERS.SCREEN;
  const layers=[
    status(l[0],META_TRUTH.YES,'A bounded native captured frame was received; the frame is not independently authenticated.',[]),
    status(l[1],META_TRUTH.YES,'The original capture session supplied geometry, crop and pre-OCR privacy masks.',['PIXELS']),
    status(l[2],readable,'OCR confidence is an engine estimate, not a calibrated correctness probability.',['CROP_AND_MASK']),
    status(l[3],cueObserved,'Only exact configured English lexical rules were evaluated; a nonmatch is local to those rules.',['OCR_DECODE']),
    status(l[4],META_TRUTH.UNKNOWN,'Author, intent and meaning remain unverified even when cues match.',['LEXICAL_CUES']),
    status(l[5],change_state==='TEXT_UNCHANGED'?META_TRUTH.NO:META_TRUTH.YES,
      'Only the current source-bound OCR text delta is observed; dependencies may need invalidation.',['OCR_DECODE','LEXICAL_CUES']),
    status(l[6],META_TRUTH.UNKNOWN,'Human review is not an observed completed action.',['INTERPRETATION','DEPENDENCY_DELTA'])
  ];
  return shell('SCREEN',{project_id:project,session_id:session,source_id:source},
    {frame_sha256,text_sha256,confidence,ocr_truncated:truncated,recognized_characters,
      matched_cue_ids:cues,change_state,frame_pixels:area,reasoning_stage:'SOURCE_BOUND_CANDIDATES'},
    graph,cache_state,layers,latencyRoute({confidence,truncated,area,changed:change_state,matched:cues.length}));
}
export function buildNetworkVirtualOsi({snapshot,diff=null,cache=null}={}){
  if(!snapshot||snapshot.kind!=='MPC_NETWORK_ENDPOINT_OBSERVATION'||
     !hex(snapshot.fingerprint)||typeof snapshot.project_id!=='string'||!snapshot.counts||
     !Number.isSafeInteger(snapshot.counts.total)||snapshot.counts.total<0||
     !Number.isSafeInteger(snapshot.counts.established)||snapshot.counts.established<0||
     !['COMPLETE_FOR_REPORTED_OS_TABLES','PARTIAL'].includes(snapshot.completeness))fail('VOSI_NETWORK_INPUT_INVALID');
  const project=checkId(snapshot.project_id,'PROJECT'),session='LOCAL-NETWORK',source='WINDOWS-NETTCPIP';
  const coverage=snapshot.completeness==='COMPLETE_FOR_REPORTED_OS_TABLES';
  const active=snapshot.counts.established>0?META_TRUTH.YES:coverage?META_TRUTH.NO:META_TRUTH.UNKNOWN;
  const complete=coverage?META_TRUTH.YES:META_TRUTH.UNKNOWN;
  const delta=diff?.state??'INITIAL';
  if(!['INITIAL','COMPARED','PARTIAL_COMPARISON','NOT_COMPARABLE'].includes(delta))fail('VOSI_NETWORK_DELTA_INVALID');
  const sourceDigest=digest([MPC_VOSI_VERSION,'NETWORK',project,snapshot.fingerprint,snapshot.completeness,
    snapshot.counts.total,snapshot.counts.established,delta]);
  const {graph,cache_state}=candidateGraph({kind:'NETWORK',project,session,sourceDigest,
    atoms:[{id:'TCP_ESTABLISHED_IN_THIS_SNAPSHOT',truth:active,
      meaning:'An established TCP endpoint was included in this exact OS table snapshot.',depends_on:['OS_SNAPSHOT']},
    {id:'REPORTED_TABLE_COVERAGE_COMPLETE',truth:complete,
      meaning:'Both queried native socket tables were returned without row-limit truncation.',depends_on:['OS_SNAPSHOT']}],cache});
  const l=MPC_VOSI_LAYERS.NETWORK;
  const layers=[
    status(l[0],META_TRUTH.YES,'Native OS metadata was returned once; no packet payload observed.',[]),
    status(l[1],complete,'This is a bounded non-atomic OS table query, not complete network history.',['OS_ENDPOINT_TABLE']),
    status(l[2],active,'Established TCP status refers only to reported rows at observation time.',['SNAPSHOT_SCOPE']),
    status(l[3],META_TRUTH.UNKNOWN,'PID/process-name association is best effort, not signed process attribution.',['OS_ENDPOINT_TABLE']),
    status(l[4],delta==='COMPARED'?META_TRUTH.YES:META_TRUTH.UNKNOWN,
      'An exact-source two-snapshot comparison does not prove absence between samples.',['SNAPSHOT_SCOPE']),
    status(l[5],META_TRUTH.UNKNOWN,'Network intent or harm cannot be inferred from ports alone.',['TRANSPORT_METADATA','PROCESS_MAPPING']),
    status(l[6],META_TRUTH.UNKNOWN,'Operator review required; no network action authorized.',['INTERPRETATION'])
  ];
  const action=coverage?'REVIEW_OBSERVED_ENDPOINTS':'REFRESH_PARTIAL_TABLES';
  const route={stage:coverage?'ANALYSIS':'EVIDENCE_ACQUISITION',action,
    reason:coverage?'Compare only observed endpoint identities and protocol state; preserve alternative explanations.':
      'An unavailable or truncated table cannot support negative or complete-coverage claims.',
    external_probing:false,automatic_recapture:false};
  return shell('NETWORK',{project_id:project,session_id:session,source_id:source},
    {snapshot_sha256:snapshot.fingerprint,reported_connections:snapshot.counts.total,
      established:snapshot.counts.established,table_coverage:snapshot.completeness,delta_state:delta,
      packet_payloads_captured:false},graph,cache_state,layers,route);
}
/** Separate-source cross-check is a review plan only, never synthesized traffic evidence. */
export function crossExamineVirtualObservations(screen,network){
  if(!screen||!network||screen.kind!=='MPC_VIRTUAL_OBSERVATION_MODEL'||
    network.kind!=='MPC_VIRTUAL_OBSERVATION_MODEL'||
    screen.modality!=='SCREEN'||network.modality!=='NETWORK')fail('VOSI_CROSS_SOURCE_INPUT_INVALID');
  const comparable=screen.scope.project_id===network.scope.project_id;
  return Object.freeze({
    kind:'MPC_CROSS_MODAL_METHOD_HOOK',version:MPC_VOSI_VERSION,
    outcome:comparable?'CROSS_SOURCE_REVIEW_CANDIDATE':'NOT_COMPARABLE_DIFFERENT_PROJECT',
    source_binding:[screen.method_generation.source_digest,network.method_generation.source_digest],
    method_operators:['COMPARE','INVERT_DEPENDENCY','CHALLENGE'],
    independent_authentication:false,shared_event_proven:false,
    target_traffic_authorized:false,proposed_only:true,
    next_action:comparable?'Establish exact actor, time, object and native process/source identity before correlating screen and socket events.':
      'Select matching project scopes and separately consented native sources before comparing.'
  });
}
export function createVirtualOsiCache(options){return createMpcMetaCache(options);}
