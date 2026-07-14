// main.js — orchestrates data adapter + map engine + search + panel,
// and implements the URL contract (?country=<ISO>&expand=1).

import { getEntry, hasEntry, normalizeIso } from './data-adapter.js';
import { MapEngine, mapboxAvailable } from './map.js';
import { initSearch } from './search.js';
import { renderPanel, renderPrompt } from './panel.js';

const COUNTRIES_URL = new URL('../data/countries.json?v=199', import.meta.url);

const els = {
  map: document.getElementById('map'),
  panel: document.getElementById('panel'),
  search: document.getElementById('search'),
  suggest: document.getElementById('suggest'),
  layout: document.getElementById('layout'),
  notice: document.getElementById('notice'),
};

const state = { countries: {}, engine: null, selected: '' };

function showNotice(msg) {
  if (!msg) { els.notice.hidden = true; els.notice.textContent = ''; return; }
  els.notice.textContent = msg;
  els.notice.hidden = false;
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  if (state.selected) p.set('country', state.selected); else p.delete('country');
  if (els.layout.classList.contains('expanded')) p.set('expand', '1'); else p.delete('expand');
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

function setExpanded(on) {
  els.layout.classList.toggle('expanded', !!on);
}

async function selectCountry(iso, { expand = true } = {}) {
  const key = normalizeIso(iso);
  state.selected = key;
  if (state.engine) state.engine.selectCountry(key);
  const entry = await getEntry(key);
  renderPanel(els.panel, entry, key);
  if (expand) setExpanded(true);
  syncUrl();
}

async function main() {
  state.countries = await (await fetch(COUNTRIES_URL)).json();
  renderPrompt(els.panel);

  initSearch({
    input: els.search,
    list: els.suggest,
    countries: state.countries,
    onSelect: (iso) => selectCountry(iso),
    hasEntry,
  });

  if (!mapboxAvailable()) {
    showNotice('Mapbox 需要 access token 才能使用地圖。請設定 window.WORLD_ALMANAC_MAPBOX_TOKEN，或加上 ?mbtoken=pk... 後重新載入。');
    return;
  }

  state.engine = new MapEngine(els.map, state.countries);
  state.engine.onCountryClick = (iso) => selectCountry(iso);
  await state.engine.ready();

  // URL contract: ?country=<ISO> preselects; &expand=1 opens the panel.
  const params = new URLSearchParams(location.search);
  const country = normalizeIso(params.get('country'));
  const expand = params.get('expand') === '1';
  if (country) {
    await selectCountry(country, { expand: expand || true });
  } else if (expand) {
    setExpanded(true);
  }
}

main().catch((err) => {
  console.error(err);
  showNotice(`初始化失敗：${err.message}`);
});
