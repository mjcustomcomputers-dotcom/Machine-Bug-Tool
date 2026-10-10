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

test('missing auth driver reports setup required without creating configuration, account or receipt state', async t => {
  const service = fixture(t);
  const github = service.listConnections('PROJECT-CONNECTIONS').find(item => item.id === 'github');
  assert.equal(github.setup.adapter_state, 'NOT_INSTALLED');
  assert.equal(github.setup.primary_action, 'SETUP_INFO');

  const result = await service.setupConnection({
    project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN',
    account_id: 'RENDERER-CANNOT-ASSERT-THIS'
  });
  assert.equal(result.status, 'DRIVER_SETUP_REQUIRED');
  assert.equal(result.external_action_performed, false);
  assert.equal(result.configured, false);
  assert.equal(result.authenticated, false);
  assert.equal(result.last_operation_verified, false);
  assert.equal(service.store.listConnections('PROJECT-CONNECTIONS').length, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_connection_observations').get().count, 0);
  assert.equal(service.store.db.prepare('SELECT count(*) AS count FROM cc_operation_receipts').get().count, 0);
});

test('advertised auth driver owns sign-in identity and renderer receives no secret material', async t => {
  const calls = [];
  const secretSentinel = 'SECRET-AUTH-TOKEN-MUST-NOT-LEAK';
  const driver = {
    async begin(input) {
      calls.push(input);
      return {status: 'AUTHORIZING', attempt_id: 'ATTEMPT-1', adapter_state: 'INSTALLED',
        auth_state: 'AUTHORIZING', capability_state: 'NOT_DISCOVERED', access_token: secretSentinel,
        next_action: 'Finish provider-owned sign-in, then check status.', external_action_performed: true};
    },
    async status(input) {
      calls.push(input);
      return {status: 'SIGNED_IN_UNVERIFIED', attempt_id: 'ATTEMPT-1', adapter_state: 'INSTALLED',
        auth_state: 'ACCOUNT_OBSERVED', capability_state: 'DISCOVERED', account_label: 'observed@example.test',
        granted_scopes: ['repo:read'], refresh_token: secretSentinel,
        next_action: 'Choose one repository and run a protected read.'};
    }
  };
  const service = fixture(t, {connectionSetup: {
    providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'NOT_DISCOVERED',
      actions: ['SIGN_IN', 'STATUS', 'CANCEL']}},
    drivers: {GITHUB: driver}
  }});
  const advertised = service.listConnections('PROJECT-CONNECTIONS').find(item => item.id === 'github').setup;
  assert.equal(advertised.primary_action, 'SIGN_IN');
  assert.equal(advertised.primary_label, 'Sign in with GitHub');
  assert.deepEqual(advertised.actions, ['SIGN_IN', 'STATUS'], 'buttons require an implemented host handler');

  const started = await service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN',
    account_id: 'RENDERER-SPOOF', authorization_url: 'https://evil.invalid'});
  assert.equal(started.status, 'AUTHORIZING');
  assert.match(started.attempt_id, /^AUTH-[0-9a-f-]{36}$/u);
  assert.notEqual(started.attempt_id, 'ATTEMPT-1', 'the driver attempt stays host-only');
  assert.deepEqual(started.continuation_actions, ['STATUS']);
  assert.equal(started.last_operation_verified, false);
  assert.doesNotMatch(JSON.stringify(started), new RegExp(secretSentinel, 'u'));
  assert.deepEqual(calls[0], {provider: 'GITHUB', workspace_project_id: 'PROJECT-CONNECTIONS', action: 'SIGN_IN', attempt_id: null});

  const observed = await service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'STATUS',
    attempt_id: started.attempt_id});
  assert.equal(observed.status, 'SIGNED_IN_UNVERIFIED');
  assert.equal(observed.authenticated, true);
  assert.equal(observed.last_operation_verified, false);
  assert.equal(observed.account_label, 'Account observed');
  assert.deepEqual(observed.granted_scopes, []);
  assert.equal(observed.scope_details_withheld, true);
  assert.doesNotMatch(JSON.stringify(observed), new RegExp(secretSentinel, 'u'));
  assert.deepEqual(calls[1], {provider: 'GITHUB', workspace_project_id: 'PROJECT-CONNECTIONS', action: 'STATUS', attempt_id: 'ATTEMPT-1'});
  assert.equal(service.store.listConnections('PROJECT-CONNECTIONS').length, 0,
    'sign-in observation alone must not manufacture a configured or connected row');
});

