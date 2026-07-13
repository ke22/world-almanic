// search.js
// Country search box with autocomplete over the known country list.
// Selecting a suggestion drives the map + panel via the onSelect callback.

/** @param {string} q  @param {object} countries  @returns {Array<{iso,label}>} */
export function matchCountries(q, countries) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  for (const [iso, rec] of Object.entries(countries)) {
    const hay = [iso, rec.name_en, rec.name_zh].filter(Boolean).map((s) => s.toLowerCase());
    // prefix match on any field ranks first; substring match still counts.
    const isPrefix = hay.some((h) => h.startsWith(needle));
    const isSub = hay.some((h) => h.includes(needle));
    if (isPrefix || isSub) out.push({ iso, rec, rank: isPrefix ? 0 : 1 });
  }
  out.sort((a, b) => a.rank - b.rank || a.rec.name_en.localeCompare(b.rec.name_en));
  return out.map(({ iso, rec }) => ({ iso, label: `${rec.name_zh} · ${rec.name_en}` }));
}

export function initSearch({ input, list, countries, onSelect, hasEntry }) {
  let items = [];
  let active = -1;

  function close() {
    list.innerHTML = '';
    list.hidden = true;
    active = -1;
  }

  async function render(q) {
    items = matchCountries(q, countries);
    if (!items.length) {
      // Distinguish "typed nothing" from "typed but no match".
      list.innerHTML = q.trim() ? '<li class="empty" aria-disabled="true">查無此國家</li>' : '';
      list.hidden = !q.trim();
      return;
    }
    const marks = await Promise.all(items.map((it) => hasEntry(it.iso)));
    list.innerHTML = items
      .map(
        (it, i) =>
          `<li role="option" data-iso="${it.iso}" data-i="${i}">` +
          `<span>${it.label}</span>` +
          `<span class="tag">${marks[i] ? it.iso : '無條目'}</span></li>`
      )
      .join('');
    list.hidden = false;
  }

  function choose(iso) {
    const rec = countries[iso];
    if (rec) input.value = `${rec.name_zh} · ${rec.name_en}`;
    close();
    onSelect(iso);
  }

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => input.value && render(input.value));
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    const opts = [...list.querySelectorAll('li[data-iso]')];
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, opts.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { choose(opts[active].dataset.iso); return; }
    else if (e.key === 'Escape') { close(); return; }
    opts.forEach((o, i) => o.classList.toggle('active', i === active));
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-iso]');
    if (li) { e.preventDefault(); choose(li.dataset.iso); }
  });
  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== input) close();
  });

  return { choose, close };
}
