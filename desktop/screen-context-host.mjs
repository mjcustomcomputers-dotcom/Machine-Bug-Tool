import {createHash} from 'node:crypto';
import {basename, extname} from 'node:path';

export const SCREEN_CONTEXT_LIMITS = Object.freeze({
  maximum_dimension_pixels: 8_192,
  maximum_source_pixels: 16_777_216,
  maximum_preview_long_edge_pixels: 1_280,
  maximum_preview_bytes: 2_000_000,
  maximum_clipboard_encoded_bytes: 80 * 1024 * 1024,
  maximum_har_bytes: 4 * 1024 * 1024,
  jpeg_quality: 65
});

const SCREEN_CONTEXT_CAPTURE_VERSION = 'MPC_SCREEN_CONTEXT_CAPTURE_1';
const FIREFOX_HAR_SELECTION_VERSION = 'MPC_FIREFOX_HAR_SELECTION_1';
const CLIPBOARD_IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const textDecoder = new TextDecoder('utf-8', {fatal: true});

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function asBuffer(value, code) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) fail(code);
  const bytes = Buffer.from(value);
  if (bytes.byteLength === 0) fail(code);
  return bytes;
}

function dimensionsOf(image, code) {
  if (!image || typeof image.getSize !== 'function') fail(code);
  const size = image.getSize();
  const width = size?.width;
  const height = size?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) fail(code);
  return {width, height};
}

function validateSourceDimensions(dimensions) {
  if (dimensions.width > SCREEN_CONTEXT_LIMITS.maximum_dimension_pixels ||
      dimensions.height > SCREEN_CONTEXT_LIMITS.maximum_dimension_pixels) {
    fail('MPC_SCREEN_CONTEXT_IMAGE_DIMENSION_LIMIT');
  }
  if (dimensions.width * dimensions.height > SCREEN_CONTEXT_LIMITS.maximum_source_pixels) {
    fail('MPC_SCREEN_CONTEXT_IMAGE_PIXEL_LIMIT');
  }
}

function plannedDimensions(source, maximumLongEdge) {
  const longEdge = Math.max(source.width, source.height);
  if (longEdge <= maximumLongEdge) return {...source};
  const scale = maximumLongEdge / longEdge;
  return {
    width: Math.max(1, Math.floor(source.width * scale)),
    height: Math.max(1, Math.floor(source.height * scale))
  };
}

function resizeImage(sourceImage, dimensions) {
  if (typeof sourceImage.resize !== 'function') fail('MPC_SCREEN_CONTEXT_IMAGE_RESIZE_UNAVAILABLE');
  const resized = sourceImage.resize({...dimensions, quality: 'good'});
  const observed = dimensionsOf(resized, 'MPC_SCREEN_CONTEXT_DERIVED_DIMENSIONS_INVALID');
  if (observed.width > dimensions.width || observed.height > dimensions.height ||
      Math.max(observed.width, observed.height) > SCREEN_CONTEXT_LIMITS.maximum_preview_long_edge_pixels) {
    fail('MPC_SCREEN_CONTEXT_DERIVED_DIMENSIONS_INVALID');
  }
  return {image: resized, dimensions: observed};
}

