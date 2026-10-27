/**
 * @file Panes, the frustum's textured faces, and the helm rig's HUD form with
 * its labels.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, setCamera, tree, renderTarget, pane, viewFrustum, helmRig, texture } from '../src/index.js';
import { PANE_LAYOUT } from '../src/programs.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

async function setup(canvasOpts, host) {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  Object.assign(canvas, canvasOpts || {});
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm', host });
  const target = renderTarget(ctx, { width: 320, height: 240, depth: false });
  ctx.backend.bindTarget(ctx, target);
  setCamera(ctx, tree.createCamera({ eye: [0, 0, 300], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 }));
  return { ctx, calls, world, canvas };
}

const CORNERS = [[-40, 40, 0], [40, 40, 0], [40, -40, 0], [-40, -40, 0],];
const floatsOf = (calls, index) => {
  const writes = allOf(calls, 'queue.writeBuffer');
  const write = writes[index < 0 ? writes.length + index : index];
  if (!write) return null;
  const bytes = Uint8Array.from(write[4]);
  return Array.from(new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4)));
};
// the pane program's uniform struct: a mat4, a vec4 and a float, padded to 24 floats
const UNIFORM = 24;
const uniformOf = (calls) => allOf(calls, 'queue.writeBuffer')
  .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)))
  .filter((f) => f.length === UNIFORM)
  .at(-1);

test('a pane is six vertices with the twin\'s uvs: p0 reads (0, 0)', async () => {
  const { ctx } = await setup();
  pane(ctx, ...CORNERS, {});
  const g = ctx.gizmos.pane;
  assert.equal(g.arrays.count, 6);
  assert.deepEqual(Array.from(g.arrays.texcoord.data.slice(0, 12)), [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  assert.deepEqual(Array.from(g.arrays.position.data.slice(0, 6)), [-40, 40, 0, 40, 40, 0]);
  assert.equal(ctx.gizmos.pane.buffer.current.geometry.bufferLayouts, PANE_LAYOUT);
});

test('a textured pane binds the texture, turns useTexture on, and takes the draw\'s MVP', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { data: new Uint8Array(16), width: 2, height: 2 });
  const M = tree.mat4FromTRS(new Float32Array(16), 10, 0, 0, 0, 0, 0, 1, 1, 1, 1);
  pane(ctx, ...CORNERS, { texture: tex, M, color: [1, 0.5, 0.25, 1] });
  const group = lastOf(calls, 'createBindGroup')[2];
  const entry = group.entries.find((e) => e.binding === 1);
  assert.equal(entry.resource.id, tex.view.id);
  const floats = uniformOf(calls);
  assert.deepEqual(Array.from(floats.slice(16, 21).map((v) => +v.toFixed(2))), [1, 0.5, 0.25, 1, 1]);   // uColor, uUseTexture
  const expected = tree.mat4Mul(new Float32Array(16), ctx.PV, M);
  floats.slice(0, 16).forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, 'mvp ' + i));
  assert.deepEqual(allOf(calls, 'createRenderPipeline').at(-1)[2].vertex.buffers, PANE_LAYOUT);
});

test('a flat pane draws the colour alone', async () => {
  const { ctx, calls } = await setup();
  pane(ctx, ...CORNERS, { color: [0.2, 0.4, 0.6, 1] });
  const floats = uniformOf(calls);
  const expected = [0.2, 0.4, 0.6, 1, 0];
  floats.slice(16, 21).forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6, 'uniform ' + i));
});

test('the frustum\'s faces are panes, the far one first, and they keep their outlines', async () => {
  const { ctx, calls } = await setup();
  const tex = texture(ctx, { data: new Uint8Array(16), width: 2, height: 2 });
  viewFrustum(ctx, {
    camera: tree.createCamera({ eye: [0, 0, 200], center: [0, 0, 0], fov: Math.PI / 4, near: 4, far: 40 }),
    nearTexture: tex,
    farTexture: tex,
    viewer: null,
  });
  const draws = allOf(calls, 'pass.draw').map((c) => c[1]);
  assert.equal(draws.filter((n) => n === 6).length, 2);          // the two faces
  assert.ok(draws.includes(24));                                // and the twelve edges
  const paneWrites = allOf(calls, 'queue.writeBuffer')
    .map((c) => Array.from(new Float32Array(Uint8Array.from(c[4]).buffer)))
    .filter((f) => f.length === UNIFORM);                       // the pane's struct, padded
  assert.equal(paneWrites.length, 2);
});

test('the helm rig\'s HUD form renders into a cached square target, then composites at its rect', async () => {
  const { ctx, calls } = await setup({ clientWidth: 160, clientHeight: 120 });   // a device ratio of 2
  const helm = new tree.PoseHelm();
  const V = Float32Array.from(ctx.V);
  const P = Float32Array.from(ctx.P);
  const target = ctx.frame.target;
  helmRig(ctx, helm, { x: 40, y: 30, size: 60, tint: [1, 0.8, 0.4, 1] });
  // the rig's own target: 60 logical × 2, with depth
  const made = allOf(calls, 'createTexture').map((c) => c[2]).filter((t) => t.width === 120 && t.height === 120);
  assert.deepEqual(made.map((t) => t.format), ['rgba8unorm', 'depth24plus']);
  const entry = ctx.rigs.get(helm);
  assert.ok(entry && entry.size === 120);
  helmRig(ctx, helm, { x: 60, y: 40, size: 60 });                // cached, not remade
  assert.equal(ctx.rigs.get(helm), entry);
  assert.equal(allOf(calls, 'createTexture').map((c) => c[2]).filter((t) => t.width === 120).length, 2);
  // the composite: the rect in target pixels, bottom-left — the last flat program's MVP
  const rect = floatsOf(calls, -1).slice(0, 16);
  const vpW = 320, vpH = 240, px = 120;
  const x = 60 * 2, y = vpH - (40 + 60) * 2;
  const expected = [px / vpW, 0, 0, 0, 0, px / vpH, 0, 0, 0, 0, 1, 0,
    2 * (x + px / 2) / vpW - 1, 2 * (y + px / 2) / vpH - 1, 0, 1];
  rect.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-5, 'rect ' + i));
  // and the camera, the target and the state came back
  assert.deepEqual(Array.from(ctx.V), Array.from(V));
  assert.deepEqual(Array.from(ctx.P), Array.from(P));
  assert.equal(ctx.frame.target, target);
});

test('identify forwards the rig\'s lanes to the host\'s labels, a world anchor each', async () => {
  const labels = [];
  const host = { labels: { set: (id, text, x, y, z, opts) => labels.push({ id, text, x, y, z, opts }) } };
  const { ctx } = await setup(null, host);
  const helm = new tree.PoseHelm();
  helmRig(ctx, helm, { size: 80, identify: true });
  assert.ok(labels.length > 0);
  assert.ok(labels.every((l) => /^helmRig\d+:/.test(l.id) && typeof l.text === 'string' && l.opts.frame === true && l.opts.class === 'helm-rig'));
  assert.ok(labels.every((l) => Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.z)));
});

test('without a host the rig draws and says nothing about labels', async () => {
  const { ctx } = await setup();
  const helm = new tree.PoseHelm();
  helmRig(ctx, helm, { size: 80, identify: true });
  assert.ok(ctx.gizmos.helmRig.arrays.count > 0);
});
