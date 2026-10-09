// Native MPC mirror review and explicitly unresolved dimension-count audit.
// Never mints new MAXVAR/BL coordinates, invents source authenticity or proof.
import framework from './atomic-framework.json' with {type:'json'};
import solidPack from './solid-state-pack.json' with {type:'json'};
const ID=/^[A-Za-z0-9_.:\/-]{1,200}$/u;
const fail=x=>{throw Error(x)};
const MIRRORS=framework.mirrors;
const bounded=(xs,max,name)=>{if(!Array.isArray(xs)||xs.length>max||new Set(xs).size!==xs.length||xs.some(x=>typeof x!=='string'||!ID.test(x)))fail('INVALID_'+name);return xs;};
export const nativeMirrorContract=Object.freeze({
 version:'MPC_NATIVE_MIRROR_V11',native_mirror_count:MIRRORS.length,
 declared_dimension_count_356:'UNVERIFIED_SOURCE_OWNER_REQUIRED',
 canonical_id_mutation:false,automatic_execution:false
});

export function reviewNativeMirrors(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(x=>!['atoms','pairs','prior_receipts'].includes(x)))fail('MIRROR_INPUT_FIELDS');
 const atoms=input.atoms,pairs=input.pairs??[],prior=input.prior_receipts??[];
 if(!Array.isArray(atoms)||atoms.length<1||atoms.length>8||!Array.isArray(pairs)||pairs.length>64||!Array.isArray(prior)||prior.length>120)fail('MIRROR_BUDGET');
 const seen=new Set();
 for(const a of atoms){
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(x=>!['atom_id','native_subject_id','source_refs','evidence_digest'].includes(x))||
  typeof a.atom_id!=='string'||!ID.test(a.atom_id)||typeof a.native_subject_id!=='string'||!ID.test(a.native_subject_id)||
  typeof a.evidence_digest!=='string'||!/^[a-f0-9]{64}$/.test(a.evidence_digest))fail('INVALID_MIRROR_ATOM');
  bounded(a.source_refs,8,'MIRROR_ATOM_SOURCES');
  if(seen.has(a.atom_id))fail('DUPLICATE_MIRROR_ATOM');seen.add(a.atom_id);
 }
 const pairMap=new Map();
 for(const p of pairs){
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['atom_id','mirror_no','left_source_refs','right_source_refs','claim_relation'].includes(k))||
     !seen.has(p.atom_id)||!Number.isInteger(p.mirror_no)||p.mirror_no<1||p.mirror_no>MIRRORS.length||
     !['AGREES','CONFLICTS','UNKNOWN'].includes(p.claim_relation))fail('INVALID_MIRROR_PAIR');
  bounded(p.left_source_refs,8,'LEFT_MIRROR_REFS');bounded(p.right_source_refs,8,'RIGHT_MIRROR_REFS');
  const key=p.atom_id+'|'+p.mirror_no;if(pairMap.has(key))fail('DUPLICATE_MIRROR_PAIR');pairMap.set(key,p);
 }
 const priorMap=new Map();
 for(const r of prior){
  if(!r||typeof r!=='object'||typeof r.key!=='string'||typeof r.decision!=='string')fail('BAD_PRIOR_MIRROR_RECEIPT');
  if(priorMap.has(r.key))fail('DUPLICATE_PRIOR_MIRROR');priorMap.set(r.key,r);
 }
 const receipts=[],counts={};
 for(const atom of atoms){
  for(let i=0;i<MIRRORS.length;i++){
   const p=pairMap.get(atom.atom_id+'|'+(i+1));
   const sources=[...(p?.left_source_refs??[]),...(p?.right_source_refs??[])].sort();
   const key=[atom.native_subject_id,atom.atom_id,atom.evidence_digest,i+1,p?.claim_relation??'ABSENT',sources.join(',')].join('|');
   let decision=!p?'PAIR_NOT_SUPPLIED':!p.left_source_refs.length||!p.right_source_refs.length?'BLOCKED_ONE_SIDE_UNBOUND':
     p.claim_relation==='UNKNOWN'?'OPEN_RELATION_UNKNOWN':'PROPOSED_CONSISTENCY_REVIEW';
   const cached=priorMap.get(key)?.decision===decision;
   counts[cached?'CACHED_NO_NEW_MIRROR_EVIDENCE':decision]=(counts[cached?'CACHED_NO_NEW_MIRROR_EVIDENCE':decision]??0)+1;
   receipts.push({key,atom_id:atom.atom_id,native_subject_id:atom.native_subject_id,mirror_no:i+1,
    native_mirror_name:MIRRORS[i].name,source_ref:MIRRORS[i].source_ref,
    native_questions:MIRRORS[i].questions_exact,decision:cached?'CACHED_NO_NEW_MIRROR_EVIDENCE':decision,
    base_decision:decision,claim_relation:p?.claim_relation??'NOT_SUPPLIED',
    source_refs:sources,
    independent_evidence_proven:false,source_authentication:false,mirror_evaluation_executed:false});
  }
 }
 return {status:'NATIVE_MIRROR_FULL_CONSIDERATION',mirror_count:MIRRORS.length,atom_count:atoms.length,
  considered:receipts.length,expected:atoms.length*MIRRORS.length,counts,receipts,
  source_authentication:false,no_inferred_truth_or_guilt:true,canonical_promotion:false,
  next_action:'Resolve native sources for any relevant unresolved mirror pair; equality or contrast of claims alone is not evidence authentication.'};
}

export function auditNativeDimensionClaims({reported_branch_count=32,reported_dimension_count=356,registry_owner=null}={}){
 if(!Number.isInteger(reported_branch_count)||reported_branch_count<1||reported_branch_count>1024||
 !Number.isInteger(reported_dimension_count)||reported_dimension_count<1||reported_dimension_count>100000||
 (registry_owner!==null&&(typeof registry_owner!=='string'||registry_owner.length>200)))fail('DIMENSION_AUDIT_INPUT');
 const counts={native_bl_branch_count:solidPack.branches.length,native_bl_child_classifier_count:solidPack.classifiers.length,
 native_object_coordinate_count:framework.object_coordinates.length,native_jacket_axes_count:framework.jacket_axes.length,
 native_mirror_count:MIRRORS.length};
 if(counts.native_bl_branch_count!==32||counts.native_bl_child_classifier_count!==384||counts.native_object_coordinate_count!==25||counts.native_mirror_count!==15)fail('NATIVE_REGISTRY_COUNTS_CHANGED_REVIEW_REQUIRED');
 return {status:'REPORTED_DIMENSION_COUNT_UNRESOLVED',counts,
  claim:{reported_branch_count,reported_dimension_count,registry_owner:registry_owner??'UNSPECIFIED',accepted_as_canonical:false},
  mismatch:{branch_matches_bl:reported_branch_count===counts.native_bl_branch_count,
  reported_dimensions_equal_bl_children:reported_dimension_count===counts.native_bl_child_classifier_count,
  reported_dimensions_equal_native_coordinates:reported_dimension_count===counts.native_object_coordinate_count},
  no_registry_mutation:true,source_authentication:false,canonical_promotion:false,
  next_action:'Recover the exact native owner and definition of the reported 356 dimensions before proposing any registry change.'};
}
