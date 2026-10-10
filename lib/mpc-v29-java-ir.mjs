// MPC V29 — finite Java SE 27 class header and small JVM int-operand stack lab.
// No class loading, process execution, JIT, source compilation or dynamic imports.
import {createHash} from 'node:crypto';
const fail=x=>{throw Error(x)};
const rx=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,111}$/u,gh=/^[a-f0-9]{40}$/u;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const keys=(x,allowed,label)=>{if(!plain(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail('INVALID_'+label+'_FIELDS')};
const source=['source_commit','scope_id','subject_id','source_ref','source_owner','source_version'];
const context=x=>{
 if(!plain(x)||!gh.test(x.source_commit||'')||
  !source.slice(1).every(k=>typeof x[k]==='string'&&rx.test(x[k])))
  fail('INVALID_JAVA_SOURCE_CONTEXT');
 return Object.fromEntries(source.map(k=>[k,x[k]]));
};
const hexBytes=(x,max,label)=>{
 if(typeof x!=='string'||x.length%2!==0||x.length>max*2||
    !/^[a-fA-F0-9]*$/u.test(x))fail('INVALID_'+label+'_HEX');
 return Buffer.from(x,'hex');
};
const sha=x=>createHash('sha256').update(x).digest('hex');
export const javaIrV29Contract=Object.freeze({
 version:'MPC_V29_JAVA_IR_LAB_1',target_java_se:27,latest_major_supported:71,
 bytecode_subset:['iconst_m1..5','bipush','sipush','iadd','isub','imul','ineg','ireturn'],
 max_instructions:64,max_stack_depth:32,max_source_nodes:31,execution_kind:'LOCAL_TYPED_INT32',
 external_class_loader:false,process_invocation:false,native_instruction_execution:false,
 canonical_method_registration:false
});
export function inspectJavaClassHeaderV29(input){
 keys(input,[...source,'class_header_hex'],'JAVA_HEADER_REQUEST');
 const c=context(input),bytes=hexBytes(input.class_header_hex,64,'JAVA_HEADER');
 if(bytes.length<10)fail('JAVA_HEADER_TRUNCATED');
 const magic=bytes.readUInt32BE(0),minor=bytes.readUInt16BE(4),
 major=bytes.readUInt16BE(6),pool=bytes.readUInt16BE(8);
 const preview=minor===65535;
 const supported=major>=45&&major<=71;
 const validMinor=major<56||minor===0||(major===71&&preview);
 const state=magic!==0xcafebabe?'JAVA_CLASS_MAGIC_MISMATCH':
  !supported?'JAVA_CLASS_MAJOR_UNSUPPORTED':
  !validMinor?'JAVA_CLASS_MINOR_OR_PREVIEW_UNSUPPORTED':
  pool===0?'JAVA_CONSTANT_POOL_COUNT_INVALID':'JAVA_CLASS_HEADER_STRUCTURALLY_VALID';
 return {version:javaIrV29Contract.version,...c,major,minor,constant_pool_count:pool,
  preview_flag:preview,header_digest:sha(bytes),state,
  actual_classfile_verified:false,bytecode_verified:false,
  class_executed:false,canonical_promotion:false};
}
const OPC=Object.freeze({
 ICONST_M1:2,ICONST_0:3,BIPUSH:16,SIPUSH:17,IADD:96,ISUB:100,
 IMUL:104,INEG:116,IRETURN:172
});
const push=(stack,x)=>{stack.push(x|0);if(stack.length>32)fail('JVM_STACK_BUDGET')};
const pop=(stack)=>{if(!stack.length)fail('JVM_STACK_UNDERFLOW');return stack.pop()};
export function executeTinyJvmBytecodeV29(input){
 keys(input,[...source,'bytecode_hex'],'JVM_EXEC_REQUEST');
 const c=context(input),code=hexBytes(input.bytecode_hex,128,'JVM_BYTECODE');
 if(!code.length)fail('JVM_EMPTY_CODE');
 let pc=0,steps=0,peak=0;
 const stack=[];
 while(pc<code.length){
  if(++steps>64)fail('JVM_INSTRUCTION_FUEL_EXHAUSTED');
  const op=code[pc++];
  if(op===2)push(stack,-1);
  else if(op>=3&&op<=8)push(stack,op-3);
  else if(op===16){if(pc>=code.length)fail('JVM_TRUNCATED_IMMEDIATE');push(stack,code.readInt8(pc++))}
  else if(op===17){if(pc+2>code.length)fail('JVM_TRUNCATED_IMMEDIATE');
    push(stack,code.readInt16BE(pc));pc+=2;}
  else if(op===96||op===100||op===104){
    const b=pop(stack),a=pop(stack);
    push(stack,op===96?(a+b)|0:op===100?(a-b)|0:Math.imul(a,b));
  }else if(op===116){push(stack,(-pop(stack))|0)}
  else if(op===172){
    const result=pop(stack);
    if(stack.length||pc!==code.length)fail('JVM_INVALID_RETURN_OR_TRAILING_CODE');
    return {version:javaIrV29Contract.version,...c,
      result_int32:result,executed_instructions:steps,max_observed_stack:Math.max(peak,1),
      bytecode_hash:sha(code),state:'FINITE_JVM_SUBSET_EXECUTED',
      runtime:'V29_LOCAL_SUBSET',class_loaded:false,external_effects:0};
  }else fail('JVM_OPCODE_UNSUPPORTED');
  peak=Math.max(peak,stack.length);
 }
 fail('JVM_MISSING_IRETURN');
}
const astKeys=['op','value','left','right','expr'];
function inspectAst(ast){
 let total=0;const seen=new Set();
 const visit=(x,depth)=>{
  if(depth>6||++total>31)fail('JAVA_AST_BUDGET');
  if(!plain(x)||seen.has(x))fail('JAVA_AST_NON_TREE');
  seen.add(x);keys(x,astKeys,'JAVA_AST_NODE');
  if(x.op==='LIT'){
   if(Object.keys(x).some(k=>!['op','value'].includes(k))||
     !Number.isSafeInteger(x.value)||x.value<-32768||x.value>32767)
    fail('JAVA_AST_LITERAL');
   return x.value|0;
  }
  if(x.op==='NEG'){
   if(Object.keys(x).some(k=>!['op','expr'].includes(k)))fail('JAVA_AST_NEG');
   return (-visit(x.expr,depth+1))|0;
  }
  if(!['ADD','SUB','MUL'].includes(x.op)||Object.keys(x).some(k=>!['op','left','right'].includes(k)))
   fail('JAVA_AST_BINARY');
  const a=visit(x.left,depth+1),b=visit(x.right,depth+1);
  return x.op==='ADD'?(a+b)|0:x.op==='SUB'?(a-b)|0:Math.imul(a,b);
 };
 return {result:visit(ast,0),nodes:total};
}
function toBytecode(ast,out){
 if(ast.op==='LIT'){
  const n=ast.value;
  if(n>=-1&&n<=5)out.push(n+3);
  else if(n>=-128&&n<=127)out.push(16,n&255);
  else out.push(17,(n>>8)&255,n&255);
 }else if(ast.op==='NEG'){toBytecode(ast.expr,out);out.push(116);}
 else{
  toBytecode(ast.left,out);toBytecode(ast.right,out);
  out.push(ast.op==='ADD'?96:ast.op==='SUB'?100:104);
 }
}
export function compileTinyJavaExpressionV29(input){
 keys(input,[...source,'expression'],'JAVA_COMPILER_REQUEST');
 const c=context(input),a=inspectAst(input.expression),bytes=[];
 toBytecode(input.expression,bytes);bytes.push(172);
 if(bytes.length>128)fail('JVM_COMPILED_BYTE_BUDGET');
 const bytecode_hex=Buffer.from(bytes).toString('hex');
 const actual=executeTinyJvmBytecodeV29({...c,bytecode_hex});
 if(actual.result_int32!==a.result)fail('JAVA_COMPILER_DIFFERENTIAL_ORACLE_FAILED');
 return {version:javaIrV29Contract.version,...c,
  ast_nodes:a.nodes,bytecode_hex,bytecode_hash:actual.bytecode_hash,
  expected_int32:a.result,executed_int32:actual.result_int32,
  executed_instructions:actual.executed_instructions,
  state:'TINY_COMPILER_DIFFERENTIAL_REPLAY_PASS',
  compiler_oracle:'INDEPENDENT_AST_INT32_EVALUATION',
  actual_javac_invoked:false,native_bytecode_executed:false};
}
export function auditTinyCompilerReplayV29(input){
 keys(input,[...source,'expression','candidate_bytecode_hex'],'JAVA_DIFFERENTIAL_REQUEST');
 const c=context(input),expected=inspectAst(input.expression);
 let actual;
 try{actual=executeTinyJvmBytecodeV29({...c,bytecode_hex:input.candidate_bytecode_hex})}
 catch(e){return {version:'MPC_V29_COMPILER_REPLAY_1',...c,
  state:'BYTECODE_REJECTED',reason:e.message,expected_int32:expected.result,
  differential_checked:true,actual_int32:null};}
 return {version:'MPC_V29_COMPILER_REPLAY_1',...c,
   state:actual.result_int32===expected.result?'DIFFERENTIAL_REPLAY_MATCH':
     'DIFFERENTIAL_REPLAY_CONTRADICTION',
   expected_int32:expected.result,actual_int32:actual.result_int32,
   bytecode_hash:actual.bytecode_hash,differential_checked:true,
   source_authenticated:false};
}
