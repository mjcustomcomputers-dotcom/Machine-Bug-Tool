import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {MpcWorkspaceService} from '../lib/mpc-workspace-service.mjs';

function fixture(t, adapters = {}) {
  const dataRoot = mkdtempSync(join(tmpdir(), 'mpc-workspace-connections-regression-'));
  let tick = 0;
  const service = new MpcWorkspaceService({
    dataRoot,
    adapters,
    clock: () => new Date(Date.UTC(2026, 9, 9, 12, 0, tick++))
  });
  t.after(() => {
    service.close();
    rmSync(dataRoot, {recursive: true, force: true});
  });
  service.createProject({
    project_id: 'PROJECT-CONNECTIONS',
    display_name: 'Connection regression project',
    retention_policy: 'RETAIN_TEXT'
  });
  return service;
}

function configureGitHub(service, connectionId = 'github-regression') {
  return service.configureConnection({
    project_id: 'PROJECT-CONNECTIONS',
    configuration: {
      connection_id: connectionId,
      display_name: 'GitHub regression fixture',
      provider_namespace: 'GITHUB',
      transport: 'stdio',
      endpoint_or_command: 'github-mcp'
    }
  });
}

test('an ERROR result cannot become verified merely because it carries a native receipt', async t => {
  const service = fixture(t, {
    getConnectionContext: async () => ({host_id: 'HOST-ERROR', account_id: 'ACCOUNT-ERROR'}),
    connections: {
      GITHUB: async () => ({
        status: 'ERROR',
        receipt_id: 'NATIVE-ERROR-RECEIPT',
        error: {code: 'UPSTREAM_DENIED', message: 'The bounded read was denied.', category: 'ACCESS', http_status: 403}
      })
    }
  });
  const connection = configureGitHub(service);

  const result = await service.testConnection({
    project_id: 'PROJECT-CONNECTIONS',
    connection_id: connection.connection_id,
    operation: 'READ_REPOSITORY_FILE'
  });

  assert.equal(result.current_observation.status, 'ERROR');
  assert.equal(result.current_observation.receipt_id, 'NATIVE-ERROR-RECEIPT');
  assert.equal(result.assessment.status, 'CURRENT_OPERATION_ERROR');
  assert.equal(result.assessment.last_operation_verified, false);
  assert.equal(result.last_operation_verified, false);
  assert.equal(result.operation_receipt_id, null);
  const persisted = service.store.getConnection('PROJECT-CONNECTIONS', connection.connection_id);
  assert.equal(persisted.latest_observation.observation_state, 'FAILED');
  assert.equal(persisted.latest_observation.operation_receipt_id, null);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_operation_receipts').get().count, 0);
});

test('connection configuration rejects credential-bearing endpoint or command text before storage', t => {
  const service = fixture(t);

  assert.throws(() => service.configureConnection({
    project_id: 'PROJECT-CONNECTIONS',
    configuration: {
      connection_id: 'unsafe-endpoint',
      display_name: 'Unsafe endpoint',
      provider_namespace: 'GITHUB',
      transport: 'stdio',
      endpoint_or_command: 'github-mcp --token=ghp_12345678901234567890'
    }
  }), error => error?.code === 'MPC_WORKSPACE_CONNECTION_ENDPOINT_REJECTED');
  assert.equal(service.store.listConnections('PROJECT-CONNECTIONS').length, 0);
});

