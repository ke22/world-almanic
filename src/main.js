// main.js — orchestrates data adapter + map engine + search + panel,
// and implements the URL contract (?country=<ISO>&expand=1&engine=<name>).

import { getEntry, hasEntry, normalizeIso } from './data-adapter.js';
import { MapEngine, DEFAULT_ENGINE, engineAvailable } from './map.js';
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
  toggle: document.getElementById('engine-toggle'),
};

const state = { countries: {}, engine: null, engineName: DEFAULT_ENGINE, selected: '' };

function showNotice(msg) {
  if (!msg) { els.notice.hidden = true; els.notice.textContent = ''; return; }
  els.notice.textContent = msg;
  els.notice.hidden = false;
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  if (state.selected) p.set('country', state.selected); else p.delete('country');
  p.set('engine', state.engineName);
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

async function buildEngine(name) {
  const engine = new MapEngine(els.map, name, state.countries);
  await engine.ready();
  return engine;
}

async function switchEngine(name) {
  if (name === state.engineName && state.engine) return;
  if (!engineAvailable(name)) {
    showNotice(
      name === 'mapbox'
        ? 'Mapbox 無法使用：未設定 access token。已保留 MapLibre；設定 window.WORLD_ALMANAC_MAPBOX_TOKEN 或加上 ?mbtoken= 後再切換。'
        : `${name} 引擎無法載入。`
    );
    updateToggleUi();
    return;
  }
  const prev = state.engine;
  try {
    const next = await buildEngine(name);
    if (prev) prev.destroy();
    state.engine = next;
    state.engineName = name;
    showNotice('');
    if (state.selected) state.engine.selectCountry(state.selected);
    updateToggleUi();
    syncUrl();
  } catch (err) {
    showNotice(`切換到 ${name} 失敗：${err.message}。已保留目前底圖。`);
    updateToggleUi();
  }
}

function updateToggleUi() {
  [...els.toggle.querySelectorAll('button[data-engine]')].forEach((b) => {
    b.classList.toggle('active', b.dataset.engine === state.engineName);
    b.setAttribute('aria-pressed', String(b.dataset.engine === state.engineName));
  });
}

function initToggle() {
  els.toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-engine]');
    if (btn) switchEngine(btn.dataset.engine);
  });
  updateToggleUi();
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
  initToggle();

  // Resolve initial engine from URL, falling back to an available default.
  const params = new URLSearchParams(location.search);
  let wanted = params.get('engine') || DEFAULT_ENGINE;
  if (!engineAvailable(wanted)) {
    if (wanted === 'mapbox') {
      showNotice('Mapbox 需要 access token，已改用 MapLibre。');
    }
    wanted = DEFAULT_ENGINE;
  }
  state.engineName = wanted;
  state.engine = await buildEngine(wanted);
  updateToggleUi();

  // URL contract: ?country=<ISO> preselects; &expand=1 opens the panel.
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
