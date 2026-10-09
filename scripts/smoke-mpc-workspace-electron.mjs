#!/usr/bin/env node
// Run with the pinned Electron under an isolated Xvfb desktop in CI.
// Exercises production IPC, capture permissions, pixels and OCR unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow, nativeImage} from 'electron';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputFlag = process.argv.indexOf('--output');
const OUTPUT = resolve(outputFlag === -1 ? join(ROOT, '.sites-runtime', 'electron-smoke') : process.argv[outputFlag + 1]);
mkdirSync(OUTPUT, {recursive: true});
const DATA = mkdtempSync(join(tmpdir(), 'mpc-electron-native-smoke-'));
// Keep all app state away from the developer's/user's normal data. No HOME override.
app.setPath('userData', DATA);
const started = Date.now();
const checks = [];
let main = null, fixture = null, finished = false;
const receipt = {schema_version: 'MPC_ELECTRON_NATIVE_SMOKE_1', status: 'RUNNING',
  host: {platform: process.platform, architecture: process.arch, electron: process.versions.electron, node: process.versions.node},
  source_fingerprints: Object.fromEntries(['desktop/main.mjs', 'desktop/screen-host.mjs', 'desktop/renderer/capture.js',
    'desktop/renderer/screen-reader.js', 'scripts/mpc-workspace-server.mjs'].map(path =>
    [path, createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex')])),
  data_isolated: true, source: 'SYNTHETIC_LOCAL_FIXTURE_ONLY', native_windows_capture_performed: false,
  production_permission_handlers_used: true, checks};
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const js = expression => main.webContents.executeJavaScript(`(async()=>{${expression}})()`);

async function waitFor(label, predicate, maximum = 15_000) {
  const until = Date.now() + maximum;
  let lastError;
  while (Date.now() < until && Date.now() - started < 85_000) {
    try { const result = await predicate(); if (result) return result; } catch (error) { lastError = error; }
    await pause(60);
  }
  throw Error(`SMOKE_TIMEOUT:${label}${lastError ? `:${String(lastError.message).slice(0, 200)}` : ''}`);
}
function saveReceipt(status, error = null) {
  receipt.status = status;
  receipt.elapsed_ms = Date.now() - started;
  if (error) receipt.error = String(error?.stack ?? error).slice(0, 12_000);
  writeFileSync(join(OUTPUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}
async function diagnosticScreenshot(name) {
  if (main && !main.isDestroyed()) {
    try { writeFileSync(join(OUTPUT, name), (await main.webContents.capturePage()).toPNG()); } catch {}
  }
}
async function finish(status, error) {
  if (finished) return;
  finished = true;
  // Keep the global deadline active during cleanup as well: an unresponsive
  // renderer or native service must not leave the CI process running forever.
  try { if (main && !main.isDestroyed()) await js('return window.mpcWorkspace.screenStop();'); } catch {}
  if (error) await diagnosticScreenshot('failure.png');
  try {
    if (main && !main.isDestroyed()) receipt.final_screen_status = await js('return window.mpcWorkspace.screenStatus();');
  } catch {}
  saveReceipt(status, error);
  if (fixture && !fixture.isDestroyed()) fixture.destroy();
  process.stdout.write(`${JSON.stringify({status, elapsed_ms: receipt.elapsed_ms, checks: checks.length, output: OUTPUT, error: error ? String(error.message ?? error) : null})}\n`);
  process.exitCode = status === 'PASS' ? 0 : 1;
  // A normal successful quit exercises the app's cleanup. Its own before-quit
  // handler chooses a zero exit code, so a failed test must retain exit code 1.
  if (status === 'PASS') app.quit();
  else app.exit(1);
}
const watchdog = setTimeout(() => {
  saveReceipt('FAIL', Error('SMOKE_GLOBAL_90_SECOND_DEADLINE'));
  process.stderr.write('MPC native Electron smoke exceeded its 90-second deadline.\n');
  app.exit(1);
}, 90_000);
process.once('exit', () => { try { rmSync(DATA, {recursive: true, force: true}); } catch {} });

function cleanEvents(events) {
  return events.map(event => ({type: event.type, reason: event.reason, code: event.code,
    ...(event.receipt ? {frame: event.receipt.frame, text: event.receipt.ocr?.text,
      capture_to_delivery_ms: event.receipt.capture_to_delivery_ms, ocr_duration_ms: event.receipt.ocr_duration_ms} : {})}));
}
async function captureRun(input, name) {
  await js('window.__mpcNativeSmoke.events=[];');
  const state = await js(`return window.mpcWorkspace.screenStart(${JSON.stringify(input)});`);
  assert.equal(state.state, 'CAPTURING');
  const result = await waitFor(`${name} OCR result`, async () => {
    const events = await js('return window.__mpcNativeSmoke.events;');
    return events.find(event => event.type === 'ERROR' || event.type === 'RESULT') ?? false;
  }, 25_000);
  if (result.type === 'ERROR') throw Error(`NATIVE_CAPTURE_ERROR:${result.code}`);
  await waitFor(`${name} automatic stop`, async () => (await js('return window.mpcWorkspace.screenStatus();')).state === 'STOPPED');
  const events = await js('return window.__mpcNativeSmoke.events;');
  receipt[name] = {events: cleanEvents(events), result: result.receipt};
  return {result: result.receipt, events};
}
async function layout(width, height) {
  main.setContentSize(width, height);
  main.show(); main.focus();
  await pause(200);
  await js("document.querySelector('[data-view=screen]').click();");
  await pause(120);
  const screen = await js(`
    const bounds=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    const view=document.querySelector('#workspace-main');
    return {width:innerWidth,height:innerHeight,document_width:document.documentElement.scrollWidth,
      content_client_width:view.clientWidth,content_scroll_width:view.scrollWidth,
      output:bounds('.screen-output'),options:bounds('.screen-options'),start:bounds('#screen-start')};
  `);
  assert.equal(screen.width, width); assert.equal(screen.height, height);
  assert.ok(screen.document_width <= width + 1, 'Document horizontal overflow');
  assert.ok(screen.content_scroll_width <= screen.content_client_width + 1, 'Screen view horizontal overflow');
  assert.ok(screen.output.right <= screen.options.x + 1 || screen.output.bottom <= screen.options.y + 1,
    'Screen output overlaps its settings');
  assert.ok(screen.start.x >= 0 && screen.start.right <= width && screen.start.y >= 0 && screen.start.bottom <= height,
    'Start control must be visible without horizontal scrolling');
  await diagnosticScreenshot(`screen-${width}x${height}.png`);
  await js("document.querySelector('[data-view=connections]').click(); document.querySelector('[data-provider=GITHUB] button').click();");
  await waitFor('connection dialog', () => js("return document.querySelector('#connection-dialog').open;"));
  const dialog = await js(`const d=document.querySelector('#connection-dialog'),r=d.getBoundingClientRect();return {
    x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,client_width:d.clientWidth,scroll_width:d.scrollWidth};`);
  assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.right <= width + 1 && dialog.bottom <= height + 1,
    'Connection dialog is outside the viewport');
  assert.ok(dialog.scroll_width <= dialog.client_width + 1, 'Connection dialog horizontal overflow');
  await diagnosticScreenshot(`connection-${width}x${height}.png`);
  await js("document.querySelector('#close-connection-dialog').click();");
  checks.push({check: 'NATIVE_RENDERED_LAYOUT', width, height, screen, dialog});
}

try {
  await import('../desktop/main.mjs');
  await app.whenReady();
  main = await waitFor('actual app renderer startup', async () => {
    const candidate = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() &&
      /^http:\/\/127\.0\.0\.1:\d+\//u.test(window.webContents.getURL()));
    if (!candidate) return false;
    const ready = await candidate.webContents.executeJavaScript("typeof window.mpcWorkspace?.screenStart==='function' && !!document.querySelector('[data-provider=GITHUB]')");
    return ready ? candidate : false;
  });
  const uiErrors = [];
  main.webContents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event.level ?? legacyLevel, message = event.message ?? legacyMessage;
    if ((level >= 2 || level === 'warning' || level === 'error') && uiErrors.length < 50) uiErrors.push(String(message).slice(0, 1000));
  });
  await js(`
    const boot=await fetch('/api/workspace/bootstrap').then(response=>response.json());
    const response=await fetch('/api/workspace/projects',{method:'POST',headers:{'Content-Type':'application/json','X-MPC-CSRF':boot.csrf_token},
      body:JSON.stringify({operation:'CREATE',project_id:'NATIVE-SMOKE',display_name:'Synthetic native smoke',retention_policy:'METADATA_ONLY'})});
    if(!response.ok)throw Error('SMOKE_PROJECT_CREATE:'+response.status+':'+await response.text());
  `);
  // Wait for a completed navigation before querying readiness so the old
  // document cannot satisfy the condition and discard the observer on reload.
  await new Promise((resolveLoad, rejectLoad) => {
    const loaded = () => { clearTimeout(timeout); resolveLoad(); };
    const timeout = setTimeout(() => {
      main.webContents.removeListener('did-finish-load', loaded);
      rejectLoad(Error('SMOKE_PROJECT_RELOAD_TIMEOUT'));
    }, 15_000);
    main.webContents.once('did-finish-load', loaded);
    main.webContents.reload();
  });
  await waitFor('reloaded project state', () => js("return typeof window.mpcWorkspace?.screenStart==='function' && !!document.querySelector('[data-provider=GITHUB]');"));
  // Install the test observation listener after reload; all operations still use
  // the unchanged native preload and trusted renderer authentication.
  await js(`window.__mpcNativeSmoke={events:[]};window.mpcWorkspace.onScreenEvent(event=>{
    const copy={...event};if(copy.png)copy.png=Array.from(copy.png);window.__mpcNativeSmoke.events.push(copy);
    if(window.__mpcNativeSmoke.events.length>60)window.__mpcNativeSmoke.events.shift();});`);
  checks.push({check: 'ACTUAL_APP_START_AND_ISOLATED_PROJECT', status: 'PASS'});
  await layout(1366, 768);
  await layout(1920, 1080);

  fixture = new BrowserWindow({title: 'MPC Synthetic Screen Fixture', x: 0, y: 0, width: 1280, height: 480,
    frame: false, show: true, alwaysOnTop: true, resizable: false,
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}});
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MPC Synthetic Screen Fixture</title>
    <style>html,body{margin:0;width:100%;height:100%;background:white;color:black;font:48px/1.2 Arial,sans-serif}p{position:absolute;left:32px;margin:0;white-space:nowrap}.one{top:36px}.two{top:130px}.secret{top:240px}.digits{top:345px}</style></head>
    <body><p class="one">MPC SCREEN OCR</p><p class="two">LOCAL PRIVATE CAPTURE</p><p class="secret">MASKED SECRET 778899</p><p class="digits">1234567890</p></body></html>`;
  await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  fixture.show(); fixture.moveTop();
  await pause(300);
  const sourceList = await js('return window.mpcWorkspace.screenSources();');
  const selectedWindow = sourceList.sources.find(source => source.kind === 'window' && source.name === 'MPC Synthetic Screen Fixture');
  const selected = selectedWindow ?? sourceList.sources.find(source => source.kind === 'screen');
  assert.ok(selected, 'No native fixture window or screen source was enumerated');
  const crop = selectedWindow ? {x: 0, y: 0, width: 1, height: 1}
    : {x: 0, y: 0, width: 1280 / selected.pixelWidth, height: 480 / selected.pixelHeight};
  const mask = selectedWindow ? {x: 0, y: 220 / 480, width: 1, height: 110 / 480}
    : {x: 0, y: 220 / selected.pixelHeight, width: 1280 / selected.pixelWidth, height: 110 / selected.pixelHeight};
  const input = {sourceId: selected.id, projectId: 'NATIVE-SMOKE', consent: true, mode: 'single', fps: 1,
    crop, masks: [], preview: true, printScreen: false, excludeMpc: true, durationMinutes: 5};
  receipt.selected_source = selected;
  const unmasked = await captureRun(input, 'unmasked');
  const unmaskedText = unmasked.result.ocr.text.replace(/\s+/gu, ' ');
  for (const phrase of ['MPC SCREEN OCR', 'LOCAL PRIVATE CAPTURE', 'MASKED SECRET 778899', '1234567890']) {
    assert.ok(unmaskedText.includes(phrase), `Native OCR did not recognize ${phrase}`);
  }
  assert.equal(unmasked.result.ocr.network, 'DISABLED');
  assert.equal(unmasked.result.context.projectId, 'NATIVE-SMOKE');
  checks.push({check: 'NATIVE_PIXELS_REAL_LOCAL_OCR', width: unmasked.result.frame.width,
    height: unmasked.result.frame.height, word_count: unmasked.result.ocr.words.length, status: 'PASS'});

  const masked = await captureRun({...input, masks: [mask]}, 'masked');
  const maskedText = masked.result.ocr.text.replace(/\s+/gu, ' ');
  for (const phrase of ['MPC SCREEN OCR', 'LOCAL PRIVATE CAPTURE', '1234567890']) assert.ok(maskedText.includes(phrase));
  assert.ok(!maskedText.includes('SECRET') && !maskedText.includes('778899'), 'Masked text reached OCR');
  const preview = masked.events.find(event => event.type === 'PREVIEW');
  assert.ok(preview?.png?.length, 'Masked native preview was not delivered');
  const image = nativeImage.createFromBuffer(Buffer.from(preview.png));
  const size = image.getSize(); const pixels = image.toBitmap();
  assert.ok(size.width <= 800 && size.height <= 450 && size.width > 0 && size.height > 0);
  const offset = (Math.floor(size.height * 0.56) * size.width + Math.floor(size.width * 0.5)) * 4;
  assert.deepEqual([...pixels.subarray(offset, offset + 3)], [0, 0, 0], 'Privacy region was not black in the delivered preview');
  writeFileSync(join(OUTPUT, 'masked-preview.png'), image.toPNG());
  checks.push({check: 'MASK_APPLIED_BEFORE_OCR_AND_PREVIEW', preview: size, status: 'PASS'});

  // Exercise the visible Start and Stop controls as well as the direct trusted
  // IPC used above. The test consents only to its own synthetic fixture.
  await js("document.querySelector('[data-view=screen]').click();document.querySelector('#screen-refresh').click();");
  await waitFor('UI source enumeration', () => js(`return [...document.querySelector('#screen-source').options].some(option=>option.value===${JSON.stringify(selected.id)});`));
  await js(`
    window.__mpcNativeSmoke.events=[];
    document.querySelector('#screen-source').value=${JSON.stringify(selected.id)};
    document.querySelector('#screen-mode').value='live';document.querySelector('#screen-fps').value='1';
    document.querySelector('#screen-duration').value='5';document.querySelector('#screen-consent').checked=true;
    document.querySelector('#screen-preview-enabled').checked=true;
    document.querySelector('#screen-exclude-mpc').checked=true;
    const crop=${JSON.stringify(crop)};
    for(const [field,key] of [['x','x'],['y','y'],['w','width'],['h','height']]) document.querySelector('#screen-crop-'+field).value=String(crop[key]*100);
    document.querySelector('#screen-start').click();
  `);
  await waitFor('live pixels before Stop', () => js("return window.__mpcNativeSmoke.events.some(event=>event.type==='PREVIEW');"), 15_000);
  assert.equal(await js("return document.querySelector('#screen-stop').disabled;"), false);
  await js("document.querySelector('#screen-stop').click();");
  await waitFor('actual UI Stop', async () => (await js('return window.mpcWorkspace.screenStatus();')).state === 'STOPPED');
  const atStop = await js("return window.__mpcNativeSmoke.events.filter(event=>event.type==='RESULT').length;");
  await pause(700);
  const afterStop = await js("return window.__mpcNativeSmoke.events.filter(event=>event.type==='RESULT').length;");
  assert.equal(afterStop, atStop, 'A revoked capture published a later result');
  const remaining = BrowserWindow.getAllWindows().filter(window => window !== main && window !== fixture && !window.isDestroyed());
  assert.equal(remaining.length, 0, 'Capture or indicator window survived Stop');
  checks.push({check: 'UI_START_STOP_REVOKES_MEDIA_AND_NO_LATE_RESULT', status: 'PASS'});
  fixture.hide();
  receipt.ui_console_errors = uiErrors;
  await finish('PASS');
} catch (error) {
  await finish('FAIL', error);
}