test('renderer-supplied identity cannot override the saved provider or host-owned context', async t => {
  let invokeCalls = 0;
  let invokedExpected = null;
  let invokedInput = null;
  const service = fixture(t, {
    getConnectionContext: async () => ({host_id: 'HOST-OWNED', account_id: 'ACCOUNT-OWNED'}),
    connections: {
      GITHUB: async (operationInput, expected) => {
        invokeCalls++;
        invokedInput = operationInput;
        invokedExpected = expected;
        return {status: 'SUCCESS', receipt_id: 'NATIVE-SUCCESS-RECEIPT'};
      }
    }
  });
  const connection = configureGitHub(service);

  await assert.rejects(service.testConnection({
    project_id: 'PROJECT-CONNECTIONS',
    connection_id: connection.connection_id,
    operation: 'READ_REPOSITORY_FILE',
    expected: {
      provider: 'DROPBOX',
      surface: 'RENDERER_ASSERTED_SURFACE',
      host_id: 'RENDERER-HOST',
      account_id: 'RENDERER-ACCOUNT',
      operation: 'WRITE_REPOSITORY_FILE'
    }
  }), error => error?.code === 'MPC_WORKSPACE_CONNECTION_EXPECTED_CONTEXT_REJECTED' && error?.status === 409);
  assert.equal(invokeCalls, 0);

  const result = await service.testConnection({
    project_id: 'PROJECT-CONNECTIONS',
    connection_id: connection.connection_id,
    operation: 'READ_REPOSITORY_FILE',
    operation_input: {
      provider: 'DROPBOX',
      host_id: 'RENDERER-HOST',
      account_id: 'RENDERER-ACCOUNT',
      selected_resource: 'owner/repository'
    }
  });

  const owned = {
    provider: 'GITHUB',
    surface: 'WINDOWS_LOCAL',
    host_id: 'HOST-OWNED',
    account_id: 'ACCOUNT-OWNED',
    operation: 'READ_REPOSITORY_FILE'
  };
  assert.deepEqual(result.expected, owned);
  assert.deepEqual(invokedExpected, owned);
  assert.deepEqual(result.current_observation.provider, owned.provider);
  assert.deepEqual(result.current_observation.surface, owned.surface);
  assert.deepEqual(result.current_observation.host_id, owned.host_id);
  assert.deepEqual(result.current_observation.account_id, owned.account_id);
  assert.equal(invokedInput.provider, 'DROPBOX');
  assert.equal(result.last_operation_verified, true);
});

test('a failed refresh preserves the prior receipt-backed success as last_success', async t => {
  let attempt = 0;
  const service = fixture(t, {
    getConnectionContext: async () => ({host_id: 'HOST-HISTORY', account_id: 'ACCOUNT-HISTORY'}),
    connections: {
      GITHUB: async () => {
        attempt++;
        if (attempt === 1) return {status: 'SUCCESS', receipt_id: 'NATIVE-SUCCESS-FIRST'};
        return {
          status: 'ERROR',
          receipt_id: 'NATIVE-FAILURE-SECOND',
          error: {code: 'SECOND_READ_FAILED', message: 'The second read failed.', category: 'OPERATION', http_status: 500}
        };
      }
    }
  });
  const connection = configureGitHub(service);
  const request = {
    project_id: 'PROJECT-CONNECTIONS',
    connection_id: connection.connection_id,
    operation: 'READ_REPOSITORY_FILE'
  };

  const succeeded = await service.testConnection(request);
  const failed = await service.testConnection(request);
  assert.equal(succeeded.last_operation_verified, true);
  assert.ok(succeeded.operation_receipt_id);
  assert.equal(failed.current_observation.status, 'ERROR');
  assert.equal(failed.last_operation_verified, false);
  assert.equal(failed.operation_receipt_id, null);

  const persisted = service.store.getConnection('PROJECT-CONNECTIONS', connection.connection_id);
  assert.equal(persisted.latest_observation.observation_state, 'FAILED');
  assert.equal(persisted.latest_observation.error_code, 'SECOND_READ_FAILED');
  assert.equal(persisted.last_success.observation_state, 'SUCCEEDED');
  assert.equal(persisted.last_success.operation_receipt_id, succeeded.operation_receipt_id);
  const publicConnection = service.listConnections('PROJECT-CONNECTIONS')
    .find(item => item.connection_id === connection.connection_id);
  assert.equal(publicConnection.current_observation.observation_state, 'FAILED');
  assert.equal(publicConnection.last_success.operation_receipt_id, succeeded.operation_receipt_id);
});
