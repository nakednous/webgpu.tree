# `webgpu.tree` — the twin (design)

> Target: `webgpu.tree` 0.0.1 on `@nakednous/tree` ^0.0.34, `@nakednous/host` ^0.0.12,
> `@nakednous/idiom` ^0.0.1, and `webgpu-utils` ^2.1.1 as a peer. The reference surface is
> `webgl.tree`'s (`bridge-design.md`); this doc is the **differences table** against it and nothing
> more. Status: **the render surface is built** (2026-10-23/24) — `init`, the backend behind `idiom`'s
> interface, the composites over it (`renderTarget`, `program`, `fullscreen`, `filter`, `image`,
> `pipe`, `releasePipe`, `state`, `setCamera`, `endFrame`), the figure's own path (`bind`, `buffer`,
> `updateBuffer`, `draw`, `drawInstanced` with the six declared transforms, `texture`, `upload`),
> picking (`readPixel`, `pick`) and the space mappings (`mapLocation`, `mapDirection`, `unproject`,
> `fragCoord`, `pixelRatio`, `mat4Viewport`). The rest of the table's surface is stated, each verb its
> own stage. Names inherit the bridge's.

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
| `program(vert, frag)` | twgl's `createProgramInfo`, not re-wrapped | **the twin's**: `program(ctx, wgsl, opts)` builds a render pipeline — one WGSL module with `vs` / `fs` entry points, the final vertex layout `opts.buffers` states (the geometry's own; the covering quad's by default), and the render state `setState` records baked by the pipeline a draw selects. There is no thin-layer verb to leave un-wrapped: a pipeline is more than a program |
| `program(frag)` | fixed pass-through vertex stage | the same, as a WGSL vertex entry the twin supplies |
| `bind(prog, uniforms)` | `useProgram` + `setUniforms` per name | `makeShaderDataDefinitions(wgsl)` once per pipeline; `makeStructuredView` per uniform struct; `bind` writes the named fields into the view and `queue.writeBuffer`s the struct; bind groups cached per pipeline. Bare names still resolve one field each |
| declared transforms | read off `programInfo.uniformSetters` | read off the definitions: any uniform struct field named `uModelViewMatrix` … receives its value; the fixed set is the same (apex pending #10) |
| geometry | `createBufferInfoFromArrays` | `createBuffersAndAttributesFromArrays` (webgpu-utils) from the same `arrays` shape — the core's gizmo arrays upload unchanged. The geometry's layout is that shape's (`buffer`'s `bufferLayouts`: attributes in key order, interleaved), and it is what the program's `opts.buffers` states to the pipeline |
| `draw(obj, M)` | `drawBufferInfo` | the six declared transforms uploaded first, through `setUniforms`, then `pass.setVertexBuffer` / `setIndexBuffer` / `draw` / `drawIndexed` on the current render pass. There is no attribute settling: the vertex state is the pipeline's, fixed when it is made |
| `drawInstanced` | `drawBufferInfo(…, instanceCount)` | native `draw(…, n)` |
| `renderTarget` | `createFramebufferInfo`, `drawBuffers` for MRT | textures with `RENDER_ATTACHMENT | TEXTURE_BINDING`; a depth texture for `depth` / `depthTexture`; MRT is the pass descriptor's `colorAttachments` list, fragment `@location(i)` in list order |
| `beginPass` · `screen` | `bindFramebufferInfo(gl, fbo | null)` — a flat call | **the twin's** `beginPass(ctx, fbo | SCREEN)`: ends the current render pass if any, begins one on a frame-scoped command encoder; the encoder is submitted at frame end (`endFrame(ctx)`, called by the host loop hook or by the application). The flat-call model survives; the block is internal |
| `clear` | `gl.clear` | the pass's `loadOp: 'clear'` with `clearValue`; `clear(ctx, color)` sets the value the next `beginPass` uses |
| render state (`cullFace`, blend) | raw `gl.*`, per draw | baked into pipelines at `program`; a state flip is a second pipeline, cached by state key |
| depth compare | `LESS`, the platform's, stated once at `createCanvas`; a pass that writes the far plane's depth raises it to `LEQUAL` for itself | a pipeline field: `'less'` unless `opts` names another, `'less-equal'` for a pinned backdrop. WebGPU has **no default to inherit** — the field is required as soon as depth writes are on — so the twin states it at `program`, the same word the WebGL twin states at the context |
| `readPixel` | PBO + fence, self-polling raf | `copyTextureToBuffer` into a `MAP_READ` buffer (`bytesPerRow` padded to 256), `mapAsync`; natively a `Promise` — the reason the surface is async on both. A copy's target is a texture: the canvas is a presentation surface, so a read takes a **target**, in its own pixels, row 0 at the top. A read is ordered after the frame's draws, so it **ends the frame** — one submit per read |
| `pick` | 1×1 target + `mat4Pick`, `paint(id)` → `uColor` | the same on the twin's `readPixel`: a cached 1 × 1 `rgba8unorm` + `depth24plus` target, the projection narrowed onto the query pixel, `paint(id)` through `setUniforms` (one arena slot per object), the camera/state/target/program restored. Query pixels are **logical screen pixels**. The id program is `opts.program` — the figure's own for a mesh, since the pipeline bakes its vertex state — and the default flat one serves the covering quad |
| `upload` | `setTextureFromElement`, `flipY` on for images | `copyExternalImageToTexture`, no flip — WebGPU's texture space is **top-down**, the same as decoded images; raw pixels through `writeTexture` with rows padded to 256 bytes, as a readback's are |
| texture orientation | one orientation, GL's bottom-up: images flipped at upload, targets untouched | one orientation, WebGPU's top-down: nothing flipped, targets already top-down. The rule "no flip switch anywhere" holds on both; the *direction* differs, and the default pane UVs follow (`p0` → `(0, 0)`) |
| `fullscreen` `vTexCoord` | bottom-up (`v = 0` at the bottom) | top-down (`v = 0` at the top) — coincidentally p5's `filter` convention. A filter that uses `vTexCoord.y` spatially reads differently on the two bridges; one that only samples `uSource` is unaffected |
| `ndcZMin` | `WEBGL` (−1) | `WEBGPU` (0): every `cameraProj`, `mapLocation`, `mat4Pick`, `frustumCorners` call takes it; nothing else changes |
| framebuffer y | `gl_FragCoord` y-up | `@builtin(position)` y-down; the host's viewport `[0, h, w, −h]` is the same on both (it describes screen space, not the framebuffer) |
| `fragCoord` · the spaces | screen space → window space, device pixels, **bottom-left, y up** | screen space → window space, device pixels, **top-left, y down** — the framebuffer's own row, so no flip: the value is what `readPixel` takes and what a fragment shader's `@builtin(position).xy` reads. The viewport the mappings take is the **canvas's** signed `[0, h, w, −h]`; a target's own is the frame's `[x, y, w, h]` |
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

