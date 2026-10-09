import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

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
