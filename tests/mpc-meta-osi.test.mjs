import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {META_TRUTH,notTruth,andTruth,orTruth,generateMetaMethodGraph,createMpcMetaCache} from '../lib/mpc-meta-logic.mjs';
import {MPC_VOSI_LAYERS,MPC_VOSI_VERSION,buildScreenVirtualOsi,buildNetworkVirtualOsi,
  crossExamineVirtualObservations,createVirtualOsiCache} from '../lib/mpc-osi-virtual.mjs';
const hash=x=>createHash('sha256').update(String(x)).digest('hex');
const values=Object.values(META_TRUTH);
const atom=(id,truth)=>({id,truth,meaning:'Exact synthetic predicate '+id,depends_on:['SOURCE_A']});
const source=()=>({project_id:'PROJECT-TEST',session_id:'SESSION-TEST',source_id:'screen:1:0',
  frame_sha256:hash('image-1'),text_sha256:hash('observed-text'),confidence:94,
  truncated:false,recognized_characters:40,cue_ids:[],change_state:'INITIAL',
  frame_width:4096,frame_height:2160});
const network=(coverage='COMPLETE_FOR_REPORTED_OS_TABLES',established=0)=>({
  kind:'MPC_NETWORK_ENDPOINT_OBSERVATION',project_id:'PROJECT-TEST',
  fingerprint:hash('network-'+coverage+'-'+established),
  completeness:coverage,counts:{total:established,established}});
