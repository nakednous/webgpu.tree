/**
 * @file Picking — the readback's copy and order, the 1 × 1 target, the id, and
 * the restores.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEBGL, mat4Mul, mat4Pick, mat4FromTRS, mat4Ortho } from '@nakednous/tree';

import { init, renderTarget, program, bind, draw, setCamera, buffer, readPixel, pick, SCREEN } from '../src/index.js';
import { canvasScale, canvasViewport } from '../src/space.js';
import { frameOf, viewportOf } from '../src/frame.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf, namesOf } from './gpu.js';

async function setup(canvasOpts) {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  Object.assign(canvas, canvasOpts || {});
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world, canvas };
}

const ID_WGSL = `
struct U {
  uModelViewProjectionMatrix: mat4x4f,
  uColor: vec4f,
};
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@location(0) aPosition: vec3f) -> @builtin(position) vec4f {
  return u.uModelViewProjectionMatrix * vec4f(aPosition, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f { return u.uColor; }`;

const TRIANGLE = {
  position: { numComponents: 3, data: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]) },
  indices: { numComponents: 3, data: new Uint16Array([0, 1, 2]) },
};

function matrices() {
  const V = mat4FromTRS(new Float32Array(16), 0, 0, -120, 0, 0, 0, 1, 1, 1, 1);
  const P = mat4Ortho(new Float32Array(16), -80, 80, -60, 60, 1, 400, WEBGL);
  return { V, P };
}

const floatsOf = (calls, index) => {
  const writes = allOf(calls, 'queue.writeBuffer');
  const write = writes[index < 0 ? writes.length + index : index];
  if (!write) return null;
  const bytes = Uint8Array.from(write[4]);
  return Array.from(new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4)));
};

test('readPixel copies a 1 × 1 block of the target, after the frame, and answers four bytes', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  ctx.backend.bindTarget(ctx, target);
  ctx.backend.clear(ctx, [0, 0, 0, 1]);          // something for the frame to submit
  world.picked = [7, 8, 9, 255];
  const px = await readPixel(ctx, target, 4, 6);
  assert.equal(px.length, 4);
  assert.deepEqual(Array.from(px), [7, 8, 9, 255]);
  const copy = allOf(calls, 'copyTextureToBuffer')[0][1];
  assert.equal(copy.bytesPerRow, 256);
  assert.deepEqual(copy.origin, { x: 4, y: 6 });
  assert.deepEqual(copy.size, { width: 1, height: 1 });
  assert.equal(copy.texture, target.color.gpu.id);
  // the frame's encoder is submitted before the copy's own
  const names = namesOf(calls);
  assert.ok(names.indexOf('queue.submit') < names.indexOf('copyTextureToBuffer'));
});

test('readPixel refuses the canvas, and says why', async () => {
  const { ctx, calls } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  let px;
  try {
    px = await readPixel(ctx, SCREEN, 0, 0);
  } finally {
    console.error = original;
  }
  assert.deepEqual(Array.from(px), [0, 0, 0, 0]);
  assert.match(logged[0], /presentation surface/);
  assert.equal(allOf(calls, 'copyTextureToBuffer').length, 0);
});

test('pick: a 1 × 1 target, black-cleared, the ids painted per object, the narrowed projection', async () => {
  const { ctx, calls, world } = await setup();
  const { V, P } = matrices();
  const geo = buffer(ctx, TRIANGLE);
  const idProgram = program(ctx, ID_WGSL, { buffers: geo.bufferLayouts });
  setCamera(ctx, V, P);
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 32, height: 32, depth: false }));
  bind(ctx, idProgram);
  world.picked = [2, 0, 0, 255];
  const M = mat4FromTRS(new Float32Array(16), 0, 0, 0, 0, 0, 0, 1, 1, 1, 1);

  const id = await pick(ctx, 10, 12, (paint) => {
    paint(1);
    draw(ctx, geo, M);
    paint(2);
    draw(ctx, geo, M);
  }, { program: idProgram });
  assert.equal(id, 2);

  // the pick's own target, cleared black, with depth
  const made = allOf(calls, 'createTexture').map((call) => call[2]);
  const pickTextures = made.filter((t) => t.width === 1 && t.height === 1);
  assert.deepEqual(pickTextures.map((t) => t.format), ['rgba8unorm', 'depth24plus']);
  const pickPass = allOf(calls, 'beginRenderPass').map((call) => call[1]).find((pass) => pass.colorAttachments[0].view.texture.width === 1);
  assert.equal(pickPass.colorAttachments[0].loadOp, 'clear');
  assert.deepEqual(pickPass.colorAttachments[0].clearValue, { r: 0, g: 0, b: 0, a: 1 });
  assert.ok(pickPass.depthStencilAttachment);

  // two objects, two ids, each its own arena slot: red 1/255 then 2/255
  const colours = allOf(calls, 'queue.writeBuffer')
    .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)))
    .filter((floats) => floats.length >= 20 && floats[16] > 0 && floats[16] < 0.02 && floats[17] === 0);
  const ids = colours.map((floats) => floats.slice(16, 20));
  assert.ok(Math.abs(ids[0][0] - 1 / 255) < 1e-6 && ids[0][1] === 0 && ids[0][3] === 1);
  assert.ok(Math.abs(ids[1][0] - 2 / 255) < 1e-6 && ids[1][1] === 0 && ids[1][3] === 1);

  // the projection is the installed one narrowed onto the query pixel
  const vp = canvasViewport(ctx);
  const Ppick = new Float32Array(P);
  mat4Pick(Ppick, 10, 12, vp);
  const expected = mat4Mul(new Float32Array(16), Ppick, mat4Mul(new Float32Array(16), V, M));
  const first = floatsOf(calls, -2).slice(0, 16);
  first.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-5, 'mvp ' + i));

  // the copy reads the pick target, one pixel, padded row
  const copy = lastOf(calls, 'copyTextureToBuffer')[1];
  assert.deepEqual(copy.origin, { x: 0, y: 0 });
  assert.deepEqual(copy.size, { width: 1, height: 1 });
});

test('pick restores the target, the viewport, the camera, the state and the program', async () => {
  const { ctx } = await setup();
  const { V, P } = matrices();
  const scene = renderTarget(ctx, { width: 32, height: 32, depth: false });
  const geo = buffer(ctx, TRIANGLE);
  const idProgram = program(ctx, ID_WGSL, { buffers: geo.bufferLayouts });
  ctx.backend.bindTarget(ctx, scene);
  bind(ctx, idProgram);
  setCamera(ctx, V, P);
  ctx.backend.setViewport(ctx, [0, 0, 16, 16]);
  const priorP = Float32Array.from(ctx.P);
  const priorV = Float32Array.from(ctx.V);
  const priorState = ctx.state;
  await pick(ctx, 100, 100, (paint) => { paint(1); draw(ctx, geo, null) }, { program: idProgram });
  assert.deepEqual(Array.from(ctx.P), Array.from(priorP));
  assert.deepEqual(Array.from(ctx.V), Array.from(priorV));
  assert.equal(frameOf(ctx).target, scene);
  assert.deepEqual(viewportOf(ctx), [0, 0, 16, 16]);
  assert.deepEqual(ctx.state, priorState);
  assert.equal(ctx.prog, idProgram);
});

test('pick answers 0 for a miss, and draws with depth on whatever the state held', async () => {
  const { ctx, calls, world } = await setup();
  const geo = buffer(ctx, TRIANGLE);
  const idProgram = program(ctx, ID_WGSL, { buffers: geo.bufferLayouts });
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  bind(ctx, idProgram);
  ctx.backend.setState(ctx, { depth: false });
  world.picked = [0, 0, 0, 255];
  const id = await pick(ctx, 1, 1, (paint) => { paint(7); draw(ctx, geo, null) }, { program: idProgram });
  assert.equal(id, 0);
  assert.equal(ctx.state.depth, false);        // restored
});

test('the pick target is cached: two picks, one pair of textures', async () => {
  const { ctx, calls } = await setup();
  const geo = buffer(ctx, TRIANGLE);
  const idProgram = program(ctx, ID_WGSL, { buffers: geo.bufferLayouts });
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  bind(ctx, idProgram);
  const before = allOf(calls, 'createTexture').length;
  await pick(ctx, 1, 1, (paint) => { paint(1); draw(ctx, geo, null) }, { program: idProgram });
  await pick(ctx, 2, 2, (paint) => { paint(2); draw(ctx, geo, null) }, { program: idProgram });
  const pickMade = allOf(calls, 'createTexture').map((call) => call[2]).filter((t) => t.width === 1 && t.height === 1);
  assert.equal(pickMade.length, 2);            // colour + depth, once
  assert.ok(allOf(calls, 'createTexture').length - before >= 2);
});

test('the default id program is the flat one, its texture use turned off', async () => {
  const { ctx, calls } = await setup();
  const quad = buffer(ctx, {
    aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
    aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
  });
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  await pick(ctx, 20, 30, (paint) => { paint(3); draw(ctx, quad, null) });
  const flat = ctx.imageProgram;
  assert.ok(flat && flat.uniformNames.indexOf('uColor') >= 0);
  // the flat program's uUseTexture (its last member) is 0 for the pick's draw
  const last = floatsOf(calls, -1);
  assert.equal(last[last.length - 1], 0);
});

test('canvasScale and canvasViewport read the canvas and the host', async () => {
  const { ctx } = await setup({ clientWidth: 160, clientHeight: 120 });
  assert.equal(canvasScale(ctx), 2);
  assert.deepEqual(canvasViewport(ctx), [0, 120, 160, -120]);
});