**Read 2026-10-23, with the core built.**

- *The flat pass.* One frame holds a state's pass, a three-stage `pipe` (two working targets and a
  display) and the display's own clear: the pass is begun lazily on a bind, a clear begins one at
  once — the order `filter`, `pipe` and `state` write — and `endFrame` submits the frame's single
  encoder. The host owns the submit through `afterFrame` (§7 #107); without a host the application
  calls `endFrame`, which is the fallback this gate asked about.
- *Row alignment.* Pinned by `test/readback.test.js`: a 1 × 1 copy is 256 bytes wide and answers four
  bytes, a 3 × 2 block packs to 24 — and it runs in Chromium (the state's bands read back exactly:
  `230 26 26 255` and `26 26 230 255`, the mean `64 128 191` after eight passes).
- *Orientation.* The fullscreen pass's `vTexCoord` has v = 0 at the target's top row, and a target read
  back row 0 first: the display pass drawn into a target read red at its left, blue at its right, with
  no flip anywhere. The portal and stereo twins stay the notebook's gate.
- *Availability.* WebGPU needs `--enable-unsafe-webgpu` on this machine's Chromium (154.0.8037.97);
  the adapter is `google/swiftshader`, the preferred format `rgba8unorm`. Headless, that Chromium
  **composites no WebGPU canvas** — a raw clear and a screenshot show the page's background — and a
  `mapAsync` after the first canvas presentation fails with *"A valid external Instance reference no
  longer exists"*, so the figure's readbacks are taken offscreen and the on-screen look is the
  maintainer's gate.

**Read 2026-10-24, with the draw policy and the raw verbs built.**

- *The vertex layout is the pipeline's.* `program(ctx, wgsl, { buffers })` states it, and
  `buffer(ctx, arrays)` answers the arrays shape's own (`geometry.bufferLayouts` — attributes in key
  order, one interleaved vertex buffer); a mesh program is made from the geometry's record, so the
  two are one statement, and the pass programs keep the quad's. A figure's WGSL therefore declares
  the locations the shape fixes — a mesh's `position`, `normal`, `texcoord` are 0, 1, 2 — and a
  layout that does not agree fails the pipeline at the first draw instead of reading a stale
  attribute. The geometry path was read back in Chromium: a quad through `buffer`, its WGSL through
  `program` with the geometry's layout, `draw` under a camera state and a model matrix, the four
  texel centres of its 2 × 2 texture answering `247 4 4`, `4 255 4`, `4 4 255` and `255 255 255`,
  the outside the clear colour, and a translated `M` moving the sampled cell the way the camera's
  projection says.
