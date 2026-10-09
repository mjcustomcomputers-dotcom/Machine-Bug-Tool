import test from 'node:test';
import assert from 'node:assert/strict';
import {planVersionCache,planHotResume,planModeDispatch} from '../lib/chatgpt-hot-resume-v10.mjs';
const digest='a'.repeat(64),otherDigest='b'.repeat(64);
const native={surface:'GOOGLE_DRIVE',native_source:'GOOGLE_DRIVE',native_id:'source1',version:'rev-44',observed_at:'2026-10-09T05:10:00Z',source_owner:'Google Drive',epistemic_state:'OBSERVED',content_digest:digest,pointer:'drive:source1'};
const dash={...native,surface:'DROPBOX_DASH',native_id:'dash-uuid',source_owner:'Dash',content_digest:null,pointer:'dash:uuid',projection_of:{native_source:'GOOGLE_DRIVE',native_id:'source1'}};
const cache={native_key:'GOOGLE_DRIVE:source1',version:'rev-44',digest,observed_at:'2026-10-09T04:00:00Z'};
const expected={project:'KOMOJU',provider:'AIRTABLE',base_id:'appdD5WC0CVuRirtP',table_id:'tblC9KnJuUvwxbikS',record_id:'rech8Afm8n1P1qgMD',role:'TARGET_CONTROL'};
const live={...expected,checkpoint_id:'KOMOJU-CKPT-002-DELTA-044-20261009',cursor:'K-A009',next_action:'Collect one authorized native Customer baseline.',observed_at:'2026-10-09T05:12:00Z'};
const caps=[{surface:'GOOGLE_DRIVE',available:true,operations:['READ','WRITE_CHECKPOINT']},{surface:'GITHUB',available:true,operations:['READ','CODE_UPDATE']},{surface:'MPC_BUGTOOLS',available:true,operations:['ANALYZE']}];
const boot=(over={})=>planHotResume({project:'KOMOJU',expected_controller:expected,live_controller:live,source_records:[native,dash],cache_entries:[cache],capabilities:caps,...over});
test('exact live Airtable cursor outranks any stale snapshot and skips digest-identical body',()=>{const r=boot();assert.equal(r.state,'RESUME_PLANNED');assert.equal(r.checkpoint_id,live.checkpoint_id);assert.equal(r.source_cache.skipped_body_count,1);assert.equal(r.next_action,live.next_action);assert.equal(r.host_actions_performed,false);});
test('Dash projection does not increase evidence or alter native digest cache',()=>{const r=planVersionCache({source_records:[native,{...dash,version:'older'}],cache_entries:[cache]});assert.equal(r.steps.length,1);assert.equal(r.steps[0].state,'UNCHANGED_NATIVE_VERSION_AND_DIGEST');assert.equal(r.dash_projection_is_evidence,false);});
test('Dash only must fetch the native document, not treat projection as cache hit',()=>{const r=planVersionCache({source_records:[dash],cache_entries:[cache]});assert.equal(r.steps[0].state,'FETCH_NATIVE_NOT_DASH');assert.equal(r.skipped_body_count,0);});
test('same digest but different native revision cannot skip',()=>{const r=planVersionCache({source_records:[{...native,version:'rev-45'}],cache_entries:[cache]});assert.equal(r.steps[0].skip_body,false);});
test('same version but different digest cannot skip',()=>{const r=planVersionCache({source_records:[{...native,content_digest:otherDigest}],cache_entries:[cache]});assert.equal(r.steps[0].state,'CHANGED_OR_UNVERIFIED_NATIVE');});
test('missing native digest cannot skip and must not cache unverified projection',()=>{const r=planVersionCache({source_records:[{...native,content_digest:null}],cache_entries:[cache]});assert.equal(r.steps[0].state,'NEEDS_NATIVE_SHA256_OR_FRESH_BODY');assert.equal(r.cache_proposals_not_persisted.length,0);});
test('two conflicting native versions block the pass rather than promoting latest-looking string',()=>{const r=boot({source_records:[native,{...native,version:'rev-45',pointer:'drive:rev45'}]});assert.equal(r.state,'BLOCKED_SOURCE_CONFLICT');assert.equal(r.methods_executed,0);});
test('wrong native controller record ID stops cleanly without changing project',()=>{const r=boot({live_controller:{...live,record_id:'reczZZZZZZZZZZZZZ'}});assert.equal(r.state,'BLOCKED_CONTROLLER_MISMATCH');assert.equal(r.write_performed,false);});
test('missing live controller fails closed with exact first action',()=>{const r=boot({live_controller:null});assert.equal(r.state,'BLOCKED_NATIVE_CONTROLLER_NOT_READ');assert.match(r.next_action,/Fetch native Airtable controller/);});
test('wrong project identity rejected',()=>{assert.throws(()=>boot({project:'SOCIAL_DEAL'}),/HOT_RESUME_WRONG_PROJECT/);});
test('explicit missing source pointer blocks rather than assuming old cache',()=>{const r=boot({current_source_pointer:'GOOGLE_DRIVE:other'});assert.equal(r.state,'BLOCKED_SOURCE_POINTER');});
test('a second independent Dropbox file is not deduplicated with Drive',()=>{const r=planVersionCache({source_records:[native,{...native,surface:'DROPBOX',native_source:'DROPBOX',native_id:'dropbox-native',content_digest:otherDigest,version:'db-1'}],cache_entries:[]});assert.equal(r.steps.length,2);});
test('duplicate version cache entries are rejected rather than picking arbitrary winner',()=>{assert.throws(()=>planVersionCache({source_records:[native],cache_entries:[cache,cache]}),/HOT_RESUME_DUPLICATE_CACHE_KEY/);});
test('TEST denies checkpoints even with capable connector and declared approval',()=>{const r=planModeDispatch({mode:'TEST',capabilities:caps,operation:'WRITE_CHECKPOINT',surface:'GOOGLE_DRIVE',object_id:'id',user_approved:true,native_precondition:{kind:'NATIVE_CONDITIONAL_VERSION',supported_by_host:true,expected_version:'r1'}});assert.equal(r.state,'BLOCKED_TEST_READ_ONLY');assert.equal(r.write_performed,false);});
test('TEST denies code changes and live target requests',()=>{for(const op of ['CODE_UPDATE','TARGET_TEST']){const r=planModeDispatch({mode:'TEST',capabilities:caps,operation:op,surface:'GITHUB',object_id:'id',user_approved:true,scope_approved:true});assert.equal(r.state,'BLOCKED_TEST_READ_ONLY');}});
test('RECON denies code changes but permits a guarded checkpoint proposal',()=>{const a=planModeDispatch({mode:'RECON',capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'code',user_approved:true});const b=planModeDispatch({mode:'RECON',capabilities:caps,operation:'WRITE_CHECKPOINT',surface:'GOOGLE_DRIVE',object_id:'doc',user_approved:true,native_precondition:{kind:'NATIVE_CONDITIONAL_VERSION',supported_by_host:true,expected_version:'r1'}});assert.equal(a.state,'BLOCKED_RECON_MODE');assert.equal(b.state,'READY_FOR_SEPARATE_HOST_CALL_AND_READBACK');assert.equal(b.host_action_called,false);});
test('COMMIT requires declared authorization, actual connector capability and conditional version',()=>{const a=planModeDispatch({mode:'COMMIT',capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'repo'});const b=planModeDispatch({mode:'COMMIT',capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'repo',user_approved:true});const c=planModeDispatch({mode:'COMMIT',capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'repo',user_approved:true,native_precondition:{kind:'NATIVE_CONDITIONAL_VERSION',supported_by_host:true,expected_version:'blob-sha'}});assert.equal(a.state,'NEEDS_EXPLICIT_USER_APPROVAL');assert.equal(b.state,'NEEDS_NATIVE_CONDITIONAL_WRITE_GUARD');assert.equal(c.state,'READY_FOR_SEPARATE_HOST_CALL_AND_READBACK');assert.equal(c.write_performed,false);});
test('no invented connector dispatch or permission from mode selection',()=>{const r=planModeDispatch({mode:'COMMIT',capabilities:caps,operation:'WRITE_CHECKPOINT',surface:'DROPBOX_DASH',object_id:'doc',user_approved:true});assert.equal(r.state,'UNAVAILABLE_IN_SESSION');assert.equal(r.authorization_conferred,false);});
test('target-test mode requires actual scope and program approval separate from intent',()=>{const caps2=[{surface:'MPC_BUGTOOLS',available:true,operations:['TARGET_TEST']}];const r=planModeDispatch({mode:'COMMIT',capabilities:caps2,operation:'TARGET_TEST',surface:'MPC_BUGTOOLS',object_id:'target',user_approved:true});assert.equal(r.state,'NEEDS_PROGRAM_SCOPE_AUTHORIZATION');});

