/**
 * @file Compute — the storage buffer, the compute program, the dispatch, the
 * render stage's read-only storage, and the readback.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  init, endFrame, renderTarget, SCREEN, program, bind, filter, dispatch, storage,
  readBuffer, buffer, draw, setCamera, tree,
} from '../src/index.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

const KERNEL = `
@group(0) @binding(0) var<storage, read_write> values: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  values[gid.x] = vec4f(f32(gid.x), 1.0, 0.0, 1.0);
}`;

const SHOW = `
@group(0) @binding(0) var<storage, read> values: array<vec4f>;

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  return values[u32(clamp(floor(vTexCoord.x * 8.0), 0.0, 7.0))];
}`;

/** A geometry for a program that draws nothing but needs a layout. */
const quad = (ctx) => buffer(ctx, {
  aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
  aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
});

test('a compute program: one entry, its workgroup size read off the source, a compute pipeline', async () => {
  const { ctx, calls } = await setup();
  const kernel = program(ctx, KERNEL, { compute: true });
  assert.equal(kernel.kind, 'compute');
  assert.equal(kernel.entry, 'main');
  assert.deepEqual(kernel.workgroup, [64, 1, 1]);

  const made = lastOf(calls, 'createComputePipeline');
  assert.ok(made, 'the compute pipeline is created');
  assert.equal(made[2].compute.entryPoint, 'main');

  const bound = kernel.bound.map((b) => [b.kind, b.name, b.binding]);
  assert.deepEqual(bound, [['storage', 'values', 0]]);
  endFrame(ctx);
});

test('a compute program needs an entry: a source with none is refused, once', async () => {
  const { ctx } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let kernel;
  try {
    kernel = program(ctx, '@fragment\nfn fs() -> @location(0) vec4f { return vec4f(1.0); }', { compute: true });
  } finally {
    console.error = original;
  }
  assert.equal(kernel, null);
  assert.match(logged[0], /@compute/);
});

test('a storage buffer: the record, its usage and its seed', async () => {
  const { ctx, calls } = await setup();
  const values = storage(ctx, new Float32Array([1, 2, 3, 4]));
  assert.ok(values && values.gpu);
  assert.equal(values.size, 16);

  const created = lastOf(calls, 'createBuffer');
  assert.ok(created, 'the buffer is created');
  const usage = created[2].usage;
  assert.ok(usage & 0x0080, 'STORAGE');
  assert.ok(usage & 0x0008, 'COPY_DST');
  assert.ok(usage & 0x0004, 'COPY_SRC');

  const seed = lastOf(calls, 'queue.writeBuffer');
  assert.equal(seed[1], values.gpu.id);
  assert.equal(seed[2], 0);
  assert.deepEqual(seed[4], [0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 128, 64]);

  // a size alone is a buffer the GPU fills
  const empty = storage(ctx, 64);
  assert.equal(empty.size, 64);
  endFrame(ctx);
});

test('a dispatch: the compute pass, its pipeline and group, the counts — then the draw\'s pass', async () => {
  const { ctx, calls, world } = await setup();
  const values = storage(ctx, new Float32Array(8 * 4));
  const kernel = program(ctx, KERNEL, { compute: true });
  const show = program(ctx, SHOW);
  const scene = renderTarget(ctx);

  bind(ctx, kernel, { values });
  dispatch(ctx, [1]);
  assert.equal(allOf(calls, 'beginComputePass').length, 1);
  assert.deepEqual(lastOf(calls, 'computePass.dispatchWorkgroups').slice(1), [1, 1, 1]);
  assert.equal(lastOf(calls, 'computePass.setPipeline')[1], lastOf(calls, 'createComputePipeline')[1]);

  filter(ctx, show, { values });            // the draw ends the compute pass and begins the render pass
  const order = allOf(calls, 'computePass.end').length;
  assert.equal(order, 1, 'the compute pass ended');
  assert.equal(world.submitted, 0);
  endFrame(ctx);
  assert.equal(world.submitted, 1, 'one submit: the compute and the draw together');
});

test('a render program reads a storage buffer in its vertex stage', async () => {
  const { ctx, calls } = await setup();
  const values = storage(ctx, new Float32Array(8 * 4));
  const geo = quad(ctx);
  const prog = program(ctx, `
@group(0) @binding(0) var<storage, read> values: array<vec4f>;

@vertex
fn vs(@location(0) aPosition: vec2f) -> @builtin(position) vec4f {
  return vec4f(aPosition + values[0].x * 0.0, 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f { return vec4f(1.0); }`, { buffers: geo.bufferLayouts });

  const bound = prog.bound.map((b) => [b.kind, b.name]);
  assert.deepEqual(bound, [['storage', 'values']]);
  const layout = lastOf(calls, 'createBindGroupLayout');
  const entry = layout[2].entries.find((e) => e.binding === 0);
  assert.equal(entry.buffer.type, 'read-only-storage');

  const scene = renderTarget(ctx);
  ctx.backend.bindTarget(ctx, scene);
  ctx.backend.clear(ctx, [0, 0, 0, 1]);
  setCamera(ctx, tree.createCamera({ eye: [0, 0, 100] }));
  bind(ctx, prog, { values });
  draw(ctx, geo);
  endFrame(ctx);

  const group = lastOf(calls, 'createBindGroup');
  assert.ok(group[2].entries.some((e) => e.resource && e.resource.buffer === values.gpu), 'the storage is in the group');
});

test('a readback: a copy on the frame\'s encoder, the bytes after the submit', async () => {
  const { ctx, calls, world } = await setup();
  const values = storage(ctx, new Float32Array(4));
  const kernel = program(ctx, KERNEL, { compute: true });
  world.picked = [0, 0, 128, 63, 0, 0, 0, 64, 0, 0, 64, 64, 0, 0, 128, 64];

  bind(ctx, kernel, { values });
  dispatch(ctx, [1]);
  const reading = readBuffer(ctx, values);
  endFrame(ctx);
  const bytes = await reading;

  assert.equal(bytes.length, 16);
  assert.deepEqual(Array.from(bytes), world.picked);
  const copy = lastOf(calls, 'copyBufferToBuffer');
  assert.equal(copy[1], values.gpu.id);
  assert.notEqual(copy[3], values.gpu.id);        // the staging buffer, the copy's destination
  assert.equal(copy[4], 0);
  assert.equal(copy[5], 16);
  assert.equal(world.submitted, 1);
});

test('the guards: a dispatch of a render program, a draw of a compute program, a storage the bag forgot', async () => {
  const { ctx } = await setup();
  const values = storage(ctx, new Float32Array(8 * 4));
  const kernel = program(ctx, KERNEL, { compute: true });
  const show = program(ctx, SHOW);
  const geo = quad(ctx);

  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    bind(ctx, show);
    assert.equal(dispatch(ctx, [1]), null);
    bind(ctx, kernel);
    assert.equal(draw(ctx, geo), null);
    assert.equal(dispatch(ctx, [1]), null);      // the storage the bag forgot
  } finally {
    console.error = original;
  }
  assert.ok(logged.some((line) => /not a compute program/.test(line)));
  assert.ok(logged.some((line) => /compute program — bind a render/.test(line)));
  assert.ok(logged.some((line) => /storage `values`/.test(line)));
  endFrame(ctx);
});

test('dispose frees the storage buffers', async () => {
  const { ctx, calls } = await setup();
  const values = storage(ctx, new Float32Array(4));
  const gpu = values.gpu;
  ctx.backend.dispose(ctx);
  assert.ok(allOf(calls, 'buffer.destroy').some((call) => call[1] === gpu.id), 'the storage buffer is destroyed');
});
