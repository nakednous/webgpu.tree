/**
 * @file The WebGPU backend — the twenty-three members `idiom` calls, over
 * `webgpu-utils` and the raw API.
 * @module webgpu.tree/backend
 * @license AGPL-3.0-only
 *
 * `idiom` never touches a GPU API: it calls the members below, and this file is
 * what the twin supplies for them. It is the bridge's price, paid once — the
 * conformance transcripts read it, and `webgl.tree`'s twgl backend is its
 * sibling.
 *
 * ```
 * targets   createTarget · destroyTarget · bindTarget · clear
 * programs  createProgram · imageProgram · uniformsOf · samplersOf · setUniforms
 * draws     setCamera · draw · drawInstanced
 * buffers   createBuffer · updateBuffer · writeBuffer
 * picking   readPixels
 * textures  createTexture · uploadTexture · destroyTexture · textureSize
 * state     setViewport · setState
 * context   dispose
 * ```
 *
 * The four conventions are stated once, here, and every later verb inherits
 * them: `ndcZMin` is `WEBGPU` (0), `uvOrientation` is `'top-down'` — nothing is
 * flipped anywhere, because WebGPU's texture space and a decoded image's rows
 * run the same way — `framebufferY` is `'down'`, the target's row 0 being its
 * top, and `format` is the canvas's preferred one.
 *
 * Three shapes are the twin's own answer to WebGPU's model, and each is the
 * least surprising reading of `idiom`'s contract (§7 #111):
 *
 * - `bindTarget` records the target; the render pass is begun lazily, on the
 *   next draw, so the `clear` that `pipe` and `state` issue straight after a
 *   bind still chooses the pass's `loadOp`.
 * - a program is a *module*, its pipelines cached per state and attachment;
 *   `draw` picks the variant, uploads the uniforms into the frame's arena and
 *   binds one group.
 * - `readPixels` answers a promise; a pixel read is a copy and a map.
 *
 * WGSL has no include, so `createProgram(ctx, frag)` compiles the twin's vertex
 * stage *concatenated* with the caller's fragment source — one module, two
 * entry points — unless the source brings its own `@vertex` stage. The backend
 * interface therefore carries the twin without a change.
 */

'use strict';

import { WEBGPU, mat4Mul } from '@nakednous/tree';
import {
  createBufferLayoutsFromArrays,
  createBuffersAndAttributesFromArrays,
  generateMipmap,
  makeBindGroupLayoutDescriptors,
  makeTypedArrayFromArrayUnion,
  numMipLevels,
  setVertexAndIndexBuffers,
} from 'webgpu-utils';
import { TEXTURE_USAGE } from './flags.js';
import { declare } from './uniforms.js';
import { BASE_STATE, createPipeline, pipelineKey, resolveState } from './pipeline.js';
import {
  QUAD_LAYOUT, FLAT, entriesOf, sourceOf,
  LINE, LINE_COLOR, LINE_COLOR_LAYOUT, LINE_LAYOUT, PANE, PANE_LAYOUT,
  WIDE, WIDE_COLOR, WIDE_COLOR_LAYOUT, WIDE_LAYOUT,
} from './programs.js';
import { createArena } from './arena.js';
import { readPixels as readback, paddedRows } from './readback.js';
import {
  bindTarget as bindFrameTarget,
  clearTarget,
  endFrame,
  endPass,
  ensurePass,
  frameOf,
  setViewport as setFrameViewport,
} from './frame.js';

/** The target formats a `renderTarget` `format` token resolves to. */
export const FORMATS = Object.freeze({
  rgba8: 'rgba8unorm',
  rgba8unorm: 'rgba8unorm',
  bgra8: 'bgra8unorm',
  bgra8unorm: 'bgra8unorm',
  rgba16: 'rgba16float',
  rgba16float: 'rgba16float',
  float: 'rgba16float',
  rgba32: 'rgba32float',
  rgba32float: 'rgba32float',
  float32: 'rgba32float',
});

// GL's format constants, for a hero ported from webgl.tree without a rewrite:
// UNSIGNED_BYTE, HALF_FLOAT and FLOAT are what `renderTarget`'s `format` took there.
const GL_FORMATS = Object.freeze({ 5121: 'rgba8unorm', 5131: 'rgba16float', 5126: 'rgba32float' });

/** The depth format every target's depth attachment uses. */
export const DEPTH_FORMAT = 'depth24plus';

/**
 * Resolve a `renderTarget` format token to a WebGPU colour format.
 * @param {{ format?:*, float?:boolean }} spec  `idiom`'s resolved target spec.
 * @returns {string} A `GPUTextureFormat`.
 * @ignore
 * @example
 * formatOf({ float: true })   // 'rgba16float'
 */
