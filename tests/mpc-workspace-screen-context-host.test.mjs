import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  SCREEN_CONTEXT_LIMITS,
  createScreenContextHost
} from '../desktop/screen-context-host.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const fixedClock = () => new Date('2026-10-10T12:00:00.000Z');

function timer(values = [0, 1, 2, 3]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function regularStat(size, {file = true, link = false} = {}) {
  return {size, dev: 10, ino: 20, mtimeMs: 30, ctimeMs: 40,
    isFile: () => file, isSymbolicLink: () => link};
}

function fakeImage({width, height, png = Buffer.from('normalized-png'), jpeg = Buffer.from('preview-jpeg'),
  empty = false, calls = [], resizedJpeg = jpeg} = {}) {
  return {
    isEmpty: () => empty,
    getSize: () => ({width, height}),
    toPNG: () => { calls.push(['toPNG']); return png; },
    toJPEG: quality => { calls.push(['toJPEG', quality, width, height]); return jpeg; },
    resize: options => {
      calls.push(['resize', options]);
      return fakeImage({width: options.width, height: options.height, png, jpeg: resizedJpeg, calls, resizedJpeg});
    }
  };
}

function host({image = fakeImage({width: 800, height: 600}), selection = {canceled: true, filePaths: []},
  stat = regularStat(2), openedStat = stat, completedStat = openedStat,
  bytes = Buffer.from('{}'), calls = [], nowMs = timer(), clipboard = null, nativeImage = null} = {}) {
  return createScreenContextHost({
    clipboard: clipboard ?? {readImage: async () => { calls.push(['readImage']); return image; }},
    nativeImage,
    dialog: {showOpenDialog: async (...args) => { calls.push(['showOpenDialog', ...args]); return selection; }},
    lstat: async path => { calls.push(['lstat', path]); return stat; },
    openFile: async path => {
      calls.push(['openFile', path]);
      let statCalls = 0;
      return {
        stat: async () => { calls.push(['fstat']); return statCalls++ === 0 ? openedStat : completedStat; },
        read: async (target, offset, length, position) => {
          calls.push(['read', position, length]);
          const available = bytes.subarray(position, position + length);
          available.copy(target, offset);
          return {bytesRead: available.byteLength, buffer: target};
        },
        close: async () => { calls.push(['close']); }
      };
    },
    mainWindow: {id: 'main-window'},
    clock: fixedClock,
    nowMs
  });
}

test('screen context host is idle until an explicit one-shot clipboard capture', async () => {
  const calls = [];
  const image = fakeImage({width: 800, height: 600, calls});
  const screen = host({image, calls});
  assert.deepEqual(calls, []);
  const result = await screen.captureClipboardImage();
  assert.equal(calls.filter(([name]) => name === 'readImage').length, 1);
  assert.equal(result.capture_mode, 'EXPLICIT_ONE_SHOT');
  assert.equal(result.status, 'CAPTURED');
  assert.deepEqual(result.timing, {
    started_at_utc: '2026-10-10T12:00:00.000Z',
    completed_at_utc: '2026-10-10T12:00:00.000Z',
    clipboard_read_ms: 1,
    normalize_and_validate_ms: 1,
    derive_ms: 1,
    elapsed_ms: 3
  });
});

test('Electron 44 ClipboardItem image bytes decode through the injected nativeImage boundary', async () => {
  const calls = [];
  const encoded = Buffer.from('electron-44-clipboard-image');
  const image = fakeImage({width: 640, height: 480, calls});
  const clipboard = {read: async () => {
    calls.push(['read']);
    return [{types: ['text/plain', 'image/png'], getType: async mediaType => {
      calls.push(['getType', mediaType]);
      return new Blob([encoded], {type: mediaType});
    }}];
  }};
  const nativeImage = {createFromBuffer: bytes => {
    calls.push(['createFromBuffer', Buffer.from(bytes)]);
    return image;
  }};
  const result = await host({clipboard, nativeImage, calls}).captureClipboardImage();
  assert.equal(result.status, 'CAPTURED');
  assert.deepEqual(calls.slice(0, 3), [['read'], ['getType', 'image/png'], ['createFromBuffer', encoded]]);
  assert.equal(calls.some(([name]) => name === 'readImage'), false);
});

test('clipboard capture rejects an empty image before normalization', async () => {
  const calls = [];
  const screen = host({image: fakeImage({width: 1, height: 1, empty: true, calls}), calls});
  await assert.rejects(screen.captureClipboardImage(), error => error.code === 'MPC_SCREEN_CONTEXT_CLIPBOARD_IMAGE_EMPTY');
  assert.equal(calls.filter(([name]) => name === 'readImage').length, 1);
  assert.equal(calls.some(([name]) => name === 'toPNG'), false);
});

test('clipboard capture enforces independent dimension and decoded-pixel bounds', async () => {
  await assert.rejects(host({image: fakeImage({width: 8_193, height: 1})}).captureClipboardImage(),
    error => error.code === 'MPC_SCREEN_CONTEXT_IMAGE_DIMENSION_LIMIT');
  await assert.rejects(host({image: fakeImage({width: 8_192, height: 2_049})}).captureClipboardImage(),
    error => error.code === 'MPC_SCREEN_CONTEXT_IMAGE_PIXEL_LIMIT');
  assert.equal(8_192 * 2_048, SCREEN_CONTEXT_LIMITS.maximum_source_pixels);
  const boundary = await host({image: fakeImage({width: 8_192, height: 2_048})}).captureClipboardImage();
  assert.ok(Math.max(boundary.derived.dimensions.width, boundary.derived.dimensions.height) <= 1_280);
});

test('a small clipboard image is never upscaled and both byte representations have exact hashes', async () => {
  const calls = [];
  const png = Buffer.from('normalized source png');
  const jpeg = Buffer.from('bounded jpeg preview');
  const result = await host({image: fakeImage({width: 1_024, height: 576, png, jpeg, calls}), calls})
    .captureClipboardImage();
  assert.equal(calls.some(([name]) => name === 'resize'), false);
  assert.equal(result.transform.operation, 'ENCODE_ONLY');
  assert.equal(result.transform.no_upscale, true);
  assert.equal(result.transform.jpeg_quality, 65);
  assert.deepEqual(result.source.dimensions, {width: 1_024, height: 576});
  assert.deepEqual(result.derived.dimensions, {width: 1_024, height: 576});
  assert.ok(Buffer.isBuffer(result.source.bytes));
  assert.ok(Buffer.isBuffer(result.derived.bytes));
  assert.equal(result.source.sha256, digest(png));
  assert.equal(result.derived.sha256, digest(jpeg));
  assert.equal(result.source.byte_length, png.byteLength);
  assert.equal(result.derived.byte_length, jpeg.byteLength);
  assert.ok(calls.findIndex(([name]) => name === 'toJPEG') < calls.findIndex(([name]) => name === 'toPNG'),
    'the bounded fast representation must be encoded before the full PNG');
});

test('a large clipboard image is resized to a bounded long edge before JPEG encoding', async () => {
  const calls = [];
  const result = await host({image: fakeImage({width: 2_560, height: 1_440, calls}), calls})
    .captureClipboardImage();
  const resize = calls.find(([name]) => name === 'resize');
  assert.deepEqual(resize, ['resize', {width: 1_280, height: 720, quality: 'good'}]);
  assert.ok(calls.some(call => call[0] === 'toJPEG' && call[1] === 65 && call[2] === 1_280 && call[3] === 720));
  assert.deepEqual(result.derived.dimensions, {width: 1_280, height: 720});
  assert.equal(result.transform.operation, 'DOWNSCALE_AND_ENCODE');
  assert.equal(result.transform.scale_x, 0.5);
  assert.equal(result.transform.scale_y, 0.5);
});

test('preview byte limit triggers further downscaling and ultimately fails closed', async () => {
  const oversized = Buffer.alloc(SCREEN_CONTEXT_LIMITS.maximum_preview_bytes + 1, 1);
  await assert.rejects(host({image: fakeImage({width: 2, height: 2, jpeg: oversized, resizedJpeg: oversized})})
    .captureClipboardImage(), error => error.code === 'MPC_SCREEN_CONTEXT_DERIVED_IMAGE_TOO_LARGE');
});

test('Firefox HAR selection is an explicit filtered dialog and returns exact raw identity', async () => {
  const calls = [];
  const bytes = Buffer.from('{"log":{"entries":[]}}', 'utf8');
  const screen = host({selection: {canceled: false, filePaths: ['/evidence/firefox.har']},
    stat: regularStat(bytes.byteLength), bytes, calls});
  assert.deepEqual(calls, []);
  const result = await screen.selectFirefoxHar();
  const dialogCall = calls.find(([name]) => name === 'showOpenDialog');
  assert.equal(dialogCall[1].id, 'main-window');
  assert.deepEqual(dialogCall[2], {
    title: 'Select Firefox network export',
    properties: ['openFile', 'dontAddToRecent'],
    filters: [{name: 'Firefox HAR or JSON', extensions: ['har', 'json']}]
  });
  assert.deepEqual(calls.map(([name]) => name),
    ['showOpenDialog', 'lstat', 'openFile', 'fstat', 'read', 'read', 'fstat', 'close']);
  assert.equal(result.selection_mode, 'EXPLICIT_DIALOG');
  assert.equal(result.name, 'firefox.har');
  assert.ok(Buffer.isBuffer(result.bytes));
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.byte_length, bytes.byteLength);
  assert.equal(result.sha256, digest(bytes));
  assert.equal(result.utf8_valid, true);
});

