import assert from 'node:assert/strict';
import test from 'node:test';
import {composeWorkspaceChatSystem,runOllamaWorkspaceConversation} from '../lib/mpc-workspace-chat.mjs';

test('MPC local chat identifies this project without mistaking it for multi-party computation',()=>{
  const base=composeWorkspaceChatSystem();
  assert.match(base,/MPC Machine Legal \/ Machine-Bug-Tool/u);
  assert.match(base,/Do not reinterpret it as Multi-Party Computation/u);
  assert.match(base,/ACQUIRED → ANALYZED → DECIDED/u);
  assert.match(base,/does not automatically inherit ChatGPT conversations/u);
  assert.match(base,/Never claim to have read a cloud record/u);
  const extra=composeWorkspaceChatSystem('Use concise answers.');
  assert.equal(extra.startsWith(base),true);
  assert.match(extra,/Use concise answers/u);
  assert.equal(extra.includes('Do not reinterpret it as Multi-Party Computation'),true);
  assert.throws(()=>composeWorkspaceChatSystem({note:'not a string'}),/MPC_WORKSPACE_CHAT_INSTRUCTIONS_INVALID/u);
});

test('user project preferences do not replace identity in actual local Ollama chat request',async()=>{
  const seen=[];
  const fakeClient={async *streamChat(input) {
    seen.push(input);
    yield {type:'delta',text:'MPC is this project workspace, not the cryptography acronym.'};
    yield {type:'done',outcome:'COMPLETED',observed_model:'qwen3:4b-instruct',done_reason:'stop'};
  }};
  const result=await runOllamaWorkspaceConversation({question:'What is MPC?',instructions:'Keep the answer short.'},{
    model:'qwen3:4b-instruct',client:fakeClient,nowMs:()=>1000
  });
  assert.equal(result.status,'CONVERSATION_COMPLETE');
  assert.equal(seen.length,1);
  assert.equal(seen[0].messages.at(-1).content,'What is MPC?');
  assert.match(seen[0].system,/MPC Machine Legal \/ Machine-Bug-Tool/u);
  assert.match(seen[0].system,/Keep the answer short/u);
  assert.equal(seen[0].model,'qwen3:4b-instruct');
  assert.equal(result.guarantees.connector_calls,false);
  assert.equal(result.guarantees.native_source_writes,false);
});
