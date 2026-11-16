/**
 * @file Renderer — module + doclet tables → static HTML (one page per module,
 * README as the landing page).
 * @module tools/docs/renderer
 * @license AGPL-3.0-only
 *
 * Every URL this file makes up is relative, so the site serves unchanged under
 * a base path; the references it carries — the stack's repositories, CodeMirror
 * — are absolute. Types render verbatim — nothing here parses a type expression.
 *
 * An example is one of two things, and the page says which. A **runnable** one
 * is a module script (it imports from `webgpu.tree`): the page mounts it in an
 * editor and a stage, and it runs under the page's import map. A **fragment**
 * shows a call's shape with the setting given in prose: no editor, no stage, no
 * Run — a code block, because nothing would run it. `tools/docs/esm.md`'s own
 * fence is the index page's live demo.
 */

import { Marked } from 'marked';
import { splitFences, linkTable, pageOf, anchorOf } from './validator.js';
import { codemirror, site, namespaces, packageRefUrl } from './config.js';

const LINK_RE = /\{@link\s+([^}\s]+)\s*\}/g;
// A backticked identifier in prose — `setCamera`, `update()`,
// `draw(ctx, obj, M)` — that is not already a link's text: the name resolves,
// the argument list stays part of the code span.
const CODE_RE = /(^|[^[`\\])`((?:[\w$]+\.)*[\w$]+)((?:\([^`]*\))?)`/g;
// A package named in prose — `@nakednous/idiom`, backticked or bare — that is not
// already a link's text.
const PKG_CODE_RE = /(^|[^[`\\])`(@nakednous\/[\w.-]+)`/g;
const PKG_RE      = /(^|[\s(])(@nakednous\/[\w.-]+)(?![\w/.-])/g;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** GitHub-style heading slug — the README's own TOC links depend on it. */
const slug = (s) => s.toLowerCase().replace(/[^\w\- ]+/g, '').replace(/ /g, '-');

const marked = new Marked({
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      const text = this.parser.parseInline(tokens, this.parser.textRenderer);
      return `<h${depth} id="${slug(text)}">${html}</h${depth}>\n`;
    },
  },
});

// ── Addresses ───────────────────────────────────────────────────────────────

// A module with no page of its own — the package's root — keeps its address.
const hrefOf = (entry) => entry.module
  ? (packageRefUrl(entry.module.name) ?? pageOf(entry.module.name))
  : `${pageOf(entry.doclet.module)}#${anchorOf(entry.doclet)}`;

/**
 * A name as a markdown link: to its page when documented, to its repository
 * when it names a package, else plain code. `prefer` wins over the table for a
 * name several owners share.
 */
function linkTo(name, call, table, prefer) {
  const entry = prefer?.get(name) ?? table.get(name);
  const code = `\`${name}${call}\``;
  if (entry) return `[${code}](${hrefOf(entry)})`;
  const href = packageRefUrl(name);
  return href ? `[\`${name}${call}\`](${href})` : code;
}

/**
 * Links in prose, fenced code left untouched: `{@link name}` becomes a link to
 * the documented name, and so does any backticked identifier that resolves the
 * same way — with or without a trailing `()`. A bare name shared by several
 * owners stays plain code unless written as `Owner.name`, or unless `prefer`
 * names the owner the page reads it as. A package named in prose links to its
 * repository.
 */
function resolveLinks(text, table, prefer) {
  return splitFences(text).map((seg, i) => i % 2 ? seg : seg
    .replace(LINK_RE, (_, name) => linkTo(name, '', table, prefer))
    .replace(CODE_RE, (all, pre, name, call) =>
      (table.ambiguous.has(name) && !prefer?.has(name)) ? all : pre + linkTo(name, call || '', table, prefer))
    .replace(PKG_CODE_RE, (_, pre, name) => `${pre}[\`${name}\`](${packageRefUrl(name)})`)
    .replace(PKG_RE, (_, pre, name) => `${pre}[${name}](${packageRefUrl(name)})`)).join('');
}

/**
 * The owner the README reads a bare ambiguous name as: the bridge's own, when
 * exactly one of its modules documents it. The README is the bridge's index
 * page, so a `bind` there is the draw page's `bind`, not a name another module
 * documents too.
 * @param {Array<Object>} doclets
 * @param {Set<string>} ambiguous
 * @returns {Map<string, Object>} name → link-table entry
 */
function indexOwners(doclets, ambiguous) {
  const own = new Map();
  for (const d of doclets) {
    if (!ambiguous.has(d.name) || !String(d.owner).startsWith('webgpu.tree/')) continue;
    own.set(d.name, own.has(d.name) ? null : { doclet: d });
  }
  return new Map([...own].filter(([, entry]) => entry));
}

/** Bare names several owners share: auto-links leave them alone. */
function ambiguousNames(doclets) {
  const owners = new Map();
  for (const d of doclets) {
    if (!owners.has(d.name)) owners.set(d.name, new Set());
    owners.get(d.name).add(d.owner);
  }
  return new Set([...owners].filter(([, s]) => s.size > 1).map(([n]) => n));
}

const md       = (text, table) => text ? marked.parse(resolveLinks(text, table)) : '';
const mdInline = (text, table) => text ? marked.parseInline(resolveLinks(text, table)) : '';

// ── Fragments ───────────────────────────────────────────────────────────────

const type = (t) => t ? `<code class="type">${esc(t)}</code>` : '';

/** A name as the reader writes it: `tree.mat4Mul` for a namespace owner, else bare. */
const qualified = (d) => (namespaces.includes(d.owner) ? `${d.owner}.${d.name}` : d.name);

function signature(d) {
  const list = d.params.map((p) => (p.optional ? `[${p.name}]` : p.name)).join(', ');
  return `${esc(qualified(d))}(${esc(list)})`;
}

function fieldRows(rows, table, depth = 0) {
  return rows.map((r) => `
      <tr class="depth-${depth}">
        <td><code>${esc(r.name)}</code>${r.optional ? ' <span class="opt">optional</span>' : ''}</td>
        <td>${type(r.type)}</td>
        <td>${r.default != null ? `<code>${esc(r.default)}</code>` : ''}</td>
        <td>${mdInline(r.description, table)}</td>
      </tr>${fieldRows(r.children, table, depth + 1)}`).join('');
}

function fieldTable(rows, table, caption) {
  if (!rows.length) return '';
  return `
    <table class="fields">
      <thead><tr><th>${caption}</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
      <tbody>${fieldRows(rows, table)}
      </tbody>
    </table>`;
}

/**
 * An example: a runnable one is an editor and a live stage; a fragment is the
 * code alone. The renderer states which, so the page never offers a Run on
 * something that cannot run.
 */
function example(ex, id, i) {
  const eid = `${id}-example-${i + 1}`;
  if (!ex.runnable) {
    return `
    <figure class="example fragment" id="${esc(eid)}">
      ${ex.caption ? `<figcaption>${esc(ex.caption)}</figcaption>` : ''}
      <pre><code class="language-js">${esc(ex.code)}</code></pre>
    </figure>`;
  }
  return `
    <figure class="example" id="${esc(eid)}" data-mode="module">
      ${ex.caption ? `<figcaption>${esc(ex.caption)}</figcaption>` : ''}
      <div class="editor"><textarea class="source" spellcheck="false" aria-label="sketch source">${esc(ex.code)}</textarea></div>
      <div class="stage" data-stage></div>
      <div class="toolbar">
        <button type="button" data-run>Run</button>
        <button type="button" data-reset>Reset</button>
      </div>
    </figure>`;
}

function functionDoclet(d, table) {
  const id = anchorOf(d);
  return `
  <article class="doclet function" id="${esc(id)}">
    <h3><a class="anchor" href="#${esc(id)}"><code>${signature(d)}</code></a></h3>
    <div class="description">${md(d.description, table)}</div>
    ${fieldTable(d.params, table, 'Parameter')}
    ${d.returns ? `<p class="returns"><strong>Returns</strong> ${type(d.returns.type)} ${mdInline(d.returns.description, table)}</p>` : ''}
    ${d.examples.length ? `<div class="examples">${d.examples.map((ex, i) => example(ex, id, i)).join('')}</div>` : ''}
  </article>`;
}

function typedefDoclet(d, table) {
  const id = anchorOf(d);
  return `
  <article class="doclet typedef" id="${esc(id)}">
    <h3><a class="anchor" href="#${esc(id)}"><code>${esc(d.name)}</code></a> ${type(d.type)}</h3>
    <div class="description">${md(d.description || d.tagDescription, table)}</div>
    ${fieldTable(d.properties, table, 'Property')}
  </article>`;
}

function constantsTable(list, table) {
  return `
  <table class="constants">
    <thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead>
    <tbody>${list.map((d) => `
      <tr id="${esc(anchorOf(d))}">
        <td><a class="anchor" href="#${esc(anchorOf(d))}"><code>${esc(qualified(d))}</code></a></td>
        <td>${type(d.type)}</td>
        <td>${mdInline(d.description || d.tagDescription, table)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

/** An owner's section; the module's own members need no heading under its title. */
function ownerSection(owner, list, table, module) {
  const consts = list.filter((d) => d.kind === 'constant');
  const rest   = list.filter((d) => d.kind !== 'constant');
  return `
  <section class="owner" id="${esc(owner)}">
    ${owner === module || namespaces.includes(owner) ? '' : `<h2>${esc(owner)}</h2>`}
    ${consts.length ? constantsTable(consts, table) : ''}
    ${rest.map((d) => (d.kind === 'typedef' ? typedefDoclet(d, table) : functionDoclet(d, table))).join('')}
  </section>`;
}

// ── Page shell ──────────────────────────────────────────────────────────────

// ── The theme switch ────────────────────────────────────────────────────────

/** The stored choice, applied before the first paint so no page flashes. */
const boot = `(function(){try{
  var d=document.documentElement,s=localStorage.getItem('docs-theme')||'system',
      m=window.matchMedia('(prefers-color-scheme: dark)').matches,
      n=window.matchMedia('(max-width: 900px)').matches,
      r=localStorage.getItem(n?'docs-nav':'docs-rail');
  d.dataset.themeChoice=(s==='light'||s==='dark')?s:'system';
  d.dataset.theme=(s==='light'||s==='dark')?s:(m?'dark':'light');
  if(r==='collapsed'||r==='expanded')d.dataset.rail=r;
}catch(e){}})();`;

/** The picker: a button, and the three choices it opens. */
const themeControl = (extra = '') => `
      <div class="theme-switch${extra ? ' ' + extra : ''}">
        <button class="theme-toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Change theme">
          <svg class="i i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="i i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>
          <svg class="i i-auto" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>
          <span class="theme-label">System</span>
        </button>
        <div class="theme-menu" role="menu" hidden>
          <button type="button" role="menuitemradio" data-theme-choice="light" aria-checked="false"><span>Light</span><span class="tick" aria-hidden="true">✓</span></button>
          <button type="button" role="menuitemradio" data-theme-choice="dark" aria-checked="false"><span>Dark</span><span class="tick" aria-hidden="true">✓</span></button>
          <button type="button" role="menuitemradio" data-theme-choice="system" aria-checked="true"><span>System</span><span class="tick" aria-hidden="true">✓</span></button>
        </div>
      </div>`;

function shell({ title, active, body, nav, pkg, examples, imports, pager = '' }) {
  const cm = examples ? `
  <link rel="stylesheet" href="${codemirror.css}">
  ${codemirror.js.map((u) => `<script src="${u}"></script>`).join('\n  ')}` : '';
  const cfg = { imports, index: site.index };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>${boot}</script>
  <title>${esc(title)} — ${esc(pkg.name)}</title>
  <link rel="icon" sizes="32x32" href="${site.favicon32}">
  <link rel="icon" sizes="128x128" href="${site.favicon128}">
  <link rel="stylesheet" href="${site.style}">${cm}
  <script>window.webgpuTreeDocs = ${JSON.stringify(cfg)};</script>
  <script src="${site.runner}" defer></script>
  <script src="${site.search}" defer></script>
  <script src="${site.chrome}" defer></script>
</head>
<body>
  <button class="rail-reopen" type="button" data-rail-toggle aria-controls="site-sidebar" aria-expanded="false" aria-label="Show the navigation">☰</button>
  <nav class="sidebar" id="site-sidebar" aria-label="Documentation">
    <div class="side-head">
      <a class="brand" href="index.html">${esc(pkg.name)}</a>
      <span class="version">v${esc(pkg.version)}</span>
      ${themeControl('head-theme')}
      <button class="rail-toggle" type="button" data-rail-toggle aria-controls="site-sidebar" aria-expanded="true" aria-label="Hide the navigation">«</button>
    </div>
    <input class="search" type="search" placeholder="Search…" aria-label="Search the API" autocomplete="off">
    <div class="side-nav" id="site-nav">
      <ul class="modules">${nav.map((n) => `
        <li><a href="${n.href}"${n.href === active ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('')}
      </ul>
      <ul class="results" hidden></ul>
    </div>
    <div class="side-foot">${themeControl()}
    </div>
  </nav>
  <main>
${body}${pager}
    <footer>${esc(pkg.name)} v${esc(pkg.version)} · ${esc(pkg.license ?? '')}</footer>
  </main>
</body>
</html>
`;
}

// ── ES modules section ──────────────────────────────────────────────────────

const DEMO_RE    = /```js\n([\s\S]*?)```\n?/;
const CAPTION_RE = /<!--\s*caption:\s*([\s\S]*?)\s*-->\n?/;

/**
 * The index page's ES modules section: the markdown of tools/docs/esm.md, its
 * one ```js fence lifted out as the live module demo placed where the fence
 * was. The twin's site is ESM-only, so that demo is also every example's shape.
 */
function esmSection(text) {
  const demo = DEMO_RE.exec(text);
  if (!demo) return `    <section class="esm">${marked.parse(text)}</section>`;
  const caption = CAPTION_RE.exec(text);
  const [before, after] = text.replace(CAPTION_RE, '').split(demo[0]);
  const figure = example({ caption: caption ? caption[1] : null, code: demo[1], runnable: true }, 'es-modules', 0);
  return `    <section class="esm">${marked.parse(before)}<div class="examples">${figure}</div>${marked.parse(after || '')}</section>`;
}

// ── Search index ────────────────────────────────────────────────────────────

/** The first sentence of a description, markdown stripped to plain text. */
function firstSentence(text) {
  const plain = (text || '').replace(/\{@link\s+([^}\s]+)\s*\}/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(plain);
  return m ? m[1] : plain;
}

/** One entry per function and constant: name, owner, page#anchor, first sentence. */
function searchIndex(doclets) {
  return doclets.map((d) => ({
    n: d.name,
    o: d.owner,
    h: `${pageOf(d.module)}#${anchorOf(d)}`,
    s: firstSentence(d.description || d.tagDescription),
  }));
}

// ── Entry ───────────────────────────────────────────────────────────────────

/**
 * @param {{ modules, doclets }} parsed
 * @param {{ pkg: Object, readme: string, esm: string, imports: Object }} ctx
 * @returns {Map<string, string>} filename → HTML
 */
export function render(parsed, { pkg, readme, esm, imports }) {
  const table = linkTable(parsed);
  table.ambiguous = ambiguousNames(parsed.doclets);
  const prefer = indexOwners(parsed.doclets, table.ambiguous);
  const pages = new Map();

  // Modules with at least one public doclet, in source order.
  const byModule = new Map();
  for (const d of parsed.doclets) {
    if (!byModule.has(d.module)) byModule.set(d.module, []);
    byModule.get(d.module).push(d);
  }
  const modules = parsed.modules.filter((m) => byModule.has(m.name));
  const nav = modules.map((m) => ({ href: pageOf(m.name), label: m.name.slice(m.name.lastIndexOf('/') + 1) }));

  pages.set(site.index, JSON.stringify(searchIndex(parsed.doclets)));

  pages.set('index.html', shell({
    title: 'README', active: 'index.html', nav, pkg, imports, examples: true,
    body: `    <article class="readme">${marked.parse(resolveLinks(readme, table, prefer))}</article>\n${esmSection(esm)}`,
  }));

  const pagerOf = (i) => {
    const back = i > 0 ? nav[i - 1] : null;
    const fwd = i < nav.length - 1 ? nav[i + 1] : null;
    if (!back && !fwd) return '';
    return `
    <nav class="pager" aria-label="Previous and next page">
      ${back ? `<a class="back" href="${back.href}">← ${esc(back.label)}</a>` : '<span></span>'}
      ${fwd ? `<a class="fwd" href="${fwd.href}">${esc(fwd.label)} →</a>` : '<span></span>'}
    </nav>`;
  };

  modules.forEach((m, i) => {
    const list = byModule.get(m.name);
    // Owners in order of first appearance.
    const owners = [...new Set(list.map((d) => d.owner))];
    const body = `
    <header class="module">
      <h1>${esc(m.name)}</h1>
      ${m.title ? `<p class="lead">${mdInline(m.title, table)}</p>` : ''}
      <div class="description">${md(m.description, table)}</div>
    </header>
    ${owners.map((o) => ownerSection(o, list.filter((d) => d.owner === o), table, m.name)).join('')}`;
    pages.set(pageOf(m.name), shell({
      title: m.name, active: pageOf(m.name), nav, pkg, imports, pager: pagerOf(i),
      examples: list.some((d) => d.examples.some((ex) => ex.runnable)),
      body,
    }));
  });

  return pages;
}