test('auth broker rejects contradictory state, screens display fields and binds attempts to project and provider', async t => {
  let mode = 'START';
  const driver = {
    async begin() {
      return {status: 'AUTHORIZING', attempt_id: 'DRIVER-ATTEMPT', adapter_state: 'INSTALLED',
        auth_state: 'AUTHORIZING', capability_state: 'NOT_DISCOVERED', external_action_performed: true};
    },
    async status() {
      if (mode === 'CONTRADICT') return {status: 'SIGNED_IN_UNVERIFIED', adapter_state: 'INSTALLED',
        auth_state: 'SIGNED_OUT', capability_state: 'DISCOVERED'};
      return {status: 'SIGNED_IN_UNVERIFIED', adapter_state: 'INSTALLED', auth_state: 'ACCOUNT_OBSERVED',
        capability_state: 'DISCOVERED', account_label: 'sl.ABCDEFGHIJKLMNOPQRSTUVWXYZ-1234567890',
        granted_scopes: ['repo:read', 'github_pat_123456789012345678901234567890'],
        next_action: 'Use code ABCD-EFGH-IJKL-MNOP-QRST-UVWX'};
    }
  };
  const service = fixture(t, {connectionSetup: {
    providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'NOT_DISCOVERED',
      actions: ['SIGN_IN', 'STATUS']}}, drivers: {GITHUB: driver}
  }});
  service.createProject({project_id: 'PROJECT-OTHER', display_name: 'Other project'});

  const first = await service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'});
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-OTHER', provider: 'GITHUB', action: 'STATUS',
    attempt_id: first.attempt_id}), error => error?.code === 'MPC_WORKSPACE_CONNECTION_ATTEMPT_NOT_FOUND');
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GOOGLE_DRIVE', action: 'STATUS',
    attempt_id: first.attempt_id}), error => error?.code === 'MPC_WORKSPACE_CONNECTION_ATTEMPT_NOT_FOUND');

  mode = 'CONTRADICT';
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'STATUS',
    attempt_id: first.attempt_id}), error => error?.code === 'MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY');
  service.connectionSetupAttempts.get(first.attempt_id).expires_at_ms = 0;
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'STATUS',
    attempt_id: first.attempt_id}), error => error?.code === 'MPC_WORKSPACE_CONNECTION_ATTEMPT_NOT_FOUND');

  mode = 'START';
  const second = await service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'});
  mode = 'SAFE_COMPLETE';
  const completed = await service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'STATUS',
    attempt_id: second.attempt_id});
  assert.equal(completed.account_observed, true);
  assert.equal(completed.account_label, 'Account observed');
  assert.deepEqual(completed.granted_scopes, []);
  assert.equal(completed.scope_details_withheld, true);
  assert.match(completed.next_action, /protected read/u);
  assert.doesNotMatch(JSON.stringify(completed), /sl\.|github_pat_|ABCD-EFGH/iu);
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'STATUS',
    attempt_id: second.attempt_id}), error => error?.code === 'MPC_WORKSPACE_CONNECTION_ATTEMPT_NOT_FOUND');
});

test('adapter claims cannot manufacture receipt-backed capability and duplicate setup starts are serialized', async t => {
  let releaseStart;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  let starts = 0;
  const driver = {
    async begin() {
      starts += 1;
      await startGate;
      return {status: 'AUTHORIZING', attempt_id: 'SERIAL-ATTEMPT', adapter_state: 'INSTALLED',
        auth_state: 'AUTHORIZING', capability_state: 'NOT_DISCOVERED', external_action_performed: true};
    },
    async status() {
      return {status: 'SIGNED_IN_UNVERIFIED', attempt_id: 'SERIAL-ATTEMPT', adapter_state: 'INSTALLED',
        auth_state: 'ACCOUNT_OBSERVED', capability_state: 'DISCOVERED'};
    }
  };
  const service = fixture(t, {connectionSetup: {
    providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'RECEIPT_BACKED',
      actions: ['SIGN_IN', 'STATUS']}}, drivers: {GITHUB: driver}
  }});
  const descriptor = service.listConnections('PROJECT-CONNECTIONS').find(item => item.id === 'github').setup;
  assert.equal(descriptor.capability_state, 'DISCOVERED', 'catalog state is not protected-operation proof');

  const first = service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'});
  await Promise.resolve();
  await assert.rejects(service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'}),
    error => error?.code === 'MPC_WORKSPACE_CONNECTION_SETUP_IN_PROGRESS');
  assert.equal(starts, 1, 'only one provider-owned flow starts for repeated clicks');
  releaseStart();
  const started = await first;
  assert.equal(started.status, 'AUTHORIZING');
  assert.match(started.attempt_id, /^AUTH-/u);
});