- *Row alignment, the upload side.* `paddedRows` is the readback's alignment used for
  `writeTexture`: a 2 × 2 RGBA8 source writes 256-byte rows with the padding zeroed, and a 64-pixel
  row passes through tight. `test/texture.test.js` pins the bytes.
- *Orientation.* The uploaded texture read back through `image` has red and green on the target's top
  row and blue and white on its bottom — the source's row 0 at the texture's top, no flip anywhere —
  and the geometry path samples the same rows through its own uvs.
- *Availability* stands as read above; the canvas is still the maintainer's look.

**Read 2026-10-24, with picking built.**

- *Colour-id picking.* A scene of two cubes drawn with the figure's id WGSL read `1` and `2` at their
  centres, `0` at a corner, and `0` again after the frame split; two overlapping cubes answered the
  nearer id, so the 1 × 1 target's depth attachment decides; and the same ids read off a target as
  the colour code, `1 0 0` and `2 0 0`. The camera, the target, the depth state and the bound program
  came back after each pick.
- *The read's target.* Reading a target's own pixel worked from the first attempt offscreen; the
  canvas stays unreadable on this machine (a presentation surface, and the mapAsync limit above), so
  the twin's `readPixel` takes a target and says so.

**Read 2026-10-24, with the space mappings built.**

- *The mappings are the matrices.* A cube's centre mapped to `120 90` — the canvas centre of a
  480 × 360 buffer at a CSS size of 240 × 180 — exactly as `W · P · V` gave it, with `W` the viewport
  matrix, and `mapDirection` equalled the view's own rotation. `unproject` came back to the ray: its
  origin on the near plane (eye-space z −1), its direction the unit ray, the world point on it.
- *The window crossing.* `fragCoord` answered `240 180` for the logical centre at a device ratio of
  two, and `0 0` for the corner — no flip. The mapped pixel, the pick and the readback then agreed on
  one pixel: `pick` at `120 90` read id `1`, a corner read `0`, and `readPixel` at `fragCoord`'s
  `240 180` read the id's colour `1 0 0 255`.
