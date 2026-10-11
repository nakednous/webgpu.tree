# `webgpu.tree` — the twin (design)

> Target: `webgpu.tree` 0.0.1 on `@nakednous/tree` 0.0.28+, `@nakednous/host` 0.0.1, and
> `webgpu-utils` ^2.1.1 as a peer. The reference surface is `webgl.tree`'s
> (`bridge-design.md`); this doc is the **differences table** against it and nothing more.
> Status: **stated, not built** — gated on WebGPU shipping by default on Linux stable, the
> notebook's own gate for its compute paradigm. Names inherit the bridge's.

---

## 1 · The invariant

The twin exports the same list, with the same signatures, where `gl` becomes the WebGPU
context object — `{ device, context, format }` created once by `init(canvas, opts)` and
passed first to every call, exactly as `gl` is. Per-context state lives in a registry keyed
by `device`. A hero written against `webgl.tree` reads the same against `webgpu.tree`; what
differs is the thin layer underneath it (webgpu-utils in place of twgl), the shading
language of anything the hero authors (WGSL), and the conventions of the API, all listed
below. Everything from `tree` and `host` is untouched — the split's proof.

The notation anticipated the twin: `bind` is bare names because "on WebGPU the values are
fields of a uniform buffer bound as a group"; `program` is "a pipeline that also bakes in
blend and depth state." The twin realizes those two sentences.

---

## 2 · Differences

