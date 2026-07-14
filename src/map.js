// map.js
// MapEngine: Mapbox GL JS only implementation
// Highlights countries using Mapbox's official country-boundaries tileset
// Supports click-to-select and Traditional Chinese labels

const ACCENT = '#2563eb';

const HIGHLIGHT_SRC = 'country-boundaries';
const HIGHLIGHT_FILL = 'country-highlight-fill';
const HIGHLIGHT_LINE = 'country-highlight-line';
const HIT_LAYER = 'country-hit-layer';

const BOUNDARY = {
  type: 'vector',
  url: 'mapbox://mapbox.country-boundaries-v1',
  sourceLayer: 'country_boundaries',
  joinProp: 'iso_3166_1',
};

/** Resolve a Mapbox token from opt-in config only; never hardcode a token. */
function resolveMapboxToken() {
  const fromGlobal = typeof window !== 'undefined' && window.WORLD_ALMANAC_MAPBOX_TOKEN;
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) return fromGlobal.trim();
  const fromUrl = new URLSearchParams(location.search).get('mbtoken');
  if (fromUrl && fromUrl.trim()) return fromUrl.trim();
  return '';
}

export function mapboxAvailable() {
  if (typeof window === 'undefined' || !window.mapboxgl) return false;
  if (!resolveMapboxToken()) return false;
  return true;
}

export class MapEngine {
  /**
   * @param {HTMLElement} container
   * @param {object} countries  ISO -> { bbox: [w,s,e,n] }
   */
  constructor(container, countries) {
    this.container = container;
    this.countries = countries || {};
    this.selected = '';
    this.map = null;
    this.joinProp = BOUNDARY.joinProp;
    this.onCountryClick = null;
    this._ready = this._build();
  }

  ready() {
    return this._ready;
  }

  async _build() {
    const token = resolveMapboxToken();
    if (!token) throw new Error('mapbox-token-missing');

    window.mapboxgl.accessToken = token;

    const map = new window.mapboxgl.Map({
      container: this.container,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [10, 25],
      zoom: 1.3,
      attributionControl: true,
    });
    this.map = map;

    await new Promise((resolve, reject) => {
      map.on('load', resolve);
      map.on('error', (e) => {
        if (e && e.error) console.warn('[map] error:', e.error.message || e.error);
      });
      setTimeout(() => reject(new Error('map load timeout')), 15000).unref?.();
    });

    // Add country boundaries source
    map.addSource(HIGHLIGHT_SRC, {
      type: 'vector',
      url: BOUNDARY.url,
    });

    const noMatch = ['==', ['get', this.joinProp], '__none__'];
    this._noMatchFilter = noMatch;

    const layerBase = { source: HIGHLIGHT_SRC, 'source-layer': BOUNDARY.sourceLayer, filter: noMatch };

    // Add highlight layers
    map.addLayer({ id: HIGHLIGHT_FILL, type: 'fill', paint: { 'fill-color': ACCENT, 'fill-opacity': 0.45 }, ...layerBase });
    map.addLayer({ id: HIGHLIGHT_LINE, type: 'line', paint: { 'line-color': ACCENT, 'line-width': 1.5 }, ...layerBase });

    // Invisible, unfiltered fill layer for hit-testing clicks
    map.addLayer({
      id: HIT_LAYER,
      type: 'fill',
      source: HIGHLIGHT_SRC,
      'source-layer': BOUNDARY.sourceLayer,
      paint: { 'fill-color': '#000', 'fill-opacity': 0 },
    });

    // Click handler for country selection
    map.on('click', HIT_LAYER, (e) => {
      const iso = e.features?.[0]?.properties?.[this.joinProp];
      if (iso && this.onCountryClick) this.onCountryClick(iso);
    });

    // Cursor feedback
    map.on('mouseenter', HIT_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', HIT_LAYER, () => { map.getCanvas().style.cursor = ''; });

    // Apply Traditional Chinese labels via mapbox-gl-language
    if (window.MapboxLanguage) {
      const language = new window.MapboxLanguage({ defaultLanguage: 'zh-Hant' });
      map.addControl(language);
    }

    if (this.selected) this._applyHighlight(this.selected);
  }

  _applyHighlight(iso) {
    if (!this.map) return;
    const filter = iso ? ['==', ['get', this.joinProp], iso] : this._noMatchFilter;
    this.map.setFilter(HIGHLIGHT_FILL, filter);
    this.map.setFilter(HIGHLIGHT_LINE, filter);
  }

  /** Highlight a country's polygon; empty string clears the highlight. */
  highlightCountry(iso) {
    this.selected = iso || '';
    this._applyHighlight(this.selected);
  }

  /** Move the camera to a country's bounds (from countries.json bbox). */
  flyToCountry(iso) {
    if (!this.map) return;
    const rec = this.countries[iso];
    if (!rec || !Array.isArray(rec.bbox)) return;
    const [w, s, e, n] = rec.bbox;
    this.map.fitBounds([[w, s], [e, n]], { padding: 48, maxZoom: 6, duration: 900 });
  }

  /** Select = fly + highlight together (keeps the two in sync). */
  selectCountry(iso) {
    this.highlightCountry(iso);
    this.flyToCountry(iso);
  }

  destroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
