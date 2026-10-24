/**
 * @file What a target shape becomes: the textures WebGPU is asked for, the pass
 * that draws into them, and the pipeline the state selects.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, renderTarget, filter, image, program, endFrame, SCREEN } from '../src/index.js';
import { TEXTURE_USAGE } from '../src/flags.js';
import { QUAD } from '../src/programs.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

const COLOR_USAGE = TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST;
const DEPTH_USAGE = TEXTURE_USAGE.RENDER_ATTACHMENT;
const SAMPLED_DEPTH_USAGE = TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.TEXTURE_BINDING;

async function setup(opts) {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { ...(opts || {}), gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

const textures = (calls) => allOf(calls, 'createTexture').map((call) => call[2]);

test('a target is canvas-sized with a colour texture and a depth attachment', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx);
  assert.equal(target.width, 320);
  assert.equal(target.height, 240);
  assert.equal(target.format, 'rgba8unorm');
  assert.ok(target.color && target.color.view);
  assert.equal(target.depth, null);            // a renderbuffer depth is not sampleable
  assert.ok(target.depthView);
  const made = textures(calls);
  assert.deepEqual(made.map((t) => [t.width, t.height, t.format, t.usage, t.sampleCount]), [
    [320, 240, 'rgba8unorm', COLOR_USAGE, 1],
    [320, 240, 'depth24plus', DEPTH_USAGE, 1],
  ]);
});

test('depth: false is a colour texture alone, and the pass has no depth attachment', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { depth: false });
  assert.equal(textures(calls).length, 1);
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }'));
  assert.equal(world.pass.colorAttachments.length, 1);
  assert.equal(world.pass.depthStencilAttachment, undefined);
});

test('depth: true is a depth texture alone, and the pass has no colour attachment', async () => {
  const { ctx, calls, device, world } = await setup();
  const target = renderTarget(ctx, { depth: true });
  assert.equal(target.color, null);
  assert.ok(target.depth && target.depth.view);
  assert.equal(textures(calls).length, 1);
  assert.deepEqual(textures(calls)[0].usage, SAMPLED_DEPTH_USAGE);
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }'));
  assert.equal(world.pass.colorAttachments.length, 0);
  assert.equal(world.pass.depthStencilAttachment.view.id, target.depthView.id);
});

test('depthTexture: true gives a colour texture and a sampleable depth texture', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { depthTexture: true });
  const made = textures(calls);
  assert.equal(made.length, 2);
  assert.equal(made[1].format, 'depth24plus');
  assert.equal(made[1].usage, SAMPLED_DEPTH_USAGE);
  assert.ok(target.depth && target.depth.gpu);
});

test('a g-buffer names its attachments, in list order', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { color: ['albedo', 'normal'], depth: false });
  assert.equal(textures(calls).length, 2);
  assert.ok(target.albedo && target.normal);
  assert.equal(target.color, target.albedo);
  assert.deepEqual(target.attachments, [target.albedo.view, target.normal.view]);
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }'));
  assert.equal(world.pass.colorAttachments.length, 2);
});

test('format tokens resolve: float, float32 and a WebGPU format name', async () => {
  const { ctx, calls } = await setup();
  renderTarget(ctx, { format: 'rgba16float', depth: false });
  renderTarget(ctx, { float: true, depth: false });
  renderTarget(ctx, { format: 5126, depth: false });   // gl.FLOAT, a port's token
  const made = textures(calls).map((t) => t.format);
  assert.deepEqual(made, ['rgba16float', 'rgba16float', 'rgba32float']);
});

test('samples: 4 draws into a multisampled texture and resolves into the sampleable one', async () => {
  const { ctx, calls, world } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, samples: 4, depth: false });
  const made = textures(calls);
  assert.deepEqual(made.map((t) => t.sampleCount), [1, 4]);   // the sampleable texture first, then the multisampled one drawn into
  assert.equal(target.attachments.length, 1);
  assert.equal(target.resolveTargets.length, 1);
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }'));
  assert.equal(world.pass.colorAttachments[0].view.id, target.attachments[0].id);
  assert.equal(world.pass.colorAttachments[0].resolveTarget.id, target.resolveTargets[0].id);
});

test('a multisampled target resolves colour only, and says so where depth was asked for', async () => {
  const { ctx } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    const target = renderTarget(ctx, { samples: 4, depthTexture: true });
    assert.equal(target.depth, null);
    assert.ok(target.depthView);
  } finally {
    console.error = original;
  }
  assert.match(logged.join('\n'), /depth resolve/);
});

test('resize reallocates the textures and keeps the record', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  const before = target.color;
  target.resize(128, 96);
  assert.equal(target.width, 128);
  assert.equal(target.height, 96);
  assert.notEqual(target.color, before);
  assert.equal(target.color.width, 128);
  assert.ok(allOf(calls, 'texture.destroy').length >= 1);
});

test('a draw with depth on bakes the target\'s depth compare, and a state raises it', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { depth: true });
  const prog = program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }');
  const quad = ctx.backend.createBuffer(ctx, QUAD);
  ctx.backend.bindTarget(ctx, target);
  ctx.backend.draw(ctx, prog, quad);   // filter is a fullscreen pass and asks depth off; a draw takes the state
  const first = lastOf(calls, 'createRenderPipeline')[2];
  assert.equal(first.depthStencil.format, 'depth24plus');
  assert.equal(first.depthStencil.depthCompare, 'less');
  assert.equal(first.multisample.count, 1);

  const prior = ctx.backend.setState(ctx, { depthCompare: 'less-equal' });
  ctx.backend.draw(ctx, prog, quad);
  const second = lastOf(calls, 'createRenderPipeline')[2];
  assert.equal(second.depthStencil.depthCompare, 'less-equal');
  ctx.backend.setState(ctx, prior);
  ctx.backend.draw(ctx, prog, quad);
  assert.equal(allOf(calls, 'createRenderPipeline').length, 2);   // the state restored, the first pipeline is the cache's
});

test('a pass over a target with no depth never bakes one in, even where the state asks', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { depth: false });
  const prog = program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }');
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, prog);   // filter asks for depth: false
  const descriptor = lastOf(calls, 'createRenderPipeline')[2];
  assert.equal(descriptor.depthStencil, undefined);
});

test('a depth-off state on a target with depth still bakes the field in: compare always, no write', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx);            // colour + depth
  const prog = program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }');
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, prog);                            // filter asks for depth: false, the attachment has depth
  const descriptor = lastOf(calls, 'createRenderPipeline')[2];
  assert.ok(descriptor.depthStencil);           // a pipeline set on a depth-attached pass must state it
  assert.equal(descriptor.depthStencil.format, 'depth24plus');
  assert.equal(descriptor.depthStencil.depthCompare, 'always');
  assert.equal(descriptor.depthStencil.depthWriteEnabled, false);
});

test('the canvas pass is the preferred format, and image draws a target into it', async () => {
  const { ctx, calls } = await setup();
  const target = renderTarget(ctx, { width: 64, height: 48, depth: false });
  ctx.backend.bindTarget(ctx, target);
  filter(ctx, program(ctx, '@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f { return vec4f(uv, 0.0, 1.0); }'));
  ctx.backend.bindTarget(ctx, SCREEN);
  image(ctx, target.color);
  endFrame(ctx);
  const passes = allOf(calls, 'beginRenderPass').map((call) => call[1]);
  assert.equal(passes.length, 2);
  assert.equal(passes[0].colorAttachments[0].view.id, target.attachments[0].id);
  assert.equal(passes[1].colorAttachments[0].view.canvas, true);
  const pipeline = lastOf(calls, 'createRenderPipeline')[2];
  assert.equal(pipeline.fragment.targets[0].format, 'rgba8unorm');
  assert.equal(pipeline.fragment.targets[0].blend, undefined);
});
