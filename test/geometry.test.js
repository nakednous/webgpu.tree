/**
 * @file Geometry — the layout an arrays shape implies, the geometry `buffer`
 * answers, and the pipeline layout a draw bakes.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBufferLayoutsFromArrays } from 'webgpu-utils';

import { init, buffer, updateBuffer, program, bind, draw, drawInstanced, renderTarget } from '../src/index.js';
import { QUAD_LAYOUT } from '../src/programs.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf, namesOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

/** A triangle, as host's meshes and tree's generators shape it. */
function triangle() {
  return {
    position: { numComponents: 3, data: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) },
    normal: { numComponents: 3, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) },
    texcoord: { numComponents: 2, data: new Float32Array([0, 0, 1, 0, 0.5, 1]) },
    indices: { numComponents: 3, data: new Uint16Array([0, 1, 2]) },
    bounds: { min: [-1, -1, 0], max: [1, 1, 0] },   // no numbers to upload
  };
}

const WGSL = `
struct U {
  uModelViewProjectionMatrix: mat4x4f,
};
@group(0) @binding(0) var<uniform> u: U;

struct VOut {
  @builtin(position) position: vec4f,
};

@vertex
fn vs(@location(0) aPosition: vec3f) -> VOut {
  var v: VOut;
  v.position = u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
  return v;
}

@fragment
fn fs() -> @location(0) vec4f { return vec4f(1.0); }`;

test('the geometry\'s layout is its arrays shape\'s: key order is location order, one interleaved buffer', async () => {
  const { ctx } = await setup();
  const geo = buffer(ctx, triangle());
  const named = {
    aPosition: { numComponents: 3, data: triangle().position.data },
    aNormal: { numComponents: 3, data: triangle().normal.data },
    aTexCoord: { numComponents: 2, data: triangle().texcoord.data },
  };
  assert.deepEqual(geo.bufferLayouts, createBufferLayoutsFromArrays(named).bufferLayouts);
  assert.deepEqual(geo.bufferLayouts, [{
    stepMode: 'vertex',
    arrayStride: 32,                         // 3 + 3 + 2 floats
    attributes: [
      { offset: 0, format: 'float32x3', shaderLocation: 0 },
      { offset: 12, format: 'float32x3', shaderLocation: 1 },
      { offset: 24, format: 'float32x2', shaderLocation: 2 },
    ],
  }]);
  assert.deepEqual(Object.keys(geo.arrays), ['aPosition', 'aNormal', 'aTexCoord', 'indices']);
});

test('buffer renames the arrays shape under the shaders\' names, and skips what holds no numbers', async () => {
  const { ctx } = await setup();
  const mesh = { ...triangle(), count: 3, labels: ['a', 'b', 'c'], aHeat: { numComponents: 1, data: new Float32Array([0, 0.5, 1]) } };
  const geo = buffer(ctx, mesh);
  assert.deepEqual(Object.keys(geo.arrays), ['aPosition', 'aNormal', 'aTexCoord', 'indices', 'aHeat']);
  assert.equal(geo.indexFormat, 'uint16');
  assert.equal(geo.numElements, 3);           // the index count
  assert.equal(geo.buffers.length, 1);

  const renamed = buffer(ctx, { position: triangle().position, aUV: triangle().texcoord });
  assert.deepEqual(Object.keys(renamed.arrays), ['aPosition', 'aUV']);
  assert.equal(renamed.bufferLayouts[0].attributes[1].shaderLocation, 1);
});

test('joints upload unnormalised, as an index is', async () => {
  const { ctx } = await setup();
  const geo = buffer(ctx, {
    position: triangle().position,
    joints: new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  });
  const joints = geo.bufferLayouts[0].attributes[1];
  assert.equal(joints.format, 'uint16x4');    // a byte key would be unorm; joints are indices
});

test('updateBuffer rebuilds the same record and frees the old buffers', async () => {
  const { ctx, calls } = await setup();
  const geo = buffer(ctx, triangle());
  const id = geo.id;
  const before = geo.buffers[0].id;
  updateBuffer(ctx, geo, triangle());
  assert.equal(geo.id, id);
  assert.notEqual(geo.buffers[0].id, before);
  assert.ok(allOf(calls, 'buffer.destroy').some((call) => call[1] === before));
  assert.equal(geo.numElements, 3);
});

test('the pipeline bakes the geometry\'s layout when the program is given it', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 64, depth: false });
  const geo = buffer(ctx, triangle());
  const prog = program(ctx, WGSL, { buffers: geo.bufferLayouts });
  ctx.backend.bindTarget(ctx, target);
  bind(ctx, prog, { uTint: 1 });
  draw(ctx, geo, null);

  const pipeline = lastOf(calls, 'createRenderPipeline')[2];
  assert.deepEqual(pipeline.vertex.buffers, geo.bufferLayouts);
  assert.equal(pipeline.vertex.buffers[0].arrayStride, 32);
  assert.deepEqual(pipeline.vertex.buffers[0].attributes.map((a) => a.shaderLocation), [0, 1, 2]);

  // the geometry is what the pass sets: the one vertex buffer, then the index
  const sets = allOf(calls, 'pass.setVertexBuffer');
  assert.deepEqual(sets.map((call) => [call[1], call[2]]), [[0, geo.buffers[0].id]]);
  const index = lastOf(calls, 'pass.setIndexBuffer');
  assert.deepEqual([index[1], index[2]], [geo.indexBuffer.id, 'uint16']);
  assert.deepEqual(lastOf(calls, 'pass.drawIndexed').slice(1), [3, 1, 0]);
  assert.ok(world.pass);

  // a partial draw counts in the geometry's own units
  draw(ctx, geo, { count: 3, offset: 0 });
  assert.deepEqual(lastOf(calls, 'pass.drawIndexed').slice(1), [3, 1, 0]);
});

test('without opts.buffers a program\'s pipeline is the fullscreen quad\'s — the pass case', async () => {
  const { ctx, calls } = await setup();
  const prog = program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }');
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  bind(ctx, prog);
  draw(ctx, buffer(ctx, {
    aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
    aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
  }));
  const pipeline = lastOf(calls, 'createRenderPipeline')[2];
  assert.deepEqual(pipeline.vertex.buffers, QUAD_LAYOUT);
});

test('drawInstanced passes the instance count, and draws non-indexed geometry with its vertex count', async () => {
  const { ctx, calls } = await setup();
  const geo = buffer(ctx, { position: triangle().position });
  const prog = program(ctx, WGSL, { buffers: geo.bufferLayouts });
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  bind(ctx, prog);
  drawInstanced(ctx, geo, 5);
  assert.equal(geo.indexBuffer, undefined);
  assert.deepEqual(lastOf(calls, 'pass.draw').slice(1), [3, 5, 0]);
});
