/**
 * @file The site's own example rule: every example is a module script under the
 * page's import map, and every fence is one of the languages a page shows.
 * @module tools/docs/plugins/examples
 * @license AGPL-3.0-only
 *
 * The twin's site is ESM-only, so an `@example` is a module script whose import
 * from `webgpu.tree` runs in the page's frame under the import map the
 * declaration states: every specifier is a map entry, and every name the
 * example imports from the build exists in it. A fence a page shows is one of
 * the site's own languages, and a `wgsl` fence carries a shader stage — the
 * stylesheet keys its WGSL callout on that language. Both are this site's
 * conventions; the package states the examples' syntax and knows nothing of a
 * fence or an import map.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The fence languages the site's pages use: the twin shows WGSL, not GLSL. */
const LANGUAGES = new Set(['js', 'bash', 'html', 'json', 'wgsl']);
const IMPORT_RE = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/gm;
const NAMED_RE = /^\{([\s\S]*)\}$/;
const FENCE_RE = /```([\w-]*)[^\n]*\n([\s\S]*?)```/g;

/** Split markdown into [text, fence, text, fence, …] so a fence is read whole. */
function splitFences(md) {
  return String(md ?? '').split(/(```[\s\S]*?```)/g);
}

/** The names one `import { … }` clause brings in. */
function importedNames(clause) {
  const named = NAMED_RE.exec(clause.trim());
  if (!named) return [];
  return named[1].split(',').map((item) => item.trim().split(/\s+as\s+/).pop()).filter(Boolean);
}

/** The landing page's own Markdown, read from this plugin's place in the repository. */
function landingText(declaration) {
  const file = declaration.carrier?.landing?.file;
  if (!file) return '';
  try {
    return readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), 'utf8');
  } catch (_) {
    return '';
  }
}

export default {
  name: 'examples',

  /**
   * @param {{ modules: Object[], doclets: Object[] }} parsed
   * @param {{ declaration: Object, api: Object }} ctx
   * @returns {{ errors: string[] }}
   */
  validate(parsed, ctx) {
    const errors = [];
    const fail = (x, message) => errors.push(`${x.file}:${x.line}  ${message}`);
    const map = Object.keys(ctx.declaration.runner.config.imports ?? {});

    // Every example is a module script under the page's map.
    for (const d of parsed.doclets) {
      d.examples.forEach((example, i) => {
        const imports = [...example.code.matchAll(IMPORT_RE)];
        const where = `@example #${i + 1} of ${d.name}`;
        if (!imports.length) {
          fail(d, `${where} imports nothing — the site's examples are module scripts`);
          return;
        }
        if (!imports.some((m) => m[2] === 'webgpu.tree')) {
          fail(d, `${where} does not import from webgpu.tree`);
        }
        for (const [, clause, specifier] of imports) {
          if (!map.includes(specifier)) {
            fail(d, `${where} imports \`${specifier}\`, which the page's map does not resolve`);
            continue;
          }
          if (specifier !== 'webgpu.tree' || !clause) continue;
          for (const name of importedNames(clause)) {
            if (ctx.api && !(name in ctx.api)) {
              fail(d, `${where} imports \`${name}\`, which the build does not export`);
            }
          }
        }
      });
    }

    // Every fence is one of the site's languages; a WGSL one is a shader.
    const sources = [
      { file: ctx.declaration.paths.readme, line: 0, text: ctx.readme },
      { file: ctx.declaration.carrier?.landing?.file, line: 0, text: landingText(ctx.declaration) },
      ...parsed.modules.map((m) => ({ file: m.file, line: m.line, text: m.description })),
      ...parsed.doclets.map((d) => ({ file: d.file, line: d.line, text: d.description })),
    ];
    for (const source of sources) {
      for (const fence of splitFences(source.text).filter((_, i) => i % 2)) {
        const language = /^```([\w-]*)/.exec(fence)?.[1] ?? '';
        if (language && !LANGUAGES.has(language)) {
          fail(source, `a fence tagged \`${language}\` is not one of the site's (${[...LANGUAGES].join(', ')})`);
        } else if (language === 'wgsl' && !/@(vertex|fragment|group|binding|location|builtin)\b/.test(fence)) {
          fail(source, 'a `wgsl` fence carries no shader attribute');
        }
      }
    }
    return { errors };
  },
};