test('Firefox HAR selection rejects cancellation without touching the filesystem', async () => {
  const calls = [];
  await assert.rejects(host({calls}).selectFirefoxHar(),
    error => error.code === 'MPC_SCREEN_CONTEXT_HAR_SELECTION_CANCELLED');
  assert.deepEqual(calls.map(([name]) => name), ['showOpenDialog']);
});

test('Firefox HAR selection rejects links, non-files, invalid UTF-8 and over-limit input', async () => {
  const path = '/evidence/firefox.har';
  const selection = {canceled: false, filePaths: [path]};
  await assert.rejects(host({selection, stat: regularStat(2, {link: true})}).selectFirefoxHar(),
    error => error.code === 'MPC_SCREEN_CONTEXT_HAR_SYMLINK_REJECTED');
  await assert.rejects(host({selection, stat: regularStat(2, {file: false})}).selectFirefoxHar(),
    error => error.code === 'MPC_SCREEN_CONTEXT_HAR_REGULAR_FILE_REQUIRED');
  await assert.rejects(host({selection, stat: regularStat(SCREEN_CONTEXT_LIMITS.maximum_har_bytes + 1)})
    .selectFirefoxHar(), error => error.code === 'MPC_SCREEN_CONTEXT_HAR_SIZE_LIMIT');
  const invalid = Buffer.from([0xc3, 0x28]);
  await assert.rejects(host({selection, stat: regularStat(invalid.byteLength), bytes: invalid}).selectFirefoxHar(),
    error => error.code === 'MPC_SCREEN_CONTEXT_HAR_UTF8_INVALID');
});