export function formatOf(spec) {
  const token = spec.format;
  if (typeof token === 'string') {
    const key = token.toLowerCase();
    if (FORMATS[key]) return FORMATS[key];
    if (/(unorm|snorm|float|sint|uint)/.test(key)) return key;   // already a WebGPU format name
  } else if (typeof token === 'number' && GL_FORMATS[token]) {
    return GL_FORMATS[token];
  }
  return spec.float ? 'rgba16float' : 'rgba8unorm';
}

/** Bytes per pixel of a texture format, from its channels and their width. @ignore */
export function bytesPerPixel(format) {
  const m = /^(rgba|bgra|rg|r)(8|16|32)(unorm|snorm|float|uint|sint)?$/.exec(format || '');
  if (m) return (m[1] === 'r' ? 1 : m[1] === 'rg' ? 2 : 4) * Number(m[2]) / 8;
  return 4;   // rgba8unorm and its kin
}

/** Log a message once per context record. @ignore */
function warnOnce(ctx, key, message) {
  if (!ctx.messages) ctx.messages = new Set();
  if (ctx.messages.has(key)) return;
  ctx.messages.add(key);
  console.error('[webgpu.tree] ' + key + ': ' + message);
}

/** A texture record's view, made on first use. @ignore */
function textureViewOf(tex) {
  if (!tex) return null;
  if (!tex.view && tex.gpu) tex.view = tex.gpu.createView();
  return tex.view;
}

/**
 * Create the backend of one device.
 * @param {{ device:object, context:object, format:string, width:number, height:number }} opts
 *        device: the GPUDevice; context: the configured GPUCanvasContext;
 *        format: the canvas's format; width / height: its size in device pixels.
 * @returns {object} The backend `idiom`'s context record nests.
 */
// The gizmo programs, made on first use and kept in the bridge's own cache, so a
// verb that still draws its cache shares the pipeline this member draws through.
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const WHITE = [1, 1, 1, 1];

/** The programs' cache — the bridge's, shared with its verbs. @ignore */
const _gizmoPrograms = (ctx) => ctx.gizmoPrograms || (ctx.gizmoPrograms = { line: Object.create(null), wide: Object.create(null), tris: null, pane: null });

/** @ignore */
function _lineProgramOf(ctx, backend, colored) {
  const p = _gizmoPrograms(ctx);
  const key = colored ? 'color' : 'plain';
  if (!p.line[key]) p.line[key] = backend.createProgram(ctx, colored ? LINE_COLOR : LINE, { buffers: colored ? LINE_COLOR_LAYOUT : LINE_LAYOUT, label: 'webgpu.tree line' + (colored ? ' (colour)' : '') });
  return p.line[key];
}

/** @ignore */
function _wideProgramOf(ctx, backend, colored) {
  const p = _gizmoPrograms(ctx);
  const key = colored ? 'color' : 'plain';
  if (!p.wide[key]) p.wide[key] = backend.createProgram(ctx, colored ? WIDE_COLOR : WIDE, { buffers: colored ? WIDE_COLOR_LAYOUT : WIDE_LAYOUT, label: 'webgpu.tree wide line' + (colored ? ' (colour)' : '') });
  return p.wide[key];
}

/** @ignore */
function _paneProgramOf(ctx, backend) {
  const p = _gizmoPrograms(ctx);
  if (!p.pane) p.pane = backend.createProgram(ctx, PANE, { buffers: PANE_LAYOUT, label: 'webgpu.tree pane' });
  return p.pane;
}

// ── The texture ceremony ─────────────────────────────────────────────────
// What a source becomes is this API's question: a size, a format, a dimension
// and a view, then an upload (a queue write per slice) and, where asked, a mip
// chain the peer generates. The layer's texture family hands the source here.

const FORMAT = /^(r|rg|rgba|bgra)(8|16|32)(unorm|snorm|float|uint|sint)$/;

const _isPixels = (s) => !!(s && s.data && typeof s.width === 'number' && typeof s.height === 'number' && !s.getContext);
const _isFloat = (s) => !!(s && s.data instanceof Float32Array);
const _sizeOf = (s) => {
  if (!s) return null;
  const w = s.videoWidth || s.naturalWidth || s.width || 0;
  const h = s.videoHeight || s.naturalHeight || s.height || 0;
  return w && h ? [w, h] : null;
};

/** The bytes of a pixel source, whatever its array's type. @ignore */
function _bytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** The format a source and the options ask for. @ignore */
function _formatOf(source, opts) {
  const float = !!opts.float;
  const token = opts.format !== undefined ? opts.format : (_isFloat(source) && !float ? 'rgba32float' : undefined);
  return formatOf({ format: token, float });
}

