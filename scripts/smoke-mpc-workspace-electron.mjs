#!/usr/bin/env node
// Run with the pinned Electron under an isolated Xvfb desktop in CI.
// Exercises production IPC, capture permissions, pixels and OCR unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow, nativeImage, screen as nativeScreen} from 'electron';
import {proposeInverseOcrCrop} from '../desktop/renderer/roi-process.js';

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
const receipt = {schema_version: 'MPC_ELECTRON_NATIVE_SMOKE_2', status: 'RUNNING', phase: 'INITIALIZING',
  host: {platform: process.platform, architecture: process.arch, electron: process.versions.electron, node: process.versions.node},
  source_fingerprints: Object.fromEntries(['scripts/smoke-mpc-workspace-electron.mjs', 'desktop/main.mjs', 'desktop/screen-host.mjs', 'desktop/renderer/capture.js',
    'desktop/renderer/screen-reader.js', 'scripts/mpc-workspace-server.mjs'].map(path =>
    [path, createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex')])),
  data_isolated: true, source: 'SYNTHETIC_LOCAL_FIXTURE_ONLY', native_windows_capture_performed: false,
  production_permission_handlers_used: true, checks, breadcrumbs: [], runtime_events: [], cleanup_errors: []};
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const js = expression => main.webContents.executeJavaScript(`(async()=>{${expression}})()`);

async function waitFor(label, predicate, maximum = 15_000) {
  phase(`WAIT: ${label}`, {maximum_ms: maximum});
  const until = Date.now() + maximum;
  let lastError;
  while (Date.now() < until && Date.now() - started < 85_000) {
    try {
      const result = await predicate();
      if (result) { breadcrumb('WAIT_COMPLETED', {label}); return result; }
    } catch (error) {
      if (String(error?.message) !== String(lastError?.message)) breadcrumb('WAIT_PREDICATE_ERROR', {label, error: errorText(error)});
      lastError = error;
    }
    await pause(60);
  }
  throw Error(`SMOKE_TIMEOUT:${label}${lastError ? `:${String(lastError.message).slice(0, 200)}` : ''}`);
}
function saveReceipt(status, error = null) {
  receipt.status = status;
  receipt.elapsed_ms = Date.now() - started;
  if (error && !receipt.error) { receipt.error = errorText(error); receipt.error_phase = receipt.phase; }
  writeFileSync(join(OUTPUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}
function errorText(error) { return String(error?.stack ?? error).slice(0, 12_000); }
function runtimeState() {
  const ready = app.isReady();
  return {app_ready: ready, windows: ready ? BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).map(window => ({
    id: window.id, title: window.getTitle(), loading: window.webContents.isLoading(),
    url: window.webContents.getURL().startsWith('data:') ? 'data:synthetic-or-error-page' : window.webContents.getURL().slice(0, 300)
  })) : []};
}
function breadcrumb(event, details = {}) {
  const row = {elapsed_ms: Date.now() - started, event, phase: receipt.phase, ...details};
  if (receipt.breadcrumbs.length < 200) receipt.breadcrumbs.push(row);
  appendFileSync(join(OUTPUT, 'breadcrumbs.jsonl'), `${JSON.stringify(row)}\n`);
  saveReceipt(receipt.status);
  process.stdout.write(`MPC_NATIVE_SMOKE ${JSON.stringify(row)}\n`);
}
function phase(value, details = {}) {
  receipt.phase = value;
  receipt.runtime_state = runtimeState();
  breadcrumb('PHASE', details);
}
function runtimeEvent(event, details = {}) {
  if (receipt.runtime_events.length >= 100) return;
  receipt.runtime_events.push({elapsed_ms: Date.now() - started, event, ...details});
  saveReceipt(receipt.status);
}
async function diagnosticScreenshot(name) {
  if (main && !main.isDestroyed()) {
    try {
      // Wait for the changed view/dialog to reach the compositor. DOM bounds
      // can be current while capturePage still holds the preceding frame.
      await js('await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
      await pause(50);
      writeFileSync(join(OUTPUT, name), (await main.webContents.capturePage()).toPNG());
    } catch {}
  }
}
async function finish(status, error) {
  if (finished) return;
  finished = true;
  // Persist the original assertion/phase before any asynchronous cleanup. A
  // later stuck screenshot or IPC must not replace the useful failure cause.
  receipt.validation_status = status;
  saveReceipt(status, error);
  breadcrumb('VALIDATION_FINISHED', {status, error: error ? errorText(error) : null});
  let finalStatus = status;
  async function cleanup(label, operation) {
    phase(`CLEANUP: ${label}`);
    let timeout;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error(`SMOKE_CLEANUP_TIMEOUT:${label}`)), 2_000);
      })]);
    } catch (failure) {
      finalStatus = 'FAIL';
      receipt.cleanup_errors.push({phase: receipt.phase, error: errorText(failure)});
      saveReceipt('FAIL', failure);
    } finally { clearTimeout(timeout); }
  }
  // Keep the global deadline active during cleanup as well: an unresponsive
  // renderer or native service must not leave the CI process running forever.
  if (main && !main.isDestroyed()) await cleanup('screen stop', () => js('return window.mpcWorkspace.screenStop();'));
  if (error) await cleanup('failure screenshot', () => diagnosticScreenshot('failure.png'));
  if (main && !main.isDestroyed()) receipt.final_screen_status = await cleanup('screen status', () => js('return window.mpcWorkspace.screenStatus();'));
  if (fixture && !fixture.isDestroyed()) fixture.destroy();
  phase(finalStatus === 'PASS' ? 'APP_QUIT' : 'APP_EXIT_FAILURE');
  saveReceipt(finalStatus);
  process.stdout.write(`${JSON.stringify({status: finalStatus, elapsed_ms: receipt.elapsed_ms, checks: checks.length, output: OUTPUT, error: receipt.error ?? null})}\n`);
  process.exitCode = finalStatus === 'PASS' ? 0 : 1;
  // A normal successful quit exercises the app's cleanup. Its own before-quit
  // handler chooses a zero exit code, so a failed test must retain exit code 1.
  if (finalStatus === 'PASS') app.quit();
  else app.exit(1);
}
const watchdog = setTimeout(() => {
  receipt.deadline = {phase: receipt.phase, runtime_state: runtimeState(), elapsed_ms: Date.now() - started};
  saveReceipt('FAIL', Error('SMOKE_GLOBAL_90_SECOND_DEADLINE'));
  breadcrumb('GLOBAL_DEADLINE');
  process.stderr.write('MPC native Electron smoke exceeded its 90-second deadline.\n');
  app.exit(1);
}, 90_000);
process.once('exit', () => { try { rmSync(DATA, {recursive: true, force: true}); } catch {} });
app.on('ready', () => runtimeEvent('APP_READY'));
app.on('browser-window-created', (_event, window) => {
  runtimeEvent('WINDOW_CREATED', {id: window.id});
  window.webContents.on('did-finish-load', () => runtimeEvent('WINDOW_LOADED', {id: window.id, title: window.getTitle()}));
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => runtimeEvent('WINDOW_LOAD_FAILED', {id: window.id, code, description, isMainFrame}));
  window.webContents.on('preload-error', (_event, _path, error) => runtimeEvent('PRELOAD_ERROR', {id: window.id, error: errorText(error)}));
  window.webContents.on('render-process-gone', (_event, details) => runtimeEvent('RENDER_PROCESS_GONE', {id: window.id, reason: details.reason, exit_code: details.exitCode}));
  window.webContents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event.level ?? legacyLevel, message = event.message ?? legacyMessage;
    if (level >= 2 || level === 'warning' || level === 'error') runtimeEvent('RENDERER_CONSOLE', {id: window.id, level, message: String(message).slice(0, 1_200)});
  });
});
process.on('uncaughtException', error => { void finish('FAIL', error); });
process.on('unhandledRejection', error => { void finish('FAIL', error); });

