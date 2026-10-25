/**
 * @file HDR — a Radiance (.hdr) file as the pixel source `texture` uploads.
 * @module webgpu.tree/hdr
 * @license AGPL-3.0-only
 *
 * A floating-point texture needs radiance, and no image decoder in the browser
 * gives it any: `loadImage` hands back an `ImageBitmap` of 8-bit codes, clamped
 * at 1.0, so a tone-mapping pass would have nothing left to compress. Radiance's
 * RGBE is the one high-range format a few dozen lines decode — and the decode
 * itself is `@nakednous/host`'s, since reading a file's bytes is no business of
 * a renderer's:
 *
 * ```
 * const hdr = await loadHDR('/hdri/sunrise.hdr')   // { data, width, height }
 * const tex = texture(ctx, hdr)                    // rgba32float, from the array type
 * filter(ctx, toneProg, { uExposure: 0 }, tex)     // uSource = the radiance
 * ```
 *
 * What stays here is the two things a bridge owns. The fetch, so the whole path
 * from a URL to a texture is one call. And the row order — which on this bridge
 * is the file's own: a Radiance file states its rows top-down, WebGPU's texture
 * space is top-down too, and a pixel source uploads as given, so `loadHDR` hands
 * back the rows as written and the result goes straight into `texture` upright.
 * (The reference turns them over instead, GL's space having row 0 at the bottom;
 * `rowOrder: 'BOTTOM_UP'` asks for that order here.)
 *
 * `decodeRGBE` and `encodeRGBE` are re-exported unchanged, so an application
 * that holds its own bytes — a file input, a cache, a fixture — decodes them
 * through this same import.
 */

'use strict';

import { decodeRGBE as _decodeRGBE, encodeRGBE as _encodeRGBE } from '@nakednous/host';

/**
 * Decode Radiance RGBE bytes into the pixel source `texture` takes.
 * @details `@nakednous/host`'s decoder, re-exported here so one import reaches
 * the whole path from bytes to a float texture. It is pure, DOM-free and needs
 * no device, so a caller that holds its own bytes — a file input, a cache, a
 * fixture — uses it directly and decodes in Node too; {@link
 * https://github.com/nakednous/host|host}'s `hdr` module states the format, the
 * refusals and the `rowOrder` / `maxPixels` options. Rows come back in the
 * file's own order, top-down for the `-Y` every writer emits — which is the
 * order a texture here wants.
 * @param {ArrayBuffer|Uint8Array} bytes  The whole file.
 * @param {{ rowOrder?:string, maxPixels?:number }} [opts]  `rowOrder`: `FILE`
 *        (default) or `BOTTOM_UP` for GL's texture space — the order the
 *        reference's `loadHDR` asks for.
 * @returns {{ data:Float32Array, width:number, height:number }} Radiance in
 *          linear light: what `texture` uploads as `rgba32float`, and the range
 *          a tone operator compresses.
 * @example
 * <caption>One byte, six exponents: the same level 128 read at e = 132 … 137 steps the radiance 8, 16, 32, 64, 128, 256 — a doubling a pixel.</caption>
 * import { init, endFrame, filter, program, texture, decodeRGBE } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '60px'
 * const ctx = await init(canvas, { width: 400, height: 60 })
 * const head = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 6\n'
 * const bytes = new Uint8Array(head.length + 24)
 * for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i)
 * for (let i = 0; i < 6; i++) {                      // every pixel at level 128
 *   const at = head.length + i * 4
 *   bytes[at] = bytes[at + 1] = bytes[at + 2] = 128
 *   bytes[at + 3] = 132 + i                          // e = 132 … 137, a stop a step
 * }
 *
 * const hdr = decodeRGBE(bytes)                      // { data, width 6, height 1 }
 * const show = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let L = textureSample(uSource, uSampler, vec2f(vTexCoord.x, 0.5)).rgb * exp2(-3.0);
 *   return vec4f(pow(L / (1.0 + L), vec3f(1.0 / 2.2)), 1.0);
 * }
 * ```
 * `)
 *
 * ctx.backend.clear(ctx, [0, 0, 0, 1])
 * filter(ctx, show, null, texture(ctx, hdr))
 * endFrame(ctx)
 */
export function decodeRGBE(bytes, opts) { return _decodeRGBE(bytes, opts); }


