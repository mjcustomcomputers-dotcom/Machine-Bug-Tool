// MPC V25 finite invertible Bloom lookup table (IBLT) sketch.
// This is an executable synthetic set-difference algorithm with exact replay,
// not a network-side set reconciliation, probabilistic guarantee or source auth.
import {createHash} from 'node:crypto';
const fail=c=>{throw Error(c)};
const dense=a=>Array.isArray(a)&&Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).every(Boolean);
const ctx=x=>{
 if(!x||typeof x!=='object'||Array.isArray(x)||
  typeof x.source_commit!=='string'||!/^[a-f0-9]{40}$/u.test(x.source_commit)||
  typeof x.scope_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._/@-]{0,119}$/u.test(x.scope_id)||
  typeof x.subject_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:._/@-]{0,119}$/u.test(x.subject_id))
  fail('INVALID_IBLT_CONTEXT');
 return {source_commit:x.source_commit,scope_id:x.scope_id,subject_id:x.subject_id};
};
const score=(domain,key,salt=0)=>createHash('sha256')
 .update(JSON.stringify(['MPC_IBLT_V25',domain,key,salt])).digest().readUInt32BE(0);
const fingerprint=k=>score('CHECK',k);
const positions=(k,m)=>{
 const out=new Set();
 for(let i=0;i<16&&out.size<3;i++)out.add(score('BUCKET',k,i)%m);
 if(out.size!==3)fail('IBLT_DISTINCT_HASH_POSITIONS_EXHAUSTED');
 return [...out];
};
const list=(x,label)=>{
 if(!dense(x)||x.length>32||new Set(x).size!==x.length||
  x.some(y=>!Number.isSafeInteger(y)||y<=0||y>0x3fffffff))fail('INVALID_'+label);
 return [...x].sort((a,b)=>a-b);
};
export const ibltV25Contract=Object.freeze({
 version:'MPC_V25_FINITE_IBLT_REPLAY_1',three_hash_functions:true,
 max_keys_per_set:32,min_cells:6,max_cells:128,
 probabilistic_decode:true,replay_on_local_supplied_sets:true,
 live_remote_set_reconciliation:false,source_authentication:false,
 native_evaluator_added:false,canonical_promotion:false
});
export function reconcileFiniteIblt(input){
 const c=ctx(input);
 if(Object.keys(input).some(k=>!['source_commit','scope_id','subject_id','left',
  'right','cell_count'].includes(k)))fail('INVALID_IBLT_INPUT_FIELDS');
 const left=list(input.left,'LEFT_SET'),right=list(input.right,'RIGHT_SET');
 const cellsN=input.cell_count;
 if(!Number.isInteger(cellsN)||cellsN<6||cellsN>128)fail('INVALID_IBLT_CELL_BUDGET');
 const cells=Array.from({length:cellsN},()=>({count:0,key_xor:0,check_xor:0}));
 const insert=(k,sign)=>{
  const check=fingerprint(k);
  for(const pos of positions(k,cellsN)){
   const cell=cells[pos];
   cell.count+=sign;
   cell.key_xor=(cell.key_xor^k)>>>0;
   cell.check_xor=(cell.check_xor^check)>>>0;
  }
 };
 for(const k of left)insert(k,1);
 for(const k of right)insert(k,-1);
 const positive=[],negative=[];
 let stop='EXHAUSTED_SKETCH_PEEL';
 for(let step=0;step<left.length+right.length+1;step++){
  const ix=cells.findIndex((s,i)=>{
   if(Math.abs(s.count)!==1||s.key_xor===0||s.key_xor>0x3fffffff||
    s.check_xor!==fingerprint(s.key_xor))return false;
   return positions(s.key_xor,cellsN).includes(i);
  });
  if(ix<0){stop='NO_PURE_CELL';break;}
  const s=cells[ix],sign=s.count,k=s.key_xor;
  if((sign>0?positive:negative).includes(k)){stop='DUPLICATE_DECODE_CANDIDATE';break;}
  (sign>0?positive:negative).push(k);
  const check=fingerprint(k);
  for(const pos of positions(k,cellsN)){
   cells[pos].count-=sign;
   cells[pos].key_xor=(cells[pos].key_xor^k)>>>0;
   cells[pos].check_xor=(cells[pos].check_xor^check)>>>0;
  }
 }
 const residual=cells.filter(x=>x.count!==0||x.key_xor!==0||x.check_xor!==0).length;
 const exactLeft=left.filter(x=>!right.includes(x));
 const exactRight=right.filter(x=>!left.includes(x));
 const decodedLeft=positive.sort((a,b)=>a-b),decodedRight=negative.sort((a,b)=>a-b);
 const candidateComplete=residual===0&&stop!=='DUPLICATE_DECODE_CANDIDATE';
 const replayMatches=candidateComplete&&JSON.stringify(exactLeft)===JSON.stringify(decodedLeft)&&
  JSON.stringify(exactRight)===JSON.stringify(decodedRight);
 return {version:ibltV25Contract.version,...c,cell_count:cellsN,
  left_count:left.length,right_count:right.length,
  status:!candidateComplete?'SKETCH_NON_DECODABLE':
   replayMatches?'FINITE_DECODE_EXACT_REPLAY_CONSISTENT':'SKETCH_EXACT_REPLAY_CONTRADICTED',
  reconstructed_left_only:candidateComplete?decodedLeft:[],
  reconstructed_right_only:candidateComplete?decodedRight:[],
  exact_local_left_only:exactLeft,exact_local_right_only:exactRight,
  residual_cell_count:residual,decoded_all_cells:candidateComplete,
  exact_replay_matches:replayMatches,decode_stop_reason:stop,
  independent_network_witness:false,remote_sets_acquired:false,
  source_authentication:false,canonical_promotion:false};
}
