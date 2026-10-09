#!/usr/bin/env node
// Offline-only CLI. No network, connector dispatch, target scan, or mutation.
import {lstatSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {forecastDefensiveThreats} from '../lib/defensive-threat-forecast.mjs';
export function runDefensiveForecastFile(path){
 const full=resolve(path),stat=lstatSync(full);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('FORECAST_INPUT_MUST_BE_REGULAR_BOUNDED_LOCAL_JSON');
 return forecastDefensiveThreats(JSON.parse(readFileSync(full,'utf8')));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--input')throw Error('USAGE: node scripts/run-defensive-threat-forecast.mjs --input local-sanitized-input.json');
  console.log(JSON.stringify(runDefensiveForecastFile(process.argv[3]),null,2));
 }catch(err){console.error(err.message);process.exitCode=1;}
}
