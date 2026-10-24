/**
 * @file The draw's transform set: which of the six a program declares, what
 * each is uploaded as, and the padding a mat3 takes.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEBGL, mat3NormalFromMat4, mat4FromTRS, mat4Mul, mat4Ortho } from '@nakednous/tree';

import { init, renderTarget, program, bind, draw, setCamera, buffer } from '../src/index.js';
import { TRANSFORMS, declaredTransforms, uploadTransforms } from '../src/draw.js';
import { createCanvas, createDevice, createGpu, allOf, lastOf } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

/** The floats of the last uniform write, the arena's padding cut off. */
const floatsOf = (calls) => {
  const write = lastOf(calls, 'queue.writeBuffer');
  if (!write) return null;
  const bytes = Uint8Array.from(write[4]);
  return Array.from(new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4)));
};

const STRUCT = (body, use) => `
struct U {
${body}
};
@group(0) @binding(0) var<uniform> u: U;

@fragment
fn fs() -> @location(0) vec4f { return ${use}; }`;

// every declared field must be read by the stage: a binding a stage declares and
// never uses is not in its pipeline's layout, so nothing would be uploaded for it
const SIX = STRUCT(`
  uModelMatrix: mat4x4f,
  uViewMatrix: mat4x4f,
  uModelViewMatrix: mat4x4f,
  uProjectionMatrix: mat4x4f,
  uModelViewProjectionMatrix: mat4x4f,
  uNormalMatrix: mat3x3f,`, `
    vec4f(u.uModelMatrix[3][0] + u.uViewMatrix[3][0] + u.uModelViewMatrix[3][0] + u.uProjectionMatrix[3][0],
          u.uModelViewProjectionMatrix[3][0] + u.uNormalMatrix[0][0], 0.0, 1.0)`);

const MVP_NORMAL = STRUCT(`
  uModelViewProjectionMatrix: mat4x4f,
  uNormalMatrix: mat3x3f,`, `
    vec4f(u.uModelViewProjectionMatrix[3][0] + u.uNormalMatrix[0][0], 0.0, 0.0, 1.0)`);

const NONE = '@fragment\nfn fs() -> @location(0) vec4f { return vec4f(1.0); }';   // no uniform at all

const quad = (ctx) => buffer(ctx, {
  aPosition: { numComponents: 2, data: [-1, -1, 1, -1, -1, 1, 1, 1] },
  aTexCoord: { numComponents: 2, data: [0, 0, 1, 0, 0, 1, 1, 1] },
});

function matrices() {
  const V = mat4FromTRS(new Float32Array(16), 0, 0, -120, 0, 0, 0, 1, 1, 1, 1);
  const P = mat4Ortho(new Float32Array(16), -80, 80, -60, 60, 1, 400, WEBGL);
  const M = mat4FromTRS(new Float32Array(16), 12, -8, 0, 0, 0, 0.3826834323650898, 0.9238795325112867, 2, 1, 1);
  return { V, P, M };
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

test('the six names, and which of them a program declares', () => {
  assert.deepEqual(TRANSFORMS, [
    'uModelMatrix', 'uViewMatrix', 'uModelViewMatrix',
    'uProjectionMatrix', 'uModelViewProjectionMatrix', 'uNormalMatrix',
  ]);
  assert.deepEqual(declaredTransforms(TRANSFORMS), {
    model: true, view: true, mv: true, proj: true, mvp: true, normal: true, any: true,
  });
  assert.deepEqual(declaredTransforms(['uModelViewProjectionMatrix', 'uColor']), {
    model: false, view: false, mv: false, proj: false, mvp: true, normal: false, any: true,
  });
  assert.equal(declaredTransforms([]).any, false);
  assert.equal(declaredTransforms(null).any, false);
});

test('draw uploads the declared transforms: M, V, V·M, P, P·V·M and the normal, mat3 padded', async () => {
  const { ctx, calls } = await setup();
  const { V, P, M } = matrices();
  const target = renderTarget(ctx, { width: 32, height: 32, depth: false });
  const prog = program(ctx, SIX);
  ctx.backend.bindTarget(ctx, target);
  setCamera(ctx, V, P);
  bind(ctx, prog);
  draw(ctx, quad(ctx), M);

  const floats = floatsOf(calls);
  const MV = mat4Mul(new Float32Array(16), V, M);
  const MVP = mat4Mul(new Float32Array(16), P, MV);
  const N = mat3NormalFromMat4(new Float32Array(9), MV);
  const expected = [
    ...M, ...V, ...MV, ...P, ...MVP,
    N[0], N[1], N[2], 0, N[3], N[4], N[5], 0, N[6], N[7], N[8], 0,   // 3 columns, 16 bytes each
  ];
  assert.equal(floats.length, expected.length);
  floats.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-5, 'float ' + i));
});

