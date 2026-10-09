// Restore the existing saved V13 controller into a new, isolated local worktree.
// Git object reads and byte writes stay in Node; shell text is never evaluated.
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, parse, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isPathWithin} from '../lib/local-path-boundary.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 2_000_000;
const PATHS = Object.freeze({
  manifest: 'connector-bridge/codex-resume-v13.json',
  validation: 'docs/validation/MPC-V13-VALIDATION.json',
  state: 'docs/validation/MPC-V13-OPERATIVE-STATE.json',
  controller: 'scripts/noahs-ark-controller-cli.mjs',
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, detail = '') => { throw Object.assign(new Error(code), {code, detail}); };
const objectId = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function git(repository, args, options = {}) {
  try {
    return execFileSync('git', args, {cwd: repository, encoding: 'buffer', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: MAX_BYTES + 65_536, ...options});
  } catch (error) {
    fail('RECEIVER_GIT_COMMAND_FAILED', {arguments: args, exit_status: error.status ?? null,
      error: String(error.stderr ?? error.message).slice(0, 4000)});
  }
}

function readBlob(repository, commit, path) {
  const spec = `${commit}:${path}`;
  const size = Number(git(repository, ['cat-file', '-s', spec]).toString().trim());
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) fail('RECEIVER_OBJECT_SIZE', path);
  const bytes = git(repository, ['cat-file', 'blob', spec]);
  if (bytes.length !== size) fail('RECEIVER_OBJECT_SIZE_CHANGED', path);
  return {path, blob: git(repository, ['rev-parse', '--verify', spec]).toString().trim(),
    bytes, sha256: hash(bytes), size};
}

function jsonObject(blob) {
  let result;
  try { result = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(blob.bytes)); }
  catch { fail('RECEIVER_INVALID_UTF8_JSON', blob.path); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) fail('RECEIVER_JSON_OBJECT_REQUIRED', blob.path);
  return result;
}

function noSymlinkAncestors(full) {
  const absolute = resolve(full);
  let cursor = parse(absolute).root;
  for (const component of relative(cursor, absolute).split(sep).filter(Boolean)) {
    cursor = join(cursor, component);
    try {
      if (lstatSync(cursor).isSymbolicLink()) fail('RECEIVER_SYMLINK_PATH_REJECTED', cursor);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function exclusiveBytes(path, bytes, {sync = fsyncSync, onCreated = () => {}} = {}) {
  noSymlinkAncestors(path);
  const descriptor = openSync(path, 'wx', 0o600);
  try { onCreated(); writeFileSync(descriptor, bytes); sync(descriptor); }
  finally { closeSync(descriptor); }
  if (!readFileSync(path).equals(bytes)) fail('RECEIVER_WRITE_READBACK_MISMATCH', path);
}

// An exclusive hard link publishes an already flushed and verified same-directory
// file without replacing an existing receipt. No final PASS path exists while
// staging can still fail. NTFS and ordinary Linux filesystems support this.
export function publishReceiveReceipt(path, receipt, {sync = fsyncSync} = {}) {
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  const pending = path + '.pending-' + randomUUID();
  let published = false, stagingCreated = false, ownFile;
  try {
    exclusiveBytes(pending, bytes, {sync, onCreated: () => { stagingCreated = true; }});
    ownFile = lstatSync(pending);
    noSymlinkAncestors(path);
    linkSync(pending, path);
    published = true;
    if (!readFileSync(path).equals(bytes)) fail('RECEIVER_RECEIPT_READBACK_MISMATCH');
  } catch (error) {
    if (published) {
      try {
        const current = lstatSync(path);
        if (current.dev === ownFile.dev && current.ino === ownFile.ino) unlinkSync(path);
      } catch (cleanupError) { error.final_receipt_cleanup_error = cleanupError.message; }
    }
    throw error;
  } finally {
    if (stagingCreated) {
      try { unlinkSync(pending); } catch { /* Any unremoved staging file remains explicitly provisional. */ }
    }
  }
}

export function parseReceiveArguments(argv) {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0]))) return {command: 'help'};
  const [command, ...args] = argv;
  if (!['inspect', 'receive'].includes(command)) fail('RECEIVER_COMMAND_NOT_ALLOWED', command);
  const options = {command};
  const names = new Map([['--repository', 'repository'], ['--reporting-commit', 'reportingCommit'],
    ['--destination', 'destination'], ['--caller-shell', 'callerShell']]);
  for (let index = 0; index < args.length; index += 2) {
    const name = names.get(args[index]);
    if (!name || typeof args[index + 1] !== 'string' || args[index + 1].length === 0 || Object.hasOwn(options, name)) {
      fail('RECEIVER_INVALID_ARGUMENTS', args[index]);
    }
    options[name] = args[index + 1];
  }
  if (!options.repository || !objectId(options.reportingCommit)) fail('RECEIVER_REPOSITORY_AND_EXACT_COMMIT_REQUIRED');
  if (command === 'receive' && !options.destination) fail('RECEIVER_UNUSED_DESTINATION_REQUIRED');
  if (command === 'inspect' && options.destination) fail('RECEIVER_INSPECT_HAS_NO_DESTINATION');
  if (options.callerShell && (options.callerShell.length > 160 || /[\r\n\0]/.test(options.callerShell))) fail('RECEIVER_INVALID_CALLER_LABEL');
  return options;
}

