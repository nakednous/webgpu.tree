/**
 * @file Doc-block parser — src/*.js → module table + doclet table.
 * @module tools/docs/parser
 * @license AGPL-3.0-only
 *
 * Public-symbol rule. A doc block is public iff:
 *   - it sits directly above an `export` (name inferred from the following
 *     code line), or
 *   - it carries `@function name` (validated to also carry `@memberof`),
 *     `@constant {T} NAME`, or `@typedef {T} Name`.
 * When src/index.js re-exports names, a block is public only if its name is
 * among them. A block tagged `@ignore` is internal whatever it exports: the
 * bridge's own seams, shared between its modules and its tests, never on the
 * site. Every other block is internal and ignored. `@memberof` defaults to the
 * module. Dotted `@param` / `@property` names group under their parent.
 *
 * Audience rule. The rendered description is the block's prose before its
 * first tag (for a module header, also the prose after `@license`), written
 * for a WebGPU user in one to three sentences: what it does and the key
 * options. Technical prose stays in the source under `@details`, a tag the
 * parser accepts and never renders; in a module header it must come last.
 *
 * Example rule. The site is ESM-only: an example is a module script whose
 * first statement imports from `webgpu.tree`, runs under the page's import
 * map, and is mounted live — `runnable`. An example that is a call's shape,
 * with the setting around it given in prose, carries no import and is
 * `runnable: false`: the page shows it as code and does not mount it. The
 * validator checks every example's imports against the build; the site's gate
 * runs the runnable ones in a browser.
 *
 * An exported function the index does not name is internal: it carries
 * `@ignore`, and an illustration on it is the source's, not the site's.
 *
 * WGSL inside an example is written between fence lines (` ```wgsl ` … ` ``` `),
 * because a doc block reads a line that begins with `@` as a tag and a shader
 * stage's attribute is one. The fenced region is the doc comment's — the
 * example's code is the same text with the fence lines dropped, so the reader
 * gets valid JS with the shader in its template literal.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'comment-parser';

const EXPORT_RE  = /^export\s+(?:async\s+)?(function|class|const|let|var)\*?\s+([A-Za-z_$][\w$]*)/;
const CAPTION_RE = /^<caption>([\s\S]*?)<\/caption>\s*$/;
const FENCE_LINE = /^\s*```[\w-]*\s*$/;

// ── Token reconstruction ────────────────────────────────────────────────────
// comment-parser tokenizes every tag line into name / type / description, so a
// tag whose payload is free text (@example, @returns, @file) loses its first
// word into `name`. Rebuild from the raw tokens instead. With
// `spacing: 'preserve'` a continuation line's indentation lives in
// `postDelimiter` (one space past the `*` is the standard gutter).

/** Text after `@tag` (and after `{type}` on the first line), all lines. */
function tail(tag) {
  return tag.source.map((s, i) => {
    const k = s.tokens;
    if (i === 0) return k.name + k.postName + k.description;
    return k.postDelimiter.slice(1) + k.tag + k.postTag + k.name + k.postName +
           k.type + k.postType + k.description;
  }).join('\n').replace(/\s+$/, '');
}

/** Continuation lines only (everything after the tag's own line). */
function continuation(tag) {
  return tag.source.slice(1).map((s) => {
    const k = s.tokens;
    return k.postDelimiter.slice(1) + k.tag + k.postTag + k.name + k.postName +
           k.type + k.postType + k.description;
  }).join('\n').replace(/^\n+|\s+$/g, '');
}

/** Drop the blank lines an example carries at either end. */
function trimBlank(code) {
  const lines = code.split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

/**
 * An @example: optional `<caption>` as its first line (on the tag line or
 * the line after), code on the rest.
 */
function exampleOf(tag) {
  const k     = tag.source[0].tokens;
  const head  = (k.name + k.postName + k.type + k.postType + k.description).trim();
  const lines = (head ? [head] : []).concat(continuation(tag).split('\n'));
  const cap   = CAPTION_RE.exec(lines[0].trim());
  const code  = trimBlank((cap ? lines.slice(1) : lines).join('\n'))
    .split('\n').filter((line) => !FENCE_LINE.test(line)).join('\n');
  return {
    caption:  cap ? cap[1].trim() : null,
    code,
    runnable: /^\s*import\s[\s\S]*?from\s+['"]/m.test(code),
  };
}

/** A @param / @property row. */
function fieldOf(tag) {
  return {
    name:        tag.name,
    type:        tag.type,
    optional:    tag.optional,
    default:     tag.default ?? null,
    description: tag.description.trim(),
    children:    [],
  };
}

/**
 * Nest dotted names under their parent (`opts.display` under `opts`).
 * @returns {{ roots: Object[], orphans: string[] }} orphans name parents that
 *   were never declared; the row is kept as a root so nothing is lost.
 */
function groupDotted(rows) {
  const roots = [], byName = new Map(), orphans = [];
  for (const r of rows) {
    const dot = r.name.lastIndexOf('.');
    const parent = dot > 0 ? byName.get(r.name.slice(0, dot)) : null;
    if (dot > 0 && !parent) orphans.push(r.name);
    (parent ? parent.children : roots).push(r);
    byName.set(r.name, r);
  }
  return { roots, orphans };
}

/** First non-blank line at or after `from`. */
function nextCodeLine(lines, from) {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim()) return lines[i].trim();
  }
  return null;
}

// ── Per-file parse ──────────────────────────────────────────────────────────

