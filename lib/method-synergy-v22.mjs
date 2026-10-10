// MPC V22: source-pinned RESEARCH planning only; no native registry changes.
// Deterministic finite method-to-method dependency and pairwise interaction design.
import {createHash} from 'node:crypto';

export const synergyContract = Object.freeze({
  version: 'MPC_RESEARCH_METHOD_SYNERGY_V22',
  implementation: 'BOUNDED_LOCAL_PLANNING_NOT_NATIVE_EVALUATOR',
  max_hooks: 16, max_pairs: 240, max_factors: 6,
  max_product: 4096, max_cases: 64,
  evidence_authentication: false, method_execution: false,
  target_actions: false, independent_evidence_proven: false,
  canonical_promotion: false, source_registry_modified: false
});
const NAME = /^[A-Z][A-Z0-9_]{0,63}$/u;
const HOOK = /^RH-V22-[0-9]{2}$/u;
const GIT = /^[a-f0-9]{40}$/u;
const SOURCE = /^[a-zA-Z0-9:._/@-]{1,180}$/u;
const fail = message => {throw Error(message)};
const uniq = arr => [...new Set(arr)];
const dense = arr => Array.isArray(arr) && Array.from({length: arr.length}, (_, i) => i).every(i => Object.hasOwn(arr, i));
const assertList = (arr, max, code) => {
  if (!dense(arr) || arr.length > max || new Set(arr).size !== arr.length) fail(code);
  return arr;
};
const checkName = x => typeof x === 'string' && NAME.test(x);
const checkScope = x => {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !GIT.test(x.source_commit || '') ||
      typeof x.scope_id !== 'string' || !SOURCE.test(x.scope_id)) fail('INVALID_SOURCE_SCOPE');
};
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Method-on-method: transform the OUTPUT CONTRACT of one proposed method into
// the INPUT CONTRACT of another. This does not run either method or infer facts.
export function proposeMethodSynergies(input) {
  checkScope(input);
  const hooks = assertList(input.hooks, 16, 'INVALID_HOOK_LIST');
  const facts = assertList(input.observations, 48, 'INVALID_OBSERVATIONS');
  if (hooks.length < 2) fail('TWO_HOOKS_REQUIRED');
  const ids = new Set();
  for (const hook of hooks) {
    if (!hook || typeof hook !== 'object' || Array.isArray(hook) || !HOOK.test(hook.id || '') || ids.has(hook.id)) fail('INVALID_HOOK_ID');
    ids.add(hook.id);
    for (const part of ['requires', 'produces']) {
      const items = assertList(hook[part], 12, 'INVALID_HOOK_'+part.toUpperCase());
      if (!items.length || items.some(x => !checkName(x))) fail('INVALID_HOOK_'+part.toUpperCase());
    }
    if (hook.needs_order !== undefined && typeof hook.needs_order !== 'boolean') fail('INVALID_ORDER_FLAG');
    if (!Array.isArray(hook.sources) || !hook.sources.length || hook.sources.length > 4 ||
        hook.sources.some(s => typeof s !== 'string' || s.length > 2048 || !/^https:\/\//u.test(s))) fail('RESEARCH_SOURCE_REQUIRED');
  }
  const known = new Map();
  for (const fact of facts) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact) || !checkName(fact.type) ||
      typeof fact.source_ref !== 'string' || !SOURCE.test(fact.source_ref) ||
      fact.scope_id !== input.scope_id || !['OBSERVED','SYNTHETIC','UNKNOWN'].includes(fact.state)) fail('INVALID_OBSERVATION_BINDING');
    if (known.has(fact.type)) fail('AMBIGUOUS_OBSERVATION_TYPE');
    if (fact.clock_domain !== undefined && (typeof fact.clock_domain !== 'string' || !SOURCE.test(fact.clock_domain))) fail('INVALID_CLOCK_DOMAIN');
    known.set(fact.type, fact);
  }
  const observed = new Set([...known].filter(([,v]) => v.state !== 'UNKNOWN').map(([k]) => k));
  const ordered = [...hooks].sort((a,b) => a.id.localeCompare(b.id));
  const pairs = [];
  for (const from of ordered) for (const to of ordered) {
    if (from.id === to.id) continue;
    const bridge = from.produces.filter(t => to.requires.includes(t)).sort();
    if (!bridge.length) continue;
    const missing_upstream = from.requires.filter(t => !observed.has(t)).sort();
    const missing_downstream = to.requires.filter(t => !observed.has(t) && !bridge.includes(t)).sort();
    const involved = uniq([...from.requires, ...to.requires].map(t => known.get(t)).filter(Boolean)
      .filter(v => v.state !== 'UNKNOWN'));
    const clock_domains = uniq(involved.map(x => x.clock_domain).filter(Boolean)).sort();
    const order_required = from.needs_order === true || to.needs_order === true;
    const clock_mismatch = order_required && (clock_domains.length > 1 || involved.some(x => !x.clock_domain));
    const ready = missing_upstream.length === 0 && missing_downstream.length === 0 && !clock_mismatch;
    pairs.push({
      from: from.id, to: to.id, bridge, missing_upstream, missing_downstream,
      clock_domains, input_evidence_refs: uniq(involved.map(x=>x.source_ref)).sort(),
      state: clock_mismatch ? 'CLOCK_ALIGNMENT_REQUIRED' : ready ? 'RESEARCH_COMPOSITION_CANDIDATE' : 'INPUT_ACQUISITION_REQUIRED',
      output_is_hypothetical: true, method_execution: 'NOT_EXECUTED',
      independent_evidence: 'NOT_ESTABLISHED', source_authentication: 'NOT_PERFORMED'
    });
  }
  if (pairs.length > synergyContract.max_pairs) fail('COMPOSITION_PAIR_BUDGET');
  return {
    version: synergyContract.version, source_commit: input.source_commit,
    scope_id: input.scope_id, input_fingerprint: sha({hooks:ordered, observations:facts, source_commit:input.source_commit, scope_id:input.scope_id}),
    considered_directional_pairs: hooks.length * (hooks.length-1),
    matching_dependency_pairs: pairs.length, candidates: pairs.filter(p=>p.state==='RESEARCH_COMPOSITION_CANDIDATE').length,
    pairs, execution: 'NOT_EXECUTED', canonical_promotion: false
  };
}

