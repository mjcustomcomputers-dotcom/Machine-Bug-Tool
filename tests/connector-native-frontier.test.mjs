import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileConnectorRecords} from '../lib/chatgpt-connector-bridge.mjs';
import {planNativeSourceFrontier} from '../lib/connector-native-frontier.mjs';
function rec(native_id,version='v1'){
 return {surface:'GOOGLE_DRIVE',native_source:'GOOGLE_DRIVE',native_id,version,
  source_owner:'Drive',epistemic_state:'OBSERVED',content_digest:null,pointer:'drive:'+native_id};
}
function dash(native_id){
 return {surface:'DROPBOX_DASH',native_source:'GOOGLE_DRIVE',native_id:'dash-index-'+native_id,
  version:'indexed-v0',source_owner:'Dash',epistemic_state:'OBSERVED',content_digest:null,
  pointer:'dash:'+native_id,projection_of:{native_source:'GOOGLE_DRIVE',native_id}};
}
const enabled=[{surface:'GOOGLE_DRIVE',available:true,operations:['READ']}];
test('Native controller is first, before unrelated projection-only candidates',()=>{
 const reconcile=reconcileConnectorRecords({objective:'Recover',records:[rec('other'),dash('controller')],current_pointer:'GOOGLE_DRIVE:controller'});
 const p=planNativeSourceFrontier({reconciliation:reconcile,capabilities:enabled,max_actions:1});
 assert.equal(p.selected_actions.length,1);
 assert.equal(p.selected_actions[0].native_key,'GOOGLE_DRIVE:controller');
 assert.equal(p.selected_actions[0].reason,'VERIFY_CONTROLLING_NATIVE_POINTER');
 assert.equal(p.selected_actions[0].host_call_performed,false);
 assert.equal(p.source_authentication,false);
});
test('No Google Drive connector means blocked native read, never Dash substitution',()=>{
 const reconcile=reconcileConnectorRecords({objective:'Recover',records:[dash('controller')],current_pointer:'GOOGLE_DRIVE:controller'});
 const p=planNativeSourceFrontier({reconciliation:reconcile,capabilities:[{surface:'DROPBOX',available:true,operations:['READ']}]});
 assert.equal(p.status,'BLOCKED_NATIVE_CONNECTOR_CAPABILITY');
 assert.equal(p.selected_actions.length,0);
 assert.equal(p.unavailable_actions[0].native_source,'GOOGLE_DRIVE');
 assert.equal(p.external_target_actions,false);
});
test('Already read source is not requested again in same session, but not authenticated',()=>{
 const reconcile=reconcileConnectorRecords({objective:'Recover',records:[rec('controller')],current_pointer:'GOOGLE_DRIVE:controller'});
 const p=planNativeSourceFrontier({reconciliation:reconcile,capabilities:enabled,already_read_keys:['GOOGLE_DRIVE:controller']});
 assert.equal(p.selected_actions.length,0);
 assert.equal(p.already_accounted_in_session.length,1);
 assert.equal(p.already_accounted_in_session[0].reason,'SAME_SESSION_READ_ALREADY_ACCOUNTED_NOT_FRESHNESS_PROOF');
 assert.equal(p.canonical_promotion,false);
});
test('Projection drift remains a read task even if a prior session read key is asserted',()=>{
 const reconcile=reconcileConnectorRecords({objective:'Recover',records:[rec('controller'),dash('controller')],current_pointer:'GOOGLE_DRIVE:controller'});
 const p=planNativeSourceFrontier({reconciliation:reconcile,capabilities:enabled,already_read_keys:['GOOGLE_DRIVE:controller']});
 assert.equal(p.selected_actions.length,1);
 assert.equal(p.selected_actions[0].native_key,'GOOGLE_DRIVE:controller');
});
test('Specialized MPC surface is not treated as an ordinary file source',()=>{
 const r=reconcileConnectorRecords({objective:'MPC',records:[{surface:'MPC_BUGTOOLS',native_source:'MPC_BUGTOOLS',native_id:'runtime',version:'0.10',source_owner:'MPC',epistemic_state:'OBSERVED',content_digest:null,pointer:'mpc:runtime'}],current_pointer:null});
 const p=planNativeSourceFrontier({reconciliation:r,capabilities:enabled});
 assert.equal(p.not_native_file_sources.length,1);
 assert.equal(p.selected_actions.length,0);
});
test('Malformed capability snapshot, budget or reconciliation rejected',()=>{
 const r=reconcileConnectorRecords({objective:'Test',records:[rec('controller')],current_pointer:null});
 assert.throws(()=>planNativeSourceFrontier({reconciliation:r,capabilities:enabled,max_actions:4}),/FRONTIER_BUDGET/);
 assert.throws(()=>planNativeSourceFrontier({reconciliation:r,capabilities:[...enabled,...enabled]}),/FRONTIER_DUPLICATE_CAPABILITY/);
 assert.throws(()=>planNativeSourceFrontier({reconciliation:{...r,version:'fake'},capabilities:enabled}),/FRONTIER_RECONCILIATION/);
});
