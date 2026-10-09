import {readFileSync, writeFileSync, existsSync, statSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {routeProblem} from '../lib/universal-router.mjs';

// This command reads only the explicitly supplied input file. Source locators
// inside it remain declarations; record content must be present in the JSON.
const argv = process.argv.slice(2);
if (argv.length === 1 && argv[0] === '--help') {
  console.log('node scripts/run-evidence-workflow.mjs --input SUPPLIED_RECORDS.json --output NEW_RECEIPT.json\nReads supplied record content, reports the evidence stage, and saves the full receipt. No connector calls or locator fetching.');
} else {
  try {
    const options = {}, allowed = new Set(['--input', '--output']);
    for (let i = 0; i < argv.length; i += 2) {
      const flag = argv[i], value = argv[i + 1];
      if (!allowed.has(flag) || Object.hasOwn(options, flag) || !value || value.startsWith('--')) throw Error('INPUT_AND_NEW_OUTPUT_PATHS_REQUIRED');
      options[flag] = resolve(value);
    }
    if (!options['--input'] || !options['--output']) throw Error('INPUT_AND_NEW_OUTPUT_PATHS_REQUIRED');
    if (existsSync(options['--output'])) throw Error('NEW_OUTPUT_PATH_REQUIRED');
    const inputStat = statSync(options['--input']);
    if (!inputStat.isFile() || inputStat.size > 2000000) throw Error('BOUNDED_INPUT_JSON_FILE_REQUIRED');
    const input = JSON.parse(readFileSync(options['--input'], 'utf8'));
    const receipt = await routeProblem(input);
    mkdirSync(dirname(options['--output']), {recursive: true});
    writeFileSync(options['--output'], JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    console.log(JSON.stringify({work_stage: receipt.work_stage, fact_summary: receipt.fact_summary, next_action: receipt.next_action}, null, 2));
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
