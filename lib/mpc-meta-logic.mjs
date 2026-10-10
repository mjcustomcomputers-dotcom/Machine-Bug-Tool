import {createHash} from 'node:crypto';

// This is a bounded meta-analysis grammar, never an evaluator registry.
export const MPC_META_LOGIC_VERSION='MPC_META_LOGIC_1';
export const META_TRUTH=Object.freeze({YES:'SUPPORTED',NO:'CONTRADICTED',UNKNOWN:'UNKNOWN'});
export const META_OPERATORS=Object.freeze(['NEGATE','DOUBLE_NEGATE','COMPOSE_AND','COMPOSE_OR','DE_MORGAN','INVERT_DEPENDENCY','CHALLENGE']);
const TRUTH=new Set(Object.values(META_TRUTH));
const ID=/^[A-Za-z][A-Za-z0-9._:-]{0,95}$/u;
const HEX=/^[0-9a-f]{64}$/u;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const deepFreeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);
  }return value;};
function readTruth(value){if(!TRUTH.has(value))fail('META_TRUTH_INVALID');return value;}
export function notTruth(value){
  const v=readTruth(value);
  return v===META_TRUTH.YES?META_TRUTH.NO:v===META_TRUTH.NO?META_TRUTH.YES:META_TRUTH.UNKNOWN;
}
export function andTruth(left,right){
  const a=readTruth(left),b=readTruth(right);
  return a===META_TRUTH.NO||b===META_TRUTH.NO?META_TRUTH.NO:
    a===META_TRUTH.YES&&b===META_TRUTH.YES?META_TRUTH.YES:META_TRUTH.UNKNOWN;
}
export function orTruth(left,right){
  const a=readTruth(left),b=readTruth(right);
  return a===META_TRUTH.YES||b===META_TRUTH.YES?META_TRUTH.YES:
    a===META_TRUTH.NO&&b===META_TRUTH.NO?META_TRUTH.NO:META_TRUTH.UNKNOWN;
}
function object(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function checkAtom(a){
  if(!object(a)||Object.keys(a).some(key=>!['id','truth','meaning','depends_on'].includes(key))||
     typeof a.id!=='string'||!ID.test(a.id)||typeof a.meaning!=='string'||
     !a.meaning.trim()||a.meaning.length>180)fail('META_ATOM_INVALID');
  readTruth(a.truth);
  if(!Array.isArray(a.depends_on)||a.depends_on.length>4||a.depends_on.some(x=>typeof x!=='string'||!ID.test(x)))fail('META_DEPENDENCY_INVALID');
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function candidate(index,op,input,truth,sourceDigest,depth,assertion,check){
  return Object.freeze({
    candidate_id:'MPC-META-'+String(index).padStart(2,'0')+'-'+digest([sourceDigest,op,input,truth]).slice(0,12),
    operator:op,depth,inputs:deepFreeze([...input]),logical_state:truth,meaning:assertion,
    falsifier:check,source_digest:sourceDigest,
    method_execution:'NOT_EXECUTED',source_authentication:false,independent_evidence_proven:false,
    registry_promotion:false
  });
}
/** The grammar transforms *declared tri-valued predicates*, not model prose.
 * Each generated node is a candidate with an explicit falsifier. */
export function generateMetaMethodGraph({source_digest,atoms,max_nodes=12,max_depth=3}={}){
  if(typeof source_digest!=='string'||!HEX.test(source_digest))fail('META_SOURCE_DIGEST_REQUIRED');
  if(!Array.isArray(atoms)||atoms.length<1||atoms.length>4||atoms.some((x,i)=>!Object.hasOwn(atoms,i)))fail('META_ATOM_BATCH_INVALID');
  if(!Number.isSafeInteger(max_nodes)||max_nodes<1||max_nodes>16||!Number.isSafeInteger(max_depth)||max_depth<1||max_depth>3)fail('META_BUDGET_INVALID');
  atoms.forEach(checkAtom);
  if(new Set(atoms.map(row=>row.id)).size!==atoms.length)fail('META_ATOM_DUPLICATE');
  const seeds=atoms.toSorted((a,b)=>a.id.localeCompare(b.id));
  const graph=[],keys=new Set();
  function offer(op,input,truth,depth,meaning,falsifier){
    if(depth>max_depth||graph.length>=max_nodes)return;
    const key=JSON.stringify([op,input,truth]);
    if(keys.has(key))return;
    keys.add(key);
    graph.push(candidate(graph.length+1,op,input,truth,source_digest,depth,meaning,falsifier));
  }
  for(const seed of seeds){
    offer('NEGATE',[seed.id],notTruth(seed.truth),1,
      'Logical negation of the stated, bounded predicate; not the negation of every possible real-world condition.',
      'Reacquire this exact source and independently test the predicate and its stated coverage.');
    offer('DOUBLE_NEGATE',[seed.id],notTruth(notTruth(seed.truth)),2,
      'Involution negative control: NOT(NOT(x)) must equal the original three-valued state.',
      'An implementation where double negation changes the declared truth state falsifies this transformation.');
  }
  if(seeds.length>=2){
    const a=seeds[0],b=seeds[1],pair=[a.id,b.id];
    offer('COMPOSE_AND',pair,andTruth(a.truth,b.truth),2,
      'Both predicates are supported only if both are supported under their declared scope.',
      'A declared false predicate or missing independent provenance invalidates a supported conjunction.');
    offer('COMPOSE_OR',pair,orTruth(a.truth,b.truth),2,
      'Either declared predicate may support this disjunction; unknown remains unknown when no support is observed.',
      'Check both predicates against the exact source and a no-information negative control.');
    const dm1=notTruth(andTruth(a.truth,b.truth)),dm2=orTruth(notTruth(a.truth),notTruth(b.truth));
    if(dm1!==dm2)fail('META_DE_MORGAN_INVARIANT_FAILED');
    offer('DE_MORGAN',pair,dm1,3,
      'De Morgan negative-control transform: NOT(A AND B) agrees with (NOT A OR NOT B).',
      'Compare both independently evaluated formulations for all three-valued inputs.');
    offer('INVERT_DEPENDENCY',pair,META_TRUTH.UNKNOWN,2,
      'Reverse dependency is a NEW review question; a causal converse is not logically entailed.',
      'Inspect ordering, source IDs and competing causes; the reverse edge must be observed independently.');
  }
  if(seeds.length>=1){
    offer('CHALLENGE',[seeds[0].id],META_TRUTH.UNKNOWN,3,
      'Adversarial falsifier and a no-information control are required before adopting the interpretation.',
      'A quoted counterexample, missing provenance or changed source invalidates the candidate.');
  }
  return Object.freeze({
    kind:'MPC_META_METHOD_CANDIDATE_GRAPH',version:MPC_META_LOGIC_VERSION,
    source_digest,atoms_considered:seeds.length,operators_available:META_OPERATORS,
    generated:graph.length,max_nodes,max_depth,nodes:Object.freeze(graph),
    candidate_only:true,no_native_methods_executed:true,canonical_method_ids_unchanged:true,
    external_actions:false
  });
}

/** A content-addressed, byte-bounded ephemeral cache of metadata-only plans.
 * Scope changes, invalidations and time anomalies revoke reuse. */
export function createMpcMetaCache({maxEntries=16,maxBytes=64*1024,ttlMs=10_000,now=Date.now}={}){
  if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>64||
     !Number.isSafeInteger(maxBytes)||maxBytes<512||maxBytes>2*1024*1024||
     !Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300_000||typeof now!=='function')fail('META_CACHE_CONFIG_INVALID');
  const store=new Map(),stats={hits:0,misses:0,evictions:0,invalidations:0};
  let bytes=0,scope=null,clockFloor=0;
  const current=()=>{const t=now();if(!Number.isFinite(t)||t<0)fail('META_CACHE_CLOCK_INVALID');
    if(t<clockFloor){store.clear();bytes=0;stats.invalidations++;}
    clockFloor=t;return t;};
  function validateKey(key){
    if(!object(key)||typeof key.project_id!=='string'||!ID.test(key.project_id)||
       typeof key.session_id!=='string'||!ID.test(key.session_id)||
       typeof key.source_digest!=='string'||!HEX.test(key.source_digest)||
       typeof key.method_version!=='string'||!ID.test(key.method_version))fail('META_CACHE_KEY_INVALID');
    return JSON.stringify([key.project_id,key.session_id,key.source_digest,key.method_version]);
  }
  function scoped(key){
    const tag=JSON.stringify([key.project_id,key.session_id]);
    if(scope!==null&&scope!==tag){store.clear();bytes=0;stats.invalidations++;}
    scope=tag;
  }
  function expire(t){for(const [key,row] of store)if(t-row.at>=ttlMs){store.delete(key);bytes-=row.bytes;stats.evictions++;}}
  return Object.freeze({
    get(key){
      const id=validateKey(key);scoped(key);const t=current();expire(t);
      const row=store.get(id);if(!row){stats.misses++;return null;}
      store.delete(id);store.set(id,row);stats.hits++;return row.value;
    },
    set(key,value){
      const id=validateKey(key);scoped(key);const t=current();expire(t);
      if(!object(value)||value.kind!=='MPC_META_METHOD_CANDIDATE_GRAPH'||value.source_digest!==key.source_digest)fail('META_CACHE_VALUE_INVALID');
      const frozen=JSON.parse(JSON.stringify(value)),cost=Buffer.byteLength(JSON.stringify(frozen),'utf8')+id.length*2+64;
      if(cost>maxBytes)return false;
      const previous=store.get(id);
      if(previous){bytes-=previous.bytes;store.delete(id);}
      while(store.size>=maxEntries||bytes+cost>maxBytes){
        const oldest=store.keys().next().value;if(oldest===undefined)break;
        bytes-=store.get(oldest).bytes;store.delete(oldest);stats.evictions++;
      }
      deepFreeze(frozen);store.set(id,{value:frozen,at:t,bytes:cost});bytes+=cost;return true;
    },
    clear(){store.clear();bytes=0;scope=null;clockFloor=0;stats.invalidations++;},
    status(){const t=current();expire(t);return Object.freeze({entries:store.size,bytes,limits:{maxEntries,maxBytes,ttlMs},
      stats:{...stats},raw_pixels_retained:false,raw_text_retained:false,persistent_storage:false});}
  });
}
