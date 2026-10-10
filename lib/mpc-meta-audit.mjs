import {createHash} from 'node:crypto';
// Independent fixed-table symbolic audit of a candidate plan.
// "PASS" proves only internal tri-valued calculation on the declared inputs.
export const MPC_META_AUDIT_VERSION='MPC_META_AUDIT_1';
const STATES=['SUPPORTED','CONTRADICTED','UNKNOWN'];
const NOT=['CONTRADICTED','SUPPORTED','UNKNOWN'];
const AND=[
 ['SUPPORTED','CONTRADICTED','UNKNOWN'],
 ['CONTRADICTED','CONTRADICTED','CONTRADICTED'],
 ['UNKNOWN','CONTRADICTED','UNKNOWN']
];
const OR=[
 ['SUPPORTED','SUPPORTED','SUPPORTED'],
 ['SUPPORTED','CONTRADICTED','UNKNOWN'],
 ['SUPPORTED','UNKNOWN','UNKNOWN']
];
const fail=code=>{throw Object.assign(Error(code),{code});};
const index=x=>STATES.indexOf(x);
const key=d=>JSON.stringify(d);
const hex=/^[0-9a-f]{64}$/u;
function operatorExpected(op,ids,atoms){
  const a=atoms.get(ids[0]),b=atoms.get(ids[1]);
  if(!a)return null;
  if(op==='NEGATE')return NOT[index(a)];
  if(op==='DOUBLE_NEGATE')return NOT[index(NOT[index(a)])];
  if(op==='CHALLENGE'||op==='INVERT_DEPENDENCY')return STATES[2];
  if(!b)return null;
  if(op==='COMPOSE_AND')return AND[index(a)][index(b)];
  if(op==='COMPOSE_OR')return OR[index(a)][index(b)];
  if(op==='DE_MORGAN')return NOT[index(AND[index(a)][index(b)])];
  return null;
}
export function auditMetaMethodGraph(graph,seedAtoms){
  if(!graph||graph.kind!=='MPC_META_METHOD_CANDIDATE_GRAPH'||
    typeof graph.source_digest!=='string'||!hex.test(graph.source_digest)||
    !Array.isArray(graph.nodes)||graph.nodes.length>16||
    !Array.isArray(seedAtoms)||seedAtoms.length<1||seedAtoms.length>4)fail('META_AUDIT_INPUT_INVALID');
  const atoms=new Map();
  for(const row of seedAtoms){
    if(!row||typeof row.id!=='string'||atoms.has(row.id)||index(row.truth)<0)fail('META_AUDIT_ATOM_INVALID');
    atoms.set(row.id,row.truth);
  }
  const perOperator={},verified=[];
  for(let idx=0;idx<graph.nodes.length;idx++){
    const node=graph.nodes[idx];
    if(!node||!Array.isArray(node.inputs)||node.inputs.length<1||node.inputs.length>2||
      node.inputs.some(id=>!atoms.has(id))||node.depth>3||node.depth<1||
      node.source_digest!==graph.source_digest||node.source_authentication!==false||
      node.method_execution!=='NOT_EXECUTED'||node.registry_promotion!==false)fail('META_AUDIT_UNSAFE_NODE');
    const expected=operatorExpected(node.operator,node.inputs,atoms);
    if(expected===null||node.logical_state!==expected)fail('META_AUDIT_TRUTH_TABLE_MISMATCH');
    const expectedId='MPC-META-'+String(idx+1).padStart(2,'0')+'-'+createHash('sha256')
      .update(key([graph.source_digest,node.operator,node.inputs,expected])).digest('hex').slice(0,12);
    if(node.candidate_id!==expectedId)fail('META_AUDIT_IDENTITY_MISMATCH');
    perOperator[node.operator]=(perOperator[node.operator]??0)+1;
    verified.push(expectedId);
  }
  if(graph.generated!==graph.nodes.length||graph.generated!==verified.length)fail('META_AUDIT_COUNT_MISMATCH');
  return Object.freeze({kind:'MPC_META_ALGEBRA_AUDIT',version:MPC_META_AUDIT_VERSION,
    status:'ALGEBRAIC_CONSISTENCY_CONFIRMED',candidates_checked:verified.length,
    operator_counts:Object.freeze(perOperator),
    source_digest:graph.source_digest,
    proof_scope:'FINITE_DECLARED_TRI_VALUED_PREDICATES_ONLY',
    source_authentication:false,native_methods_executed:false,real_world_verification:false,
    registry_promotion:false,external_action_authorized:false});
}