| surface | `webgl.tree` (WebGL2 · twgl) | `webgpu.tree` (WebGPU · webgpu-utils) |
|---|---|---|
| context | `gl` from `canvas.getContext('webgl2')` | `{ device, context, format }` from `init(canvas)`: adapter → device, canvas context configured to the preferred format |
| `program(vert, frag)` | twgl's `createProgramInfo`, not re-wrapped | **the twin's**: `program(ctx, wgsl, opts)` builds a render pipeline — one WGSL module with `vs` / `fs` entry points, vertex layout from the module, `opts` baking topology, cull, blend, depth. There is no thin-layer verb to leave un-wrapped: a pipeline is more than a program |
| `program(frag)` | fixed pass-through vertex stage | the same, as a WGSL vertex entry the twin supplies |
| `bind(prog, uniforms)` | `useProgram` + `setUniforms` per name | `makeShaderDataDefinitions(wgsl)` once per pipeline; `makeStructuredView` per uniform struct; `bind` writes the named fields into the view and `queue.writeBuffer`s the struct; bind groups cached per pipeline. Bare names still resolve one field each |
| declared transforms | read off `programInfo.uniformSetters` | read off the definitions: any uniform struct field named `uModelViewMatrix` … receives its value; the fixed set is the same (apex pending #10) |
| geometry | `createBufferInfoFromArrays` | `createBuffersAndAttributesFromArrays` (webgpu-utils) from the same `arrays` shape — the core's gizmo arrays upload unchanged |
| `draw(obj, M)` | `drawBufferInfo` | `pass.setVertexBuffer` / `setIndexBuffer` / `draw` / `drawIndexed` on the current render pass |
| `drawInstanced` | `drawBufferInfo(…, instanceCount)` | native `draw(…, n)` |
| `renderTarget` | `createFramebufferInfo`, `drawBuffers` for MRT | textures with `RENDER_ATTACHMENT | TEXTURE_BINDING`; a depth texture for `depth` / `depthTexture`; MRT is the pass descriptor's `colorAttachments` list, fragment `@location(i)` in list order |
| `beginPass` · `screen` | `bindFramebufferInfo(gl, fbo | null)` — a flat call | **the twin's** `beginPass(ctx, fbo | SCREEN)`: ends the current render pass if any, begins one on a frame-scoped command encoder; the encoder is submitted at frame end (`endFrame(ctx)`, called by the host loop hook or by the application). The flat-call model survives; the block is internal |
| `clear` | `gl.clear` | the pass's `loadOp: 'clear'` with `clearValue`; `clear(ctx, color)` sets the value the next `beginPass` uses |
| render state (`cullFace`, blend) | raw `gl.*`, per draw | baked into pipelines at `program`; a state flip is a second pipeline, cached by state key |
| depth compare | `LESS`, the platform's, stated once at `createCanvas`; a pass that writes the far plane's depth raises it to `LEQUAL` for itself | a pipeline field: `'less'` unless `opts` names another, `'less-equal'` for a pinned backdrop. WebGPU has **no default to inherit** — the field is required as soon as depth writes are on — so the twin states it at `program`, the same word the WebGL twin states at the context |
| `readPixel` | PBO + fence, self-polling raf | `copyTextureToBuffer` into a `MAP_READ` buffer (`bytesPerRow` padded to 256), `mapAsync`; natively a `Promise` — the reason the surface is async on both |
| `pick` | 1×1 target + `mat4Pick`, `paint(id)` → `uColor` | identical, on the twin's `readPixel` |
| `upload` | `setTextureFromElement`, `flipY` on for images | `copyExternalImageToTexture`, no flip — WebGPU's texture space is **top-down**, the same as decoded images |
| texture orientation | one orientation, GL's bottom-up: images flipped at upload, targets untouched | one orientation, WebGPU's top-down: nothing flipped, targets already top-down. The rule "no flip switch anywhere" holds on both; the *direction* differs, and the default pane UVs follow (`p0` → `(0, 0)`) |
| `fullscreen` `vTexCoord` | bottom-up (`v = 0` at the bottom) | top-down (`v = 0` at the top) — coincidentally p5's `filter` convention. A filter that uses `vTexCoord.y` spatially reads differently on the two bridges; one that only samples `uSource` is unaffected |
| `ndcZMin` | `WEBGL` (−1) | `WEBGPU` (0): every `cameraProj`, `mapLocation`, `mat4Pick`, `frustumCorners` call takes it; nothing else changes |
| framebuffer y | `gl_FragCoord` y-up | `@builtin(position)` y-down; the host's viewport `[0, h, w, −h]` is the same on both (it describes screen space, not the framebuffer) |
| supplied programs | GLSL `flat`, `phong`, the line pipe, the pass-through | WGSL twins of the same four — the one source duplication in the stack, kept to these files |
| HUD | ortho `P`, depth off | the same matrices; depth off is a pipeline variant |
| `dispose` | deletes GL objects | destroys buffers / textures; pipelines are dropped |
| packaging | ESM (twgl.js, tree, host external) + `dist/webgl.tree.umd.cjs`, global `webglTree` with `.tree` · `.host` | ESM (webgpu-utils, tree, host external) + `dist/webgpu.tree.umd.cjs`, global `webgpuTree` with `.tree` · `.host` |

---

## 3 · What does not appear in the table

Because it does not differ: the camera state and `setCamera(cam)` filling the host's view
bag; the gizmo calls and their generators; `pipe`'s ping-pong semantics and caches; `state`'s
pair, its swap and its count — WebGPU's per-pass `loadOp` is the same "never cleared but by
`reset()`", and the side a pass writes is the one the next pass's `beginPass` reads; `image`
with `tint` / `mask` / `blend` (blend as a pipeline variant); the pick's `paint(id)` and the
id codec; labels; the host entirely; the notation's realization table, row for row.

---

## 4 · Shaders

The notebook fixes GLSL as its shading language and defers a WGSL column to the WebGPU
material. The twin follows: it ships WGSL for its four supplied programs only; a hero on
`webgpu.tree` authors WGSL, and the notebook's Archetypes gain their WGSL column at the
same time. No GLSL→WGSL translation lives in the stack (naga / tint are build tools a
notebook column may use; the bridge does not).

---

## 5 · Gates

- **The flat `beginPass` over a command encoder.** A frame-scoped encoder with passes
  ended on the next routing call, submitted at `endFrame`; whether the host loop can own
  `endFrame` cleanly or the application must call it. *Experiment:* the pipe chain with
  three passes and a `screen` display in one frame.
- **`readPixel` row alignment.** `bytesPerRow` padded to 256 for a 1×1 copy; the decode
  reads four bytes at offset 0. *Experiment:* the picking hero.
- **Orientation twins.** The portal and stereo heroes on both bridges with no per-call
  flip, each bridge on its own orientation rule. *Experiment:* the bridge gate rerun here.
- **Availability.** WebGPU default on Linux stable Chromium — the trigger for building any
  of this.
