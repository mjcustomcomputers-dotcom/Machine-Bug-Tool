import {createHash} from 'node:crypto';

const sha256=value=>createHash('sha256').update(value).digest('hex');
const encode=value=>Buffer.from(JSON.stringify(value),'utf8').toString('base64');
const cspHash=value=>createHash('sha256').update(value).digest('base64');
const order=(a,b)=>a<b?-1:a>b?1:0;
const asArray=value=>Array.isArray(value)?value:[];
const text=(value,limit=2048)=>String(value??'').slice(0,limit);
const upper=value=>text(value,128).trim().toUpperCase().replace(/[^A-Z0-9_-]+/gu,'_');
const stable=value=>{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort(order).map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
 return JSON.stringify(value);
};

const FACETS=Object.freeze({
 'discipline':'taxonomy:discipline','purpose':'taxonomy:purpose','direction':'taxonomy:direction','evidence':'taxonomy:evidence','implementation':'implementation',
 'model-kind':'taxonomy:model-kind','workflow-stage':'taxonomy:workflow-stage','source-review':'source_review','source-class':'source_class',
 'dim':'dimension','dimension':'dimension','family':'family','id':'method_id','method':'method_id','provenance':'provenance',
 'related':'related','edge':'edge','quantum':'quantum'
});

const PROVIDERS=Object.freeze([
 ['GITHUB','GitHub connector','Protected repository connector'],['GIT_REMOTE','Local Git source transport','Configured repository transport; not a GitHub connector receipt'],
 ['GOOGLE_DRIVE','Google Drive','Native files and create-new drafts'],
 ['GMAIL','Gmail','Draft-only mail output'],['DROPBOX','Dropbox','Create-new file output'],
 ['DROPBOX_DASH','Dropbox Dash','Search projection; resolve native source'],['MPC_MACHINE_LEGAL','MPC Machine Legal','Protected analytical service'],
 ['MPC_MACHINE_LEGAL_SKILL','MPC Machine Legal skill','Local skill availability; not connector authentication'],
 ['MPC_BUGTOOLS','MPC Machine Legal BugTools','Protected bounded evaluators'],['SCITE','Scite','Citation context research'],
 ['PARALLEL_SEARCH','Parallel Search','Live research retrieval'],['TVBRAIN','TvBrain','Specialist research surface'],
 ['CUSTOM_GPT_OR_AI_HOST','Custom GPT / AI host','Host-mediated model bridge'],['LOCAL_MODEL_HOST','Local model host','Loopback model bridge']
]);

const CONNECTOR_ACTIONS=Object.freeze({
 GOOGLE_DRIVE:new Set(['CREATE_NEW']),GMAIL:new Set(['CREATE_DRAFT']),
 GITHUB:new Set(['CREATE_NEW_BRANCH_ARTIFACT']),DROPBOX:new Set(['CREATE_NEW']),
 MPC_MACHINE_LEGAL:new Set(['REQUEST_ANALYSIS']),MPC_BUGTOOLS:new Set(['REQUEST_ANALYSIS']),
 CUSTOM_GPT_OR_AI_HOST:new Set(['REQUEST_ANALYSIS']),LOCAL_MODEL_HOST:new Set(['REQUEST_ANALYSIS'])
});
const CONNECTOR_DESTINATIONS=Object.freeze({GOOGLE_DRIVE:new Set(['CREATE_NEW']),GITHUB:new Set(['NEW_BRANCH_ONLY']),
 GMAIL:new Set(['DRAFT_ONLY']),DROPBOX:new Set(['CREATE_NEW']),MPC_MACHINE_LEGAL:new Set(['ANALYSIS_REQUEST_ONLY']),
 MPC_BUGTOOLS:new Set(['ANALYSIS_REQUEST_ONLY']),CUSTOM_GPT_OR_AI_HOST:new Set(['ANALYSIS_REQUEST_ONLY']),LOCAL_MODEL_HOST:new Set(['ANALYSIS_REQUEST_ONLY'])});
const CONNECTOR_PAYLOAD_KEYS=Object.freeze(['run_id','artifact_name','artifact_sha256','artifact_bytes','media_type','destination_hint','content']);
const CONNECTOR_CONTENT_ENVELOPE_KEYS=new Set(['state','host_action_called','host_action_performed','write_performed','provider_receipt','provider_receipt_json','dispatch_status','sent_at','sent_at_utc']);

function fail(code){throw new Error(code)}
function words(value){return text(value,200000).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu)??[]}
function unique(values){return [...new Set(values)]}
function credentialLike(value){
 const candidate=String(value??'');
 return /(?:-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/=-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAIza[0-9A-Za-z_-]{30,}|\bya29\.[0-9A-Za-z._~-]{20,}|\bxox[baprs]-[A-Za-z0-9-]{16,}|\bAKIA[A-Z0-9]{16}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\bsk-[A-Za-z0-9_-]{24,}|(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,})/iu.test(candidate);
}
function safeJson(value,depth=0){
 if(depth>8)fail('WORKBENCH_PAYLOAD_DEPTH_EXCEEDED');
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='string'){
  if(credentialLike(value))fail('WORKBENCH_CREDENTIAL_VALUE_REJECTED');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))fail('WORKBENCH_CONTROL_CHARACTER_REJECTED');
  if(Buffer.byteLength(value,'utf8')>262_144)fail('WORKBENCH_JSON_STRING_TOO_LARGE');
  return value;
 }
 if(Array.isArray(value)){
  if(value.length>512)fail('WORKBENCH_JSON_ARRAY_TOO_LARGE');
  return value.map(item=>safeJson(item,depth+1));
 }
 if(value&&typeof value==='object'){
  const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)fail('WORKBENCH_UNSAFE_OBJECT_PROTOTYPE_REJECTED');
  if(Object.keys(value).length>256)fail('WORKBENCH_JSON_OBJECT_TOO_LARGE');
  const out={};
  for(const key of Object.keys(value)){
   if(/[\u0000-\u001f\u007f]/u.test(key))fail('WORKBENCH_CONTROL_CHARACTER_REJECTED');
   if(Buffer.byteLength(key,'utf8')>96)fail('WORKBENCH_JSON_KEY_TOO_LARGE');
   if(['__proto__','prototype','constructor'].includes(key))fail('WORKBENCH_UNSAFE_OBJECT_KEY_REJECTED');
   if(/(?:authorization|credential|password|passwd|secret|token|cookie|oauth|api[_-]?key|private[_-]?key)/iu.test(key))fail('WORKBENCH_CREDENTIAL_FIELD_REJECTED');
   out[text(key,96)]=safeJson(value[key],depth+1);
  }
  return out;
 }
 return null;
}

function tokenizeQuery(raw){
 const source=String(raw??'');if(Buffer.byteLength(source,'utf8')>8192)fail('WORKBENCH_QUERY_TOO_LARGE');
 const tokens=[];
 let value='',quoted=false,quote=false;
 for(let index=0;index<source.length;index++){
  const char=source[index];
  if(char==='"'){quoted=!quoted;quote=true;continue}
  if(/\s/u.test(char)&&!quoted){if(value){tokens.push({value,quoted:quote});value='';quote=false}continue}
  value+=char;
 }
 if(quoted)fail('WORKBENCH_QUERY_UNCLOSED_QUOTE');
 if(value)tokens.push({value,quoted:quote});
 return tokens;
}

function parseCsv(raw){
 const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
 const pushCell=()=>{row.push(cell);cell='';afterQuote=false;if(row.length>512)fail('WORKBENCH_CSV_COLUMN_LIMIT_EXCEEDED')};
 const pushRow=()=>{pushCell();rows.push(row);row=[];if(rows.length>10000)fail('WORKBENCH_CSV_ROW_LIMIT_EXCEEDED')};
 for(let index=0;index<raw.length;index++){
  const char=raw[index];
  if(quoted){
   if(char==='"'&&raw[index+1]==='"'){cell+='"';index++;continue}
   if(char==='"'){quoted=false;afterQuote=true;continue}
   cell+=char;continue;
  }
  if(afterQuote&&char!==','&&char!=='\r'&&char!=='\n')fail('WORKBENCH_CSV_INVALID_TRAILING_CHARACTER');
  if(char==='"'){
   if(cell.length)fail('WORKBENCH_CSV_QUOTE_NOT_AT_CELL_START');
   quoted=true;continue;
  }
  if(char===','){pushCell();continue}
  if(char==='\r'&&raw[index+1]==='\n'){pushRow();index++;continue}
  if(char==='\r'||char==='\n'){pushRow();continue}
  cell+=char;
 }
 if(quoted)fail('WORKBENCH_CSV_UNCLOSED_QUOTE');
 if(cell.length||row.length)pushRow();
 if(!rows.length)rows.push(['']);
 return rows;
}

/** Validate and profile literal TXT, JSON or RFC-4180-style CSV input without semantic schema inference. */
export function parseResearchWorkbenchInput(input,{formatHint='AUTO'}={}){
 const objectInput=typeof input!=='string',raw=objectInput?JSON.stringify(input):input;
 if(typeof raw!=='string')fail('WORKBENCH_INPUT_REQUIRED');
 const bytes=Buffer.byteLength(raw,'utf8');if(bytes>262_144)fail('WORKBENCH_INPUT_TOO_LARGE');
 let format=upper(formatHint||'AUTO');if(format==='TXT')format='TEXT';
 if(!['AUTO','TEXT','JSON','CSV'].includes(format))fail('WORKBENCH_INPUT_FORMAT_UNSUPPORTED');
 if(objectInput)format='JSON';
 const trimmed=raw.trim();
 if(format==='AUTO'){
  if(trimmed.startsWith('{')||trimmed.startsWith('['))format='JSON';
  else if(/[\r\n]/u.test(raw)&&raw.includes(',')){
   const rows=parseCsv(raw),width=rows[0]?.length??0;
   if(rows.length>1&&width>1){if(rows.some(row=>row.length!==width))fail('WORKBENCH_CSV_RAGGED_ROWS');format='CSV'}else format='TEXT';
  }else format='TEXT';
 }
 if(format==='JSON'){
  let parsed;try{parsed=objectInput?input:JSON.parse(raw)}catch{fail('WORKBENCH_JSON_INVALID')}
  const canonical=stable(parsed);
  return {canonical_text:canonical,profile:{format:'JSON',utf8_bytes:bytes,root_type:Array.isArray(parsed)?'ARRAY':parsed===null?'NULL':typeof parsed,
   item_count:Array.isArray(parsed)?parsed.length:parsed&&typeof parsed==='object'?Object.keys(parsed).length:1,semantic_schema_inferred:false}};
 }
 if(format==='CSV'){
  const rows=parseCsv(raw),columns=Math.max(...rows.map(row=>row.length));
  if(rows.some(row=>row.length!==columns))fail('WORKBENCH_CSV_RAGGED_ROWS');
  return {canonical_text:rows.flat().join(' '),profile:{format:'CSV',utf8_bytes:bytes,row_count:rows.length,column_count:columns,
   header_inferred:false,semantic_schema_inferred:false}};
 }
 return {canonical_text:raw,profile:{format:'TEXT',utf8_bytes:bytes,line_count:raw.length?raw.split(/\r\n|\r|\n/u).length:0,semantic_schema_inferred:false}};
}

