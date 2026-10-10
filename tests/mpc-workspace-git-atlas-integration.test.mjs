import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {MpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

const content = '# Exact repository evidence\ncommit pinned\n';
const commit = 'a'.repeat(40);
const digest = createHash('sha256').update(content).digest('hex');

function fixtureAdapters() {
  let receiptSequence = 0;
  return {
      getConnectionContext: async () => ({host_id: 'WINDOWS-HOST-1', account_id: 'github:41'}),
      connections: {
        GITHUB: async () => ({
          schema_version: 'MPC_WORKSPACE_HOST_ADAPTERS_1',
          status: 'SUCCESS',
          receipt_id: `GITHUB-READ-RECEIPT-${++receiptSequence}`,
          observed_at_utc: '2026-10-10T12:00:00.000Z',
          resource: {
            owner: 'GITHUB',
            source_namespace: 'GITHUB',
            identity_namespace: 'mjcustomcomputers-dotcom/Machine-Bug-Tool',
            native_id_type: 'repository_path',
            native_id: 'mjcustomcomputers-dotcom/Machine-Bug-Tool:README.md',
            native_version: commit,
            native_locator: `https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/blob/${commit}/README.md`,
            repository: 'mjcustomcomputers-dotcom/Machine-Bug-Tool',
            path: 'README.md',
            git_blob_sha: 'b'.repeat(40)
          },
          content,
          content_sha256: digest,
          content_bytes: Buffer.byteLength(content),
          content_state: 'ACQUIRED_UTF8_TEXT',
          content_scope: 'SELECTED_FILE',
          read_only: true,
          source_content_is_untrusted_input: true,
          source_instructions_executed: false
        })
      }
    };
}

function serviceAt(dataRoot) {
  return new MpcWorkspaceService({
    dataRoot,
    clock: () => new Date('2026-10-10T12:00:00.000Z'),
    adapters: fixtureAdapters()
  });
}

test('commit-pinned GitHub reads become receipt-bound evidence and valid Atlas inputs across restart', async t => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-workspace-git-atlas-'));
  t.after(() => rmSync(dataRoot, {recursive:true, force:true}));
  let service = serviceAt(dataRoot);
  service.createProject({project_id:'GIT-ATLAS-PROJECT', display_name:'Git and Atlas', retention_policy:'RETAIN_TEXT'});
  const connection = service.configureConnection({project_id:'GIT-ATLAS-PROJECT', configuration:{
    connection_id:'GITHUB-SELECTED', display_name:'GitHub', provider_namespace:'GITHUB',
    transport:'PLUGIN', endpoint_or_command:'https://api.github.com'
  }});

  const observed = await service.testConnection({project_id:'GIT-ATLAS-PROJECT',
    connection_id:connection.connection_id, operation:'READ_SELECTED_RESOURCE', operation_input:{
      repository:'mjcustomcomputers-dotcom/Machine-Bug-Tool', ref:'main', path:'README.md', include_content:true
    }});
  assert.equal(observed.last_operation_verified, true);
  assert.match(observed.read_handle, /^READ-/u);
  assert.equal(observed.evidence_acquisition_available, true);
  const receipt = service.store.db.prepare('SELECT * FROM cc_operation_receipts WHERE receipt_id=?')
    .get(observed.operation_receipt_id);
  assert.equal(receipt.subject_source_id, null);
  assert.equal(receipt.receipt_origin, 'NATIVE_CONNECTOR');
  assert.equal(observed.evidence_source_id, null);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?')
    .get('GIT-ATLAS-PROJECT').count, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_artifacts WHERE project_id=?')
    .get('GIT-ATLAS-PROJECT').count, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_retained_documents WHERE project_id=?')
    .get('GIT-ATLAS-PROJECT').count, 0);

  const selected = service.acquireConnectionRead({project_id:'GIT-ATLAS-PROJECT', read_handle:observed.read_handle});
  assert.equal(selected.status, 'SELECTED_AS_EVIDENCE');
  assert.equal(selected.source.source_owner, 'GITHUB');
  assert.equal(selected.source.source_namespace, 'GITHUB');
  assert.equal(selected.source.native_version, commit);
  assert.match(selected.evidence_binding_receipt_id, /^RECEIPT-/u);
  const bindingReceipt = service.store.db.prepare('SELECT * FROM cc_operation_receipts WHERE receipt_id=?')
    .get(selected.evidence_binding_receipt_id);
  assert.equal(bindingReceipt.subject_source_id, selected.source.source_id);
  assert.equal(bindingReceipt.receipt_origin, 'LOCAL');
  assert.equal(bindingReceipt.native_receipt_ref, receipt.native_receipt_ref);
  assert.equal(service.acquireConnectionRead({project_id:'GIT-ATLAS-PROJECT', read_handle:observed.read_handle}).reused, true);
  assert.equal(service.acquisitions('GIT-ATLAS-PROJECT', [selected.acquisition_id])[0].workflow_record.content, content);

  const observedAgain = await service.testConnection({project_id:'GIT-ATLAS-PROJECT',
    connection_id:connection.connection_id, operation:'READ_SELECTED_RESOURCE', operation_input:{
      repository:'mjcustomcomputers-dotcom/Machine-Bug-Tool', ref:'main', path:'README.md', include_content:true
    }});
  const selectedAgain = service.acquireConnectionRead({
    project_id:'GIT-ATLAS-PROJECT', read_handle:observedAgain.read_handle
  });
  assert.equal(selectedAgain.source.source_id, selected.source.source_id);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_sources WHERE project_id=?')
    .get('GIT-ATLAS-PROJECT').count, 1);
  const repeatedBinding = service.store.db.prepare('SELECT * FROM cc_operation_receipts WHERE receipt_id=?')
    .get(selectedAgain.evidence_binding_receipt_id);
  const expectedRepeatedBindingHash = createHash('sha256').update(`${JSON.stringify({
    schema_version:'MPC_WORKSPACE_CONNECTOR_EVIDENCE_SELECTION_1',
    protected_operation_receipt_id:observedAgain.operation_receipt_id,
    subject_source_id:selected.source.source_id,
    content_sha256:digest,
    retention_policy:'RETAIN_TEXT'
  }, null, 2)}\n`).digest('hex');
  assert.equal(repeatedBinding.subject_source_id, selected.source.source_id);
  assert.equal(repeatedBinding.receipt_sha256, expectedRepeatedBindingHash);

  const routed = await service.routeMethodAtlas({
    project_id:'GIT-ATLAS-PROJECT', dimensions:['CONNECTOR','VERIFICATION'],
    source_refs:[selected.source.source_id], subject_ids:['REPOSITORY:Machine-Bug-Tool'],
    domain_profile:'GENERAL', max_candidates:4, purpose:null
  });
  assert.ok(routed.selected_count > 0 && routed.selected_count <= 4);
  assert.equal(routed.no_method_executed, true);
  assert.equal(routed.canonical_records_changed, false);
  assert.deepEqual(routed.source_bindings.map(row => row.native_version), [commit]);
  assert.ok(routed.selected_methods.every(method => method.candidate_state === 'STRUCTURAL CANDIDATE · NOT EXECUTED'));

  service.createProject({project_id:'OTHER-PROJECT', display_name:'Other', retention_policy:'RETAIN_TEXT'});
  await assert.rejects(service.routeMethodAtlas({project_id:'OTHER-PROJECT', dimensions:['CONNECTOR'],
    source_refs:[selected.source.source_id], subject_ids:['REPOSITORY:Machine-Bug-Tool']}),
  error => error?.code === 'MPC_WORKSPACE_ATLAS_SOURCE_NOT_IN_PROJECT' && error?.status === 409);
  assert.throws(() => service.acquireConnectionRead({project_id:'OTHER-PROJECT', read_handle:observed.read_handle}),
    error => error?.code === 'MPC_WORKSPACE_CONNECTOR_READ_PROJECT_MISMATCH');

  service.close();
  service = serviceAt(dataRoot);
  t.after(() => service.close());
  const detail = service.projectDetail('GIT-ATLAS-PROJECT');
  assert.equal(detail.evidence[0].source_owner, 'GITHUB');
  assert.equal(detail.evidence[0].native_version, commit);
  assert.equal(detail.evidence[0].retention_state, 'TEXT_RETAINED');
  assert.equal(service.acquisitions('GIT-ATLAS-PROJECT').some(row => row.workflow_record.content === content), true);
  const bootstrap = await service.bootstrap();
  assert.equal(bootstrap.method_inventory.research_methods, 239);
  assert.equal(bootstrap.method_inventory.implemented_evaluators, 24);
  assert.equal(bootstrap.atlas_status.semantic_parity.rows_checked, 4274);
});

