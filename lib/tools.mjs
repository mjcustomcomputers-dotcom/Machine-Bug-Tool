import {reviewAtomicVariants,atomicReviewSchema,atomicContract} from './atomic-review.mjs';
import {routeProblem,routeLegacySweep,routeSchema,sweepSchema,routerCapabilities,routerContract} from './universal-router.mjs';
import {getMethodArk,arkSchema,methodArkInventory} from './method-ark.mjs';
import {renderOutput,renderSchema} from './audience-output.mjs';
import {validate} from './schema.mjs';
export {validate} from './schema.mjs';
import {universalInputSchema,universalContract,validateUniversal} from './universal.mjs';
import {businessLogicSweep,reviewBridge} from './review-bridge.mjs';
import {catalogSchema,evaluateSchema,getMethodCatalog,evaluateMethod} from './methods.mjs';
import {researchSchema,crossSchema,operativeSchema,getResearchRegistry,crossReferenceMethods,compareOperativeStates,outputContract} from './research.mjs';
import {backupSchema,backupContract,prepareResearchBackup} from './backup.mjs';
import bundle from './registry-bundle.json' with {type:'json'};
import schemas from './schemas.json' with {type:'json'};
export const VERSION='0.10.0-http.1';
import {analysisSchema,registrySchema,analyzeBusinessLogic,getBusinessLogicRegistry} from './solid-state.mjs';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const result=(status,data={})=>({...data,status,prototype_version:'0.4.2',canonical_promotion:false,court_release_allowed:false});
const fail=m=>{throw new Error(m)};
const nonempty=(v,k)=>{if(typeof v!=='string'||!v.trim())fail('MISSING_OR_INVALID_'+k.toUpperCase())};
export async function sha256(raw){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),x=>x.toString(16).padStart(2,'0')).join('')}
let checked;
async function registries(){
 if(!checked)checked=(async()=>{
  for(const [name,b]of Object.entries(bundle))if(await sha256(b.raw)!==b.sha256)fail('REGISTRY_CONTENT_HASH_MISMATCH:'+name);
  const max=JSON.parse(bundle['maxvar256.json'].raw),micro=JSON.parse(bundle['nestmax_program_iid_pack.json'].raw);
  if(max.count!==256||max.dimensions.length!==256||max.dimensions.some((x,i)=>x.id!==i+1))fail('MAXVAR_CANONICAL_ID_SET_MISMATCH');
  const ids=micro.classifiers.map(x=>x.id),counts={};
  if(new Set(ids).size!==ids.length||ids.length!==micro.observed_count)fail('MICROCLASSIFIER_ID_SET_MISMATCH');
  for(const row of micro.classifiers)counts[row.branch]=(counts[row.branch]??0)+1;
  if(Object.keys(counts).length!==Object.keys(micro.branch_counts).length||Object.entries(counts).some(([k,v])=>micro.branch_counts[k]!==v))fail('MICROCLASSIFIER_BRANCH_COUNT_MISMATCH');
  return {max,micro,report:{maxvar:max.dimensions.length,microclassifiers:ids.length,branch_counts:counts,legacy_descriptor:micro.legacy_descriptor_count,descriptor_matches_enumeration:ids.length===micro.legacy_descriptor_count,status:'LOCAL_REGISTRY_STRUCTURE_PASS',canonical_promotion:false}};
 })();
 return checked;
}
async function get_registry({ids}){const {max,report}=await registries();return result('FROZEN_REGISTRY',{registry:report,dimensions:max.dimensions.filter(x=>ids.includes(x.id)),currentness:'BUILD_SNAPSHOT_REQUIRES_LIVE_REVALIDATION_BEFORE_CANONICAL_USE'})}
function delta_plan({dependencies,changed,previous_fingerprint,current_fingerprint,batch_size=3}){
 for(const f of[previous_fingerprint,current_fingerprint])if(!/^[0-9a-f]{64}$/.test(f))fail('INVALID_FINGERPRINT');
 if(previous_fingerprint===current_fingerprint)return result('NO_DELTA',{batches:[],affected:[]});
 if(!changed.length)fail('CHANGED_FINGERPRINT_REQUIRES_CHANGED_NODES');
 const reverse=new Map();for(const[n,req]of Object.entries(dependencies))for(const x of req){if(!reverse.has(x))reverse.set(x,new Set());reverse.get(x).add(n)}
 const found=new Set(changed),queue=[...found].sort();for(let i=0;i<queue.length;i++)for(const n of [...(reverse.get(queue[i])??[])].sort())if(!found.has(n)){found.add(n);queue.push(n)}
 const impacted=[...found].sort(),pending=new Set(impacted),batches=[],ordered=[];
 while(pending.size){const ready=[...pending].filter(n=>!(own(dependencies,n)?dependencies[n]:[]).some(x=>pending.has(x))).sort();if(!ready.length)return result('BLOCKED_DEPENDENCY_CYCLE',{affected:impacted,blocked:[...pending].sort(),batches:[]});const batch=ready.slice(0,batch_size);batches.push(batch);ordered.push(...batch);batch.forEach(n=>pending.delete(n))}
 return result('DELTA_PLAN',{affected:ordered,batches,unaffected:Object.keys(dependencies).filter(n=>!found.has(n)).sort()});
}
function refine_counterexample({namespace,path_id,input_fingerprint,checks}){
 for(const[k,v]of Object.entries({namespace,path_id,input_fingerprint}))nonempty(v,k);
 if(!/^[0-9a-f]{64}$/.test(input_fingerprint))fail('INVALID_FINGERPRINT');
 const seen=new Set(),failed=[],targets=[];
 for(const c of checks){nonempty(c.predicate,'predicate');nonempty(c.reason,'reason');if(seen.has(c.predicate))fail('DUPLICATE_PREDICATE_RECONCILE_FIRST');seen.add(c.predicate);if(c.state!=='UNKNOWN')nonempty(c.source_ref,'source_ref');if(c.state==='FAIL')failed.push(c);if(c.state==='UNKNOWN'){if(!c.target)fail('BOUNDED_TARGET_REQUIRED');for(const[k,v]of Object.entries(c.target))nonempty(v,k);targets.push({predicate:c.predicate,...c.target})}}
 const guards=failed.map(c=>({predicate:c.predicate,reason:c.reason,source_ref:c.source_ref,scope:{namespace,path_id,input_fingerprint},state:'CANDIDATE_GUARD',revalidate_on_input_change:true}));
 return result(failed.length?'REFINEMENT_CANDIDATE':targets.length?'OPEN_FRONTIER':'ADVERSE_ROUTE_RETAINED',{guards,targets,original_path_retained:true,source_checks_authenticated:false,global_guard_promoted:false,minimum_separating_set_computed:false,legal_cegar_scope:'Triage of caller-supplied concrete checks; no path generation, interpolation, or semantic proof'});
}
schemas.validate_evidence_packet=universalInputSchema;
schemas.get_universal_contract={type:"object",properties:{},required:[],additionalProperties:false};
schemas.prepare_research_backup=backupSchema;
schemas.get_research_registry=researchSchema;
schemas.cross_reference_methods=crossSchema;
schemas.compare_operative_states=operativeSchema;
schemas.get_method_catalog=catalogSchema;
schemas.review_atomic_variants=atomicReviewSchema;
schemas.evaluate_method=evaluateSchema;
schemas.get_nestmax_registry={type:'object',properties:{ids:{type:'array',minItems:1,maxItems:24,items:{type:'string',minLength:4,maxLength:4}},branch:{type:'string',enum:['A','B','C','D','E','F','G','H']}},additionalProperties:false};
schemas.business_logic_sweep=sweepSchema;
schemas.analyze_business_logic=sweepSchema;
schemas.get_business_logic_registry=registrySchema;
schemas.route_problem=routeSchema;schemas.get_method_ark=arkSchema;schemas.render_output=renderSchema;
const functions={review_atomic_variants:reviewAtomicVariants,route_problem:routeProblem,get_method_ark:getMethodArk,render_output:renderOutput,prepare_research_backup:prepareResearchBackup,get_research_registry:getResearchRegistry,cross_reference_methods:crossReferenceMethods,compare_operative_states:compareOperativeStates,get_method_catalog:getMethodCatalog,evaluate_method:evaluateMethod,get_nestmax_registry,business_logic_sweep:businessLogicSweep,analyze_business_logic:routeLegacySweep,get_business_logic_registry:getBusinessLogicRegistry,get_registry,delta_plan,refine_counterexample,validate_evidence_packet:validateUniversal,get_universal_contract:async()=>({...universalContract,universal_router:routerContract,atomic_review:atomicContract,method_inventory:methodArkInventory,audience_output_schema:renderSchema,review_bridge:reviewBridge,normal_answer_contract:outputContract,research_storage:backupContract})};
const descriptions={review_atomic_variants:'Transform a finite source-bound atom model using the existing 17 operators. PLAN by default. EXECUTE_SUPPLIED_MODELS runs only explicitly supplied models and invariants; returns TEST ONLY variants, original state, model counterexamples and whole-catalog accounting. No target traffic, source writes, automatic atomization, findings or canonical promotion.',route_problem:'Gate bounded supplied-record analysis by typed structures and questions. Read get_universal_contract first. No source fetching or external actions.',get_method_ark:'Read implemented method DNA or use catalog_layer for METHOD_HOOKS, FRAMEWORK_OPERATORS, REDUCTION_METHODS, TRANSFORMATIONS, or MIRRORS. Use limit 1–5 and next_offset to continue. Inverses are review metadata, not computed proofs.',render_output:'Render exact caller-supplied claims with attribution and separate evidence/finality states. Does not validate factual truth.',prepare_research_backup:'Prepare private hash-bound records and spreadsheet CSV. New work uses TYPED_V2 for exact native identity, numeric order and registered references. Explicit PRIVATE_WITH_DASH_REFERENCES plus CREATE/REUSE/ADVANCE produces a UUID-only projection and separate private resolver; never upload the entire result to Dash. No encryption, persistence or report submission.',get_research_registry:'Read recovered MBSS-1.0: 64 branches/512 review definitions; separate 96 candidate extension templates; jacket 14-axis method; core framework and normal-answer output contract. Exact IDs or bounded pages. Definitions are not findings or executable tests.',cross_reference_methods:'Cross-reference up to 8 exact BL/MBSS/EXT IDs to canonical MAXVAR definitions and bounded related MBSS IDs by shared declared parent. Shared parent does not establish equivalence. Returns a concise ordinary-answer contract.',compare_operative_states:'Compare one changed coordinate across the military-jacket method’s 14 independent evidence-state axes. Preserve literal identity versus function/authority/receipt/waiver/adoption/finality. No legal-effect inference or fact promotion.',get_method_catalog:'Inspect exact implementation levels, limits and draft method-to-branch mappings. Supply a method ID to retrieve its strict input schema before evaluation.',evaluate_method:'Evaluate a bounded supplied mathematical model or evidence table. Read get_method_catalog for the selected method schema. No external access, exploit generation or authenticated findings.',get_nestmax_registry:'Read up to 24 exact NESTMAX IDs, one branch child-ID index, or the eight-branch program/IID catalog. Original parent mapping text and scope preserved.',business_logic_sweep:'UMTB-4 supplied-record review. Read get_universal_contract first for typed routing; without it returns BLOCKED, not broad activation. No network actions or findings.',analyze_business_logic:'Account for all 32 branches and 384 precompiled business-process review checks from a supplied workflow description. Returns candidate checks, not findings or verified evidence. No external action.',get_business_logic_registry:'Read 1–24 exact child IDs (BL01.01–BL32.12), one branch, or the branch catalog. IDs and branch selectors are mutually exclusive. Separate from canonical MAXVAR.',validate_evidence_packet:'Check a domain-neutral evidence packet for exact source/version/span/subject references and dependency integrity. Structural checks only; never approves adoption or proves truth.',get_universal_contract:'Retrieve the portable evidence packet schema, offset/hash rules, state vocabulary and integration boundaries.',get_registry:'Read up to 12 exact canonical MAXVAR definitions. Verifies four build-pinned registry digests. No legal promotion.',delta_plan:'Compute changed-node dependent closure and ordered batches of 1–3. Detect cycles. Does not invoke other connectors.',refine_counterexample:'Triage up to 32 supplied PASS/FAIL/UNKNOWN checks into scoped candidate guards and bounded unresolved targets. Caller PASS is not authenticated proof.'};
export const toolList=[{name:'runtime_status',description:'Report hosted runtime version, implemented tool scope and verified registry counts.',inputSchema:{type:'object',properties:{},additionalProperties:false}},...Object.keys(functions).map(name=>({name,description:descriptions[name],inputSchema:schemas[name]}))].map(t=>({...t,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:t.name!=='prepare_research_backup',openWorldHint:false}}));
export async function callTool(name,args){
 const tool=toolList.find(t=>t.name===name);if(!tool)fail('UNKNOWN_TOOL');validate(args,tool.inputSchema);
 if(name==='runtime_status')return result('HOSTED_MCP_READY',{runtime_version:VERSION,research_storage_version:backupContract.version,private_export_default:true,dash_reference_projection:true,registry_authenticated_identity_required:true,...routerCapabilities,boot_instruction:'Read get_universal_contract before analysis. Existing business_logic_sweep supports UMTB4 JSON in context, including method_lookup, presentation and explicit atomic_review, when client discovery has not yet exposed dedicated tools.',method_catalog_version:getMethodCatalog().version,research_registry:{mbss_branches:64,mbss_classifiers:512,separate_candidate_extension_templates:96,jacket_axes:14,output_contract:'RECON-OUTPUT-1.0'},implemented_evaluators:getMethodCatalog().methods.length,atomic_execution_version:atomicContract.version,atomic_transform_operators:atomicContract.transformation_algebra.length,atomic_review_available:true,method_inventory:methodArkInventory,business_logic_registry:await businessRegistryStatus(),request_limits:{message_bytes:2000000,response_bytes:1000000,body_deadline_ms:5000,inflight_per_isolate:8,tool_calls_per_minute_per_user_per_isolate:60,automatic_retries:0},transport:'streamable-http',available_tools:toolList.map(x=>x.name),registry:(await registries()).report,local_only_tools:['stage_source','inspect_atom','compare_meanings','test_variation','reconcile_methods','self_test'],proof_gate_hosted:false,persistence_hosted:false,connector_dispatch:false});
 return functions[name](args);
}

