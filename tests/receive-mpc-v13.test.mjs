import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {inspectReceiveSource, parseReceiveArguments, publishReceiveReceipt, receiveController} from '../scripts/receive-mpc-v13.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'scripts/receive-mpc-v13.mjs');
const g = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(fn) {
  const directory = mkdtempSync(join(tmpdir(), 'mpc receive test '));
  const repository = join(directory, 'repository with spaces');
  try {
    const commit = g(ROOT, 'rev-parse', 'HEAD');
    // A connector-restored checkout may omit unrelated parent history. Reuse
    // exact local objects in an isolated test repository without a clone walk.
    mkdirSync(repository); g(repository, 'init', '--quiet');
    const objectDirectory = resolve(ROOT, g(ROOT, 'rev-parse', '--git-path', 'objects'));
    mkdirSync(join(repository, '.git/objects/info'), {recursive: true});
    writeFileSync(join(repository, '.git/objects/info/alternates'), objectDirectory + '\n');
    g(repository, 'update-ref', 'refs/heads/receiver-test', commit);
    g(repository, '-c', 'core.autocrlf=false', 'checkout', '--detach', commit);
    return fn({directory, repository, commit});
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

function commitFiles(repository, message) {
  g(repository, 'add', '--all');
  g(repository, '-c', 'user.name=MPC receiver test', '-c', 'user.email=receiver-test@example.invalid', 'commit', '-m', message);
  return g(repository, 'rev-parse', 'HEAD');
}

test('receiver accepts only its explicit command/argument contract and full object IDs', () => {
  assert.equal(parseReceiveArguments([]).command, 'help');
  const options = parseReceiveArguments(['receive', '--repository', 'C:\\MPC source', '--reporting-commit', 'a'.repeat(40),
    '--destination', 'D:\\MPC received', '--caller-shell', 'PowerShell 5.1']);
  assert.equal(options.destination, 'D:\\MPC received');
  for (const argv of [
    ['init'], ['receive', '--repository', ROOT, '--reporting-commit', 'HEAD', '--destination', 'unused'],
    ['inspect', '--repository', ROOT, '--reporting-commit', 'a'.repeat(40), '--destination', 'unused'],
    ['inspect', '--repository', ROOT, '--reporting-commit', 'a'.repeat(40), '--repository', ROOT],
    ['inspect', '--repository', ROOT, '--reporting-commit'],
    ['receive', '--repository', ROOT, '--reporting-commit', 'a'.repeat(40)],
  ]) assert.throws(() => parseReceiveArguments(argv), /RECEIVER_/);
});

test('inspect reads exact Git objects without creating a worktree or changing dirty source files', () => fixture(({directory, repository, commit}) => {
  const marker = join(repository, 'uncommitted user work.txt');
  writeFileSync(marker, 'preserve me\n');
  const worktrees = g(repository, 'worktree', 'list', '--porcelain');
  const result = inspectReceiveSource({repository, reportingCommit: commit});
  assert.equal(result.observation.state.bytes, 591514);
  assert.equal(result.observation.state.sha256, 'd8ccd726902541cec0e468a0c3354781b7dadeecec1cc66754c20a13ba3d4508');
  assert.equal(result.executableCommit, '4ffde83e587db829b9cd2124c0a8587e868402d6');
  assert.equal(result.observation.restored_state_semantically_verified, false);
  assert.equal(g(repository, 'worktree', 'list', '--porcelain'), worktrees);
  assert.equal(readFileSync(marker, 'utf8'), 'preserve me\n');
  assert.equal(existsSync(join(directory, 'received')), false);
}));

test('receive preserves exact saved bytes, complete history and dirty source with spaces and UTF-8 under autocrlf', () => fixture(({directory, repository, commit}) => {
  g(repository, 'config', '--local', 'core.autocrlf', 'true');
  const marker = join(repository, 'uncommitted user work.txt'); writeFileSync(marker, 'retained\n');
  const sourceStatus = g(repository, 'status', '--porcelain=v1', '--untracked-files=all');
  const destination = join(directory, "received Ω [V13] ' $();");
  const result = receiveController({repository, reportingCommit: commit, destination, callerShell: 'test argv only'});
  assert.equal(result.status, 'LOCAL_CONTROLLER_RECEIVE_PASS');
  assert.equal(result.historical_controller_executable_commit, '4ffde83e587db829b9cd2124c0a8587e868402d6');
  assert.equal(g(destination, 'rev-parse', 'HEAD'), result.historical_controller_executable_commit);
  assert.equal(sha(readFileSync(result.restored_state_path)), result.state.sha256);
  assert.equal(readFileSync(result.restored_state_path).length, 591514);
  assert.equal(existsSync(result.restored_state_path + '.history'), false);
  assert.equal(result.next_controller_action, null);
  assert.deepEqual(result.commands.map(c => [c.command, c.exit_status]), [['verify', 0], ['status', 0], ['next', 0]]);
  for (const command of result.commands.slice(1)) {
    const body = JSON.parse(command.stdout);
    assert.equal(body.status, 'COMPLETE'); assert.equal(body.completed_current_tasks, 4); assert.equal(body.retained_receipts, 6);
  }
  assert.equal(result.new_controller_events, 0); assert.equal(result.new_model_calls, 0);
  assert.equal(result.host.windows_execution, process.platform === 'win32');
  assert.equal(result.host.caller_shell_evidence, 'CALLER_SUPPLIED_LABEL');
  assert.equal(result.original_checkout_observation_unchanged, true);
  assert.equal(g(repository, 'status', '--porcelain=v1', '--untracked-files=all'), sourceStatus);
  assert.equal(g(repository, 'config', '--local', 'core.autocrlf'), 'true');
  assert.equal(readFileSync(marker, 'utf8'), 'retained\n');
  assert.equal(existsSync(join(destination, 'node_modules')), false);
  assert.deepEqual(JSON.parse(readFileSync(result.receipt_path, 'utf8')), result);
}));

test('occupied and source-contained destinations are rejected without changing their contents', () => fixture(({directory, repository, commit}) => {
  const destination = join(directory, 'occupied'); mkdirSync(destination); writeFileSync(join(destination, 'keep'), 'original');
  const before = g(repository, 'worktree', 'list', '--porcelain');
  assert.throws(() => receiveController({repository, reportingCommit: commit, destination}), /RECEIVER_DESTINATION_ALREADY_EXISTS/);
  assert.equal(readFileSync(join(destination, 'keep'), 'utf8'), 'original');
  assert.throws(() => receiveController({repository, reportingCommit: commit, destination: join(repository, 'nested')}), /RECEIVER_DESTINATION_MUST_BE_OUTSIDE/);
  assert.equal(existsSync(join(repository, 'nested')), false);
  assert.equal(g(repository, 'worktree', 'list', '--porcelain'), before);
}));

test('symlink or junction destination ancestors reject before worktree creation', () => fixture(({directory, repository, commit}) => {
  const outside = join(directory, 'outside'); mkdirSync(outside);
  const alias = join(directory, 'alias'); symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const before = g(repository, 'worktree', 'list', '--porcelain');
  assert.throws(() => receiveController({repository, reportingCommit: commit, destination: join(alias, 'received')}), /RECEIVER_SYMLINK_PATH_REJECTED/);
  assert.equal(existsSync(join(outside, 'received')), false);
  assert.equal(g(repository, 'worktree', 'list', '--porcelain'), before);
}));

test('reporting metadata mismatch and tampered state fail before any destination is created', () => fixture(({directory, repository, commit}) => {
  const manifestPath = join(repository, 'connector-bridge/codex-resume-v13.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.tested_execution_commit = 'a'.repeat(40); writeFileSync(manifestPath, JSON.stringify(manifest));
  const mismatch = commitFiles(repository, 'synthetic mismatched receive manifest');
  const destination = join(directory, 'must stay absent');
  assert.throws(() => receiveController({repository, reportingCommit: mismatch, destination}), /RECEIVER_EXECUTABLE_COMMIT_DISAGREEMENT/);
  assert.equal(existsSync(destination), false);
  g(repository, 'checkout', '--detach', commit);
  const statePath = join(repository, 'docs/validation/MPC-V13-OPERATIVE-STATE.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')); state.revision += 1;
  writeFileSync(statePath, JSON.stringify(state));
  const tampered = commitFiles(repository, 'synthetic altered state bytes');
  assert.throws(() => receiveController({repository, reportingCommit: tampered, destination}), /RECEIVER_STATE_IDENTITY_MISMATCH/);
  assert.equal(existsSync(destination), false);
}));

test('a controller child failure produces a failed receipt and preserves the copied state', () => fixture(({directory, repository, commit}) => {
  // Deliberately invalid receiver fixture; this never updates or claims the real saved controller.
  g(repository, 'checkout', '--detach', '4ffde83e587db829b9cd2124c0a8587e868402d6');
  writeFileSync(join(repository, 'scripts/noahs-ark-controller-cli.mjs'), "process.stderr.write('synthetic receiver child failure\\n'); process.exit(17);\n");
  const faultSource = commitFiles(repository, 'synthetic failing controller executable');
  const faultTree = g(repository, 'rev-parse', 'HEAD^{tree}');
  g(repository, 'checkout', '--detach', commit);
  const statePath = join(repository, 'docs/validation/MPC-V13-OPERATIVE-STATE.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8')); state.config.source_revision.commit = faultSource;
  const stateBytes = Buffer.from(JSON.stringify(state) + '\n'); writeFileSync(statePath, stateBytes);
  const manifestPath = join(repository, 'connector-bridge/codex-resume-v13.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.tested_execution_commit = faultSource; manifest.tested_execution_tree = faultTree;
  manifest.preserved_state.git_blob = g(repository, 'hash-object', statePath);
  manifest.preserved_state.exact_file_sha256 = sha(stateBytes); writeFileSync(manifestPath, JSON.stringify(manifest));
  const validationPath = join(repository, 'docs/validation/MPC-V13-VALIDATION.json');
  const validation = JSON.parse(readFileSync(validationPath, 'utf8')); validation.tested_commit = faultSource; validation.tested_tree = faultTree;
  writeFileSync(validationPath, JSON.stringify(validation));
  const reporting = commitFiles(repository, 'synthetic receiver error-path metadata');
  const destination = join(directory, 'failed receive');
  let error;
  try { receiveController({repository, reportingCommit: reporting, destination}); }
  catch (caught) { error = caught; }
  assert.equal(error?.code, 'RECEIVER_CONTROLLER_COMMAND_FAILED');
  assert.equal(error.receipt.status, 'LOCAL_CONTROLLER_RECEIVE_FAILED');
  assert.equal(error.receipt.restored_state_semantically_verified, false);
  assert.equal(error.receipt.commands.length, 1); assert.equal(error.receipt.commands[0].exit_status, 17);
  assert.deepEqual(readFileSync(error.receipt.restored_state_path), stateBytes);
  const savedReceipt = JSON.parse(readFileSync(join(destination, '.sites-runtime/receive-v13/receipt.json'), 'utf8'));
  assert.equal(savedReceipt.status, 'LOCAL_CONTROLLER_RECEIVE_FAILED');
  assert.equal(existsSync(error.receipt.restored_state_path + '.history'), false);
}));

test('receiver CLI propagates a rejected input as nonzero structured output', () => {
  const child = spawnSync(process.execPath, [CLI, 'inspect', '--repository', ROOT, '--reporting-commit', 'HEAD'], {encoding: 'utf8'});
  assert.equal(child.status, 1); assert.equal(child.stdout, '');
  assert.equal(JSON.parse(child.stderr).status, 'LOCAL_CONTROLLER_RECEIVE_FAILED');
});

test('receipt publication never exposes PASS after a staged flush failure or overwrites an occupied path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpc receipt publication '));
  const path = join(directory, 'receipt.json');
  try {
    assert.throws(() => publishReceiveReceipt(path, {status: 'LOCAL_CONTROLLER_RECEIVE_PASS'}, {
      sync: () => { throw Error('synthetic fsync failure'); },
    }), /synthetic fsync failure/);
    assert.equal(existsSync(path), false);
    writeFileSync(path, 'existing receipt');
    assert.throws(() => publishReceiveReceipt(path, {status: 'LOCAL_CONTROLLER_RECEIVE_PASS'}), /EEXIST/);
    assert.equal(readFileSync(path, 'utf8'), 'existing receipt');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
