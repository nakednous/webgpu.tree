# `webgpu.tree`

The WebGPU twin of `webgl.tree`: `@nakednous/tree` and `@nakednous/host` on raw WebGPU through
[webgpu-utils](https://github.com/greggman/webgpu-utils), its composites on
[`@nakednous/idiom`](https://www.npmjs.com/package/@nakednous/idiom). The same bridge surface — gizmo
pipe, HUD, render targets, filter passes and the pipe chain, colour-ID picking, camera install —
realized where uniforms are fields of a buffer bound as a group, a program is a pipeline with baked
state, and readback is asynchronous by construction.

> **Status: the render surface is built, and it has an API site of its own.** `init` and the backend
> behind `idiom`'s interface — the twenty-three members (the in-place `writeBuffer` among them) and the
> four conventions — with the composites over it: `renderTarget`, `SCREEN`,
> `program`, `fullscreen`, `filter`, `image`, `pipe`, `releasePipe`, `state`, `setCamera`, `endFrame`,
> `viewOf`, `dispose`; the figure's own path: `bind`, `buffer`, `updateBuffer`, `draw`,
> `drawInstanced` with the six declared transforms, `texture`, `upload`; picking: `readPixel`, `pick`;
> the space mappings: `mapLocation`, `mapDirection`, `unproject`, `fragCoord`, `pixelRatio`,
> `mat4Viewport`; and the line pipe with the HUD: `axes`, `grid`, `hermite`, `viewFrustum`,
> `trackPath`, `helmRig`, `handleLocus`, `beginHUD`, `endHUD`, `cross`, `bullsEye`; `pane`, with the
> frustum's textured faces and the helm rig's HUD form and `identify` labels; the texture shapes —
> `cubemap`, mips, and the 3D / 2D-array sources; and the Radiance path: `decodeRGBE`, `encodeRGBE`,
> `loadHDR`. The twin's surface is the reference's; what the
> reference does not have — a cube / layered render target (§7 #104) and compute (§7 #85) — is not on
> it either. `twin-design.md` is the differences table against `webgl.tree`.
>
> Pins `@nakednous/tree` ^0.0.34, `@nakednous/host` ^0.0.12, `@nakednous/idiom` ^0.0.2;
> `webgpu-utils` ^2.1.1 is a peer. Gates: `npm test` (119 cases, against the recording device in
> `test/gpu.js`), `npm run build`, and `npm run docs` (the API site below, 0 warnings — every
> documented name and a function's parameters checked against the build, and every example's imports
> resolved). The browser is the maintainer's gate: the geometry path, the uploaded texture, a scene's
> colour-id picks, the mappings, a gizmo scene with its HUD, a textured pane, the helm rig's HUD
> composite, a mip level, a volume's slices, an array's layers and a cube map's six faces were read
> back offscreen in this machine's Chromium (adapter `google/swiftshader`, `rgba8unorm`) — the twin's
> `testing/` pages are the record.

## Installation

ESM only: the package ships `dist/index.js`, and a bundler or an import map resolves it beside the
stack's packages and its one peer. A browser with WebGPU is required — `navigator.gpu` — so it does
not run in Node: a page `await`s `init`, which asks for an adapter, a device and the canvas's context.

```bash
npm install webgpu.tree webgpu-utils @nakednous/tree @nakednous/host @nakednous/idiom
```

Without a bundler, an import map resolves the five names:

```html
<script type="importmap">
{ "imports": {
  "webgpu.tree": "https://cdn.jsdelivr.net/npm/webgpu.tree/dist/index.js",
  "webgpu-utils": "https://cdn.jsdelivr.net/npm/webgpu-utils@2.1.1/dist/2.x/webgpu-utils.module.js",
  "@nakednous/tree": "https://cdn.jsdelivr.net/npm/@nakednous/tree/dist/index.js",
  "@nakednous/host": "https://cdn.jsdelivr.net/npm/@nakednous/host/dist/index.js",
  "@nakednous/idiom": "https://cdn.jsdelivr.net/npm/@nakednous/idiom/dist/index.js"
} }
</script>
```

```js
import { init, endFrame, image, renderTarget, SCREEN, setCamera, axes, tree } from 'webgpu.tree'

const canvas = document.body.appendChild(document.createElement('canvas'))
canvas.style.width = '400px'
canvas.style.height = '300px'
const ctx = await init(canvas, { width: 400, height: 300 })   // adapter, device, the canvas's context
const scene = renderTarget(ctx)                              // a WebGPU canvas has no depth attachment

const cam = tree.createCamera({ eye: [129, 107, 172] })

function frame() {
  ctx.backend.bindTarget(ctx, scene)                          // the layer's flat bind, the twin's pass
  ctx.backend.clear(ctx, [0.075, 0.553, 0.459, 1])
  setCamera(ctx, cam)
  axes(ctx, { size: 100 })
  ctx.backend.bindTarget(ctx, SCREEN)
  image(ctx, scene.color)
  endFrame(ctx)                                               // submit the frame: the twin's own
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

`endFrame(ctx)` is the twin's, not the layer's (§7 #107): it submits the frame's command encoder, and
it is what the host's `afterFrame` calls when a host is attached —
`host.createHost(canvas, { afterFrame: () => endFrame(ctx) })` — after `pointer.flush()`, so a pointer
handler's draw lands in the frame.

> **Status: 0.0.x, experimental.** The twin's surface is `webgl.tree`'s; WebGPU is not yet the default
> on Linux stable, so a figure's API stays an authoring choice (§7 #86, #108).

## The API site

The package has a reference site of its own, generated from this source by its own `tools/docs`
(`npm run docs`, after `npm run build`):

```
site/                index.html, one page per module, search.json
                     assets/{runner.js,search.js,style.css}, favicons
                     models/torus.obj  ← the mesh `buffer`'s figure loads
                     webgpu.tree.js  ← dist/index.js, the ESM build of the same commit
                     tree.js · host.js · idiom.js  ← the builds it was made against
```

It is **ESM-only**, as the package is: an example imports from `webgpu.tree`, runs under the page's
import map (`webgpu-utils` to the pinned CDN module, the stack's packages to the site's own copies of
the same commit) and awaits `init`; a shader is a WGSL fence. **Every doclet's example is a whole
figure**, and each is the reference's figure of the same doclet translated to the twin — the same
camera, the same scene, the same caption — so the two sites can be read side by side. A figure mounts
once as it nears the viewport and is hidden when it leaves it; a hidden iframe's animation is
throttled, and the WebGPU device stays, because a device made after an earlier one was destroyed
renders nothing in this Chromium. A figure that draws geometry binds its target with
`ctx.backend.bindTarget` and clears it with `ctx.backend.clear` — the layer's member, the twin's flat
bind (§7 #110), where the reference calls twgl's `bindFramebufferInfo` and `gl.clear`.
Serve it locally, from the repository root:

```
python3 -m http.server 8000     # then open http://127.0.0.1:8000/site/
```

The site documents **the verbs this package declares** — nine pages: `camera`, `context`, `draw`,
`gizmo`, `hdr`, `pick`, `space`, `texture` and the root module — **the composites it re-exports**, on three
pages of their own: `pass` (`fullscreen`, `filter`, `image`, `pipe`, `releasePipe` and the mask and
blend constants), `target` (`renderTarget`, `SCREEN`) and `state`; and **the two namespaces it
re-exports**, on the reference's eight: `host`, `host.handles`, `host.tracks`, `tree.camera`,
`tree.matrices`, `tree.projection`, `tree.quaternions` and `tree.visibility` — twenty module pages
beside the README, the reference's page set and anchors (§7 #116). The composites' and the
namespaces' pages are `@nakednous/idiom`'s and `@nakednous/tree`'s / `@nakednous/host`'s verbs,
documented here as the bridge re-exports them, from doc-only files in `docs/`, as `webgl.tree`
documents the surface it re-exports — each doclet's figure the reference's own figure translated to
the twin, so the two sites read side by side. `hdr` is the Radiance path — `decodeRGBE` and
`encodeRGBE` are `@nakednous/host`'s, re-exported, and `loadHDR` fetches and decodes a file, rows in
the file's own order, which is what a texture here takes; the reference hands back GL's order instead
(§7 #119).

Its gate is two halves. `npm run docs` is the structural one — every documented name and a function's
parameters against the build, every example's imports resolved, every fence's language — and it fails
on an error. The other half mounts **every figure** in this machine's Chromium with
`--enable-unsafe-webgpu`, at device scale factors **1 and 2**: the headless compositor drops its WebGPU
instance when a canvas is first presented, so a page carries one figure per load, a figure that reads
back reads before it presents, and a figure passes when it acquires a device, draws, logs nothing, and
its canvas is its page size times the density (§7 #115's first rule; the twin's `init` states the
density, so the figures take it). The browser's look is the maintainer's gate.

It is **not deployed**: the repositories' GitHub home, and the sites' deployment, is §7 #77's pending
ground, and #56's "the `*.tree` bridges only" gives this bridge a site, not an address.

---

## Architecture

```
  application  (imports webgpu-utils itself, and authors WGSL)
      │
      ▼
  webgpu.tree                 ← this package: the GPU, thinly
      │
      ├── @nakednous/idiom    ← targets, passes, pipe, state — the composites
      │
      ├── @nakednous/host     ← pointer, handles, players, streams, media
      │
      ├── @nakednous/tree     ← math, spaces, animation, visibility
      │
      └── webgpu-utils        ← peer dependency
```

`@nakednous/ui` is an optional peer of the application, not a dependency of the bridge.
Dependency direction is strict: `{ tree, host, idiom } ← webgpu.tree`; nothing flows back.

## The frame

WebGPU has no flat "bind a framebuffer" call, so the twin keeps the block inside: one command encoder
per frame, one render pass at a time, submitted at the frame's end. The pass is begun lazily, on the
first draw after a bind — which is what lets `filter`, `pipe` and `state` clear a target straight
after binding it, the order a GL figure writes — while a clear begins its pass at once, because a
state's pair is cleared as it is made and sampled by the very next pass.

```js
const ctx = await init(canvas, { width: 400, height: 300 })
const canvasHost = host.createHost(canvas, { afterFrame: () => endFrame(ctx) })

const mean = state(ctx, { width: 256, height: 192 })
function frame() {
  mean.pass(accum, { uWeight: 1 / (mean.count + 1) })
  image(ctx, mean.read.color)
}
```

`init` asks for the adapter and the device, so it is a promise — the one surface difference a caller
sees from `webgl.tree`, where `init(gl)` is a plain call. `endFrame` is the twin's own and is the
host's `afterFrame` client (§7 #107): the submit happens after `pointer.flush()`, so a pointer
handler's draws are in the frame. Without a host, the application calls it.

## The draw

A figure with geometry draws it the way a `webgl.tree` hero does — `buffer` a mesh, `bind` a program,
`draw` it under a model matrix — with WebGPU's two readings stated where they belong.

```js
const geo = buffer(ctx, tree.platonic(tree.HEXAHEDRON, { radius: 60 }))
const prog = program(ctx, wgsl, { buffers: geo.bufferLayouts })
setCamera(ctx, cam)
bind(ctx, prog, { uColor: [1, 0.5, 0.2, 1] })
draw(ctx, geo, M)
```

- **The vertex layout is the pipeline's, and nothing is settled at draw.** GL's attribute array is
  context state that outlives a draw, so the WebGL bridge disables what a program declares and a mesh
  lacks, every draw. WebGPU bakes the vertex state into the pipeline: `program`'s `buffers` states the
  layout its vertex stage reads, and `buffer` answers the layout the arrays shape implies
  (`geometry.bufferLayouts`, attributes in key order, one interleaved vertex buffer). The two are one
  statement when a program is made from the geometry's own record; a mismatch is a validation error
  at the first draw, not a stale attribute. `buffer` renames the arrays shape under the shaders'
  names (`position` → `aPosition`, `texcoord` → `aTexCoord`, …) and skips what holds no numbers, as
  `webgl.tree`'s does; `updateBuffer` refreshes the same record.
- **The six declared transforms** are uploaded by `draw`, each only if the program declares it, into
  the program's own uniform struct: `uModelMatrix` `uViewMatrix` `uModelViewMatrix`
  `uProjectionMatrix` `uModelViewProjectionMatrix` `uNormalMatrix` (`(V · M)⁻ᵀ`, a `mat3x3f` — nine
  floats in, twelve bytes a column out). Nothing outside that table is set. The arithmetic is the
  bridge's until `idiom`'s draw policy lands (§7 #109's R2 gives the six names to `idiom`).
- **Depth.** `draw` picks the pipeline the state selects; a state's depth field is a pipeline
  variant, cached by state and attachment.
- **`opts`** on `draw` is `{ count, offset }`, a partial draw in WebGPU's own units — a first vertex
  or a first index, where twgl's indexed draw counted bytes.

## Textures

```js
const tex = texture(ctx, document.querySelector('img'))            // element, bitmap, canvas, video
const pixels = texture(ctx, { data, width, height })               // raw RGBA, row 0 at the top
const float = texture(ctx, { data: new Float32Array(n), width, height })   // rgba32float
upload(ctx, tex, video)                                            // refresh each frame
```

One orientation, WebGPU's: **top-down, nothing flipped anywhere**. A decoded image's rows already run
that way and are copied as they are; a pixel source is taken as given — row 0 at the texture's top.
A pixel upload's rows are padded to 256 bytes, the copy alignment a readback's rows take, and a
**volume or an array is uploaded a slice at a time** (`depth` → a `3d` texture, `layers` → a `2d`
array, slice 0 first). **`mips: true`** creates the chain and generates it after the level-0 upload —
WebGPU has no `generateMipmap` call, so the chain is the peer's render pass, a layer at a time. A 3d
texture takes no chain, and says so. **`cubemap(ctx, faces, opts)`** takes six sources in the cube's
face order (`+X −X +Y −Y +Z −Z`) into one texture with a cube view, each face unflipped, mips
optional.

The formats are the targets' three — `rgba8unorm` (the default), `rgba16float`, `rgba32float` — and
the channel names a volume or a mask needs (`r8unorm`, `rg8unorm`, `r16float`, `r32float`, …); a
`Float32Array` defaults to the 32F one. Sampling an `rgba32float` texture linearly needs the adapter's
`float32-filterable` feature (request it through `init`'s `deviceOptions`), or a nearest sampler; the
twin's default sampler is linear and clamps. Sampling state is a sampler's, not a texture's.
`dispose(ctx)` frees every texture the twin made.

## Picking

```js
readPixel(ctx, target, x, y) → Promise<Uint8Array>   // a target's own pixels, top-left, a frame late
pick(ctx, x, y, drawFn, opts) → Promise<number>      // the id under a logical screen pixel, 0 a miss
```

`pick` renders the scene into a cached 1 × 1 `rgba8unorm` + `depth24plus` target, cleared black, under
the installed projection narrowed by `tree.mat4Pick` onto the query pixel. `drawFn` draws the scene,
calling `paint(id)` before each object; the promise resolves to that id (ids 1 … 2²⁴−1, `tree.idToRgba`
· `rgbaToId`), and the target, viewport, camera, state and bound program are restored afterwards. Each
`paint` is its own uniform-arena slot, so two objects in one pick read differently, and depth decides
the nearer of two overlapping ones.

- **The id program.** `opts.program`. A pipeline bakes its vertex state, so the default (the twin's
  flat program) serves the covering quad only: a scene of meshes passes an id WGSL of its own, built
  with the geometry's layout (`program(ctx, wgsl, { buffers: geometry.bufferLayouts })`), declaring
  `uColor: vec4f` — §7 #112's shape again.
- **Readback.** A copy must be ordered after the frame's draws, so a read **ends the frame** (the
  backend submits, then copies and maps); a pick inside a frame submits what is drawn and the frame
  continues — one extra submit, the cost of an asynchronous read on WebGPU. There is no `sync` form.
- **The canvas is not a read source.** A WebGPU canvas is a presentation surface: its pixels are the
  compositor's, and a copy after the frame's submit is invalid (this Chromium also cannot map a buffer
  once a canvas frame was presented). A figure draws into a target and reads that, or displays it with
  `image`. `pick` reads a target of its own, so it is unaffected.

## Space

```js
mapLocation(ctx, out, x, y, z, from, to)   // a point through the installed camera
mapDirection(ctx, out, dx, dy, dz, from, to)
unproject(ctx, outO, outD, sx, sy)         // a screen pixel → a ray (near-plane origin, unit direction)
fragCoord(ctx, out, x, y)                  // screen space → window space
pixelRatio(ctx, eyeZ)                      // world units per logical pixel
mat4Viewport(ctx, out)                     // W: NDC → screen pixels, depth → [0, 1]
```

Two spaces, as on `webgl.tree`: **screen** space — logical pixels, top-left, y down, what the pointer,
labels and a HUD count — and **window** space — the drawing buffer's device pixels. The twin's window
space has its origin at the **top-left too**, because `@builtin(position)` is the framebuffer's own
row: `fragCoord` scales and does not flip, its answer is what `readPixel` takes, and
`uResolution` (`filter`'s viewport) counts the same pixels. On `webgl.tree` window space is
bottom-left and `fragCoord` flips y.

The viewport these verbs describe is the **canvas's**, `[0, h, w, −h]` logical — the signed rectangle
the screen mapping and `mat4Pick` take, so a sub-viewport composes. A target's own viewport is the
frame's, WebGPU's `[x, y, w, h]` from the top: that is the pass's, not the pointer's. `from` / `to`
name a space (`tree.WORLD` · `EYE` · `NDC` · `SCREEN`) or take a column-major frame matrix — a camera,
a model, an object's own frame — dispatched as `tree.MATRIX`, a singular `to` answering `null`. The NDC
depth convention is bound to `WEBGPU` in the `tree` namespace, so no call names it.

## Gizmos and the HUD

```js
axes(ctx, opts) · grid(ctx, opts) · hermite(ctx, p0, t0, p1, t1, opts)
viewFrustum(ctx, opts) · trackPath(ctx, track, opts) · helmRig(ctx, helm, opts) · handleLocus(ctx, h, opts)
beginHUD(ctx) · cross(ctx, opts) · bullsEye(ctx, opts) · endHUD(ctx)
```

The line pipe draws tree's generators by name, each call running its generator into a cached arrays
record and drawing it under the installed camera — `{ M, color, bits, size, depth, width }` as the
reference takes them, the state and the bound program restored after every draw. Colour is semantic
where the generator writes a palette (axes, the helm rig) and `opts.color` elsewhere.

- **The width.** `width` counts logical pixels, default 1, times the device ratio. WebGPU rasterizes
  a `line-list` one device pixel, so at or below one the line list draws and above it each segment
  becomes a window-space quad of that width (`uViewport`, `uWidth`): the twin's wide line is built
  geometry, not a GL line width.
- **A slot per draw, per frame.** A geometry's data goes up with `queue.writeBuffer`, which is ordered
  with *submissions*, not inside a command buffer — so two gizmos of one name drawn in a frame must not
  share a buffer. Each draw takes a slot of the frame's pool (the cursor restarts at the frame's
  submit), the geometries are non-interleaved so a frame's update is one write per attribute, and
  nothing is allocated once warm.
- **The HUD** is an orthographic projection over the canvas's *logical* viewport — y down, depth off —
  with an identity view, so a mark's coordinates are the pointer's; the camera and the state come back
  at `endHUD`. `cross` and `bullsEye` wrap themselves in one when called outside it.
- **`pane`** is a textured or flat quad through its own world-space program (`PANE`), the MVP from a
  draw's declared transform. Its default uvs read `p0` at `(0, 0)` — the twin's texture space is
  top-down, so an image sits upright on the pane where the reference's flipped upload does. The
  frustum's `nearTexture` / `farTexture` are panes, the far one first.
- **The helm rig's HUD form.** `helmRig(ctx, helm, { x, y, size, tilt, tint })` renders the rig into a
  per-helm cached square target through its own iso camera and composites it with `image` at its
  logical rect, tinted. `identify` forwards the six lanes to `host.labels`, a world anchor each.

## Conventions

- **The context record.** `init(canvas, opts)` answers one record — `{ device, context, format }` and
  the layer's own bookkeeping — and every verb takes it first, as `gl` is taken first in `webgl.tree`.
  Per-device state lives in a registry keyed by the device.
- **`ndcZMin` is 0.** Every `tree` call that writes a depth range is bound to `WEBGPU` in the `tree`
  namespace, so no call names it.
- **One texture orientation, top-down.** Nothing is flipped anywhere: uploads, targets and the
  fullscreen pass's `vTexCoord` all run the way a decoded image's rows do. `image`'s rect is in target
  pixels, origin bottom-left; the viewport is WebGPU's own, origin top-left.
- **Depth.** The compare is a pipeline field, `'less'` unless a state names `'less-equal'` for a far
  plane pinned at `z/w = 1` (§7 #93). A pass with no depth attachment never bakes one in.
- **WGSL, one module.** `program(ctx, wgsl, opts)` compiles the twin's vertex stage *concatenated*
  with the caller's fragment source — WGSL has no include, and varyings match by location — unless
  the source brings its own `@vertex` stage. That is how one file carries both stages without a
  shared module, and why the backend interface needs no change for it. A pass program is the
  fragment stage alone:

```wgsl
struct U {
  uResolution: vec2f,
};
@group(0) @binding(0) var<uniform> u: U;

@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  let cell = floor(vTexCoord * u.uResolution / 32.0);
  let on = (cell.x + cell.y) % 2.0;
  return mix(vec4f(0.05, 0.07, 0.10, 1.0), vec4f(0.10, 0.55, 0.46, 1.0), on);
}
```
- **Uniforms.** A `var<uniform>` is a struct, and the names a bag sets are its members; the backend
  writes them through webgpu-utils' structured views into the frame's uniform arena, one slot per
  draw, offsets aligned to the device's. A `mat3x3f` travels as nine floats and its columns are
  padded, because WGSL pads them.

## What the package names in a shader

Its geometry's `aPosition` `aNormal` `aTangent` `aTexCoord` `aColor` `aJoints` `aWeights` (the arrays
shape's keys, renamed; a key of its own keeps its name); the six declared transforms where a program
declares them; a pass's input, bound to every texture the stage declares and the bag leaves unset;
`uResolution` and `uTexelSize`, only where declared. `image`'s flat program names
`uModelViewProjectionMatrix`, `uColor`, `uUseTexture` and `uTexture`.

---

## License

AGPL-3.0-only  
© JP Charalambos