/** Whether a format is one the twin's textures take. @ignore */
const _formatOk = (format) => FORMAT.test(format);

/** The slices a pixel source holds: `depth` a volume, `layers` an array. @ignore */
const _layersOf = (pixels) => {
  if (typeof pixels.depth === 'number') return pixels.depth;
  if (typeof pixels.layers === 'number') return pixels.layers;
  return 1;
};

/** Write a pixel source's slices into a texture, one layer at a time. @ignore */
function _writeSlices(ctx, tex, pixels) {
  const step = tex.width * tex.height * bytesPerPixel(tex.format);
  const all = _bytes(pixels.data);
  const layers = Math.max(1, Math.min(tex.layers || 1, _layersOf(pixels)));
  for (let z = 0; z < layers; z++) {
    ctx.backend.uploadTexture(ctx, tex, all.subarray(z * step, (z + 1) * step), { z });
  }
}

export function createBackend(opts) {
  const { device, context, format } = opts;
  const arena = opts.arena || createArena(device);
  const resources = { buffers: new Set(), textures: new Set(), programs: new Set() };
  let seq = 0;
  const samplerIds = new WeakMap();
  const samplerId = (chosen) => {
    if (!samplerIds.has(chosen)) samplerIds.set(chosen, ++seq);
    return samplerIds.get(chosen);
  };

  const white = () => {
    if (resources.white) return resources.white;
    const gpu = device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
      label: 'webgpu.tree white',
    });
    device.queue.writeTexture({ texture: gpu }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 256 }, [1, 1]);
    resources.white = { id: ++seq, gpu, view: gpu.createView(), width: 1, height: 1, format: 'rgba8unorm' };
    resources.textures.add(gpu);
    return resources.white;
  };

  const sampler = () => {
    if (resources.sampler) return resources.sampler;
    resources.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      label: 'webgpu.tree default sampler',
    });
    return resources.sampler;
  };

  /**
   * (Re)build a target's textures at its current size.
   * @ignore
   */
  function buildTarget(ctx, target, spec) {
    const f = frameOf(ctx);
    if (f.pass && f.target === target) endPass(ctx);   // textures in a live pass are not destroyed under it
    for (const gpu of target.textures) gpu.destroy();
    target.textures = [];
    target.attachments = [];
    target.resolveTargets = target.samples > 1 ? [] : null;
    target.color = null;
    target.depth = null;
    target.depthView = null;

    const width = target.width;
    const height = target.height;
    const samples = target.samples;
    const makeTexture = (descriptor, sampleCount) => {
      const gpu = device.createTexture({
        size: [width, height],
        sampleCount: sampleCount === undefined ? samples : sampleCount,
        label: 'webgpu.tree target',
        ...descriptor,
      });
      target.textures.push(gpu);
      return gpu;
    };

    if (spec.color) {
      const count = Math.max(1, spec.names.length);
      for (let i = 0; i < count; i++) {
        const colorFormat = spec.perColor && spec.names[i]
          ? formatOf({ format: spec.perColor[spec.names[i]], float: spec.float })
          : (target.formats[i] || formatOf(spec));
        target.formats[i] = colorFormat;
        const sampled = makeTexture({
          format: colorFormat,
          usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST,
        }, 1);
        const sampledView = sampled.createView();
        const record = { id: ++seq, gpu: sampled, view: sampledView, width, height, format: colorFormat };
        resources.textures.add(sampled);
        if (samples > 1) {
          const msaa = makeTexture({ format: colorFormat, usage: TEXTURE_USAGE.RENDER_ATTACHMENT });
          target.attachments.push(msaa.createView());
          target.resolveTargets.push(sampledView);
        } else {
          target.attachments.push(sampledView);
        }
        if (i === 0) target.color = record;
        if (spec.names[i]) target[spec.names[i]] = record;
      }
      target.formats.length = count;
    }

    if (spec.depth !== 'none') {
      const sampleable = spec.depth === 'texture' && samples === 1;
      if (spec.depth === 'texture' && samples > 1) {
        warnOnce(ctx, 'depth-samples', 'a multisampled target resolves colour only — WebGPU has no depth resolve, so `depth: \'texture\'` with samples > 1 hands out no depth texture.');
      }
      const depth = makeTexture({
        format: DEPTH_FORMAT,
        usage: TEXTURE_USAGE.RENDER_ATTACHMENT | (sampleable ? TEXTURE_USAGE.TEXTURE_BINDING : 0),
      });
      target.depthView = depth.createView();
      target.depthFormat = DEPTH_FORMAT;
      if (sampleable) {
        target.depth = { id: ++seq, gpu: depth, view: target.depthView, width, height, format: DEPTH_FORMAT };
        resources.textures.add(depth);
      }
    } else {
      target.depthFormat = null;
    }
    return target;
  }

  /**
   * A program's pipelines are picked by state and attachment; the module and the
   * names it declares are the program.
   * @ignore
   */
  function buildProgram(ctx, code, o) {
    const decl = declare(code);
    const entries = entriesOf(code);
    const vs = o.vs || entries.vertex;
    const fs = o.fs || entries.fragment;
    if (!vs || !fs) {
      const missing = [vs ? null : 'a `@vertex`', fs ? null : 'a `@fragment`'].filter(Boolean);
      console.error('[webgpu.tree] createProgram: a program needs both stages; this source has no ' + missing.join(' and no ') + ' entry.');
      return null;
    }
    const program = {
      id: ++seq,
      code,
      module: device.createShaderModule({ code, label: o.label }),
      vs,
      fs,
      decl,
      // not `uniforms`: `idiom`'s `passOf` reads that key as a pipe entry's bag
      uniformNames: decl.names,
      textures: new Map(),
      samplers: new Map(),
      pipelines: new Map(),
      bindGroups: new Map(),
      vertexLayouts: o.buffers || QUAD_LAYOUT,
      failed: false,
    };
    // `idiom`'s `passOf` tells a bare program from a `{ program, uniforms }` bag by
    // a `.program` field — the twgl programInfo's GL program, which a WebGPU
    // program does not have. The record carries its module there, so both
    // documented shapes of a `pipe` entry are read. The test double in `idiom`'s
    // own suite carries one too, which is why 0.0.1's conformance does not see the
    // shape it leans on.
    program.program = program.module;
    if (decl.unsupported.length) {
      warnOnce(ctx, 'unsupported-bindings', 'the composite verbs bind no storage or external resource, and this program declares ' + decl.unsupported.join(', ') + '.');
    }
    if (decl.bindings.some((binding) => binding.group !== 0)) {
      warnOnce(ctx, 'bind-groups', 'the composite verbs bind group 0 only; this program declares a resource in another group.');
    }
    try {
      const descriptors = makeBindGroupLayoutDescriptors(decl.defs, { vertex: { entryPoint: vs }, fragment: { entryPoint: fs } });
      program.layouts = descriptors.map((descriptor) => {
        const entries = (descriptor && descriptor.entries ? descriptor.entries : []).map((entry) => {
          if (!entry.buffer) return entry;
          // a uniform is uploaded per draw into the frame's arena, so every
          // uniform binding is dynamic; the bind group carries no offset
          return { ...entry, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: entry.buffer.minBindingSize || 0 } };
        });
        return device.createBindGroupLayout({ entries });
      });
      if (!program.layouts.length) program.layouts = [device.createBindGroupLayout({ entries: [] })];
      program.pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: program.layouts });
      // the resources the pipeline's own layout has — a binding a stage declares
      // and never uses is not in it, and a bind group entry it lacks is invalid
      const group0 = descriptors[0] ? descriptors[0].entries : [];
      program.bound = group0
        .map((entry) => {
          const declared = decl.bindings.find((binding) => binding.group === 0 && binding.binding === entry.binding);
          return declared ? { kind: declared.kind, name: declared.name, binding: entry.binding } : null;
        })
        .filter(Boolean);
    } catch (error) {
      console.error('[webgpu.tree] createProgram: the bind group layout could not be derived — ' + (error && error.message));
      program.failed = true;
      return program;
    }
    const info = program.module.getCompilationInfo;
    if (typeof info === 'function') {
      program.module.getCompilationInfo().then((compiled) => {
        for (const message of compiled.messages || []) {
          if (message.type === 'error') {
            console.error('[webgpu.tree] WGSL ' + message.type + ' at ' + message.lineNum + ':' + message.linePos + ' — ' + message.message);
          }
        }
      }).catch(() => {});
    }
    return program;
  }

  const backend = {
    ndcZMin: WEBGPU,
    uvOrientation: 'top-down',
    framebufferY: 'down',
    format,

    // ---------------------------------------------------------------- targets

    createTarget(ctx, spec) {
      const target = {
        id: ++seq,
        width: spec.width || ctx.width,
        height: spec.height || ctx.height,
        formats: [formatOf(spec)],
        // WebGPU's render pipelines take a sample count of 1 or 4, so any request
        // above one is 4 — a 2 or a 3 would be an invalid pipeline
        samples: spec.samples > 1 ? 4 : 1,
        textures: [],
        attachments: [],
        resolveTargets: null,
        color: null,
        depth: null,
        depthView: null,
        depthFormat: null,
      };
      target.resize = (width, height) => {
        target.width = width;
        target.height = height;
        buildTarget(ctx, target, spec);
        target.format = target.formats[0] || formatOf(spec);
        return target;
      };
      target.resolve = () => {
        const f = frameOf(ctx);
        if (f.pass && f.target === target) endPass(ctx);   // the resolve is the pass's end
        return target;
      };
      buildTarget(ctx, target, spec);
      target.format = target.formats[0] || formatOf(spec);
      return target;
    },

    destroyTarget(ctx, target) {
      const f = frameOf(ctx);
      if (f.pass && f.target === target) endPass(ctx);
      for (const gpu of target.textures) gpu.destroy();
      for (const texture of [target.color, target.depth]) if (texture) resources.textures.delete(texture.gpu);
      target.textures = [];
      target.color = null;
      target.depth = null;
      target.depthView = null;
    },

    bindTarget(ctx, target) {
      const prior = frameOf(ctx).target;
      if (target !== undefined) bindFrameTarget(ctx, target);
      return prior === undefined ? null : prior;
    },

    clear(ctx, color) {
      clearTarget(ctx, color);
    },

    // --------------------------------------------------------------- programs

    createProgram(ctx, frag, opts) {
      const o = opts || {};
      const code = o.source || sourceOf(frag, o);
      const program = buildProgram(ctx, code, o);
      if (program) resources.programs.add(program);
      return program;
    },

    imageProgram(ctx) {
      if (!ctx.imageProgram) ctx.imageProgram = backend.createProgram(ctx, FLAT, { label: 'webgpu.tree flat' });
      return ctx.imageProgram;
    },

    uniformsOf(prog) {
      return prog && prog.uniformNames ? prog.uniformNames.slice() : [];
    },

    samplersOf(prog) {
      return prog && prog.decl ? prog.decl.textures.slice() : [];
    },

    setUniforms(ctx, prog, values) {
      if (!prog || !values) return;
      prog.decl.set(values);
      for (const name of prog.decl.textures) {
        if (values[name] !== undefined) prog.textures.set(name, values[name]);
      }
      for (const name of prog.decl.samplers) {
        if (values[name] !== undefined) prog.samplers.set(name, values[name]);
      }
    },

    // ------------------------------------------------------------------ draws

    setCamera(ctx, V, P) {
      for (let i = 0; i < 16; i++) {
        ctx.V[i] = V[i];
        ctx.P[i] = P[i];
      }
      mat4Mul(ctx.PV, ctx.P, ctx.V);
      if (ctx.view) ctx.view.set(ctx.P, ctx.V);
      if (ctx.host && ctx.host.view) ctx.host.view.set(ctx.P, ctx.V);
      return ctx.host && ctx.host.view ? ctx.host.view : ctx.view;
    },

    draw(ctx, prog, geometry, opts) {
      return drawProgram(ctx, prog, geometry, 1, opts);
    },

    drawInstanced(ctx, prog, geometry, count, opts) {
      return drawProgram(ctx, prog, geometry, count || 1, opts);
    },

    // ---------------------------------------------------------------- buffers

    createBuffer(ctx, arrays, opts) {
      // `opts` is the twin's own (non-interleaved arrays for a per-frame stream);
      // `idiom` calls the member with `arrays` alone
      const buffer = createBuffersAndAttributesFromArrays(device, arrays, opts);
      buffer.id = ++seq;
      buffer.arrays = arrays;
      for (const gpu of buffer.buffers) resources.buffers.add(gpu);
      if (buffer.indexBuffer) resources.buffers.add(buffer.indexBuffer);
      return buffer;
    },

    updateBuffer(ctx, buffer, arrays, opts) {
      const rebuilt = createBuffersAndAttributesFromArrays(device, arrays, opts);
      for (const gpu of buffer.buffers) gpu.destroy();
      if (buffer.indexBuffer) buffer.indexBuffer.destroy();
      for (const gpu of rebuilt.buffers) resources.buffers.add(gpu);
      if (rebuilt.indexBuffer) resources.buffers.add(rebuilt.indexBuffer);
      Object.assign(buffer, rebuilt, { id: buffer.id, arrays });
      return buffer;
    },

    // The in-place write `idiom`'s draw policy calls for a stream (#113): the
    // geometry is non-interleaved — one buffer an attribute — so a frame's update
    // is one `queue.writeBuffer` per attribute, ordered with submissions rather
    // than inside a command buffer. The shape is the geometry's: a different set
    // of attributes, or one of another width, is a rebuild (`updateBuffer`), and
    // says so instead of writing bytes under a layout the pipeline baked.
    writeBuffer(ctx, buffer, arrays) {
      const layouts = buffer.bufferLayouts || [];
      if (!layouts.length || layouts.some((layout) => layout.attributes.length !== 1)) {
        console.error('[webgpu.tree] writeBuffer: the geometry is interleaved — the in-place write is for a stream, so rebuild it with updateBuffer.');
        return buffer;
      }
      const { typedArrays } = createBufferLayoutsFromArrays(arrays);
      const sameShape = typedArrays.length === layouts.length &&
        typedArrays.every((t, i) => t.stride * t.data.BYTES_PER_ELEMENT === layouts[i].arrayStride &&
          t.data.byteLength <= buffer.buffers[i].size);
      if (!sameShape) {
        console.error('[webgpu.tree] writeBuffer: the arrays shape or size differs from the geometry — rebuild it with updateBuffer.');
        return buffer;
      }
      for (let i = 0; i < buffer.buffers.length; i++) {
        device.queue.writeBuffer(buffer.buffers[i], 0, typedArrays[i].data);
      }
      if (buffer.indexBuffer && arrays.indices !== undefined) {
        device.queue.writeBuffer(buffer.indexBuffer, 0, makeTypedArrayFromArrayUnion(arrays.indices, 'indices'));
      }
      buffer.arrays = arrays;
      return buffer;
    },

    // --------------------------------------------------------------- picking

    /**
     * Read a block of a target back: a copy into a `MAP_READ` buffer, a map, a
     * promise. `opts` is the interface's, and this API has no synchronous form —
     * a read is asynchronous by construction, so `opts.sync` resolves a frame
     * later like every other read.
     */
    readPixels(ctx, target, x, y, width, height, opts) {
      return readback(ctx, target, x, y, width, height);
    },

    // -------------------------------------------------------------- gizmos

    /**
     * Draw a gizmo geometry — the layer's semantic spec translated into this
     * API's programs, uniforms, topology and state. `'line'` and `'wide'` take
     * the line or wide-line program for whether the geometry carries colour,
     * `'pane'` the world-space quad's; the topology is the pipeline's, so it is
     * stated to `setState` first; the depth test is off for a spec that says so.
     * The program cache is the bridge's own (`ctx.gizmoPrograms`), so a verb that
     * still draws its own cache shares these pipelines rather than making twins.
     */
    drawGizmo(ctx, kind, geometry, spec) {
      const sp = spec || {};
      if (!geometry) return null;
      const colored = !!sp.useColor;
      const prog = kind === 'pane' ? _paneProgramOf(ctx, backend) :
        kind === 'wide' ? _wideProgramOf(ctx, backend, colored) : _lineProgramOf(ctx, backend, colored);
      if (!prog) return null;
      const priorState = backend.setState(ctx, {
        depth: sp.depth !== false,
        topology: kind === 'line' ? 'line-list' : 'triangle-list',   // the pipeline bakes the topology
      });
      const priorProg = ctx.prog;
      const uniforms = kind === 'pane'
        ? { uColor: sp.color || WHITE, uUseTexture: sp.texture ? 1 : 0 }
        : { uPV: ctx.PV, uModel: sp.M || IDENTITY, uColor: sp.color || WHITE, uUseColor: colored ? 1 : 0 };
      if (kind === 'pane' && sp.texture) uniforms.uTexture = sp.texture;
      if (kind === 'wide') {
        const vp = sp.vp || setFrameViewport(ctx) || null;
        uniforms.uViewport = vp ? [vp[2], vp[3]] : [0, 0];
        uniforms.uWidth = sp.width || 1;
      }
      backend.setUniforms(ctx, prog, uniforms);
      ctx.prog = prog;
      const answer = backend.draw(ctx, prog, geometry, sp.count === undefined ? undefined : { count: sp.count });
      ctx.prog = priorProg;
      backend.setState(ctx, priorState);
      return answer;
    },

    // -------------------------------------------------------------- textures

    /**
     * A texture from a source — an element, a bitmap, or `{ data, width, height }`
     * (a `depth` makes it a 3d texture, `layers` a 2d array) — created, uploaded
     * and, where `mips` asks, chained. A record that is already a descriptor is
     * `createTextureFromDescriptor`, this backend's own.
     */
    createTexture(ctx, source, opts) {
      const o = opts || {};
      const pixels = _isPixels(source) ? source : null;
      const size = pixels ? [pixels.width, pixels.height] : _sizeOf(source);
      if (!size) {
        console.error('[webgpu.tree] texture: a source is required — an element, a bitmap, or { data, width, height }.');
        return null;
      }
      const format = _formatOf(source, o);
      if (format === 'rgba32float' && device.features && !device.features.has('float32filterable') && !device.features.has('float32-filterable')) {
        console.error('[webgpu.tree] texture: this device has no `float32-filterable`, so sampling an rgba32float ' +
          'texture with the twin\'s sampler is invalid and draws nothing — use `float: true` (16F) or a format ' +
          'the device filters.');
      }
      if (!_formatOk(format)) {
        console.error('[webgpu.tree] texture: `' + format + '` is not a texture format the twin takes.');
        return null;
      }
      const volume = !!pixels && typeof pixels.depth === 'number';
      const layers = volume ? Math.max(1, pixels.depth | 0) : (pixels && typeof pixels.layers === 'number' ? Math.max(1, pixels.layers | 0) : 1);
      const mips = o.mips === true;
      if (mips && volume) console.error('[webgpu.tree] texture: a 3d texture takes no mip chain — the chain is 2D and cube.');
      const levels = mips && !volume ? numMipLevels([size[0], size[1]], '2d') : 1;
      const tex = backend.createTextureFromDescriptor(ctx, {
        width: size[0],
        height: size[1],
        depthOrArrayLayers: layers,
        dimension: volume ? '3d' : '2d',
        viewDimension: volume ? '3d' : (layers > 1 ? '2d-array' : undefined),
        mips: levels,
        format,
        usage: o.usage,
        label: o.label,
      });
      ctx.sizes.set(tex, [tex.width, tex.height]);          // the layer's uTexelSize reads it
      backend.uploadTexture(ctx, tex, source);
      if (mips && !volume) generateMipmap(device, tex.gpu);
      return tex;
    },

    /** A cube map from six sources in the cube's order, each its own layer, unflipped. */
    createCubeTexture(ctx, faces, opts) {
      const o = opts || {};
      const first = faces[0];
      const size = _isPixels(first) ? [first.width, first.height] : _sizeOf(first);
      if (!size) {
        console.error('[webgpu.tree] cubemap: a face must be an element, a bitmap, or { data, width, height }.');
        return null;
      }
      const format = _formatOf(_isPixels(first) ? first : null, o);
      if (!_formatOk(format)) {
        console.error('[webgpu.tree] cubemap: `' + format + '` is not a texture format the twin takes.');
        return null;
      }
      const mips = o.mips === true;
      const levels = mips ? numMipLevels(size, '2d') : 1;
      const tex = backend.createTextureFromDescriptor(ctx, {
        width: size[0],
        height: size[1],
        depthOrArrayLayers: 6,
        dimension: '2d',
        viewDimension: 'cube',
        mips: levels,
        format,
        usage: o.usage,
        label: o.label,
      });
      ctx.sizes.set(tex, [tex.width, tex.height]);
      for (let i = 0; i < 6; i++) {
        const face = faces[i];
        backend.uploadTexture(ctx, tex, _isPixels(face) ? _bytes(face.data) : face, { z: i });
      }
      if (mips) generateMipmap(device, tex.gpu);
      return tex;
    },


    /** The descriptor's own path — the shape the bridge's callers hand it. @ignore */
    createTextureFromDescriptor(ctx, descriptor) {
      const d = descriptor || {};
      const width = d.width || 1;
      const height = d.height || 1;
      const layers = d.depthOrArrayLayers || 1;
      const dimension = d.dimension || '2d';
      const textureFormat = d.format ? formatOf({ format: d.format }) : 'rgba8unorm';
      const size = dimension === '3d' || layers > 1 ? [width, height, layers] : [width, height];
      const gpu = device.createTexture({
        size,
        dimension,
        format: textureFormat,
        usage: d.usage || (TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC),
        mipLevelCount: d.mips || 1,
        label: d.label,
      });
      // the mip chain's generator reads the platform's own textureBindingViewDimension
      const view = d.viewDimension ? gpu.createView({ dimension: d.viewDimension }) : gpu.createView();
      const texture = { id: ++seq, gpu, view, width, height, layers, dimension, format: textureFormat };
      resources.textures.add(gpu);
      return texture;
    },

    uploadTexture(ctx, texture, source, origin) {
      if (!texture || !texture.gpu) return;
      if (!origin && _isPixels(source)) return _writeSlices(ctx, texture, source);   // a volume or an array, slice by slice
      const z = origin && origin.z ? origin.z : 0;
      const mipLevel = origin && origin.mipLevel ? origin.mipLevel : 0;
      if (source && (ArrayBuffer.isView(source) || source instanceof ArrayBuffer)) {
        // rows padded to 256 like a read's, row 0 to row 0 — no flip
        const layout = paddedRows(source, texture.width, texture.height, bytesPerPixel(texture.format));
        device.queue.writeTexture(
          { texture: texture.gpu, mipLevel, origin: { x: 0, y: 0, z } },
          layout.data,
          { bytesPerRow: layout.bytesPerRow, rowsPerImage: texture.height },
          [texture.width, texture.height, 1],
        );
      } else {
        // no flip: WebGPU's texture space is top-down, as a decoded image's rows are
        device.queue.copyExternalImageToTexture(
          { source },
          { texture: texture.gpu, mipLevel, origin: { x: 0, y: 0, z } },
          [texture.width, texture.height, 1],
        );
      }
    },

    destroyTexture(ctx, texture) {
      if (!texture || !texture.gpu) return;
      texture.gpu.destroy();
      resources.textures.delete(texture.gpu);
      texture.gpu = null;
      texture.view = null;
    },

    textureSize(ctx, texture) {
      return texture && texture.width ? [texture.width, texture.height] : null;
    },

    // ------------------------------------------------------------------ state

    setViewport(ctx, rect) {
      return setFrameViewport(ctx, rect);
    },

    setState(ctx, state) {
      const prior = ctx.state || BASE_STATE;
      if (state === undefined) return prior;
      ctx.state = resolveState(prior, state);
      return prior;
    },

    // ---------------------------------------------------------------- context

    dispose(ctx) {
      endFrame(ctx);
      arena.dispose();
      for (const gpu of resources.buffers) gpu.destroy();
      for (const gpu of resources.textures) gpu.destroy();
      resources.buffers.clear();
      resources.textures.clear();
      resources.programs.clear();
      resources.white = null;
      resources.sampler = null;
      ctx.imageProgram = null;
    },
  };

  /**
   * Pick the pipeline the state selects, upload the uniforms into the frame's
   * arena, bind the group and draw.
   * @ignore
   */
  function drawProgram(ctx, prog, geometry, count, opts) {
    if (!prog || prog.failed) return null;
    const f = frameOf(ctx);
    const pass = ensurePass(ctx);
    const state = ctx.state || BASE_STATE;
    const target = f.target;
    const shape = {
      depth: !!(target && target.depthView),
      depthFormat: target ? target.depthFormat : null,
      formats: target ? target.formats : [format],
      samples: target ? target.samples : 1,
    };
    const key = pipelineKey(prog.id, state, shape);
    let pipeline = prog.pipelines.get(key);
    if (!pipeline) {
      try {
        pipeline = createPipeline(ctx, prog, state, shape);
      } catch (error) {
        prog.failed = true;
        console.error('[webgpu.tree] draw: a pipeline could not be made — ' + (error && error.message));
        return null;
      }
      prog.pipelines.set(key, pipeline);
    }

    const bindings = bindGroupFor(ctx, prog);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindings.group, bindings.offsets);
    if (geometry) {
      setVertexAndIndexBuffers(pass, geometry);
      const o = opts || {};
      const elements = o.count === undefined ? geometry.numElements : o.count;
      const first = o.offset || 0;
      if (geometry.indexBuffer) pass.drawIndexed(elements, count, first);
      else pass.draw(elements, count, first);
    }
    ctx.prog = prog;
    return prog;
  }

  /**
   * The bind group of a program at this draw: every uniform struct written into
   * a fresh arena slot (dynamic offsets travel with `setBindGroup`, not in the
   * group), each texture's view and each sampler. Cached by the resources it
   * names, so a draw that changes only its uniform values reuses its group.
   * @ignore
   */
  function bindGroupFor(ctx, prog) {
    const offsets = [];
    const entries = [];
    const parts = ['v' + arena.version];

    for (const binding of prog.bound) {
      if (binding.kind === 'uniform') {
        const view = prog.decl.views.get(binding.name);
        const slot = arena.alloc(view.arrayBuffer.byteLength);
        device.queue.writeBuffer(slot.buffer, slot.offset, view.arrayBuffer, 0, view.arrayBuffer.byteLength);
        entries.push({ binding: binding.binding, resource: { buffer: slot.buffer, offset: 0, size: slot.size } });
        offsets.push(slot.offset);
      } else if (binding.kind === 'texture') {
        const texture = prog.textures.get(binding.name) || white();
        parts.push('t' + texture.id);
        entries.push({ binding: binding.binding, resource: textureViewOf(texture) });
      } else {
        const chosen = prog.samplers.get(binding.name) || sampler();
        parts.push('s' + samplerId(chosen));
        entries.push({ binding: binding.binding, resource: chosen });
      }
    }

    const key = parts.join(',');
    let group = prog.bindGroups.get(key);
    if (!group) {
      group = device.createBindGroup({ layout: prog.layouts[0], entries, label: 'webgpu.tree bind group' });
      prog.bindGroups.set(key, group);
    }
    return { group, offsets };
  }

  return backend;
}