/**
 * Encode three linear radiance samples and a shared exponent to RGBE bytes.
 * @details `@nakednous/host`'s encoder, re-exported; the inverse of the pixel
 * `decodeRGBE` reads, within the eight bits the format gives a mantissa.
 * @param {number} r  Red, ≥ 0.
 * @param {number} g  Green.
 * @param {number} b  Blue.
 * @param {Uint8Array} [out]  Four bytes to write; a new one when absent.
 * @returns {Uint8Array} out
 * @example
 * <caption>Four values written into one file and read back: 0.0, 0.5, 1.0 and 4.0 become four pixels and then the ramp they are.</caption>
 * import { init, endFrame, filter, program, texture, encodeRGBE, decodeRGBE } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '80px'
 * const ctx = await init(canvas, { width: 400, height: 80 })
 * const head = '#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 4\n'
 * const bytes = new Uint8Array(head.length + 16)
 * for (let i = 0; i < head.length; i++) bytes[i] = head.charCodeAt(i)
 * ;[0, 0.5, 1, 4].forEach((v, i) => bytes.set(encodeRGBE(v, v, v), head.length + i * 4))
 * // the four pixels are [0,0,0,0] [128,128,128,128] [128,128,128,129] [128,128,128,131]
 *
 * const hdr = decodeRGBE(bytes)                      // { data, width 4, height 1 }
 * const show = program(ctx, `
 * ```wgsl
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let L = textureSample(uSource, uSampler, vec2f(vTexCoord.x, 0.5)).rgb;
 *   return vec4f(pow(L / (1.0 + L), vec3f(1.0 / 2.2)), 1.0);
 * }
 * ```
 * `)
 *
 * ctx.backend.clear(ctx, [0, 0, 0, 1])
 * filter(ctx, show, null, texture(ctx, hdr))
 * endFrame(ctx)
 */
export function encodeRGBE(r, g, b, out) { return _encodeRGBE(r, g, b, out); }


/**
 * Fetch a Radiance `.hdr` file and decode it, rows in the file's order.
 * @details The host's decoder over `fetch` — the browser's, or Node's from 18 —
 * with the row order the texture here wants: the file's own, top-down, which is
 * what `texture` uploads a pixel source in, so the result goes straight into a
 * texture upright. `rowOrder: 'BOTTOM_UP'` asks for GL's order instead, the one
 * the reference hands back by default.
 * @param {string} url
 * @param {{ fetch?:object, rowOrder?:string, maxPixels?:number }} [opts]
 *        fetch: the fetch init (credentials, mode, …). rowOrder defaults to
 *        `FILE` here; `BOTTOM_UP` turns the rows over. maxPixels reaches the
 *        decoder.
 * @returns {Promise<{ data:Float32Array, width:number, height:number }>} Radiance
 *          in linear light, what `texture` uploads as `rgba32float`.
 * @example
 * <caption>A whole file the page serves — a 128 × 48 fixture whose sun reads 2464, small on purpose — decoded and tone-mapped with Reinhard while the exposure swings.</caption>
 * import { init, endFrame, filter, program, texture, loadHDR } from 'webgpu.tree'
 *
 * const canvas = document.body.appendChild(document.createElement('canvas'))
 * canvas.style.width = '400px'
 * canvas.style.height = '300px'
 * const ctx = await init(canvas, { width: 400, height: 300 })
 * const tone = program(ctx, `
 * ```wgsl
 * struct U { uExposure: f32 };
 * @group(0) @binding(0) var uSource: texture_2d<f32>;
 * @group(0) @binding(1) var uSampler: sampler;
 * @group(0) @binding(2) var<uniform> u: U;
 *
 * @fragment
 * fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
 *   let L = textureSample(uSource, uSampler, vTexCoord).rgb * exp2(u.uExposure);
 *   return vec4f(pow(L / (1.0 + L), vec3f(1.0 / 2.2)), 1.0);
 * }
 * ```
 * `)
 *
 * loadHDR('models/tone_sunrise_128x48.hdr').then((hdr) => {   // { data, width, height }
 *   const radiance = texture(ctx, hdr)                        // rgba32float, upright
 *   let exposure = -2
 *   setInterval(() => {
 *     exposure = exposure >= 2 ? -2 : exposure + 0.1
 *     ctx.backend.clear(ctx, [0, 0, 0, 1])
 *     filter(ctx, tone, { uExposure: exposure }, radiance)
 *     endFrame(ctx)
 *   }, 50)
 * })
 */
export async function loadHDR(url, opts) {
  const o = opts || {};
  const res = await fetch(url, o.fetch);
  if (!res.ok) throw new Error('[webgpu.tree] hdr: ' + url + ' → ' + res.status);
  const rowOrder = o.rowOrder || 'FILE';
  return decodeRGBE(await res.arrayBuffer(), { maxPixels: o.maxPixels, rowOrder });
}
