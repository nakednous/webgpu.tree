/**
 * @file Space — the mappings against the matrices they are made of, the two
 * spaces, the frame dispatch and the canvas crossing.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  init, setCamera, tree,
  mapLocation, mapDirection, unproject, fragCoord, pixelRatio, mat4Viewport,
} from '../src/index.js';
import { canvasViewport, canvasScale } from '../src/space.js';
import { createCanvas, createDevice, createGpu } from './gpu.js';

async function setup(canvasOpts) {
  const { device, calls } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  Object.assign(canvas, canvasOpts || {});
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  const cam = tree.createCamera({ eye: [0, 0, 300], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 });
  setCamera(ctx, cam);
  return { ctx, canvas };
}

const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-5);

test('mapLocation is W · P · V: the viewport matrix, the camera, the point', async () => {
  const { ctx } = await setup();
  const vp = canvasViewport(ctx);
  const W = mat4Viewport(ctx, new Float32Array(16));
  const WPV = tree.mat4Mul(new Float32Array(16), W, ctx.PV);
  const expected = tree.mat4MulPoint([0, 0, 0], WPV, 40, 30, 0);
  const got = mapLocation(ctx, [0, 0, 0], 40, 30, 0, tree.WORLD, tree.SCREEN);
  assert.deepEqual(vp, [0, 240, 320, -240]);
  got.forEach((value, i) => assert.ok(near(value, expected[i]), 'component ' + i));
});

test('unproject answers the ray back through the mapped pixel', async () => {
  const { ctx } = await setup();
  const screen = mapLocation(ctx, [0, 0, 0], 40, 30, 0, tree.WORLD, tree.SCREEN);
  const origin = [0, 0, 0], dir = [0, 0, 0];
  assert.ok(unproject(ctx, origin, dir, screen[0], screen[1]));
  // the ray starts on the near plane: eye space z is −near
  const eyeSpace = tree.mat4MulPoint([0, 0, 0], ctx.V, origin[0], origin[1], origin[2]);
  assert.ok(near(eyeSpace[2], -1, 1e-3), 'the origin is the near plane: z ' + eyeSpace[2]);
  // and the mapped world point lies on it
  const t = (40 - origin[0]) * dir[0] + (30 - origin[1]) * dir[1] + (0 - origin[2]) * dir[2];
  const p = [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]];
  assert.ok(near(p[0], 40, 1e-3) && near(p[1], 30, 1e-3) && near(p[2], 0, 1e-3));
  assert.ok(near(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2], 1));   // normalized
});

test('mapDirection is the view\'s rotation, translation ignored', async () => {
  const { ctx } = await setup();
  // the camera looks down −z; walk it to the side and map a world direction
  const cam = tree.createCamera({ eye: [300, 0, 0], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 });
  setCamera(ctx, cam);
  const got = mapDirection(ctx, [0, 0, 0], 0, 0, -1, tree.WORLD, tree.EYE);
  const expected = tree.mat4MulDir([0, 0, 0], ctx.V, 0, 0, -1);
  got.forEach((value, i) => assert.ok(near(value, expected[i]), 'component ' + i));
  // and back: the mapped direction returns to the world one
  const back = mapDirection(ctx, [0, 0, 0], got[0], got[1], got[2], tree.EYE, tree.WORLD);
  back.forEach((value, i) => assert.ok(near(value, [0, 0, -1][i], 1e-4), 'round trip ' + i));
});

test('fragCoord scales to device pixels and does not flip: window space is top-left too', async () => {
  const { ctx, canvas } = await setup({ clientWidth: 160, clientHeight: 120 });
  assert.equal(canvasScale(ctx), 2);
  assert.deepEqual(fragCoord(ctx, [0, 0], 10, 20), [20, 40]);
  assert.deepEqual(fragCoord(ctx, [0, 0], 0, 0), [0, 0]);
  assert.deepEqual(fragCoord(ctx, [0, 0], 160, 120), [320, 240]);
  assert.equal(canvas.clientWidth, 160);
});

test('init sizes the buffer by the density, and that ratio is the canvas scale', async () => {
  const { device } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  canvas.clientWidth = 400;                       // the CSS size the application writes
  canvas.clientHeight = 300;
  const gpu = createGpu({ device });
  const ctx = await init(canvas, {
    gpu, device, context, format: 'rgba8unorm', width: 400, height: 300, density: 2,
  });
  // the drawing buffer is the logical size times the density, and the context is that buffer
  assert.deepEqual([canvas.width, canvas.height], [800, 600]);
  assert.deepEqual([ctx.width, ctx.height], [800, 600]);
  // the device ratio is the buffer's width over the canvas's logical width
  assert.equal(canvasScale(ctx), 2);
  assert.deepEqual(canvasViewport(ctx), [0, 300, 400, -300]);
  // and it is what the window-space crossing and the HUD's world scale read
  const cam = tree.createCamera({ eye: [0, 0, 300], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 });
  setCamera(ctx, cam);
  assert.deepEqual(fragCoord(ctx, [0, 0], 10, 20), [20, 40]);
  assert.ok(near(pixelRatio(ctx, -300), 2 * 300 * Math.tan(Math.PI / 8) / 300));
  assert.deepEqual(tree.mat4MulPoint([0, 0, 0], mat4Viewport(ctx, new Float32Array(16)), 1, -1, 0), [400, 300, 0]);
});

test('pixelRatio is the projection\'s world height over the logical height', async () => {
  const { ctx } = await setup();
  const ratio = pixelRatio(ctx, -300);
  const expected = 2 * 300 * Math.tan(Math.PI / 8) / 240;
  assert.ok(near(ratio, expected));
});

test('mat4Viewport seats the NDC square in the viewport and depth in [0, 1]', async () => {
  const { ctx } = await setup();
  const W = mat4Viewport(ctx, new Float32Array(16));
  assert.deepEqual(tree.mat4MulPoint([0, 0, 0], W, -1, 1, 0), [0, 0, 0]);
  assert.deepEqual(tree.mat4MulPoint([0, 0, 0], W, 1, -1, 0), [320, 240, 0]);
  assert.deepEqual(tree.mat4MulPoint([0, 0, 0], W, 0, 0, 0), [160, 120, 0]);
  assert.ok(near(tree.mat4MulPoint([0, 0, 0], W, 0, 0, 1)[2], 1));   // WEBGPU: NDC z 1 is the far plane
});

test('a frame is a space: a matrix from maps through its coordinates, a singular to answers null', async () => {
  const { ctx } = await setup();
  const M = tree.mat4FromTRS(new Float32Array(16), 10, 20, 30, 0, 0, 0, 1, 1, 1, 1);
  const inFrame = mapLocation(ctx, [0, 0, 0], 5, 6, 7, M, tree.SCREEN);
  const world = tree.mat4MulPoint([0, 0, 0], M, 5, 6, 7);
  const inWorld = mapLocation(ctx, [0, 0, 0], world[0], world[1], world[2], tree.WORLD, tree.SCREEN);
  inFrame.forEach((value, i) => assert.ok(near(value, inWorld[i], 1e-4), 'component ' + i));

  assert.equal(mapLocation(ctx, [0, 0, 0], 0, 0, 0, tree.WORLD, new Float32Array(16)), null);
});

test('the host\'s bag is the one the mappings read', async () => {
  const { device } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const cam = tree.createCamera({ eye: [0, 0, 300], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  setCamera(ctx, cam);
  const own = mapLocation(ctx, [0, 0, 0], 40, 30, 0, tree.WORLD, tree.SCREEN);
  // an ortho projection written straight into the context's own bag moves the answer
  const P2 = tree.mat4Ortho(new Float32Array(16), -160, 160, -120, 120, 1, 1000);
  ctx.view.set(P2, ctx.V);
  const viaBag = mapLocation(ctx, [0, 0, 0], 40, 30, 0, tree.WORLD, tree.SCREEN);
  assert.notDeepEqual(Array.from(own), Array.from(viaBag));
  const WPV = tree.mat4Mul(new Float32Array(16), mat4Viewport(ctx, new Float32Array(16)),
    tree.mat4Mul(new Float32Array(16), P2, ctx.V));
  const direct = tree.mat4MulPoint([0, 0, 0], WPV, 40, 30, 0);
  viaBag.forEach((value, i) => assert.ok(near(value, direct[i]), 'component ' + i));
});