test('rejected and expired connector handles never persist candidate evidence', async t => {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-workspace-git-handle-'));
  t.after(() => rmSync(dataRoot, {recursive:true, force:true}));
  let currentTime = Date.parse('2026-10-10T12:00:00.000Z');
  const service = new MpcWorkspaceService({
    dataRoot,
    clock: () => new Date(currentTime),
    adapters: fixtureAdapters()
  });
  t.after(() => service.close());
  service.createProject({project_id:'HANDLE-PROJECT', display_name:'Handle boundary', retention_policy:'RETAIN_TEXT'});
  const connection = service.configureConnection({project_id:'HANDLE-PROJECT', configuration:{
    connection_id:'GITHUB-HANDLE', display_name:'GitHub', provider_namespace:'GITHUB',
    transport:'PLUGIN', endpoint_or_command:'https://api.github.com'
  }});
  const observed = await service.testConnection({project_id:'HANDLE-PROJECT',
    connection_id:connection.connection_id, operation:'READ_SELECTED_RESOURCE', operation_input:{
      repository:'mjcustomcomputers-dotcom/Machine-Bug-Tool', ref:'main', path:'README.md', include_content:true
    }});
  assert.throws(() => service.acquireConnectionRead({project_id:'HANDLE-PROJECT', read_handle:'READ-NOT-ISSUED'}),
    error => error?.code === 'MPC_WORKSPACE_CONNECTOR_READ_HANDLE_EXPIRED');
  currentTime += (11 * 60 * 1000);
  assert.throws(() => service.acquireConnectionRead({project_id:'HANDLE-PROJECT', read_handle:observed.read_handle}),
    error => error?.code === 'MPC_WORKSPACE_CONNECTOR_READ_HANDLE_EXPIRED');
  for (const table of ['cc_sources', 'cc_artifacts', 'cc_retained_documents']) {
    assert.equal(service.store.db.prepare(`SELECT count(*) AS count FROM ${table} WHERE project_id=?`)
      .get('HANDLE-PROJECT').count, 0, table);
  }
});
