import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewNativeMirrors,auditNativeDimensionClaims,nativeMirrorContract} from '../lib/native-mirror-dimension-audit.mjs';
const a=(id='atom1')=>({atom_id:id,native_subject_id:'fixture:object',source_refs:['fixture:record'],evidence_digest:'a'.repeat(64)});
test('15 frozen native mirrors considered for each atom without inventing results',()=>{
 const result=reviewNativeMirrors({atoms:[a(),a('atom2')]});
 assert.equal(result.mirror_count,15);
 assert.equal(result.considered,30);
 assert.equal(result.expected,30);
 assert.equal(result.counts.PAIR_NOT_SUPPLIED,30);
 assert.ok(result.receipts.every(r=>r.native_questions.length>0&&r.source_ref&&r.mirror_evaluation_executed===false));
 assert.equal(result.source_authentication,false);
 assert.equal(nativeMirrorContract.canonical_id_mutation,false);
});
test('Mirror with two source sides remains a proposed comparison, not verified truth',()=>{
 const pair={atom_id:'atom1',mirror_no:10,left_source_refs:['fixture:left'],right_source_refs:['fixture:right'],claim_relation:'CONFLICTS'};
 const one=reviewNativeMirrors({atoms:[a()],pairs:[pair]});
 assert.equal(one.counts.PROPOSED_CONSISTENCY_REVIEW,1);
 assert.equal(one.counts.PAIR_NOT_SUPPLIED,14);
 const two=reviewNativeMirrors({atoms:[a()],pairs:[pair],prior_receipts:one.receipts});
 assert.equal(two.counts.CACHED_NO_NEW_MIRROR_EVIDENCE,15);
 assert.equal(two.receipts[9].claim_relation,'CONFLICTS');
 assert.equal(two.receipts[9].independent_evidence_proven,false);
});
test('One-sided mirror evidence blocks comparison; invalid mirror number and IDs reject',()=>{
 const partly={atom_id:'atom1',mirror_no:3,left_source_refs:['fixture:source'],right_source_refs:[],claim_relation:'UNKNOWN'};
 const r=reviewNativeMirrors({atoms:[a()],pairs:[partly]});
 assert.equal(r.counts.BLOCKED_ONE_SIDE_UNBOUND,1);
 assert.throws(()=>reviewNativeMirrors({atoms:[a()],pairs:[{...partly,mirror_no:356}]}),/INVALID_MIRROR_PAIR/);
 assert.throws(()=>reviewNativeMirrors({atoms:[a(),a()]}),/DUPLICATE_MIRROR_ATOM/);
});
test('Native 32/384 and 25 coordinate references remain intact; 32/356 not promoted',()=>{
 const r=auditNativeDimensionClaims({reported_branch_count:32,reported_dimension_count:356});
 assert.equal(r.status,'REPORTED_DIMENSION_COUNT_UNRESOLVED');
 assert.equal(r.counts.native_bl_branch_count,32);
 assert.equal(r.counts.native_bl_child_classifier_count,384);
 assert.equal(r.counts.native_object_coordinate_count,25);
 assert.equal(r.counts.native_jacket_axes_count,14);
 assert.equal(r.counts.native_mirror_count,15);
 assert.equal(r.claim.accepted_as_canonical,false);
 assert.equal(r.mismatch.reported_dimensions_equal_bl_children,false);
 assert.equal(r.no_registry_mutation,true);
});
