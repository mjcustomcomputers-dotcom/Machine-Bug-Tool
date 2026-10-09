import test from 'node:test';import assert from 'node:assert/strict';
import {selectMaterialDeltas} from '../lib/source-bound-fast-pass.mjs';
const dig='a'.repeat(64), next='b'.repeat(64);
const a={native_source:'GOOGLE_DRIVE',native_id:'id123',version:'v1',digest:dig};
test('unchanged native digest is skipped',()=>{const r=selectMaterialDeltas({incoming:[a],cache:[a]});assert.equal(r.changed.length,0);assert.equal(r.unchanged.length,1);assert.equal(r.actual_methods_executed,0);});
test('new digest becomes a single material delta',()=>{const r=selectMaterialDeltas({incoming:[{...a,digest:next}],cache:[a]});assert.equal(r.changed.length,1);});
test('Dash projection is not independent evidence',()=>{const r=selectMaterialDeltas({incoming:[a,{surface:'DROPBOX_DASH',projection_of:a}],cache:[]});assert.equal(r.changed.length,1);assert.equal(r.duplicate_projections_ignored,1);});
test('conflicting native direct evidence fails closed',()=>assert.throws(()=>selectMaterialDeltas({incoming:[a,{...a,digest:next}],cache:[]}),/CONFLICTING_NATIVE_DIGEST/));
test('conflicting cache fails closed',()=>assert.throws(()=>selectMaterialDeltas({incoming:[],cache:[a,{...a,digest:next}]}),/CONFLICTING_CACHE_DIGEST/));
