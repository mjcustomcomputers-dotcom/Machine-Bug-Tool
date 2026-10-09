import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const runner = fileURLToPath(new URL('../scripts/run-mpc-work.mjs', import.meta.url));
const fixture = readFileSync(new URL('../data/evidence-workflow-example.json', import.meta.url), 'utf8');
const launch = (args, cwd) => spawnSync(process.execPath, [runner, ...args], {cwd, encoding: 'utf8'});

test('work launcher preserves a punctuation-bearing input and writes separate receipts for repeated work', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mpc work '));
  try {
    const input = join(cwd, 'record ; $(never-run) & input.json');
    writeFileSync(input, fixture);
    const first = launch([input, '--json'], cwd), second = launch(['--input', input, '--json'], cwd);
    assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
    const a = JSON.parse(first.stdout), b = JSON.parse(second.stdout);
    assert.notEqual(a.receipt_path, b.receipt_path);
    assert.equal(a.work_stage, 'EVIDENCE_ACQUISITION');
    assert.deepEqual(a.progress, {acquired_records: 0, required_records: 1, remaining_records: 1});
    const originalReceipt = JSON.parse(readFileSync(a.receipt_path, 'utf8'));
    assert.equal(originalReceipt.next_action.kind, a.next_action.kind);
    assert.deepEqual(originalReceipt, JSON.parse(readFileSync(b.receipt_path, 'utf8')));
    assert.equal(readFileSync(input, 'utf8'), fixture);
    assert.deepEqual(readdirSync(cwd).sort(), ['.sites-runtime', 'record ; $(never-run) & input.json']);
  } finally {rmSync(cwd, {recursive: true, force: true});}
});

test('work launcher carries exact matching-version content to analysis with an explicit output root', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mpc acquired '));
  try {
    const input = JSON.parse(fixture);
    input.workflow.records = [{source_ref: input.sources[0].id, version: input.sources[0].version,
      content: 'Fixture document SYNTHETIC-DOCUMENT-1 is available in this declared revision.'}];
    writeFileSync(join(cwd, 'input.json'), JSON.stringify(input));
    const result = launch(['--input', 'input.json', '--output-root', 'work receipts', '--json'], cwd);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.work_stage, 'ANALYSIS'); assert.equal(summary.progress.acquired_records, 1);
    assert.equal(summary.progress.remaining_records, 0);
    assert.ok(summary.receipt_path.startsWith(join(cwd, 'work receipts')));
  } finally {rmSync(cwd, {recursive: true, force: true});}
});

test('work launcher preserves an existing explicit output and returns the workflow error', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mpc preserve '));
  try {
    writeFileSync(join(cwd, 'receipt.json'), 'previous evidence');
    const result = launch(['--input', 'missing.json', '--output', 'receipt.json'], cwd);
    assert.equal(result.status, 1); assert.match(result.stderr, /NEW_OUTPUT_PATH_REQUIRED/u);
    assert.equal(readFileSync(join(cwd, 'receipt.json'), 'utf8'), 'previous evidence');
    assert.deepEqual(readdirSync(cwd), ['receipt.json']);
  } finally {rmSync(cwd, {recursive: true, force: true});}
});

test('work launcher requires a packet in noninteractive use and rejects ambiguous output arguments', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'mpc args '));
  try {
    const missing = launch([], cwd);
    assert.equal(missing.status, 1); assert.match(missing.stderr, /WORK_PACKET_PATH_REQUIRED/u);
    const conflict = launch(['--input', 'input.json', '--output', 'a.json', '--output-root', 'b'], cwd);
    assert.equal(conflict.status, 1); assert.match(conflict.stderr, /CHOOSE_OUTPUT_OR_OUTPUT_ROOT/u);
    assert.deepEqual(readdirSync(cwd), []);
  } finally {rmSync(cwd, {recursive: true, force: true});}
});
