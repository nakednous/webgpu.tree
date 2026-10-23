/**
 * @file The composites on the twin's backend: `idiom`'s targets, passes, `pipe`
 * and `state`, read against the recording device's transcript.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  init, endFrame, renderTarget, program, filter, image, pipe, releasePipe, state, SCREEN,
  ADD, GREEN,
} from '../src/index.js';
import { BLENDS } from '../src/pipeline.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf, namesOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 640, height: 480 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

const FLOAT_WRITES = (calls) => allOf(calls, 'queue.writeBuffer')
  .filter((call) => call[3] % 4 === 0)
  .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)));

const texturing = `
struct U {
  uResolution: vec2f,
  uGain: f32,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var uSource: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  return textureSample(uSource, uSampler, vTexCoord) * u.uGain;
}`;

const invert = `
@group(0) @binding(0) var uSource: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  return vec4f(1.0 - textureSample(uSource, uSampler, vTexCoord).rgb, 1.0);
}`;

const gradient = '@fragment fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f { return vec4f(vTexCoord, 0.5, 1.0); }';

test('filter: a pass over the bound target, the bag written through the structured view', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  const source = renderTarget(ctx, { width: 64, height: 48, depth: false });
  const prog = program(ctx, texturing);
  ctx.backend.bindTarget(ctx, target);
  const ran = filter(ctx, prog, { uGain: 0.5 }, source);
  assert.equal(ran, prog);

  const pass = allOf(calls, 'beginRenderPass').at(-1)[1];
  assert.equal(pass.colorAttachments[0].view.id, target.attachments[0].id);
  assert.equal(pass.colorAttachments[0].loadOp, 'load');   // a pass does not clear

  // one struct, one write: uResolution from the viewport, uGain from the bag
  const floats = FLOAT_WRITES(calls).at(-1);
  assert.deepEqual(floats.slice(0, 3), [64, 48, 0.5]);

  // the input is bound to the sampler the stage declares and the bag leaves unset
  const group = lastOf(calls, 'createBindGroup')[2];
  const textureEntry = group.entries.find((entry) => entry.binding === 1);
  assert.equal(textureEntry.resource.id, source.color.view.id);
  assert.ok(world.pass);

  // filter's depth-off state is restored
  assert.equal(ctx.state.depth, true);
});

test('filter: the bag wins where it names the sampler, and a second texture travels in it', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 32, height: 32, depth: false });
  const source = renderTarget(ctx, { width: 32, height: 32, depth: false });
  const other = renderTarget(ctx, { width: 32, height: 32, depth: false });
  const prog = program(ctx, texturing);
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, prog, { uSource: other.color, uGain: 1 }, source);
  const group = lastOf(calls, 'createBindGroup')[2];
  assert.equal(group.entries.find((entry) => entry.binding === 1).resource.id, other.color.view.id);
});

test('pipe: two stages ping-pong through the cached pair, then the display', async () => {
  const { ctx, calls } = await setup();
  const scene = renderTarget(ctx, { width: 64, height: 48, depth: false });
  ctx.backend.bindTarget(ctx, scene);
  filter(ctx, program(ctx, gradient));
  ctx.backend.bindTarget(ctx, SCREEN);

  const pixelate = program(ctx, texturing);
  const out = pipe(ctx, scene, [{ program: pixelate, uniforms: { uGain: 1 } }, program(ctx, invert)], { key: 'fx' });   // a bag and a bare program
  assert.ok(out && out.width === 64 && out.height === 48);
  assert.equal(ctx.pipes.fx.pong, out);

  const passes = allOf(calls, 'beginRenderPass').map((call) => call[1]);
  const working = passes.slice(-3);   // the scene's own pass is the first
  assert.equal(passes.length, 4);
  assert.deepEqual(working.slice(0, 2).map((pass) => pass.colorAttachments[0].loadOp), ['clear', 'clear']);
  assert.equal(working[0].colorAttachments[0].view.id, ctx.pipes.fx.ping.attachments[0].id);
  assert.equal(working[1].colorAttachments[0].view.id, ctx.pipes.fx.pong.attachments[0].id);
  assert.equal(working[2].colorAttachments[0].view.canvas, true);   // the display, on the canvas
  assert.equal(working[2].colorAttachments[0].loadOp, 'clear');
  assert.equal(ctx.backend.bindTarget(ctx), null);   // and the chain restored the target it found

  // the pair is cached: a second chain makes no new pair
  const made = allOf(calls, 'createTexture').length;
  pipe(ctx, scene, pixelate, { key: 'fx' });
  assert.equal(allOf(calls, 'createTexture').length, made);
  releasePipe(ctx, 'fx');
  assert.equal(ctx.pipes.fx, undefined);
});

test('pipe: a chain with no passes displays the source and answers null', async () => {
  const { ctx } = await setup();
  const scene = renderTarget(ctx, { width: 16, height: 16, depth: false });
  assert.equal(pipe(ctx, scene, []), null);
});

test('state: the pair starts defined, two sides cleared, the count at zero', async () => {
  const { ctx, calls } = await setup();
  const mean = state(ctx, { width: 32, height: 24, format: 'rgba16float' });
  assert.equal(mean.count, 0);
  assert.notEqual(mean.read, mean.write);
  assert.equal(mean.read.format, 'rgba16float');
  const passes = allOf(calls, 'beginRenderPass').map((call) => call[1]);
  assert.equal(passes.length, 2);
  assert.deepEqual(passes.map((pass) => pass.colorAttachments[0].loadOp), ['clear', 'clear']);
  assert.deepEqual(passes.map((pass) => pass.colorAttachments[0].view.id), [mean.read.attachments[0].id, mean.write.attachments[0].id]);
  assert.deepEqual(passes[0].colorAttachments[0].clearValue, { r: 0, g: 0, b: 0, a: 0 });
  mean.dispose();
});

test('state: a pass reads the read side, writes the write side and swaps', async () => {
  const { ctx, calls } = await setup();
  const mean = state(ctx, { width: 32, height: 24 });
  const accum = program(ctx, invert);
  const readBefore = mean.read;
  const writeBefore = mean.write;
  mean.pass(accum);
  assert.equal(mean.count, 1);
  assert.equal(mean.read, writeBefore);    // the side just written is the value
  assert.equal(mean.write, readBefore);    // and the other side is the next pass's

  const pass = allOf(calls, 'beginRenderPass').at(-1)[1];
  assert.equal(pass.colorAttachments[0].view.id, writeBefore.attachments[0].id);
  assert.equal(pass.colorAttachments[0].loadOp, 'load');   // nothing is ever cleared but by reset
  const group = lastOf(calls, 'createBindGroup')[2];
  assert.equal(group.entries.find((entry) => entry.binding === 0).resource.id, readBefore.color.view.id);

  mean.pass(accum);
  assert.equal(mean.count, 2);
  assert.equal(mean.read, readBefore);
  mean.dispose();
});

test('state: a pass that did not run advances neither the pair nor the count', async () => {
  const { ctx } = await setup();
  const mean = state(ctx, { width: 8, height: 8 });
  const before = mean.read;
  mean.pass(null);
  assert.equal(mean.count, 0);
  assert.equal(mean.read, before);
  mean.dispose();
});

test('state: reset clears both sides again, at the state\'s own colour', async () => {
  const { ctx, calls } = await setup();
  const mean = state(ctx, { width: 8, height: 8, clear: [0.25, 0.5, 0.75, 1] });
  mean.pass(program(ctx, invert));
  assert.equal(mean.count, 1);
  mean.reset();
  assert.equal(mean.count, 0);
  const passes = allOf(calls, 'beginRenderPass').map((call) => call[1]).slice(-2);
  assert.deepEqual(passes.map((pass) => pass.colorAttachments[0].clearValue), [
    { r: 0.25, g: 0.5, b: 0.75, a: 1 },
    { r: 0.25, g: 0.5, b: 0.75, a: 1 },
  ]);
  mean.dispose();
});

test('state: resize reallocates, clears and zeroes the count', async () => {
  const { ctx, calls } = await setup();
  const mean = state(ctx, { width: 8, height: 8 });
  mean.pass(program(ctx, invert));
  const before = mean.read.color;
  mean.resize(16, 12);
  assert.equal(mean.count, 0);
  assert.equal(mean.read.width, 16);
  assert.notEqual(mean.read.color, before);
  const cleared = allOf(calls, 'beginRenderPass').map((call) => call[1]).slice(-2).map((pass) => pass.colorAttachments[0].view.id);
  assert.deepEqual(new Set(cleared), new Set([mean.read.attachments[0].id, mean.write.attachments[0].id]));
  mean.dispose();
});

test('image: the rect matrix, the tint, the texture and the mask and blend variants', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 80, height: 60, depth: false });
  ctx.backend.bindTarget(ctx, SCREEN);
  image(ctx, target.color, { x: 10, y: 20, width: 30, height: 40 });
  const floats = FLOAT_WRITES(calls).at(-1);
  const sx = 30 / 640, sy = 40 / 480;
  const tx = 2 * 25 / 640 - 1, ty = 2 * 40 / 480 - 1;
  const expected = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1];
  floats.slice(0, 16).forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-6, 'matrix element ' + i));
  assert.deepEqual(floats.slice(16, 20), [1, 1, 1, 1]);   // the default white tint
  assert.equal(floats[20], 1);                            // uUseTexture

  const group = lastOf(calls, 'createBindGroup')[2];
  assert.equal(group.entries.find((entry) => entry.binding === 1).resource.id, target.color.view.id);

  image(ctx, target.color, { mask: GREEN, blend: ADD });
  const pipeline = lastOf(calls, 'createRenderPipeline')[2];
  assert.equal(pipeline.fragment.targets[0].writeMask, 2);
  assert.deepEqual(pipeline.fragment.targets[0].blend, BLENDS.ADD);
});

test('endFrame submits once a frame and starts the next', async () => {
  const { ctx, calls, world } = await setup();
  const prog = program(ctx, gradient);
  filter(ctx, prog);
  assert.equal(endFrame(ctx), true);
  assert.equal(world.submitted, 1);
  assert.equal(endFrame(ctx), false);
  assert.equal(world.submitted, 1);
  filter(ctx, prog);
  endFrame(ctx);
  assert.equal(world.submitted, 2);
  assert.equal(allOf(calls, 'createCommandEncoder').length, 2);
  assert.deepEqual(namesOf(calls).slice(-3), ['pass.end', 'encoder.finish', 'queue.submit']);
});
