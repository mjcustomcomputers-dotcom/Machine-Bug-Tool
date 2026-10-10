// Finite natural-language "NOT" syntax observation, not a sentiment classifier
// and not proof of permission, absence, causation or a real-world negative.
export const MPC_NEGATION_SCOPE_VERSION='MPC_NEGATION_SCOPE_1';
export const MPC_NEGATION_LIMITS=Object.freeze({maxInputChars:200_000,scanChars:16_384,maxMarkers:12});
const TOKENS=/\b(?:do\s+not|does\s+not|did\s+not|cannot|can't|don't|never|without|not|no|failed\s+to)\b/giu;
const DOUBLE=/\b(?:not|never|no|without)\b.{0,22}\b(?:not|never|no|without)\b/iu;
const LIMITED=/\b(?:no evidence (?:of|that)|not observed|not detected|not proven|unable to verify|cannot establish|without evidence)\b/iu;
const guard=value=>typeof value==='string'&&value.length<=MPC_NEGATION_LIMITS.maxInputChars;
export function inspectNegationScopes(text){
  if(!guard(text))throw Object.assign(Error('MPC_NEGATION_TEXT_INVALID'),{code:'MPC_NEGATION_TEXT_INVALID'});
  const sample=text.slice(0,MPC_NEGATION_LIMITS.scanChars),markers=[];
  let match;
  while((match=TOKENS.exec(sample))!==null&&markers.length<MPC_NEGATION_LIMITS.maxMarkers){
    const token=match[0].toLowerCase().replace(/\s+/gu,' ');
    const before=sample.slice(Math.max(0,match.index-26),match.index).split(/[.!?\n]/u).at(-1)??'';
    const after=sample.slice(match.index,Math.min(sample.length,match.index+85)).split(/[.!?\n]/u)[0]??'';
    const fragment=before+after;
    const next=sample.slice(match.index,Math.min(sample.length,match.index+90));
    const kind=LIMITED.test(fragment)?'LIMITED_EVIDENCE_CLAIM':
      DOUBLE.test(next)?'MULTIPLE_NEGATION_SCOPE_AMBIGUOUS':
      /^(?:do not|does not|did not|don't)$/u.test(token)?'GRAMMATICAL_PROHIBITION_ONLY':
      /^(?:cannot|can't|failed to)$/u.test(token)?'GRAMMATICAL_INABILITY_ONLY':
      'UNRESOLVED_NEGATION_SCOPE';
    markers.push(Object.freeze({offset_utf16:match.index,operator:token,
      scope_kind:kind,source_authenticated:false,negative_fact_established:false}));
    if(match[0].length===0)TOKENS.lastIndex++;
  }
  TOKENS.lastIndex=0;
  const bounded=sample.length<text.length||markers.length===MPC_NEGATION_LIMITS.maxMarkers;
  return Object.freeze({
    kind:'MPC_NATURAL_LANGUAGE_NEGATION_OBSERVATION',version:MPC_NEGATION_SCOPE_VERSION,
    scope:'FIRST_16384_UTF16_CHARACTERS',coverage:bounded?'BOUNDED_INCOMPLETE':'SCANNED_INPUT',
    inspected_characters:sample.length,total_characters:text.length,
    negation_markers:markers.length,
    ambiguous_scope_markers:markers.filter(row=>row.scope_kind==='MULTIPLE_NEGATION_SCOPE_AMBIGUOUS').length,
    absence_claim_markers:markers.filter(row=>row.scope_kind==='LIMITED_EVIDENCE_CLAIM').length,
    markers:Object.freeze(markers),
    syntax_only:true,authority_established:false,negative_real_world_claim_established:false
  });
}
