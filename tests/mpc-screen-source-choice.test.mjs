import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {screenSourceStartGate,SCREEN_SOURCE_REFRESH_AFTER_MS} from '../desktop/renderer/screen-source-choice.js';

const state=(extra={})=>({sourceIds:['window:11:0','screen:1:0'],selectedId:'window:11:0',
  consent:true,listedAt:1000,now:2000,...extra});

test('Start is blocked without a user-selected native screen or session permission',()=>{
  assert.deepEqual(screenSourceStartGate(state()),{allowed:true,code:null});
  for(const extra of [{sourceIds:[]},{selectedId:''},{selectedId:'window:99:0'},
    {selectedId:'screen:1:0',consent:false},{consent:false}]){
    assert.equal(screenSourceStartGate(state(extra)).allowed,false);
  }
  assert.equal(screenSourceStartGate(state({sourceIds:[]})).code,'SCREEN_CHOOSE_SOURCE');
  assert.equal(screenSourceStartGate(state({consent:false})).code,'SCREEN_PERMISSION_REQUIRED');
});

test('Start requires a recent source enumeration; expired or future lists cannot authorize capture',()=>{
  const base=1000;
  assert.equal(screenSourceStartGate(state({listedAt:base,now:base+SCREEN_SOURCE_REFRESH_AFTER_MS-1})).allowed,true);
  for(const extra of [{listedAt:base,now:base+SCREEN_SOURCE_REFRESH_AFTER_MS},
    {listedAt:base,now:base+SCREEN_SOURCE_REFRESH_AFTER_MS+1},{listedAt:0},
    {listedAt:base,now:base-1},{listedAt:NaN},{now:NaN}]){
    assert.equal(screenSourceStartGate(state(extra)).code,'SCREEN_REFRESH_SOURCE_LIST');
  }
});

test('visible Start is gated and an expired native ID produces explicit refresh guidance',()=>{
  const source=readFileSync(new URL('../desktop/renderer/screen-reader.js',import.meta.url),'utf8');
  assert.match(source,/screen-start'\)\.disabled=!available\|\|active\|\|starting\|\|!selectionGate\(\)\.allowed/u);
  assert.match(source,/select\.value=rows\.some\(row=>row\.id===previous\)\?previous:''/u);
  assert.match(source,/const prompt=document\.createElement\('option'\);prompt\.value='';prompt\.disabled=true/u);
  assert.match(source,/detail\.includes\('SCREEN_REFRESH_SOURCE_LIST'\)/u);
  assert.match(source,/input\.addEventListener\('change',[^]*?buttons\(\)/u);
});
