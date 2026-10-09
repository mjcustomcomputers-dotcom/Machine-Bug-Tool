import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('network UI requests native data only when consented and avoids hidden transfers',()=>{
  const js=read('desktop/renderer/network-reader.js'),html=read('desktop/renderer/index.html');
  assert.match(html,/data-view="network" aria-controls="view-network"/u);
  assert.match(js,/networkSnapshot\(\{projectId:current,consent:true\}\)/u);
  assert.match(js,/network-consent'\)\.checked/u);
  assert.match(js,/network-clear'\)\.addEventListener\('click'/u);
  assert.match(js,/network-use'\)\.addEventListener\('click'/u);
  assert.match(js,/\.textContent=String\(value\)/u);
  assert.doesNotMatch(js,/fetch\(|new WebSocket|\.innerHTML|setInterval|execFile|child_process/u);
  assert.match(html,/readonly spellcheck="false" placeholder="Take one permitted snapshot/u);
});
test('native bridge accepts no arbitrary scripts, targets, or false consent',()=>{
  const p=read('desktop/preload.cjs'),m=read('desktop/main.mjs');
  assert.match(p,/Object\.keys\(input\)\.some\(key=>!\['consent','projectId'\]\.includes\(key\)\)/u);
  assert.match(m,/input\.projectId!==workspaceService\.service\?\.activeProjectId/u);
  assert.match(m,/assertTrustedSender\(event\)/u);
  assert.match(m,/networkObserver\?\.stop\(\)/u);
  assert.match(m,/networkObserver=createWindowsNetworkObserver\(\)/u);
});
