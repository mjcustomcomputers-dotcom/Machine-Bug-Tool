// MPC V9 additive fast-pass selector. No I/O, target requests or canonical writes.
// One native source key per owner/object/version: Dash projections are never independent evidence.
const hex=/^[a-f0-9]{64}$/u;
const own=x=>x&&typeof x==='object'&&!Array.isArray(x);
const norm=x=>{if(!own(x)||typeof x.native_source!=='string'||typeof x.native_id!=='string'||typeof x.version!=='string'||!hex.test(x.digest))throw Error('INVALID_SOURCE_IDENTITY');return x.native_source+':'+x.native_id+'@'+x.version;};
export function selectMaterialDeltas({incoming,cache,maxItems=128}){
 if(!Array.isArray(incoming)||!Array.isArray(cache)||!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>4096||incoming.length>maxItems||cache.length>maxItems*4)throw Error('FAST_PASS_LIMIT');
 const known=new Map();
 for(const item of cache){const key=norm(item);if(known.has(key)&&known.get(key)!==item.digest)throw Error('CONFLICTING_CACHE_DIGEST');known.set(key,item.digest);}
 const unique=new Map();let duplicateProjections=0;
 for(const item of incoming){
  const x=item.projection_of??item;
  const key=norm(x);
  if(item.projection_of&&item.surface==='DROPBOX_DASH'){duplicateProjections++;continue;}
  if(unique.has(key)&&unique.get(key).digest!==x.digest)throw Error('CONFLICTING_NATIVE_DIGEST');
  unique.set(key,x);
 }
 const changed=[],unchanged=[];
 for(const [key,item] of unique){(known.get(key)===item.digest?unchanged:changed).push({key,digest:item.digest});}
 return {status:'SOURCE_BOUND_FAST_PASS',changed,unchanged,duplicate_projections_ignored:duplicateProjections,
  recommended_method_invocations:changed.length,actual_methods_executed:0,network_actions:0,persistence:false,canonical_promotion:false};
}