/** Parse deterministic local query syntax. Repeated values within one facet are OR; distinct facets are AND. */
export function parseWorkbenchQuery(raw=''){
 const facets={},terms=[],phrases=[];
 for(const token of tokenizeQuery(raw)){
  const split=token.value.indexOf(':');
  if(split>0&&/^[a-z][a-z-]*$/iu.test(token.value.slice(0,split))){
   const name=token.value.slice(0,split).toLowerCase(),value=token.value.slice(split+1).trim();
   if(name==='http'||name==='https'){(token.quoted?phrases:terms).push(token.value.toLowerCase());continue}
   if(!Object.hasOwn(FACETS,name))fail('WORKBENCH_UNKNOWN_FACET:'+name);
   if(!value)fail('WORKBENCH_EMPTY_FACET:'+name);
   const canonical=FACETS[name];
   (facets[canonical]??=[]).push({name,value:value.toUpperCase()});
  }else (token.quoted?phrases:terms).push(token.value.toLowerCase());
 }
 for(const key of Object.keys(facets))facets[key]=facets[key].sort((a,b)=>order(a.value,b.value));
 return {raw:text(raw,10000),terms:unique(terms).sort(order),phrases:unique(phrases).sort(order),facets};
}

function taxonomyTag(value){
 const raw=text(value,512),split=raw.indexOf(':');
 return split<1?upper(raw):upper(raw.slice(0,split))+':'+upper(raw.slice(split+1));
}

function facetValues(method,key,edges){
 const source=method.source??{};
 if(key.startsWith('taxonomy:'))return asArray(method.taxonomy_tags).map(taxonomyTag);
 if(key==='dimension')return asArray(method.dimensions).map(upper);
 if(key==='family')return [upper(method.family)];
 if(key==='method_id')return [upper(method.method_id)];
 if(key==='implementation')return [upper(method.implementation_state),...asArray(method.taxonomy_tags).filter(v=>text(v).toUpperCase().startsWith('IMPLEMENTATION:')).map(v=>upper(text(v).split(':').slice(1).join(':')))];
 if(key==='provenance')return [upper(method.provenance_state)];
 if(key==='quantum')return [upper(method.quantum_requirement)];
 if(key==='source_class')return [upper(source.source_class)];
 if(key==='source_review')return [upper(source.review_state)];
 if(key==='related')return edges.filter(row=>row.method_id===method.method_id||row.related_method_id===method.method_id).map(row=>upper(row.method_id===method.method_id?row.related_method_id:row.method_id));
 if(key==='edge')return edges.filter(row=>row.method_id===method.method_id||row.related_method_id===method.method_id).map(row=>upper(row.relation_type));
 return [];
}

function matchesFacets(method,facets,edges){
 return Object.entries(facets).every(([key,requested])=>{
  const values=facetValues(method,key,edges);
  return requested.some(({value})=>values.some(candidate=>candidate===(key.startsWith('taxonomy:')?upper(key.slice(9)).replaceAll('-','_')+':'+value:value)));
 });
}

function rankMethod(method,needles,inputTokens,edges){
 const fields=[
  ['method_id',method.method_id,120],['method_name',method.method_name,42],['dimensions',asArray(method.dimensions).join(' '),24],
  ['family',method.family,18],['taxonomy',asArray(method.taxonomy_tags).join(' '),14],['mechanism',method.mechanism,11],
  ['classifier_question',method.classifier?.question,10],['required_input',method.required_input,9],['falsifier',method.falsifier,9],
  ['source',method.source?.title,8]
 ];
 const reasons=[];let score=0;
 for(const needle of needles){
  for(const [field,raw,weight] of fields){
   const candidate=text(raw,20000).toLowerCase();
   if(!candidate||!candidate.includes(needle))continue;
   const exact=candidate===needle,points=weight*(exact?3:1);score+=points;reasons.push({field,term:needle,points});
  }
 }
 const inputSet=new Set(inputTokens);
 for(const [field,raw,weight] of fields.slice(1)){
  const overlap=unique(words(raw).filter(value=>value.length>2&&inputSet.has(value))).sort(order);
  if(!overlap.length)continue;
  const points=Math.min(overlap.length,8)*Math.max(1,Math.floor(weight/4));score+=points;
  reasons.push({field,term:overlap.join(', '),points});
 }
 const declared=edges.filter(row=>row.method_id===method.method_id||row.related_method_id===method.method_id).length;
 return {score,reasons:reasons.sort((a,b)=>b.points-a.points||order(a.field,b.field)||order(a.term,b.term)),declared_relation_count:declared};
}

/** Run source-bound, deterministic metadata hook discovery. This never executes a registered method. */
export function analyzeResearchInput(scan,input,options={}){
 if(!scan||!Array.isArray(scan.methods)||!Array.isArray(scan.sources))fail('WORKBENCH_SCAN_REQUIRED');
 const parsedInput=parseResearchWorkbenchInput(input,{formatHint:options.formatHint??options.format??'AUTO'}),raw=parsedInput.canonical_text;
 const parsed=parseWorkbenchQuery(options.query??''),edges=asArray(scan.relation_graph?.edges),inputTokens=unique(words(raw).filter(value=>value.length>2)).sort(order);
 const needles=unique([...parsed.terms,...parsed.phrases,...inputTokens]).filter(value=>value.length>1).slice(0,512);
 const limit=Math.max(1,Math.min(100,Number(options.limit??24)||24));
 const candidates=scan.methods.filter(method=>matchesFacets(method,parsed.facets,edges)).map(method=>{
  const rank=rankMethod(method,needles,inputTokens,edges);
  return {method_id:method.method_id,method_name:method.method_name,family:method.family,implementation_state:method.implementation_state,
   primary_source_id:method.primary_source_id,required_input:method.required_input,falsifier:method.falsifier,score:rank.score,
   match_reasons:rank.reasons,declared_relation_count:rank.declared_relation_count,method_execution_performed:false};
 }).filter(row=>needles.length===0||row.score>0).sort((a,b)=>b.score-a.score||order(a.method_id,b.method_id));
 const selected=candidates.slice(0,limit),sourceIds=new Set(selected.map(row=>row.primary_source_id));
 const sources=scan.sources.filter(row=>sourceIds.has(row.source_id)).map(row=>({source_id:row.source_id,title:row.title,source_class:row.source_class,
  review_state:row.review_state,checked_on:row.checked_on})).sort((a,b)=>order(a.source_id,b.source_id));
 return {status:'LOCAL_STATIC_HOOK_DISCOVERY_COMPLETE',analysis_mode:'DETERMINISTIC_LOCAL_METADATA_MATCH',query:parsed,
  input_profile:{...parsedInput.profile,sha256:sha256(raw),token_count:inputTokens.length,content_embedded:false},
  inventory:{research_methods:scan.methods.length,sources:scan.sources.length,implemented_evaluators:asArray(scan.implemented_contracts).length},
  candidates_examined:candidates.length,result_count:selected.length,methods:selected,sources,
  method_execution_performed:false,source_authentication:false,independent_evidence_proven:false,canonical_promotion:false,
  limitations:['Matches are deterministic metadata hooks, not executed methods.','Ranking is lexical and source-bound; “best” expertise or completeness is not established.']};
}

/** Build a non-executing connector envelope suitable for local export or loopback-host queuing. */
export function buildConnectorRequest({provider,action,label='MPC Research Workbench output',payload={}}={}){
 const normalizedProvider=upper(provider),normalizedAction=upper(action),actions=CONNECTOR_ACTIONS[normalizedProvider];
 if(!actions||!actions.has(normalizedAction))fail('WORKBENCH_CONNECTOR_ACTION_NOT_ALLOWED');
 const cleanLabel=text(label,160).trim();if(!cleanLabel)fail('WORKBENCH_CONNECTOR_LABEL_REQUIRED');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(cleanLabel)||credentialLike(cleanLabel))fail('WORKBENCH_CONNECTOR_LABEL_REJECTED');
 const safePayload=safeJson(payload),keys=Object.keys(safePayload).sort(order);
 if(stable(keys)!==stable([...CONNECTOR_PAYLOAD_KEYS].sort(order)))fail('WORKBENCH_CONNECTOR_PAYLOAD_SCHEMA_INVALID');
 if(safePayload.run_id!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(safePayload.run_id))fail('WORKBENCH_CONNECTOR_RUN_ID_INVALID');
 if(typeof safePayload.artifact_name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.json$/u.test(safePayload.artifact_name)||safePayload.artifact_name.includes('..'))fail('WORKBENCH_CONNECTOR_ARTIFACT_NAME_INVALID');
 if(!/^[a-f0-9]{64}$/u.test(safePayload.artifact_sha256)||!Number.isSafeInteger(safePayload.artifact_bytes)||safePayload.artifact_bytes<0||safePayload.artifact_bytes>524288||safePayload.media_type!=='application/json')fail('WORKBENCH_CONNECTOR_ARTIFACT_INVALID');
 if(!CONNECTOR_DESTINATIONS[normalizedProvider]?.has(safePayload.destination_hint))fail('WORKBENCH_CONNECTOR_DESTINATION_INVALID');
 if(!safePayload.content||Array.isArray(safePayload.content)||typeof safePayload.content!=='object')fail('WORKBENCH_CONNECTOR_CONTENT_INVALID');
 const normalizedKey=key=>key.replace(/([a-z0-9])([A-Z])/gu,'$1_$2').toLowerCase().replace(/[^a-z0-9]+/gu,'_').replace(/^_|_$/gu,'');
 if(Object.keys(safePayload.content).some(key=>CONNECTOR_CONTENT_ENVELOPE_KEYS.has(normalizedKey(key))))fail('WORKBENCH_CONNECTOR_CONTENT_ENVELOPE_REJECTED');
 const artifact=JSON.stringify(safePayload.content,null,2)+'\n';
 if(Buffer.byteLength(artifact)!==safePayload.artifact_bytes||sha256(artifact)!==safePayload.artifact_sha256)fail('WORKBENCH_CONNECTOR_ARTIFACT_PARITY_MISMATCH');
 const base={provider:normalizedProvider,action:normalizedAction,label:cleanLabel,payload:safePayload};
 return {...base,request_id:'WRQ-'+sha256(stable(base)).slice(0,24),state:'QUEUED_LOCALLY_NOT_SENT',host_action_called:false,
  host_action_performed:false,write_performed:false,provider_receipt:null,canonical_promotion:false};
}