function factorsAndWorlds(input) {
  checkScope(input);
  const factors = assertList(input.factors, 6, 'INVALID_FACTORS');
  if (factors.length < 2) fail('TWO_FACTORS_REQUIRED');
  const names = new Set();
  let product = 1;
  for (const f of factors) {
    if (!f || typeof f !== 'object' || Array.isArray(f) || !checkName(f.name) || names.has(f.name)) fail('INVALID_FACTOR_NAME');
    names.add(f.name);
    if (!dense(f.values) || f.values.length < 2 || f.values.length > 4 ||
       f.values.some(v=>!checkName(v)) || uniq(f.values).length !== f.values.length) fail('INVALID_FACTOR_VALUES');
    product *= f.values.length;
    if (product > synergyContract.max_product) fail('CARTESIAN_PRODUCT_BUDGET');
  }
  const maxCases = input.max_cases === undefined ? 24 : input.max_cases;
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > synergyContract.max_cases) fail('INVALID_CASE_BUDGET');
  let worlds = [[]];
  for (const f of factors) worlds = worlds.flatMap(row => f.values.map(v=>[...row,v]));
  const key = (i, a, j, b) => `${i}/${a}|${j}/${b}`;
  const allPairs = new Set();
  for (let i=0;i<factors.length;i++) for (let j=i+1;j<factors.length;j++)
    for (const a of factors[i].values) for (const b of factors[j].values) allPairs.add(key(i,a,j,b));
  const rowPairs = row => {
    const pairs=[];
    for (let i=0;i<row.length;i++) for (let j=i+1;j<row.length;j++) pairs.push(key(i,row[i],j,row[j]));
    return pairs;
  };
  return {factors, worlds, allPairs, rowPairs, maxCases, product};
}

