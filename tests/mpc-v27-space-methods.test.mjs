import test from 'node:test';
import assert from 'node:assert/strict';
import frontier from '../research/space-of-methods-v27.json' with {type:'json'};
import {spaceScienceContract,compareSymbolicCallSequenceV27,
 fitchTreeParsimonyV27,bracketFossilLayerAgeV27,boundSpaceSignalTravelV27,
 auditSetiCandidateControlsV27,gateSensitiveTaxonReleaseV27,
 compareThreePointExpectedValueV27,auditRepeatedDigestChainV27
} from '../lib/mpc-v27-space-lab.mjs';
import {methodSpaceContract,routeSpaceOfMethodsV27
} from '../lib/mpc-v27-method-space-router.mjs';
const source_commit='306632b081c514120cfaa0c5c23ab43cf05010a4';
const scope={source_commit,scope_id:'fixture:space-methods',subject_id:'fixture:research-subject',
 source_ref:'fixture:source',source_version:'r1'};
const seq=(symbols,extra={})=>({...scope,symbols,permutations:64,seed:8231,
 recording_group_count:1,...extra});
const node=(id,children=[],state)=>({
 id,children,...(state===undefined?{}:{state})});
const fitch=nodes=>({...scope,root_id:'root',nodes});
const age=(older_below_ma,older_uncertainty_ma,younger_above_ma,younger_uncertainty_ma)=>({
 ...scope,older_below_ma,older_uncertainty_ma,younger_above_ma,younger_uncertainty_ma});
const light=(distance_min_km,distance_max_km,observed_roundtrip_seconds=null)=>({
 ...scope,distance_min_km,distance_max_km,observed_roundtrip_seconds});
const seti=over=>({...scope,on_source_signal:true,off_source_signal:false,
 instrument_ok:true,known_rfi:false,independent_followup:true,...over});
const species=(sensitivity,requested_fraction_digits,requested_release='GENERALIZED_GRID')=>
 ({...scope,sensitivity,requested_fraction_digits,requested_release});
const shot=(two_point_probability,three_point_probability)=>({
 ...scope,two_point_probability,three_point_probability});
const atom=(id,dimension,state='SYNTHETIC',src='fixture:source',version='r1')=>({
 id,dimension,state,source_ref:src,source_owner:'fixture:lab',
 source_version:version,scope_id:scope.scope_id,subject_id:scope.subject_id});
const route=(domain,atoms=[],extra={})=>({...scope,domain,world:'SYNTHETIC',
 atoms,max_methods:8,...extra});
test('V27 atlas is noncanonical and 43 hooks retain real sources, falsifiers and domains',()=>{
 assert.equal(frontier.hooks.length,48);
 assert.equal(frontier.original_evaluators,24);
 assert.equal(frontier.original_method_atlas_candidates,239);
 assert.equal(frontier.canonical_promotion,false);
 assert.equal(spaceScienceContract.canonical_promotion,false);
 assert.equal(methodSpaceContract.native_evaluators_added,0);
 assert.equal(new Set(frontier.hooks.map(x=>x.id)).size,43);
 assert.ok(frontier.hooks.every(h=>h.primary_source_urls.length>0&&
 h.primary_source_urls.every(x=>x.startsWith('https://'))&&h.falsifier.length>12));
 assert.equal(frontier.hooks.filter(x=>x.domain==='META').length,8);
});
test('species-specific rare communication hooks are evidence-only and do not transfer species identity',()=>{
 const extra=frontier.hooks.filter(h=>Number(h.id.slice(-2))>=44);
 assert.equal(extra.length,5);
 assert.ok(extra.every(h=>h.domain==='ETHOLOGY'));
 assert.ok(extra.every(h=>h.implementation_state==='RESEARCH_METHOD_CONTRACT_NOT_EXECUTED'));
 assert.ok(extra.every(h=>h.primary_source_urls.every(x=>x.startsWith('https://'))));
 const r=routeSpaceOfMethodsV27(route('ETHOLOGY',[
  atom('elephant','ELEPHANT_CALL'),atom('receiver','RECEIVER_IDENTITY')]));
 assert.equal(r.domain_applicable_contracts,18);
 assert.equal(r.selected_methods.find(x=>x.id==='RH-V27-44').state,
  'RESEARCH_APPLICABLE_NOT_EXECUTED');
 assert.equal(r.cross_species_semantics_inferred,false);
 assert.equal(r.real_science_methods_executed,0);
});

