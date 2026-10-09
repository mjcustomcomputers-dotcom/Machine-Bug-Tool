import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createSecurityAssistant} from '../lib/security-assistant.mjs';

const original = JSON.parse(readFileSync(new URL('./fixtures/atomic-owner-variation.json', import.meta.url), 'utf8'));

// The existing atomic contract reports execution_complete:false in PLAN mode.
// A typed compatibility route must not promote that same incomplete execution.
function documentFor(mode) {
  const atomic = {...structuredClone(original), mode};
  const route = {
    problem: 'Synthetic owner identity comparison with explicitly requested atomic review.',
    object_id: atomic.object_id,
    unit_of_analysis: 'One synthetic source-owned object.',
    domain_profile: 'GENERAL',
    sources: [{id: 'FIXTURE', owner: 'fixture-author', type: 'SYNTHETIC_FIXTURE',
      version: '1', time: '2026-10-09T00:00:00Z',
      native_locator: 'tests/fixtures/atomic-owner-variation.json'}],
    structures: [{id: 'SOURCE', type: 'SOURCE_RECORD', subject_ids: [atomic.object_id], source_refs: ['FIXTURE']}],
    questions: [{id: 'OWNER-QUESTION', kind: 'SOURCE_AUTHORITY',
      invariant: 'The synthetic owner comparison must use its declared source.',
      structure_ids: ['SOURCE'], rule_source_refs: ['FIXTURE'],
      necessity: 'REQUIRED', applicability: 'APPLIES', lenses: []}],
    atomic_review: atomic,
  };
  const legacy = {
    namespace: 'SYNTHETIC', object_id: atomic.object_id, actor: 'fixture-author',
    action: 'Review supplied owner data.', state_before: 'ACQUIRED', state_after: 'ANALYSIS_REQUESTED',
    channel: 'LOCAL_TEST', invariant: 'Atomic completion survives every supported entry point.',
    context: 'Synthetic compatibility route supplied explicitly.', routing: route,
  };
  return {atomic, route, legacy};
}

async function setup(t, mode) {
  const workspace = mkdtempSync(path.join(tmpdir(), 'mpc-completion-test-'));
  t.after(() => rmSync(workspace, {recursive: true, force: true}));
  const document = documentFor(mode);
  writeFileSync(path.join(workspace, 'completion.json'), JSON.stringify(document));
  const engine = await createSecurityAssistant({workspaceRoot: workspace});
  const acquired = await engine.callTool('assistant_acquire', {
    relative_path: 'completion.json', engagement_id: 'MPC-SELF-REVIEW', owner: 'fixture-author',
    source_identity: {namespace: 'SYNTHETIC', native_id_type: 'string', native_id: 'completion-fixture'},
    subject_identity: {namespace: 'SYNTHETIC', native_id_type: 'string', native_id: original.object_id},
    declared_version: '1', source_kind: 'SYNTHETIC_FIXTURE',
  });
  return {engine, acquired, document};
}

const decision = analysis_id => ({analysis_id, disposition: 'READY_FOR_REVIEW',
  rationale: 'Review the exact synthetic result.', falsifier: 'An unexecuted model defeats a completion claim.',
  limitations: ['Synthetic local fixture; no target evidence or authority.'],
  next_action: 'Retain the concrete control result.'});

test('direct incomplete atomic review cannot create a stored ANALYZED receipt', async t => {
  const {engine, acquired} = await setup(t, 'PLAN');
  const result = await engine.callTool('assistant_analyze', {
    acquisition_id: acquired.receipt_id, tool_name: 'review_atomic_variants', arguments_pointer: '/atomic',
  });
  assert.equal(result.native_result.status, 'ATOMIC_METHOD_REVIEW');
  assert.equal(result.native_result.execution_complete, false);
  assert.equal(result.status, 'ANALYSIS_INCOMPLETE');
  assert.equal(result.stage, 'ACQUIRED');
  assert.equal((await engine.callTool('assistant_status', {})).session.analyses, 0);
});

for (const [tool_name, arguments_pointer, inputKey] of [
  ['route_problem', '/route', 'route'],
  ['analyze_business_logic', '/legacy', 'legacy'],
  ['business_logic_sweep', '/legacy', 'legacy'],
]) {
  test(`${tool_name} cannot hide an incomplete nested atomic review`, async t => {
    const {engine, acquired, document} = await setup(t, 'PLAN');
    const native = (await engine.callTool(tool_name, document[inputKey])).result;
    assert.equal(native.status, 'UMTB4_ROUTING_RECEIPT');
    assert.equal(native.atomic_review.status, 'ATOMIC_METHOD_REVIEW');
    assert.equal(native.atomic_review.execution_complete, false);
    const result = await engine.callTool('assistant_analyze', {
      acquisition_id: acquired.receipt_id, tool_name, arguments_pointer,
    });
    assert.equal(result.status, 'ANALYSIS_INCOMPLETE');
    assert.equal(result.stage, 'ACQUIRED');
    assert.equal((await engine.callTool('assistant_status', {})).session.analyses, 0);
    await assert.rejects(engine.callTool('assistant_decide', decision(acquired.receipt_id)), /ANALYZED_RECEIPT_REQUIRED/);
  });
}

test('a completed routed owner counterexample remains reviewable despite false model assertions', async t => {
  const {engine, acquired} = await setup(t, 'EXECUTE_SUPPLIED_MODELS');
  const result = await engine.callTool('assistant_analyze', {
    acquisition_id: acquired.receipt_id, tool_name: 'route_problem', arguments_pointer: '/route',
  });
  assert.equal(result.stage, 'ANALYZED');
  const atomic = result.result.atomic_review;
  assert.equal(atomic.execution_complete, true);
  assert.equal(atomic.variants[0].status, 'MODEL_COUNTEREXAMPLE_CANDIDATE');
  assert.equal(atomic.variants[0].model_results[0].receipt.result.native_key_match, false);
  const decided = await engine.callTool('assistant_decide', decision(result.receipt_id));
  assert.equal(decided.stage, 'DECIDED');
  assert.equal(decided.finding_adopted, false);
  assert.equal(decided.external_action_authorized, false);
});