// Greedy, deterministic set cover for full two-factor interaction coverage.
// Output rows are a TEST DESIGN, not executed target tests or a promise of 3-way coverage.
export function planMethodInteractionCoverage(input) {
  const {factors, worlds, allPairs, rowPairs, maxCases, product} = factorsAndWorlds(input);
  const uncovered = new Set(allPairs);
  const cases = [], used = new Set();
  while (uncovered.size && cases.length < maxCases) {
    let best = -1, bestScore = 0, bestKeys = [];
    for (let i=0;i<worlds.length;i++) {
      if (used.has(i)) continue;
      const fresh=rowPairs(worlds[i]).filter(k=>uncovered.has(k));
      if (fresh.length > bestScore) {best=i;bestScore=fresh.length;bestKeys=fresh;}
    }
    if (best < 0 || bestScore === 0) break;
    used.add(best);
    for (const key of bestKeys) uncovered.delete(key);
    cases.push({case_id:`PAIR-${String(cases.length+1).padStart(3,'0')}`,
      assignments:factors.map((f,i)=>({factor:f.name,value:worlds[best][i]})), new_pairs:bestScore});
  }
  const design = {
    version:synergyContract.version, source_commit:input.source_commit, scope_id:input.scope_id,
    source_fingerprint:sha({source_commit:input.source_commit,scope_id:input.scope_id,factors,max_cases:maxCases}),
    objective:'ALL_TWO_FACTOR_VALUE_COMBINATIONS', exhaustive_worlds:product,
    total_pairs:allPairs.size, covered_pairs:allPairs.size-uncovered.size,
    missing_pairs:[...uncovered].sort(), complete_design:uncovered.size===0,
    state:uncovered.size ? 'BOUNDED_INCOMPLETE_TEST_DESIGN' : 'COMPLETE_TEST_DESIGN_NOT_EXECUTED',
    cases, tests_executed:0, source_authenticated:false, target_actions:false,
    three_way_coverage_claim:false, canonical_promotion:false
  };
  return design;
}

// Independent re-enumeration to catch corrupted claims about a planned test matrix.
export function auditMethodInteractionCoverage(input,design) {
  const {factors,allPairs,rowPairs,maxCases,product}=factorsAndWorlds(input);
  if(!design||!dense(design.cases)||design.cases.length>maxCases) fail('DESIGN_CASE_BUDGET');
  if(design.source_commit!==input.source_commit||design.scope_id!==input.scope_id||
    design.source_fingerprint!==sha({source_commit:input.source_commit,scope_id:input.scope_id,factors,max_cases:maxCases})) fail('DESIGN_SOURCE_DRIFT');
  const covered=new Set(), seenRows=new Set();
  for(let index=0;index<design.cases.length;index++){
    const item=design.cases[index];
    if(!item || item.case_id!==`PAIR-${String(index+1).padStart(3,'0')}`) fail('INVALID_CASE_ID_ORDER');
    if(!dense(item.assignments)||item.assignments.length!==factors.length)fail('INVALID_CASE_ASSIGNMENTS');
    const row=item.assignments.map((a,i)=>{
      if(a.factor!==factors[i].name||!factors[i].values.includes(a.value))fail('INVALID_CASE_VALUE');
      return a.value;
    });
    const rowKey=JSON.stringify(row);
    if(seenRows.has(rowKey)) fail('DUPLICATE_DESIGN_CASE');
    seenRows.add(rowKey);
    const fresh=rowPairs(row).filter(p=>!covered.has(p));
    if(!fresh.length) fail('NO_INFORMATION_GAIN_CASE');
    if(item.new_pairs!==fresh.length)fail('INCORRECT_CASE_COVERAGE_INCREMENT');
    for(const p of rowPairs(row))covered.add(p);
  }
  const missing=[...allPairs].filter(p=>!covered.has(p)).sort();
  const consistent=design.version===synergyContract.version&&
   design.objective==='ALL_TWO_FACTOR_VALUE_COMBINATIONS'&&
   design.exhaustive_worlds===product&&
   design.total_pairs===allPairs.size&&design.covered_pairs===covered.size&&
   design.complete_design===(missing.length===0)&&JSON.stringify(design.missing_pairs)===JSON.stringify(missing)&&
   design.tests_executed===0&&design.canonical_promotion===false&&design.target_actions===false&&
   design.source_authenticated===false&&design.three_way_coverage_claim===false&&
   design.state===(missing.length===0?'COMPLETE_TEST_DESIGN_NOT_EXECUTED':'BOUNDED_INCOMPLETE_TEST_DESIGN');
  return {state:consistent?'DESIGN_REPLAY_CONSISTENT':'DESIGN_CLAIM_CONTRADICTED',
    independently_checked_pairs:allPairs.size, observed_covered_pairs:covered.size,
    missing_pairs:missing, method_execution:'NOT_EXECUTED',
    authenticated_source:false, independent_evidence:false};
}
