import bundle from './registry-bundle.json' with {type:'json'};
import bl from './solid-state-pack.json' with {type:'json'};
import research from './research-registry.json' with {type:'json'};
import {getBusinessLogicRegistry} from './solid-state.mjs';
import {getResearchRegistry} from './research.mjs';
import {getMethodCatalog} from './methods.mjs';
import {digest} from './universal.mjs';

const text={type:'string',minLength:1,maxLength:200};
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const arr=items=>({type:'array',items,minItems:0,maxItems:16});
const nativeId={type:['string','integer'],minLength:1,maxLength:200,minimum:Number.MIN_SAFE_INTEGER,maximum:Number.MAX_SAFE_INTEGER};
const idType={type:'string',enum:['string','integer']};
export const nativeIdentitySchema=obj({namespace:text,native_id_type:idType,native_id:nativeId});
export const classifierReferenceSchema=obj({namespace:{type:'string',enum:['MAXVAR','NESTMAX','BL','MBSS','EXT']},native_id_type:idType,native_id:nativeId});
export const methodReferenceSchema=obj({namespace:{type:'string',enum:['METHOD']},native_id_type:{type:'string',enum:['string']},native_id:{type:'string',enum:getMethodCatalog().methods.map(m=>m.id)}});
export const typedRecordSchema=obj({
 identity:nativeIdentitySchema,
 ordinal:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
 classifier_refs:arr(classifierReferenceSchema),method_refs:arr(methodReferenceSchema)
});
const fail=message=>{throw Error(message)};
const typedKey=ref=>JSON.stringify([ref.namespace,ref.native_id_type,ref.native_id]);
export function validateNativeIdentity(ref){
 if(ref.native_id_type==='integer'?!Number.isSafeInteger(ref.native_id):typeof ref.native_id!=='string')fail('NATIVE_ID_TYPE_MISMATCH');
 if(Object.is(ref.native_id,-0))fail('NEGATIVE_ZERO_NATIVE_ID');
 if(typeof ref.native_id==='string'&&!ref.native_id.trim())fail('EMPTY_NATIVE_ID');
 if(!ref.namespace.trim())fail('EMPTY_NATIVE_NAMESPACE');
}
let checked;
async function registries(){
 return checked??=(async()=>{
  for(const [name,entry]of Object.entries(bundle))if(await digest(entry.raw)!==entry.sha256)fail('REGISTRY_CONTENT_HASH_MISMATCH:'+name);
  const business=await getBusinessLogicRegistry(),recovered=await getResearchRegistry(),methods=getMethodCatalog();
  const maxvar=JSON.parse(bundle['maxvar256.json'].raw),nestmax=JSON.parse(bundle['nestmax_program_iid_pack.json'].raw);
  const classifiers={MAXVAR:new Set(maxvar.dimensions.map(x=>x.id)),NESTMAX:new Set(nestmax.classifiers.map(x=>x.id)),BL:new Set(bl.classifiers.map(x=>x.id)),MBSS:new Set(research.mbss.classifiers.map(x=>x['Classifier ID'])),EXT:new Set(research.extension.definitions.map(x=>'EXT:'+x.id))};
  return {classifiers,methods:new Set(methods.methods.map(x=>x.id)),binding:{
   canonical_maxvar_type:'integer',string_namespaces:['NESTMAX','BL','MBSS','EXT','METHOD'],
   registry_bundle_sha256:Object.fromEntries(Object.entries(bundle).map(([name,entry])=>[name,entry.sha256])),
   business_logic_pack_fingerprint:business.pack_fingerprint,research_registry_fingerprint:recovered.registry_fingerprint,method_catalog_version:methods.version
  }};
 })();
}
export async function validateTypedRecords(records){
 const registry=await registries(),ordinals=new Set();
 for(const record of records){
  if(!record.typed)fail('TYPED_RECORD_METADATA_REQUIRED');
  if(record.classifier_ids.length||record.method_ids.length)fail('TYPED_REFERENCES_REQUIRE_EMPTY_LEGACY_REFERENCE_ARRAYS');
  validateNativeIdentity(record.typed.identity);
  if(ordinals.has(record.typed.ordinal))fail('DUPLICATE_RECORD_ORDINAL');ordinals.add(record.typed.ordinal);
  for(const [refs,method]of [[record.typed.classifier_refs,false],[record.typed.method_refs,true]]){
   const seen=new Set();
   for(const ref of refs){
    validateNativeIdentity(ref);
    if(ref.native_id_type!==(ref.namespace==='MAXVAR'?'integer':'string'))fail('REGISTERED_NAMESPACE_ID_TYPE_MISMATCH');
    const known=method?registry.methods:registry.classifiers[ref.namespace];
    if(!known?.has(ref.native_id))fail(method?'UNKNOWN_METHOD_REFERENCE':'UNKNOWN_CLASSIFIER_REFERENCE');
    const key=typedKey(ref);if(seen.has(key))fail('DUPLICATE_TYPED_REFERENCE');seen.add(key);
   }
  }
 }
 return structuredClone(registry.binding);
}