test('auth broker replaces driver-thrown prose before it can reach the renderer', async t => {
  const secretSentinel = 'SECRET-OAUTH-ERROR-MUST-NOT-LEAK';
  const service = fixture(t, {connectionSetup: {
    providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'NOT_DISCOVERED',
      actions: ['SIGN_IN']}},
    drivers: {GITHUB: {async begin() {
      const error = Error(secretSentinel);
      error.code = 'MPC_WORKSPACE_DRIVER_TOKEN_SECRET';
      error.publicMessage = `Provider returned ${secretSentinel}`;
      error.nextAction = `Paste ${secretSentinel} into the renderer`;
      throw error;
    }}}
  }});
  await assert.rejects(
    service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'}),
    error => {
      const visible = JSON.stringify({code: error?.code, message: error?.publicMessage, next_action: error?.nextAction});
      assert.equal(error?.code, 'MPC_WORKSPACE_CONNECTION_DRIVER_FAILED');
      assert.match(error?.publicMessage, /could not complete/u);
      assert.match(error?.nextAction, /local GitHub connector log/u);
      assert.doesNotMatch(visible, new RegExp(secretSentinel, 'u'));
      return true;
    }
  );
  assert.equal(service.connectionSetupInFlight.size, 0, 'failed drivers release their in-flight reservation');
});

test('AUTHORIZING cannot claim a provider flow unless the driver confirms the external action', async t => {
  const service = fixture(t, {connectionSetup: {
    providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'NOT_DISCOVERED',
      actions: ['SIGN_IN']}},
    drivers: {GITHUB: {async begin() {
      return {status: 'AUTHORIZING', attempt_id: 'UNCONFIRMED-FLOW', adapter_state: 'INSTALLED',
        auth_state: 'AUTHORIZING', capability_state: 'NOT_DISCOVERED', external_action_performed: false};
    }}}
  }});
  await assert.rejects(
    service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'}),
    error => error?.code === 'MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY'
  );
  assert.equal(service.connectionSetupAttempts.size, 0);
  assert.equal(service.connectionSetupInFlight.size, 0);
});

test('AUTHORIZING requires an implemented status path even when cancel is available', async t => {
  for (const advertisedActions of [['SIGN_IN'], ['SIGN_IN', 'CANCEL']]) {
    await t.test(advertisedActions.join('+'), async subtest => {
      const driver = {
        async begin() {
          return {status: 'AUTHORIZING', attempt_id: 'UNRECOVERABLE-FLOW', adapter_state: 'INSTALLED',
            auth_state: 'AUTHORIZING', capability_state: 'NOT_DISCOVERED', external_action_performed: true};
        },
        ...(advertisedActions.includes('CANCEL') ? {async cancel() { return {status: 'CANCELLED'}; }} : {})
      };
      const service = fixture(subtest, {connectionSetup: {
        providers: {GITHUB: {adapter_state: 'INSTALLED', auth_state: 'SIGNED_OUT', capability_state: 'NOT_DISCOVERED',
          actions: advertisedActions}}, drivers: {GITHUB: driver}
      }});
      await assert.rejects(
        service.setupConnection({project_id: 'PROJECT-CONNECTIONS', provider: 'GITHUB', action: 'SIGN_IN'}),
        error => error?.code === 'MPC_WORKSPACE_CONNECTION_SETUP_STATE_CONTRADICTORY'
      );
      assert.equal(service.connectionSetupAttempts.size, 0);
    });
  }
});