function derivePreview(sourceImage, sourceDimensions) {
  let target = plannedDimensions(sourceDimensions, SCREEN_CONTEXT_LIMITS.maximum_preview_long_edge_pixels);
  let derivedImage = sourceImage;
  let derivedDimensions = {...sourceDimensions};
  let resized = false;
  if (target.width !== sourceDimensions.width || target.height !== sourceDimensions.height) {
    ({image: derivedImage, dimensions: derivedDimensions} = resizeImage(sourceImage, target));
    resized = true;
  }

  let attempts = 0;
  while (true) {
    attempts += 1;
    if (!derivedImage || typeof derivedImage.toJPEG !== 'function') fail('MPC_SCREEN_CONTEXT_IMAGE_ENCODER_UNAVAILABLE');
    const encoded = asBuffer(derivedImage.toJPEG(SCREEN_CONTEXT_LIMITS.jpeg_quality),
      'MPC_SCREEN_CONTEXT_DERIVED_IMAGE_INVALID');
    if (encoded.byteLength <= SCREEN_CONTEXT_LIMITS.maximum_preview_bytes) {
      return {bytes: encoded, dimensions: derivedDimensions, resized, attempts};
    }
    if (derivedDimensions.width === 1 && derivedDimensions.height === 1) {
      fail('MPC_SCREEN_CONTEXT_DERIVED_IMAGE_TOO_LARGE');
    }
    target = {
      width: Math.max(1, Math.floor(derivedDimensions.width / 2)),
      height: Math.max(1, Math.floor(derivedDimensions.height / 2))
    };
    ({image: derivedImage, dimensions: derivedDimensions} = resizeImage(sourceImage, target));
    resized = true;
  }
}

function iso(clock) {
  const value = clock();
  const result = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}T.*Z$/u.test(result) || !Number.isFinite(Date.parse(result))) {
    fail('MPC_SCREEN_CONTEXT_CLOCK_INVALID');
  }
  return result;
}

function mark(nowMs) {
  const value = nowMs();
  if (!Number.isFinite(value)) fail('MPC_SCREEN_CONTEXT_TIMER_INVALID');
  return value;
}

function elapsed(start, end) {
  return Math.max(0, end - start);
}

async function readClipboardImage(clipboard, nativeImage) {
  if (typeof clipboard.readImage === 'function') return clipboard.readImage();
  const items = await clipboard.read();
  if (!Array.isArray(items)) fail('MPC_SCREEN_CONTEXT_CLIPBOARD_READ_INVALID');
  for (const item of items) {
    if (!item || !Array.isArray(item.types) || typeof item.getType !== 'function') continue;
    for (const mediaType of CLIPBOARD_IMAGE_TYPES) {
      if (!item.types.includes(mediaType)) continue;
      const payload = await item.getType(mediaType);
      if (!payload || typeof payload.arrayBuffer !== 'function') fail('MPC_SCREEN_CONTEXT_CLIPBOARD_IMAGE_INVALID');
      if (Number.isFinite(payload.size) &&
          (payload.size < 1 || payload.size > SCREEN_CONTEXT_LIMITS.maximum_clipboard_encoded_bytes)) {
        fail('MPC_SCREEN_CONTEXT_CLIPBOARD_IMAGE_SIZE_LIMIT');
      }
      const bytes = Buffer.from(await payload.arrayBuffer());
      if (bytes.byteLength < 1 || bytes.byteLength > SCREEN_CONTEXT_LIMITS.maximum_clipboard_encoded_bytes) {
        fail('MPC_SCREEN_CONTEXT_CLIPBOARD_IMAGE_SIZE_LIMIT');
      }
      const image = nativeImage.createFromBuffer(bytes);
      if (image && typeof image.isEmpty === 'function' && !image.isEmpty()) return image;
    }
  }
  return null;
}

function statNumber(value) {
  return typeof value === 'bigint' ? value.toString() : Number.isFinite(value) ? value : null;
}

function sameFileIdentity(left, right) {
  if (!left || !right) return false;
  for (const key of ['size', 'dev', 'ino', 'mtimeMs', 'ctimeMs']) {
    const a = statNumber(left[key]);
    const b = statNumber(right[key]);
    if (a !== null && b !== null && a !== b) return false;
  }
  return true;
}