export function inspectReceiveSource({repository, reportingCommit, callerShell}) {
  if (!objectId(reportingCommit)) fail('RECEIVER_EXACT_COMMIT_REQUIRED');
  const repositoryPath = realpathSync(resolve(repository));
  const top = realpathSync(git(repositoryPath, ['rev-parse', '--show-toplevel']).toString().trim());
  if (top !== repositoryPath) fail('RECEIVER_REPOSITORY_ROOT_REQUIRED', top);
  const resolved = git(top, ['rev-parse', '--verify', `${reportingCommit}^{commit}`]).toString().trim();
  if (resolved !== reportingCommit) fail('RECEIVER_REPORTING_COMMIT_MISMATCH');
  const manifestBlob = readBlob(top, reportingCommit, PATHS.manifest);
  const validationBlob = readBlob(top, reportingCommit, PATHS.validation);
  const stateBlob = readBlob(top, reportingCommit, PATHS.state);
  const manifest = jsonObject(manifestBlob), validation = jsonObject(validationBlob), state = jsonObject(stateBlob);
  if (manifest.repository !== 'mjcustomcomputers-dotcom/Machine-Bug-Tool' ||
      manifest.development_branch !== 'feature/noahs-ark-reasoning-osi-v13' ||
      manifest.paths?.completed_state !== PATHS.state || manifest.paths?.validation !== PATHS.validation) fail('RECEIVER_MANIFEST_CONTRACT_MISMATCH');
  const executableCommit = validation.tested_commit;
  if (!objectId(executableCommit) || manifest.tested_execution_commit !== executableCommit ||
      state.config?.source_revision?.commit !== executableCommit) fail('RECEIVER_EXECUTABLE_COMMIT_DISAGREEMENT');
  if (state.config.source_revision.repository !== manifest.repository ||
      state.config.source_revision.branch !== manifest.development_branch) fail('RECEIVER_SOURCE_NAMESPACE_DISAGREEMENT');
  git(top, ['cat-file', '-e', `${executableCommit}^{commit}`]);
  const tree = git(top, ['rev-parse', '--verify', `${executableCommit}^{tree}`]).toString().trim();
  if (manifest.tested_execution_tree !== tree || validation.tested_tree !== tree) fail('RECEIVER_EXECUTABLE_TREE_DISAGREEMENT');
  const preserved = manifest.preserved_state;
  if (!preserved || !objectId(preserved.git_blob) || !sha256(preserved.exact_file_sha256) ||
      !sha256(preserved.controller_integrity_sha256) || stateBlob.blob !== preserved.git_blob ||
      stateBlob.sha256 !== preserved.exact_file_sha256 || state.integrity_sha256 !== preserved.controller_integrity_sha256) fail('RECEIVER_STATE_IDENTITY_MISMATCH');
  if (state.revision !== preserved.revision || state.event_sequence !== preserved.event_sequence ||
      !Array.isArray(state.tasks) || state.tasks.length !== preserved.completed_model_obligations ||
      !state.completed_actions || Object.keys(state.completed_actions).length !== preserved.retained_action_receipts ||
      preserved.status !== 'COMPLETE') fail('RECEIVER_SAVED_STATE_CONTRACT_MISMATCH');
  const packageBlob = readBlob(top, executableCommit, 'package.json');
  const packageJson = jsonObject(packageBlob);
  const minimum = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.engines?.node ?? '')?.slice(1).map(Number);
  if (!minimum) fail('RECEIVER_NODE_REQUIREMENT_UNSUPPORTED');
  const actual = process.versions.node.split('.').map(Number);
  const first = actual.findIndex((value, index) => value !== minimum[index]);
  if (first !== -1 && actual[first] < minimum[first]) fail('RECEIVER_NODE_VERSION', packageJson.engines.node);
  const gitVersion = git(top, ['--version']).toString().trim();
  return {repository: top, reportingCommit, executableCommit, stateBytes: stateBlob.bytes,
    expected: {integrity: preserved.controller_integrity_sha256, revision: preserved.revision,
      event: preserved.event_sequence, obligations: preserved.completed_model_obligations, receipts: preserved.retained_action_receipts},
    observation: {
      kind: 'MPC_V13_LOCAL_RECEIVE', status: 'SOURCE_READY_FOR_ISOLATED_RECEIVE',
      recorded_at_utc: new Date().toISOString(), reporting_commit: reportingCommit,
      historical_controller_executable_commit: executableCommit, historical_controller_tree: tree,
      receiver_checkout_head: git(ROOT, ['rev-parse', 'HEAD']).toString().trim(),
      receiver_working_tree_dirty: git(ROOT, ['status', '--porcelain=v1', '--untracked-files=all']).length !== 0,
      receiver_file_sha256: hash(readFileSync(fileURLToPath(import.meta.url))),
      receiver_path_helper_sha256: hash(readFileSync(join(ROOT, 'lib/local-path-boundary.mjs'))),
      source_repository: top, original_checkout_head_before: git(top, ['rev-parse', 'HEAD']).toString().trim(),
      original_checkout_status_before: git(top, ['status', '--porcelain=v1', '--untracked-files=all']).toString(),
      state: {blob: stateBlob.blob, bytes: stateBlob.size, sha256: stateBlob.sha256,
        integrity_sha256: preserved.controller_integrity_sha256},
      source_objects: [manifestBlob, validationBlob, stateBlob].map(({path, blob, sha256, size}) => ({path, blob, sha256, bytes: size})),
      host: {node: process.version, git: gitVersion, platform: process.platform, architecture: process.arch,
        windows_execution: process.platform === 'win32', caller_shell: callerShell ?? null,
        caller_shell_evidence: callerShell ? 'CALLER_SUPPLIED_LABEL' : 'NOT_REPORTED'},
      dependency_installation: 'NOT_REQUIRED_FOR_READ_ONLY_CONTROLLER_RESTORE',
      development_package_manager_pin: packageJson.packageManager,
      connectors: 'NOT_CHECKED_BY_LOCAL_RECEIVER', model_selection: 'NOT_CHECKED_BY_LOCAL_RECEIVER',
      restored_state_semantically_verified: false, commands: [], new_model_calls: 0,
      new_controller_events: 0, original_state_rewritten: false,
    }};
}

