#!/usr/bin/env node
// Local model augmentation only; all native acquisition and execution remains with existing tools.
import {readFileSync, lstatSync, mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname, basename} from 'node:path';
import {routeProblem} from '../lib/universal-router.mjs';
import {runMpcLocalModel, DEFAULT_LOCAL_MODEL} from '../lib/mpc-local-model.mjs';

const usage = 'node scripts/run-mpc-local-model.mjs --input RECORDS.json --output NEW_RECEIPT.json [--model qwen3:4b-instruct] [--mode auto|plan]';
async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {console.log(usage); return;}
  const args = {}, allowed = new Set(['--input', '--output', '--model', '--mode']);
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || Object.hasOwn(args, argv[i]) || !argv[i+1] || argv[i+1].startsWith('--')) throw Error('INVALID_LOCAL_MODEL_ARGUMENTS: '+usage);
    args[argv[i]] = argv[i+1];
  }
  if (!args['--input'] || !args['--output']) throw Error('INPUT_AND_NEW_OUTPUT_REQUIRED: '+usage);
  const from = resolve(args['--input']), to = resolve(args['--output']);
  if (from === to || existsSync(to)) throw Error('NEW_OUTPUT_PATH_REQUIRED');
  const file = lstatSync(from);if (!file.isFile() || file.isSymbolicLink() || file.size > 2_000_000) throw Error('REGULAR_BOUNDED_INPUT_REQUIRED');
  const input = JSON.parse(readFileSync(from, 'utf8'));
  const routed = await routeProblem(input);
  const result = await runMpcLocalModel(input, routed, {model: args['--model'] ?? DEFAULT_LOCAL_MODEL, mode: args['--mode'] ?? 'auto'});
  mkdirSync(dirname(to), {recursive:true});
  writeFileSync(to, JSON.stringify({source_input_file:basename(from), ...result},null,2)+'\n', {encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({status:result.status, work_stage:result.work_stage, fact_summary:result.fact_summary,
    next_action:result.next_action, model_invoked:result.model_invoked, proposal:result.proposal,
    receipt:to},null,2));
}
main(process.argv.slice(2)).catch(err=>{console.error(err.message);process.exitCode=1;});
