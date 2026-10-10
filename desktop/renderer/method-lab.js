// MPC V30 — optional, read-only Engineering Lab under existing Methods view.
// The existing same-origin request/client supplies CSRF and project binding.
// Imported results are assigned through textContent/value, never HTML.
export const ENGINEERING_METHOD_LAB_PATH='/api/workspace/methods/engineering';
export const ENGINEERING_METHOD_LAB_OPERATIONS=Object.freeze([
 ['MOUNTAINS','Method blocks → mountains'],
 ['TRANSLATION','Technical language & replay'],
 ['JAVA_EXPRESSION','Java int32 compiler check'],
 ['CAN_FRAME','Passive CAN / CAN FD frame'],
 ['CAN_COUNTER','CAN counter window'],
 ['CAN_PROTECTION','CAN protection evidence'],
 ['LINGUISTIC_OUTPUT','Compact claim-language audit']
]);
const SAMPLE_COMMIT='5f624980c12620811459fa80684d9cb1458811ef';
const SRC=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,239}$/u;
export function methodLabSyntheticExampleV30(operation,projectId){
 if(typeof projectId!=='string'||!SRC.test(projectId))throw TypeError('METHOD_LAB_PROJECT_REQUIRED');
 const context={source_commit:SAMPLE_COMMIT,scope_id:projectId,
  subject_id:'fixture:review-subject',source_ref:'fixture:local-atom',
  source_owner:'fixture:local-review',source_version:'v29'};
 if(operation==='MOUNTAINS'){
  const atom=(id,dimension)=>({id,dimension,state:'SYNTHETIC',
   source_ref:'fixture:'+id,source_owner:'fixture:local-review',source_version:'v29',
   scope_id:projectId,subject_id:context.subject_id});
  return {...context,domain:'CAN',world:'SYNTHETIC',max_methods:10,
   atoms:[atom('canid','RAW_CANID'),atom('format','FRAME_KIND'),
    atom('length','DLC'),atom('codec','CODEC_KIND')]};
 }
 if(operation==='TRANSLATION')
  return {...context,message_code:'VERIFICATION_PASSED',locale_tag:'es-MX',register:'ENGINEERING'};
 if(operation==='JAVA_EXPRESSION')
  return {...context,expression:{op:'ADD',
   left:{op:'MUL',left:{op:'LIT',value:1234},right:{op:'LIT',value:25}},
   right:{op:'LIT',value:-1}}};
 if(operation==='CAN_FRAME')
  return {...context,frame_kind:'FD',can_id_raw:0x80000123,
   dlc:9,data_hex:'ab'.repeat(12),brs:true,esi:false};
 if(operation==='CAN_COUNTER')
  return {...context,clock_domain:'fixture:clock',can_identifier:0x123,counter_modulus:16,
   maximum_expected_period_ms:25,
   samples:[14,15,0,2].map((counter,i)=>({source_ref:'fixture:sample'+i,
     source_version:'v29',counter,timestamp_ms:i*10}))};
 if(operation==='CAN_PROTECTION')
  return {...context,crc_state:'PASS',freshness_state:'UNKNOWN',
   authenticator_state:'UNKNOWN',authorization_state:'UNKNOWN'};
 if(operation==='LINGUISTIC_OUTPUT')
  return {source_commit:context.source_commit,scope_id:projectId,
   subject_id:context.subject_id,world:'SYNTHETIC',format:'TECHNICAL',frames:[{
    id:'fixture:claim',role:'MAIN',actor:'System',action:'RECEIVE',patient:'record',
    quantity:'ONE',polarity:'NEGATED',event_time:'PAST',speech_act:'REPORT',
    evidence_state:'SYNTHETIC',finality_state:'NONE',finality_owner:null,
    support_refs:[{id:'fixture:record',owner:'fixture:local-review',version:'v29'}],
    contrary_refs:[]
   }]};
 throw TypeError('METHOD_LAB_OPERATION_UNSUPPORTED');
}
export function summarizeEngineeringLabV30(receipt){
 if(!receipt||typeof receipt!=='object'||receipt.version!=='MPC_WORKSPACE_METHOD_LAB_V30_1'||
  !receipt.summary||typeof receipt.compact_output!=='string')
  throw TypeError('INVALID_METHOD_LAB_RECEIPT');
 return {short:receipt.compact_output,full:JSON.stringify(receipt,null,2),
  status:String(receipt.summary.result??receipt.receipt_state??'REVIEW'),
  source:String(receipt.source?.source_ref??'declared source'),
  receipt_sha256:receipt.receipt_sha256};
}
export function initializeEngineeringMethodLabV30({request,getProjectId,copyText,announce,recordError}){
 if(typeof document==='undefined')return null;
 const $=id=>document.getElementById(id);
 const ids=['engineering-lab-operation','engineering-lab-input','engineering-lab-example',
  'engineering-lab-run','engineering-lab-status','engineering-lab-preview',
  'engineering-lab-full','engineering-lab-copy','engineering-lab-copy-full'];
 if(ids.some(x=>!$(x)))throw Error('METHOD_LAB_ELEMENTS_MISSING');
 if(![request,getProjectId,copyText,announce,recordError].every(fn=>typeof fn==='function'))
  throw Error('METHOD_LAB_HOST_DEPENDENCY_MISSING');
 const operation=$('engineering-lab-operation'),input=$('engineering-lab-input'),
  run=$('engineering-lab-run'),status=$('engineering-lab-status'),
  preview=$('engineering-lab-preview'),full=$('engineering-lab-full'),
  copy=$('engineering-lab-copy'),copyFull=$('engineering-lab-copy-full');
 let latest=null,busy=false;
 const setStatus=value=>{status.textContent=value;};
 const clear=()=>{
  latest=null;preview.textContent='Load a reviewed example or enter a source-bound JSON input.';
  full.value='';copy.disabled=true;copyFull.disabled=true;setStatus('NOT RUN');
 };
 $('engineering-lab-example').addEventListener('click',()=>{
  const projectId=getProjectId();
  if(!projectId){announce('Open a project to use the Engineering Lab.',{tone:'warn'});return;}
  try{
   input.value=JSON.stringify(methodLabSyntheticExampleV30(operation.value,projectId),null,2);
   clear();
   setStatus('SYNTHETIC EXAMPLE LOADED');
   input.focus();
  }catch(e){recordError(e);}
 });
 operation.addEventListener('change',()=>{input.value='';clear();});
 run.addEventListener('click',async()=>{
  if(busy)return;
  const projectId=getProjectId();
  if(!projectId){announce('Open a project to run an engineering method.',{tone:'warn'});return;}
  let data;
  try{
   data=JSON.parse(input.value);
   if(!data||Array.isArray(data)||typeof data!=='object')throw Error('METHOD_LAB_JSON_OBJECT_REQUIRED');
  }catch(e){setStatus('INVALID JSON');announce('Enter one valid JSON object.',{tone:'warn'});return;}
  busy=true;run.disabled=true;clear();setStatus('RUNNING LOCAL REVIEW');
  try{
   const response=await request(ENGINEERING_METHOD_LAB_PATH,{method:'POST',body:{
    opt_in:true,project_id:projectId,operation:operation.value,input:data
   }});
   if(getProjectId()!==projectId){clear();setStatus('PROJECT CHANGED');return;}
   const view=summarizeEngineeringLabV30(response.receipt);
   latest=view;preview.textContent=view.short;full.value=view.full;
   copy.disabled=false;copyFull.disabled=false;setStatus(view.status);
   announce('Engineering review completed. Copy the result or open its full receipt.');
  }catch(e){setStatus('REVIEW FAILED');recordError(e);}
  finally{busy=false;run.disabled=false;}
 });
 copy.addEventListener('click',()=>latest&&copyText(latest.short,'Engineering result'));
 copyFull.addEventListener('click',()=>latest&&copyText(latest.full,'Full engineering receipt'));
 clear();
 return {clear,hasResult:()=>latest!==null};
}