test('symbolic alternation retains adjacent dependence against seeded permutations',()=>{
 const s=Array.from({length:32},(_,i)=>i%2?'B':'A');
 const r=compareSymbolicCallSequenceV27(seq(s));
 assert.equal(r.symbolic_event_count,32);
 assert.equal(r.distinct_symbols,2);
 assert.ok(r.adjacent_mutual_information_bits>0.9);
 assert.ok(r.empirical_tail_fraction<0.2);
 assert.equal(r.animal_language_translated,false);
 assert.equal(r.caller_identity_verified,false);
 assert.equal(r.real_recording_processed,false);
 assert.deepEqual(r,compareSymbolicCallSequenceV27(seq(s)));
});
test('constant symbol contains no adjacent-information gain and cannot be translated',()=>{
 const r=compareSymbolicCallSequenceV27(seq(Array(10).fill('A')));
 assert.equal(r.adjacent_mutual_information_bits,0);
 assert.equal(r.shuffled_null_mean_bits,0);
 assert.equal(r.empirical_tail_fraction,1);
 assert.equal(r.animal_language_translated,false);
});
test('permutation experiment rejects short, invalid and unscoped acoustic records',()=>{
 assert.throws(()=>compareSymbolicCallSequenceV27(seq(['A','B','C'])),/INVALID_SEQUENCE_MODEL/);
 const x=seq(['A','B','C','D','A']);x.symbols[0]='A|B';
 assert.throws(()=>compareSymbolicCallSequenceV27(x),/INVALID_SEQUENCE_MODEL/);
 const y=seq(['A','B','C','D','A'],{permutations:0});
 assert.throws(()=>compareSymbolicCallSequenceV27(y),/INVALID_SEQUENCE_MODEL/);
 const z=seq(['A','B','C','D','A']);z.raw_whistle_audio='private';
 assert.throws(()=>compareSymbolicCallSequenceV27(z),/INVALID_CALL_SEQUENCE_FIELDS/);
});
test('Fitch fixed tree has one minimum change and remains an evolutionary hypothesis',()=>{
 const t=fitch([node('root',['left','right']),node('left',['a','b']),
  node('right',['c','d']),node('a',[],'A'),node('b',[],'A'),
  node('c',[],'C'),node('d',[],'C')]);
 const r=fitchTreeParsimonyV27(t);
 assert.equal(r.minimum_unordered_character_changes,1);
 assert.deepEqual(r.possible_root_character_set,['A','C']);
 assert.equal(r.true_ancestral_species_proven,false);
 assert.equal(r.topology_authenticated,false);
});
test('Fitch conflicting branches count two changes, not invented root history',()=>{
 const t=fitch([node('root',['l','r']),node('l',['a','b']),
  node('r',['c','d']),node('a',[],'A'),node('b',[],'C'),
  node('c',[],'A'),node('d',[],'C')]);
 const r=fitchTreeParsimonyV27(t);
 assert.equal(r.minimum_unordered_character_changes,2);
 assert.deepEqual(r.possible_root_character_set,['A','C']);
});
test('Fitch rejects cycles, multiple parents, disconnected trees and invalid traits',()=>{
 const x=fitch([node('root',['a','b']),node('a',[],'A'),node('b',[],'Z')]);
 assert.throws(()=>fitchTreeParsimonyV27(x),/INVALID_FITCH_CHARACTER/);
 const y=fitch([node('root',['a','b']),node('a',['root','c']),node('b',[],'A'),node('c',[],'C')]);
 assert.throws(()=>fitchTreeParsimonyV27(y),/INVALID_FITCH_TOPOLOGY|INVALID_FITCH_ROOT|FITCH_CYCLE/);
 const z=fitch([node('root',['a','b']),node('a',[],'A'),node('b',[],'A'),
  node('disconnected',[],'A')]);
 assert.throws(()=>fitchTreeParsimonyV27(z),/INVALID_FITCH_ROOT/);
});
test('stratigraphic ages return conservative possible interval, not exact fossil age',()=>{
 const r=bracketFossilLayerAgeV27(age(90,2,80,2));
 assert.equal(r.state,'BRACKET_CONSISTENT_UNDER_DECLARED_UNCERTAINTY');
 assert.deepEqual(r.broad_possible_fossil_ma,[78,92]);
 assert.equal(r.fossil_directly_dated,false);
 assert.equal(r.species_identified,false);
});
test('inverted fossil layers and overlapping uncertainty are visibly separated',()=>{
 assert.equal(bracketFossilLayerAgeV27(age(60,1,80,1)).state,
  'STRATIGRAPHIC_INTERVALS_INCONSISTENT');
 assert.equal(bracketFossilLayerAgeV27(age(70,20,80,20)).state,
  'NOMINAL_ORDER_CONFLICT_REVIEW');
 assert.equal(bracketFossilLayerAgeV27(age(90,8,84,8)).state,
  'BRACKET_UNCERTAIN_OVERLAPPING_LAYER_INTERVALS');
});
test('negative layer age interval and unsupported inputs reject',()=>{
 assert.throws(()=>bracketFossilLayerAgeV27(age(1,2,0,0)),/FOSSIL_AGE_NEGATIVE_INTERVAL/);
 const x=age(90,2,80,2);x.claim_dinosaur_language='yes';
 assert.throws(()=>bracketFossilLayerAgeV27(x),/INVALID_FOSSIL_AGE_FIELDS/);
});
test('light speed gives 1 second one-way, 2 seconds round-trip at c km',()=>{
 const r=boundSpaceSignalTravelV27(light(299792.458,299792.458,2.1));
 assert.ok(Math.abs(r.one_way_vacuum_lower_bound_seconds[0]-1)<1e-12);
 assert.ok(Math.abs(r.roundtrip_vacuum_lower_bound_seconds[0]-2)<1e-12);
 assert.equal(r.state,'NO_PHYSICAL_LOWER_BOUND_VIOLATION_IN_SUPPLIED_VALUES');
 assert.equal(r.real_signal_traced,false);
});
test('impossible declared physical roundtrip is a measurement contradiction, not alien detection',()=>{
 const r=boundSpaceSignalTravelV27(light(299792.458,299792.458,1.5));
 assert.equal(r.state,'DECLARED_DISTANCE_OR_TIMING_CONTRADICTION');
 assert.equal(r.measured_roundtrip_less_than_physical_lower_bound,true);
 assert.equal(r.actual_mission_or_technology_verified,false);
 assert.equal(boundSpaceSignalTravelV27(light(0,0)).state,'NO_OBSERVED_ROUNDTRIP');
});
test('negative distance and malformed roundtrip are rejected',()=>{
 assert.throws(()=>boundSpaceSignalTravelV27(light(-2,1,0)),/INVALID_SPACE_DISTANCE/);
 assert.throws(()=>boundSpaceSignalTravelV27(light(10,1,0)),/INVALID_SPACE_DISTANCE/);
});
test('SETI candidate controls do not promote even a declared clean repeated signal',()=>{
 const r=auditSetiCandidateControlsV27(seti({}));
 assert.equal(r.state,'DECLARED_CONTROLS_COMPLETE_NOT_VERIFIED_DISCOVERY');
 assert.equal(r.extraterrestrial_origin_proven,false);
 assert.equal(r.real_signal_processed,false);
});
test('off-source and known RFI independently falsify a radio detection',()=>{
 assert.equal(auditSetiCandidateControlsV27(seti({off_source_signal:true})).state,
  'INTERFERENCE_FALSIFIER_PRESENT');
 assert.equal(auditSetiCandidateControlsV27(seti({known_rfi:true})).state,
  'INTERFERENCE_FALSIFIER_PRESENT');
 assert.equal(auditSetiCandidateControlsV27(seti({instrument_ok:false})).state,
  'INSTRUMENT_VALIDITY_FAILURE');
});
test('unknown SETI controls and absent candidate stop claims',()=>{
 assert.equal(auditSetiCandidateControlsV27(seti({independent_followup:null})).state,
  'MORE_INDEPENDENT_CONTROLS_NEEDED');
 assert.equal(auditSetiCandidateControlsV27(seti({on_source_signal:false})).state,
  'NO_DECLARED_CANDIDATE');
 assert.equal(auditSetiCandidateControlsV27(seti({independent_followup:false})).state,
  'NOT_REOBSERVED_REVIEW');
});
test('endangered extreme and unknown location category never releases coordinates',()=>{
 for(const label of ['EXTREME','UNKNOWN']){
  const r=gateSensitiveTaxonReleaseV27(species(label,1));
  assert.equal(r.status,'PUBLIC_LOCATION_RELEASE_BLOCKED');
  assert.equal(r.allowed,false);
  assert.equal(r.coordinates_in_output,false);
  assert.equal(gateSensitiveTaxonReleaseV27(species(label,1,'WITHHOLD')).allowed,true);
 }
});
test('GBIF-like declared category guards 0.1, 0.01, 0.001 degree precision',()=>{
 assert.equal(gateSensitiveTaxonReleaseV27(species('HIGH',1)).allowed,true);
 assert.equal(gateSensitiveTaxonReleaseV27(species('HIGH',2)).allowed,false);
 assert.equal(gateSensitiveTaxonReleaseV27(species('MEDIUM',2)).allowed,true);
 assert.equal(gateSensitiveTaxonReleaseV27(species('MEDIUM',3)).allowed,false);
 assert.equal(gateSensitiveTaxonReleaseV27(species('LOW',3)).allowed,true);
 assert.equal(gateSensitiveTaxonReleaseV27(species('LOW',6)).allowed,false);
 assert.equal(gateSensitiveTaxonReleaseV27(species('NOT_SENSITIVE',6)).allowed,true);
});
test('sensitive record raw latitude and longitude are not allowed inside methodology audit',()=>{
 const x=species('HIGH',1);x.lat=34.232323;x.lon=-92.1201;
 assert.throws(()=>gateSensitiveTaxonReleaseV27(x),/INVALID_SENSITIVE_TAXON_FIELDS/);
});
test('three point expected value threshold favors three above 2/3 scaled baseline',()=>{
 const r=compareThreePointExpectedValueV27(shot(0.6,0.41));
 assert.equal(r.state,'THREE_POINT_DECLARED_EXPECTATION_HIGHER');
 assert.ok(Math.abs(r.three_point_break_even_probability-0.4)<1e-12);
 assert.equal(r.player_or_game_evidence_acquired,false);
 assert.equal(compareThreePointExpectedValueV27(shot(0.6,0.39)).state,
  'TWO_POINT_DECLARED_EXPECTATION_HIGHER');
 assert.equal(compareThreePointExpectedValueV27(shot(0.6,0.4)).state,
  'DECLARED_EXPECTED_VALUE_TIE');
});
test('probabilities must be supplied and cannot prove sporting intent',()=>{
 assert.throws(()=>compareThreePointExpectedValueV27(shot(2,0.3)),/INVALID_SHOT_PROBABILITY/);
 assert.throws(()=>compareThreePointExpectedValueV27(shot(0.5,NaN)),/INVALID_SHOT_PROBABILITY/);
});
test('Bart chalkboard repeated text generates different index-bound hashes but no independent writers',()=>{
 const r=auditRepeatedDigestChainV27({...scope,lines:['I WILL CHECK SOURCES',
  'I WILL CHECK SOURCES','I WILL CHECK SOURCES']});
 assert.equal(r.unique_line_contents,1);
 assert.equal(r.indexed_chain_digests.length,3);
 assert.equal(new Set(r.indexed_chain_digests).size,3);
 assert.equal(r.independent_authors_observed,false);
 assert.ok(!JSON.stringify(r).includes('I WILL CHECK SOURCES'));
});
test('repetition chain is deterministic, append-only order sensitive and strict',()=>{
 const a=auditRepeatedDigestChainV27({...scope,lines:['A','B','C']});
 assert.deepEqual(a,auditRepeatedDigestChainV27({...scope,lines:['A','B','C']}));
 assert.notEqual(a.last_digest,auditRepeatedDigestChainV27({...scope,lines:['B','A','C']}).last_digest);
 const x={...scope,lines:['A'],password:'secret'};
 assert.throws(()=>auditRepeatedDigestChainV27(x),/INVALID_REPETITION_FIELDS/);
});
test('space router uses domain-limited source-bound candidate selection, no translated species',()=>{
 const r=routeSpaceOfMethodsV27(route('CETACEAN',[
 atom('seq','SYMBOLIC_SEQUENCE'),atom('null','NULL_MODEL')]));
 assert.equal(r.domain,'CETACEAN');
 assert.equal(r.method_registry_total,48);
 assert.ok(r.domain_applicable_contracts<43);
 const m=r.selected_methods.find(x=>x.id==='RH-V27-10');
 assert.equal(m.state,'RESEARCH_APPLICABLE_NOT_EXECUTED');
 assert.equal(r.phase,'ANALYSIS');
 assert.equal(r.real_science_methods_executed,0);
 assert.equal(r.cross_species_semantics_inferred,false);
 assert.equal(r.canonical_promotion,false);
});
test('space router unknown/missing primary evidence stays acquisition, not ready',()=>{
 const r=routeSpaceOfMethodsV27(route('CONSERVATION',[]));
 assert.equal(r.phase,'EVIDENCE_ACQUISITION');
 assert.equal(r.status,'NEXT_NATIVE_RECORD_REQUIRED');
 assert.ok(r.missing_primary_source_frontier.length);
 assert.ok(r.missing_primary_source_frontier.every(x=>x.records_acquired===0));
});
test('space router stop on identical state and block source versions before zero-delta',()=>{
 const x=route('SPACE',[atom('sig','CANDIDATE_SIGNAL'),atom('off','OFF_SOURCE_CONTROL')]);
 const a=routeSpaceOfMethodsV27(x);
 const b=routeSpaceOfMethodsV27({...x,previous_fingerprint:a.fingerprint});
 assert.equal(b.status,'STOP_NO_MATERIAL_INFORMATION_GAIN');
 const q=route('SPACE',[atom('sig','CANDIDATE_SIGNAL','SYNTHETIC','fixture:same','v1'),
   atom('off','OFF_SOURCE_CONTROL','SYNTHETIC','fixture:same','v2')]);
 assert.equal(routeSpaceOfMethodsV27(q).status,'SOURCE_VERSION_CONFLICT');
});
test('invalid domain, raw caller traits and incompatible world fail closed',()=>{
 const x=route('TELEPATHY',[]);assert.throws(()=>routeSpaceOfMethodsV27(x),/INVALID_METHOD_SPACE_CONTEXT/);
 const y=route('SPACE',[atom('s','CANDIDATE_SIGNAL')]);
 y.atoms[0].unverified_animal_intent='human-like';
 assert.throws(()=>routeSpaceOfMethodsV27(y),/INVALID_METHOD_SPACE_ATOM_FIELDS/);
 const z=route('SPACE',[atom('s','CANDIDATE_SIGNAL')],{world:'RECORD'});
 assert.throws(()=>routeSpaceOfMethodsV27(z),/INVALID_SPACE_WORLD/);
});
test('business router integration remains opt-in and does not alter V26 schema',()=>{
 const x=route('SPORT',[atom('p','TWO_POINT_RATE'),atom('q','THREE_POINT_RATE')]);
 const baseline=routeSpaceOfMethodsV27(x);
 assert.equal(baseline.optional_v26_business_plan,null);
 const bridged=routeSpaceOfMethodsV27({...x,include_v26_business_context:true});
 assert.equal(bridged.optional_v26_business_plan.profile,'BUSINESS_STARTUP');
 assert.equal(bridged.optional_v26_business_plan.claims.methods_executed,0);
 assert.equal(bridged.real_science_methods_executed,0);
});
test('method links only connect typed matching contracts and remain speculative',()=>{
 const r=routeSpaceOfMethodsV27(route('SPACE',[
  atom('signal','CANDIDATE_SIGNAL'),atom('off','OFF_SOURCE_CONTROL'),
  atom('rfi','RFI_MONITOR')]));
 assert.ok(r.method_on_method_links.every(e=>e.intermediate_evidence_observed===false));
 assert.ok(r.method_on_method_links.every(e=>e.source_independence_proven===false));
 assert.ok(r.mirror_falsifiers.every(x=>x.executed===false));
});
