/**
 * @file The uniform arena — one buffer, a slot per upload, a reset per frame.
 * @module webgpu.tree/arena
 * @license AGPL-3.0-only
 *
 * A uniform value reaches a draw through a buffer, and WebGPU has one ordering
 * rule that shapes the whole design: `queue.writeBuffer` executes on the queue's
 * own timeline, ordered with submissions, not woven into a command buffer. Two
 * draws sharing one buffer and written between them would therefore both read
 * the second value.
 *
 * So each draw takes a slot: a dynamic offset into one arena buffer, aligned to
 * the device's `minUniformBufferOffsetAlignment` (256 bytes at least). The bind
 * group holds the buffer and no offset — the offset travels in `setBindGroup` —
 * so a bind group is still shared between draws that upload different values.
 * Slots are handed out per frame and the cursor resets when the frame is
 * submitted, which is safe for the ordering rule above: a write issued after a
 * submission happens after that submission's commands have run.
 *
 * ```
 * const slot = arena.alloc(structSize)   // { buffer, offset, size }
 * arena.reset()                          // at endFrame
 * ```
 *
 * A frame that needs more room grows the buffer by doubling: the slots already
 * handed out keep their own buffer, and the old one is retired rather than
 * destroyed, so a command buffer still holding it stays valid.
 */

'use strict';

import { BUFFER_USAGE } from './flags.js';

const DEFAULT_ALIGNMENT = 256;
const DEFAULT_CAPACITY = 1 << 16;

/**
 * An arena of uniform slots over one buffer.
 * @param {object} device  A GPUDevice.
 * @param {{ align?:number, capacity?:number }} [opts]
 *        align: the offset alignment, default the device's
 *        `minUniformBufferOffsetAlignment` or 256; capacity: the first buffer's
 *        size in bytes, default 64 KiB.
 * @returns {{ alloc:function(number):object, reset:function():void,
 *             buffer:object|null, version:number, size:number, dispose:function():void }}
 *          `alloc(size)` answers `{ buffer, offset, size }`; `version` changes
 *          whenever the buffer is replaced, which is when a cached bind group
 *          must be rebuilt.
 * @example
 * const arena = createArena(device)
 * const slot = arena.alloc(80)
 * device.queue.writeBuffer(slot.buffer, slot.offset, data)
 */
export function createArena(device, opts) {
  const o = opts || {};
  const align = o.align || (device.limits && device.limits.minUniformBufferOffsetAlignment) || DEFAULT_ALIGNMENT;
  const initial = o.capacity || DEFAULT_CAPACITY;
  const retired = [];
  let buffer = null;
  let capacity = 0;
  let cursor = 0;
  let version = 0;

  const make = (size) => {
    if (buffer) retired.push(buffer);
    buffer = device.createBuffer({
      size,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
      label: 'webgpu.tree uniform arena',
    });
    capacity = size;
    cursor = 0;
    version += 1;
  };

  return {
    /**
     * A slot of at least `size` bytes, aligned and inside the arena buffer.
     * @param {number} size  The struct's size in bytes.
     * @returns {{ buffer:object, offset:number, size:number }}
     */
    alloc(size) {
      const rounded = Math.max(16, Math.ceil(size / 16) * 16);
      if (!buffer || cursor + rounded > capacity) {
        let next = capacity || initial;
        while (next < rounded) next *= 2;
        make(next);
      }
      const offset = cursor;
      cursor += Math.ceil(rounded / align) * align;
      return { buffer, offset, size: rounded };
    },
    /** Start the next frame's slots at the beginning of the buffer. */
    reset() {
      cursor = 0;
    },
    get buffer() {
      return buffer;
    },
    get version() {
      return version;
    },
    get size() {
      return capacity;
    },
    /** Destroy the arena and every buffer it retired. */
    dispose() {
      if (buffer) buffer.destroy();
      for (const old of retired) old.destroy();
      buffer = null;
      retired.length = 0;
      capacity = 0;
      cursor = 0;
    },
  };
}
