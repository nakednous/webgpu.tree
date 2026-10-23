/**
 * @file The WebGPU flag bits the bridge states, as numbers.
 * @module webgpu.tree/flags
 * @license AGPL-3.0-only
 *
 * Usage and access flags are bit fields whose values the WebGPU specification
 * fixes; a browser also exposes them as globals (`GPUTextureUsage`, …). The
 * bridge reads the values from here rather than from the globals, so a module
 * can be loaded where no GPU exists — under `node --test`, where the recording
 * device stands up the globals only because `webgpu-utils` reads them at call
 * time.
 *
 * A flag this table does not name is one the bridge does not state.
 */

'use strict';

/** `GPUTextureUsage`, the specification's bits. */
export const TEXTURE_USAGE = Object.freeze({
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  STORAGE_BINDING: 0x08,
  RENDER_ATTACHMENT: 0x10,
});

/** `GPUBufferUsage`, the specification's bits. */
export const BUFFER_USAGE = Object.freeze({
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
});

/** `GPUMapMode`, the specification's bits. */
export const MAP_MODE = Object.freeze({ READ: 0x0001, WRITE: 0x0002 });

/** `GPUColorWrite`, the specification's bits. */
export const COLOR_WRITE = Object.freeze({ R: 0x1, G: 0x2, B: 0x4, A: 0x8, ALL: 0xf });
