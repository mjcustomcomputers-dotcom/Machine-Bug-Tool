#!/usr/bin/env node
// A work entry point for the existing evidence workflow. Its inputs and full
// receipt stay in that workflow's format; this file only handles local launch.
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `MPC Work — use the current evidence and move the job forward.

  node scripts/run-mpc-work.mjs WORK_PACKET.json
  node scripts/run-mpc-work.mjs --input WORK_PACKET.json --output NEW_RECEIPT.json
  node scripts/run-mpc-work.mjs --input WORK_PACKET.json --output-root WORK_FOLDER

Use --json for a machine-readable summary. With no file, an interactive terminal
asks for its path. The packet uses the existing V16 evidence-workflow schema.
Receipts are saved to a new file under .sites-runtime/work by default.
ChatGPT prepares the packet from your task and the records it has acquired.
`;

export function parseWorkArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '--json') {
      if (Object.hasOwn(options, flag)) throw Error('DUPLICATE_ARGUMENT:' + flag);
      options[flag] = true;
    } else if (['--input', '--output', '--output-root'].includes(flag)) {
      const value = argv[++index];
      if (Object.hasOwn(options, flag) || !value || value.startsWith('--')) throw Error('ARGUMENT_VALUE_REQUIRED:' + flag);
      options[flag] = value;
    } else if (!flag.startsWith('-') && !Object.hasOwn(options, '--input')) {
      options['--input'] = flag;
    } else throw Error('UNKNOWN_OR_REPEATED_ARGUMENT:' + flag);
  }
  if (options['--output'] && options['--output-root']) throw Error('CHOOSE_OUTPUT_OR_OUTPUT_ROOT');
  return options;
}

export function runMpcWork(options, {cwd = process.cwd()} = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw Error('NODE_22_13_OR_NEWER_REQUIRED');
  if (!options['--input']?.trim()) throw Error('WORK_PACKET_PATH_REQUIRED');
  const input = resolve(cwd, options['--input']);
  const output = options['--output'] ? resolve(cwd, options['--output']) :
    resolve(cwd, options['--output-root'] ?? '.sites-runtime/work',
      new Date().toISOString().replace(/[:.]/gu, '-') + '-' + randomUUID() + '.json');
  // Argument arrays preserve spaces and punctuation. Source locators inside
  // the packet are handled by the existing router as source metadata.
  try {
    execFileSync(process.execPath, [resolve(ROOT, 'scripts/run-evidence-workflow.mjs'),
      '--input', input, '--output', output], {cwd, encoding: 'utf8',
      timeout: 60000, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe']});
  } catch (error) {
    throw Error(error.stderr?.toString().trim() || error.message, {cause: error});
  }
  const receipt = JSON.parse(readFileSync(output, 'utf8'));
  return {work_stage: receipt.work_stage, fact_summary: receipt.fact_summary,
    next_action: receipt.next_action,
    progress: {acquired_records: receipt.workflow.acquired_record_count,
      required_records: receipt.workflow.required_record_count,
      remaining_records: receipt.workflow.remaining_record_count},
    receipt_path: output};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let terminal;
  try {
    const options = parseWorkArguments(process.argv.slice(2));
    if (options['--help']) console.log(HELP);
    else {
      if (!options['--input'] && process.stdin.isTTY && process.stdout.isTTY) {
        terminal = createInterface({input: process.stdin, output: process.stdout});
        const suppliedPath = (await terminal.question('Work packet (.json): ')).trim();
        options['--input'] = suppliedPath.replace(/^"(.*)"$/u, '$1');
      }
      const summary = runMpcWork(options);
      if (options['--json']) console.log(JSON.stringify(summary, null, 2));
      else {
        console.log('Stage: ' + summary.work_stage);
        console.log('Records: ' + summary.progress.acquired_records + ' of ' +
          summary.progress.required_records + ' required records available.');
        console.log('Next: ' + summary.next_action.title);
        console.log(summary.next_action.description);
        if (summary.next_action.native_locator) console.log('Source: ' + summary.next_action.native_locator);
        console.log('Receipt: ' + summary.receipt_path);
      }
    }
  } catch (error) {console.error(error.message); process.exitCode = 1;}
  finally {terminal?.close();}
}
