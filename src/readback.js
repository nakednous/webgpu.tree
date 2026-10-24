/**
 * @file Readback — `readPixels`: the texture-to-buffer copy, its 256-byte rows,
 * and the promise the twin answers.
 * @module webgpu.tree/readback
 * @license AGPL-3.0-only
 *
 * WebGPU has no synchronous read. A pixel read is a `copyTextureToBuffer` into a
 * `MAP_READ` buffer, a `mapAsync`, and a promise — natively asynchronous, and
 * asynchronous on the bridge for the same reason.
 *
 * The copy's rows are the spec's, not the texture's: `bytesPerRow` must be a
 * multiple of 256, a one-pixel pick included, so a 1 × 1 read copies a 256-byte
 * row and decodes four bytes at offset 0. `bytesPerRow` and `tightRows` are pure
 * functions of the size, and are what the padding is pinned by. The upload side
 * shares that alignment: `paddedRows` is what a pixel upload hands
 * `writeTexture`, so an upload's rows are padded the same way — and, like the
 * read, they run top-down with no flip.
 *
 * ```
 * readPixels(ctx, target, 0, 0, 1, 1)          // → Promise<Uint8Array> (4 bytes)
 * readPixels(ctx, target, x, y, w, h)          // → Promise<Uint8Array> (w · h · 4, rows tight)
 * ```
 *
 * The frame is submitted first — the copy must see the frame's draws — so a
 * readback ends the frame it is asked in; the application's next draw opens a
 * new one.
 */

'use strict';

import { BUFFER_USAGE, MAP_MODE } from './flags.js';
import { endFrame } from './frame.js';

/** The copy's row alignment, in bytes (WebGPU's `COPY_BYTES_PER_ROW_ALIGNMENT`). */
export const COPY_ALIGNMENT = 256;

/**
 * The `bytesPerRow` a copy of `width` RGBA8 pixels takes: the row padded up to
 * the copy alignment.
 * @param {number} width  The copy's width in pixels.
 * @returns {number} Bytes per row, 256-multiple.
 * @example
 * bytesPerRow(1)    // 256
 * bytesPerRow(65)   // 512
 */
export function bytesPerRow(width) {
  return rowBytes(width, 4);
}

/**
 * The `bytesPerRow` a copy of `width` pixels of `bytesPerPixel` bytes takes: the
 * row padded up to the copy alignment.
 * @param {number} width  The copy's width in pixels.
 * @param {number} [bytesPerPixel]  Bytes per pixel, default 4 (RGBA8).
 * @returns {number} Bytes per row, 256-multiple.
 * @example
 * rowBytes(64, 4)    // 256
 * rowBytes(3, 16)    // 256
 */
export function rowBytes(width, bytesPerPixel) {
  return Math.ceil((width * (bytesPerPixel || 4)) / COPY_ALIGNMENT) * COPY_ALIGNMENT;
}

/**
 * Pixel data as `writeTexture` wants it: rows at the copy alignment, and no flip
 * anywhere — row 0 of the source is row 0 of the texture, its top, because
 * WebGPU's texture space is top-down as a decoded image's rows are. A row that is
 * already a 256-byte multiple is passed through; otherwise the rows are packed
 * into a padded copy.
 * @param {ArrayBuffer|ArrayBufferView} source  The pixels, rows tight.
 * @param {number} width  The image's width in pixels.
 * @param {number} height  The image's height in rows.
 * @param {number} [bytesPerPixel]  Bytes per pixel, default 4 (RGBA8).
 * @returns {{ data:Uint8Array, bytesPerRow:number }} What `writeTexture` takes.
 * @example
 * paddedRows(new Uint8Array(2 * 2 * 4), 2, 2).bytesPerRow   // 256
 */
export function paddedRows(source, width, height, bytesPerPixel) {
  const bpp = bytesPerPixel || 4;
  const row = width * bpp;
  const stride = rowBytes(width, bpp);
  const bytes = source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (stride === row) return { data: bytes, bytesPerRow: row };
  const rows = height || 1;
  const out = new Uint8Array(stride * rows);
  for (let y = 0; y < rows; y++) out.set(bytes.subarray(y * row, y * row + row), y * stride);
  return { data: out, bytesPerRow: stride };
}

/**
 * The rows of a padded copy, packed to `width × 4` bytes each — what a caller
 * reads, the padding gone.
 * @param {Uint8Array} padded  The mapped range.
 * @param {number} width  The copy's width in pixels.
 * @param {number} height  The copy's height in rows.
 * @returns {Uint8Array} `width · height · 4` bytes, rows tight.
 * @example
 * tightRows(new Uint8Array(256 * 2), 1, 2).length   // 8
 */
export function tightRows(padded, width, height) {
  const stride = bytesPerRow(width);
  const rowBytes = width * 4;
  const out = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row++) {
    out.set(padded.subarray(row * stride, row * stride + rowBytes), row * rowBytes);
  }
  return out;
}

/**
 * Read pixels back from a target's colour texture.
 * @details The pending frame is submitted first, so the copy is ordered after
 * the frame's draws; the copy goes into a `MAP_READ` buffer whose rows are
 * padded to 256 bytes, is mapped, and the rows are packed before the buffer is
 * destroyed.
 * @param {object} ctx  The context record.
 * @param {object} target  A target record (its `.color`) or a texture record.
 * @param {number} x  The rect's left, in the target's pixels.
 * @param {number} y  The rect's top row, in the target's pixels.
 * @param {number} [width]  The rect's width in pixels, default 1.
 * @param {number} [height]  The rect's height in rows, default 1.
 * @returns {Promise<Uint8Array>} RGBA8 bytes, `width · height · 4` of them.
 */
export async function readPixels(ctx, target, x, y, width, height) {
  const tex = target && target.color ? target.color : target;
  const w = Math.max(1, width || 1);
  const h = Math.max(1, height || 1);
  if (!tex || !tex.gpu) {
    console.error('[webgpu.tree] readPixels: a texture (or a target) is required.');
    return new Uint8Array(w * h * 4);
  }
  const device = ctx.device;
  endFrame(ctx);   // the copy must be ordered after the frame's draws
  const stride = bytesPerRow(w);
  const buffer = device.createBuffer({
    size: stride * h,
    usage: BUFFER_USAGE.COPY_DST | BUFFER_USAGE.MAP_READ,
    label: 'webgpu.tree readback',
  });
  const encoder = device.createCommandEncoder({ label: 'webgpu.tree readback' });
  encoder.copyTextureToBuffer(
    { texture: tex.gpu, origin: { x: x | 0, y: y | 0 } },
    { buffer, bytesPerRow: stride, rowsPerImage: h },
    { width: w, height: h },
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(MAP_MODE.READ);
  const out = tightRows(new Uint8Array(buffer.getMappedRange()), w, h);
  buffer.unmap();
  buffer.destroy();
  return out;
}