async function readBoundedFile(handle, expectedSize) {
  if (!handle || typeof handle.read !== 'function' || typeof handle.stat !== 'function' ||
      typeof handle.close !== 'function') fail('MPC_SCREEN_CONTEXT_HAR_HANDLE_INVALID');
  const bytes = Buffer.alloc(expectedSize);
  let offset = 0;
  while (offset < expectedSize) {
    const result = await handle.read(bytes, offset, expectedSize - offset, offset);
    if (!result || !Number.isSafeInteger(result.bytesRead) || result.bytesRead < 0 ||
        result.bytesRead > expectedSize - offset) fail('MPC_SCREEN_CONTEXT_HAR_READ_INVALID');
    if (result.bytesRead === 0) fail('MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
    offset += result.bytesRead;
  }
  const probe = Buffer.alloc(1);
  const trailing = await handle.read(probe, 0, 1, expectedSize);
  if (!trailing || trailing.bytesRead !== 0) fail('MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
  return bytes;
}

/**
 * Host-only, explicit one-shot screen-context acquisition. This helper never
 * installs listeners, timers or polling loops and never logs selected content.
 */
export function createScreenContextHost({
  clipboard,
  nativeImage,
  dialog,
  openFile,
  lstat,
  mainWindow,
  clock = () => new Date(),
  nowMs = () => performance.now()
} = {}) {
  const legacyClipboard = clipboard && typeof clipboard.readImage === 'function';
  const modernClipboard = clipboard && typeof clipboard.read === 'function' &&
    nativeImage && typeof nativeImage.createFromBuffer === 'function';
  if (!legacyClipboard && !modernClipboard) fail('MPC_SCREEN_CONTEXT_CLIPBOARD_REQUIRED');
  if (!dialog || typeof dialog.showOpenDialog !== 'function') fail('MPC_SCREEN_CONTEXT_DIALOG_REQUIRED');
  if (typeof openFile !== 'function' || typeof lstat !== 'function') fail('MPC_SCREEN_CONTEXT_FILESYSTEM_REQUIRED');
  if (typeof clock !== 'function' || typeof nowMs !== 'function') fail('MPC_SCREEN_CONTEXT_CLOCK_REQUIRED');

  return Object.freeze({
    async captureClipboardImage() {
      const startedAtUtc = iso(clock);
      const started = mark(nowMs);
      const image = await readClipboardImage(clipboard, nativeImage);
      const readFinished = mark(nowMs);
      if (!image || typeof image.isEmpty !== 'function' || image.isEmpty()) {
        fail('MPC_SCREEN_CONTEXT_CLIPBOARD_IMAGE_EMPTY');
      }
      const sourceDimensions = dimensionsOf(image, 'MPC_SCREEN_CONTEXT_IMAGE_DIMENSIONS_INVALID');
      validateSourceDimensions(sourceDimensions);
      const preview = derivePreview(image, sourceDimensions);
      const derivedFinished = mark(nowMs);
      if (typeof image.toPNG !== 'function') fail('MPC_SCREEN_CONTEXT_IMAGE_ENCODER_UNAVAILABLE');
      const sourcePng = asBuffer(image.toPNG(), 'MPC_SCREEN_CONTEXT_SOURCE_PNG_INVALID');
      const completed = mark(nowMs);
      const completedAtUtc = iso(clock);

      return {
        schema_version: SCREEN_CONTEXT_CAPTURE_VERSION,
        status: 'CAPTURED',
        capture_mode: 'EXPLICIT_ONE_SHOT',
        source: {
          media_type: 'image/png',
          bytes: sourcePng,
          byte_length: sourcePng.byteLength,
          sha256: sha256(sourcePng),
          dimensions: sourceDimensions,
          normalization: 'ELECTRON_NATIVE_IMAGE_TO_PNG'
        },
        derived: {
          media_type: 'image/jpeg',
          bytes: preview.bytes,
          byte_length: preview.bytes.byteLength,
          sha256: sha256(preview.bytes),
          dimensions: preview.dimensions
        },
        transform: {
          operation: preview.resized ? 'DOWNSCALE_AND_ENCODE' : 'ENCODE_ONLY',
          no_upscale: true,
          maximum_long_edge_pixels: SCREEN_CONTEXT_LIMITS.maximum_preview_long_edge_pixels,
          resize_quality: preview.resized ? 'good' : null,
          jpeg_quality: SCREEN_CONTEXT_LIMITS.jpeg_quality,
          encoding_attempts: preview.attempts,
          source_dimensions: sourceDimensions,
          derived_dimensions: preview.dimensions,
          scale_x: preview.dimensions.width / sourceDimensions.width,
          scale_y: preview.dimensions.height / sourceDimensions.height
        },
        timing: {
          started_at_utc: startedAtUtc,
          completed_at_utc: completedAtUtc,
          clipboard_read_ms: elapsed(started, readFinished),
          derive_ms: elapsed(readFinished, derivedFinished),
          normalize_and_validate_ms: elapsed(derivedFinished, completed),
          elapsed_ms: elapsed(started, completed)
        }
      };
    },

    async selectFirefoxHar() {
      const selected = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Firefox network export',
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{name: 'Firefox HAR or JSON', extensions: ['har', 'json']}]
      });
      if (selected?.canceled === true) fail('MPC_SCREEN_CONTEXT_HAR_SELECTION_CANCELLED');
      if (!Array.isArray(selected?.filePaths) || selected.filePaths.length !== 1) {
        fail('MPC_SCREEN_CONTEXT_HAR_SELECTION_INVALID');
      }
      const filePath = selected.filePaths[0];
      if (typeof filePath !== 'string' || !filePath || filePath.includes('\0') || Buffer.byteLength(filePath) > 32_768) {
        fail('MPC_SCREEN_CONTEXT_HAR_PATH_INVALID');
      }
      if (!['.har', '.json'].includes(extname(filePath).toLowerCase())) {
        fail('MPC_SCREEN_CONTEXT_HAR_EXTENSION_INVALID');
      }
      const selectedStat = await lstat(filePath);
      if (!selectedStat || typeof selectedStat.isSymbolicLink !== 'function' || typeof selectedStat.isFile !== 'function') {
        fail('MPC_SCREEN_CONTEXT_HAR_STAT_INVALID');
      }
      if (selectedStat.isSymbolicLink()) fail('MPC_SCREEN_CONTEXT_HAR_SYMLINK_REJECTED');
      if (!selectedStat.isFile()) fail('MPC_SCREEN_CONTEXT_HAR_REGULAR_FILE_REQUIRED');
      if (!Number.isSafeInteger(selectedStat.size) || selectedStat.size < 0) fail('MPC_SCREEN_CONTEXT_HAR_STAT_INVALID');
      if (selectedStat.size > SCREEN_CONTEXT_LIMITS.maximum_har_bytes) fail('MPC_SCREEN_CONTEXT_HAR_SIZE_LIMIT');
      const handle = await openFile(filePath);
      let bytes;
      try {
        const openedStat = await handle.stat();
        if (!openedStat?.isFile?.() || !sameFileIdentity(selectedStat, openedStat)) {
          fail('MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
        }
        if (!Number.isSafeInteger(openedStat.size) || openedStat.size < 0 ||
            openedStat.size > SCREEN_CONTEXT_LIMITS.maximum_har_bytes) fail('MPC_SCREEN_CONTEXT_HAR_SIZE_LIMIT');
        bytes = asBuffer(await readBoundedFile(handle, openedStat.size), 'MPC_SCREEN_CONTEXT_HAR_BYTES_INVALID');
        const completedStat = await handle.stat();
        if (!sameFileIdentity(openedStat, completedStat)) fail('MPC_SCREEN_CONTEXT_HAR_FILE_CHANGED');
      } finally {
        await handle.close();
      }
      try {
        textDecoder.decode(bytes);
      } catch {
        fail('MPC_SCREEN_CONTEXT_HAR_UTF8_INVALID');
      }
      return {
        schema_version: FIREFOX_HAR_SELECTION_VERSION,
        status: 'SELECTED',
        selection_mode: 'EXPLICIT_DIALOG',
        source_kind: 'FIREFOX_HAR_EXPORT',
        name: basename(filePath),
        media_type: 'application/json',
        bytes,
        byte_length: bytes.byteLength,
        sha256: sha256(bytes),
        utf8_valid: true,
        selected_at_utc: iso(clock)
      };
    }
  });
}
