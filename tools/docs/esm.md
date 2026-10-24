## ES modules

The package ships one build, `dist/index.js`, an ES module; `webgpu-utils`, `@nakednous/tree`,
`@nakednous/host` and `@nakednous/idiom` stay external, so each loads once beside the
application's own imports. With a bundler, install them all:

```bash
npm install webgpu.tree webgpu-utils @nakednous/tree @nakednous/host @nakednous/idiom
```

Without one, an import map resolves them:

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

`init` is a promise — WebGPU's adapter and device are asked for asynchronously — so every
example awaits it, and an example's first line is its import. A shader is WGSL, and WGSL has
no include: `program(ctx, wgsl, opts)` compiles the twin's vertex stage concatenated with the
caller's fragment source, one module with two entry points.

<!-- caption: A fullscreen pass a frame, and the submit at the frame's end — the twin's shortest frame. -->
```js
import { init, endFrame, filter, program } from 'webgpu.tree'

const canvas = document.body.appendChild(document.createElement('canvas'))
canvas.style.width = '400px'
canvas.style.height = '300px'
const ctx = await init(canvas, { width: 400, height: 300 })

const gradient = program(ctx, `
@fragment
fn fs(@location(0) vTexCoord: vec2f) -> @location(0) vec4f {
  return vec4f(vTexCoord, 0.5, 1.0);
}`)

function frame() {
  filter(ctx, gradient)     // a pass over the bound target, the canvas
  endFrame(ctx)             // the frame's command buffer, submitted
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

The canvas's pixels are the compositor's: a figure that needs to read its own frame draws
into a `renderTarget` and shows it with `image`, as the pages below do.
