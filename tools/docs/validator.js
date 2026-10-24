/**
 * @file Validator — the doclet table against the closed tag vocabulary, the
 * build, and the examples' own rule.
 * @module tools/docs/validator
 * @license AGPL-3.0-only
 *
 * Errors fail the build; warnings print and continue. The site is ESM-only, so
 * the checks differ from the reference's in three places: a documented name is
 * looked up in the ES build's namespace (not a script-tag global), an
 * example's `import` is resolved against the page's import map and its named
 * imports against that namespace, and a fence's language is checked because a
 * WGSL block is the twin's one new kind of code on a page.
 */

import { aliases, packages, paths, SITE_URL, importMap } from './config.js';

const VOCABULARY = new Set([
  'file', 'module', 'license',
  'function', 'memberof',
  'param', 'returns',
  'constant',
  'typedef', 'property',
  'example',
  'details',
]);

/** The fence languages the site's pages use: the twin shows WGSL, not GLSL. */
const LANGUAGES = new Set(['js', 'bash', 'html', 'json', 'wgsl']);

const LINK_RE   = /\{@link\s+([^}\s]+)\s*\}/g;
const IMPORT_RE = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/gm;
const NAMED_RE  = /^\{([\s\S]*)\}$/;

/** Split markdown into [text, fence, text, fence, …] so links inside fenced code are left alone. */
export function splitFences(md) {
  return md.split(/(```[\s\S]*?```)/g);
}

/** The opening fence's language, or null for a fence with none. @ignore */
function languageOf(fence) {
  const line = fence.split('\n', 1)[0].slice(3).trim();
  return line ? line.split(/\s+/, 1)[0] : null;
}

/** `webgpu.tree/gizmo` → `gizmo.html`; a bare `webgpu.tree` → `webgpu.tree.html`. */
export function pageOf(moduleName) {
  const i = moduleName.lastIndexOf('/');
  return (i < 0 ? moduleName : moduleName.slice(i + 1)) + '.html';
}

/** A doclet's anchor: the owner-qualified name, as the renderer writes it. */
export const anchorOf = (d) => `${d.owner}.${d.name}`;

/** Every absolute API-site target the README carries — inline or reference-style — and its line. */
function readmeTargets(md) {
  const out = new Map();
  md.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) out.set(m[1], i + 1);
    const ref = /^\[[^\]]+\]:\s*(\S+)$/.exec(text);
    if (ref) out.set(ref[1], i + 1);
  });
  return [...out].filter(([url]) => url.startsWith(SITE_URL) && url.length > SITE_URL.length);
}

/** Every `{@link name}` target in a markdown string, fenced code excluded. */
function linkTargets(md) {
  const out = [];
  splitFences(md).forEach((seg, i) => {
    if (i % 2) return;
    for (const m of seg.matchAll(LINK_RE)) out.push(m[1]);
  });
  return out;
}

function* fields(rows) {
  for (const r of rows) { yield r; yield* fields(r.children); }
}

/** Every free-text field of a doclet that may carry `{@link}` or a fence. */
function* texts(d) {
  yield d.description;
  yield d.tagDescription;
  if (d.returns) yield d.returns.description;
  for (const f of fields(d.params))     yield f.description;
  for (const f of fields(d.properties)) yield f.description;
}

/**
 * Build the link table: `owner.name`, bare `name` (first wins), and module
 * names.
 * @returns {Map<string, Object>}
 */
export function linkTable({ modules, doclets }) {
  const table = new Map();
  for (const m of modules) table.set(m.name, { module: m });
  for (const d of doclets) table.set(`${d.owner}.${d.name}`, { doclet: d });
  for (const d of doclets) if (!table.has(d.name)) table.set(d.name, { doclet: d });
  for (const [cls, factory] of Object.entries(aliases)) {
    if (!table.has(cls) && table.has(factory)) table.set(cls, table.get(factory));
  }
  return table;
}

/**
 * The parameter names a function's source declares, in order: defaults
 * dropped, a rest parameter by its name, a destructured one as null (not
 * compared). Reads a declaration, a method or an arrow.
 * @param {string} src
 * @returns {Array<string|null>}
 */
