/**
 * @file Textures — the format a source resolves, the row padding of an upload,
 * its orientation, and the refresh.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, dispose, texture, upload } from '../src/index.js';
import { paddedRows, rowBytes } from '../src/readback.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

/** Two rows that must not swap: red, green on the first, blue, white on the second. */
const PIXELS = { data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]), width: 2, height: 2 };

const make = (calls) => allOf(calls, 'createTexture').map((call) => call[2]);
const uploads = (calls) => allOf(calls, 'queue.writeTexture');

test('a pixel source makes a texture of its size and format, registered for uTexelSize', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, PIXELS);
  assert.deepEqual([tex.width, tex.height, tex.format], [2, 2, 'rgba8unorm']);
  assert.ok(tex.gpu && tex.view);
  const made = make(calls)[0];
  assert.deepEqual([made.width, made.height, made.format, made.sampleCount], [2, 2, 'rgba8unorm', 1]);
  assert.equal(made.usage & 4, 4);                 // TEXTURE_BINDING, so a pass can sample it
  assert.deepEqual(ctx.sizes.get(tex), [2, 2]);
});

test('an upload\'s rows are padded to 256 bytes and run top-down: row 0 stays row 0', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, PIXELS);
  const write = uploads(calls)[0];
  assert.equal(write[1], tex.gpu.id);
  assert.equal(write[2], 256);                     // bytesPerRow
  const bytes = write[4];
  assert.deepEqual(bytes.slice(0, 8), [255, 0, 0, 255, 0, 255, 0, 255]);       // red, green
  assert.deepEqual(bytes.slice(256, 264), [0, 0, 255, 255, 255, 255, 255, 255]); // blue, white
  assert.ok(bytes.slice(8, 256).every((value) => value === 0));                 // the padding
});

test('a row that is already a 256-byte multiple is uploaded as it is', async () => {
  const { ctx, calls } = await setup();
  const data = new Uint8Array(64 * 4 * 2);
  data.fill(7, 0, 256);
  data.fill(9, 256, 512);
  texture(ctx, { data, width: 64, height: 2 });
  const write = uploads(calls)[0];
  assert.equal(write[2], 256);
  assert.equal(write[4].length, 512);              // no padded copy
  assert.equal(write[4][0], 7);
  assert.equal(write[4][256], 9);
});

test('the format follows the source: Float32Array is 32F, opts.format resolves the targets\' tokens', async () => {
  const { ctx, calls } = await setup();
  const float = texture(ctx, { data: new Float32Array(4 * 2), width: 2, height: 1 });
  assert.equal(float.format, 'rgba32float');
  assert.equal(uploads(calls).at(-1)[2], 256);     // 2 px × 16 B = 32 B → padded

  const half = texture(ctx, { data: new Uint16Array(8 * 2), width: 2, height: 1 }, { format: 'rgba16float' });
  assert.equal(half.format, 'rgba16float');
  assert.deepEqual(make(calls).map((t) => t.format), ['rgba32float', 'rgba16float']);
});

test('an element or a bitmap is copied with no flip and no origin, as its rows already run', async () => {
  const { ctx, calls } = await setup();
  const el = { width: 4, height: 3 };
  const tex = texture(ctx, el);
  assert.deepEqual([tex.width, tex.height], [4, 3]);
  const copy = lastOf(calls, 'queue.copyExternalImageToTexture');
  assert.deepEqual(copy.slice(1), [tex.gpu.id, [4, 3], { width: 4, height: 3, origin: null, flipY: false }]);
  assert.equal(uploads(calls).length, 0);
});

test('upload refreshes the same texture from a new source', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, PIXELS);
  const id = tex.gpu.id;
  const next = { data: new Uint8Array(16), width: 2, height: 2 };
  assert.equal(upload(ctx, tex, next), tex);
  assert.equal(uploads(calls).length, 2);
  assert.equal(uploads(calls).at(-1)[1], id);
  assert.equal(make(calls).length, 1);
});

test('a texture the twin made is destroyed by dispose(ctx)', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, PIXELS);
  dispose(ctx);
  assert.ok(allOf(calls, 'texture.destroy').some((call) => call[1] === tex.gpu.id));
});

test('a format the twin does not make is refused, and nothing is created', async () => {
  const { ctx, calls } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let tex;
  try {
    tex = texture(ctx, PIXELS, { format: 'r8unorm' });
  } finally {
    console.error = original;
  }
  assert.equal(tex, null);
  assert.match(logged[0], /r8unorm/);
  assert.equal(make(calls).length, 0);
});

test('the row helpers are the readback\'s, at any pixel width', () => {
  assert.equal(rowBytes(2, 4), 256);
  assert.equal(rowBytes(64, 4), 256);
  assert.equal(rowBytes(65, 4), 512);
  assert.equal(rowBytes(3, 16), 256);
  assert.equal(rowBytes(16, 16), 256);
  assert.deepEqual(paddedRows(new Uint8Array(8), 2, 1).data.length, 256);
  assert.deepEqual(paddedRows(new Uint8Array(512), 64, 2).data.length, 512);
});
