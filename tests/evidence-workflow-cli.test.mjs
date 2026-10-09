import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/run-evidence-workflow.mjs', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('../data/evidence-workflow-example.json', import.meta.url), 'utf8'));
const run = (input, output) => spawnSync(process.execPath, [script, '--input', input, '--output', output], {encoding: 'utf8'});

test('CLI advances from acquisition to analysis only after matching-version content is supplied', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpc-evidence-workflow-'));
  try {
    const inputPath = join(directory, 'input.json'), acquisitionPath = join(directory, 'acquisition.json'), analysisPath = join(directory, 'analysis.json');
    const input = structuredClone(fixture);
    // A nonexistent locator remains metadata; the CLI must not try to read it.
    input.sources[0].native_locator = 'file:/not-an-available-source/record.txt';
    writeFileSync(inputPath, JSON.stringify(input));
    const first = run(inputPath, acquisitionPath); assert.equal(first.status, 0, first.stderr);
    const summary = JSON.parse(first.stdout), acquisition = JSON.parse(readFileSync(acquisitionPath, 'utf8'));
    assert.deepEqual(Object.keys(summary).sort(), ['fact_summary', 'next_action', 'work_stage']);
    assert.equal(summary.work_stage, 'EVIDENCE_ACQUISITION');
    assert.equal(summary.next_action.kind, 'ACQUIRE_RECORD');
    assert.equal(summary.next_action.version, 'SYNTHETIC-REVISION-1');
    assert.equal(acquisition.workflow.acquired_record_count, 0);
    assert.equal(acquisition.normalized_frame.sources[0].native_locator, input.sources[0].native_locator);
    input.workflow.records.push({source_ref: 'EXAMPLE-RECORD', version: 'SYNTHETIC-REVISION-1',
      content: 'Synthetic record: document SYNTHETIC-DOCUMENT-1 has declared owner Synthetic example author and revision SYNTHETIC-REVISION-1.'});
    writeFileSync(inputPath, JSON.stringify(input));
    const second = run(inputPath, analysisPath); assert.equal(second.status, 0, second.stderr);
    const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
    assert.equal(JSON.parse(second.stdout).work_stage, 'ANALYSIS');
    assert.equal(analysis.workflow.acquired_record_count, 1);
    assert.equal(analysis.workflow.remaining_record_count, 0);
    assert.equal(analysis.normalized_frame.sources[0].version, 'SYNTHETIC-REVISION-1');
    assert.equal(analysis.source_refs_authenticated, false);
    assert.deepEqual(JSON.parse(readFileSync(inputPath, 'utf8')), input);
  } finally {rmSync(directory, {recursive: true, force: true});}
});

test('CLI refuses an existing output before reading input or overwriting evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mpc-evidence-preservation-'));
  try {
    const output = join(directory, 'preserve.json'); writeFileSync(output, 'previous evidence');
    const result = run(join(directory, 'does-not-exist.json'), output);
    assert.equal(result.status, 1); assert.match(result.stderr, /NEW_OUTPUT_PATH_REQUIRED/);
    assert.equal(result.stdout, ''); assert.equal(readFileSync(output, 'utf8'), 'previous evidence');
  } finally {rmSync(directory, {recursive: true, force: true});}
});
