import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileConnectorRecords,planConnectorDispatch} from '../lib/chatgpt-connector-bridge.mjs';
const native={surface:'GOOGLE_DRIVE',native_source:'GOOGLE_DRIVE',native_id:'1wIXKLW9cfSb6i2SH_wcBgaEpfkRbbENQ',version:'2026-10-08',observed_at:'2026-10-08T00:00:00Z',source_owner:'Drive',epistemic_state:'OBSERVED',content_digest:null,pointer:'drive:1wIXKLW9cfSb6i2SH_wcBgaEpfkRbbENQ'};
const dash={...native,surface:'DROPBOX_DASH',native_id:'3d2c33f8-6989-5281-8560-c31daf9b1f2b',source_owner:'Dash',pointer:'dash:3d2c33f8-6989-5281-8560-c31daf9b1f2b',projection_of:{native_source:'GOOGLE_DRIVE',native_id:native.native_id}};
test('Dash projection and Drive original count as exactly one native source',()=>{
 const r=reconcileConnectorRecords({objective:'MPC source reconciliation',records:[native,dash],current_pointer:'GOOGLE_DRIVE:'+native.native_id});
 assert.equal(r.groups.length,1);
 assert.equal(r.evidence_source_count,1);
 assert.equal(r.groups[0].projection_count,1);
 assert.equal(r.groups[0].status,'NATIVE_SOURCE_PRESENT');
 assert.equal(r.canonical_promotion,false);
});
test('Dash-only indexed record does not become authenticated source',()=>{
 const r=reconcileConnectorRecords({objective:'Lookup',records:[dash],current_pointer:null});
 assert.equal(r.groups[0].status,'PROJECTION_ONLY_UNVERIFIED');
 assert.equal(r.evidence_source_count,0);
});
test('Conflicting native versions block promotion without destroying pointers',()=>{
 const r=reconcileConnectorRecords({objective:'Compare',records:[native,{...native,version:'2026-10-09',pointer:'drive:new-version'}],current_pointer:'GOOGLE_DRIVE:'+native.native_id});
 assert.equal(r.status,'BLOCKED_CONFLICTING_NATIVE_STATE');
 assert.equal(r.groups[0].native_pointers.length,2);
});
test('Missing controlling native pointer stays blocked',()=>{
 const r=reconcileConnectorRecords({objective:'Verify',records:[native],current_pointer:'GOOGLE_DRIVE:another'});
 assert.equal(r.status,'BLOCKED_POINTER_NOT_IN_SUPPLIED_RECORDS');
});
test('Connector transport IDs and typed native projection must remain distinct',()=>{
 const v={...dash,projection_of:{native_source:'GOOGLE_DRIVE',native_id:'not-same'}};
 const r=reconcileConnectorRecords({objective:'Separate',records:[native,v],current_pointer:null});
 assert.equal(r.groups.length,2);
});
test('Unavailable write or target test cannot be promoted into performed operation',()=>{
 const caps=[{surface:'GITHUB',available:true,operations:['READ','CODE_UPDATE']},{surface:'DROPBOX_DASH',available:true,operations:['DISCOVER','READ']}];
 const a=planConnectorDispatch({capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'repo:branch'});
 const b=planConnectorDispatch({capabilities:caps,operation:'WRITE_CHECKPOINT',surface:'DROPBOX_DASH',object_id:'record'});
 const c=planConnectorDispatch({capabilities:caps,operation:'TARGET_TEST',surface:'GITHUB',object_id:'target'});
 assert.equal(a.state,'HUMAN_AUTHORIZATION_AND_NATIVE_RECEIPT_REQUIRED');
 assert.equal(b.state,'UNAVAILABLE_IN_SESSION');
 assert.equal(c.state,'UNAVAILABLE_IN_SESSION');
 assert.equal(a.write_performed,false);
 assert.equal(b.host_action_called,false);
});