test('Firefox HAR byte bound is inclusive and a stat/read length race fails closed', async () => {
  const path = '/evidence/firefox.json';
  const selection = {canceled: false, filePaths: [path]};
  const boundary = Buffer.alloc(SCREEN_CONTEXT_LIMITS.maximum_har_bytes, 0x20);
  const accepted = await host({selection, stat: regularStat(boundary.byteLength), bytes: boundary}).selectFirefoxHar();
  assert.equal(accepted.byte_length, SCREEN_CONTEXT_LIMITS.maximum_har_bytes);
  await assert.rejects(host({selection, stat: regularStat(2), bytes: Buffer.from('{}\n')}).selectFirefoxHar(),
    error => error.code === 'MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
});

test('Firefox HAR handle identity is stable across open and bounded read', async () => {
  const path = '/evidence/firefox.har';
  const selection = {canceled: false, filePaths: [path]};
  const selected = regularStat(2);
  await assert.rejects(host({selection, stat: selected,
    openedStat: {...selected, ino: selected.ino + 1}, bytes: Buffer.from('{}')}).selectFirefoxHar(),
  error => error.code === 'MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
  await assert.rejects(host({selection, stat: selected, openedStat: selected,
    completedStat: {...selected, mtimeMs: selected.mtimeMs + 1}, bytes: Buffer.from('{}')}).selectFirefoxHar(),
  error => error.code === 'MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
});
