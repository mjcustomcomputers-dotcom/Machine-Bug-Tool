import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ESLint} from 'eslint';

import {callTool,toolList} from '../lib/tools.mjs';

test('landing page stays synchronized with the hosted runtime inventory',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const shown=[...page.matchAll(/<strong>([a-z][a-z0-9_]*)<\/strong>\s+—/g)].map(([,name])=>name).sort();
 assert.deepEqual(shown,toolList.map(({name})=>name).sort());

 const evaluatorCount=page.match(/run (\d+) bounded evaluators/);
 assert.ok(evaluatorCount,'landing page must state its evaluator count');
 const status=await callTool('runtime_status',{});
 assert.equal(Number(evaluatorCount[1]),status.implemented_evaluators);
});

test('eslint excludes generated framework and managed runtime state',async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 const eslint=new ESLint({cwd});
 for(const path of ['.next/probe.js','.vinext/probe.js','dist/probe.js','.wrangler/probe.js','.sites-runtime/probe.js']){
  assert.equal(await eslint.isPathIgnored(path),true,path);
 }
 assert.equal(await eslint.isPathIgnored('app/page.tsx'),false);
});
