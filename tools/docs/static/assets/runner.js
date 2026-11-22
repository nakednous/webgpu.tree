/**
 * @file Example runner — an editable code box and a live WebGPU canvas per
 * `@example`, with a viewport-driven iframe lifecycle.
 * @license AGPL-3.0-only
 *
 * ES module on every page; no-op where there are no examples. The page's
 * configuration is the `application/json` block `#docs-config`
 * ({ imports, index, editor }); the markup is the renderer's
 * `figure.example` (`textarea.source`, `[data-stage]`, `[data-run]`,
 * `[data-reset]`).
 *
 * - Editor: the package's `mountEditor` over the source textarea, imported with
 *   a dynamic `import()` on a page that has one — a page without examples never
 *   asks for the bundle. Until the mount succeeds the textarea is the carrier:
 *   Run and Reset work from it, an edit made while the import is in flight is
 *   kept, and a failed import or mount leaves the textarea in place and marks
 *   the figure `data-editor="fallback"`.
 * - Canvas: a same-origin `srcdoc` iframe, unsandboxed (the examples are the
 *   site's own code). The site is ESM-only, so the frame carries an import map —
 *   `webgpu.tree` and the stack's packages to the site's own builds of the same
 *   commit, `webgpu-utils` to the pinned CDN module — and the box runs as a
 *   module script: its first line is its import, and its `init` is awaited.
 *   `srcdoc` inherits the page's base URL, so site-local files resolve
 *   relatively. A rejected promise or a thrown error is written into the frame,
 *   because a frame has no console the reader sees — WebGPU's own validation
 *   messages stay in the browser's console.
 * - Run reassembles the iframe from the box; Reset restores the source text.
 *   Edits are page-local — nothing persists.
 * - Lifecycle: an IntersectionObserver mounts a figure's iframe as it nears the
 *   viewport and **hides** it once far off-screen — the frame and its WebGPU
 *   device stay, because a device made after an earlier one was destroyed
 *   renders nothing here (a re-mounted figure came back blank on scroll-up).
 *   A hidden iframe's requestAnimationFrame is throttled, so a page of figures
 *   costs the one being looked at; a figure is mounted once and shown again
 *   when it returns.
 */

const NEAR     = '300px 0px';   // mount when the figure is within this margin of the viewport
const FAR      = '1500px 0px';  // hide once it is beyond this margin

const attr = (s) => String(s).replace(/"/g, '&quot;');

/**
 * The stage's colour, read from the page's own `--stage`: the sheet states it
 * once, for the box the figure shows and for the frame's backdrop, so the
 * frame never flashes a colour the sketch is not about to paint. It is fixed —
 * never the page theme — and it is the colour every example clears to.
 */
function stageColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim();
  return value || '#0a0a0e';
}

/** The page's configuration: read once from the JSON block, or null. */
function readConfig() {
  const block = document.getElementById('docs-config');
  if (!block) return null;
  try {
    return JSON.parse(block.textContent);
  } catch (_) {
    return null;
  }
}

/** The iframe document: the import map, the error sink, then the example. */
function srcdoc(cfg, code, stage) {
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;overflow:hidden;background:${stage};color:#d8dee9;font:12px/1.45 ui-monospace,monospace}
canvas{display:block;max-width:100%}
pre{margin:0;padding:.6rem;white-space:pre-wrap}
pre.error{color:#e06c75}
</style>
<script type="importmap">${JSON.stringify({ imports: cfg.imports })}</script>
</head><body>
<script>
  const show = (m) => {
    const p = document.createElement('pre')
    p.className = 'error'
    p.textContent = String(m)
    document.body.appendChild(p)
  }
  addEventListener('error', (e) => show(e.message))
  addEventListener('unhandledrejection', (e) => show(e.reason && e.reason.message || e.reason))
<\/script>
<script type="module">
${code.replace(/<\/(script)/gi, '<\\/$1')}
<\/script>
</body></html>`;
}

function start(cfg) {
  const figures = document.querySelectorAll('figure.example');
  if (!figures.length) return;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  const runners = new Map();   // figure → runner

  const code = (r) => (r.editor ? r.editor.getValue() : r.textarea.value);

  function mount(r) {
    if (r.frame) { r.frame.style.display = ''; return; }
    const f = document.createElement('iframe');
    f.className = 'sketch';
    f.title     = r.title;
    f.srcdoc = srcdoc(cfg, code(r), stageColor());
    r.stage.replaceChildren(f);
    r.frame = f;
  }

  function hide(r) {
    if (r.frame) r.frame.style.display = 'none';   // the device and its loop stay
  }

  function run(r) {
    // Run rebuilds the frame from the box: the one way a device is made again
    if (r.frame) { r.frame.remove(); r.frame = null; }
    mount(r);
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      mount(runners.get(e.target));
    }
  }, { rootMargin: NEAR });

  const far = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) hide(runners.get(e.target));
    }
  }, { rootMargin: FAR });

  // ── The editor, where there is one to mount ───────────────────────────────

  /**
   * Import the bundle once and mount every box. The textarea has been carrying
   * Run and Reset until now: the import is started after the wiring, and its
   * failure is the fallback, not an unhandled rejection.
   */
  async function mountEditors() {
    let mountEditor;
    try {
      ({ mountEditor } = await import(new URL(cfg.editor, document.baseURI).href));
    } catch (_) {
      for (const r of runners.values()) r.figure.dataset.editor = 'fallback';
      return;
    }
    for (const r of runners.values()) {
      try {
        r.editor = mountEditor(r.textarea, { value: r.source, onRun: () => run(r), wrap: false });
      } catch (_) {
        r.editor = null;
        r.figure.dataset.editor = 'fallback';
      }
      // The adapter handles a mount failure itself and hands back the textarea's
      // verbs; its marker is the one to carry up to the figure.
      if (r.textarea.dataset.editor === 'fallback') r.figure.dataset.editor = 'fallback';
    }
  }

  // ── Wire every example ────────────────────────────────────────────────────

  for (const figure of figures) {
    const textarea = figure.querySelector('textarea.source');
    const stage    = figure.querySelector('[data-stage]');
    if (!textarea || !stage) continue;

    const r = {
      figure, stage, textarea,
      source: textarea.value,
      title:  figure.querySelector('figcaption')?.textContent.trim() || figure.id,
      editor: null,
      frame:  null,
    };
    // `run` is the frame's own rebuild below; the click handlers are named apart
    // from it, or the arrow would call itself instead of rebuilding the frame.
    const onRun = () => run(r);
    const reset = () => (r.editor ? r.editor.reset() : (textarea.value = r.source));

    runners.set(figure, r);
    near.observe(figure);
    far.observe(figure);

    figure.querySelector('[data-run]')?.addEventListener('click', onRun);
    figure.querySelector('[data-reset]')?.addEventListener('click', reset);
  }

  mountEditors();
}

const config = readConfig();
if (config) start(config);
