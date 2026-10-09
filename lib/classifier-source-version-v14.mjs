// V10-compatible native revision + digest comparator for V14 planning.
// Data must come from a separate native host read; this pure function cannot authenticate the caller.
const HEX=/^[a-f0-9]{64}$/u;
const ID=/^(GOOGLE_DRIVE|DROPBOX|GITHUB):[A-Za-z0-9_.:/-]{1,300}$/u;
const fail=x=>{throw Error(x)};
function validate(x){
 if(!x||typeof x!=='object'||Array.isArray(x)||!ID.test(x.native_key)||
   typeof x.revision!=='string'||!x.revision.trim()||x.revision.length>250||
   !HEX.test(x.digest))fail('MORPH_NATIVE_REVISION_RECORD');
}
export function compareNativeSourceVersions({cached,current}={}){
 if(!cached||!current)return {state:'NATIVE_READBACK_REQUIRED',cache_reusable:false,source_authenticated:false};
 validate(cached);validate(current);
 if(cached.native_key!==current.native_key)return {state:'NATIVE_IDENTITY_CONFLICT',cache_reusable:false,source_authenticated:false};
 if(cached.revision!==current.revision)return {state:'NATIVE_VERSION_CHANGED',cache_reusable:false,source_authenticated:false};
 if(cached.digest!==current.digest)return {state:'NATIVE_DIGEST_CHANGED',cache_reusable:false,source_authenticated:false};
 return {state:'DECLARED_VERSION_AND_DIGEST_MATCH',cache_reusable:true,source_authenticated:false,
   caution:'Caller must independently establish that current metadata came from the native owner.'};
}
