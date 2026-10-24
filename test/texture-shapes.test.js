/**
 * @file The texture shapes: volumes, arrays, mips and the cube map.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, texture, upload, cubemap } from '../src/index.js';
import { bytesPerPixel } from '../src/backend.js';
import { createCanvas, createDevice, createGpu, allOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

const made = (calls) => allOf(calls, 'createTexture').map((call) => call[2]);
const writes = (calls) => allOf(calls, 'queue.writeTexture').map((call) => ({ id: call[1], row: call[2], size: call[3], bytes: call[4], at: call[5] }));

const volume = (colours) => {
  const layers = colours.length;
  const data = new Uint8Array(2 * 2 * 4 * layers);
  for (let z = 0; z < layers; z++) {
    for (let i = 0; i < 4; i++) data.set([...colours[z], 255], 16 * z + 4 * i);
  }
  return { data, width: 2, height: 2 };
};

test('a pixel source with depth is a 3d texture, written a slice at a time', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { ...volume([[255, 0, 0], [0, 255, 0]]), depth: 2 });
  assert.deepEqual([tex.width, tex.height, tex.layers, tex.dimension, tex.format], [2, 2, 2, '3d', 'rgba8unorm']);
  const desc = made(calls).at(-1);
  assert.deepEqual([desc.width, desc.height, desc.layers, desc.dimension, desc.mipLevelCount], [2, 2, 2, '3d', 1]);
  const w = writes(calls);
  assert.equal(w.length, 2);
  assert.deepEqual(w.map((x) => x.at.origin), [[0, 0, 0], [0, 0, 1]]);
  assert.deepEqual(w.map((x) => x.row), [256, 256]);               // padded rows, a slice at a time
  assert.deepEqual(w[0].bytes.slice(0, 4), [255, 0, 0, 255]);
  assert.deepEqual(w[1].bytes.slice(0, 4), [0, 255, 0, 255]);
  assert.deepEqual(w.map((x) => x.size), [[2, 2, 1], [2, 2, 1]]);
});

test('a pixel source with layers is a 2d array, its view an array\'s', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { ...volume([[10, 20, 30], [30, 20, 10], [1, 2, 3]]), layers: 3 });
  assert.deepEqual([tex.layers, tex.dimension], [3, '2d']);
  const desc = made(calls).at(-1);
  assert.deepEqual([desc.width, desc.height, desc.layers, desc.dimension], [2, 2, 3, '2d']);
  const view = allOf(calls, 'texture.createView').at(-1);
  assert.ok(view);                                                 // the array view is asked for on creation
  assert.equal(writes(calls).length, 3);
});

test('a mip chain is created whole and generated through the peer', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 }, { mips: true });
  assert.equal(made(calls).at(-1).mipLevelCount, 3);               // 4 → 2 → 1
  const modules = allOf(calls, 'createShaderModule').map((call) => call[2]);
  assert.ok(modules.some((label) => /mip level generation/.test(label || '')));
  assert.ok(allOf(calls, 'createRenderPipeline').length >= 1);     // the chain's pass
  assert.ok(tex.gpu);
});

test('a volume takes no chain, and says so', async () => {
  const { ctx, calls } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let tex;
  try {
    tex = texture(ctx, { data: new Uint8Array(2 * 2 * 2 * 4), width: 2, height: 2, depth: 2 }, { mips: true });
  } finally {
    console.error = original;
  }
  assert.equal(made(calls).at(-1).mipLevelCount, 1);
  assert.match(logged[0], /3d texture takes no mip chain/);
  assert.ok(tex);
});

test('the channel formats: bytes from the name, a single-channel volume taken', async () => {
  assert.equal(bytesPerPixel('r8unorm'), 1);
  assert.equal(bytesPerPixel('rg8unorm'), 2);
  assert.equal(bytesPerPixel('rgba16float'), 8);
  assert.equal(bytesPerPixel('rgba32float'), 16);
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { data: new Uint8Array(2 * 2 * 2), width: 2, height: 2, depth: 2 }, { format: 'r8unorm' });
  assert.equal(tex.format, 'r8unorm');
  const w = writes(calls);
  assert.deepEqual(w[0].size, [[2, 2, 1]][0]);
  assert.equal(w[0].row, 256);                                     // a two-byte row padded
  assert.equal(w[0].bytes.length, 512);                            // two rows at the padded stride
});

test('cubemap: six faces at six layers, the view a cube', async () => {
  const { ctx, calls } = await setup();
  const faces = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]]
    .map(([r, g, b]) => ({ data: new Uint8Array([r, g, b, 255]), width: 1, height: 1 }));
  const tex = cubemap(ctx, faces);
  const desc = made(calls).at(-1);
  assert.deepEqual([desc.width, desc.height, desc.layers, desc.dimension, desc.mipLevelCount], [1, 1, 6, '2d', 1]);
  const w = writes(calls);
  assert.equal(w.length, 6);
  assert.deepEqual(w.map((x) => x.at.origin), [0, 1, 2, 3, 4, 5].map((z) => [0, 0, z]));
  assert.deepEqual(w[0].bytes.slice(0, 3), [255, 0, 0]);
  assert.deepEqual(w[5].bytes.slice(0, 3), [255, 0, 255]);
  const view = allOf(calls, 'texture.createView').filter((c) => c[1] === tex.view.id)[0];
  assert.deepEqual(view[3], { dimension: 'cube' });                 // the cube's view is asked for
  assert.equal(tex.layers, 6);
});

test('cubemap refuses fewer than six faces, and a volume upload refreshes slice by slice', async () => {
  const { ctx, calls } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    assert.equal(cubemap(ctx, [{ data: new Uint8Array(4), width: 1, height: 1 }]), null);
  } finally {
    console.error = original;
  }
  assert.match(logged[0], /six faces/);
  const tex = texture(ctx, { ...volume([[1, 2, 3], [4, 5, 6]]), depth: 2 });
  const before = writes(calls).length;
  upload(ctx, tex, { ...volume([[7, 8, 9], [10, 11, 12]]), depth: 2 });
  const after = writes(calls).slice(before);
  assert.equal(after.length, 2);
  assert.deepEqual(after.map((x) => x.at.origin[2]), [0, 1]);
});