function cleanMethod(row){
 return {method_id:text(row.method_id,64),method_name:text(row.method_name,512),family:text(row.family,128),mechanism:text(row.mechanism,8000),
  required_input:text(row.required_input,4000),falsifier:text(row.falsifier,4000),implementation_state:text(row.implementation_state,128),
  quantum_requirement:text(row.quantum_requirement,128),primary_source_id:text(row.primary_source_id,128),provenance_state:text(row.provenance_state,128),
  source:row.source?cleanSource(row.source):null,dimensions:asArray(row.dimensions).map(value=>text(value,128)),
  trigger_profile:asArray(row.trigger_profile).map(value=>text(value,256)),classifier:row.classifier?{
   classifier_id:text(row.classifier.classifier_id,128),question:text(row.classifier.question,4000),missing_evidence:text(row.classifier.missing_evidence,4000),
   falsifier:text(row.classifier.falsifier,4000),classifier_state:text(row.classifier.classifier_state,128)}:null,
  taxonomy_tags:asArray(row.taxonomy_tags).map(value=>text(value,256)),crosswalks:asArray(row.crosswalks).map(value=>({
   parent_namespace:text(value.parent_namespace,128),parent_native_id:text(value.parent_native_id,128),link_status:text(value.link_status,128),basis:text(value.basis,1000)})),
  incoming_relation_count:Number(row.incoming_relation_count)||0,outgoing_relation_count:Number(row.outgoing_relation_count)||0,
  self_contract:row.self_contract?{contract_status:text(row.self_contract.contract_status,128),survival:safeJson(row.self_contract.survival??{}),method_execution_performed:false}:null};
}
function cleanSource(row){return {source_id:text(row.source_id,128),title:text(row.title,1000),native_url:text(row.native_url,4000),source_class:text(row.source_class,128),review_state:text(row.review_state,128),checked_on:text(row.checked_on,64)}}
function cleanImplemented(row){return {method_id:text(row.method_id,128),canonical_name:text(row.canonical_name,1000),implementation_state:text(row.implementation_state,128),required_inputs:asArray(row.required_inputs).map(value=>text(value,256)),output_type:text(row.output_type,128),contract_status:text(row.contract_status,256),capsule_sha256:text(row.capsule_sha256,128)}}
function cleanEdge(row){return {method_id:text(row.method_id,64),related_method_id:text(row.related_method_id,64),relation_type:text(row.relation_type,128),rationale:text(row.rationale,2000),evidence_independent:Boolean(row.evidence_independent),link_status:text(row.link_status,128)}}

function capabilityRows(context){
 const caps=context?.capabilities?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context.capabilities:
  context?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context:context?.capabilities;
 const surfaceName={GITHUB_PLUGIN:'GITHUB',GIT_REMOTE:'GIT_REMOTE',MPC_MACHINE_LEGAL_CONNECTOR:'MPC_MACHINE_LEGAL',
  MPC_MACHINE_LEGAL_SKILL:'MPC_MACHINE_LEGAL_SKILL',MPC_BUGTOOLS:'MPC_BUGTOOLS'};
 const evidenceProvider=name=>name.startsWith('MPC_')?'MPC_BUGTOOLS':name.startsWith('GOOGLE_DRIVE_')?'GOOGLE_DRIVE':
  name.startsWith('DROPBOX_DASH_')?'DROPBOX_DASH':name.startsWith('DROPBOX_')?'DROPBOX':name;
 const schemaSurfaces=asArray(caps?.surfaces).map(row=>({provider:surfaceName[row.name]??row.name,status:row.capability_status+'__'+row.protected_call_status,
  protected_call_status:row.protected_call_status,available:row.capability_status==='AVAILABLE_CURRENT_SESSION'||row.capability_status==='AVAILABLE_SOURCE_GIT_ONLY',
  receipt_sha256:row.receipt_sha256,scope:row.scope,current:row.scope==='CURRENT_SESSION'}));
 const schemaEvidence=asArray(caps?.prior_evidence).map(row=>({provider:evidenceProvider(row.name),status:'PRIOR_EVIDENCE_ONLY:'+row.name,
  available:false,receipt_sha256:row.receipt_sha256,scope:row.scope}));
 const current=asArray(context?.current_capabilities).concat(Array.isArray(caps)?caps:asArray(caps?.current),schemaSurfaces.filter(row=>row.current));
 const prior=asArray(context?.prior_capabilities).concat(asArray(caps?.prior),schemaSurfaces.filter(row=>!row.current),schemaEvidence);
 const clean=(row,scope)=>({provider:upper(row.provider??row.surface??row.service),scope,status:upper(row.status??(row.available?'AVAILABLE_NOT_VERIFIED':'UNAVAILABLE')),
  available:Boolean(row.available),operations:asArray(row.operations).map(upper).filter(Boolean).sort(order),checked_at:text(row.checked_at??row.observed_at,64),
  receipt_sha256:/^[a-f0-9]{64}$/iu.test(text(row.receipt_sha256??row.receipt_hash,128))?text(row.receipt_sha256??row.receipt_hash,128).toLowerCase():null,
  protected_call_verified:(row.protected_call_verified===true||row.protected_call_status==='SUCCEEDED_CURRENT_SESSION')&&/^[a-f0-9]{64}$/iu.test(text(row.receipt_sha256??row.receipt_hash,128))});
 return {current:current.map(row=>clean(row,'CURRENT_SESSION')).filter(row=>row.provider),prior:prior.map(row=>clean(row,'PRIOR_EVIDENCE_ONLY')).filter(row=>row.provider)};
}
function cleanReceipts(context){
 const caps=context?.capabilities?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context.capabilities:
  context?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context:null;
 const current=capabilityRows(context).current.filter(row=>row.receipt_sha256).map(row=>({receipt_id:'CURRENT_'+row.provider,provider:row.provider,
  kind:'CURRENT_CAPABILITY_RECEIPT',status:row.status,receipt_sha256:row.receipt_sha256,current_session:true,protected_call_verified:row.protected_call_verified}));
 const embedded=asArray(caps?.prior_evidence).map(row=>({receipt_id:row.name,provider:row.name.startsWith('MPC_')?'MPC_BUGTOOLS':row.name.startsWith('GOOGLE_DRIVE_')?'GOOGLE_DRIVE':row.name.startsWith('DROPBOX_DASH_')?'DROPBOX_DASH':'DROPBOX',kind:'PRIOR_CAPABILITY_EVIDENCE',status:'PRIOR_EVIDENCE_ONLY',receipt_sha256:row.receipt_sha256}));
 return asArray(context?.receipts).concat(current,embedded).slice(0,256).map(row=>({receipt_id:text(row.receipt_id??row.id,160),provider:upper(row.provider??row.surface),
  kind:upper(row.kind),status:upper(row.status),scope:row.current_session===true?'CURRENT_SESSION':'PRIOR_OR_IMPORTED_EVIDENCE',
  observed_at:text(row.observed_at??row.checked_at,64),receipt_sha256:/^[a-f0-9]{64}$/iu.test(text(row.receipt_sha256??row.sha256,128))?text(row.receipt_sha256??row.sha256,128).toLowerCase():null,
  protected_call_verified:row.current_session===true&&row.protected_call_verified===true&&/^[a-f0-9]{64}$/iu.test(text(row.receipt_sha256??row.sha256,128))}));
}
function providerState(context){
 const rows=capabilityRows(context);
 return PROVIDERS.map(([provider,label,description])=>{
  const current=rows.current.filter(row=>row.provider===provider),prior=rows.prior.filter(row=>row.provider===provider);
  const verified=current.find(row=>row.protected_call_verified),observed=current[0];
  let status=['GMAIL','CUSTOM_GPT_OR_AI_HOST','LOCAL_MODEL_HOST'].includes(provider)?'HOST_BRIDGE_REQUIRED_NOT_CONFIGURED':'NOT_REGISTERED_IN_CAPABILITY_SNAPSHOT';
  if(verified)status='CURRENT_PROTECTED_RECEIPT_RECORDED';else if(observed)status=observed.status||'CURRENT_CAPABILITY_REPORTED';else if(prior.length)status='PRIOR_EVIDENCE_ONLY';
  return {provider,label,description,status,current,prior,connected_claim:false};
 });
}

