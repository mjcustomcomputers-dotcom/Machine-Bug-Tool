import pack from './solid-state-pack.json' with {type:'json'};
const PIN='7db8a73e32016a8d3df560f649125221615b42a669231ec066ce74fee9d8a58d';
const REQUIRED=['namespace','object_id','actor','action','state_before','state_after','channel','invariant','context'];
const OPTIONAL=['authority_owner','feedback','value_object','timing_context','counterparty'];
const MONEY=new Set('payment pay paid refund capture captured authorize authorization settlement settle fee credit balance wallet currency price amount charge chargeback voucher reward loyalty deposit withdrawal money'.split(' '));
const ENTITLEMENT=new Set('entitlement inventory eligibility eligible voucher reward loyalty reservation seat stock'.split(' '));
const WEIGHTS={OMITTED:12,UNEXPECTED:11,WRONG_ACTOR:10,WRONG_OBJECT:10,WRONG_STATE:12,WRONG_ORDER:11,STALE_OR_DELAYED:12,DUPLICATE_OR_REPLAY:13,CROSS_CHANNEL:12,CROSS_VERSION:9,PARTIAL_FAILURE:11,RECOVERY_OR_ROLLBACK:11};
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
export async function fingerprint(v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(v)))),x=>x.toString(16).padStart(2,'0')).join('')}
export async function verifyPack(p){
 if(await fingerprint(p)!==PIN)throw Error('SOLID_STATE_PACK_DIGEST_MISMATCH');
 if(p.pack_id!=='BL-SOLID-STATE-384'||p.branches.length!==32||p.classifiers.length!==384)throw Error('SOLID_STATE_PACK_INTEGRITY');
 for(let i=1;i<=32;i++){
  const bid='BL'+String(i).padStart(2,'0'),b=p.branches[i-1],cs=p.classifiers.filter(c=>c.branch_id===bid);
  if(b.branch_id!==bid||cs.length!==12||new Set(cs.map(c=>c.lens)).size!==12)throw Error('SOLID_STATE_BRANCH_INTEGRITY');
  cs.forEach((c,j)=>{if(c.id!==bid+'.'+String(j+1).padStart(2,'0')||!Object.hasOwn(WEIGHTS,c.lens)||c.parent_maxvar_ids.some(x=>!Number.isInteger(x)||x<1||x>256))throw Error('SOLID_STATE_CLASSIFIER_INTEGRITY')});
 }
 return PIN;
}
// Freeze imported definitions so lookup consumers cannot mutate later analyses.
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}return v}freeze(pack);
let verified;
async function ready(){return verified??=verifyPack(pack)}
export const analysisSchema={type:'object',required:REQUIRED,additionalProperties:false,properties:Object.fromEntries([...REQUIRED.map(k=>[k,{type:'string',minLength:1,maxLength:10000}]),...OPTIONAL.map(k=>[k,{type:['string','null'],minLength:1,maxLength:10000}])])};
export const registrySchema={type:'object',additionalProperties:false,properties:{ids:{type:'array',minItems:1,maxItems:24,items:{type:'string',minLength:7,maxLength:7}},branch_id:{type:'string',enum:pack.branches.map(b=>b.branch_id)}}};
export async function getBusinessLogicRegistry({branch_id,ids}={}){
 await ready();if(ids!==undefined){if(branch_id!==undefined)throw Error('USE_IDS_OR_BRANCH_NOT_BOTH');if(!Array.isArray(ids)||ids.length<1||ids.length>24||new Set(ids).size!==ids.length||ids.some(id=>!pack.classifiers.some(c=>c.id===id)))throw Error('INVALID_CLASSIFIER_IDS')}if(branch_id!==undefined&&!pack.branches.some(b=>b.branch_id===branch_id))throw Error('UNKNOWN_BRANCH');
 return {status:'FROZEN_REGISTRY',pack_id:pack.pack_id,version:pack.version,pack_fingerprint:PIN,branch_count:32,classifier_count:384,canonical_maxvar_range:[1,256],branches:ids?[]:pack.branches.filter(b=>!branch_id||b.branch_id===branch_id),classifiers:ids?ids.map(id=>pack.classifiers.find(c=>c.id===id)):branch_id?pack.classifiers.filter(c=>c.branch_id===branch_id):[],canonical_promotion:false,external_action_authorized:false};
}
// Python str.strip whitespace, including U+001C..001F and excluding BOM.
const strip=v=>v.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g,'');
export async function analyzeBusinessLogic(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('INPUT_OBJECT_REQUIRED');
 const unknown=Object.keys(data).filter(k=>![...REQUIRED,...OPTIONAL].includes(k)).sort();if(unknown.length)throw Error('UNKNOWN_FIELDS:'+unknown.join(','));
 const missing=REQUIRED.filter(k=>!Object.hasOwn(data,k));if(missing.length)throw Error('MISSING_FIELDS:'+missing.join(','));
 const frozen={};for(const k of [...REQUIRED,...OPTIONAL]){const v=data[k];if(v==null&&OPTIONAL.includes(k)){frozen[k]=null;continue}if(typeof v!=='string'||!strip(v)||[...v].length>10000||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))throw Error('INVALID_'+k.toUpperCase());frozen[k]=strip(v)}
 await ready();const input_fp=await fingerprint(frozen),toks=new Set(Object.values(frozen).map(v=>v??'').join(' ').toLowerCase().match(/[a-z0-9_-]+/g)??[]);
 const money=[...MONEY].some(x=>toks.has(x)),entitlement=[...ENTITLEMENT].some(x=>toks.has(x));
 const active=[],watch=[],dormant=[],frontier=[],scored=[],maxvars=new Set(),methodCounts={};
 for(const b of pack.branches){
  const bid=b.branch_id,matched=[...new Set(b.signals)].filter(x=>toks.has(x)).sort();
  let state=['BL27','BL28','BL29','BL30'].includes(bid)?(money?'ACTIVE':'WATCH'):bid==='BL31'?(entitlement?'ACTIVE':'WATCH'):'ACTIVE';
  if(matched.length&&state==='WATCH')state='ACTIVE';const score=(state==='ACTIVE'?30:10)+Math.min(20,5*matched.length),cs=pack.classifiers.filter(c=>c.branch_id===bid);
  for(const c of cs){(state==='ACTIVE'?active:watch).push(c.id);c.parent_maxvar_ids.forEach(x=>maxvars.add(x));scored.push({c,score:score+WEIGHTS[c.lens]});for(const m of c.method_sources)methodCounts[m]=(methodCounts[m]??0)+1}
  frontier.push({branch_id:bid,label:b.label,state,matched_signals:matched,classifier_count:cs.length,parent_maxvar_ids:b.parent_maxvar_ids,method_sources:b.methods});
 }
 scored.sort((a,b)=>b.score-a.score||(a.c.id<b.c.id?-1:a.c.id>b.c.id?1:0));
 return {status:'SOLID_STATE_SWEEP_CANDIDATE',analysis_mode:'SOLID_STATE_PRECOMPILED',method_pack_version:'BL-SOLID-STATE-1.0',classifier_pack_id:pack.pack_id,classifier_pack_version:pack.version,namespace:frozen.namespace,object_id:frozen.object_id,input_fingerprint:input_fp,pack_fingerprint:PIN,coverage_fingerprint:await fingerprint({input:input_fp,pack:PIN}),branch_count:32,classifier_count:384,branches_accounted:frontier.length,solid_state_complete:frontier.length===32&&active.length+watch.length===384,active_classifier_count:active.length,watch_classifier_count:watch.length,dormant_classifier_count:0,active_classifier_ids:active,watch_classifier_ids:watch,dormant_classifier_ids:dormant,branch_frontier:frontier,priority_classifiers:scored.slice(0,48).map(({c,score})=>({classifier_id:c.id,branch_id:c.branch_id,lens:c.lens,score,question:c.predicate_template,falsifier:c.falsifier_template,evidence_target:c.evidence_target_template,parent_maxvar_ids:c.parent_maxvar_ids})),method_source_counts:methodCounts,money_related:money,entitlement_related:entitlement,maxvar_ids:[...maxvars].sort((a,b)=>a-b),next_reduction:'Use priority_classifiers against passive/native evidence first. Every branch has already been accounted for; later passes may only change a branch state or resolve a classifier, not invent a forgotten branch.',limits:['384 child classifiers are precompiled hypotheses/checks, not findings.','Canonical MAXVAR remains 1-256; child IDs are a separate additive registry.','No target traffic or external action is performed.','Use only within current explicit bounty authorization.'],canonical_promotion:false,court_release_allowed:false,external_action_authorized:false};
}