// Discovery-facing routing is additive: base states, evidence, and scope gates remain intact.
test('missing source becomes a positive next-evidence pathway without erasing the gate',async()=>{
 const {classifyDiscoveryPath}=await import('../lib/chatgpt-hot-resume-v10.mjs');
 const r=classifyDiscoveryPath('SOURCE_UNBOUND');
 assert.equal(r.pathway_class,'ACQUIRE_PRIMARY_SOURCE');
 assert.equal(r.raw_state,'SOURCE_UNBOUND');
 assert.equal(r.source_gate_preserved,true);
});
test('unmatched method dimension routes to alternate method, never false impossibility',async()=>{
 const {classifyDiscoveryPath}=await import('../lib/chatgpt-hot-resume-v10.mjs');
 assert.equal(classifyDiscoveryPath('DIMENSION_NOT_MATCHED').pathway_class,'ALTERNATE_METHOD');
 assert.equal(classifyDiscoveryPath('DIRECTION_UNSUPPORTED').pathway_class,'INVERT_OR_TRANSFER');
});
test('cached variation routes forward without repeating a concluded classification',async()=>{
 const {classifyDiscoveryPath}=await import('../lib/chatgpt-hot-resume-v10.mjs');
 assert.equal(classifyDiscoveryPath('CACHED_NO_MATERIAL_DELTA').pathway_class,'REUSE_CACHE_ADVANCE');
});
test('raw native conflict remains blocked while offering source reconciliation',()=>{
 const r=boot({source_records:[native,{...native,version:'rev-45',pointer:'drive:rev45'}]});
 assert.equal(r.state,'BLOCKED_SOURCE_CONFLICT');
 assert.equal(r.discovery_path.pathway_class,'RECONCILE_NATIVE_CONFLICT');
 assert.equal(r.source_cache.steps[0].discovery_path.source_gate_preserved,true);
});
test('test-mode consequential action remains blocked while suggesting read-only research',()=>{
 const r=planModeDispatch({mode:'TEST',capabilities:caps,operation:'CODE_UPDATE',surface:'GITHUB',object_id:'repo',user_approved:true});
 assert.equal(r.state,'BLOCKED_TEST_READ_ONLY');
 assert.equal(r.discovery_path.pathway_class,'EXPLORE_READ_ONLY');
 assert.equal(r.host_action_called,false);
});
test('unmapped state stays review-required, never silently invented as success',async()=>{
 const {classifyDiscoveryPath}=await import('../lib/chatgpt-hot-resume-v10.mjs');
 assert.equal(classifyDiscoveryPath('SOME_FUTURE_STATE').pathway_class,'REVIEW_UNMAPPED_STATE');
 assert.throws(()=>classifyDiscoveryPath(''),/DISCOVERY_PATH_STATE_REQUIRED/);
});
