import {createHash} from 'node:crypto';
import {analyzeBusinessLogic} from './solid-state.mjs';
import {evaluateMethod} from './methods.mjs';
import {callTool} from './tools.mjs';
import {normalizeScreenContext} from './mpc-screen-cache.mjs';
import {buildScreenVirtualOsi,createVirtualOsiCache} from './mpc-osi-virtual.mjs';
import {inspectNegationScopes} from './mpc-natural-negation.mjs';

export const SCREEN_CLASSIFIER_VERSION='1.0.0';
export const SCREEN_CLASSIFIER_LIMITS=Object.freeze({maxTextChars:200_000,maxLineHashes:64,maxExcerptChars:112,maxReportBytes:24*1024,maxReceiptAgeMs:15_000,maxRevokedScopes:64});
const DEPENDENCIES=Object.freeze({observation:[],cues:['observation'],hypotheses:['cues'],native_review:['cues'],mpc_priorities:['observation'],user_review:['hypotheses','native_review','mpc_priorities']});
const RULES=Object.freeze([
  {id:'INSTRUCTION_OVERRIDE',label:'instruction override',pattern:/\b(?:ignore|disregard|override)\b[^\n.!?]{0,64}\b(?:previous|prior|system|developer|safety)\b[^\n.!?]{0,40}\b(?:instructions?|prompts?|rules?|polic(?:y|ies))\b|\b(?:reveal|print|show)\b[^\n.!?]{0,32}\b(?:system|developer)\s+prompt\b/iu,
    statement:'The displayed text may be trying to change an assistant’s operating instructions.',alternative:'The same text may be a quotation, tutorial, or defensive example.'},
  {id:'CREDENTIAL_REQUEST',label:'credential request',pattern:/\b(?:enter|type|paste|provide|share|send|reveal|submit|verify)\b[^\n.!?]{0,60}\b(?:password|passcode|pin|one[- ]time code|verification code|api[-_ ]?key|access[-_ ]?token|private key|seed phrase|recovery phrase)\b/iu,
    statement:'The screen may be requesting credentials or an authentication step.',alternative:'It may be a legitimate sign-in flow or advice about protecting credentials.'},
  {id:'CREDENTIAL_MENTION',label:'credential-related text',pattern:/\b(?:password|passcode|one[- ]time code|verification code|api[-_ ]?key|access[-_ ]?token|private key|seed phrase|recovery phrase)\b/iu,
    statement:'The displayed material may concern credentials or account recovery.',alternative:'A label or documentation does not establish that anyone disclosed credentials.'},
  {id:'PAYMENT',label:'payment or transfer',pattern:/\b(?:pay(?:ment)?|checkout|credit card|debit card|bank transfer|wire transfer|send funds|transfer funds|confirm purchase|billing address)\b/iu,
    statement:'The screen may be part of a payment or transfer flow.',alternative:'It may instead show an invoice, example, or historical payment record.'},
  {id:'DESTRUCTIVE_ACTION',label:'destructive operation',pattern:/\b(?:permanently delete|delete permanently|delete all|erase all|wipe (?:the |this |your )?(?:drive|disk|device|data)|format (?:the |this |your )?(?:drive|disk)|factory reset|cannot be undone|empty (?:the )?recycle bin)\b/iu,
    statement:'The screen may be presenting an irreversible or destructive operation.',alternative:'It may be warning about, documenting, or preventing that operation.'},
  {id:'LOCAL_EXECUTION',label:'local execution request',pattern:/\b(?:run|execute|paste)\b[^\n.!?]{0,48}\b(?:command|script|powershell|terminal)\b|\bdownload and install\b|\bdisable\b[^\n.!?]{0,32}\b(?:firewall|antivirus|security software)\b/iu,
    statement:'The text may be requesting local command execution or software installation.',alternative:'The words may be documentation or diagnostic output rather than an instruction to act.'},
  {id:'URGENCY',label:'urgency language',pattern:/\b(?:act now|urgent|immediately|expires? in \d{1,4} (?:minutes?|seconds?)|within \d{1,4} minutes?)\b/iu},
  {id:'AUTHORITY_CLAIM',label:'authority claim',pattern:/\b(?:official support|system message|security team|administrator required|admin(?:istrator)? privileges required)\b/iu},
]);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function clean(value,max=112){return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').slice(0,max).toWellFormed();}
function redact(value){
  return value
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/gu,'[REDACTED TOKEN]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{8,}/giu,'Bearer [REDACTED]')
    .replace(/(\b(?:password|passcode|api[-_ ]?key|access[-_ ]?token|secret|private key|seed phrase|recovery phrase)\b\s*[:=]\s*)[^\s;&]{1,512}/giu,'$1[REDACTED]')
    .replace(/\b(?:\d[ -]?){12,19}\b/gu,'[REDACTED NUMBER]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/gu,'[REDACTED NUMBER]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,'[REDACTED EMAIL]');
}
function excerpt(text,start,end){return clean(redact(text.slice(Math.max(0,start-24),Math.min(text.length,end+32))),SCREEN_CLASSIFIER_LIMITS.maxExcerptChars);}
function signals(text){
  const cues=[];
  for(const rule of RULES){
    const match=rule.pattern.exec(text);if(!match)continue;
    const start=match.index,end=start+match[0].length;
    const surrounding=text.slice(Math.max(0,start-80),Math.min(text.length,end+40));
    const protective=/\b(?:never|do not|don't|avoid|warning|example|quoted|quotation|tutorial)\b/iu.test(surrounding);
    cues.push({id:rule.id,label:rule.label,excerpt:excerpt(text,start,end),
      span:{start,end,offset_unit:'UTF16_CODE_UNITS'},protective_or_quoted_context:protective,
      meaning:'LEXICAL_CUE_NOT_VERIFIED_INTENT'});
  }
  return cues;
}
function lineHashes(text){
  const all=text.split(/\r?\n/u);const selected=all.slice(0,SCREEN_CLASSIFIER_LIMITS.maxLineHashes);
  return {hashes:selected.map(line=>hash(line)),selected,total:all.length,complete:all.length<=selected.length};
}
function lineChanges(previous,next){
  const counts=values=>{const out=new Map();for(const value of values)out.set(value,(out.get(value)??0)+1);return out;};
  const old=counts(previous??[]),current=counts(next.hashes);
  let added=0,removed=0;
  for(const [key,count] of current)added+=Math.max(0,count-(old.get(key)??0));
  for(const [key,count] of old)removed+=Math.max(0,count-(current.get(key)??0));
  const index=next.hashes.findIndex(value=>!old.has(value));
  return {added_lines:added,removed_lines:removed,
    line_order_changed:!!previous&&JSON.stringify(previous)!==JSON.stringify(next.hashes)&&added===0&&removed===0,
    line_change_coverage:next.complete?'COMPLETE':'FIRST_64_LINES_ONLY',
    changed_excerpt:index<0?'':clean(redact(next.selected[index]),SCREEN_CLASSIFIER_LIMITS.maxExcerptChars)};
}
function shortSolidState(result){
  return {execution:'EXECUTED_LOCALLY',status:result.status,pack_id:result.classifier_pack_id,
    pack_version:result.classifier_pack_version,pack_fingerprint:result.pack_fingerprint,
    input_fingerprint:result.input_fingerprint,coverage_fingerprint:result.coverage_fingerprint,
    branches_accounted:result.branches_accounted,classifiers_accounted:result.active_classifier_count+result.watch_classifier_count,
    priority_checks:result.priority_classifiers.slice(0,4).map(row=>({id:row.classifier_id,lens:row.lens,
      question:clean(row.question,180),falsifier:clean(row.falsifier,180)})),
    meaning:'BUNDLED_PRECOMPILED_CANDIDATE_CHECKS; NO FINDING OR SOURCE AUTHENTICATION'};
}
function sourceFrom(receipt,textHash){return {sessionId:receipt.context.sessionId,sourceId:receipt.context.sourceId,
  projectId:receipt.context.projectId,generation:receipt.generation,frame_sha256:receipt.frame.sha256,
  text_sha256:textHash,captured_at:receipt.frame.captured_at};}
function uncertainties(receipt,lines,visualOnly=false){
  return ['AUTHORSHIP_AND_MOTIVE_UNKNOWN','USER_ACTION_UNOBSERVED','ENGLISH_LEXICAL_RULES_ONLY',
    ...(receipt.ocr.confidence==null?['OCR_CONFIDENCE_UNKNOWN']:receipt.ocr.confidence<70?['OCR_LOW_CONFIDENCE_INPUT']:[]),
    ...(receipt.ocr.truncated?['OCR_TEXT_TRUNCATED']:[]),...(!lines.complete?['LINE_CHANGE_COVERAGE_PARTIAL']:[]),
    ...(visualOnly?['NON_TEXT_VISUAL_CHANGE_UNCLASSIFIED']:[])];
}

/**
 * Local observations in; bounded, explicitly hypothetical interpretation out.
 * Native BL32/384, delta_plan and fault_tree are reused without registry edits.
 * The host must also enforce its current capture session and generation.
 */
export function createScreenObservationClassifier({now=Date.now}={}){
  if(typeof now!=='function')fail('MPC_SCREEN_CLASSIFIER_CLOCK_INVALID');
  let retained=null,activeKey=null,epoch=0,busy=false,lastCaptured=-1,cutoff=-1;
  const revoked=new Set();
  const metaCache=createVirtualOsiCache({maxEntries:8,maxBytes:96*1024,ttlMs:15_000,now});
  const counters={seen:0,classified:0,reused:0,stale:0,busy:0,resets:0,invalidated:0,native_sweeps:0,native_method_calls:0,native_dependency_calls:0};
  function clock(){const value=now();if(!Number.isFinite(value)||value<0)fail('MPC_SCREEN_CLASSIFIER_CLOCK_INVALID');return value;}
  function revoke(key){if(key){revoked.add(key);while(revoked.size>SCREEN_CLASSIFIER_LIMITS.maxRevokedScopes)revoked.delete(revoked.values().next().value);}}
  function small(status,reason){return freeze({kind:'MPC_SCREEN_CLASSIFIER_REPORT',version:SCREEN_CLASSIFIER_VERSION,status,summary:reason,
    trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,external_action_authorized:false,counters:{...counters}});}
  function validateReceipt(receipt){
    if(!receipt||receipt.kind!=='MPC_SCREEN_OCR_OBSERVATION'||receipt.trust!=='UNTRUSTED_SCREEN_OCR'||receipt.source_authentication!==false||
      !receipt.ocr||receipt.ocr.trust!=='UNTRUSTED_SCREEN_OCR'||receipt.ocr.network!=='DISABLED'||typeof receipt.ocr.text!=='string'||
      receipt.ocr.text.length>SCREEN_CLASSIFIER_LIMITS.maxTextChars||!receipt.frame||!/^[a-f0-9]{64}$/u.test(receipt.frame.sha256??'')||
      !Number.isSafeInteger(receipt.generation)||receipt.generation<0)fail('MPC_SCREEN_CLASSIFIER_RECEIPT_INVALID');
    if(receipt.ocr.confidence!=null&&(!Number.isFinite(receipt.ocr.confidence)||receipt.ocr.confidence<0||receipt.ocr.confidence>100))fail('MPC_SCREEN_CLASSIFIER_RECEIPT_INVALID');
    const context=normalizeScreenContext(receipt.context),captured=Date.parse(receipt.frame.captured_at);
    const at=clock();if(!Number.isFinite(captured)||captured<0||captured>at||at-captured>SCREEN_CLASSIFIER_LIMITS.maxReceiptAgeMs)fail('MPC_SCREEN_CLASSIFIER_CAPTURE_TIME_INVALID');
    // Only the fields used here cross an asynchronous native-method boundary.
    // Copy them now so a caller cannot mutate the evidence/source after hashing.
    const snapshot=freeze({context,generation:receipt.generation,
      frame:{sha256:receipt.frame.sha256,captured_at:receipt.frame.captured_at,
        width:Number.isSafeInteger(receipt.frame.width)&&receipt.frame.width>0?receipt.frame.width:null,
        height:Number.isSafeInteger(receipt.frame.height)&&receipt.frame.height>0?receipt.frame.height:null},
      ocr:{text:receipt.ocr.text,confidence:receipt.ocr.confidence??null,truncated:receipt.ocr.truncated===true}});
    return {key:hash(JSON.stringify({context,generation:snapshot.generation})),captured,textHash:hash(snapshot.ocr.text),snapshot};
  }
  return Object.freeze({
    async analyze(receipt){
      const input=validateReceipt(receipt);receipt=input.snapshot;counters.seen++;
      if(revoked.has(input.key)||input.captured<cutoff||input.captured<lastCaptured||
        retained&&input.captured===lastCaptured&&receipt.frame.sha256!==retained.report.source.frame_sha256){
        counters.stale++;return small('STALE','Observation belongs to a revoked scope or an earlier capture.');
      }
      if(busy){counters.busy++;return small('SKIPPED_BUSY','A bounded screen classification is already running.');}
      if(retained&&retained.key!==input.key){revoke(retained.key);retained=null;epoch++;metaCache.clear();}
      const token=epoch;busy=true;activeKey=input.key;lastCaptured=input.captured;
      const previous=retained;
      try{
        const same=previous?.textHash===input.textHash;
        const changed=await callTool('delta_plan',{dependencies:DEPENDENCIES,
          changed:same?[]:['observation'],previous_fingerprint:previous?.textHash??'0'.repeat(64),current_fingerprint:input.textHash,batch_size:3});
        counters.native_dependency_calls++;
        if(token!==epoch){counters.invalidated++;return small('INVALIDATED','Capture reset invalidated this analysis.');}
        const lines=lineHashes(receipt.ocr.text);
        const frameChanged=!!previous&&previous.report.source.frame_sha256!==receipt.frame.sha256;
        let cues,hypotheses,native;
        if(same){
          cues=previous.report.cues;hypotheses=previous.report.hypotheses;
          native={...previous.report.native,solid_state:{...previous.report.native.solid_state,execution:'REUSED_SAME_TEXT_AND_SCOPE'},
            fault_tree:{...previous.report.native.fault_tree,execution:'REUSED_SAME_TEXT_AND_SCOPE'}};
        }else{
          cues=signals(receipt.ocr.text);
          hypotheses=cues.filter(cue=>RULES.find(rule=>rule.id===cue.id)?.statement&&
            (cue.id!=='CREDENTIAL_MENTION'||!cues.some(item=>item.id==='CREDENTIAL_REQUEST'))).slice(0,5).map(cue=>{
            const rule=RULES.find(item=>item.id===cue.id);
            return {id:`HYPOTHESIS_${cue.id}`,status:'HYPOTHESIS',statement:rule.statement,evidence_cue_ids:[cue.id],observed_excerpt:cue.excerpt,
              alternative:rule.alternative,falsifier:'Compare the original selected source and surrounding context; observe the actual requested action.',
              protective_or_quoted_context:cue.protective_or_quoted_context,probability_computed:false,user_intention_inferred:false};
          });
          const ids=new Set(cues.map(cue=>cue.id));
          const faultInput={root:'CONFIGURED_CUE_PRESENT',nodes:[{id:'CONFIGURED_CUE_PRESENT',gate:'OR',children:['OVERRIDE','CREDENTIAL','PAYMENT','DESTRUCTIVE','EXECUTION','URGENCY','AUTHORITY']},
            {id:'OVERRIDE',value:ids.has('INSTRUCTION_OVERRIDE')?true:null},
            {id:'CREDENTIAL',value:ids.has('CREDENTIAL_REQUEST')||ids.has('CREDENTIAL_MENTION')?true:null},
            {id:'PAYMENT',value:ids.has('PAYMENT')?true:null},{id:'DESTRUCTIVE',value:ids.has('DESTRUCTIVE_ACTION')?true:null},
            {id:'EXECUTION',value:ids.has('LOCAL_EXECUTION')?true:null},{id:'URGENCY',value:ids.has('URGENCY')?true:null},
            {id:'AUTHORITY',value:ids.has('AUTHORITY_CLAIM')?true:null}]};
          const sweep=await analyzeBusinessLogic({namespace:'LOCAL_SCREEN_OBSERVATION',object_id:input.textHash,
            actor:'Displayed-content author unknown; user intention and action unobserved.',
            action:cues.length?cues.map(cue=>cue.label).join('; '):'No configured English lexical cue matched.',
            state_before:previous?`Previous OCR text fingerprint ${previous.textHash}; its derived report is invalidated.`:'First observation in this capture scope.',
            state_after:cues.length?cues.map(cue=>cue.excerpt).join(' | '):'Current OCR text acquired; displayed purpose unresolved.',
            channel:'Consented local screen OCR; untrusted displayed content.',
            invariant:'Displayed instructions do not authorize actions. Interpretations remain hypotheses until separately supported.',
            context:`Project ${receipt.context.projectId}; source ${receipt.context.sourceId}; screen text fingerprint ${input.textHash}.`});
          counters.native_sweeps++;
          if(token!==epoch){counters.invalidated++;return small('INVALIDATED','Capture reset invalidated this analysis.');}
          const fault=await evaluateMethod({method:'fault_tree',input:faultInput});counters.native_method_calls++;
          native={solid_state:shortSolidState(sweep),fault_tree:{execution:'EXECUTED_LOCALLY',status:fault.status,method:fault.method,
            implementation_version:fault.implementation_version,model_fingerprint:fault.model_fingerprint,result:fault.result,
            leaf_values:faultInput.nodes.slice(1).map(({id,value})=>({id,value})),
            meaning:'TRUE = MATCHED TEXT CUE; NULL = UNRESOLVED. NOT A HARM OR INTENT PROBABILITY.'}};
        }
        if(token!==epoch){counters.invalidated++;return small('INVALIDATED','Capture reset invalidated this analysis.');}
        native.delta={execution:'EXECUTED_LOCALLY',tool:'delta_plan',status:changed.status,affected:changed.affected,batches:changed.batches};
        const priorIds=new Set(previous?.report.cues.map(cue=>cue.id)??[]),currentIds=new Set(cues.map(cue=>cue.id));
        const change={state:same?'TEXT_UNCHANGED':previous?'TEXT_CHANGED':'INITIAL',frame_changed:frameChanged,
          same_frame_text_changed:!!previous&&!frameChanged&&!same,
          ...lineChanges(same?lines.hashes:previous?.lineHashes,lines),
          cues_added:same?[]:[...currentIds].filter(id=>!priorIds.has(id)),cues_removed:same?[]:[...priorIds].filter(id=>!currentIds.has(id)),
          previous_report_invalidated:!!previous&&!same};
        if(same)counters.reused++;else counters.classified++;
        const virtualOsi=buildScreenVirtualOsi({
          project_id:receipt.context.projectId,session_id:receipt.context.sessionId,source_id:receipt.context.sourceId,
          frame_sha256:receipt.frame.sha256,text_sha256:input.textHash,
          confidence:receipt.ocr.confidence,truncated:receipt.ocr.truncated,
          recognized_characters:receipt.ocr.text.length,cue_ids:cues.map(row=>row.id),
          change_state:change.state,frame_width:receipt.frame.width,frame_height:receipt.frame.height,
          negation_observation:inspectNegationScopes(receipt.ocr.text),cache:metaCache
        });
        const report={kind:'MPC_SCREEN_CLASSIFIER_REPORT',version:SCREEN_CLASSIFIER_VERSION,status:same?'REUSED':'CLASSIFIED',
          summary:cues.length?`${cues.length} text cue${cues.length===1?'':'s'} for review: ${cues.map(cue=>cue.label).join(', ')}. Displayed purpose remains a hypothesis.`:
            'No configured text cue matched this OCR observation. Its purpose remains unresolved.',
          source:sourceFrom(receipt,input.textHash),change,cues,hypotheses,virtual_osi:virtualOsi,
          uncertainties:[...uncertainties(receipt,lines,same&&frameChanged),...(change.same_frame_text_changed?['OCR_TEXT_CHANGED_FOR_SAME_FRAME']:[])],native,
          trust:'UNTRUSTED_SCREEN_OCR',source_authentication:false,external_action_authorized:false,autonomous_actions:0,
          retained_state:'CURRENT_REDACTED_REPORT_AND_UP_TO_64_LINE_HASHES',counters:{...counters}};
        if(Buffer.byteLength(JSON.stringify(report),'utf8')>SCREEN_CLASSIFIER_LIMITS.maxReportBytes)fail('MPC_SCREEN_CLASSIFIER_REPORT_LIMIT');
        freeze(report);retained={key:input.key,textHash:input.textHash,lineHashes:lines.hashes,report};return report;
      }finally{busy=false;}
    },
    reset(reason='STOPPED'){
      epoch++;cutoff=clock();revoke(activeKey);activeKey=null;retained=null;metaCache.clear();counters.resets++;
      return small('INVALIDATED',`Classifier reset: ${clean(reason,80)}`);
    },
    status(){return freeze({version:SCREEN_CLASSIFIER_VERSION,busy,epoch,retained_observations:retained?1:0,
      retained_line_hashes:retained?.lineHashes.length??0,limits:SCREEN_CLASSIFIER_LIMITS,counters:{...counters},meta_cache:metaCache.status()});},
  });
}
