/**
 * @file query tests — the twin's verdict slot against the fake device: the
 *       conservative default, the count landing after the frame's submit, the
 *       ring refusing a question when it is full, and dispose releasing objects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { init, endFrame, query, dispose } from '../src/index.js';
import { createCanvas, createDevice, createGpu } from './gpu.js';

async function setup() {
  const { device, calls, world } = createDevice();
  const { canvas, context } = createCanvas({ width: 320, height: 240 });
  const gpu = createGpu({ device });
  const ctx = await init(canvas, { gpu, device, context, format: 'rgba8unorm' });
  return { ctx, device, calls, world };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('query: reads true until a count arrives, then the count; the ring bounds the questions', async () => {
  const { ctx, world, calls } = await setup();
  let drawn = 0;
  const draw = () => { drawn++; };
  const slot = query(ctx, { pool: 2 });

  assert.equal(slot.value, true, 'the conservative default');
  assert.ok(slot.ask(draw));
  assert.equal(drawn, 1, 'the question wraps the draw');
  assert.equal(slot.pending, 1);
  assert.equal(slot.value, true, 'a question in flight changes nothing yet');

  world.queryResult = 0;
  endFrame(ctx);                                    // the resolve, then the map
  await settle();
  assert.equal(slot.value, false, 'the count that arrived is read');
  assert.equal(slot.pending, 0, 'the object came back to the ring');

  const asked = calls.filter((c) => c[0] === 'beginRenderPass' && c[1] && c[1].occlusionQuerySet);
  assert.ok(asked.length >= 1, 'the question pass declares its query set');

  const full = query(ctx, { pool: 1 });
  assert.ok(full.ask(draw));
  assert.equal(full.ask(draw), false, 'a full ring skips the frame');
  assert.equal(full.pending, 1);
});

test('query: dispose releases every object and stops asking', async () => {
  const { ctx, world, calls } = await setup();
  const slot = query(ctx);
  slot.ask(() => {});
  endFrame(ctx);
  await settle();
  slot.dispose();
  assert.equal(slot.ask(() => {}), false, 'a disposed slot asks nothing');
  assert.equal(calls.filter((c) => c[0] === 'querySet.destroy').length, 1, 'every query set destroyed');
  dispose(ctx);
});
