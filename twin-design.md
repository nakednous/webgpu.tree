# `webgpu.tree` — the twin (design)

> Target: `webgpu.tree` 0.0.1 on `@nakednous/tree` ^0.0.34, `@nakednous/host` ^0.0.12,
> `@nakednous/idiom` ^0.0.2, and `webgpu-utils` ^2.1.1 as a peer. The reference surface is
> `webgl.tree`'s (`bridge-design.md`); this doc is the **differences table** against it and nothing
> more. Status: **the render surface is built, and the package has an API site of its own**
> (2026-10-23/24) — `init`, the backend behind `idiom`'s interface (its twenty-three members,
> `writeBuffer` among them), the composites over it (`renderTarget`, `program`, `fullscreen`, `filter`,
> `image`, `pipe`, `releasePipe`, `state`, `setCamera`, `endFrame`), the figure's own path (`bind`,
> `buffer`, `updateBuffer`, `draw`, `drawInstanced` with the six declared transforms, `texture`,
> `upload`), picking (`readPixel`, `pick`), the space mappings (`mapLocation`, `mapDirection`,
> `unproject`, `fragCoord`, `pixelRatio`, `mat4Viewport`), the line pipe with the HUD (`axes`, `grid`,
> `hermite`, `viewFrustum`, `trackPath`, `helmRig`, `handleLocus`, `beginHUD`, `endHUD`, `cross`,
> `bullsEye`), `pane` with the frustum's textured faces and the helm rig's HUD form with its
> `identify` labels, and the texture shapes (`cubemap`, mips, the 3D / 2D-array sources). **The
> surface is the reference's.** What the reference does not have — a cube / layered render target (§7
> #104) and compute (§7 #85) — is not on it either. Names inherit the bridge's.
>
> **The site.** `tools/docs` is this package's own copy — a third, after `webgl.tree`'s and p5.tree's
> — and `npm run docs` writes `site/`: the README as the landing page, a page per module (nineteen:
> the eight the package declares, the composites' three and the two namespaces' eight — the last two
> groups from doc-only files in `docs/`), search, the ES build of the same commit and the builds it was
> made against. It is **ESM-only**, as the package
> is: an example imports from `webgpu.tree`, runs as a module script under the page's import map and
> awaits `init`; a shader is a WGSL fence. **Every doclet's example is the reference's figure
> translated** — the same camera, scene and caption, so the two sites read side by side — mounted once
> as it nears the viewport and hidden (not torn down) when it leaves it. It does not deploy — #56 gives the bridge a site, #77's ground for an address
> stays pending. §5's last reading is the site's gate.

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
| `beginPass` · `screen` | `bindFramebufferInfo(gl, fbo | null)` — a flat call | **the layer's internal `bindTarget`** (§7 #110): the target is recorded, the pass is begun lazily on the next draw on a frame-scoped command encoder, and the encoder is submitted at `endFrame(ctx)` — the host loop's hook, or the application. No public `beginPass`, `screen` or `clear` is published; the flat-call model survives, the block does not leak |
| `clear` | `gl.clear` | the pass's `loadOp: 'clear'` with `clearValue`; `ctx.backend.clear(ctx, color)` is the layer's member the composites call (a state's pair, a pipe's working target), and a figure that needs a cleared target says so through the composites |
| render state (`cullFace`, blend) | raw `gl.*`, per draw | baked into pipelines at `program`; a state flip is a second pipeline, cached by state key |
| depth compare | `LESS`, the platform's, stated once at `createCanvas`; a pass that writes the far plane's depth raises it to `LEQUAL` for itself | a pipeline field: `'less'` unless `opts` names another, `'less-equal'` for a pinned backdrop. WebGPU has **no default to inherit** — the field is required as soon as depth writes are on — so the twin states it at `program`, the same word the WebGL twin states at the context |
| `readPixel` | PBO + fence, self-polling raf | `copyTextureToBuffer` into a `MAP_READ` buffer (`bytesPerRow` padded to 256), `mapAsync`; natively a `Promise` — the reason the surface is async on both. A copy's target is a texture: the canvas is a presentation surface, so a read takes a **target**, in its own pixels, row 0 at the top. A read is ordered after the frame's draws, so it **ends the frame** — one submit per read |
| `pick` | 1×1 target + `mat4Pick`, `paint(id)` → `uColor` | the same on the twin's `readPixel`: a cached 1 × 1 `rgba8unorm` + `depth24plus` target, the projection narrowed onto the query pixel, `paint(id)` through `setUniforms` (one arena slot per object), the camera/state/target/program restored. Query pixels are **logical screen pixels**. The id program is `opts.program` — the figure's own for a mesh, since the pipeline bakes its vertex state — and the default flat one serves the covering quad |
| `hdr` | `decodeRGBE` · `encodeRGBE` re-exported from host, and `loadHDR` fetches and decodes **turning the rows over** — GL's bottom-up space is what a pixel source uploads in, so the result goes straight into `texture` upright | the same three, and `loadHDR` keeps **the file's own rows**: WebGPU's texture space is top-down as a Radiance file is, so the result goes straight into `texture` upright without a turn. `rowOrder: 'BOTTOM_UP'` asks for the reference's order (§7 #119) |
| `upload` | `setTextureFromElement`, `flipY` on for images; `generateMipmap` | `copyExternalImageToTexture`, no flip — WebGPU's texture space is **top-down**, the same as decoded images; raw pixels through `writeTexture` with rows padded to 256 bytes, as a readback's are. A volume (`depth`) or an array (`layers`) uploads a slice at a time; `mips: true` chains through the peer's render pass (WebGPU has no `generateMipmap`); a 3d texture takes no chain. `cubemap`'s six faces are a 6-layer texture's layers, its view a cube's |
| texture orientation | one orientation, GL's bottom-up: images flipped at upload, targets untouched | one orientation, WebGPU's top-down: nothing flipped, targets already top-down. The rule "no flip switch anywhere" holds on both; the *direction* differs, and the default pane UVs follow (`p0` → `(0, 0)`) |
| `fullscreen` `vTexCoord` | bottom-up (`v = 0` at the bottom) | top-down (`v = 0` at the top) — coincidentally p5's `filter` convention. A filter that uses `vTexCoord.y` spatially reads differently on the two bridges; one that only samples `uSource` is unaffected |
| `ndcZMin` | `WEBGL` (−1) | `WEBGPU` (0): every `cameraProj`, `mapLocation`, `mat4Pick`, `frustumCorners` call takes it; nothing else changes |
| framebuffer y | `gl_FragCoord` y-up | `@builtin(position)` y-down; the host's viewport `[0, h, w, −h]` is the same on both (it describes screen space, not the framebuffer) |
| `fragCoord` · the spaces | screen space → window space, device pixels, **bottom-left, y up** | screen space → window space, device pixels, **top-left, y down** — the framebuffer's own row, so no flip: the value is what `readPixel` takes and what a fragment shader's `@builtin(position).xy` reads. The viewport the mappings take is the **canvas's** signed `[0, h, w, −h]`; a target's own is the frame's `[x, y, w, h]` |
| supplied programs | GLSL `flat`, `phong`, the line pipe, the pass-through | WGSL twins of the same four — the one source duplication in the stack, kept to these files |
| HUD | ortho `P`, depth off | the same matrices; depth off is a pipeline variant |
| `dispose` | deletes GL objects | destroys buffers / textures; pipelines are dropped |
| packaging | ESM (twgl.js, tree, host external) + `dist/webgl.tree.umd.cjs`, global `webglTree` with `.tree` · `.host` | **ESM only**: one build, `dist/index.js`, with `webgpu-utils`, tree, host and idiom external — no IIFE bundle and no global, so an example is a module script under an import map (the site's own shape) and `init` is awaited. The script-tag bundle the reference has waits for a public surface a script tag would use |

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

**Read 2026-10-24, with the line pipe and the HUD built.**

- *The pipe.* A scene of axes, a grid, a hermite, a frustum, a track path and a helm rig drew under a
  camera: the generators filled `12 · 44 · 64 · 24 · 132 · 318` vertices, the hermite's midpoint read
  `255 79 217` (its colour) at the mapped pixel, and the track's first keyframe `255 209 102` (its
  own). Two gizmos of one name in one frame do not share a buffer: each draw takes a slot of the
  frame's stream, because `queue.writeBuffer` is ordered with submissions and not inside a command
  buffer.
- *The width.* A 0.5-logical line — one device pixel at a ratio of two — drew through the line list and
  covered two rows (a pixel landing on a row boundary); a 3-logical one covered six through the quads,
  measured as the covered rows of a column through each arm.
- *The HUD.* A cross at logical `(40, 40)` landed at the device pixel `80 80` with its arm reaching
  `110 80` and its end off at `140 80`; a bulls-eye at `(200, 150)` read at `400 300`; and the place
  the mark would sit were y up (`80 280`) was the background — y runs down, as a pointer's does.
- *A finding, fixed.* A depth-off draw into a pass whose target has a depth attachment failed the
  pipeline: WebGPU wants the field stated on every pipeline set on such a pass, so "off" is
  `compare: always` and no write. The twin's `createPipeline` now states it, and its test pins it. The
  stream buffers also had to be created `COPY_DST` — a vertex-only buffer refuses a queue write.

**Read 2026-10-24, with the pane and the two seams built.**

- *The pane.* A 2 × 2 texture on a world-space quad read red, green, blue and white at the pane's
  four quadrants — `p0` at `(0, 0)`, so the image is upright under the twin's top-down sampling — and
  the point outside the quad was the clear colour. The frustum's `nearTexture` face read its solid
  texture at the near plane's centre, and outside the frustum the background.
- *The helm rig's HUD form.* Two composites of one cached 119-pixel target at their logical rects read
  `110 0 0` under a red tint and `0 110 0` under a green one, with the frame outside them black.
- *`identify`.* The rig's six lanes (`L0 L1 L2` twice — the translation arrows and the rotation rings)
  reached the host's label layer as DOM labels, a world anchor each.

**Read 2026-10-24, with the texture shapes built.**

- *Mips.* A 4 × 4 texture whose 2 × 2 quadrants are uniform, `mips: true`, sampled at level 1 read
  `254 1 1`, `1 255 1`, `1 1 255`, `255 255 255` at the level's four texels — the chain is real.
- *Volumes and arrays.* A 2 × 2 × 2 volume of red and green slices read `255 0 0` at z 0.25 and
  `0 255 0` at z 0.75; a 2 × 2 × 2 array of blue and white layers read `0 0 255` and `255 255 255` —
  the dimensions and the views are the shaders' own. A volume asked for `mips` refused the chain and
  said so, its level count still 1.
- *The cube.* Six 1 × 1 faces read by direction: +X `255 0 0`, −X `0 255 0`, +Y `0 0 255`, −Y
  `255 255 0`, +Z `0 255 255`, −Z `255 0 255` — the face order the sources went in by.

**Read 2026-10-24, with the pipeline key's depth and the API site.**

- *The figures are the reference's.* Every doclet's example was rewritten as the reference's figure
  for the same doclet, translated: `createCanvas(400, 300)` is a canvas, `await init` and the device
  ratio `createCanvas` takes; `gl.clear` is `ctx.backend.clear` on a target and `image` of it (a
  WebGPU canvas has no depth attachment, so a 3D scene states its own target, where the reference
  draws into the drawing buffer); the GLSL programs are WGSL twins of the same shaders (a lit cube,
  the id program, the cube map's direction sample, the disc that follows the pointer). The figures
  were read back from their targets: the lit cube's centre `145 45 123`, the cube map's front face
  `79 157 255` (+Z blue), the pane's band `255 209 102` over `255 79 216` — upright. Two figures the
  first pass got wrong were the *example's*, not the function's: `viewFrustum`'s second camera had the
  default near 1 / far 1000, so its frustum was a fan of rays off-screen, and the raw-pixel texture
  was 2 × 2 stretched with clamp-to-edge, whose outer quarter is a solid colour. The reference's own
  framings replaced both (a near-30 / far-200 frustum; a 2 × 2 source on a pane, as the reference
  shows it).
- *Four figure fixes the look found.* `dispose`'s body-click handler named a `canvas` local to
  `start()`, so a click after the tear-down threw `canvas is not defined`; the handler asks only that
  no context is live, and the canvas's own click now stops propagation so a tear-down does not rebuild
  on the same click. `program`'s gradient was flipped against the reference's: the twin's pass samples
  v = 0 at the top and the reference's is bottom-up, so the figure flips v — stated in its comment —
  and green grows upward as the reference's does. `cubemap`'s first camera sat on the +Z axis and saw
  one face; the reference's off-axis one `[126, 105, 168]` shows three, read back as front
  `79 157 255` (+Z), right `255 79 216` (+X) and top white (+Y). `texture`'s 2 × 2 source was blurred and
  flipped against the reference's: its figure now names a nearest sampler from the device and flips v,
  so it reads the reference's picture exactly — yellow top-left and bottom-right, magenta the other
  two corners, hard texels (read back `255 209 102`, `255 79 216`, `255 79 216`, `255 209 102`). The
  twin's defaults stay what the docs say they are, top-down and linear, and the figure's caption names
  the two places the bridges differ by design.
- *The runner's lifecycle.* A re-mounted figure came back blank on scroll-up: the headless
  compositor's instance drop is not the whole story — a WebGPU device made after an earlier one was
  destroyed renders nothing here. A figure is therefore mounted once and hidden when far; a hidden
  iframe's animation is throttled, so the page costs the figure being looked at, and no device is
  made twice.

- *The depth key.* `pipelineKey`'s depth field names the pass's depth — the compare where the state
  asks for the test (`z:less`), the pass's format where it does not (`z:off:depth24plus`), `z:-` for a
  pass with no depth attachment — so a depth-off state never shares a pipeline between a pass with
  depth and one without. The page `testing/depth-probe.html` draws the same program with the test off
  into a target that has depth and one that has none and reads both back: `255 79 217 255` twice with
  this key, `0 0 0 0` for the depth-less pass with the older one, Chromium naming the render pass's
  attachment state against the pipeline's. The suite's own cases pin the three namings and the
  inequality the finding asked for.
- *The site.* `tools/docs` ported: `npm run docs` writes ten pages (the README's, eight modules', the
  search index), 34 doclets and 34 examples — **every doclet's example a figure** — with 0 warnings.
  The structural check is the generator's: every documented name is in the ES build, a function's
  parameters are the ones its own source declares, every example's import resolves under the page's
  map and its named imports are in the build, every fence's language is one the site renders, and a
  `wgsl` fence carries a shader. The browser half mounted all 34 figures in this machine's Chromium
  with `--enable-unsafe-webgpu`, each on a page of its own: the headless compositor drops its WebGPU
  instance when a canvas is first presented, so a page carries one figure per load and a figure that
  reads back reads before it presents (`readPixel`'s and `pick`'s first read do). Each acquired a
  device, drew and logged nothing; the headless canvas remains the known limit, so a figure's pixels
  are still the maintainer's look. The run found two examples of its own on the way: the texture
  example carried the next call's illustrative lines into the code (`data is not defined`), and its
  2 × 2 source stretched with clamp-to-edge showed a solid white quarter — a 16 × 16 ramp that the
  cover rect stretches smooth is the example now. An example that is a call's shape stays supported
  by the parser and the renderer, marked and shown as code; no doclet on the site is one.
- *The composites' pages.* The site now documents what the twin re-exports as well as what it
  declares: `pass` (`fullscreen`, `filter`, `image`, `pipe`, `releasePipe`, the mask and blend
  constants), `target` (`renderTarget`, `SCREEN`) and `state`, in doc-only files under `docs/` — as
  `webgl.tree` documents the surface it re-exports — each figure the reference's own figure for that
  verb, translated. Two of them are the density rule in miniature: `image`'s inset derives its rect
  from the buffer (`20 * canvas.width / canvas.clientWidth`), and the two-target figure splits the
  canvas by `ctx.width / 2`, so both hold at a density of two. 13 pages, 50 doclets, 44 examples.
- *The re-exported namespaces' pages.* The site now documents the two namespaces the twin re-exports,
  on the reference's eight pages — `host`, `host.handles`, `host.tracks`, `tree.camera`,
  `tree.matrices`, `tree.projection`, `tree.quaternions`, `tree.visibility` — ported from the
  reference's doc-only files: 160 doclets, 132 examples, every figure the reference's figure
  translated to the twin, the page names and anchors the reference's (§7 #116). The prose is the
  reference's except where it names the reference's own context: `setCamera(gl, cam)` reads
  `setCamera(ctx, cam)`, "the layout WebGL uploads" is WebGPU's, and `cameraProj`'s `ndcYSign`
  paragraph states the fourth argument as the y sign rather than the depth constant the twin drops.
  The validator grew the reference's owner-scope branch — a doclet owned by a namespace is checked
  through `owners`, an ES module namespace exports its members as getters so the value is read
  through the descriptor, and a factory's methods are read off its source with the prototype chain
  walked — while the bridge's own doclets keep the flat check. 22 pages, 213 doclets, 179 examples,
  0 warnings, `hdr` among them (§7 #119). The examples' gate mounts all 180 figures — the 179 doclets'
  and the index page's demo —
  at device scale factors 1 and 2: 354 mounts, 0 failures, the four camera figures' denial allowed by
  name since a headless browser has no camera, and three after-present figures tolerated by name. The
  harness fails a run that judges nothing: it had matched no figure at all, and its first
  `{"failures": 0}` was a pass over zero mounts. The figures'
  pictures remain the maintainer's look: this Chromium composites no WebGPU canvas, so a screenshot of
  one is black — the existing checker figure's own included — and the headless evidence is a readback
  before the present.
- *The line pipe's topology.* The site's first figures showed the axes as a filled gradient triangle
  with a stray arm. WebGPU bakes the topology into the pipeline and the pipe never stated its own, so
  every gizmo's line list went through a `triangle-list` pipeline built from the ambient state; the
  offscreen proofs of S7 read single pixels and were satisfied by the fragments a triangle covers. The
  pipe now sets `line-list` with the depth it already saves and restores — and `triangle-list` for the
  expanded quads, the handle's dot and the pane. A readback of a HUD cross from a target counts 119 lit
  pixels (a line's worth, two 121-pixel arms) and 154 for the axes, where the triangles had covered
  thousands.
- *The WGSL fence.* A doc comment reads a line that begins with `@` as a tag, and a shader stage's
  attribute is one, so an example's WGSL is written between fence lines (` ```wgsl ` … ` ``` `) inside
  its template literal. The parser drops the fence lines: the example's code is the same text without
  them, so the page shows valid JS and the shader inside it.
