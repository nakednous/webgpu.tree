/**
 * @file A recording WebGPU device — the device the backend's tests run against.
 * @license AGPL-3.0-only
 *
 * Nothing here draws. Every call a `GPUDevice`, a queue, a command encoder or a
 * render pass encoder receives is appended to a transcript, and the objects they
 * answer are records that answer the next call — a buffer's size, a texture's
 * size and format, a view. The backend is read against that transcript: the
 * descriptors it asks for (a target's textures, a pipeline's baked state, a
 * copy's `bytesPerRow`), the order of the frame (bind, clear, draw, end,
 * submit), and the restores the composites owe.
 *
 * `webgpu-utils` reads the platform's flag globals at call time; `node` has
 * none, so this harness states them first — the same shape `webgl.tree`'s fake
 * GL takes for the type tags twgl identifies an attachment by.
 */

'use strict';

/** The flag globals a browser provides and `node` does not; stated once. */
export function installGlobals() {
  const where = globalThis;
  if (!where.GPUBufferUsage) {
    where.GPUBufferUsage = { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
  }
  if (!where.GPUTextureUsage) {
    where.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
  }
  if (!where.GPUShaderStage) {
    where.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  }
  if (!where.GPUMapMode) {
    where.GPUMapMode = { READ: 1, WRITE: 2 };
  }
  if (!where.GPUColorWrite) {
    where.GPUColorWrite = { RED: 1, GREEN: 2, BLUE: 4, ALPHA: 8, ALL: 15 };
  }
}

installGlobals();

/** The names a transcript carries, in order. */
export const namesOf = (calls) => calls.map((call) => call[0]);

/** Every call of one name, in order. */
export const allOf = (calls, name) => calls.filter((call) => call[0] === name);

/** The last call of one name, or null. */
export const lastOf = (calls, name) => {
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === name) return calls[i];
  return null;
};

const sizeOf = (size) => (Array.isArray(size) ? size : [size.width, size.height || 1]);

/**
 * A device that records what it is asked for.
 * @param {{ width?:number, height?:number, format?:string }} [opts]
 * @returns {{ device:object, calls:Array, world:object, restore:function():void }}
 *          `world` holds `width`, `height`, `format`, `pass` (the open pass's
 *          descriptor or null), `submitted` (command buffers) and `destroyed`.
 * @example
 * const { device, calls } = createDevice()
 * const backend = createBackend({ device, context: fakeContext(), format: 'rgba8unorm' })
 */
