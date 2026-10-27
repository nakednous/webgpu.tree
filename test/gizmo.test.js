/**
 * @file Gizmos — the line pipe: the cache, the layouts, the expand's quads, the
 * width policy, the HUD's projection and the restores.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  init, setCamera, tree, renderTarget, program, endFrame, buffer,
  axes, grid, hermite, viewFrustum, trackPath, handleLocus, cross, bullsEye, beginHUD, endHUD, pane,
} from '../src/index.js';
import { LINE_COLOR_LAYOUT, LINE_LAYOUT, PANE_LAYOUT, QUAD_LAYOUT, WIDE_COLOR_LAYOUT, WIDE_LAYOUT } from '../src/programs.js';
import { canvasViewport } from '../src/space.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

async function setup(canvasOpts) {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  Object.assign(canvas, canvasOpts || {});
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  const target = renderTarget(ctx, { width: 320, height: 240, depth: false });
  ctx.backend.bindTarget(ctx, target);
  const cam = tree.createCamera({ eye: [0, 0, 300], center: [0, 0, 0], up: [0, 1, 0], fov: Math.PI / 4, near: 1, far: 1000 });
  setCamera(ctx, cam);
  return { ctx, calls, world, canvas };
}

const pipelineOf = (calls, index) => allOf(calls, 'createRenderPipeline')[index][2];
const buffersWritten = (calls) => allOf(calls, 'queue.writeBuffer').map((call) => Array.from(new Uint8Array(call[4])));

test('a draw takes its own slot: two gizmos of one name in a frame do not share a buffer', async () => {
  const { ctx, calls } = await setup();
  grid(ctx, { size: 100 });
  grid(ctx, { size: 60 });
  const pool = ctx.gizmos.grid.buffer.pool;                   // the slots a program's stream takes
  assert.equal(pool.slots.length, 2);                         // one per draw, this frame
  assert.notEqual(pool.slots[0].geometry, pool.slots[1].geometry);
  assert.equal(pool.slots[0].geometry.buffers.length, 1);     // non-interleaved: a buffer an attribute
  // and the two draws bind different buffers: the second write did not overwrite the first's
  const bound = allOf(calls, 'pass.setVertexBuffer').map((call) => call[2]);
  assert.equal(bound.length, 2);
  assert.notEqual(bound[0], bound[1]);
  const made = allOf(calls, 'createBuffer').length;
  const first = pool.slots[0];
  endFrame(ctx);                                              // the frame's boundary: the cursor restarts
  grid(ctx, { size: 100 });
  grid(ctx, { size: 60 });
  assert.equal(allOf(calls, 'createBuffer').length, made);    // the same slots, nothing allocated
  assert.equal(pool.slots[0], first);
});

test('a gizmo\'s geometry and its program bake the same layout: non-interleaved, a buffer per attribute', async () => {
  const { ctx, calls } = await setup();
  axes(ctx, { size: 50 });
  const geometry = ctx.gizmos.axes.buffer.current.geometry;
  assert.equal(geometry.bufferLayouts, LINE_COLOR_LAYOUT);   // the program's own array, not a copy
  assert.equal(ctx.gizmos.axes.buffer.pool.layout, LINE_COLOR_LAYOUT);
  assert.deepEqual(pipelineOf(calls, 0).vertex.buffers, LINE_COLOR_LAYOUT);
  assert.equal(LINE_COLOR_LAYOUT.length, 2);                // aPosition then aColor
  assert.ok(LINE_COLOR_LAYOUT.every((layout) => layout.attributes.length === 1));

  grid(ctx, { size: 50 });
  assert.equal(ctx.gizmos.grid.buffer.current.geometry.bufferLayouts, LINE_LAYOUT);
  assert.deepEqual(pipelineOf(calls, 1).vertex.buffers, LINE_LAYOUT);
  assert.equal(LINE_LAYOUT.length, 1);

  // the palette rides axes: uUseColor is on; the grid's is off — the line struct is 40 floats
  const floats = allOf(calls, 'queue.writeBuffer')
    .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)))
    .filter((f) => f.length === 40);
  const useColor = floats.map((f) => f[36]);                 // uUseColor, after uPV · uModel · uColor
  assert.ok(useColor.indexOf(1) >= 0 && useColor.indexOf(0) >= 0);
});

test('a line list at one device pixel: the arrays\' count is the draw\'s count', async () => {
  const { ctx, calls } = await setup();
  cross(ctx, { x: 0, y: 0, size: 100 });   // HUD-wrapped, and the HUD's ortho at scale 1
  const drawCall = lastOf(calls, 'pass.draw');
  assert.equal(drawCall[1], 4);                              // two segments, four vertices
  assert.equal(drawCall[2], 1);                              // one instance
  assert.equal(allOf(calls, 'pass.drawIndexed').length, 0);  // no quads
  // and the pipeline it drew through is a line list — WebGPU bakes the topology
  assert.equal(pipelineOf(calls, allOf(calls, 'createRenderPipeline').length - 1).primitive.topology, 'line-list');
  assert.equal(ctx.state.topology, 'triangle-list');         // the pipe's state, restored
});

test('the pipe bakes the topology its geometry is: a line list for lines, triangles for the quads', async () => {
  const { ctx, calls } = await setup();
  grid(ctx, { size: 50 });                                  // one device pixel: the line list
  assert.equal(pipelineOf(calls, 0).primitive.topology, 'line-list');
  assert.equal(ctx.state.topology, 'triangle-list');        // the state is the pipe's, and comes back
  grid(ctx, { size: 50, width: 3 });                        // past one: the expanded quads
  assert.equal(pipelineOf(calls, 1).primitive.topology, 'triangle-list');
  pane(ctx, [-10, 10, 0], [10, 10, 0], [10, -10, 0], [-10, -10, 0]);   // a filled quad, likewise
  assert.equal(pipelineOf(calls, 2).primitive.topology, 'triangle-list');
});

test('a width past one device pixel goes through the expand: four vertices and six indices a segment', async () => {
  const { ctx, calls } = await setup();
  const before = allOf(calls, 'queue.writeBuffer').length;
  cross(ctx, { x: 100, y: 100, size: 50, width: 3 });
  const wide = ctx.gizmos.cross.wide;
  const slot = wide.buffer.current;                          // the layer's wide cache is its own stream
  assert.equal(wide.segments, 2);
  assert.equal(wide.capacity, 16);
  // 4 vertices a segment, every one carrying the segment's endpoints
  assert.deepEqual(Array.from(wide.A.slice(0, 12)), [75, 100, 0, 75, 100, 0, 75, 100, 0, 75, 100, 0]);
  assert.deepEqual(Array.from(wide.B.slice(0, 12)), [125, 100, 0, 125, 100, 0, 125, 100, 0, 125, 100, 0]);
  // the pattern is the expansion's, and it reached the slot: a write an attribute it carries
  assert.deepEqual(Array.from(wide.T.slice(0, 4)), [0, 0, 1, 1]);
  assert.deepEqual(Array.from(wide.S.slice(0, 4)), [-1, 1, -1, 1]);
  assert.deepEqual(Array.from(wide.indices.slice(0, 6)), [0, 1, 2, 1, 3, 2]);
  // the pattern and the endpoints reached the slot: a write an attribute, the index buffer with them
  const owned = new Set(slot.geometry.buffers.map((gpu) => gpu.id).concat(wide.buffer.indexBuffer.id));
  const writes = allOf(calls, 'queue.writeBuffer').slice(before).filter((call) => owned.has(call[1]));
  assert.deepEqual(writes.map((call) => call[1]), slot.geometry.buffers.map((gpu) => gpu.id).concat(wide.buffer.indexBuffer.id));
  const drawCall = lastOf(calls, 'pass.drawIndexed');
  assert.equal(drawCall[1], 12);                             // six indices a segment
  assert.equal(slot.geometry.bufferLayouts, WIDE_LAYOUT);
  assert.deepEqual(pipelineOf(calls, 0).vertex.buffers, WIDE_LAYOUT);
  assert.equal(pipelineOf(calls, 0).primitive.topology, 'triangle-list');   // the quads, not the line list
});

test('the wide program gets the pass\'s viewport and the width in device pixels', async () => {
  const { ctx, calls } = await setup({ clientWidth: 160, clientHeight: 120 });   // a device ratio of 2
  grid(ctx, { size: 50, width: 3 });
  const floats = allOf(calls, 'queue.writeBuffer')
    .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)))
    .filter((f) => f.length === 44)[0];                      // the wide struct
  assert.ok(floats);
  assert.deepEqual(floats.slice(32, 34), [320, 240]);        // uViewport: the pass's, not the canvas's
  assert.equal(floats[34], 6);                               // uWidth: 3 logical × 2
  assert.deepEqual(pipelineOf(calls, 0).vertex.buffers, WIDE_LAYOUT);
});

test('a growing generator grows the arrays, rebuilds the slot and frees the old buffers', async () => {
  const { ctx, calls } = await setup();
  hermite(ctx, [0, 0, 0], [0, 10, 0], [10, 0, 0], [0, 0, 0], { samples: 4 });   // 8 vertices, capacity 64
  const pool = ctx.gizmos.hermite.buffer.pool;
  const slot = pool.slots[0];
  assert.ok(slot.capacity >= 8);                             // the slot's own capacity, at least the cache's 64
  endFrame(ctx);                                             // a new frame takes the same slot again
  hermite(ctx, [0, 0, 0], [0, 10, 0], [10, 0, 0], [0, 0, 0], { samples: 400 });  // 800 vertices
  assert.equal(ctx.gizmos.hermite.arrays.count, 800);
  assert.ok(pool.slots[0].capacity >= 800);                  // the slot grew with the cache
  assert.ok(allOf(calls, 'buffer.destroy').length >= 1);     // and its old buffers were freed
  // the draw counts the generated vertices, not the slot's capacity
  assert.equal(lastOf(calls, 'pass.draw')[1], 800);
});

test('the HUD is an ortho over the logical viewport, y down, depth off, and it all comes back', async () => {
  const { ctx } = await setup();
  const vp = canvasViewport(ctx);
  const V = Float32Array.from(ctx.V);
  const P = Float32Array.from(ctx.P);
  const state = ctx.state;
  beginHUD(ctx);
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const ndc = tree.mat4MulPoint([0, 0, 0], ctx.PV, 0, 0, 0);
  assert.ok(near(ndc[0], -1) && near(ndc[1], 1));                               // (0, 0) is the top-left corner
  const centre = tree.mat4MulPoint([0, 0, 0], ctx.PV, vp[2] / 2, -vp[3] / 2, 0);
  assert.ok(near(centre[0], 0) && near(centre[1], 0));
  const corner = tree.mat4MulPoint([0, 0, 0], ctx.PV, vp[2], -vp[3], 0);
  assert.ok(near(corner[0], 1) && near(corner[1], -1));                          // and the bottom-right
  assert.equal(ctx.state.depth, false);
  endHUD(ctx);
  assert.deepEqual(Array.from(ctx.P), Array.from(P));
  assert.deepEqual(Array.from(ctx.V), Array.from(V));
  assert.equal(ctx.state.depth, state.depth);
});

test('a gizmo restores the program and the state it found', async () => {
  const { ctx } = await setup();
  const prior = program(ctx, '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }');
  ctx.prog = prior;
  const depth = ctx.state.depth;
  grid(ctx, { size: 50, depth: false });
  assert.equal(ctx.prog, prior);
  assert.equal(ctx.state.depth, depth);
  assert.equal(ctx.state.topology, 'triangle-list');   // the line list's topology is the pipe's, not the state's
});

test('the frustum draws its twelve edges and a viewer\'s axes; a track its path and a marker a keyframe', async () => {
  const { ctx, calls } = await setup();
  viewFrustum(ctx, { camera: tree.createCamera({ eye: [0, 0, 200], center: [0, 0, 0], fov: Math.PI / 4, near: 4, far: 40 }) });
  const frustumDraws = allOf(calls, 'pass.draw').length;
  assert.ok(frustumDraws >= 2);                              // the frustum, then the viewer's axes
  assert.equal(ctx.gizmos.frustum.arrays.count, 24);         // twelve edges, NEAR · FAR · BODY

  const track = new tree.PoseTrack();
  track.add([
    { pos: [-150, 0, 0], rot: [0, 0, 0, 1] },
    { pos: [0, 100, 50], rot: [0, 0, 0, 1] },
    { pos: [150, 0, 0], rot: [0, 0, 0, 1] },
  ]);
  trackPath(ctx, track, { bits: tree.PATH });
  assert.ok(ctx.gizmos.path.arrays.count > 0);
  assert.ok(ctx.gizmos.axes.arrays.count > 0);               // a marker per keyframe
});

test('a handle\'s locus draws its constraint and, at HANDLE, a disc through the pane program', async () => {
  const { ctx, calls } = await setup();
  const constraint = {
    locus(out, o) {
      out.position.data.set([0, 0, 0, 1, 0, 0]);
      out.count = 2;
      return 2;
    },
  };
  const h = { _constraint: constraint, _grabPx: 12, value: (out) => { out[0] = 0; out[1] = 0; out[2] = 0; } };
  handleLocus(ctx, h, { bits: tree.HANDLE | tree.LOCUS });
  assert.equal(ctx.gizmos.locus.arrays.count, 2);
  assert.equal(ctx.gizmos.dot.arrays.count, 48);             // 16 triangles
  assert.equal(ctx.gizmos.dot.buffer.current.geometry.bufferLayouts, PANE_LAYOUT);   // a flat quad, no texture
  const trisDraw = lastOf(calls, 'pass.draw');
  assert.equal(trisDraw[1], 48);                             // the disc's own vertices, not the cache's 64
  assert.equal(pipelineOf(calls, allOf(calls, 'createRenderPipeline').length - 1).primitive.topology, 'triangle-list');
  // the pane program's MVP is the installed camera's, installed by the draw — 24 floats, padded
  const floats = allOf(calls, 'queue.writeBuffer')
    .map((call) => Array.from(new Float32Array(Uint8Array.from(call[4]).buffer)))
    .filter((f) => f.length === 24);
  assert.ok(floats.length >= 1);
  const mvp = floats.at(-1).slice(0, 16);
  const expected = Array.from(ctx.PV);
  mvp.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-5, 'mvp ' + i));
});

test('a geometry under a program is built to that pipeline\'s baked layout, or refused', async () => {
  const { ctx, calls } = await setup();
  const wgsl = '@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }';
  const position = { numComponents: 3, data: new Float32Array([0, 0, 0, 1, 0, 0]) };
  const color = { numComponents: 4, data: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]) };

  // the layout is the program's, not the arrays': one buffer an attribute, in its order
  const line = program(ctx, wgsl, { buffers: LINE_COLOR_LAYOUT });
  const geo = ctx.backend.createBuffer(ctx, { aPosition: position, aColor: color }, { program: line });
  assert.equal(geo.bufferLayouts, LINE_COLOR_LAYOUT);
  assert.equal(geo.buffers.length, 2);
  assert.equal(geo.numElements, 2);
  assert.deepEqual(Array.from(new Float32Array(geo.buffers[0].bytes.buffer)).slice(0, 6), [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(Array.from(new Float32Array(geo.buffers[1].bytes.buffer)).slice(0, 8), [1, 0, 0, 1, 0, 1, 0, 1]);

  // interleaved: one buffer, each attribute at the offset the layout states
  const QUAD_WGSL = `
@vertex fn vs(@location(0) aPosition: vec2f, @location(1) aTexCoord: vec2f) -> @builtin(position) vec4f {
  return vec4f(aPosition, 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }
`;
  const quad = program(ctx, QUAD_WGSL, { buffers: QUAD_LAYOUT });
  const mesh = ctx.backend.createBuffer(ctx, {
    aPosition: { numComponents: 2, data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]) },
    aTexCoord: { numComponents: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
  }, { program: quad });
  assert.equal(mesh.bufferLayouts, QUAD_LAYOUT);
  assert.equal(mesh.buffers.length, 1);
  assert.deepEqual(Array.from(new Float32Array(mesh.buffers[0].bytes.buffer)).slice(0, 8), [-1, -1, 0, 0, 1, -1, 1, 0]);

  // an arrays shape the layout cannot read is refused, and nothing is built
  const before = allOf(calls, 'createBuffer').length;
  const refused = [];
  const original = console.error;
  console.error = (...args) => refused.push(args.join(' '));
  let answer;
  try {
    answer = ctx.backend.createBuffer(ctx, { aPosition: position }, { program: line });
  } finally {
    console.error = original;
  }
  assert.equal(answer, null);
  assert.equal(refused.length, 1);
  assert.match(refused[0], /declares 2 attribute\(s\) and the arrays carry 1/);
  assert.equal(allOf(calls, 'createBuffer').length, before);
});

test('the gizmo layouts are the arrays shapes\': one buffer an attribute, locations in key order', async () => {
  assert.deepEqual(WIDE_LAYOUT.map((layout) => [layout.arrayStride, layout.attributes[0].shaderLocation]), [[12, 0], [12, 1], [4, 2], [4, 3]]);
  assert.deepEqual(WIDE_COLOR_LAYOUT.map((layout) => layout.attributes[0].shaderLocation), [0, 1, 2, 3, 4]);
  assert.deepEqual(PANE_LAYOUT.map((layout) => layout.attributes[0].format), ['float32x3', 'float32x2']);
});

test('drawGizmo: the kind picks the program, states the topology, and restores the depth state', async () => {
  const { ctx, calls } = await setup();
  const geo = buffer(ctx, { position: new Float32Array([0, 0, 0, 10, 0, 0]), color: { numComponents: 4, data: new Float32Array([1, 0, 0, 1, 1, 0, 0, 1]) } });

  const depthBefore = ctx.backend.setState(ctx).depth;
  ctx.backend.drawGizmo(ctx, 'line', geo, { color: [1, 0, 0, 1], useColor: true, depth: false, count: 2 });
  const line = pipelineOf(calls, allOf(calls, 'createRenderPipeline').length - 1);
  assert.equal(line.primitive.topology, 'line-list', 'a line kind states the line list');
  assert.deepEqual(line.vertex.buffers, LINE_COLOR_LAYOUT, 'and the colour program bakes the colour layout');
  assert.equal(allOf(calls, 'pass.drawIndexed').length + allOf(calls, 'pass.draw').length > 0, true, 'a draw happened');
  assert.equal(ctx.backend.setState(ctx).depth, depthBefore, 'the depth state it changed is put back');

  ctx.backend.drawGizmo(ctx, 'wide', geo, { color: [1, 0, 0, 1], depth: true, width: 3, vp: [0, 240, 320, -240] });
  const wide = pipelineOf(calls, allOf(calls, 'createRenderPipeline').length - 1);
  assert.equal(wide.primitive.topology, 'triangle-list', 'the wide kind states the quads');

  ctx.backend.drawGizmo(ctx, 'pane', geo, { color: [1, 1, 1, 1], texture: null });
  const pane = pipelineOf(calls, allOf(calls, 'createRenderPipeline').length - 1);
  assert.equal(pane.primitive.topology, 'triangle-list', 'a pane is triangles');
});