function cleanEvents(events) {
  return events.map(event => ({type: event.type, reason: event.reason, code: event.code,
    ...(event.type === 'ERROR' ? {diagnostic: Object.fromEntries(Object.entries(event).filter(([key]) =>
      !['type', 'png', 'receipt'].includes(key)))} : {}),
    ...(event.receipt ? {frame: event.receipt.frame, text: event.receipt.ocr?.text,
      capture_to_delivery_ms: event.receipt.capture_to_delivery_ms, ocr_duration_ms: event.receipt.ocr_duration_ms} : {})}));
}
async function captureRun(input, name) {
  receipt[name] = {input, status: 'STARTING', events: []};
  phase(`CAPTURE: ${name} clear events`);
  await js('window.__mpcNativeSmoke.events=[];');
  phase(`CAPTURE: ${name} native start`);
  const state = await js(`return window.mpcWorkspace.screenStart(${JSON.stringify(input)});`);
  receipt[name].start_state = state;
  breadcrumb('CAPTURE_STARTED', {name, state: state.state});
  assert.equal(state.state, 'CAPTURING');
  const result = await waitFor(`${name} OCR result`, async () => {
    const events = await js('return window.__mpcNativeSmoke.events;');
    // Preserve native failures before throwing, even when the worker is already
    // destroyed and the normal success/result assignment is never reached.
    receipt[name].events = cleanEvents(events);
    saveReceipt(receipt.status);
    return events.find(event => event.type === 'ERROR' || event.type === 'RESULT') ?? false;
  }, 25_000);
  if (result.type === 'ERROR') {
    receipt[name].status = 'FAILED';
    breadcrumb('CAPTURE_FAILED', {name, code: result.code});
    throw Error(`NATIVE_CAPTURE_ERROR:${result.code}`);
  }
  await waitFor(`${name} automatic stop`, async () => (await js('return window.mpcWorkspace.screenStatus();')).state === 'STOPPED');
  const events = await js('return window.__mpcNativeSmoke.events;');
  Object.assign(receipt[name], {status: 'COMPLETED', events: cleanEvents(events), result: result.receipt});
  breadcrumb('CAPTURE_COMPLETED', {name, event_count: events.length});
  return {result: result.receipt, events};
}
async function layout(width, height) {
  phase(`LAYOUT: ${width}x${height} resize`);
  main.setPosition(0, 0);
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
      output:bounds('.screen-output'),options:bounds('.screen-options'),start:bounds('#screen-start'),
      consent:bounds('.screen-consent'),copy:bounds('#screen-copy'),hold:bounds('#screen-hold-text')};
  `);
  assert.equal(screen.width, width); assert.equal(screen.height, height);
  assert.ok(screen.document_width <= width + 1, 'Document horizontal overflow');
  assert.ok(screen.content_scroll_width <= screen.content_client_width + 1, 'Screen view horizontal overflow');
  assert.ok(screen.output.right <= screen.options.x + 1 || screen.output.bottom <= screen.options.y + 1,
    'Screen output overlaps its settings');
  assert.ok(screen.start.x >= 0 && screen.start.right <= width && screen.start.y >= 0 && screen.start.bottom <= height,
    'Start control must be visible without horizontal scrolling');
  for (const control of ['consent','copy']) assert.ok(screen[control].x >= 0 && screen[control].right <= width &&
    screen[control].y >= 0 && screen[control].bottom <= height, `${control} control must be visible in the initial screen view`);
  assert.ok(screen.hold.width <= 24 && screen.hold.height <= 24, 'Hold-text checkbox must keep its intended compact size');
  await diagnosticScreenshot(`screen-${width}x${height}.png`);
  await js("document.querySelector('[data-view=connections]').click(); document.querySelector('[data-provider=GITHUB] .connection-primary').click();");
  await waitFor('connector setup dialog', () => js("return document.querySelector('#connector-setup-dialog').open;"));
  const dialog = await js(`const d=document.querySelector('#connector-setup-dialog'),r=d.getBoundingClientRect();return {
    x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,client_width:d.clientWidth,scroll_width:d.scrollWidth};`);
  assert.ok(dialog.x >= 0 && dialog.y >= 0 && dialog.right <= width + 1 && dialog.bottom <= height + 1,
    'Connector setup dialog is outside the viewport');
  assert.ok(dialog.scroll_width <= dialog.client_width + 1, 'Connector setup dialog horizontal overflow');
  await diagnosticScreenshot(`connection-${width}x${height}.png`);
  await js("document.querySelector('#close-connector-setup').click();");
  checks.push({check: 'NATIVE_RENDERED_LAYOUT', width, height, screen, dialog});
  breadcrumb('CHECK_PASSED', {check: 'NATIVE_RENDERED_LAYOUT', width, height});
}

async function run() {
try {
  phase('IMPORT_PRODUCTION_MAIN');
  await import('../desktop/main.mjs');
  phase('AWAIT_APP_READY');
  await app.whenReady();
  phase('FIND_PRODUCTION_RENDERER');
  main = await waitFor('actual app renderer startup', async () => {
    const candidate = BrowserWindow.getAllWindows().find(window => !window.isDestroyed());
    if (!candidate) return false;
    const observed = await candidate.webContents.executeJavaScript(`({
      ready: typeof window.mpcWorkspace?.screenStart==='function' && !!document.querySelector('[data-provider=GITHUB]'),
      startup_error: document.querySelector('#details')?.textContent ?? null
    })`);
    if (observed.startup_error) throw Error(`MPC_WORKSPACE_STARTUP_ERROR:${String(observed.startup_error).slice(0, 1_000)}`);
    return observed.ready && /^http:\/\/127\.0\.0\.1:\d+\//u.test(candidate.webContents.getURL()) ? candidate : false;
  });
  const uiErrors = [];
  main.webContents.on('console-message', (event, legacyLevel, legacyMessage) => {
    const level = event.level ?? legacyLevel, message = event.message ?? legacyMessage;
    if ((level >= 2 || level === 'warning' || level === 'error') && uiErrors.length < 50) uiErrors.push(String(message).slice(0, 1000));
  });
  phase('CREATE_ISOLATED_PROJECT');
  await js(`
    const bootstrap=await fetch('/api/workspace/bootstrap',{credentials:'same-origin',redirect:'error'});
    if(!bootstrap.ok)throw Error('SMOKE_PROJECT_BOOTSTRAP:'+bootstrap.status);
    const boot=await bootstrap.json();
    if(typeof boot.csrf_token!=='string'||!boot.csrf_token)throw Error('SMOKE_PROJECT_CSRF_MISSING');
    const response=await fetch('/api/workspace/projects',{method:'POST',credentials:'same-origin',redirect:'error',
      headers:{'Content-Type':'application/json; charset=utf-8',Accept:'application/json','X-MPC-CSRF':boot.csrf_token},
      body:JSON.stringify({operation:'CREATE',project_id:'NATIVE-SMOKE',display_name:'Synthetic native smoke',retention_policy:'METADATA_ONLY'})});
    if(!response.ok)throw Error('SMOKE_PROJECT_CREATE:'+response.status+':'+await response.text());
    const created=await response.json();
    if(response.status!==201||created.project?.project_id!=='NATIVE-SMOKE'||created.project?.retention_policy!=='METADATA_ONLY')
      throw Error('SMOKE_PROJECT_CREATE_RESPONSE_INVALID');
  `);
  // Wait for a completed navigation before querying readiness so the old
  // document cannot satisfy the condition and discard the observer on reload.
  phase('RELOAD_ISOLATED_PROJECT');
  await new Promise((resolveLoad, rejectLoad) => {
    const loaded = () => { clearTimeout(timeout); resolveLoad(); };
    const timeout = setTimeout(() => {
      main.webContents.removeListener('did-finish-load', loaded);
      rejectLoad(Error('SMOKE_PROJECT_RELOAD_TIMEOUT'));
    }, 15_000);
    main.webContents.once('did-finish-load', loaded);
    main.webContents.reload();
  });
  await waitFor('reloaded project state', () => js("return typeof window.mpcWorkspace?.screenStart==='function' && !!document.querySelector('[data-provider=GITHUB]') && document.querySelector('#project-picker')?.value==='Synthetic native smoke';"));
  // Install the test observation listener after reload; all operations still use
  // the unchanged native preload and trusted renderer authentication.
  await js(`window.__mpcNativeSmoke={events:[]};window.mpcWorkspace.onScreenEvent(event=>{
    const copy={...event};if(copy.png)copy.png=Array.from(copy.png);window.__mpcNativeSmoke.events.push(copy);
    if(window.__mpcNativeSmoke.events.length>60)window.__mpcNativeSmoke.events.shift();});`);
  checks.push({check: 'ACTUAL_APP_START_AND_ISOLATED_PROJECT', status: 'PASS'});
  breadcrumb('CHECK_PASSED', {check: 'ACTUAL_APP_START_AND_ISOLATED_PROJECT'});
  await layout(1366, 768);
  await layout(1920, 1080);
  // Native Linux smoke: an actual trusted IPC call must refuse Windows-only network reads.
  phase('LOCAL_NETWORK_BRIDGE_REQUIRES_WINDOWS_AND_PERMISSION');
  const networkStatus=await js("return window.mpcWorkspace.networkStatus();");
  assert.equal(networkStatus.platform_supported,false);
  const noConsent=await js("try{await window.mpcWorkspace.networkSnapshot({projectId:'NATIVE-SMOKE',consent:false});return 'ALLOWED';}catch(error){return String(error.message??error);}");
  assert.match(noConsent,/NETWORK_SNAPSHOT_INPUT_INVALID|NETWORK_EXPLICIT_CONSENT_REQUIRED/u);
  const noWindows=await js("try{await window.mpcWorkspace.networkSnapshot({projectId:'NATIVE-SMOKE',consent:true});return 'ALLOWED';}catch(error){return String(error.message??error);}");
  assert.match(noWindows,/NETWORK_WINDOWS_ONLY/u);
  const clearNetwork=await js("return window.mpcWorkspace.networkClear();");
  assert.equal(clearNetwork.state,'CLEARED');
  await js("document.querySelector('[data-view=network]').click();");
  const networkLayout=await js("const v=document.querySelector('#view-network'),r=v.getBoundingClientRect(),t=document.querySelector('.network-table-scroll').getBoundingClientRect();return {body_width:document.documentElement.scrollWidth,viewport:innerWidth,panel_right:r.right,table_right:t.right};");
  assert.ok(networkLayout.body_width<=networkLayout.viewport+1,'Network view caused horizontal workspace overflow');
  assert.ok(networkLayout.table_right<=networkLayout.viewport+1,'Network results table overflows page');
  await diagnosticScreenshot('network-1920x1080.png');
  checks.push({check:'NETWORK_BRIDGE_FAILS_CLOSED_AND_VIEW_FITS',status:'PASS'});
  breadcrumb('CHECK_PASSED',{check:'NETWORK_BRIDGE_FAILS_CLOSED_AND_VIEW_FITS'});
  await js("document.querySelector('[data-view=screen]').click();");

  phase('CREATE_SYNTHETIC_FIXTURE');
  fixture = new BrowserWindow({title: 'MPC Synthetic Screen Fixture', x: 0, y: 0, width: 1280, height: 480,
    frame: false, show: true, alwaysOnTop: true, resizable: false,
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}});
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MPC Synthetic Screen Fixture</title>
    <style>html,body{margin:0;width:100%;height:100%;background:white;color:black;font:48px/1.2 Arial,sans-serif}p{position:absolute;left:32px;margin:0;white-space:nowrap}.one{top:36px}.two{top:130px}.secret{top:240px}.digits{top:345px}</style></head>
    <body><p class="one">MPC SCREEN OCR</p><p class="two">LOCAL PRIVATE CAPTURE</p><p class="secret">MASKED SECRET 778899</p><p class="digits">1234567890</p></body></html>`;
  phase('LOAD_SYNTHETIC_FIXTURE');
  await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  fixture.show(); fixture.moveTop();
  await pause(300);
  receipt.synthetic_fixture = {window_id: fixture.id, title: fixture.getTitle(), bounds: fixture.getBounds(),
    content_bounds: fixture.getContentBounds(), visible: fixture.isVisible(), minimized: fixture.isMinimized(),
    native_handle_hex: fixture.getNativeWindowHandle().toString('hex')};
  phase('ENUMERATE_NATIVE_SOURCES');
  const sourceList = await js('return window.mpcWorkspace.screenSources();');
  receipt.enumerated_sources = sourceList;
  receipt.native_displays = nativeScreen.getAllDisplays().map(display => ({id:display.id,bounds:display.bounds,
    workArea:display.workArea,scaleFactor:display.scaleFactor}));
  breadcrumb('NATIVE_SOURCES_ENUMERATED', {source_count:sourceList.sources.length});
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
  receipt.rejected_starts = [];
  for (const [name, override, expected] of [
    ['missing consent', {consent: false}, 'SCREEN_PERMISSION_REQUIRED'],
    ['unlisted source', {sourceId: 'mpc-smoke-unlisted-source'}, 'SCREEN_REFRESH_SOURCE_LIST']
  ]) {
    phase(`REJECT_INVALID_START: ${name}`);
    const observed = await js(`try {
      await window.mpcWorkspace.screenStart(${JSON.stringify({...input, ...override})});return {rejected:false};
    }catch(error){return {rejected:true,message:String(error?.message??error)};}`);
    assert.equal(observed.rejected, true, `${name} unexpectedly authorized capture`);
    assert.ok(observed.message.includes(expected), `${name} failed for an unexpected reason: ${observed.message}`);
    const stopped = await js('return window.mpcWorkspace.screenStatus();');
    assert.equal(stopped.state, 'STOPPED');
    assert.equal(BrowserWindow.getAllWindows().filter(window => window !== main && window !== fixture && !window.isDestroyed()).length,
      0, `${name} created a capture or indicator window`);
    receipt.rejected_starts.push({name, expected, observed, state: stopped.state});
    breadcrumb('INVALID_START_REJECTED', {name, expected});
  }
  checks.push({check: 'NATIVE_REJECTS_NO_CONSENT_AND_UNLISTED_SOURCE', status: 'PASS'});
  breadcrumb('CHECK_PASSED', {check: 'NATIVE_REJECTS_NO_CONSENT_AND_UNLISTED_SOURCE'});
  const unmasked = await captureRun(input, 'unmasked');
  const unmaskedText = unmasked.result.ocr.text.replace(/\s+/gu, ' ');
  for (const phrase of ['MPC SCREEN OCR', 'LOCAL PRIVATE CAPTURE', 'MASKED SECRET 778899', '1234567890']) {
    assert.ok(unmaskedText.includes(phrase), `Native OCR did not recognize ${phrase}`);
  }
  assert.equal(unmasked.result.ocr.network, 'DISABLED');
  assert.equal(unmasked.result.context.projectId, 'NATIVE-SMOKE');
  const roiRecommendation=proposeInverseOcrCrop(unmasked.result);
  assert.equal(roiRecommendation.kind,'MPC_ROI_PROCESS_PROPOSAL');
  assert.equal(roiRecommendation.automatic_capture,false);
  assert.equal(roiRecommendation.source.source_id,selected.id);
  assert.ok(['NO_GAIN','INSUFFICIENT_GEOMETRY','LOW_CONFIDENCE','BOUNDED_COVERAGE'].includes(roiRecommendation.status));
  assert.equal(unmasked.result.classification?.status, 'CLASSIFIED',
    'Native OCR reached an unavailable classifier: '+JSON.stringify({status:unmasked.result.classification?.status,
      error:unmasked.result.classification?.error,summary:unmasked.result.classification?.summary}));
  checks.push({check: 'NATIVE_PIXELS_REAL_LOCAL_OCR', width: unmasked.result.frame.width,
    height: unmasked.result.frame.height, word_count: unmasked.result.ocr.words.length, status: 'PASS'});
  breadcrumb('CHECK_PASSED', {check: 'NATIVE_PIXELS_REAL_LOCAL_OCR'});

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
  breadcrumb('CHECK_PASSED', {check: 'MASK_APPLIED_BEFORE_OCR_AND_PREVIEW'});

  // Exercise the visible Start and Stop controls as well as the direct trusted
  // IPC used above. The test consents only to its own synthetic fixture.
  const roiLoaded=await js("return import('/roi-process.js').then(mod=>typeof mod.proposeInverseOcrCrop==='function');");
  assert.equal(roiLoaded,true,'Native interface failed to load ROI process helper');
  assert.equal(await js("return !!document.querySelector('#screen-roi-suggest') && !!document.querySelector('#screen-roi-apply');"),true);
  phase('LIVE_UI_SOURCE_REFRESH');
  await js("document.querySelector('[data-view=screen]').click();document.querySelector('#screen-refresh').click();");
  await waitFor('UI source enumeration', () => js(`return [...document.querySelector('#screen-source').options].some(option=>option.value===${JSON.stringify(selected.id)});`));
  phase('LIVE_UI_START');
  await js(`
    window.__mpcNativeSmoke.events=[];
    document.querySelector('#screen-source').value=${JSON.stringify(selected.id)};
    document.querySelector('#screen-mode').value='live';document.querySelector('#screen-fps').value='1';
    document.querySelector('#screen-duration').value='5';
    const consent=document.querySelector('#screen-consent');consent.checked=true;
    consent.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#screen-preview-enabled').checked=true;
    document.querySelector('#screen-exclude-mpc').checked=true;
    const crop=${JSON.stringify(crop)};
    for(const [field,key] of [['x','x'],['y','y'],['w','width'],['h','height']]) document.querySelector('#screen-crop-'+field).value=String(crop[key]*100);
    if(document.querySelector('#screen-start').disabled)throw Error('NATIVE_SMOKE_VALID_SOURCE_START_DISABLED');
    document.querySelector('#screen-start').click();
  `);
  await waitFor('live pixels before Stop', () => js("return window.__mpcNativeSmoke.events.some(event=>event.type==='PREVIEW');"), 15_000);
  assert.equal(await js("return document.querySelector('#screen-stop').disabled;"), false);
  phase('LIVE_UI_STOP');
  await js("document.querySelector('#screen-stop').click();");
  await waitFor('actual UI Stop', async () => (await js('return window.mpcWorkspace.screenStatus();')).state === 'STOPPED');
  const atStop = await js("return window.__mpcNativeSmoke.events.filter(event=>event.type==='RESULT').length;");
  await pause(700);
  const afterStop = await js("return window.__mpcNativeSmoke.events.filter(event=>event.type==='RESULT').length;");
  assert.equal(afterStop, atStop, 'A revoked capture published a later result');
  const remaining = BrowserWindow.getAllWindows().filter(window => window !== main && window !== fixture && !window.isDestroyed());
  assert.equal(remaining.length, 0, 'Capture or indicator window survived Stop');
  checks.push({check: 'UI_START_STOP_REVOKES_MEDIA_AND_NO_LATE_RESULT', status: 'PASS'});
  breadcrumb('CHECK_PASSED', {check: 'UI_START_STOP_REVOKES_MEDIA_AND_NO_LATE_RESULT'});
  phase('LIVE_UI_CONSENT_REVOCATION');
  await js("window.__mpcNativeSmoke.events=[];const consent=document.querySelector('#screen-consent');consent.checked=true;consent.dispatchEvent(new Event('change',{bubbles:true}));if(document.querySelector('#screen-start').disabled)throw Error('NATIVE_SMOKE_RESTART_DISABLED');document.querySelector('#screen-start').click();");
  await waitFor('live pixels before consent revocation', () => js("return window.__mpcNativeSmoke.events.some(event=>event.type==='PREVIEW');"), 15_000);
  await js("const consent=document.querySelector('#screen-consent');consent.checked=false;consent.dispatchEvent(new Event('change',{bubbles:true}));");
  await waitFor('consent checkbox revokes actual capture', async () => (await js('return window.mpcWorkspace.screenStatus();')).state === 'STOPPED');
  assert.equal(BrowserWindow.getAllWindows().filter(window => window !== main && window !== fixture && !window.isDestroyed()).length, 0);
  checks.push({check: 'VISIBLE_CONSENT_CONTROL_REVOKES_MEDIA', status: 'PASS'});
  breadcrumb('CHECK_PASSED', {check: 'VISIBLE_CONSENT_CONTROL_REVOKES_MEDIA'});
  fixture.hide();
  receipt.ui_console_errors = uiErrors;
  await finish('PASS');
} catch (error) {
  await finish('FAIL', error);
}
}

// Electron waits for main-entry ESM evaluation before emitting ready. Awaiting
// app.whenReady at module level creates a readiness cycle. All pre-ready path
// isolation above is synchronous; launch the asynchronous smoke without making
// the module itself wait for ready. See electronjs.org/docs/latest/tutorial/esm.
phase('ENTRY_EVALUATED_STARTING_ASYNC_SMOKE');
void run().catch(error => { saveReceipt('FAIL', error); app.exit(1); });