export function createDevice(opts) {
  const o = opts || {};
  const calls = [];
  const world = {
    width: o.width || 640,
    height: o.height || 480,
    format: o.format || 'rgba8unorm',
    pass: null,
    submitted: 0,
    destroyed: false,
  };
  let seq = 0;

  const record = (name, ...args) => calls.push([name, ...args]);

  const createBuffer = (descriptor) => {
    const buffer = {
      id: ++seq,
      size: descriptor.size,
      usage: descriptor.usage,
      mapped: descriptor.mappedAtCreation ? new ArrayBuffer(descriptor.size) : null,
      destroyed: false,
      destroy() {
        buffer.destroyed = true;
        record('buffer.destroy', buffer.id);
      },
      mapAsync(mode) {
        record('buffer.mapAsync', buffer.id, mode);
        if (!buffer.mapped) buffer.mapped = new ArrayBuffer(buffer.size);
        return Promise.resolve();
      },
      getMappedRange() {
        if (!buffer.mapped) buffer.mapped = new ArrayBuffer(buffer.size);
        return buffer.mapped;
      },
      unmap() {
        buffer.mapped = null;
        record('buffer.unmap', buffer.id);
      },
    };
    record('createBuffer', buffer.id, { size: descriptor.size, usage: descriptor.usage, mappedAtCreation: !!descriptor.mappedAtCreation });
    return buffer;
  };

  const createTexture = (descriptor) => {
    const [width, height] = sizeOf(descriptor.size);
    const texture = {
      id: ++seq,
      width,
      height,
      format: descriptor.format,
      usage: descriptor.usage,
      sampleCount: descriptor.sampleCount || 1,
      mipLevelCount: descriptor.mipLevelCount || 1,
      destroyed: false,
      destroy() {
        texture.destroyed = true;
        record('texture.destroy', texture.id);
      },
      createView(viewDescriptor) {
        const view = { id: ++seq, texture, descriptor: viewDescriptor || null };
        record('texture.createView', view.id, texture.id);
        return view;
      },
    };
    record('createTexture', texture.id, {
      width,
      height,
      format: descriptor.format,
      usage: descriptor.usage,
      sampleCount: descriptor.sampleCount || 1,
    });
    return texture;
  };

  const queue = {
    writeBuffer(buffer, offset, data, dataOffset, size) {
      const length = size === undefined ? (data && data.byteLength) || 0 : size;
      let bytes = null;
      if (data instanceof ArrayBuffer) {
        bytes = Array.from(new Uint8Array(data, dataOffset || 0, length));
      } else if (data && data.buffer) {
        bytes = Array.from(new Uint8Array(data.buffer, data.byteOffset + (dataOffset || 0), length));
      }
      record('queue.writeBuffer', buffer && buffer.id, offset, length, bytes);
    },
    writeTexture(destination, data, layout, size) {
      const bytes = data instanceof ArrayBuffer
        ? Array.from(new Uint8Array(data))
        : (data && data.buffer ? Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) : null);
      record('queue.writeTexture', destination && destination.texture && destination.texture.id, layout && layout.bytesPerRow, size, bytes);
    },
    copyExternalImageToTexture(source, destination, size) {
      const from = source && source.source;
      record('queue.copyExternalImageToTexture', destination && destination.texture && destination.texture.id, size, {
        width: from && (from.videoWidth || from.naturalWidth || from.width),
        height: from && (from.videoHeight || from.naturalHeight || from.height),
        origin: source && source.origin ? [source.origin.x, source.origin.y] : null,
        flipY: !!(source && source.flipY),
      });
    },
    submit(commandBuffers) {
      world.submitted += commandBuffers.length;
      record('queue.submit', commandBuffers.length);
    },
  };

  const encoder = () => {
    const state = { id: ++seq };
    const pass = {
      id: ++seq,
      setPipeline(pipeline) {
        record('pass.setPipeline', pipeline && pipeline.id);
      },
      setBindGroup(index, group, offsets) {
        record('pass.setBindGroup', index, group && group.id, offsets ? Array.from(offsets) : undefined);
      },
      setVertexBuffer(slot, buffer) {
        record('pass.setVertexBuffer', slot, buffer && buffer.id);
      },
      setIndexBuffer(buffer, format) {
        record('pass.setIndexBuffer', buffer && buffer.id, format);
      },
      draw(count, instances, first) {
        record('pass.draw', count, instances, first);
      },
      drawIndexed(count, instances, first) {
        record('pass.drawIndexed', count, instances, first);
      },
      setViewport(x, y, width, height, minDepth, maxDepth) {
        record('pass.setViewport', x, y, width, height, minDepth, maxDepth);
      },
      end() {
        record('pass.end', pass.id);
        world.pass = null;
      },
    };
    return {
      id: state.id,
      beginRenderPass(descriptor) {
        world.pass = descriptor;
        record('beginRenderPass', descriptor);
        world.passEncoder = pass;
        return pass;
      },
      copyTextureToBuffer(source, destination, size) {
        record('copyTextureToBuffer', {
          texture: source && source.texture && source.texture.id,
          origin: source && source.origin,
          bytesPerRow: destination && destination.bytesPerRow,
          rowsPerImage: destination && destination.rowsPerImage,
          buffer: destination && destination.buffer && destination.buffer.id,
          size,
        });
      },
      finish() {
        record('encoder.finish', state.id);
        return { id: state.id };
      },
    };
  };

  const device = {
    limits: { minUniformBufferOffsetAlignment: 256 },
    features: new Set(),
    queue,
    createBuffer,
    createTexture,
    createSampler(descriptor) {
      const sampler = { id: ++seq, descriptor };
      record('createSampler', sampler.id, descriptor);
      return sampler;
    },
    createShaderModule(descriptor) {
      const module = { id: ++seq, code: descriptor.code, label: descriptor.label };
      record('createShaderModule', module.id, descriptor.label);
      return module;
    },
    createBindGroupLayout(descriptor) {
      const layout = { id: ++seq, descriptor };
      record('createBindGroupLayout', layout.id, descriptor);
      return layout;
    },
    createPipelineLayout(descriptor) {
      const layout = { id: ++seq, descriptor };
      record('createPipelineLayout', layout.id, descriptor);
      return layout;
    },
    createBindGroup(descriptor) {
      const group = { id: ++seq, descriptor };
      record('createBindGroup', group.id, descriptor);
      return group;
    },
    createRenderPipeline(descriptor) {
      const pipeline = { id: ++seq, descriptor };
      record('createRenderPipeline', pipeline.id, descriptor);
      return pipeline;
    },
    createCommandEncoder(descriptor) {
      const created = encoder();
      record('createCommandEncoder', created.id, descriptor && descriptor.label);
      return created;
    },
    pushErrorScope() {},
    popErrorScope() {
      return Promise.resolve(null);
    },
    destroy() {
      world.destroyed = true;
      record('device.destroy');
    },
  };

  return { device, calls, world, record };
}

/**
 * A `navigator.gpu` stand-in: the adapter and the format `init` asks for.
 * @param {{ device?:object, format?:string }} [opts]
 * @returns {object} `{ requestAdapter, getPreferredCanvasFormat }`
 */
export function createGpu(opts) {
  const o = opts || {};
  const adapter = {
    features: new Set(['float32-filterable']),
    limits: { maxTextureDimension2D: 8192, minUniformBufferOffsetAlignment: 256 },
    info: { vendor: 'recording', architecture: 'none', device: '', description: 'the twin\'s recording device' },
    requestDevice() {
      return Promise.resolve(o.device);
    },
  };
  return {
    requestAdapter() {
      return Promise.resolve(adapter);
    },
    getPreferredCanvasFormat() {
      return o.format || 'rgba8unorm';
    },
    adapter,
  };
}

/**
 * A canvas and its WebGPU context, as `init` uses them.
 * @param {{ width?:number, height?:number, format?:string }} [opts]
 * @returns {{ canvas:object, context:object }} The canvas is a plain object with
 *          the size `init` reads; the context answers `getCurrentTexture`.
 */
export function createCanvas(opts) {
  const o = opts || {};
  const size = { width: o.width || 640, height: o.height || 480 };
  const views = [];
  let seq = 0;
  const context = {
    configuration: null,
    configure(configuration) {
      context.configuration = configuration;
    },
    unconfigure() {},
    getCurrentTexture() {
      const texture = {
        id: ++seq,
        width: size.width,
        height: size.height,
        format: o.format || 'rgba8unorm',
        createView() {
          const view = { id: ++seq, texture, canvas: true };
          views.push(view);
          return view;
        },
      };
      return texture;
    },
  };
  const canvas = {
    width: size.width,
    height: size.height,
    style: {},
    getContext(kind) {
      return kind === 'webgpu' ? context : null;
    },
  };
  return { canvas, context };
}
