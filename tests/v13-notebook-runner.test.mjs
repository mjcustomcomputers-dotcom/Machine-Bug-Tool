import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
const runner = join(root, 'scripts', 'run-v13-notebook.py');
const python = [process.env.MPC_PYTHON, 'python3', 'python'].filter(Boolean).find(command => {
  const result = spawnSync(command, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], {encoding: 'utf8', timeout: 10000});
  return result.status === 0;
});
const options = {skip: python ? false : 'Python 3.10+ is unavailable; notebook execution gate remains unverified.'};
const digest = value => createHash('sha256').update(value).digest('hex');

function git(directory, args) {
  const result = spawnSync('git', args, {cwd: directory, encoding: 'utf8', timeout: 15000});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t, sources) {
  const base = mkdtempSync(join(tmpdir(), 'mpc notebook runner '));
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const repository = join(base, 'source with spaces é');
  mkdirSync(join(repository, 'scripts'), {recursive: true});
  mkdirSync(join(repository, 'notebooks'), {recursive: true});
  copyFileSync(runner, join(repository, 'scripts', 'run-v13-notebook.py'));
  writeFileSync(join(repository, '.gitignore'), '.sites-runtime/\n');
  const notebook = join(repository, 'notebooks', 'MPC-Noahs-Ark-Reasoning-V13.ipynb');
  writeFileSync(notebook, JSON.stringify({
    nbformat: 4, nbformat_minor: 5, metadata: {},
    cells: sources.map(source => ({cell_type: 'code', source: [source], outputs: [], execution_count: null, metadata: {}})),
  }) + '\n');
  git(repository, ['init', '--quiet']);
  git(repository, ['add', '.']);
  git(repository, ['-c', 'user.name=Notebook Runner Test', '-c', 'user.email=notebook-test@example.invalid', 'commit', '--quiet', '-m', 'isolated notebook fixture']);
  const output = join(base, 'fresh output é');
  return {base, repository, notebook, output, head: git(repository, ['rev-parse', 'HEAD'])};
}

function run(f, extra = {}) {
  return spawnSync(python, [join(f.repository, 'scripts', 'run-v13-notebook.py'), '--output-dir', f.output], {
    cwd: f.base, encoding: 'utf8', timeout: 60000, ...extra,
  });
}

function receipt(f) {
  return JSON.parse(readFileSync(join(f.output, 'v13-notebook-execution.json'), 'utf8'));
}

test('portable notebook runner preserves shared state, UTF-8, argv values and paths with spaces', options, t => {
  const f = fixture(t, [
    'import json, subprocess\nvalue = "café — \\"quote\\" \\\\ $(literal)"\nshared = [value]\nprint(value)\n',
    'shared.append("second")\n',
    'p = subprocess.run(["node", "-e", "process.stdout.write(JSON.stringify(process.argv[1]))", value], capture_output=True, text=True, check=True)\nassert json.loads(p.stdout) == value\n',
    'assert shared == [value, "second"]\n',
    'print("shared namespace passed")\n',
  ]);
  const original = readFileSync(f.notebook);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const r = receipt(f);
  assert.equal(r.status, 'PASS');
  assert.equal(r.execution_mode, 'SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL');
  assert.equal(r.python_utf8_mode, true);
  assert.equal(r.source_before.commit, f.head);
  assert.equal(r.source_after.commit, f.head);
  assert.equal(r.source_before.working_tree_dirty, false);
  assert.equal(r.code_cells_passed, 5);
  assert.equal(r.code_cells_failed, 0);
  assert.equal(r.code_cells_not_run, 0);
  assert.equal(r.subprocesses.length, 1);
  assert.equal(r.subprocesses[0].returncode, 0);
  assert.equal(r.subprocesses[0].shell, false);
  assert.match(r.cells[0].stdout, /café —/);
  assert.equal(r.notebook_source_sha256, digest(original));
  assert.equal(r.notebook_source_unchanged, true);
  assert.deepEqual(readFileSync(f.notebook), original);
  const executed = JSON.parse(readFileSync(join(f.output, 'MPC-Noahs-Ark-Reasoning-V13.executed.ipynb'), 'utf8'));
  assert.deepEqual(executed.cells.map(cell => cell.source), JSON.parse(original).cells.map(cell => cell.source));
  assert.deepEqual(executed.cells.map(cell => cell.execution_count), [1, 2, 3, 4, 5]);
});

test('occupied notebook output directory is rejected without executing cells or overwriting files', options, t => {
  const f = fixture(t, ['raise RuntimeError("must not execute")\n', '', '', '', '']);
  mkdirSync(f.output);
  const sentinel = join(f.output, 'retained.json');
  writeFileSync(sentinel, '{"prior":true}\n');
  const original = readFileSync(f.notebook);
  const result = run(f);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error, 'OUTPUT_DIRECTORY_ALREADY_EXISTS');
  assert.equal(readFileSync(sentinel, 'utf8'), '{"prior":true}\n');
  assert.equal(existsSync(join(f.output, 'v13-notebook-execution.json')), false);
  assert.deepEqual(readFileSync(f.notebook), original);
});

test('failed notebook subprocess preserves partial receipts and stops later cells', options, t => {
  const f = fixture(t, [
    'import subprocess\nprint("before failure é")\n',
    'subprocess.run(["node", "-e", "process.stderr.write(\'controlled failure\'); process.exit(9)"], capture_output=True, text=True, check=True)\n',
    'raise RuntimeError("this later cell must not run")\n', '', '',
  ]);
  const cache = join(f.repository, '.sites-runtime', 'old-cache.sqlite');
  mkdirSync(dirname(cache));
  writeFileSync(cache, 'old derived cache sentinel');
  const original = readFileSync(f.notebook);
  const result = run(f);
  assert.equal(result.status, 1, result.stderr + result.stdout);
  const r = receipt(f);
  assert.equal(r.status, 'FAIL');
  assert.equal(r.code_cells_executed, 2);
  assert.equal(r.code_cells_passed, 1);
  assert.equal(r.code_cells_failed, 1);
  assert.equal(r.code_cells_not_run, 3);
  assert.equal(r.subprocesses[0].returncode, 9);
  assert.equal(r.subprocesses[0].stderr, 'controlled failure');
  assert.equal(r.cells[1].error.type, 'CalledProcessError');
  assert.match(r.cells[0].stdout, /before failure é/);
  assert.deepEqual(readFileSync(f.notebook), original);
  assert.equal(readFileSync(cache, 'utf8'), 'old derived cache sentinel');
  const executed = JSON.parse(readFileSync(join(f.output, 'MPC-Noahs-Ark-Reasoning-V13.executed.ipynb'), 'utf8'));
  assert.deepEqual(executed.cells.slice(2).map(cell => cell.execution_count), [null, null, null]);
});

test('shell subprocess requests fail before dispatch', options, t => {
  const f = fixture(t, ['import subprocess\nsubprocess.run("echo must-not-run", shell=True)\n', '', '', '', '']);
  const result = run(f);
  assert.equal(result.status, 1);
  const r = receipt(f);
  assert.equal(r.code_cells_failed, 1);
  assert.equal(r.subprocesses.length, 0);
  assert.equal(r.cells[0].error.message, 'NOTEBOOK_SUBPROCESS_REQUIRES_ARGV_WITHOUT_SHELL');
});

test('wrong V13 cell count is rejected before creating an output directory', options, t => {
  const f = fixture(t, ['', '', '', '']);
  const result = run(f);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).error, 'EXPECTED_FIVE_V13_CODE_CELLS');
  assert.equal(existsSync(f.output), false);
});
