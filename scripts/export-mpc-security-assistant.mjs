#!/usr/bin/env node
// Export the exact local runtime closure into a new, separately located folder.
// No package installation, target access, credential copy or skill packaging.
import {createHash} from 'node:crypto';
import {lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE_BYTES = 8_000_000, MAX_EXPORT_BYTES = 64_000_000;
const SUPPORT_FILES = [
  'scripts/Connect-MpcSecurityAssistant.ps1',
  'docs/MPC-SECURITY-ASSISTANT-GUIDE.md',
  'examples/security-assistant/matching-pennies.json',
  'examples/security-assistant/acquire-request.json',
];
const OPTIONAL_LICENSES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING', 'COPYING.txt', 'COPYING.md'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const recordFor = (relativePath, bytes) => ({path: relativePath, bytes: bytes.length, sha256: sha256(bytes)});
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');

function statIfPresent(location) {
  try { return lstatSync(location); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function atOrWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function outputLocation(value, sourceRoot) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/u.test(value)) throw Error('OUTPUT_DIRECTORY_REQUIRED');
  const requested = path.resolve(value);
  if (atOrWithin(sourceRoot, requested)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  if (statIfPresent(requested)) throw Error('OUTPUT_DIRECTORY_ALREADY_EXISTS');
  // Require an existing parent so only the explicitly selected output is created.
  const parent = realpathSync(path.dirname(requested));
  if (!lstatSync(parent).isDirectory()) throw Error('OUTPUT_PARENT_DIRECTORY_REQUIRED');
  const output = path.join(parent, path.basename(requested));
  if (atOrWithin(sourceRoot, output)) throw Error('OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  if (statIfPresent(output)) throw Error('OUTPUT_DIRECTORY_ALREADY_EXISTS');
  return output;
}

function portablePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.posix.isAbsolute(relativePath) ||
      /[\\\u0000-\u001f<>:"|?*]/u.test(relativePath)) throw Error('PORTABLE_RELATIVE_PATH_REQUIRED');
  const components = relativePath.split('/');
  if (components.some(part => !part || part === '.' || part === '..' || /[ .]$/u.test(part))) throw Error('PORTABLE_RELATIVE_PATH_REQUIRED');
  if (components.some(part => part.startsWith('.') || /^(?:node_modules|skills|secrets?|credentials?)(?:\.|$)/iu.test(part)) ||
      /^SKILL\.md$/iu.test(components.at(-1))) throw Error('EXCLUDED_PORTABLE_SOURCE:' + relativePath);
  return components;
}

function readRegular(root, relativePath) {
  const components = portablePath(relativePath);
  let location = root;
  for (const [index, part] of components.entries()) {
    location = path.join(location, part);
    const stat = lstatSync(location);
    if (stat.isSymbolicLink() || (index < components.length - 1 && !stat.isDirectory())) throw Error('SOURCE_SYMLINK_OR_NON_DIRECTORY:' + relativePath);
    if (index === components.length - 1 && (!stat.isFile() || stat.size > MAX_FILE_BYTES)) throw Error('BOUNDED_SOURCE_FILE_REQUIRED:' + relativePath);
  }
  if (!atOrWithin(root, realpathSync(location))) throw Error('SOURCE_OUTSIDE_ROOT:' + relativePath);
  const bytes = readFileSync(location);
  if (bytes.length > MAX_FILE_BYTES) throw Error('SOURCE_FILE_SIZE_LIMIT:' + relativePath);
  return bytes;
}

function matches(bytes, record) {
  return bytes.length === record.bytes && sha256(bytes) === record.sha256;
}

function portableReadme() {
  return `# MPC Security Assistant — local companion

This folder contains the exact source-bound local assistant and its native data.
Use an already installed Node.js >=22.13.0. Codex is the MCP client. No npm or
pnpm installation is needed for this assistant. The original package.json is
preserved because it contributes to the engine fingerprint; the website build
is not part of this portable companion.

## Start on Windows

Open PowerShell in this folder and run:

\`\`\`powershell
node .\\scripts\\start-mpc-security-assistant.mjs --workspace . --check
.\\scripts\\Connect-MpcSecurityAssistant.ps1
codex mcp list
codex
\`\`\`

The connector defaults to this folder as the workspace and preserves an existing
registration with the same name. For an engagement folder, pass
\`-Workspace 'C:\\path\\to\\engagement'\`; it must already exist. An optional
\`-ServerName\` allows a separately named registration. Use your existing Codex
sign-in. Choose Daybreak Blue in the host only where your actual account offers
it; this package does not select a model or add API inference.

For a direct startup check in another shell:

\`\`\`sh
node scripts/start-mpc-security-assistant.mjs --workspace . --check
\`\`\`

Without \`--check\`, this command serves MCP on standard input/output. Connect
it through Codex MCP settings; it is not a terminal chat prompt.

## First source-bound run

In Codex, call \`assistant_status\` and \`get_universal_contract\`. The included
\`examples/security-assistant/acquire-request.json\` contains an acquisition
request for the synthetic matching-pennies fixture. Use the returned acquisition
ID with \`assistant_analyze\`, \`tool_name: "evaluate_method"\`, and
\`arguments_pointer: "/native_args"\`. Then review the actual result before
recording a bounded \`assistant_decide\` disposition. The workflow is
**ACQUIRED → ANALYZED → DECIDED**.

Read [the operator guide](docs/MPC-SECURITY-ASSISTANT-GUIDE.md) for the exact
fields, consulting workflow, restart behavior, and optional ChatGPT profile.
Session receipts live in memory; save returned artifacts through the host and
reacquire/reanalyze source files after restarting.

## Distribution identity

\`MANIFEST.json\` records relative paths, byte sizes, SHA-256 digests, and the
engine fingerprint. It excludes its own hash. Match the startup check's
\`runtime.source_fingerprint\` to the manifest's \`engine_fingerprint\`. An
export proves a local byte copy; it does not authenticate a remote source or
prove that Windows, Codex, a hosted plugin, or a GPT account has run it. Native
Windows execution and account-side GPT creation remain receiver actions.
`;
}

export function parseExportArguments(argv) {
  if (argv.length === 1 && argv[0] === '--help') return {help: true};
  if (argv.length !== 2 || argv[0] !== '--output-dir' || !argv[1] || argv[1].startsWith('--')) {
    throw Error('USAGE: node scripts/export-mpc-security-assistant.mjs --output-dir NEW_DIRECTORY_OUTSIDE_REPOSITORY');
  }
  return {output_directory: argv[1]};
}

export async function exportMpcSecurityAssistant({output_directory} = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw Error('NODE_22_13_OR_LATER_REQUIRED');
  const sourceRoot = realpathSync(ROOT), output = outputLocation(output_directory, sourceRoot);
  const {createSecurityAssistant} = await import('../lib/security-assistant.mjs');
  const engine = await createSecurityAssistant({workspaceRoot: sourceRoot});
  const source = engine.sourceIdentity;
  if (!/^[a-f0-9]{64}$/u.test(source.fingerprint) || !Array.isArray(source.files) || !source.files.length) throw Error('RUNTIME_SOURCE_IDENTITY_REQUIRED');

  const snapshots = new Map();
  let totalBytes = 0;
  const snapshot = (relativePath, expected) => {
    if (snapshots.has(relativePath)) throw Error('DUPLICATE_EXPORT_SOURCE:' + relativePath);
    const bytes = readRegular(sourceRoot, relativePath), record = recordFor(relativePath, bytes);
    if (expected && !matches(bytes, expected)) throw Error('SOURCE_CHANGED_DURING_EXPORT:' + relativePath);
    totalBytes += bytes.length;
    if (totalBytes > MAX_EXPORT_BYTES) throw Error('EXPORT_BYTE_LIMIT');
    snapshots.set(relativePath, {bytes, record});
  };
  for (const row of source.files) snapshot(row.path, row);
  for (const relativePath of SUPPORT_FILES) if (!snapshots.has(relativePath)) snapshot(relativePath);
  for (const relativePath of OPTIONAL_LICENSES) if (statIfPresent(path.join(sourceRoot, relativePath))) snapshot(relativePath);
  await engine.callTool('assistant_status', {});

  // mkdir is exclusive: neither an empty folder nor a racing new folder is reused.
  mkdirSync(output, {recursive: false});
  try {
    for (const [relativePath, {bytes}] of snapshots) {
      const target = path.join(output, ...portablePath(relativePath));
      mkdirSync(path.dirname(target), {recursive: true});
      writeFileSync(target, bytes, {flag: 'wx', mode: 0o644});
    }
    const readmePath = 'README-PORTABLE.md', readme = Buffer.from(portableReadme(), 'utf8');
    writeFileSync(path.join(output, readmePath), readme, {flag: 'wx', mode: 0o644});
    const files = [...snapshots.values()].map(row => row.record).concat(recordFor(readmePath, readme))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    for (const row of files) if (!matches(readRegular(output, row.path), row)) throw Error('PORTABLE_READBACK_MISMATCH:' + row.path);
    for (const [relativePath, {record}] of snapshots) if (!matches(readRegular(sourceRoot, relativePath), record)) throw Error('SOURCE_CHANGED_DURING_EXPORT:' + relativePath);
    await engine.callTool('assistant_status', {});

    const manifest = {
      format_version: 'MPC_SECURITY_ASSISTANT_PORTABLE_MANIFEST_1.0',
      created_at_utc: new Date().toISOString(), algorithm: 'SHA-256',
      distribution: 'LOCAL_COMPANION_ONLY', engine_fingerprint: source.fingerprint,
      runtime_source_identity: source, runtime_source_file_count: source.files.length,
      requirements: {node: '>=22.13.0', codex: 'Existing installed MCP client for interactive use', dependency_install_required: false},
      files, file_count_excluding_manifest: files.length, manifest_self_hash_excluded: true,
      exporter_validation: {runtime_source_bytes_matched: true, copied_files_read_back: true,
        copied_runtime_started: false, stdio_handshake_performed: false, native_windows_execution_performed: false},
      source_authentication: false, hosted_deployment_performed: false, account_gpt_created: false,
    };
    const manifestBytes = jsonBytes(manifest);
    writeFileSync(path.join(output, 'MANIFEST.json'), manifestBytes, {flag: 'wx', mode: 0o644});
    if (!readRegular(output, 'MANIFEST.json').equals(manifestBytes)) throw Error('MANIFEST_READBACK_MISMATCH');
    return {status: 'MPC_SECURITY_ASSISTANT_PORTABLE_CREATED', output_directory: output,
      engine_fingerprint: source.fingerprint, runtime_source_files: source.files.length,
      file_count_including_manifest: files.length + 1, manifest: path.join(output, 'MANIFEST.json'),
      manifest_sha256: sha256(manifestBytes), dependency_install_performed: false,
      copied_runtime_started: false, stdio_handshake_performed: false};
  } catch (error) {
    // Preserve this newly created partial export for inspection; never delete or
    // replace a caller-selected folder as an automatic recovery action.
    throw Error('INCOMPLETE_EXPORT_PRESERVED:' + output + ':' + String(error.message ?? error));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseExportArguments(process.argv.slice(2));
    if (options.help) process.stdout.write('Usage: node scripts/export-mpc-security-assistant.mjs --output-dir NEW_DIRECTORY_OUTSIDE_REPOSITORY\nThe output must not exist; its parent must already exist. No software is installed.\n');
    else process.stdout.write(JSON.stringify(await exportMpcSecurityAssistant(options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({status: 'MPC_SECURITY_ASSISTANT_EXPORT_ERROR', error: String(error.message ?? error).slice(0, 1500)}) + '\n');
    process.exitCode = 1;
  }
}
