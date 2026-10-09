import {readFileSync, writeFileSync, existsSync, mkdirSync, statSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runLocalLiveIntelligence} from '../lib/local-live-intelligence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {cases: resolve(root, 'data/local-live-native-cases.v1.json'), output: resolve('local-live-intelligence.json')};
const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log('node scripts/run-local-live-intelligence.mjs [--cases PATH] [--live-receipts PATH] [--output NEW_PATH]\nOffline comparison of recorded observations. No network dispatch. Missing live observations remain explicit.');
} else {
  try {
    const names = new Map([['--cases', 'cases'], ['--live-receipts', 'live'], ['--output', 'output']]), seen = new Set();
    for (let i = 0; i < argv.length; i += 2) {
      if (!names.has(argv[i]) || seen.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('INVALID_OR_DUPLICATE_ARGUMENT');
      seen.add(argv[i]); options[names.get(argv[i])] = resolve(argv[i + 1]);
    }
    if (existsSync(options.output)) throw Error('NEW_OUTPUT_PATH_REQUIRED');
    const read = path => {if (!statSync(path).isFile() || statSync(path).size > 8000000) throw Error('BOUNDED_JSON_FILE_REQUIRED'); return JSON.parse(readFileSync(path, 'utf8'));};
    const corpus = read(options.cases), recorded = options.live ? read(options.live) : [];
    const result = await runLocalLiveIntelligence({cases: Array.isArray(corpus) ? corpus : corpus.cases,
      live_observations: Array.isArray(recorded) ? recorded : recorded.observations});
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const paths = ['lib/local-live-intelligence.mjs', 'lib/exact-native-numerical-review.mjs', 'lib/methods.mjs', 'lib/atomic-models.mjs',
      'lib/forensic-models.mjs', 'lib/deferred-models.mjs', 'lib/schema.mjs', 'lib/universal.mjs', 'scripts/run-local-live-intelligence.mjs'];
    result.execution_metadata = {recorded_at_utc: new Date().toISOString(), node: process.version,
      source_files: paths.map(path => ({path, sha256: hash(readFileSync(resolve(root, path)))})),
      corpus_sha256: hash(readFileSync(options.cases)), live_observations_sha256: options.live ? hash(readFileSync(options.live)) : null,
      meaning: 'This execution reran local models and read supplied observations. It did not contact a live service.'};
    const bytes = Buffer.from(JSON.stringify(result, null, 2) + '\n');
    mkdirSync(dirname(options.output), {recursive: true}); writeFileSync(options.output, bytes, {flag: 'wx'});
    if (hash(readFileSync(options.output)) !== hash(bytes)) throw Error('OUTPUT_READBACK_MISMATCH');
    console.log(JSON.stringify({output: options.output, output_sha256: hash(bytes), comparison_fingerprint: result.comparison_fingerprint, ...result.summary}, null, 2));
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
