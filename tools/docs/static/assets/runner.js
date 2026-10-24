/**
 * @file Example runner — an editable code box and a live WebGPU canvas per
 * runnable `@example`, with a viewport-driven iframe lifecycle.
 * @license AGPL-3.0-only
 *
 * Classic deferred script on every page; no-op where there are no examples.
 * Config arrives in `window.webgpuTreeDocs` ({ imports, index }); markup is the
 * renderer's runnable figure (`textarea.source`, `[data-stage]`, `[data-run]`,
 * `[data-reset]`). A fragment is not this figure and is never mounted.
 *
 * - Editor: CodeMirror 5 over the source textarea; the bare textarea is the
 *   fallback when CodeMirror is absent.
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
 * - Lifecycle: an IntersectionObserver mounts an iframe as its figure nears
 *   the viewport and unmounts it once far off-screen; at most LIVE_MAX are
 *   live at once, least recently neared out first. Unmounting loses the frame
 *   and with it the WebGPU device, which the context's dispose owns otherwise.
 */

(function () {
  'use strict';

  const cfg     = window.webgpuTreeDocs;
  const figures = document.querySelectorAll('figure.example[data-mode="module"]');
  if (!cfg || !figures.length) return;

  const LIVE_MAX = 8;
  const NEAR     = '300px 0px';   // mount when the figure is within this margin of the viewport
  const FAR      = '1500px 0px';  // unmount once it is beyond this margin
  const STAGE_BG = '#0a0a0e';     // fixed stage — never the page theme

  const attr = (s) => String(s).replace(/"/g, '&quot;');

  /** The iframe document: the import map, the error sink, then the example. */
  function srcdoc(code) {
    return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
html,body{margin:0;overflow:hidden;background:${STAGE_BG};color:#d8dee9;font:12px/1.45 ui-monospace,monospace}
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

  function editorOf(textarea, run) {
    if (!window.CodeMirror) return null;
    return window.CodeMirror.fromTextArea(textarea, {
      mode:           'javascript',
      lineNumbers:    true,
      indentUnit:     2,
      tabSize:        2,
      viewportMargin: Infinity,   // render every line — the box grows to fit the sketch
      extraKeys:      { 'Ctrl-Enter': run, 'Cmd-Enter': run },
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  const runners = new Map();   // figure → runner
  const live    = [];          // mounted runners, least recently neared first

  const code = (r) => (r.editor ? r.editor.getValue() : r.textarea.value);

  function unmount(r) {
    if (!r.frame) return;
    r.frame.remove();
    r.frame = null;
    const i = live.indexOf(r);
    if (i >= 0) live.splice(i, 1);
  }

  function mount(r) {
    unmount(r);
    while (live.length >= LIVE_MAX) unmount(live[0]);
    const f = document.createElement('iframe');
    f.className = 'sketch';
    f.title     = r.title;
    f.srcdoc = srcdoc(code(r));
    r.stage.replaceChildren(f);
    r.frame = f;
    live.push(r);
  }

  function touch(r) {
    const i = live.indexOf(r);
    if (i >= 0) live.push(...live.splice(i, 1));
  }

  const near = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const r = runners.get(e.target);
      r.frame ? touch(r) : mount(r);
    }
  }, { rootMargin: NEAR });

  const far = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) unmount(runners.get(e.target));
    }
  }, { rootMargin: FAR });

  // ── Wire every runnable example ───────────────────────────────────────────

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
    const run   = () => mount(r);
    const reset = () => (r.editor ? r.editor.setValue(r.source) : (textarea.value = r.source));

    r.editor = editorOf(textarea, run);
    figure.querySelector('[data-run]')?.addEventListener('click', run);
    figure.querySelector('[data-reset]')?.addEventListener('click', reset);

    runners.set(figure, r);
    near.observe(figure);
    far.observe(figure);
  }
})();
