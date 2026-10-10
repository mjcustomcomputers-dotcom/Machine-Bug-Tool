#!/usr/bin/env node
// MPC V27: deterministic synthetic method-space proof exercise.
// No wildlife interaction, radio signal acquisition, coordinates or target IO.
import {compareSymbolicCallSequenceV27,fitchTreeParsimonyV27,
 bracketFossilLayerAgeV27,boundSpaceSignalTravelV27,
 auditSetiCandidateControlsV27,gateSensitiveTaxonReleaseV27,
 compareThreePointExpectedValueV27,auditRepeatedDigestChainV27
} from '../lib/mpc-v27-space-lab.mjs';
import {routeSpaceOfMethodsV27} from '../lib/mpc-v27-method-space-router.mjs';
const ctx={source_commit:'306632b081c514120cfaa0c5c23ab43cf05010a4',
 scope_id:'fixture:space-27',subject_id:'fixture:synthetic-research',
 source_ref:'fixture:source',source_version:'v27'};
const atom=(id,dimension)=>({id,dimension,state:'SYNTHETIC',
 source_ref:'fixture:'+id,source_owner:'fixture:lab',
 source_version:'v27',scope_id:ctx.scope_id,subject_id:ctx.subject_id});
const route=routeSpaceOfMethodsV27({...ctx,domain:'CETACEAN',world:'SYNTHETIC',atoms:[
 atom('series','SYMBOLIC_SEQUENCE'),atom('control','NULL_MODEL')]});
const calls=compareSymbolicCallSequenceV27({...ctx,
 symbols:Array.from({length:24},(_,i)=>i%2?'B':'A'),
 permutations:32,seed:119,recording_group_count:1});
const n=(id,children=[],state)=>({id,children,...(state===undefined?{}:{state})});
const phylogeny=fitchTreeParsimonyV27({...ctx,root_id:'root',nodes:[
 n('root',['left','right']),n('left',['a','b']),n('right',['c','d']),
 n('a',[],'A'),n('b',[],'A'),n('c',[],'C'),n('d',[],'C')]});
const fossils=bracketFossilLayerAgeV27({...ctx,
 older_below_ma:90,older_uncertainty_ma:2,younger_above_ma:80,younger_uncertainty_ma:2});
const light=boundSpaceSignalTravelV27({...ctx,distance_min_km:299792.458,
 distance_max_km:299792.458,observed_roundtrip_seconds:1.5});
const seti=auditSetiCandidateControlsV27({...ctx,on_source_signal:true,
 off_source_signal:true,instrument_ok:true,known_rfi:false,independent_followup:true});
const conservation=gateSensitiveTaxonReleaseV27({...ctx,sensitivity:'EXTREME',
 requested_fraction_digits:6,requested_release:'GENERALIZED_GRID'});
const shot=compareThreePointExpectedValueV27({...ctx,two_point_probability:0.6,
 three_point_probability:0.41});
const chalk=auditRepeatedDigestChainV27({...ctx,
 lines:['ONE SOURCE','ONE SOURCE','ONE SOURCE']});
console.log(JSON.stringify({kind:'MPC_V27_SPACE_OF_METHODS_SYNTHETIC_PASS',
 source_commit:ctx.source_commit,research_hook_contracts:route.method_registry_total,
 domain:route.domain,source_phase:route.phase,
 applicable_research_methods:route.selected_methods.filter(m=>
 m.state==='RESEARCH_APPLICABLE_NOT_EXECUTED').map(m=>m.id),
 sequence_adjacent_information_bits:calls.adjacent_mutual_information_bits,
 sequence_null_empirical_tail_fraction:calls.empirical_tail_fraction,
 animal_language_translated:calls.animal_language_translated,
 phylogeny_changes:phylogeny.minimum_unordered_character_changes,
 phylogeny_root_states:phylogeny.possible_root_character_set,
 fossil_possible_age_ma:fossils.broad_possible_fossil_ma,
 light_time_state:light.state,seti_state:seti.state,
 protected_species_release:conservation.status,
 three_point_expectation:shot.state,repeated_lines:chalk.lines,
 independent_authors_counted:false,methods_executed_on_live_sources:0,
 protected_locations_released:false,source_authentication:false,
 canonical_promotion:false},null,2));