async function businessRegistryStatus(){const r=await getBusinessLogicRegistry();return {status:r.status,pack_id:r.pack_id,version:r.version,pack_fingerprint:r.pack_fingerprint,branch_count:r.branch_count,classifier_count:r.classifier_count,canonical_maxvar_range:r.canonical_maxvar_range}}

async function get_nestmax_registry({ids,branch}={}){
 const {micro}=await registries();if(ids&&branch)fail('USE_IDS_OR_BRANCH_NOT_BOTH');
 if(ids&&(new Set(ids).size!==ids.length||ids.some(id=>!micro.classifiers.some(c=>c.id===id))))fail('INVALID_NESTMAX_IDS');
 return {status:micro.status,pack_id:micro.pack_id,scope:micro.scope,observed_count:micro.observed_count,legacy_descriptor_count:micro.legacy_descriptor_count,count_discrepancy:micro.count_discrepancy,source_export_sha256:micro.source_export_sha256,source_drive_id:micro.source_drive_id,referenced_parent_drive_id:micro.referenced_parent_drive_id,parent_document_read_this_run:false,branches:ids?{}:Object.fromEntries(Object.entries(micro.branches).filter(([id])=>!branch||branch===id)),child_ids:branch?micro.classifiers.filter(c=>c.branch===branch).map(c=>c.id):[],classifiers:ids?ids.map(id=>micro.classifiers.find(c=>c.id===id)):[],parent_mapping_status:'ORIGINAL_LITERAL_NOT_REINTERPRETED',canonical_promotion:false,court_release_allowed:false,external_action_authorized:false};
}
