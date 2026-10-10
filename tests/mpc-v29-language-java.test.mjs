import test from 'node:test';
import assert from 'node:assert/strict';
import frontier from '../research/linguistic-code-can-method-mountains-v29.json' with {type:'json'};
import {localeProfileV29,emitControlledTranslationV29,inspectUnicodeNormalFormsV29}
 from '../lib/mpc-v29-language-translation.mjs';
import {replayControlledTranslationV29} from '../lib/mpc-v29-language-audit.mjs';
import {inspectJavaClassHeaderV29,executeTinyJvmBytecodeV29,compileTinyJavaExpressionV29,
 auditTinyCompilerReplayV29} from '../lib/mpc-v29-java-ir.mjs';

const source_commit='7e0ead087b8fd786fc5e8dcb69d53457f369060f';
const source={source_commit,scope_id:'fixture:v29',subject_id:'fixture:asset',
 source_ref:'fixture:s1',source_owner:'fixture:owner',source_version:'v1'};
const message=(code='VERIFICATION_PASSED',locale='en-US',register='ENGINEERING')=>
 ({...source,message_code:code,locale_tag:locale,register});
const lit=value=>({op:'LIT',value});
const bin=(op,left,right)=>({op,left,right});
test('46 hook identities and source-linked domains preserved',()=>{
 assert.equal(frontier.hooks.length,46);
 assert.equal(frontier.original_native_evaluators,24);
 assert.equal(frontier.original_atlas_candidates,239);
 assert.equal(frontier.original_v28_hooks,34);
 assert.equal(frontier.canonical_registry_change,false);
 assert.equal(new Set(frontier.hooks.map(h=>h.id)).size,46);
 const counts=frontier.hooks.reduce((o,h)=>({...o,[h.domain]:(o[h.domain]||0)+1}),{});
 assert.deepEqual(counts,{LANGUAGE:12,JAVA:10,CAN:14,META:10});
 assert.ok(frontier.hooks.every(h=>h.source_urls.length>0));
});
test('BCP47 canonicalization and explicit locale region',()=>{
 assert.deepEqual(localeProfileV29('EN-us'),{canonical_tag:'en-US',
  language:'en',region:'US',script:null,locale_tag_canonicalized:true});
 assert.equal(localeProfileV29('es-MX').language,'es');
 assert.throws(()=>localeProfileV29('zh-Hans-CN'),/UNSUPPORTED_TRANSLATION_LANGUAGE/);
 assert.throws(()=>localeProfileV29('en invalid'),/INVALID_LOCALE_TAG/);
});
test('4 languages x 2 registers x 8 messages roundtrip exactly',()=>{
 const codes=['MESSAGE_RECEIVED','FRAME_REJECTED','SOURCE_REQUIRED','VERIFICATION_PENDING',
  'VERIFICATION_PASSED','COUNTER_GAP','METHOD_READY','RECORD_CONTRADICTED'];
 for(const l of ['en-US','es-MX','fr-FR','de-DE'])for(const register of ['SHORT','ENGINEERING'])
  for(const c of codes){
   const x=message(c,l,register),y=emitControlledTranslationV29(x);
   const r=replayControlledTranslationV29(x,y);
   assert.equal(r.state,'CONTROLLED_TRANSLATION_REPLAY_PASS',c+'/'+l+'/'+register);
   assert.equal(r.actual_decoded_message,c);
  }
});
test('Spanish and French passed-verification wording avoids approved transaction',()=>{
 const es=emitControlledTranslationV29(message('VERIFICATION_PASSED','es-ES'));
 assert.match(es.output_text,/verificación superada/i);
 assert.ok(!/aprobada/i.test(es.output_text));
 const fr=emitControlledTranslationV29(message('VERIFICATION_PASSED','fr-FR'));
 assert.match(fr.output_text,/Test de vérification réussi/);
});
test('mutated status fails independent lexical decoder',()=>{
 const x=message('VERIFICATION_PASSED','es-ES');
 const y=emitControlledTranslationV29(x);
 y.output_text='Verificación pendiente';
 const r=replayControlledTranslationV29(x,y);
 assert.equal(r.state,'TRANSLATION_REPLAY_REJECTED');
 assert.ok(r.problems.includes('MESSAGE_CODE_OR_LEXICON_DRIFT'));
});
test('translation source revision and language variant change invalidates replay',()=>{
 const x=message(),y=emitControlledTranslationV29(x);
 assert.equal(replayControlledTranslationV29({...x,source_version:'v2'},y).state,
  'TRANSLATION_REPLAY_REJECTED');
 assert.equal(replayControlledTranslationV29({...x,locale_tag:'de-DE'},y).state,
  'TRANSLATION_REPLAY_REJECTED');
});
test('Unicode NFC and NFKC are different transformations and leave no input text in receipt',()=>{
 const a=inspectUnicodeNormalFormsV29({...source,text:'e\u0301'});
 assert.equal(a.nfc_changed,true);
 assert.equal(a.compatibility_difference,false);
 assert.equal(a.nfc_idempotent,true);
 const b=inspectUnicodeNormalFormsV29({...source,text:'①'});
 assert.equal(b.compatibility_difference,true);
 assert.equal(b.input_text_retained,false);
 assert.ok(!JSON.stringify(b).includes('①'));
});
test('Unicode malformed source and extra fields reject',()=>{
 assert.throws(()=>inspectUnicodeNormalFormsV29({...source,text:123}),/INVALID_UNICODE_TEXT/);
 assert.throws(()=>inspectUnicodeNormalFormsV29({...source,text:'x',secret:'y'}),/INVALID_UNICODE_INPUT_FIELDS/);
});
test('Java SE27 classfile major71 CAFEBABE accepted at header scope',()=>{
 const r=inspectJavaClassHeaderV29({...source,class_header_hex:'cafebabe000000470001'});
 assert.equal(r.state,'JAVA_CLASS_HEADER_STRUCTURALLY_VALID');
 assert.equal(r.major,71);assert.equal(r.minor,0);
 assert.equal(r.constant_pool_count,1);
 assert.equal(r.actual_classfile_verified,false);
});
test('Java preview flags, future major, bad magic, bad pool and truncated input',()=>{
 const f=h=>inspectJavaClassHeaderV29({...source,class_header_hex:h});
 assert.equal(f('cafebabeffff00470001').state,'JAVA_CLASS_HEADER_STRUCTURALLY_VALID');
 assert.equal(f('cafebabeffff00460001').state,'JAVA_CLASS_MINOR_OR_PREVIEW_UNSUPPORTED');
 assert.equal(f('cafebabe000000480001').state,'JAVA_CLASS_MAJOR_UNSUPPORTED');
 assert.equal(f('deadbeef000000470001').state,'JAVA_CLASS_MAGIC_MISMATCH');
 assert.equal(f('cafebabe000000470000').state,'JAVA_CONSTANT_POOL_COUNT_INVALID');
 assert.throws(()=>f('cafebabe'),/JAVA_HEADER_TRUNCATED/);
});
test('JVM subset iconst_1 iconst_2 iadd ireturn produces 3',()=>{
 const r=executeTinyJvmBytecodeV29({...source,bytecode_hex:'040560ac'});
 assert.equal(r.result_int32,3);
 assert.equal(r.executed_instructions,4);
 assert.equal(r.state,'FINITE_JVM_SUBSET_EXECUTED');
});
test('JVM signed negative bipush, overflow and invalid opcodes',()=>{
 const b=x=>executeTinyJvmBytecodeV29({...source,bytecode_hex:x});
 assert.equal(b('10fe100460ac').result_int32,2);
 for(const x of ['60ac','1003','03ac03','ffac'])
  assert.throws(()=>b(x),/JVM_/);
});
test('tiny Java expression compiler cross-verifies independent AST interpreter',()=>{
 const e=bin('ADD',bin('MUL',lit(400),lit(200)),bin('SUB',lit(5),lit(7)));
 const c=compileTinyJavaExpressionV29({...source,expression:e});
 assert.equal(c.expected_int32,79998);
 assert.equal(c.executed_int32,79998);
 const r=auditTinyCompilerReplayV29({...source,expression:e,candidate_bytecode_hex:c.bytecode_hex});
 assert.equal(r.state,'DIFFERENTIAL_REPLAY_MATCH');
});
test('32-bit int overflow and mutation are detected by an independent replay',()=>{
 const e=bin('MUL',bin('MUL',lit(32767),lit(32767)),lit(4));
 const c=compileTinyJavaExpressionV29({...source,expression:e});
 assert.equal(c.expected_int32,Math.imul(Math.imul(32767,32767),4));
 const add=bin('ADD',lit(3),lit(2));
 const compiled=compileTinyJavaExpressionV29({...source,expression:add});
 const changed=compiled.bytecode_hex.replace('60ac','64ac');
 assert.equal(auditTinyCompilerReplayV29({...source,expression:add,
  candidate_bytecode_hex:changed}).state,'DIFFERENTIAL_REPLAY_CONTRADICTION');
});
test('expression boundaries reject unsafe AST injections and unsupported bytes',()=>{
 const compile=expression=>compileTinyJavaExpressionV29({...source,expression});
 assert.throws(()=>compile(lit(100000)),/JAVA_AST_LITERAL/);
 assert.throws(()=>compile({op:'LIT',value:1,secret:'x'}),/INVALID_JAVA_AST_NODE_FIELDS/);
 assert.throws(()=>executeTinyJvmBytecodeV29({...source,bytecode_hex:'03'.repeat(65)+'ac'}),
  /JVM_STACK_BUDGET|JVM_INSTRUCTION_FUEL/);
});
