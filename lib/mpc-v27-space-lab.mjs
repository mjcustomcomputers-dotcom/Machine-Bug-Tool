// MPC V27 — finite science-of-methods experiments over synthetic or supplied
// metadata. No animal audio collection/playback, sensitive coordinates, space
// traffic, hardware sensor, wildlife identification or native MPC evaluator.
import {createHash} from 'node:crypto';
const fail=x=>{throw Error(x)};
const ident=/^[A-Za-z0-9][A-Za-z0-9_:./@-]{0,95}$/u;
const commit=/^[a-f0-9]{40}$/u;
const token=/^[A-Z][A-Z0-9_]{0,47}$/u;
const good=x=>typeof x==='string'&&ident.test(x);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const allowed=(o,keys,label)=>{
 if(!plain(o)||Object.keys(o).some(x=>!keys.includes(x)))fail('INVALID_'+label+'_FIELDS');
};
const array=(a,max,label)=>{
 if(!Array.isArray(a)||a.length>max||Array.from({length:a.length},(_,i)=>Object.hasOwn(a,i)).some(x=>!x))fail('INVALID_'+label);
 return a;
};
const unique=x=>[...new Set(x)];
const sorted=x=>unique(x).sort();
const bounded=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const scope=i=>{
 if(!plain(i)||!commit.test(i.source_commit||'')||!good(i.scope_id)||!good(i.subject_id)||
 !good(i.source_ref)||!good(i.source_version))fail('INVALID_V27_SOURCE_SCOPE');
 return {source_commit:i.source_commit,scope_id:i.scope_id,
 subject_id:i.subject_id,source_ref:i.source_ref,source_version:i.source_version};
};
export const spaceScienceContract=Object.freeze({
 version:'MPC_V27_FINITE_SPACE_SCIENCE_1',
 supported_models:['SYMBOLIC_ADJACENT_MUTUAL_INFORMATION','FITCH_BINARY_TREE',
  'STRATIGRAPHIC_NUMERIC_BRACKET','VACUUM_SIGNAL_LOWER_BOUND',
  'SETI_DECLARED_CONTROLS','SENSITIVE_TAXON_RELEASE_POLICY',
  'TWO_VS_THREE_EXPECTED_POINTS','INDEXED_REPETITION_DIGEST'],
 source_authentication:false,animal_language_translation:false,
 animal_playback:false,protected_coordinates_processed:false,
 live_space_detection:false,quantum_computation:false,external_actions:false,
 canonical_promotion:false
});
const MI=xs=>{
 const n=xs.length-1;
 const left=new Map(),right=new Map(),pairs=new Map();
 for(let i=0;i<n;i++){
  const a=xs[i],b=xs[i+1],k=a+'|'+b;
  left.set(a,(left.get(a)||0)+1);
  right.set(b,(right.get(b)||0)+1);
  pairs.set(k,(pairs.get(k)||0)+1);
 }
 let sum=0;
 for(const [k,count] of pairs){
  const [a,b]=k.split('|'),p=count/n;
  sum+=p*Math.log2(p/((left.get(a)/n)*(right.get(b)/n)));
 }
 return sum;
};
const lcg=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function compareSymbolicCallSequenceV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
   'symbols','permutations','seed','recording_group_count'],'CALL_SEQUENCE');
 const symbols=array(input.symbols,64,'SYMBOLS');
 if(symbols.length<5||symbols.some(x=>!token.test(x))||
    !Number.isInteger(input.permutations)||input.permutations<8||input.permutations>128||
    !Number.isInteger(input.seed)||input.seed<1||input.seed>0xffffffff||
    !Number.isInteger(input.recording_group_count)||input.recording_group_count<1||
    input.recording_group_count>16)fail('INVALID_SEQUENCE_MODEL');
 const baseline=MI(symbols),rnd=lcg(input.seed),samples=[];
 for(let t=0;t<input.permutations;t++){
  const s=[...symbols];
  for(let j=s.length-1;j>0;j--){
   const k=Math.floor(rnd()*(j+1));[s[j],s[k]]=[s[k],s[j]];
  }
  samples.push(MI(s));
 }
 const exceed=samples.filter(x=>x>=baseline-1e-12).length;
 return {version:spaceScienceContract.version,...c,
  symbolic_event_count:symbols.length,distinct_symbols:unique(symbols).length,
  adjacent_mutual_information_bits:baseline,
  shuffled_null_mean_bits:samples.reduce((a,b)=>a+b,0)/samples.length,
  shuffled_null_max_bits:Math.max(...samples),permutations:samples.length,
  empirical_tail_fraction:(exceed+1)/(samples.length+1),
  duplicate_session_independence_established:false,
  recording_groups_declared:input.recording_group_count,
  state:'DESCRIPTIVE_SEQUENCE_TEST_NOT_COMMUNICATION_DECODING',
  animal_language_translated:false,caller_identity_verified:false,
  species_verified:false,real_recording_processed:false,
  source_authenticated:false,canonical_promotion:false};
}
// Fitch 1971: binary tree, unordered discrete characters, fixed topology.
export function fitchTreeParsimonyV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'root_id','nodes'],'FITCH_INPUT');
 const nodes=array(input.nodes,31,'FITCH_NODES'),by=new Map(),parents=new Map();
 if(nodes.length<3||!good(input.root_id))fail('INVALID_FITCH_SIZE');
 for(const n of nodes){
  allowed(n,['id','children','state'],'FITCH_NODE');
  if(!good(n.id)||by.has(n.id)||!Array.isArray(n.children)||!([0,2].includes(n.children.length))||
   n.children.some(ch=>!good(ch))||new Set(n.children).size!==n.children.length)fail('INVALID_FITCH_NODE');
  if(n.children.length===0?!/^[ACGT]$/u.test(n.state||''):n.state!==undefined)
   fail('INVALID_FITCH_CHARACTER');
  by.set(n.id,n);
 }
 for(const n of nodes)for(const child of n.children){
  if(!by.has(child)||child===n.id||parents.has(child))fail('INVALID_FITCH_TOPOLOGY');
  parents.set(child,n.id);
 }
 if(!by.has(input.root_id)||parents.has(input.root_id)||
  nodes.some(n=>n.id!==input.root_id&&!parents.has(n.id)))fail('INVALID_FITCH_ROOT');
 const seen=new Set();let steps=0;
 const recurse=(id,ancestors)=>{
  if(ancestors.has(id))fail('FITCH_CYCLE');
  const n=by.get(id),path=new Set([...ancestors,id]);
  seen.add(id);
  if(!n.children.length)return new Set([n.state]);
  const a=recurse(n.children[0],path),b=recurse(n.children[1],path);
  const common=new Set([...a].filter(x=>b.has(x)));
  if(common.size)return common;
  steps++;
  return new Set([...a,...b]);
 };
 const root=sorted(recurse(input.root_id,new Set()));
 if(seen.size!==nodes.length)fail('FITCH_DISCONNECTED_TREE');
 const leaves=nodes.filter(x=>x.children.length===0);
 if(leaves.length>16)fail('FITCH_TIP_BUDGET');
 return {version:spaceScienceContract.version,...c,
  tip_count:leaves.length,total_nodes:nodes.length,
  minimum_unordered_character_changes:steps,
  possible_root_character_set:root,
  state:'PARSIMONY_ON_DECLARED_FIXED_TREE_ONLY',
  true_ancestral_species_proven:false,topology_authenticated:false,
  geological_age_inferred:false,source_authenticated:false,canonical_promotion:false};
}
// Ma = million years before present. Intervals represent possible layer ages;
// a fossil bracket is not a direct radiometric fossil date.
export function bracketFossilLayerAgeV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'older_below_ma','older_uncertainty_ma','younger_above_ma','younger_uncertainty_ma'],'FOSSIL_AGE');
 for(const k of ['older_below_ma','older_uncertainty_ma','younger_above_ma','younger_uncertainty_ma'])
  if(!bounded(input[k],0,4600))fail('INVALID_FOSSIL_CALIBRATION');
 const oldLo=input.older_below_ma-input.older_uncertainty_ma,
       oldHi=input.older_below_ma+input.older_uncertainty_ma,
       youngLo=input.younger_above_ma-input.younger_uncertainty_ma,
       youngHi=input.younger_above_ma+input.younger_uncertainty_ma;
 if(oldLo<0||youngLo<0)fail('FOSSIL_AGE_NEGATIVE_INTERVAL');
 const possible=oldHi>=youngLo,robust=oldLo>=youngHi,
  nominal=input.older_below_ma>=input.younger_above_ma;
 return {version:spaceScienceContract.version,...c,
  declared_below_layer_possible_ma:[oldLo,oldHi],
  declared_above_layer_possible_ma:[youngLo,youngHi],
  broad_possible_fossil_ma:possible?[youngLo,oldHi]:null,
  state:!possible?'STRATIGRAPHIC_INTERVALS_INCONSISTENT':
    !nominal?'NOMINAL_ORDER_CONFLICT_REVIEW':
    robust?'BRACKET_CONSISTENT_UNDER_DECLARED_UNCERTAINTY':
    'BRACKET_UNCERTAIN_OVERLAPPING_LAYER_INTERVALS',
  fossil_directly_dated:false,local_stratigraphy_authenticated:false,
  species_identified:false,source_authenticated:false,canonical_promotion:false};
}
const LIGHT_KM_S=299792.458;
// Vacuum lower bound: distance/max physically allowed signal speed.
export function boundSpaceSignalTravelV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'distance_min_km','distance_max_km','observed_roundtrip_seconds'],'SPACE_LATENCY');
 if(!bounded(input.distance_min_km,0,1e15)||
  !bounded(input.distance_max_km,input.distance_min_km,1e15)||
  (input.observed_roundtrip_seconds!==null&&
    !bounded(input.observed_roundtrip_seconds,0,1e13)))fail('INVALID_SPACE_DISTANCE');
 const one=[input.distance_min_km/LIGHT_KM_S,input.distance_max_km/LIGHT_KM_S],
  rtt=one.map(x=>2*x);
 return {version:spaceScienceContract.version,...c,speed_limit_km_per_second:LIGHT_KM_S,
  one_way_vacuum_lower_bound_seconds:one,
  roundtrip_vacuum_lower_bound_seconds:rtt,
  measured_roundtrip_less_than_physical_lower_bound:
    input.observed_roundtrip_seconds!==null&&
    input.observed_roundtrip_seconds+1e-9<rtt[0],
  state:input.observed_roundtrip_seconds===null?'NO_OBSERVED_ROUNDTRIP':
    input.observed_roundtrip_seconds+1e-9<rtt[0]?
      'DECLARED_DISTANCE_OR_TIMING_CONTRADICTION':
      'NO_PHYSICAL_LOWER_BOUND_VIOLATION_IN_SUPPLIED_VALUES',
  actual_mission_or_technology_verified:false,real_signal_traced:false,
  clock_and_distance_authenticated:false,canonical_promotion:false};
}
// Check controls independently, as in technosignature RFI investigations.
// No actual radio telescope data, no discovery claims.
export function auditSetiCandidateControlsV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'on_source_signal','off_source_signal','instrument_ok',
  'known_rfi','independent_followup'],'SETI_CONTROL');
 for(const k of ['on_source_signal','off_source_signal','instrument_ok','known_rfi','independent_followup'])
  if(![true,false,null].includes(input[k]))fail('INVALID_SETI_CONTROL');
 let state;
 if(input.on_source_signal===false)state='NO_DECLARED_CANDIDATE';
 else if(input.off_source_signal===true||input.known_rfi===true)state='INTERFERENCE_FALSIFIER_PRESENT';
 else if(input.instrument_ok===false)state='INSTRUMENT_VALIDITY_FAILURE';
 else if(input.on_source_signal===null||input.off_source_signal===null||
  input.instrument_ok===null||input.known_rfi===null||input.independent_followup===null)
  state='MORE_INDEPENDENT_CONTROLS_NEEDED';
 else if(input.independent_followup===false)state='NOT_REOBSERVED_REVIEW';
 else state='DECLARED_CONTROLS_COMPLETE_NOT_VERIFIED_DISCOVERY';
 return {version:spaceScienceContract.version,...c,state,
  falsifier_present:input.off_source_signal===true||
    input.known_rfi===true||input.instrument_ok===false,
  independently_verified_radio_observations:false,
  natural_origin_excluded:false,extraterrestrial_origin_proven:false,
  real_signal_processed:false,source_authenticated:false,canonical_promotion:false};
}
// Accept NO LAT/LON; only requested precision policy. Full withheld source
// must remain with the authorized custodian, never in report output.
export function gateSensitiveTaxonReleaseV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
  'sensitivity','requested_fraction_digits','requested_release'],'SENSITIVE_TAXON');
 if(!['EXTREME','HIGH','MEDIUM','LOW','NOT_SENSITIVE','UNKNOWN'].includes(input.sensitivity)||
  !['WITHHOLD','GENERALIZED_GRID'].includes(input.requested_release)||
  !Number.isInteger(input.requested_fraction_digits)||
  input.requested_fraction_digits<0||input.requested_fraction_digits>6)
   fail('INVALID_SPECIES_RELEASE_REQUEST');
 const thresholds={HIGH:1,MEDIUM:2,LOW:3,NOT_SENSITIVE:6},
  allowedRelease=input.sensitivity==='UNKNOWN'||input.sensitivity==='EXTREME'?
    false:input.requested_fraction_digits<=thresholds[input.sensitivity];
 const approved=input.requested_release==='WITHHOLD'||allowedRelease;
 const status=input.requested_release==='WITHHOLD'?'WITHHOLD_SENSITIVE_FIELDS':
   approved?'DECLARED_GENERALIZATION_WITHIN_CATEGORY_BOUND':
   'PUBLIC_LOCATION_RELEASE_BLOCKED';
 return {version:spaceScienceContract.version,...c,
  status,allowed:approved,requested_fraction_digits:input.requested_fraction_digits,
  minimum_grid_size_degrees:thresholds[input.sensitivity]===undefined?null:
    10**(-thresholds[input.sensitivity]),
  local_coordinates_seen:false,coordinates_in_output:false,
  nested_metadata_disclosure_checked:false,
  sensitivity_policy_owner_verified:false,source_authenticated:false,
  canonical_promotion:false};
}
export function compareThreePointExpectedValueV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version',
   'two_point_probability','three_point_probability'],'SPORT_EXPECTATION');
 for(const k of ['two_point_probability','three_point_probability'])
  if(!bounded(input[k],0,1))fail('INVALID_SHOT_PROBABILITY');
 const two=2*input.two_point_probability,
  three=3*input.three_point_probability;
 return {version:spaceScienceContract.version,...c,
  declared_expected_two_points:two,declared_expected_three_points:three,
  three_point_break_even_probability:(2/3)*input.two_point_probability,
  state:Math.abs(two-three)<1e-12?'DECLARED_EXPECTED_VALUE_TIE':
    three>two?'THREE_POINT_DECLARED_EXPECTATION_HIGHER':
    'TWO_POINT_DECLARED_EXPECTATION_HIGHER',
  player_or_game_evidence_acquired:false,strategy_or_skill_proven:false,
  source_authenticated:false,canonical_promotion:false};
}
// A Bart Simpson chalkboard-inspired *repetition audit*, not handwriting
// attribution or content custody. Return only digests and repetition counts.
export function auditRepeatedDigestChainV27(input){
 const c=scope(input);
 allowed(input,['source_commit','scope_id','subject_id','source_ref','source_version','lines'],'REPETITION');
 const lines=array(input.lines,32,'REPETITION_LINES');
 if(!lines.length||lines.some(x=>typeof x!=='string'||x.length>256))fail('INVALID_REPETITION_PAYLOAD');
 let prev=Buffer.alloc(32),values=[];
 for(let i=0;i<lines.length;i++){
  const body=createHash('sha256').update(lines[i],'utf8').digest(),
    index=Buffer.alloc(4);
  index.writeUInt32BE(i);
  prev=createHash('sha256').update(Buffer.concat([prev,index,body])).digest();
  values.push(prev.toString('hex'));
 }
 return {version:spaceScienceContract.version,...c,lines:lines.length,
  unique_line_contents:new Set(lines).size,
  indexed_chain_digests:values,last_digest:values.at(-1),
  independent_authors_observed:false,
  cryptographic_signature_verified:false,
  textual_meaning_verified:false,source_authenticated:false,canonical_promotion:false};
}
