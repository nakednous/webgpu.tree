/**
 * @file Readback: the 256-byte rows, the packing, and the promise.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, renderTarget, filter, program } from '../src/index.js';
import { bytesPerRow, readPixels, tightRows } from '../src/readback.js';
import { createCanvas, createDevice, createGpu, namesOf, allOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

test('a copy\'s row is padded to 256 bytes, a one-pixel read included', () => {
  assert.equal(bytesPerRow(1), 256);
  assert.equal(bytesPerRow(4), 256);
  assert.equal(bytesPerRow(64), 256);
  assert.equal(bytesPerRow(65), 512);
  assert.equal(bytesPerRow(128), 512);
  assert.equal(bytesPerRow(129), 768);
});

test('the padded rows pack to the width\'s own bytes', () => {
  const padded = new Uint8Array(256 * 2);
  padded.set([1, 2, 3, 4, 5, 6, 7, 8], 0);          // two pixels on row 0
  padded.set([9, 10, 11, 12, 13, 14, 15, 16], 256);  // two more on row 1
  const tight = tightRows(padded, 2, 2);
  assert.deepEqual(Array.from(tight), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
});

test('a one-pixel read copies a 256-byte row and answers four bytes', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0, 0.0, 0.0, 1.0); }'));
  const pixel = await readPixels(ctx, target, 0, 0, 1, 1);
  assert.equal(pixel.length, 4);
  const copy = allOf(calls, 'copyTextureToBuffer')[0][1];
  assert.equal(copy.bytesPerRow, 256);
  assert.equal(copy.rowsPerImage, 1);
  assert.deepEqual(copy.origin, { x: 0, y: 0 });
  assert.deepEqual(copy.size, { width: 1, height: 1 });
  assert.equal(copy.texture, target.color.gpu.id);
});

test('a block read pads its rows and answers tight ones', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  const block = await readPixels(ctx, target.color, 4, 6, 3, 2);
  assert.equal(block.length, 3 * 2 * 4);
  const copy = allOf(calls, 'copyTextureToBuffer')[0][1];
  assert.equal(copy.bytesPerRow, 256);
  assert.equal(copy.rowsPerImage, 2);
  assert.deepEqual(copy.origin, { x: 4, y: 6 });
});

test('the copy is ordered after the frame: submit, then copy, then map', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }'));
  await readPixels(ctx, target, 0, 0, 1, 1);
  const names = namesOf(calls);
  const drawn = names.lastIndexOf('pass.end');
  const submitted = names.indexOf('queue.submit');
  const copied = names.indexOf('copyTextureToBuffer');
  const mapped = names.indexOf('buffer.mapAsync');
  assert.ok(drawn < submitted, 'the frame is ended and submitted before the copy');
  assert.ok(submitted < copied, 'the frame\'s draw is submitted ahead of the read');
  assert.ok(copied < mapped);
});
