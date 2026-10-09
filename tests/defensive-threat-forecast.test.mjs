import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defensiveForecastPatterns,forecastDefensiveThreats} from '../lib/defensive-threat-forecast.mjs';
import {runDefensiveForecastFile} from '../scripts/run-defensive-threat-forecast.mjs';

const source=(id,hash='a')=>({id,owner:'fixture-only',revision:'fixture-r1',locator:'fixture://local/'+id,sha256:hash.repeat(64)});
const signal=(id,pattern,source_ids=['src1'],predicates=[],extra={})=>({id,pattern,evidence_state:'SOURCE_CODE_OBSERVED',source_ids,predicates,...extra});
const predicate=(id,state='SUPPORTED',source_ids=['src1'],check_cost=2)=>({id,state,source_ids:state==='UNKNOWN'?[]:source_ids,check_cost});
const fixture=(signals,overrides={})=>({schema_version:'DAYBREAK_DEFENSIVE_FORECAST_INPUT_V1',case_id:'fixture:demonstration',sources:[source('src1'),source('src2','b')],signals,program:{scope:'DECLARED_IN_SCOPE',excluded_categories:[]},...overrides});

test('source-only findings cannot establish real security impact or attacker identity',()=>{
 const a=forecastDefensiveThreats(fixture([signal('f1','SENSITIVE_TOKEN_LOGGING')]));
 assert.equal(a.summary.bounty_ready_findings,0);
 assert.equal(a.summary.real_impact_witnesses_authenticated,0);
 assert.equal(a.forecasts[0].path_state,'OPEN_CONDITIONAL_PATH');
 assert.equal(a.forecasts[0].eligible_to_submit,false);
 assert.equal(a.safeguards.target_actions,false);
 assert.equal(a.safeguards.actor_attribution,false);
 assert.equal(a.next_passive_review_check.predicate_id,'REAL_SECRET_LOGGED');
});

test('program exclusion defeats MITM-dependent bounty eligibility despite observed code',()=>{
 const f=fixture([signal('tls','TLS_CERTIFICATE_CHECK_DISABLED')]);f.program.excluded_categories=['MITM_REQUIRED'];
 const a=forecastDefensiveThreats(f);
 assert.equal(a.forecasts[0].program_eligibility,'PROGRAM_EXCLUSION_DECLARED');
 assert.equal(a.next_passive_review_check,null);
 assert.equal(a.forecasts[0].observation_state,'SOURCE_CODE_OBSERVED');
});

test('a refuted untrusted-destination reachability precondition blocks the predicted path',()=>{
 const f=fixture([signal('url','UNBOUND_BEARER_DESTINATION',['src1'],[
  predicate('UNTRUSTED_DESTINATION_REACHABLE','REFUTED',['src2']),
  predicate('BEARER_SENT_TO_DESTINATION'),predicate('ORIGIN_ALLOWLIST_ABSENT')])]);
 const a=forecastDefensiveThreats(f);
 assert.equal(a.forecasts[0].path_state,'REFUTED_PRECONDITION');
 assert.equal(a.summary.blocked_by_falsifier,1);
 assert.equal(a.next_passive_review_check,null);
});

test('all asserted preconditions still cannot silently promote a payout claim',()=>{
 const f=fixture([signal('order','DISPLAY_INTERNAL_ID_CONFLATION',['src1'],[
  predicate('DISPLAY_ID_DIFFERS_FROM_INTERNAL'),predicate('LOOKUP_CONSUMES_DISPLAY_AS_INTERNAL'),
  predicate('CROSS_OBJECT_COLLISION_OR_AUTH_EFFECT')])]);
 const a=forecastDefensiveThreats(f);
 assert.equal(a.forecasts[0].path_state,'PRECONDITIONS_DECLARED_SUPERSET_NO_IMPACT_PROOF');
 assert.equal(a.forecasts[0].program_eligibility,'SOURCE_PATH_ONLY_IMPACT_NOT_VERIFIED');
 assert.equal(a.summary.bounty_ready_findings,0);
});

test('a known public report is excluded from novelty, without erasing its source observation',()=>{
 const f=fixture([signal('public','DISPLAY_INTERNAL_ID_CONFLATION',['src1'],[],{evidence_state:'PUBLIC_REPORT',known_public_issue:true})]);
 const a=forecastDefensiveThreats(f);
 assert.equal(a.forecasts[0].program_eligibility,'KNOWN_PUBLIC_PRIOR_REPORT');
 assert.equal(a.next_passive_review_check,null);
 assert.equal(a.summary.known_public_priors,1);
});

test('same native source is not counted as independent evidence',()=>{
 const a=forecastDefensiveThreats(fixture([signal('tls','TLS_CERTIFICATE_CHECK_DISABLED'),signal('url','UNBOUND_BEARER_DESTINATION')]));
 assert.equal(a.source_dependency_checks.length,1);
 assert.equal(a.source_dependency_checks[0].source_relationship,'SHARED_DECLARED_SOURCE');
 assert.equal(a.source_dependency_checks[0].shared_source_ids[0],'src1');
 assert.equal(a.summary.real_impact_witnesses_authenticated,0);
});

test('reordered equivalent inputs have an identical fingerprint and sorted predictions',()=>{
 const left=fixture([signal('b','UNBOUND_BEARER_DESTINATION'),signal('a','TLS_CERTIFICATE_CHECK_DISABLED')]);
 const right={...left,sources:[...left.sources].reverse(),signals:[...left.signals].reverse()};
 assert.deepEqual(forecastDefensiveThreats(left),forecastDefensiveThreats(right));
});

test('fail-closed evidence schemas reject missing refs, duplicate signals, bad digest and unsupported method',()=>{
 const base=fixture([signal('x','SENSITIVE_TOKEN_LOGGING')]);
 for(const v of [
  {...base,signals:[signal('x','SENSITIVE_TOKEN_LOGGING'),signal('x','TLS_CERTIFICATE_CHECK_DISABLED')]},
  {...base,signals:[signal('x','SENSITIVE_TOKEN_LOGGING',['missing'])]},
  {...base,signals:[signal('x','UNREGISTERED_THREAT')]},
  {...base,sources:[{...base.sources[0],sha256:'1'}]},
  {...base,signals:[signal('x','SENSITIVE_TOKEN_LOGGING',['src1'],[{id:'REAL_SECRET_LOGGED',state:'UNKNOWN',source_ids:['src1']}])]},
  {...base,program:{scope:'DECLARED_IN_SCOPE',excluded_categories:['NO_SUCH_CATEGORY']}}
 ])assert.throws(()=>forecastDefensiveThreats(v));
 assert.equal(defensiveForecastPatterns.length,6);
});

test('CLI only reads bounded local JSON and matches direct adapter output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'daybreak-forecast-'));
 const f=fixture([signal('x','UNBOUND_BEARER_DESTINATION')]);
 const path=join(dir,'input.json');writeFileSync(path,JSON.stringify(f));
 assert.deepEqual(runDefensiveForecastFile(path),forecastDefensiveThreats(f));
});