test('a program that declares two of them gets two, at its own struct offsets', async () => {
  const { ctx, calls } = await setup();
  const { V, P, M } = matrices();
  const prog = program(ctx, MVP_NORMAL);
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  setCamera(ctx, V, P);
  bind(ctx, prog);
  draw(ctx, quad(ctx), M);
  const floats = floatsOf(calls);
  const MV = mat4Mul(new Float32Array(16), V, M);
  const MVP = mat4Mul(new Float32Array(16), P, MV);
  const N = mat3NormalFromMat4(new Float32Array(9), MV);
  assert.equal(floats.length, 16 + 12);
  assert.deepEqual(floats.slice(0, 16), Array.from(MVP));
  assert.deepEqual(floats.slice(16), [N[0], N[1], N[2], 0, N[3], N[4], N[5], 0, N[6], N[7], N[8], 0]);
});

test('a program that declares none gets none: no uniform upload for the transforms', async () => {
  const { ctx, calls } = await setup();
  const prog = program(ctx, NONE);
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  const before = allOf(calls, 'queue.writeBuffer').length;
  bind(ctx, prog);
  draw(ctx, quad(ctx), matrices().M);
  assert.equal(allOf(calls, 'queue.writeBuffer').length, before);
});

test('the bag is uploaded on bind, and a draw\'s transform wins where both name one', async () => {
  const { ctx, calls } = await setup();
  const { V, P, M } = matrices();
  const prog = program(ctx, SIX);
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  setCamera(ctx, V, P);
  bind(ctx, prog, { uModelMatrix: IDENTITY, uColor: [1, 0, 0, 1] });
  draw(ctx, quad(ctx), M);
  const MV = mat4Mul(new Float32Array(16), V, M);
  assert.deepEqual(floatsOf(calls).slice(0, 16), Array.from(M));
  // a value the source does not declare is left alone, not written into the struct
  assert.equal(floatsOf(calls).some((value) => value === 1), true);
});

test('each draw uploads its own transforms: two draws, two model matrices, two writes', async () => {
  const { ctx, calls } = await setup();
  const { V, P, M } = matrices();
  const M2 = mat4FromTRS(new Float32Array(16), -20, 10, 0, 0, 0, 0, 1, 1, 1, 1);
  const prog = program(ctx, MVP_NORMAL);
  ctx.backend.bindTarget(ctx, renderTarget(ctx, { width: 8, height: 8, depth: false }));
  setCamera(ctx, V, P);
  bind(ctx, prog);
  const geo = quad(ctx);
  draw(ctx, geo, M);
  const first = floatsOf(calls).slice(0, 16);
  draw(ctx, geo, M2);
  const second = floatsOf(calls).slice(0, 16);
  const MV2 = mat4Mul(new Float32Array(16), V, M2);
  assert.deepEqual(first, Array.from(mat4Mul(new Float32Array(16), P, mat4Mul(new Float32Array(16), V, M))));
  assert.deepEqual(second, Array.from(mat4Mul(new Float32Array(16), P, MV2)));
  assert.notDeepEqual(first, second);
  assert.equal(allOf(calls, 'queue.writeBuffer').length, 2);
});

test('without a bound program a draw says so and draws nothing', async () => {
  const { ctx, calls } = await setup();
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.join(' '));
  try {
    assert.equal(draw(ctx, quad(ctx), null), null);
  } finally {
    console.error = original;
  }
  assert.match(logged[0], /no program bound/);
  assert.equal(allOf(calls, 'beginRenderPass').length, 0);
});

test('uploadTransforms asks only for the names a program has, and never allocates a bag per draw', async () => {
  const { ctx } = await setup();
  const prog = program(ctx, NONE);
  const seen = [];
  const backend = ctx.backend;
  const original = backend.setUniforms;
  backend.setUniforms = (c, p, values) => {
    seen.push(Object.keys(values));
    return original.call(backend, c, p, values);
  };
  uploadTransforms(ctx, prog, matrices().M);
  backend.setUniforms = original;
  assert.deepEqual(seen, []);   // nothing declared, nothing asked
});
