// Universal image ingestion for Culling Grid.
//
// The design goal is "no spinners": for RAW files we never fully demosaic the
// sensor data (slow, and pointless for culling). Instead we pull the full-size
// JPEG preview that every camera embeds in the RAW container. That preview is
// what the photographer saw on the back of the camera, which is exactly the
// right image to judge a frame by — and extracting it is a few milliseconds of
// buffer scanning rather than seconds of decoding.

import * as UTIF from 'utif';

const RAW_EXTS = new Set([
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'sr2', 'srf', 'raf', 'rw2',
  'dng', 'orf', 'pef', 'srw', 'raw', '3fr', 'iiq', 'rwl',
]);
const TIFF_EXTS = new Set(['tif', 'tiff']);
const HEIF_EXTS = new Set(['heic', 'heif', 'hif', 'avif']);
const NATIVE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

export function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function classify(name) {
  const ext = extOf(name);
  if (NATIVE_EXTS.has(ext)) return { ext, kind: 'native' };
  if (RAW_EXTS.has(ext)) return { ext, kind: 'raw' };
  if (TIFF_EXTS.has(ext)) return { ext, kind: 'tiff' };
  if (HEIF_EXTS.has(ext)) return { ext, kind: 'heif' };
  return { ext, kind: 'unknown' };
}

// Scan a buffer for embedded JPEG streams (SOI 0xFFD8 … EOI 0xFFD9) and return
// the largest one — cameras store several previews, and the biggest is the
// full-frame one. This covers essentially every TIFF-based RAW (CR2, NEF, ARW,
// RW2, DNG, ORF, PEF …), Fuji RAF, and the CR3/ISO-BMFF container alike,
// because they all carry a plain JPEG preview somewhere in the file.
export function extractLargestJpeg(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  let best = null;
  let i = 0;

  while (i < len - 1) {
    // Find next SOI marker: FF D8 FF
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      const start = i;
      // Walk JPEG segments to find the matching EOI, so we get a valid stream.
      let j = i + 2;
      let end = -1;
      while (j < len - 1) {
        if (bytes[j] === 0xff) {
          const marker = bytes[j + 1];
          if (marker === 0xd9) {
            end = j + 2;
            break;
          }
          // Standalone markers (RSTn, SOI, EOI, TEM) have no length.
          if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            j += 2;
            continue;
          }
          if (marker === 0xff) {
            j += 1; // padding
            continue;
          }
          // Start of scan: entropy-coded data follows; scan byte-by-byte to EOI.
          if (marker === 0xda) {
            j += 2;
            while (j < len - 1) {
              if (bytes[j] === 0xff && bytes[j + 1] !== 0x00 &&
                  !(bytes[j + 1] >= 0xd0 && bytes[j + 1] <= 0xd7)) {
                break;
              }
              j += 1;
            }
            continue;
          }
          // Segment with a 2-byte length.
          const segLen = (bytes[j + 2] << 8) | bytes[j + 3];
          if (segLen < 2) break;
          j += 2 + segLen;
        } else {
          j += 1;
        }
      }
      if (end > start) {
        const size = end - start;
        if (!best || size > best.size) best = { start, end, size };
        i = end;
        continue;
      }
    }
    i += 1;
  }

  if (best && best.size > 1024) {
    return new Blob([bytes.subarray(best.start, best.end)], { type: 'image/jpeg' });
  }
  return null;
}

function readArrayBuffer(file) {
  return file.arrayBuffer();
}

// Decode a TIFF (or a TIFF-based RAW with no usable embedded JPEG) to a PNG
// blob via UTIF, drawn through a canvas.
async function decodeTiffToBlob(buffer) {
  const ifds = UTIF.decode(buffer);
  if (!ifds || !ifds.length) return null;
  // Prefer the largest IFD (full image over thumbnail).
  ifds.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const page = ifds[0];
  UTIF.decodeImage(buffer, page, ifds);
  const rgba = UTIF.toRGBA8(page);
  const canvas = document.createElement('canvas');
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(page.width, page.height);
  imgData.data.set(rgba);
  ctx.putImageData(imgData, 0, 0);
  return await new Promise((res) => canvas.toBlob(res, 'image/png'));
}

// Verify a blob URL actually decodes as an image in this browser.
function canDecode(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ ok: false });
    img.src = url;
  });
}

// Returns { url, source, width, height, unsupported? }.
// `source` is one of: native | embedded | tiff | placeholder.
export async function loadPreview(file) {
  const { kind } = classify(file.name);

  // Fast path: browser-native formats need no work at all.
  if (kind === 'native') {
    const url = URL.createObjectURL(file);
    return { url, source: 'native' };
  }

  // HEIF/AVIF: some browsers (Safari, and Chrome for AVIF) decode natively.
  // Try that first; if it fails, fall through to an embedded-preview scan.
  if (kind === 'heif') {
    const url = URL.createObjectURL(file);
    const probe = await canDecode(url);
    if (probe.ok) return { url, source: 'native', width: probe.w, height: probe.h };
    URL.revokeObjectURL(url);
    const buffer = await readArrayBuffer(file);
    const jpeg = extractLargestJpeg(buffer);
    if (jpeg) return { url: URL.createObjectURL(jpeg), source: 'embedded' };
    return { url: null, source: 'placeholder', unsupported: true };
  }

  const buffer = await readArrayBuffer(file);

  // RAW: pull the embedded JPEG preview (fast). Fall back to TIFF decode.
  if (kind === 'raw') {
    const jpeg = extractLargestJpeg(buffer);
    if (jpeg) return { url: URL.createObjectURL(jpeg), source: 'embedded' };
    try {
      const blob = await decodeTiffToBlob(buffer);
      if (blob) return { url: URL.createObjectURL(blob), source: 'tiff' };
    } catch {
      /* fall through */
    }
    return { url: null, source: 'placeholder', unsupported: true };
  }

  // Plain TIFF: prefer an embedded JPEG if present, else full decode.
  if (kind === 'tiff') {
    const jpeg = extractLargestJpeg(buffer);
    if (jpeg) return { url: URL.createObjectURL(jpeg), source: 'embedded' };
    try {
      const blob = await decodeTiffToBlob(buffer);
      if (blob) return { url: URL.createObjectURL(blob), source: 'tiff' };
    } catch {
      /* fall through */
    }
    return { url: null, source: 'placeholder', unsupported: true };
  }

  // Unknown extension: last-ditch attempts — native, then embedded scan.
  const url = URL.createObjectURL(file);
  const probe = await canDecode(url);
  if (probe.ok) return { url, source: 'native', width: probe.w, height: probe.h };
  URL.revokeObjectURL(url);
  const jpeg = extractLargestJpeg(buffer);
  if (jpeg) return { url: URL.createObjectURL(jpeg), source: 'embedded' };
  return { url: null, source: 'placeholder', unsupported: true };
}

// Human-readable, comma-free file size.
export function humanSize(bytes = 0) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  return `${n.toFixed(n < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
}
