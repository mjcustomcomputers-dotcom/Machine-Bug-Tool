#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createScreenOcr,inspectScreenOcrAssets} from '../lib/mpc-screen-ocr.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const EXPECTED=['MPC SCREEN OCR','LOCAL PRIVATE CAPTURE','1234567890'];

/** Run the real bundled WASM engine and trained data, with the worker's egress guards active. */
export async function smokeMpcScreenOcr({assetRoot=resolve(ROOT,'.sites-runtime','mpc-ocr'),receiptPath}={}){
  const assets=inspectScreenOcrAssets(resolve(assetRoot));
  const png=readFileSync(resolve(ROOT,'tests','fixtures','screen-ocr','local-screen-text.png'));
  const ocr=createScreenOcr({assetRoot:assets.root,timeoutMs:60_000});
  const previousCwd=process.cwd();
  const temporary=mkdtempSync(join(tmpdir(),'mpc-ocr-offline-smoke-'));
  try{
    process.chdir(temporary);
    const started=performance.now();
    const result=await ocr.recognize(png,{language:'eng'});
    const firstMs=performance.now()-started;
    const normalized=result.text.replace(/\s+/gu,' ').trim();
    for(const phrase of EXPECTED)assert.ok(normalized.includes(phrase),`Fixture phrase missing: ${phrase}`);
    assert.equal(result.network,'DISABLED');
    assert.equal(result.engine,'tesseract.js@6.0.1');
    assert.equal(result.trust,'UNTRUSTED_SCREEN_OCR');
    assert.equal(result.source_authentication,false);
    assert.equal(result.width,1100);
    assert.equal(result.height,280);
    assert.ok(result.words.length>=7,'Real OCR word geometry is required');
    for(const word of result.words){
      assert.ok(word.text.length>0);
      assert.ok(word.bbox.x0>=0&&word.bbox.y0>=0&&word.bbox.x1<=1100&&word.bbox.y1<=280);
      assert.ok(word.bbox.x1>word.bbox.x0&&word.bbox.y1>word.bbox.y0);
    }
    assert.equal(result.invalid_geometry_count,0);
    const warmStarted=performance.now();
    const repeat=await ocr.recognize(png,{language:'eng'});
    const repeatMs=performance.now()-warmStarted;
    assert.equal(repeat.text,result.text);
    assert.equal(repeat.network,'DISABLED');
    assert.equal(ocr.status().state,'READY');
    assert.deepEqual(readdirSync(temporary),[],'OCR must not create a disk cache');
    const receipt={
      format_version:'MPC_SCREEN_OCR_SMOKE_1',
      status:'PASS',
      fixture:'tests/fixtures/screen-ocr/local-screen-text.png',
      engine:result.engine,
      language:result.language,
      network:result.network,
      expected_phrases:EXPECTED,
      recognized_fixture_text:normalized,
      word_count:result.words.length,
      line_count:result.lines.length,
      block_count:result.blocks.length,
      invalid_geometry_count:result.invalid_geometry_count,
      runtime_cache_files:0,
      repeated_in_same_worker:true,
      first_recognition_ms:Math.round(firstMs*100)/100,
      repeat_recognition_ms:Math.round(repeatMs*100)/100,
      host:{node:process.version,platform:process.platform,architecture:process.arch},
      native_windows_capture_performed:false,
    };
    if(receiptPath)writeFileSync(resolve(previousCwd,receiptPath),`${JSON.stringify(receipt,null,2)}\n`,{encoding:'utf8',flag:'wx',mode:0o600});
    return receipt;
  }finally{
    await ocr.close();
    png.fill(0);
    process.chdir(previousCwd);
    rmSync(temporary,{recursive:true,force:true});
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=process.argv.slice(2),options={};
    for(let index=0;index<args.length;index+=2){
      const key=args[index]==='--asset-root'?'assetRoot':args[index]==='--receipt'?'receiptPath':null;
      if(!key||options[key]!==undefined||index+1>=args.length)throw new Error('MPC_SCREEN_OCR_SMOKE_ARGUMENT_INVALID');
      options[key]=args[index+1];
    }
    const receipt=await smokeMpcScreenOcr(options);
    process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
  }catch(error){
    process.stderr.write(`${JSON.stringify({status:'ERROR',error:String(error?.code??error?.message??'MPC_SCREEN_OCR_SMOKE_FAILED').slice(0,400)})}\n`);
    process.exitCode=1;
  }
}
