import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  createMpcWorkspaceAtlas,
  MPC_WORKSPACE_ATLAS_CANDIDATE_STATE
} from '../lib/mpc-workspace-atlas.mjs';

test('Workspace Atlas uses a private memory projection and exposes the complete verified inventory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpc-workspace-atlas-'));
  const persistentPath = join(directory, 'must-not-be-created.sqlite');
  const before = process.env.MPC_METHOD_ATLAS_DB;
  process.env.MPC_METHOD_ATLAS_DB = persistentPath;
  const atlas = createMpcWorkspaceAtlas();
  try {
    const status = atlas.status();
    const inventory = atlas.inventory();
    assert.equal(status.validation, 'STRUCTURAL_INVENTORY_PASS');
    assert.deepEqual(status.storage, {
      kind: 'SQLITE_MEMORY',
      locator: ':memory:',
      host_owned: true,
      persistent: false,
      canonical: false
    });
    assert.deepEqual(inventory.counts, {
      methods: 239,
      classifiers: 239,
      sources: 65,
      triggers: 478,
      proposed_crosswalk: 444,
      method_relations: 212,
      taxonomy_tags: 2597
    });
    assert.equal(inventory.semantic_parity.status, 'ATLAS_CONTENT_PARITY_PASS');
    assert.equal(inventory.semantic_parity.rows_checked, 4274);
    assert.equal(inventory.sources.length, 65);
    assert.equal(inventory.no_method_executed, true);
    assert.equal(inventory.source_authentication, false);
    assert.equal(inventory.canonical_promotion, false);
    assert.equal(existsSync(persistentPath), false);
  } finally {
    atlas.close();
    if (before === undefined) delete process.env.MPC_METHOD_ATLAS_DB;
    else process.env.MPC_METHOD_ATLAS_DB = before;
    rmSync(directory, {recursive: true, force: true});
  }
});

test('Workspace Atlas candidates preserve IDs and distinguish research hooks from execution', () => {
  const atlas = createMpcWorkspaceAtlas();
  try {
    const result = atlas.candidates();
    assert.equal(result.status, 'ATLAS_STRUCTURAL_INVENTORY');
    assert.equal(result.candidate_count, 239);
    assert.deepEqual(
      result.candidates.map(candidate => candidate.method_id),
      Array.from({length: 239}, (_, index) => `MHA-${String(index + 1).padStart(4, '0')}`)
    );
    assert.ok(result.candidates.every(candidate => (
      candidate.candidate_state === MPC_WORKSPACE_ATLAS_CANDIDATE_STATE
      && candidate.method_execution_performed === false
      && candidate.source_authentication === false
      && candidate.canonical_promotion === false
      && candidate.classifier.classifier_id === candidate.method_id.replace('MHA-', 'MHC-')
      && candidate.dimensions.length > 0
      && candidate.taxonomy.length > 0
    )));
    assert.equal(result.candidates[0].source.source_id, result.candidates[0].primary_source_id);
  } finally {
    atlas.close();
  }
});

test('Workspace Atlas facets and router stay bounded, typed, and explicitly not executed', async () => {
  const atlas = createMpcWorkspaceAtlas();
  try {
    const facets = atlas.facets();
    assert.ok(facets.dimensions.some(row => row.value === 'SYNTHESIS'));
    assert.ok(facets.families.length > 1);
    assert.ok(facets.taxonomy.some(row => row.axis === 'PURPOSE' && row.value === 'ROUTE'));
    assert.deepEqual(facets.domain_profiles, ['GENERAL', 'BUSINESS', 'GAMING']);
    assert.equal(facets.no_method_executed, true);

    const routed = await atlas.route({
      dimensions: ['GRAPH', 'DIAGNOSTIC'],
      source_refs: ['cc-source-001'],
      subject_ids: ['cc-project-001'],
      purpose: 'ROUTE',
      domain_profile: 'GENERAL',
      max_candidates: 4
    });
    assert.equal(routed.status, 'ATLAS_STRUCTURAL_CANDIDATES');
    assert.ok(routed.selected_count > 0 && routed.selected_count <= 4);
    assert.ok(routed.selected_methods.every(method => (
      method.candidate_state === MPC_WORKSPACE_ATLAS_CANDIDATE_STATE
      && method.route_state === 'STRUCTURAL_CANDIDATE'
      && method.execution_performed === false
    )));
    assert.deepEqual(
      routed.solid_state_checklist.map(stage => stage.stage),
      ['QUICK_SOLID_STATE', 'INDUCTION', 'REDUCTION', 'TRAVERSAL', 'TRANSFORMATION', 'SYNCHRONICITY', 'VERIFICATION']
    );
    assert.equal(routed.no_method_executed, true);
    assert.equal(routed.source_authentication, false);
    assert.equal(routed.canonical_promotion, false);

    await assert.rejects(() => atlas.route({
      dimensions: ['GRAPH', 'GRAPH'],
      source_refs: ['cc-source-001'],
      subject_ids: ['cc-project-001']
    }), /INVALID_TYPED_DIMENSIONS/);
  } finally {
    atlas.close();
  }
});

test('Workspace Atlas closes idempotently and all later reads fail closed', async () => {
  const atlas = createMpcWorkspaceAtlas({label: 'TEST_HOST_MEMORY'});
  assert.equal(atlas.close(), true);
  assert.equal(atlas.close(), false);
  assert.throws(() => atlas.status(), /MPC_WORKSPACE_ATLAS_CLOSED/);
  assert.throws(() => atlas.inventory(), /MPC_WORKSPACE_ATLAS_CLOSED/);
  assert.throws(() => atlas.candidates(), /MPC_WORKSPACE_ATLAS_CLOSED/);
  assert.throws(() => atlas.facets(), /MPC_WORKSPACE_ATLAS_CLOSED/);
  await assert.rejects(() => atlas.route({
    dimensions: ['GRAPH'],
    source_refs: ['cc-source-001'],
    subject_ids: ['cc-project-001']
  }), /MPC_WORKSPACE_ATLAS_CLOSED/);
});
