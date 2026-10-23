/**
 * @file The pipeline-state key: one key per pipeline a draw can select.
 * @license AGPL-3.0-only
 */

'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_STATE, BLENDS, pipelineKey, resolveState, writeMaskOf } from '../src/pipeline.js';

const PASS = { depth: false, depthFormat: null, formats: ['rgba8unorm'], samples: 1 };
const DEPTH_PASS = { depth: true, depthFormat: 'depth24plus', formats: ['rgba8unorm'], samples: 1 };
const key = (state, pass) => pipelineKey(1, state, pass);

test('the same program, state and attachment give the same key', () => {
  assert.equal(key(BASE_STATE, PASS), key(BASE_STATE, PASS));
});

test('every field a pipeline bakes and every attachment field moves the key', () => {
  const base = key(BASE_STATE, PASS);
  const variants = {
    program: pipelineKey(2, BASE_STATE, PASS),
    depth: key(BASE_STATE, DEPTH_PASS),
    blend: key({ ...BASE_STATE, blend: 'ADD' }, PASS),
    mask: key({ ...BASE_STATE, mask: [true, false, false, true] }, PASS),
    cull: key({ ...BASE_STATE, cull: 'back' }, PASS),
    topology: key({ ...BASE_STATE, topology: 'triangle-strip' }, PASS),
    format: pipelineKey(1, BASE_STATE, { ...PASS, formats: ['rgba16float'] }),
    samples: pipelineKey(1, BASE_STATE, { ...PASS, samples: 4 }),
    compare: key({ ...BASE_STATE, depthCompare: 'less-equal' }, DEPTH_PASS),
  };
  for (const [name, variant] of Object.entries(variants)) {
    assert.notEqual(base, variant, name);
  }
  assert.equal(new Set([base, ...Object.values(variants)]).size, 1 + Object.keys(variants).length);
});

test('a state that asks for depth in a depth-less pass keys as a pass with none', () => {
  assert.equal(key(BASE_STATE, PASS), key({ ...BASE_STATE, depth: false }, PASS));
});

test('resolveState keeps what a partial state does not name, and asks only for nothing', () => {
  const next = resolveState(BASE_STATE, { depth: false });
  assert.equal(next.depth, false);
  assert.equal(next.cull, BASE_STATE.cull);
  assert.equal(next.blend, BASE_STATE.blend);
  assert.equal(resolveState(BASE_STATE, undefined), BASE_STATE);
});

test('the colour mask is the GPUColorWrite bits', () => {
  assert.equal(writeMaskOf([true, true, true, true]), 15);
  assert.equal(writeMaskOf([true, false, false, true]), 9);
  assert.equal(writeMaskOf([false, false, false, false]), 0);
});

test('the three blend names are WebGPU blend state', () => {
  assert.deepEqual(BLENDS.NORMAL.color, { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' });
  assert.deepEqual(BLENDS.ADD.color, { srcFactor: 'one', dstFactor: 'one', operation: 'add' });
  assert.deepEqual(BLENDS.MULTIPLY.color, { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' });
});