/** Create the compact, credential-free data payload embedded into the standalone workbench. */
export function buildResearchWorkbenchPayload(scan,context={}){
 if(!scan||!Array.isArray(scan.methods)||!Array.isArray(scan.sources)||!Array.isArray(scan?.pair_scan?.rows))fail('WORKBENCH_SCAN_REQUIRED');
 const methods=scan.methods.map(cleanMethod),methodIndex=new Map(methods.map((row,index)=>[row.method_id,index]));
 const statuses=[...new Set(scan.pair_scan.rows.flatMap(row=>Object.values(row.assessment??{})).map(value=>text(value,256)))].sort(order),statusIndex=new Map(statuses.map((value,index)=>[value,index]));
 const pairs=scan.pair_scan.rows.map(row=>{
  const evidence=row.evidence_vector??{},mask=(evidence.same_primary_source_id?1:0)|(evidence.same_exact_source_locator?2:0)|(evidence.same_family?4:0)|(evidence.same_dimension_set?8:0)|(evidence.same_taxonomy_signature?16:0)|(evidence.same_classifier_question?32:0);
  return [methodIndex.get(row.method_id_a),methodIndex.get(row.method_id_b),mask,statusIndex.get(text(row.assessment?.core_static_link_status,256)),statusIndex.get(text(row.assessment?.metadata_overlap_status,256)),statusIndex.get(text(row.assessment?.source_lineage_status,256)),statusIndex.get(text(row.assessment?.independence_status,256)),statusIndex.get(text(row.assessment?.equivalence_status,256)),statusIndex.get(text(row.assessment?.corroboration,256))];
 });
 const buildCommit=text(context?.build_commit??context?.commit??context?.build?.commit??context?.source_commit??context?.receipt?.source_before?.commit,80);
 const capabilityDocument=context?.capabilities?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context.capabilities:context?.format_version==='MPC_OFFLINE_CAPABILITIES_1.0'?context:null;
 return {product:'MPC Research Workbench',format_version:'MPC_RESEARCH_WORKBENCH_1.0',build:{commit:/^[a-f0-9]{7,64}$/iu.test(buildCommit)?buildCommit.toLowerCase():'UNSPECIFIED_BUILD',branch:text(context?.branch??context?.build?.branch,256),working_tree_dirty:Boolean(context?.working_tree_dirty??context?.receipt?.source_before?.working_tree_dirty)},
  scan:{version:text(scan.version,128),status:text(scan.status,256),inventory:safeJson(scan.inventory??{}),fingerprints:safeJson(scan.fingerprints??{})},
  methods,sources:scan.sources.map(cleanSource),implemented_methods:asArray(scan.implemented_contracts).map(cleanImplemented),
  edges:asArray(scan.relation_graph?.edges).map(cleanEdge),pairs,status_values:statuses,connections:providerState(context),receipts:cleanReceipts(context),
  daybreak:{status:text(capabilityDocument?.boundaries?.daybreak_status??context?.daybreak_status??'NOT_OBSERVED_CURRENT_TASK',128),connector_access_independent:true},
  open_dependencies:asArray(scan.open_dependencies).map(value=>text(value,1000)),
  coverage_gaps:asArray(context?.coverage_gaps).length?asArray(context.coverage_gaps).map(value=>text(value,1000)):[
   'No structured author, professor, institution, book, GUI, UX, HCI, accessibility, WCAG or Nielsen source overlay is registered in this catalog.',
   'A lexical metadata match does not establish the best method, book, professor, security professional or source.'
  ],
  connector_actions:Object.fromEntries(Object.entries(CONNECTOR_ACTIONS).map(([provider,actions])=>[provider,[...actions].sort(order)])),
  bridge_api:{same_origin_only:true,endpoints:['/api/workbench/status','/api/workbench/runs','/api/workbench/queue'],offline_network_calls:0,arbitrary_urls_allowed:false},
  boundaries:{local_analysis_only:true,method_execution_performed:false,source_authentication:false,independent_evidence_proven:false,
   connector_action_performed:false,write_performed:false,canonical_promotion:false,credentials_embedded:false}};
}