function parseFile(srcDir, file) {
  const text   = readFileSync(join(srcDir, file), 'utf8');
  const lines  = text.split('\n');
  const result = { file, module: null, blocks: [] };

  for (const b of parse(text, { spacing: 'preserve' })) {
    const line  = b.source[0].number + 1;                          // 1-based
    const last  = b.source[b.source.length - 1].number;
    const next  = nextCodeLine(lines, last + 1);
    const exp   = next ? EXPORT_RE.exec(next) : null;
    const tagOf = (n) => b.tags.find((t) => t.tag === n) ?? null;
    const all   = (n) => b.tags.filter((t) => t.tag === n);

    const block = {
      file, line,
      tags:       b.tags.map((t) => t.tag),
      exportName: exp ? exp[2] : null,
      exportKind: exp ? exp[1] : null,
      public:     false,
      doclet:     null,
    };
    result.blocks.push(block);

    // Module header — @file / @module / @license, prose before or after.
    const moduleTag = tagOf('module');
    if (moduleTag) {
      // The rendered prose: text before the first tag, plus the text after the
      // last tag — unless that tag is @details, whose text stays in the source.
      const n = b.tags.length;
      const lastTag = b.tags[n - 1].tag === 'details' ? b.tags[n - 2] : b.tags[n - 1];
      const prose   = [b.description.trim(), continuation(lastTag)].filter(Boolean).join('\n\n');
      block.module = {
        name:        moduleTag.name,
        file,
        line,
        title:       tagOf('file') ? tail(tagOf('file')).trim() : '',
        license:     tagOf('license')?.name ?? '',
        description: prose,
      };
      if (!result.module) result.module = block.module;
      continue;
    }

    // Public? — `@ignore` keeps an export off the site; an explicit name tag
    // wins over the export inference.
    if (tagOf('ignore')) continue;
    const fnTag = tagOf('function'), constTag = tagOf('constant'), tdTag = tagOf('typedef');
    let via = null, name = null, kind = null;
    if (fnTag)          { via = 'function'; name = fnTag.name;    kind = 'function'; }
    else if (constTag)  { via = 'constant'; name = constTag.name; kind = 'constant'; }
    else if (tdTag)     { via = 'typedef';  name = tdTag.name;    kind = 'typedef';  }
    else if (block.exportName) {
      via  = 'export';
      name = block.exportName;
      kind = /^(function|class)$/.test(block.exportKind) ? 'function' : 'constant';
    }
    if (!via) continue;

    const params = groupDotted(all('param').map(fieldOf));
    const props  = groupDotted(all('property').map(fieldOf));
    const ret    = tagOf('returns');

    block.public = true;
    block.doclet = {
      kind, via, name,
      owner:         tagOf('memberof')?.name ?? null,   // null → module (filled by parseSources)
      module:        null,
      file, line,
      description:   b.description.trim(),
      params:        params.roots,
      properties:    props.roots,
      orphans:       [...params.orphans, ...props.orphans],
      returns:       ret ? { type: ret.type, description: tail(ret).trim() } : null,
      examples:      all('example').map(exampleOf),
      type:          constTag?.type ?? tdTag?.type ?? null,
      tagDescription: (constTag ?? tdTag)?.description.trim() ?? '',
      explicitName:  fnTag?.name ?? null,
      exportName:    block.exportName,
    };
  }
  return result;
}

// ── Entry ───────────────────────────────────────────────────────────────────

const REEXPORT_RE = /^export\s*\{([^}]*)\}\s*from\b/gm;

/**
 * The names `index.js` puts on the surface: the ones it re-exports (`a as b`
 * yields `b`) and the ones it declares itself — a bridge's own verb may live
 * in its root module, as this one's `program` does. Null without an index.
 */
function surfaceOf(srcDir) {
  let text;
  try { text = readFileSync(join(srcDir, 'index.js'), 'utf8'); } catch (_) { return null; }
  const names = new Set();
  for (const m of text.matchAll(REEXPORT_RE)) {
    for (const item of m[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  for (const line of text.split('\n')) {
    const declared = EXPORT_RE.exec(line.trim());
    if (declared) names.add(declared[2]);
  }
  return names;
}

// Sorted by name without the extension, so `host` precedes `host.handles`.
const jsFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js'))
  .sort((a, b) => (a.slice(0, -3) < b.slice(0, -3) ? -1 : 1));

/**
 * Parse every `*.js` under `srcDir`, then every doc-only file under
 * `docsDir`: the re-exported `tree` / `host` surface, documented by name
 * (`@function` / `@constant` with `@memberof`) and marked `reexport` so the
 * validator checks it against the build.
 * @param {string} srcDir
 * @param {string} [docsDir]
 * @returns {{ modules: Object[], doclets: Object[], blocks: Object[] }}
 */
export function parseSources(srcDir, docsDir) {
  const modules = [], doclets = [], blocks = [];
  const surface = surfaceOf(srcDir);
  const collect = (dir, file, reexport) => {
    const r = parseFile(dir, file);
    if (r.module) modules.push(r.module);
    for (const b of r.blocks) {
      blocks.push(b);
      if (!reexport && b.doclet && surface && !surface.has(b.doclet.name)) { b.public = false; b.doclet = null; }
      if (!b.doclet) continue;
      b.doclet.module = r.module?.name ?? null;
      b.doclet.owner ??= b.doclet.module;
      b.doclet.reexport = reexport;
      doclets.push(b.doclet);
    }
  };

  for (const file of jsFiles(srcDir)) collect(srcDir, file, false);
  if (docsDir) for (const file of jsFiles(docsDir)) collect(docsDir, file, true);

  return { modules, doclets, blocks };
}