test('three-valued negation is an involution and preserves uncertainty: no evidence is not proof of absence',()=>{
  for(const x of values)assert.equal(notTruth(notTruth(x)),x);
  assert.equal(notTruth(META_TRUTH.UNKNOWN),META_TRUTH.UNKNOWN);
  assert.equal(andTruth(META_TRUTH.NO,META_TRUTH.UNKNOWN),META_TRUTH.NO);
  assert.equal(orTruth(META_TRUTH.YES,META_TRUTH.UNKNOWN),META_TRUTH.YES);
  assert.equal(andTruth(META_TRUTH.YES,META_TRUTH.UNKNOWN),META_TRUTH.UNKNOWN);
  // Independent Kleene tables, rows and columns in SUPPORTED, CONTRADICTED, UNKNOWN order.
  const andMatrix=[
    ['SUPPORTED','CONTRADICTED','UNKNOWN'],
    ['CONTRADICTED','CONTRADICTED','CONTRADICTED'],
    ['UNKNOWN','CONTRADICTED','UNKNOWN']
  ];
  const orMatrix=[
    ['SUPPORTED','SUPPORTED','SUPPORTED'],
    ['SUPPORTED','CONTRADICTED','UNKNOWN'],
    ['SUPPORTED','UNKNOWN','UNKNOWN']
  ];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    assert.equal(andTruth(values[i],values[j]),andMatrix[i][j]);
    assert.equal(orTruth(values[i],values[j]),orMatrix[i][j]);
  }
  assert.equal(orTruth(META_TRUTH.NO,META_TRUTH.UNKNOWN),META_TRUTH.UNKNOWN);
  for(const a of values)for(const b of values)for(const c of values){
    assert.equal(notTruth(andTruth(a,b)),orTruth(notTruth(a),notTruth(b)));
    assert.equal(notTruth(orTruth(a,b)),andTruth(notTruth(a),notTruth(b)));
    assert.equal(andTruth(a,andTruth(b,c)),andTruth(andTruth(a,b),c));
    assert.equal(orTruth(a,orTruth(b,c)),orTruth(orTruth(a,b),c));
    assert.equal(andTruth(a,b),andTruth(b,a));
    assert.equal(orTruth(a,b),orTruth(b,a));
  }
});
test('method-on-method DAG is source keyed, deterministic, bounded and deliberately nonexecuting',()=>{
  const fixture={source_digest:hash('declared-source'),atoms:[
    atom('AUTHORIZATION_OBSERVED',META_TRUTH.UNKNOWN),atom('LEXICAL_CUE_MATCH',META_TRUTH.YES)]};
  const first=generateMetaMethodGraph(fixture);
  assert.deepEqual(first,generateMetaMethodGraph({...fixture,atoms:fixture.atoms.toReversed()}));
  assert.equal(first.candidate_only,true);
  assert.equal(first.no_native_methods_executed,true);
  assert.equal(first.canonical_method_ids_unchanged,true);
  assert.equal(first.generated,9);
  assert.ok(first.nodes.every(row=>row.method_execution==='NOT_EXECUTED'&&row.source_authentication===false&&row.registry_promotion===false));
  const inverse=first.nodes.filter(x=>x.operator==='INVERT_DEPENDENCY');
  assert.equal(inverse.length,1);
  assert.equal(first.nodes.filter(x=>x.operator==='CHALLENGE').length,1);
  assert.equal(inverse[0].logical_state,META_TRUTH.UNKNOWN);
  assert.notEqual(generateMetaMethodGraph({...fixture,source_digest:hash('changed-source')}).nodes[0].candidate_id,
    first.nodes[0].candidate_id);
  assert.equal(generateMetaMethodGraph({...fixture,max_nodes:3}).generated,3);
  assert.throws(()=>generateMetaMethodGraph({...fixture,max_depth:4}),/META_BUDGET_INVALID/u);
  assert.throws(()=>generateMetaMethodGraph({...fixture,source_digest:'abc'}),/META_SOURCE_DIGEST_REQUIRED/u);
  assert.throws(()=>generateMetaMethodGraph({...fixture,atoms:[atom('SAME',META_TRUTH.YES),atom('SAME',META_TRUTH.NO)]}),/META_ATOM_DUPLICATE/u);
});
test('bounded metadata cache reuses only same source/method/session and revokes across time, project and TTL',()=>{
  let now=1000;
  const cache=createMpcMetaCache({now:()=>now,maxEntries:2,maxBytes:12_000,ttlMs:100});
  const key=(id='A',project='PROJECT',session='SESSION')=>({
    project_id:project,session_id:session,source_digest:hash(id),method_version:'VOSI-V1'});
  const graph=(name='A')=>generateMetaMethodGraph({source_digest:hash(name),
    atoms:[atom('A',META_TRUTH.UNKNOWN)],max_nodes:2});
  const a=key(),b=key('B'),c=key('C');
  assert.equal(cache.get(a),null);
  assert.equal(cache.set(a,graph()),true);
  assert.equal(cache.get(a)?.kind,'MPC_META_METHOD_CANDIDATE_GRAPH');
  assert.equal(cache.set(b,graph('B')),true);
  assert.equal(cache.set(c,graph('C')),true);
  assert.equal(cache.get(a),null,'third bounded entry evicts oldest');
  assert.equal(cache.status().entries,2);
  now+=101;
  assert.equal(cache.get(c),null,'TTL expires exact source-bound plan');
  assert.equal(cache.status().entries,0);
  cache.set(a,graph());cache.get(key('A','OTHER-PROJECT'));
  assert.equal(cache.get(a),null,'project boundary invalidates whole cache');
  cache.set(a,graph());now-=30;
  assert.equal(cache.get(a),null,'clock moving backward invalidates state');
  cache.set(a,graph());cache.clear();assert.equal(cache.status().entries,0);
  assert.equal(cache.status().persistent_storage,false);
  assert.equal(cache.status().raw_pixels_retained,false);
  assert.equal(cache.status().raw_text_retained,false);
  assert.throws(()=>cache.set(a,{kind:'MPC_META_METHOD_CANDIDATE_GRAPH',source_digest:'mismatch'}),/META_CACHE_VALUE_INVALID/u);
});
test('OCR virtual OSI stages express 4K work as crop/manual-recapture advice, not made-up speed gains',()=>{
  assert.equal(MPC_VOSI_LAYERS.SCREEN.length,7);
  const cache=createVirtualOsiCache({now:()=>1000,maxEntries:4});
  const large=buildScreenVirtualOsi({...source(),cache});
  assert.equal(large.version,MPC_VOSI_VERSION);
  assert.equal(large.modality,'SCREEN');
  assert.equal(large.virtual_layers.length,7);
  assert.equal(large.router.action,'OFFER_TARGETED_NATIVE_CROP');
  assert.equal(large.observed.frame_pixels,4096*2160);
  assert.equal(large.method_generation.no_native_methods_executed,true);
  assert.equal(large.method_generation.generated,9);
  assert.equal(large.meta_cache,'MISS');
  assert.equal(buildScreenVirtualOsi({...source(),cache}).meta_cache,'HIT');
  const poor=buildScreenVirtualOsi({...source(),confidence:35,truncated:true,cache});
  assert.equal(poor.router.action,'USER_RECAPTURE_SMALLER_CROP_OR_COMPARE_CONTRAST');
  assert.equal(poor.virtual_layers[2].truth,META_TRUTH.NO);
  const unknown=buildScreenVirtualOsi({...source(),confidence:null,cache});
  assert.equal(unknown.virtual_layers[2].truth,META_TRUTH.UNKNOWN);
  const override=buildScreenVirtualOsi({...source(),cue_ids:['CREDENTIAL_REQUEST'],cache});
  assert.equal(override.virtual_layers[3].truth,META_TRUTH.YES);
  assert.equal(override.virtual_layers[4].truth,META_TRUTH.UNKNOWN,'cue does not authenticate intent');
  assert.equal(override.router.action,'REVIEW_SOURCE_BOUND_CUES');
  const noCue=buildScreenVirtualOsi({...source(),frame_width:600,frame_height:400,cache});
  assert.equal(noCue.virtual_layers[3].truth,META_TRUTH.NO,'no match is about fixed lexical rules only');
  assert.equal(noCue.virtual_layers[4].truth,META_TRUTH.UNKNOWN,'no cue is not safety proof');
  assert.equal(large.external_action_authorized,false);
  assert.doesNotMatch(JSON.stringify(large),/secret user screen content/iu);
  assert.throws(()=>buildScreenVirtualOsi({...source(),cue_ids:['invalid cue']}),/VOSI_SCREEN_INPUT_INVALID/u);
});
test('network virtual OSI distinguishes a complete reported table from total network visibility',()=>{
  assert.equal(MPC_VOSI_LAYERS.NETWORK.length,7);
  const complete=buildNetworkVirtualOsi({snapshot:network()});
  assert.equal(complete.virtual_layers[2].truth,META_TRUTH.NO,'no established socket in this exact table');
  assert.equal(complete.virtual_layers[5].truth,META_TRUTH.UNKNOWN,'absence does not prove no harm/traffic');
  assert.equal(complete.source_authentication,false);
  const limited=buildNetworkVirtualOsi({snapshot:network('PARTIAL',0)});
  assert.equal(limited.virtual_layers[2].truth,META_TRUTH.UNKNOWN);
  assert.equal(limited.router.action,'REFRESH_PARTIAL_TABLES');
  const established=buildNetworkVirtualOsi({snapshot:network('COMPLETE_FOR_REPORTED_OS_TABLES',2),diff:{state:'COMPARED'}});
  assert.equal(established.virtual_layers[2].truth,META_TRUTH.YES);
  assert.equal(established.virtual_layers[4].truth,META_TRUTH.YES);
  const screen=buildScreenVirtualOsi(source());
  const cross=crossExamineVirtualObservations(screen,established);
  assert.equal(cross.outcome,'CROSS_SOURCE_REVIEW_CANDIDATE');
  assert.equal(cross.shared_event_proven,false);
  const other=crossExamineVirtualObservations(screen,buildNetworkVirtualOsi({snapshot:{...network(),project_id:'OTHER'}}));
  assert.equal(other.outcome,'NOT_COMPARABLE_DIFFERENT_PROJECT');
  assert.throws(()=>crossExamineVirtualObservations(established,screen),/VOSI_CROSS_SOURCE_INPUT_INVALID/u);
});