export function receiveController(options) {
  const source = inspectReceiveSource(options);
  const destination = resolve(options.destination);
  const receipt = {...source.observation, destination};
  let receiptPath, worktreeAttempted = false;
  try {
    if (!isAbsolute(options.destination)) fail('RECEIVER_ABSOLUTE_DESTINATION_REQUIRED', options.destination);
    if (isPathWithin(source.repository, destination, {allowRoot: true})) fail('RECEIVER_DESTINATION_MUST_BE_OUTSIDE_SOURCE_CHECKOUT', destination);
    noSymlinkAncestors(destination);
    try { lstatSync(destination); fail('RECEIVER_DESTINATION_ALREADY_EXISTS', destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!existsSync(dirname(destination)) || !lstatSync(dirname(destination)).isDirectory()) fail('RECEIVER_DESTINATION_PARENT_REQUIRED');
    // Options are scoped to this checkout operation. Existing/global Git settings are unchanged.
    worktreeAttempted = true;
    git(source.repository, ['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--quiet', '--detach', destination, source.executableCommit]);
    receipt.worktree_created = true;
    noSymlinkAncestors(destination);
    if (git(destination, ['rev-parse', 'HEAD']).toString().trim() !== source.executableCommit) fail('RECEIVER_CHECKOUT_COMMIT_MISMATCH');
    if (git(destination, ['status', '--porcelain=v1', '--untracked-files=all']).length !== 0) fail('RECEIVER_EXECUTABLE_CHECKOUT_NOT_CLEAN');
    const runtime = join(destination, '.sites-runtime', 'receive-v13');
    if (!isPathWithin(destination, runtime)) fail('RECEIVER_STATE_PATH_OUTSIDE_CHECKOUT');
    noSymlinkAncestors(runtime);
    mkdirSync(runtime, {recursive: true});
    receiptPath = join(runtime, 'receipt.json');
    const statePath = join(runtime, 'restored.state.json');
    exclusiveBytes(statePath, source.stateBytes);
    receipt.restored_state_path = statePath;
    receipt.wrangler_override_for_child = join(destination, '.sites-runtime', 'config');
    const historyPath = statePath + '.history';
    if (existsSync(historyPath)) fail('RECEIVER_UNEXPECTED_HISTORY');
    for (const command of ['verify', 'status', 'next']) {
      noSymlinkAncestors(statePath);
      const args = [join(destination, PATHS.controller), command, statePath];
      const child = spawnSync(process.execPath, args, {cwd: destination, encoding: 'utf8', shell: false,
        maxBuffer: MAX_BYTES, timeout: 60_000,
        env: {...process.env, XDG_CONFIG_HOME: receipt.wrangler_override_for_child}});
      const record = {command, executable: process.execPath, arguments: args,
        exit_status: child.status, signal: child.signal, stdout: child.stdout ?? '', stderr: child.stderr ?? ''};
      receipt.commands.push(record);
      if (!readFileSync(statePath).equals(source.stateBytes) || existsSync(historyPath)) fail('RECEIVER_READ_ONLY_STATE_CHANGED');
      if (child.error || child.status !== 0) fail('RECEIVER_CONTROLLER_COMMAND_FAILED', {command, error: child.error?.message ?? null});
      let output;
      try { output = JSON.parse(child.stdout); } catch { fail('RECEIVER_CONTROLLER_OUTPUT_NOT_JSON', command); }
      if (command === 'verify') {
        if (output.status !== 'LOCAL_CONTROLLER_PARITY_PASS' || output.integrity_sha256 !== source.expected.integrity) fail('RECEIVER_CONTROLLER_VERIFY_MISMATCH');
      } else if (output.status !== 'COMPLETE' || output.action !== null || output.integrity_sha256 !== source.expected.integrity ||
                 output.revision !== source.expected.revision || output.event_sequence !== source.expected.event ||
                 output.current_tasks !== source.expected.obligations || output.completed_current_tasks !== source.expected.obligations ||
                 output.retained_receipts !== source.expected.receipts || (output.blockers?.length ?? 0) !== 0) {
        fail('RECEIVER_CONTROLLER_COMPLETE_MISMATCH', command);
      }
    }
    receipt.original_checkout_head_after = git(source.repository, ['rev-parse', 'HEAD']).toString().trim();
    receipt.original_checkout_status_after = git(source.repository, ['status', '--porcelain=v1', '--untracked-files=all']).toString();
    receipt.original_checkout_observation_unchanged = receipt.original_checkout_head_before === receipt.original_checkout_head_after &&
      receipt.original_checkout_status_before === receipt.original_checkout_status_after;
    receipt.restored_state_semantically_verified = true;
    receipt.state_bytes_and_history = 'UNCHANGED_BY_VERIFY_STATUS_NEXT';
    receipt.status = 'LOCAL_CONTROLLER_RECEIVE_PASS';
    receipt.next_controller_action = null;
    receipt.receipt_path = receiptPath;
    publishReceiveReceipt(receiptPath, receipt);
    return receipt;
  } catch (error) {
    receipt.status = 'LOCAL_CONTROLLER_RECEIVE_FAILED';
    receipt.error = {code: error.code ?? error.message, detail: error.detail ?? null};
    if (error.final_receipt_cleanup_error) receipt.error.final_receipt_cleanup_error = error.final_receipt_cleanup_error;
    if (worktreeAttempted) {
      receipt.destination_present_after_failure = existsSync(destination);
      if (receipt.destination_present_after_failure) {
        try {
          noSymlinkAncestors(destination);
          receipt.destination_head_after_failure = git(destination, ['rev-parse', 'HEAD']).toString().trim();
        } catch (inspectionError) { receipt.destination_inspection_error = inspectionError.code ?? inspectionError.message; }
      }
    }
    const receiptPersistence = {status: 'NOT_ATTEMPTED_NO_SAFE_RUNTIME_PATH'};
    if (receiptPath) {
      const failurePath = existsSync(receiptPath) ? join(dirname(receiptPath), 'failure-receipt-' + randomUUID() + '.json') : receiptPath;
      receipt.receipt_path = failurePath;
      receiptPersistence.path = failurePath;
      try { publishReceiveReceipt(failurePath, receipt); receiptPersistence.status = 'SAVED_WITH_EXACT_READBACK'; }
      catch (saveError) { receiptPersistence.status = 'FAILED'; receiptPersistence.error = saveError.message; }
    }
    throw Object.assign(error, {receipt, receiptPersistence});
  }
}

const HELP = `Usage:
  node scripts/receive-mpc-v13.mjs inspect --repository PATH --reporting-commit FULL_SHA
  node scripts/receive-mpc-v13.mjs receive --repository PATH --reporting-commit FULL_SHA --destination UNUSED_PATH

Optional: --caller-shell LABEL (reported by the caller, not independently attested).
Git and manifest-compatible Node are required. No package installation is performed.
The reporting commit must already exist in the repository. Fetch through your existing
GitHub connection first if needed. The receiver does not fetch or configure credentials.
Only the preserved controller's verify/status/next commands run at its historical source.
An occupied destination is never overwritten or reset. Existing source work is preserved.
`;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseReceiveArguments(process.argv.slice(2));
    if (options.command === 'help') process.stdout.write(HELP);
    else process.stdout.write(JSON.stringify(options.command === 'inspect' ? inspectReceiveSource(options).observation : receiveController(options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify(error.receipt ? {...error.receipt, receipt_persistence: error.receiptPersistence} : {status: 'LOCAL_CONTROLLER_RECEIVE_FAILED',
      error: {code: error.code ?? error.message, detail: error.detail ?? null}}, null, 2) + '\n');
    process.exitCode = 1;
  }
}