const SHELL=String.raw`<!doctype html>
<html lang="en" data-theme="night"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="__MPC_CSP__"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MPC Research Workbench</title><style>
:root{color-scheme:dark;--ink:#f5f3ff;--muted:#acb4cb;--deep:#071019;--panel:#0b1725e8;--panel2:#102238;--line:#29425d;--cyan:#5cf5f2;--pink:#ff5cca;--violet:#a67cff;--lime:#b9f56a;--gold:#ffc66d;--red:#ff758f;--paint:#6fb98f;--shadow:0 24px 80px #0009}[data-theme=day]{color-scheme:light;--ink:#122035;--muted:#53647a;--deep:#d9eee7;--panel:#f9fbf4eb;--panel2:#e4f0e8;--line:#89a69d;--cyan:#006f7b;--pink:#a71982;--violet:#6141b3;--lime:#3c6810;--gold:#8a5300;--red:#b02b47;--shadow:0 22px 65px #173e3926}*{box-sizing:border-box}html{background:var(--deep);scroll-behavior:smooth}body{margin:0;min-height:100vh;color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(ellipse at 18% -5%,#58dac53b 0,transparent 35rem),radial-gradient(ellipse at 80% 5%,#b849c832 0,transparent 38rem),linear-gradient(180deg,#091324 0,#092231 42%,#101d25 70%,#071019 100%)}[data-theme=day] body{background:radial-gradient(ellipse at 16% 0,#b8e2cf 0,transparent 36rem),radial-gradient(ellipse at 85% 5%,#e3badc 0,transparent 38rem),linear-gradient(#dceef1,#cfe4d2 60%,#b8d0b2)}body:before,body:after{content:"";position:fixed;inset:auto 0 0;pointer-events:none;z-index:-1}body:before{height:46vh;background:linear-gradient(155deg,transparent 0 16%,#182f3e 16.2% 34%,transparent 34.2%),linear-gradient(205deg,transparent 0 20%,#16364a 20.2% 39%,transparent 39.2%),linear-gradient(170deg,transparent 0 35%,#0e2936 35.2% 55%,#071019 55.2%);filter:drop-shadow(0 -10px 35px #3bf5d020)}body:after{height:100vh;background:repeating-linear-gradient(90deg,transparent 0 119px,#5cf5f207 120px),repeating-linear-gradient(0deg,transparent 0 119px,#a67cff07 120px);mask-image:linear-gradient(transparent,#000 45%,#000)}button,input,select,textarea{font:inherit}.shell{max-width:1560px;margin:auto;padding:24px}.top{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:16px}.brand{display:flex;gap:14px;align-items:center}.mark{width:54px;height:54px;border:1px solid #5cf5f288;border-radius:18px;display:grid;place-items:center;background:conic-gradient(from 210deg,#5cf5f233,#ff5cca44,#a67cff44,#b9f56a33,#5cf5f233);box-shadow:inset 0 0 22px #fff1,0 0 40px #5cf5f226}.mark svg{width:35px}.eyebrow,.label{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--cyan);font-weight:800}.title{font-size:clamp(23px,3vw,34px);line-height:1.05;font-weight:900;letter-spacing:-.04em}.subtitle{color:var(--muted);font-size:13px}.actions,.chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.badge,.chip{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:5px 9px;background:#5cf5f20b;font:12px/1.2 "Cascadia Code",Consolas,monospace}.badge:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--lime);box-shadow:0 0 14px var(--lime);margin-right:7px}.button{border:1px solid var(--line);background:linear-gradient(180deg,#172a42,#102034);color:var(--ink);border-radius:10px;padding:9px 13px;font-weight:750;cursor:pointer;transition:.16s;text-decoration:none}.button:hover{border-color:var(--cyan);transform:translateY(-1px);box-shadow:0 0 22px #5cf5f214}.button.primary{border-color:#a67cff88;background:linear-gradient(135deg,#4859e8,#b040c5);box-shadow:0 0 24px #a67cff28}.button.hot{border-color:#ff5cca88;background:linear-gradient(135deg,#7d246b,#443ea9)}.button:disabled{opacity:.45;cursor:not-allowed;transform:none}.field{width:100%;border:1px solid var(--line);border-radius:10px;background:#071523;color:var(--ink);padding:10px 12px}[data-theme=day] .field{background:#f7fbf5}[data-theme=day] .button{background:linear-gradient(#f7fbf5,#deebe1)}[data-theme=day] .button.primary,[data-theme=day] .button.hot{color:white}.field:focus,.button:focus-visible,.tab:focus-visible,[tabindex]:focus-visible{outline:3px solid #5cf5f255;outline-offset:2px}.dock{position:sticky;top:8px;z-index:20;border:1px solid #5cf5f24d;border-radius:18px;background:#081623f5;box-shadow:var(--shadow),inset 0 1px #fff1;margin-bottom:16px;backdrop-filter:blur(18px)}[data-theme=day] .dock{background:#f5fbf4f2}.dockhead{display:flex;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line)}.dockgrid{display:grid;grid-template-columns:minmax(340px,1.6fr) minmax(260px,.85fr) auto;gap:10px;padding:12px}.input{min-height:105px;resize:vertical}.stack{display:grid;gap:8px;align-content:start}.hint{font-size:12px;color:var(--muted)}.status{padding:9px 11px;border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:15px}.metric,.card{border:1px solid var(--line);background:var(--panel);border-radius:16px;box-shadow:var(--shadow)}.metric{padding:14px 16px}.mvalue{font-size:26px;font-weight:900;letter-spacing:-.04em}.muted{color:var(--muted)}.cyan{color:var(--cyan)}.pink{color:var(--pink)}.lime{color:var(--lime)}.gold{color:var(--gold)}.red{color:var(--red)}.nav{display:flex;gap:5px;padding:5px;margin-bottom:15px;border:1px solid var(--line);border-radius:13px;background:#091726;overflow:auto}[data-theme=day] .nav{background:#eef7ed}.tab{white-space:nowrap;border:0;border-radius:9px;background:transparent;color:var(--muted);padding:9px 13px;font-weight:800;cursor:pointer}.tab[aria-selected=true]{background:linear-gradient(135deg,#1b3553,#302557);color:var(--ink);box-shadow:inset 0 0 0 1px #a67cff44}[data-theme=day] .tab[aria-selected=true]{background:#d6e9e1}.panel{display:none}.panel.active{display:block}.grid2{display:grid;grid-template-columns:minmax(440px,1fr) minmax(360px,.9fr);gap:14px;align-items:start}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.chead{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 17px;border-bottom:1px solid var(--line)}.ctitle{font-size:16px;font-weight:900}.body{padding:16px}.filters{display:grid;grid-template-columns:1fr 190px 190px;gap:8px;margin-bottom:10px}.scroll{max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:12px}.row{display:grid;grid-template-columns:105px 1fr auto;gap:10px;padding:12px;border-bottom:1px solid #29425d99;cursor:pointer}.row:hover,.row.selected{background:#5cf5f20d}.id,.code{font:12px/1.45 "Cascadia Code",Consolas,monospace;overflow-wrap:anywhere}.id{color:var(--cyan)}.name{font-weight:850}.score{font:800 13px "Cascadia Code",Consolas,monospace;color:var(--lime)}.empty{padding:36px;text-align:center;color:var(--muted)}.section{margin-top:18px}.section h3{font-size:12px;letter-spacing:.11em;text-transform:uppercase;color:var(--cyan);margin:0 0 7px}.section p{white-space:pre-wrap;margin:0}.facts{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.fact{border:1px solid var(--line);border-radius:11px;padding:10px;background:var(--panel2);overflow-wrap:anywhere}.fvalue{font-weight:750;margin-top:3px}.warning{border:1px solid #ffc66d66;background:#ffc66d0c;color:var(--gold);padding:11px;border-radius:11px;margin-top:12px}.good{border-color:#b9f56a66;color:var(--lime)}.bad{border-color:#ff758f66;color:var(--red)}table{border-collapse:collapse;width:100%;font-size:13px}th{position:sticky;top:0;background:var(--panel2);padding:10px;text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}td{padding:10px;border-top:1px solid var(--line);vertical-align:top}.compare-controls{display:grid;grid-template-columns:1fr auto 1fr auto;gap:8px;align-items:end}.provider{min-height:205px;padding:15px;position:relative;overflow:hidden}.provider:after{content:"";position:absolute;width:120px;height:120px;border-radius:50%;right:-50px;top:-55px;background:radial-gradient(circle,#ff5cca30,transparent 68%)}.provider h3{margin:6px 0 4px}.provider .state{display:inline-flex;margin-top:12px;font:800 11px "Cascadia Code",Consolas,monospace;color:var(--gold)}.receipt{padding:10px;border-left:3px solid var(--violet);background:var(--panel2);border-radius:0 9px 9px 0;margin:8px 0}.queueitem{padding:12px;border:1px solid var(--line);border-radius:11px;margin-top:8px;background:var(--panel2)}.footer{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:12px;padding:17px 3px}.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.file{position:absolute;opacity:0;pointer-events:none}.hero-note{font-family:Georgia,serif;font-style:italic;color:#c7e7dd}[data-theme=day] .hero-note{color:#426b61}.aurora{height:3px;border-radius:5px;background:linear-gradient(90deg,var(--cyan),var(--lime),var(--pink),var(--violet));box-shadow:0 0 19px #5cf5f288;margin-top:8px}
@media(max-width:1080px){.dock{position:relative;top:auto}.dockgrid,.grid2{grid-template-columns:1fr}.grid3{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.shell{padding:12px}.top{align-items:flex-start}.top>.actions{display:none}.dockgrid,.filters,.compare-controls,.facts,.grid3{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.row{grid-template-columns:82px 1fr}.row .score{grid-column:2}.nav{border-radius:10px}.tab{padding:8px 10px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><noscript><div class="warning">JavaScript is required for local input analysis. The bundled JSON, CSV and SQLite artifacts remain available without it.</div></noscript><main class="shell">
<header class="top"><div class="brand"><div class="mark" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="M3 27 11 16l5 6 7-14 10 19H3Z" stroke="currentColor" stroke-width="1.7"/><path d="M6 29h24M8 12c5-6 12-6 18 0" stroke="currentColor" stroke-width="1.5"/></svg></div><div><div class="eyebrow">MPC / LOCAL + HOST-BRIDGED RESEARCH OS</div><div class="title">MPC Research Workbench</div><div class="hero-note">Quiet landscape thinking. Neon control-room precision.</div><div class="aurora"></div></div></div><div class="actions"><span class="badge" id="mode-badge">LOCAL MODE</span><span class="chip" id="build-badge">build —</span><button class="button" id="theme" type="button">Theme</button></div></header>
<section class="dock" aria-labelledby="input-title"><div class="dockhead"><div><div class="ctitle" id="input-title">Analysis input</div><div class="hint">Paste text or structured data, or import TXT, JSON or CSV (256 KiB maximum). Your content stays local unless you explicitly record it through the loopback host.</div></div><span class="chip pink">METHOD EXECUTION: NO</span></div><div class="dockgrid"><label><span class="sr">Text or data to analyze</span><textarea id="analysis-input" class="field input" maxlength="262144" placeholder="Paste logs, claims, requirements, source notes, JSON, CSV, or a question here…"></textarea></label><div class="stack"><label><span class="label">Hook query / facets</span><input id="query" class="field" type="search" maxlength="8192" placeholder='e.g. discipline:CYBER_DEFENSE purpose:DETECT "state drift"'></label><label><span class="label">Input format</span><select class="field" id="input-format"><option value="AUTO">Auto detect</option><option value="TEXT">Plain text</option><option value="JSON">JSON</option><option value="CSV">CSV</option></select></label><div class="hint">Facets: discipline, purpose, source-class, source-review, dim, family, id, related, edge, implementation, provenance.</div><div id="input-status" class="status" role="status">Ready for local analysis.</div></div><div class="stack"><button class="button primary" id="analyze" type="button">Discover research hooks</button><label class="button" for="file-input">Import TXT / JSON / CSV</label><input class="file" id="file-input" type="file" accept=".txt,.json,.csv,text/plain,application/json,text/csv"><button class="button" id="clear-input" type="button">Clear input</button></div></div></section>
<section class="metrics"><div class="metric"><div class="label">Research hooks</div><div class="mvalue cyan" id="metric-methods">—</div></div><div class="metric"><div class="label">Implemented capsules</div><div class="mvalue pink" id="metric-implemented">—</div></div><div class="metric"><div class="label">Sources</div><div class="mvalue lime" id="metric-sources">—</div></div><div class="metric"><div class="label">Latest local matches</div><div class="mvalue gold" id="metric-matches">0</div></div></section>
<nav class="nav" role="tablist" aria-label="Workbench areas"><button class="tab" role="tab" aria-selected="true" data-view="discover">Discover</button><button class="tab" role="tab" aria-selected="false" data-view="sources">Sources</button><button class="tab" role="tab" aria-selected="false" data-view="compare">Compare</button><button class="tab" role="tab" aria-selected="false" data-view="connections">Connections</button><button class="tab" role="tab" aria-selected="false" data-view="outputs">Outputs</button><button class="tab" role="tab" aria-selected="false" data-view="system">System & receipts</button></nav>
<section class="panel active" id="view-discover" role="tabpanel"><div class="grid2"><article class="card"><div class="chead"><div><div class="ctitle">Deterministic hook discovery</div><div class="hint">Transparent lexical fit over registered methods and source metadata</div></div><span class="chip" id="result-count">No run</span></div><div class="body"><div id="results" class="scroll"><div class="empty">Enter text or data above, then discover local research hooks.</div></div></div></article><article class="card" id="method-detail"><div class="empty">Select a result to inspect its source, required input and falsifier.</div></article></div></section>
<section class="panel" id="view-sources" role="tabpanel"><article class="card"><div class="chead"><div><div class="ctitle">Source explorer</div><div class="hint">Registered locators are leads; review state is not source authentication</div></div><span class="chip" id="source-count"></span></div><div class="body"><div class="filters"><input class="field" id="source-search" type="search" placeholder="Search source ID or title"><select class="field" id="source-class" aria-label="Source class"><option value="">All source classes</option></select><select class="field" id="source-review" aria-label="Review state"><option value="">All review states</option></select></div><div class="scroll"><table><thead><tr><th>ID</th><th>Source</th><th>Class</th><th>Review</th><th>Methods</th></tr></thead><tbody id="source-rows"></tbody></table></div></div></article></section>
<section class="panel" id="view-compare" role="tabpanel"><article class="card"><div class="chead"><div><div class="ctitle">Exact method comparison</div><div class="hint">Stored overlap and directional relations, without equivalence or independence inference</div></div><button class="button" id="export-compare" type="button" disabled>Export comparison</button></div><div class="body"><div class="compare-controls"><label><span class="label">Method A</span><select class="field" id="compare-a"></select></label><button class="button" id="swap" type="button" aria-label="Swap selected methods">⇄</button><label><span class="label">Method B</span><select class="field" id="compare-b"></select></label><button class="button primary" id="run-compare" type="button">Compare</button></div><div id="comparison"><div class="empty">Choose two methods and compare their registered metadata.</div></div></div></article></section>
<section class="panel" id="view-connections" role="tabpanel"><div class="chead card"><div><div class="ctitle">Connection truth board</div><div class="hint">Current receipts, prior evidence and host availability stay separate. This page never stores credentials.</div></div><button class="button" id="refresh-connections" type="button">Refresh local host status</button></div><div class="grid3" id="provider-grid"></div></section>
<section class="panel" id="view-outputs" role="tabpanel"><div class="grid2"><article class="card"><div class="chead"><div><div class="ctitle">Output controls</div><div class="hint">Download locally or create a non-executing request for a trusted host</div></div><button class="button" id="export-analysis" type="button" disabled>Export latest JSON</button></div><div class="body"><label><span class="label">Destination</span><select class="field" id="destination"><option value="GOOGLE_DRIVE">Google Drive — create new</option><option value="GMAIL">Gmail — draft only</option><option value="GITHUB">GitHub — new branch artifact</option><option value="DROPBOX">Dropbox — create new</option><option value="MPC_MACHINE_LEGAL">MPC Machine Legal — analysis request</option><option value="MPC_BUGTOOLS">MPC BugTools — analysis request</option><option value="CUSTOM_GPT_OR_AI_HOST">Custom GPT / AI host — analysis request</option><option value="LOCAL_MODEL_HOST">Local model host — analysis request</option></select></label><label><span class="label">Artifact label</span><input class="field" id="artifact-label" maxlength="160" value="MPC Research Workbench analysis"></label><div class="stack"><label class="hint"><input id="store-input" type="checkbox"> Explicitly retain raw input, query, and full client result in the local host run record</label><button class="button" id="record-run" type="button" disabled>Record latest run with local host</button><button class="button hot" id="queue-request" type="button">Queue request locally</button></div><div class="warning">Nothing is persisted automatically. Without explicit retention, the host keeps only input/query profiles and hashes plus a client-result digest. Queuing does not call a provider. A host bridge must validate capability, request approval, execute, and return a protected receipt before any write can be claimed.</div></div></article><article class="card"><div class="chead"><div><div class="ctitle">Connector request queue</div><div class="hint">Every standalone request remains NOT SENT</div></div><button class="button" id="submit-queue" type="button" disabled>Record with local host</button></div><div class="body" id="queue"><div class="empty">No queued requests.</div></div></article></div></section>
<section class="panel" id="view-system" role="tabpanel"><div class="grid2"><article class="card"><div class="chead"><div class="ctitle">System boundaries</div></div><div class="body" id="system-boundaries"></div></article><article class="card"><div class="chead"><div><div class="ctitle">Receipts</div><div class="hint">Imported or prior receipts do not establish current access</div></div></div><div class="body" id="receipts"></div></article><article class="card"><div class="chead"><div class="ctitle">Separate inventories</div></div><div class="body" id="inventories"></div></article><article class="card"><div class="chead"><div class="ctitle">Open dependencies & coverage</div></div><div class="body" id="dependencies"></div></article><article class="card"><div class="chead"><div class="ctitle">Local host API</div></div><div class="body" id="api-contract"></div></article></div></section>
<footer class="footer"><span>Local metadata analysis · no target traffic · no method execution · no automatic connector writes</span><span class="code" id="fingerprint"></span></footer></main><div id="workbench-data" hidden>__MPC_DATA__</div><script>
'use strict';
const raw=document.getElementById('workbench-data').textContent.trim(),bytes=Uint8Array.from(atob(raw),function(c){return c.charCodeAt(0)}),DATA=JSON.parse(new TextDecoder().decode(bytes));
if(DATA.product!=='MPC Research Workbench'||!Array.isArray(DATA.methods)||!Array.isArray(DATA.sources)||!Array.isArray(DATA.implemented_methods)||!Array.isArray(DATA.pairs)){document.body.textContent='WORKBENCH DATA INTEGRITY ERROR';throw new Error('WORKBENCH_DATA_INTEGRITY_ERROR')}
const $=function(id){return document.getElementById(id)},node=function(tag,className,value){const n=document.createElement(tag);if(className)n.className=className;if(value!==undefined)n.textContent=String(value);return n},clear=function(target){target.replaceChildren()},num=function(value){return Number(value||0).toLocaleString()},arr=function(value){return Array.isArray(value)?value:[]};
const download=function(value,name){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)};
const djb=function(value){let hash=5381;for(let i=0;i<value.length;i++)hash=((hash<<5)+hash)^value.charCodeAt(i);return(hash>>>0).toString(16).padStart(8,'0')},wordList=function(value){return String(value||'').toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g)||[]},uniq=function(value){return Array.from(new Set(value))};
const byId=new Map(DATA.methods.map(function(m){return[m.method_id,m]})),edges=DATA.edges,edgeMap=new Map();edges.forEach(function(e){const key=e.method_id+'|'+e.related_method_id;if(!edgeMap.has(key))edgeMap.set(key,[]);edgeMap.get(key).push(e)});
const pairMap=new Map(DATA.pairs.map(function(row){const a=DATA.methods[row[0]].method_id,b=DATA.methods[row[1]].method_id;return[a+'|'+b,row]}));
let latest=null,latestComparison=null,selected='',queue=[],host={reachable:false,csrf:null,status:null},lastRunId=null,importedFormat='AUTO';
function activate(view){document.querySelectorAll('.tab').forEach(function(tab){tab.setAttribute('aria-selected',String(tab.dataset.view===view))});document.querySelectorAll('.panel').forEach(function(panel){panel.classList.toggle('active',panel.id==='view-'+view)})}
document.querySelectorAll('.tab').forEach(function(tab){tab.addEventListener('click',function(){activate(tab.dataset.view)})});
function parseQuery(value){const tokens=[],source=String(value||'').slice(0,10000);let current='',quoted=false,wasQuoted=false;for(let i=0;i<source.length;i++){const c=source[i];if(c==='"'){quoted=!quoted;wasQuoted=true;continue}if(/\s/.test(c)&&!quoted){if(current){tokens.push({value:current,quoted:wasQuoted});current='';wasQuoted=false}}else current+=c}if(quoted)throw new Error('Unclosed quote in query.');if(current)tokens.push({value:current,quoted:wasQuoted});const aliases={discipline:'taxonomy:discipline',purpose:'taxonomy:purpose',direction:'taxonomy:direction',evidence:'taxonomy:evidence',implementation:'implementation','model-kind':'taxonomy:model-kind','workflow-stage':'taxonomy:workflow-stage','source-review':'source_review','source-class':'source_class',dim:'dimension',dimension:'dimension',family:'family',id:'method_id',method:'method_id',provenance:'provenance',related:'related',edge:'edge',quantum:'quantum'},facets={},terms=[],phrases=[];tokens.forEach(function(token){const at=token.value.indexOf(':'),name=at>0?token.value.slice(0,at).toLowerCase():'';if(at>0&&/^[a-z][a-z-]*$/.test(name)&&name!=='http'&&name!=='https'){if(!aliases[name])throw new Error('Unknown facet: '+name);const value=token.value.slice(at+1).trim().toUpperCase();if(!value)throw new Error('Empty facet: '+name);(facets[aliases[name]]||(facets[aliases[name]]=[])).push({name:name,value:value})}else(token.quoted?phrases:terms).push(token.value.toLowerCase())});return{raw:source,facets:facets,terms:uniq(terms).sort(),phrases:uniq(phrases).sort()}}
function relatedValues(m,key){const source=m.source||{};if(key.startsWith('taxonomy:'))return arr(m.taxonomy_tags).map(function(x){return x.toUpperCase()});if(key==='dimension')return arr(m.dimensions).map(function(x){return x.toUpperCase()});if(key==='family')return[String(m.family).toUpperCase()];if(key==='method_id')return[String(m.method_id).toUpperCase()];if(key==='implementation')return[String(m.implementation_state).toUpperCase()].concat(arr(m.taxonomy_tags).filter(function(x){return x.startsWith('IMPLEMENTATION:')}).map(function(x){return x.toUpperCase()}));if(key==='provenance')return[String(m.provenance_state).toUpperCase()];if(key==='quantum')return[String(m.quantum_requirement).toUpperCase()];if(key==='source_class')return[String(source.source_class).toUpperCase()];if(key==='source_review')return[String(source.review_state).toUpperCase()];const linked=edges.filter(function(e){return e.method_id===m.method_id||e.related_method_id===m.method_id});if(key==='related')return linked.map(function(e){return(e.method_id===m.method_id?e.related_method_id:e.method_id).toUpperCase()});if(key==='edge')return linked.map(function(e){return e.relation_type.toUpperCase()});return[]}
function facetMatch(m,facets){return Object.keys(facets).every(function(key){const values=relatedValues(m,key),prefix=key.startsWith('taxonomy:')?key.slice(9).toUpperCase().replaceAll('-','_')+':':'';return facets[key].some(function(request){return values.some(function(value){return value===prefix+request.value})})})}
function csvProfile(value){let rows=0,columns=0,current=1,quoted=false,cellStart=true,afterQuote=false;for(let i=0;i<value.length;i++){const c=value[i];if(quoted){if(c==='"'&&value[i+1]==='"'){i++;continue}if(c==='"'){quoted=false;afterQuote=true;cellStart=false}continue}if(afterQuote&&c!==','&&c!=='\r'&&c!=='\n')throw new Error('CSV has a character after a closing quote.');if(c==='"'){if(!cellStart)throw new Error('CSV quote must begin a cell.');quoted=true;afterQuote=false;continue}if(c===','){current++;cellStart=true;afterQuote=false;continue}if(c==='\r'||c==='\n'){if(c==='\r'&&value[i+1]==='\n')i++;if(columns&&columns!==current)throw new Error('CSV rows have different column counts.');columns=current;rows++;current=1;cellStart=true;afterQuote=false;continue}cellStart=false}if(quoted)throw new Error('CSV has an unclosed quote.');if(value.length&&!/[\r\n]$/.test(value)){if(columns&&columns!==current)throw new Error('CSV rows have different column counts.');columns=current;rows++}return{format:'CSV',row_count:rows,column_count:columns,header_inferred:false,semantic_schema_inferred:false}}
function browserInputProfile(value){let format=$('input-format').value;if(format==='AUTO'&&importedFormat!=='AUTO')format=importedFormat;if(format==='AUTO'){const trimmed=value.trim();format=trimmed.startsWith('{')||trimmed.startsWith('[')?'JSON':/[\r\n]/.test(value)&&value.includes(',')?'CSV':'TEXT'}if(format==='JSON'){try{const parsed=JSON.parse(value);return{format:'JSON',root_type:Array.isArray(parsed)?'ARRAY':parsed===null?'NULL':typeof parsed,item_count:Array.isArray(parsed)?parsed.length:parsed&&typeof parsed==='object'?Object.keys(parsed).length:1,semantic_schema_inferred:false}}catch{throw new Error('JSON input is not valid.')}}if(format==='CSV')return csvProfile(value);return{format:'TEXT',line_count:value?value.split(/\r\n|\r|\n/).length:0,semantic_schema_inferred:false}}
function discover(){const input=$('analysis-input').value,queryValue=$('query').value;let query,profile;try{if(new TextEncoder().encode(input).length>262144)throw new Error('Input exceeds the 256 KiB limit.');if(new TextEncoder().encode(queryValue).length>8192)throw new Error('Query exceeds the 8 KiB limit.');query=parseQuery(queryValue);profile=browserInputProfile(input)}catch(error){$('input-status').textContent=error.message;$('input-status').className='status red';return}lastRunId=null;const inputTokens=uniq(wordList(input).filter(function(x){return x.length>2})).sort(),needles=uniq(query.terms.concat(query.phrases,inputTokens)).filter(function(x){return x.length>1}).slice(0,512),fields=function(m){return[['method_id',m.method_id,120],['method_name',m.method_name,42],['dimensions',arr(m.dimensions).join(' '),24],['family',m.family,18],['taxonomy',arr(m.taxonomy_tags).join(' '),14],['mechanism',m.mechanism,11],['classifier_question',m.classifier&&m.classifier.question,10],['required_input',m.required_input,9],['falsifier',m.falsifier,9],['source',m.source&&m.source.title,8]]};const inputSet=new Set(inputTokens),results=DATA.methods.filter(function(m){return facetMatch(m,query.facets)}).map(function(m){let score=0,reasons=[];needles.forEach(function(needle){fields(m).forEach(function(f){const candidate=String(f[1]||'').toLowerCase();if(candidate&&candidate.includes(needle)){const points=f[2]*(candidate===needle?3:1);score+=points;reasons.push({field:f[0],term:needle,points:points})}})});fields(m).slice(1).forEach(function(f){const overlap=uniq(wordList(f[1]).filter(function(value){return value.length>2&&inputSet.has(value)})).sort();if(overlap.length){const points=Math.min(overlap.length,8)*Math.max(1,Math.floor(f[2]/4));score+=points;reasons.push({field:f[0],term:overlap.join(', '),points:points})}});return{method_id:m.method_id,method_name:m.method_name,family:m.family,implementation_state:m.implementation_state,primary_source_id:m.primary_source_id,required_input:m.required_input,falsifier:m.falsifier,score:score,match_reasons:reasons.sort(function(a,b){return b.points-a.points||a.field.localeCompare(b.field)||a.term.localeCompare(b.term)}),method_execution_performed:false}}).filter(function(r){return!needles.length||r.score>0}).sort(function(a,b){return b.score-a.score||a.method_id.localeCompare(b.method_id)}).slice(0,24);const sourceIds=new Set(results.map(function(r){return r.primary_source_id}));latest={status:'LOCAL_STATIC_HOOK_DISCOVERY_COMPLETE',analysis_mode:'DETERMINISTIC_LOCAL_METADATA_MATCH',query:query,input_profile:Object.assign({},profile,{local_digest_hint:djb(input),utf16_characters:input.length,content_embedded:false}),inventory:{research_methods:DATA.methods.length,sources:DATA.sources.length,implemented_evaluators:DATA.implemented_methods.length},result_count:results.length,methods:results,sources:DATA.sources.filter(function(s){return sourceIds.has(s.source_id)}),method_execution_performed:false,source_authentication:false,independent_evidence_proven:false,canonical_promotion:false,limitations:['Matches are deterministic metadata hooks, not executed methods.','Ranking is lexical and source-bound; best expertise or completeness is not established.']};renderResults();$('input-status').textContent='Local '+profile.format+' analysis complete. No registered method was executed.';$('input-status').className='status good';$('metric-matches').textContent=num(results.length);$('export-analysis').disabled=false;$('record-run').disabled=!host.reachable}
function renderResults(){clear($('results'));$('result-count').textContent=latest?num(latest.result_count)+' matches':'No run';if(!latest||!latest.methods.length){$('results').appendChild(node('div','empty','No registered hook matched this input and facet combination.'));return}latest.methods.forEach(function(row){const el=node('div','row'+(selected===row.method_id?' selected':''));el.tabIndex=0;el.append(node('div','id',row.method_id));const body=node('div');body.append(node('div','name',row.method_name),node('div','muted',row.family+' · '+row.primary_source_id));el.append(body,node('div','score',row.score+' pts'));const open=function(){showMethod(row.method_id,row);};el.addEventListener('click',open);el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});$('results').appendChild(el)})}
function chips(target,values,tone){arr(values).forEach(function(value){target.appendChild(node('span','chip '+(tone||''),typeof value==='object'?JSON.stringify(value):value))})}
function fact(label,value){const box=node('div','fact');box.append(node('div','label',label),node('div','fvalue',value));return box}
function showMethod(id,result){const m=byId.get(id);if(!m)return;selected=id;renderResults();const card=$('method-detail');clear(card);const head=node('div','chead'),title=node('div');title.append(node('div','id',m.method_id),node('div','ctitle',m.method_name),node('div','hint',m.family+' · '+m.implementation_state));head.append(title);const body=node('div','body'),tagbox=node('div','chips');chips(tagbox,m.dimensions,'cyan');body.append(tagbox);[['Mechanism',m.mechanism],['Classifier question',m.classifier&&m.classifier.question],['Required input',m.required_input],['Falsifier',m.falsifier]].forEach(function(pair){const section=node('div','section');section.append(node('h3','',pair[0]),node('p','',pair[1]||'Not registered'));body.append(section)});const facts=node('div','facts');facts.append(fact('Primary source',(m.source?m.source.source_id+' · '+m.source.title:'Not registered')),fact('Source review',m.source?m.source.review_state:'Unknown'),fact('Declared relations',m.incoming_relation_count+' incoming · '+m.outgoing_relation_count+' outgoing'),fact('Local rank',result?result.score+' points':'Not ranked'));body.append(facts,node('div','warning','Local hook only. Source authentication: false · method execution: false · independence: not established.'));card.append(head,body)}
function renderSources(){const term=$('source-search').value.trim().toLowerCase(),kind=$('source-class').value,review=$('source-review').value,counts=new Map();DATA.methods.forEach(function(m){counts.set(m.primary_source_id,(counts.get(m.primary_source_id)||0)+1)});const rows=DATA.sources.filter(function(s){return(!term||(s.source_id+' '+s.title).toLowerCase().includes(term))&&(!kind||s.source_class===kind)&&(!review||s.review_state===review)});$('source-count').textContent=num(rows.length)+' sources';clear($('source-rows'));rows.forEach(function(s){const tr=node('tr');[s.source_id,s.title,s.source_class,s.review_state,counts.get(s.source_id)||0].forEach(function(value,index){tr.appendChild(node('td',index===0?'id':'',value))});$('source-rows').appendChild(tr)})}
function pairKey(a,b){return a<=b?a+'|'+b:b+'|'+a}
function unpackPair(row){const a=DATA.methods[row[0]],b=DATA.methods[row[1]],mask=row[2],status=function(index){return DATA.status_values[row[index]]},intersect=function(left,right,key){const values=new Set(right.map(key));return left.filter(function(v){return values.has(key(v))})};return{pair_key:a.method_id+'|'+b.method_id,method_id_a:a.method_id,method_id_b:b.method_id,comparison_kind:a.method_id===b.method_id?'IDENTITY_CONTROL_ONLY':'UNORDERED_CROSS_METHOD_METADATA_COMPARISON',declared_relations:{a_to_b:edgeMap.get(a.method_id+'|'+b.method_id)||[],b_to_a:edgeMap.get(b.method_id+'|'+a.method_id)||[]},evidence_vector:{same_primary_source_id:Boolean(mask&1),same_exact_source_locator:Boolean(mask&2),same_family:Boolean(mask&4),shared_dimensions:intersect(a.dimensions,b.dimensions,function(x){return x}),shared_taxonomy_tags:intersect(a.taxonomy_tags,b.taxonomy_tags,function(x){return x}),same_dimension_set:Boolean(mask&8),same_taxonomy_signature:Boolean(mask&16),same_classifier_question:Boolean(mask&32),exact_stored_field_matches:['method_name','mechanism','required_input','falsifier'].filter(function(field){return a[field]===b[field]})},assessment:{core_static_link_status:status(3),metadata_overlap_status:status(4),source_lineage_status:status(5),independence_status:status(6),equivalence_status:status(7),corroboration:status(8)},method_execution_performed:false}}
function compare(){const a=$('compare-a').value,b=$('compare-b').value,row=pairMap.get(pairKey(a,b));if(!row)return;latestComparison=unpackPair(row);$('export-compare').disabled=false;const target=$('comparison');clear(target);const summary=node('div','facts');Object.entries(latestComparison.assessment).forEach(function(entry){summary.appendChild(fact(entry[0].replaceAll('_',' '),entry[1]))});target.append(summary);const overlap=node('div','section');overlap.append(node('h3','','Shared dimensions'),node('p','',latestComparison.evidence_vector.shared_dimensions.join(', ')||'None registered'));target.append(overlap);const rel=node('div','section');rel.append(node('h3','','Directional relations'));const relationRows=latestComparison.declared_relations.a_to_b.concat(latestComparison.declared_relations.b_to_a);if(!relationRows.length)rel.append(node('p','muted','No direct declared relation.'));else relationRows.forEach(function(e){rel.append(node('div','receipt',e.method_id+' → '+e.related_method_id+' · '+e.relation_type+' · '+e.link_status))});target.append(rel,node('div','warning','Exact stored metadata comparison only. Equivalence, independence and corroboration are not established.'))}
function renderProviders(){clear($('provider-grid'));DATA.connections.forEach(function(p){const card=node('article','card provider'),head=node('div');head.append(node('div','id',p.provider),node('h3','',p.label),node('div','muted',p.description));card.append(head,node('div','state',p.status));const detail=node('div','section');detail.append(node('div','label','Current session'));detail.append(node('div','muted',p.current.length?p.current.map(function(x){return x.status+(x.receipt_sha256?' · receipt '+x.receipt_sha256.slice(0,12)+'…':'')}).join(' | '):'No current capability receipt embedded.'));detail.append(node('div','label','Prior evidence'));detail.append(node('div','muted',p.prior.length?p.prior.map(function(x){return x.status}).join(' | '):'None embedded.'));card.append(detail);$('provider-grid').appendChild(card)})}
const apiPaths=new Set(['/api/workbench/status','/api/workbench/runs','/api/workbench/queue']);async function api(path,options){if(!apiPaths.has(path))throw new Error('API path rejected');if(location.protocol!=='http:'&&location.protocol!=='https:')throw new Error('Local host bridge is unavailable in file mode.');const init=Object.assign({credentials:'same-origin',headers:{Accept:'application/json'}},options||{});if(path!=='/api/workbench/status'){if(!host.csrf)throw new Error('Refresh host status before using the local API.');init.headers['X-Workbench-CSRF']=host.csrf}if(init.method==='POST')init.headers['Content-Type']='application/json; charset=utf-8';const response=await fetch(path,init);if(!response.ok)throw new Error('Host returned '+response.status);return response.json()}
async function refreshHost(){if(location.protocol!=='http:'&&location.protocol!=='https:'){$('input-status').textContent='Offline file mode: no network calls are made.';return}try{const value=await api('/api/workbench/status');host={reachable:true,csrf:typeof value.csrf_token==='string'?value.csrf_token:null,status:value};$('mode-badge').textContent='LOCAL HOST REACHABLE';$('refresh-connections').textContent='Host status refreshed';$('submit-queue').disabled=!queue.length;$('record-run').disabled=!latest}catch(error){host={reachable:false,csrf:null,status:null};$('mode-badge').textContent='HOST UNAVAILABLE';$('record-run').disabled=true;$('input-status').textContent=error.message}}
function actionFor(provider){return{GOOGLE_DRIVE:'CREATE_NEW',GMAIL:'CREATE_DRAFT',GITHUB:'CREATE_NEW_BRANCH_ARTIFACT',DROPBOX:'CREATE_NEW',MPC_MACHINE_LEGAL:'REQUEST_ANALYSIS',MPC_BUGTOOLS:'REQUEST_ANALYSIS',CUSTOM_GPT_OR_AI_HOST:'REQUEST_ANALYSIS',LOCAL_MODEL_HOST:'REQUEST_ANALYSIS'}[provider]}
async function hashText(value){const data=new TextEncoder().encode(value),digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
async function queueRequest(){if(!latest){$('input-status').textContent='Run local analysis before creating an output request.';return}const provider=$('destination').value,action=actionFor(provider),content=JSON.stringify(latest,null,2)+'\n',artifactName='mpc-research-workbench-analysis.json',digest=await hashText(content),hint=provider==='GMAIL'?'DRAFT_ONLY':provider==='GITHUB'?'NEW_BRANCH_ONLY':provider.startsWith('MPC')||provider.includes('MODEL')||provider.includes('GPT')?'ANALYSIS_REQUEST_ONLY':'CREATE_NEW',body={provider:provider,action:action,label:$('artifact-label').value.slice(0,160),payload:{run_id:lastRunId,artifact_name:artifactName,artifact_sha256:digest,artifact_bytes:new TextEncoder().encode(content).length,media_type:'application/json',destination_hint:hint,content:latest}},requestId='WRQ-'+djb(JSON.stringify(body));queue.push(Object.assign({},body,{request_id:requestId,state:'QUEUED_LOCALLY_NOT_SENT',host_action_called:false,host_action_performed:false,write_performed:false,provider_receipt:null}));renderQueue()}
function renderQueue(){clear($('queue'));if(!queue.length){$('queue').append(node('div','empty','No queued requests.'));$('submit-queue').disabled=true;return}queue.forEach(function(item){const box=node('div','queueitem');box.append(node('div','id',item.request_id),node('div','name',item.provider+' · '+item.action),node('div','gold',item.state),node('div','muted','host_action_called: false · write_performed: false'));$('queue').appendChild(box)});$('submit-queue').disabled=!host.reachable}
async function recordRun(){if(!latest)return;try{const keep=$('store-input').checked,result={status:latest.status,analysis_mode:latest.analysis_mode,input_profile:latest.input_profile,inventory:latest.inventory,result_count:latest.result_count,methods:latest.methods.map(function(m){return{method_id:m.method_id,method_name:m.method_name,family:m.family,primary_source_id:m.primary_source_id,score:m.score,matched_fields:uniq(m.match_reasons.map(function(r){return r.field})),method_execution_performed:false}}),sources:latest.sources.map(function(s){return{source_id:s.source_id,title:s.title,source_class:s.source_class,review_state:s.review_state}}),method_execution_performed:false,source_authentication:false,independent_evidence_proven:false,canonical_promotion:false,limitations:latest.limitations},body={kind:'LOCAL_HOOK_DISCOVERY',query:$('query').value,input:$('analysis-input').value,store_input:keep,method_ids:latest.methods.map(function(m){return m.method_id}),result:result},response=await api('/api/workbench/runs',{method:'POST',body:JSON.stringify(body)}),runId=response&&response.run&&response.run.run_id;if(!runId)throw new Error('Local host run receipt is missing run_id.');lastRunId=runId;$('input-status').textContent='Run '+runId+' recorded by the local host. Raw input and full client result retained: '+String(keep)+'.'}catch(error){$('input-status').textContent=error.message}}
async function recordQueue(){if(!queue.length)return;try{const item=queue[queue.length-1],body={provider:item.provider,action:item.action,label:item.label,payload:item.payload},response=await api('/api/workbench/queue',{method:'POST',body:JSON.stringify(body)}),requestId=response&&response.queue_request&&response.queue_request.request_id;if(!requestId)throw new Error('Local host queue receipt is missing request_id.');item.state='RECORDED_BY_LOCAL_HOST_NOT_SENT';item.host_queue_receipt=requestId;item.host_action_called=false;item.write_performed=false;renderQueue()}catch(error){$('input-status').textContent=error.message}}
function renderSystem(){const boundaries=$('system-boundaries');clear(boundaries);Object.entries(DATA.boundaries).forEach(function(entry){boundaries.appendChild(fact(entry[0].replaceAll('_',' '),String(entry[1])))});boundaries.append(fact('Daybreak selection / availability',DATA.daybreak.status),node('div','warning','Daybreak selection is independent of MPC connector access. Standalone mode cannot authenticate or control Gmail, Drive, GitHub, Dropbox, MPC, GPT or local model services.'));const receipts=$('receipts');clear(receipts);if(!DATA.receipts.length)receipts.append(node('div','empty','No sanitized receipts embedded.'));DATA.receipts.forEach(function(r){receipts.append(node('div','receipt',(r.provider||'UNKNOWN')+' · '+r.scope+' · '+r.status+(r.receipt_sha256?' · '+r.receipt_sha256.slice(0,16)+'…':'')))});const inventories=$('inventories');clear(inventories);inventories.append(fact('Research methods',DATA.methods.length),fact('Implemented evaluator capsules',DATA.implemented_methods.length),fact('Registered sources',DATA.sources.length),node('div','warning','These are separate inventories. Research hooks are not executable evaluators.'));const dependencies=$('dependencies');clear(dependencies);DATA.open_dependencies.concat(DATA.coverage_gaps).forEach(function(value){dependencies.append(node('div','receipt',value))});const apiBox=$('api-contract');clear(apiBox);apiBox.append(node('p','',location.protocol==='http:'||location.protocol==='https:'?'Same-origin loopback mode is eligible; refresh status to verify the host.':'Offline file mode: exactly zero API calls.'),node('div','code',DATA.bridge_api.endpoints.join('\n')),node('div','warning','Only these same-origin paths are permitted. Provider OAuth and credentials never enter this page.'))}
$('build-badge').textContent='build '+DATA.build.commit+(DATA.build.working_tree_dirty?' · DIRTY':'');$('metric-methods').textContent=num(DATA.methods.length);$('metric-implemented').textContent=num(DATA.implemented_methods.length);$('metric-sources').textContent=num(DATA.sources.length);$('fingerprint').textContent='catalog '+String(DATA.scan.fingerprints.catalog_sha256||DATA.scan.fingerprints.scan_sha256||'unavailable').slice(0,16)+'…';
uniq(DATA.sources.map(function(s){return s.source_class})).sort().forEach(function(v){$('source-class').add(new Option(v,v))});uniq(DATA.sources.map(function(s){return s.review_state})).sort().forEach(function(v){$('source-review').add(new Option(v,v))});DATA.methods.forEach(function(m){const label=m.method_id+' — '+m.method_name;$('compare-a').add(new Option(label,m.method_id));$('compare-b').add(new Option(label,m.method_id))});$('compare-a').value=byId.has('MHA-0119')?'MHA-0119':DATA.methods[0].method_id;$('compare-b').value=byId.has('MHA-0138')?'MHA-0138':DATA.methods[Math.min(1,DATA.methods.length-1)].method_id;
$('analyze').addEventListener('click',discover);$('clear-input').addEventListener('click',function(){$('analysis-input').value='';$('query').value='';$('input-format').value='AUTO';importedFormat='AUTO';lastRunId=null;$('input-status').textContent='Input cleared.'});$('file-input').addEventListener('change',function(){const file=this.files&&this.files[0];if(!file)return;if(file.size>262144){$('input-status').textContent='File exceeds the 256 KiB input limit.';return}const reader=new FileReader();reader.onload=function(){const value=String(reader.result||''),name=file.name.toLowerCase();if(name.endsWith('.json')){try{$('analysis-input').value=JSON.stringify(JSON.parse(value),null,2);importedFormat='JSON';$('input-format').value='JSON'}catch{$('input-status').textContent='JSON file is not valid.';return}}else if(name.endsWith('.csv')){try{const profile=csvProfile(value);$('analysis-input').value=value;importedFormat='CSV';$('input-format').value='CSV';$('input-status').textContent='Imported '+file.name+' locally · '+profile.row_count+' rows × '+profile.column_count+' columns. Nothing was uploaded.';return}catch(error){$('input-status').textContent=error.message;return}}else{$('analysis-input').value=value;importedFormat='TEXT';$('input-format').value='TEXT'}$('input-status').textContent='Imported '+file.name+' locally as '+importedFormat+'. Nothing was uploaded.'};reader.readAsText(file,'utf-8')});
['source-search','source-class','source-review'].forEach(function(id){$(id).addEventListener(id==='source-search'?'input':'change',renderSources)});$('run-compare').addEventListener('click',compare);$('swap').addEventListener('click',function(){const a=$('compare-a').value;$('compare-a').value=$('compare-b').value;$('compare-b').value=a;compare()});$('export-compare').addEventListener('click',function(){if(latestComparison)download(latestComparison,'mpc-method-comparison-'+latestComparison.pair_key+'.json')});$('export-analysis').addEventListener('click',function(){if(latest)download(latest,'mpc-research-workbench-analysis.json')});$('record-run').addEventListener('click',recordRun);$('queue-request').addEventListener('click',queueRequest);$('submit-queue').addEventListener('click',recordQueue);$('refresh-connections').addEventListener('click',refreshHost);$('theme').addEventListener('click',function(){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='night'?'day':'night'});
renderSources();renderProviders();renderSystem();if(location.protocol==='http:'||location.protocol==='https:')refreshHost();
</script></body></html>`;

/** Render one standalone HTML document. It performs no network call in file:// mode. */
export function renderResearchWorkbench(scan,context={}){
 const withData=SHELL.replace('__MPC_DATA__',encode(buildResearchWorkbenchPayload(scan,context)));
 const style=withData.match(/<style>([^]*?)<\/style>/u)?.[1],script=withData.match(/<script>([^]*?)<\/script>/u)?.[1];
 if(style===undefined||script===undefined)fail('WORKBENCH_SHELL_INVALID');
 const policy=`default-src 'none'; script-src 'sha256-${cspHash(script)}'; style-src 'sha256-${cspHash(style)}'; connect-src 'self'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
 return withData.replace('__MPC_CSP__',policy);
}
