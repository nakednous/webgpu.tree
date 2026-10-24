#!/usr/bin/env node
/**
 * @file Docs generator entry — `npm run docs`: src/*.js → site/.
 * @module tools/docs
 * @license AGPL-3.0-only
 *
 * Pipeline: parse doc blocks → validate against the ES build and the examples'
 * rule (errors fail the build) → render → write site/ beside the ES build of
 * the same commit, the stack builds it was made against, and the static chrome
 * (assets/, favicons). Run `npm run build` first: the site is ESM-only, so
 * `dist/index.js` is both the page's module and the thing the validator reads.
 */

import {
  copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { importMap, paths, site } from './config.js';
import { parseSources } from './parser.js';
import { validate } from './validator.js';
import { render } from './renderer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const at   = (p) => join(root, p);

async function main() {
  const pkg    = JSON.parse(readFileSync(at(paths.pkg), 'utf8'));
  const readme = readFileSync(at(paths.readme), 'utf8');
  const esm    = readFileSync(at(paths.esm), 'utf8');
  if (!existsSync(at(paths.module))) {
    console.error(`[docs] ${paths.module} not found — run \`npm run build\` first.`);
    process.exit(1);
  }

  // The ES build's namespace, imported once: the validator checks every
  // documented name against it and a function's parameters against its source.
  const api = await import(pathToFileURL(at(paths.module)).href);

  // Parse + validate.
  const parsed = parseSources(at(paths.src));
  const { errors, warnings } = validate(parsed, { api, readme, esm });
  for (const w of warnings) console.warn(`[docs] warn  ${w}`);
  for (const e of errors)   console.error(`[docs] error ${e}`);
  if (errors.length) {
    console.error(`[docs] ${errors.length} error(s) — site not written.`);
    process.exit(1);
  }

  // Render.
  const pages = render(parsed, { pkg, readme, esm, imports: importMap() });

  // Write site/ from scratch.
  const out = at(paths.site);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const [file, html] of pages) writeFileSync(join(out, file), html);

  copyFileSync(at(paths.module), join(out, site.module));
  for (const [name, file] of Object.entries(paths.deps)) {
    if (!existsSync(at(file))) {
      console.error(`[docs] ${file} not found — ${name} is not installed.`);
      process.exit(1);
    }
    copyFileSync(at(file), join(out, site.deps[name]));
  }
  if (existsSync(at(paths.static))) cpSync(at(paths.static), out, { recursive: true });

  const examples = parsed.doclets.reduce((n, d) => n + d.examples.length, 0);
  const runnable = parsed.doclets.reduce(
    (n, d) => n + d.examples.filter((ex) => ex.runnable).length, 0);
  console.log(`[docs] ${pages.size} page(s), ${parsed.doclets.length} doclet(s), ` +
              `${examples} example(s) (${runnable} runnable), ${warnings.length} warning(s) → ${paths.site}/`);
}

await main();
