/**
 * @file Sidebar search — filters the API index as you type.
 * @license AGPL-3.0-only
 *
 * ES module on every page. The page's configuration is the
 * `application/json` block `#docs-config`; its `index` is the generator's
 * search index (one entry per function and constant: name, owner,
 * page#anchor, first sentence). The index is fetched once, on the first
 * keystroke, and the typed text is matched against name and owner as a plain
 * substring. The results replace the module list while the field is
 * non-empty; Enter opens the first result, Esc clears.
 */

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

function start(config) {
  const field   = document.querySelector('.sidebar .search');
  const modules = document.querySelector('.sidebar .modules');
  const results = document.querySelector('.sidebar .results');
  if (!field || !modules || !results) return;

  let index = null, loading = null;
  function load() {
    if (index) return Promise.resolve(index);
    loading = loading || fetch(config.index).then((r) => r.json())
      .then((list) => { index = list; return list; });
    return loading;
  }

  function show(list, q) {
    const hits = list.filter((e) =>
      e.n.toLowerCase().indexOf(q) >= 0 || (e.o + '.' + e.n).toLowerCase().indexOf(q) >= 0,
    ).slice(0, 40);
    results.innerHTML = hits.length ? hits.map((e) =>
      '<li><a href="' + e.h + '"><span class="name">' + e.n + '</span>' +
        '<span class="owner">' + e.o + '</span>' +
        (e.s ? '<span class="hint">' + e.s.replace(/</g, '&lt;') + '</span>' : '') + '</a></li>',
    ).join('') : '<li class="none">No match</li>';
    results.hidden = false;
    modules.hidden = true;
  }

  function clear() {
    results.hidden = true;
    results.innerHTML = '';
    modules.hidden = false;
  }

  field.addEventListener('input', () => {
    const q = field.value.trim().toLowerCase();
    if (!q) return clear();
    load().then((list) => { if (field.value.trim().toLowerCase() === q) show(list, q); });
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { field.value = ''; clear(); }
    if (e.key === 'Enter') {
      const first = results.querySelector('a');
      if (first) window.location.href = first.getAttribute('href');
    }
  });
}

const config = readConfig();
if (config) start(config);
