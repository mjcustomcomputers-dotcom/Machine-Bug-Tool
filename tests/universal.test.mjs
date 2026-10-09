import test from 'node:test';import assert from 'node:assert/strict';
import{digest,validateUniversal,canonical}from'../lib/universal.mjs';import{callTool}from'../lib/tools.mjs';
export async function sample(domain='research'){
 const source={namespace:'synthetic:demo',source_id:'s1',version:'v1',owner:'publisher:A',subject_ids:['subject:A'],native_locator:'synthetic://source/1',representation:'CALLER_SUPPLIED_EXTRACTED_TEXT',text:'😀 Offer received. Offer received.',text_sha256:await digest('😀 Offer received. Offer received.')};
 return {contract_version:'1.0.0',namespace:'synthetic:demo',domain_profile:domain,packet_id:'p1',sources:[source],spans:[{span_id:'r1',source_id:'s1',source_version:'v1',source_fingerprint:await digest(source),subject_id:'subject:A',start:2,end:17,exact_text:'Offer received.'}],claims:[{claim_id:'c1',subject_id:'subject:A',actor:'publisher:A',capacity:'sender',statement:'The supplied source contains an offer notice.',state:'OBSERVED',span_ids:['r1'],parent_claim_ids:[],method:'exact span reference',limitations:['Synthetic data; no actual award or authentication.']}]};
}
const run=p=>validateUniversal({packet:p,expected_packet_fingerprint:null});
for(const domain of ['legal','research','device','program'])test('Shared contract works for '+domain,async()=>assert.equal((await run(await sample(domain))).status,'STRUCTURAL_REFERENCE_CHECK_PASS'));
for(const [name,mutation,code]of[
 ['locator substitution',p=>p.sources[0].native_locator='synthetic://different','SOURCE_ENVELOPE_CHANGED'],
 ['owner substitution',p=>p.sources[0].owner='publisher:B','SOURCE_ENVELOPE_CHANGED'],
 ['version substitution',p=>p.sources[0].version='v2','UNRESOLVED_SOURCE_VERSION'],
 ['text substitution',p=>p.sources[0].text+=' altered','TEXT_HASH_MISMATCH'],
 ['wrong offset',p=>p.spans[0].start=3,'EXACT_SPAN_MISMATCH'],
 ['wrong claim subject',p=>p.claims[0].subject_id='subject:B','CLAIM_SUBJECT_MISMATCH'],
 ['namespace substitution',p=>p.sources[0].namespace='other','CROSS_NAMESPACE_SOURCE'],
 ['unsupported adoption',p=>p.claims[0].state='ADOPTED','ADOPTION_GATE_NOT_IMPLEMENTED'],
 ['missing span',p=>p.claims[0].span_ids=['missing'],'UNRESOLVED_SPAN'],
 ['duplicate source',p=>p.sources.push(structuredClone(p.sources[0])),'DUPLICATE_SOURCE_VERSION'],
 ['cycle',p=>p.claims[0].parent_claim_ids=['c1'],'CLAIM_DEPENDENCY_CYCLE'],
 ['missing parent',p=>p.claims[0].parent_claim_ids=['missing'],'UNRESOLVED_PARENT_CLAIM']])test(name,async()=>{const p=await sample();mutation(p);assert.ok((await run(p)).findings.some(f=>f.code===code))});
test('Packet pin binds even a changed limitation',async()=>{const p=await sample(),pin=await digest(p);p.claims[0].limitations=['other'];assert.ok((await validateUniversal({packet:p,expected_packet_fingerprint:pin})).findings.some(x=>x.code==='PACKET_CHANGED'))});
test('Object property order does not change fingerprint',async()=>assert.equal(await digest({b:1,a:2}),await digest({a:2,b:1})));
test('Array order remains significant',async()=>assert.notEqual(await digest(['a','b']),await digest(['b','a'])));
test('Strict schema rejects unknown claims and version',async()=>{const p=await sample();p.contract_version='2';await assert.rejects(()=>run(p));p.contract_version='1.0.0';p.approved=true;await assert.rejects(()=>run(p))});
test('MCP dispatch invokes portable implementation',async()=>{const p=await sample();assert.deepEqual(await callTool('validate_evidence_packet',{packet:p,expected_packet_fingerprint:null}),await run(p));assert.equal((await callTool('get_universal_contract',{})).contract_version,'1.0.0')});
