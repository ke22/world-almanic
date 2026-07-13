// panel.js
// Render a CountryEntry as a mixed-type panel:
//   header (flag + name_zh + name_en + ISO) -> data-driven factbox -> ordered
//   sections (timeline | article). Empty regions are skipped without error.

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFactbox(factbox) {
  if (!Array.isArray(factbox) || factbox.length === 0) return '';
  const rows = factbox
    .filter((f) => f && (f.label != null || f.value != null))
    .map(
      (f) =>
        `<div class="fb-row"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`
    )
    .join('');
  return rows ? `<dl class="factbox">${rows}</dl>` : '';
}

function renderTimeline(sec) {
  const events = Array.isArray(sec.events) ? sec.events : [];
  if (!events.length) return '';
  const items = events
    .map(
      (ev) =>
        `<li class="tl-item"><span class="tl-date">${esc(ev.date)}</span>` +
        `<div class="tl-body"><strong>${esc(ev.title)}</strong>` +
        `<p>${esc(ev.desc)}</p></div></li>`
    )
    .join('');
  return `<section class="sec sec-timeline"><h3>${esc(sec.title)}</h3><ul class="timeline">${items}</ul></section>`;
}

function renderArticle(sec) {
  if (!sec.body) return '';
  return `<section class="sec sec-article"><h3>${esc(sec.title)}</h3><p>${esc(sec.body)}</p></section>`;
}

function renderSections(sections) {
  if (!Array.isArray(sections)) return '';
  return sections
    .map((sec) => {
      if (!sec || typeof sec !== 'object') return '';
      if (sec.type === 'timeline') return renderTimeline(sec);
      if (sec.type === 'article') return renderArticle(sec);
      return ''; // unknown section type -> skip, don't crash
    })
    .join('');
}

/** Render an entry into the panel element. entry === null -> "no entry" state. */
export function renderPanel(el, entry, iso) {
  if (!entry) {
    el.innerHTML =
      `<div class="panel-empty"><p class="muted">查無此國家條目</p>` +
      (iso ? `<p class="muted small">${esc(iso)} 尚未收錄於世界年鑑（mock）</p>` : '') +
      `</div>`;
    return;
  }
  const header =
    `<header class="entry-head">` +
    `<span class="flag">${esc(entry.flag)}</span>` +
    `<span class="names"><span class="zh">${esc(entry.name_zh)}</span>` +
    `<span class="en">${esc(entry.name_en)}</span></span>` +
    `<span class="iso">${esc(entry.iso)}</span></header>`;
  el.innerHTML = header + renderFactbox(entry.factbox) + renderSections(entry.sections);
}

/** Prompt shown before any country is chosen. */
export function renderPrompt(el) {
  el.innerHTML =
    `<div class="panel-empty"><p class="muted">搜尋或點選一個國家，查看世界年鑑條目</p></div>`;
}
