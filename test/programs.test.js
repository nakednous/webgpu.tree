/**
 * @file The WGSL the twin supplies, and what its sources declare.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FLAT, PASS_VERT, QUAD, QUAD_LAYOUT, entriesOf, sourceOf } from '../src/programs.js';
import { declare } from '../src/uniforms.js';
import { installGlobals } from './gpu.js';
import { createBufferLayoutsFromArrays } from 'webgpu-utils';

installGlobals();   // webgpu-utils reads the platform's flag globals as it reflects a source

test('the pass-through vertex stage declares one entry: the vertex one', () => {
  assert.deepEqual(entriesOf(PASS_VERT), { vertex: 'vs', fragment: null, compute: null });
});

test('the flat program declares both entries, and the three names image uploads', () => {
  assert.deepEqual(entriesOf(FLAT), { vertex: 'vs', fragment: 'fs', compute: null });
  const decl = declare(FLAT);
  assert.deepEqual(decl.names.sort(), ['uColor', 'uModelViewProjectionMatrix', 'uUseTexture']);
  assert.deepEqual(decl.textures, ['uTexture']);
  assert.deepEqual(decl.samplers, ['uSampler']);
  assert.deepEqual(decl.bindings.map((binding) => [binding.kind, binding.binding]), [
    ['uniform', 0],
    ['texture', 1],
    ['sampler', 2],
  ]);
});

test('a caller\'s fragment source is appended to the twin\'s vertex stage, one module', () => {
  const fragment = '@fragment fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f { return vec4f(vTexCoord, 0.0, 1.0); }';
  const source = sourceOf(fragment);
  assert.ok(source.startsWith(PASS_VERT));
  assert.ok(source.endsWith(fragment));
  assert.equal(entriesOf(source).vertex, 'vs');
  assert.equal(entriesOf(source).fragment, 'fs');
  assert.equal(source.split('@vertex').length - 1, 1);
});

test('a source that brings its own vertex stage is used as it is', () => {
  const source = '@vertex fn mine(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(0.0); }\n@fragment fn fs() -> @location(0) vec4f { return vec4f(0.0); }';
  assert.equal(sourceOf(source), source);
  assert.equal(sourceOf(source, { vertex: 'mine' }).split('@vertex').length - 1, 1);
});

test('the quad\'s arrays and the pass pipeline\'s vertex layout are one derivation', () => {
  assert.deepEqual(QUAD_LAYOUT, createBufferLayoutsFromArrays(QUAD).bufferLayouts);
  assert.deepEqual(QUAD_LAYOUT, [{
    stepMode: 'vertex',
    arrayStride: 16,
    attributes: [
      { offset: 0, format: 'float32x2', shaderLocation: 0 },
      { offset: 8, format: 'float32x2', shaderLocation: 1 },
    ],
  }]);
});

test('a struct\'s members are the bag\'s names, and a mat3 travels as nine floats', () => {
  const decl = declare(`
struct Pass {
  uModelViewMatrix: mat4x4f,
  uNormalMatrix: mat3x3f,
  uColor: vec4f,
};
@group(0) @binding(0) var<uniform> u: Pass;
@fragment fn fs() -> @location(0) vec4f { return u.uColor; }
`);
  assert.deepEqual(decl.names, ['uModelViewMatrix', 'uNormalMatrix', 'uColor']);
  decl.set({ uNormalMatrix: [1, 2, 3, 4, 5, 6, 7, 8, 9], uColor: [0.5, 0, 0, 1] });
  const data = Array.from(new Float32Array(decl.views.get('u').arrayBuffer));
  const normal = data.slice(16, 28);   // mat3x3f's columns are padded to 16 bytes: 48 bytes, not 36
  assert.deepEqual(normal, [1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  assert.equal(data[28], 0.5);         // uColor starts at 112, after the padded matrix
});

test('a boolean is a number in a uniform, and a scalar uniform is its own name', () => {
  const decl = declare(`
struct Flat { uUseTexture: f32 };
@group(0) @binding(0) var<uniform> u: Flat;
@fragment fn fs() -> @location(0) vec4f { return vec4f(u.uUseTexture); }
`);
  decl.set({ uUseTexture: true });
  assert.deepEqual(Array.from(new Float32Array(decl.views.get('u').arrayBuffer)), [1]);

  const scalar = declare(`
@group(0) @binding(0) var<uniform> uGain: f32;
@fragment fn fs() -> @location(0) vec4f { return vec4f(uGain); }
`);
  assert.deepEqual(scalar.names, ['uGain']);
  scalar.set({ uGain: 0.25 });
  assert.deepEqual(Array.from(new Float32Array(scalar.views.get('uGain').arrayBuffer)), [0.25]);
});

test('a name the source does not declare is left alone', () => {
  const decl = declare(FLAT);
  decl.set({ uNotThere: 3 });
  const data = Array.from(new Float32Array(decl.views.get('u').arrayBuffer));
  assert.ok(data.every((value) => value === 0));
});