export function paramNames(src) {
  const s = String(src).trimStart();
  const bare = /^(?:async\s+)?([\w$]+)\s*=>/.exec(s);
  if (bare) return [bare[1]];
  const out = [];
  let depth = 0, cur = '';
  for (let k = s.indexOf('(') + 1; k > 0 && k < s.length; k++) {
    const c = s[k];
    if (c === ')' && depth === 0) break;
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => {
    const name = p.trim().replace(/^\.\.\./, '');
    return /^[{[]/.test(name) ? null : name.split('=')[0].trim();
  });
}

/** The names one `import` clause brings in, or null where it is a default or a namespace form. @ignore */
function importedNames(clause) {
  const named = NAMED_RE.exec(clause.trim());
  if (!named) return null;
  return named[1].split(',').map((item) => item.trim().split(/\s+as\s+/).pop()).filter(Boolean);
}

/** The imports an example's code declares: `{ clause, specifier }` each. @ignore */
function importsOf(code) {
  const out = [];
  for (const m of code.matchAll(IMPORT_RE)) out.push({ clause: m[1] || null, specifier: m[2] });
  return out;
}

/**
 * @param {{ modules, doclets, blocks }} parsed
 * @param {{ api?: object, readme?: string, esm?: string }} [ctx]  api: the ES build's
 *   namespace; readme / esm: the markdown whose fences and site links are checked.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validate(parsed, { api, readme, esm } = {}) {
  const { modules, doclets, blocks } = parsed;
  const errors = [], warnings = [];
  const at   = (x) => `${x.file}:${x.line}`;
  const fail = (x, msg) => errors.push(`${at(x)}  ${msg}`);
  const warn = (x, msg) => warnings.push(`${at(x)}  ${msg}`);

  // Vocabulary — public blocks and module headers only; internal blocks are ignored.
  for (const b of blocks) {
    if (!b.public && !b.module) {
      // an `@ignore` block is deliberately internal — the bridge's own seams and
      // their illustrations — so its tags are its own; anything else is a block
      // that meant to be on the site and is not.
      if (!b.tags.includes('ignore') && (b.tags.includes('memberof') || b.tags.includes('example'))) {
        warn(b, 'internal block carries @memberof/@example but no @function/@constant/@typedef and no export — ignored');
      }
      continue;
    }
    for (const t of b.tags) {
      if (!VOCABULARY.has(t)) fail(b, `tag @${t} is outside the vocabulary`);
    }
  }

  // Module coverage — a file with public blocks needs a header.
  for (const d of doclets) {
    if (!d.module) fail(d, `no @module header in ${d.file}`);
  }

  // Names and owners.
  const seen = new Map();
  for (const d of doclets) {
    if (d.explicitName && d.exportName && d.explicitName !== d.exportName) {
      fail(d, `@function ${d.explicitName} contradicts export ${d.exportName}`);
    }
    if (d.via === 'function' && !blocks.find((b) => b.doclet === d).tags.includes('memberof')) {
      fail(d, `@function ${d.name} without @memberof`);
    }
    const key = `${d.owner}.${d.name}`;
    if (seen.has(key)) warn(d, `duplicate ${key} (first at ${seen.get(key)})`);
    else seen.set(key, at(d));
    for (const o of d.orphans) warn(d, `dotted @param ${o} has no parent parameter`);
  }

  // Links — a documented name, or a package named in prose.
  const table = linkTable(parsed);
  const resolves = (target) => table.has(target) || packages[target] !== undefined;
  for (const d of doclets) {
    for (const t of texts(d)) {
      for (const target of linkTargets(t)) {
        if (!resolves(target)) fail(d, `unresolved {@link ${target}}`);
      }
    }
  }
  for (const m of modules) {
    for (const target of linkTargets(m.description)) {
      if (!resolves(target)) fail(m, `unresolved {@link ${target}}`);
    }
  }

  // Fences — every page's code block carries a language the site renders, and a
  // `wgsl` one is a shader.
  const fences = [];
  for (const md of [readme, esm, ...modules.map((m) => m.description), ...doclets.map((d) => d.description)])
    for (const fence of splitFences(md || '').filter((_, i) => i % 2)) fences.push(fence);
  for (const fence of fences) {
    const language = languageOf(fence);
    const where = fence.slice(0, 40).replace(/\n/g, ' ');
    if (language && !LANGUAGES.has(language)) {
      errors.push(`a fence tagged \`${language}\` is not one of the site's (${[...LANGUAGES].join(', ')}) — “${where}…”`);
    } else if (language === 'wgsl' && !/@(vertex|fragment|group|binding|location|builtin)\b/.test(fence)) {
      errors.push(`a \`wgsl\` fence carries no shader attribute — “${where}…”`);
    }
  }

  // Examples — every one is a module script (an import from the page's map and
  // its names from the build) or a stated fragment; a fragment is shown as code
  // and never mounted, so it declares no import and no script tag.
  const map = importMap();
  for (const d of doclets) {
    d.examples.forEach((ex, i) => {
      if (!ex.runnable) {
        if (/<script/i.test(ex.code)) fail(d, `@example #${i + 1} of ${d.name} carries a script tag — examples run as module scripts`);
        return;
      }
      const found = importsOf(ex.code);
      if (!found.length) { fail(d, `@example #${i + 1} of ${d.name} imports nothing`); return; }
      for (const { clause, specifier } of found) {
        if (map[specifier] === undefined) {
          fail(d, `@example #${i + 1} of ${d.name} imports \`${specifier}\`, which the page's map does not resolve`);
          continue;
        }
        if (specifier !== 'webgpu.tree' || !clause) continue;
        const names = importedNames(clause);
        if (!names) continue;
        for (const name of names) {
          if (!api || !(name in api)) fail(d, `@example #${i + 1} of ${d.name} imports \`${name}\`, which the build does not export`);
        }
      }
      if (/\bwindow\.[\w$]*Tree\b|document\.currentScript/.test(ex.code)) {
        fail(d, `@example #${i + 1} of ${d.name} reads a script-tag global — the site is ESM-only`);
      }
    });
    if (d.kind === 'function' && d.examples.length === 0) warn(d, `${d.owner}.${d.name} has no @example`);
  }

  // The documented surface against the build: every name is exported, and a
  // function's parameters are the ones its source declares.
  for (const d of doclets) {
    if (!api) { fail(d, `the build does not export ${d.name}`); continue; }
    const built = api[d.name];
    if (built === undefined) { fail(d, `${d.name} is not in the build`); continue; }
    if (d.kind !== 'function') continue;
    if (typeof built !== 'function') { fail(d, `${d.name} is a ${typeof built}, documented as a function`); continue; }
    const actual = paramNames(String(built));
    const documented = d.params.map((p) => p.name);
    if (actual.length !== documented.length || actual.some((n, i) => n !== null && n !== documented[i])) {
      fail(d, `${d.name}(${documented.join(', ')}) does not match the build's (${actual.map((n) => n ?? '{…}').join(', ')})`);
    }
  }

  // The README's own links into the API site — every one of them names a page
  // this build writes and, with an anchor, a name it documents. Nothing is
  // deployed (§7 #77), so the twin's README carries none yet; the check is what
  // keeps the first one honest.
  if (readme) {
    const written = new Set(['index.html']);
    const documented = new Set();
    const byModule = new Set(doclets.map((d) => d.module));
    for (const m of modules) if (byModule.has(m.name)) written.add(pageOf(m.name));
    for (const d of doclets) documented.add(`${pageOf(d.module)}#${anchorOf(d)}`);
    for (const [url, line] of readmeTargets(readme)) {
      const [page, anchor] = url.slice(SITE_URL.length).split('#');
      const where = `${page}${anchor ? `#${anchor}` : ''}`;
      const ok = anchor ? documented.has(where) : written.has(page);
      if (!ok) fail({ file: paths.readme, line }, `${url} is ${anchor ? 'no documented name' : 'no page'} in this build`);
    }
  }

  return { errors, warnings };
}
