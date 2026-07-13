// map.js
// MapEngine: a single interface with two interchangeable implementations
// (Mapbox GL JS / MapLibre GL JS). Both share the same GL-JS API surface, so
// most per-engine differences are just the global object, the token, and the
// default style. Highlighting is the one place they diverge on purpose: the
// Mapbox engine draws from Mapbox's own official country-boundaries tileset
// (pixel-accurate against its basemap, covers every country); the MapLibre
// engine draws from the bundled world-countries GeoJSON, since MapLibre has
// no access to Mapbox's proprietary tileset.

const GEOJSON_URL = new URL('../data/world-countries.geojson', import.meta.url);
const ACCENT = '#2563eb';

const HIGHLIGHT_SRC = 'country-boundaries';
const HIGHLIGHT_FILL = 'country-highlight-fill';
const HIGHLIGHT_LINE = 'country-highlight-line';

const ENGINE_CONFIG = {
  maplibre: {
    global: 'maplibregl',
    // Free, token-less demo tiles — the reason MapLibre is the default engine.
    style: 'https://demotiles.maplibre.org/style.json',
    needsToken: false,
    boundary: { type: 'geojson', joinProp: 'iso_a2' },
  },
  mapbox: {
    global: 'mapboxgl',
    style: 'mapbox://styles/mapbox/light-v11',
    needsToken: true,
    // Mapbox's own official admin-0 boundaries — same source as its basemap
    // coastlines, so the highlight always lines up exactly, for any country.
    boundary: {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
      sourceLayer: 'country_boundaries',
      joinProp: 'iso_3166_1',
    },
  },
};

/** Resolve a Mapbox token from opt-in config only; never hardcode a token. */
function resolveMapboxToken() {
  const fromGlobal = typeof window !== 'undefined' && window.WORLD_ALMANAC_MAPBOX_TOKEN;
  if (typeof fromGlobal === 'string' && fromGlobal.trim()) return fromGlobal.trim();
  const fromUrl = new URLSearchParams(location.search).get('mbtoken');
  if (fromUrl && fromUrl.trim()) return fromUrl.trim();
  return '';
}

export const DEFAULT_ENGINE = 'maplibre';

export function engineAvailable(engineName) {
  const cfg = ENGINE_CONFIG[engineName];
  if (!cfg) return false;
  if (typeof window === 'undefined' || !window[cfg.global]) return false;
  if (cfg.needsToken && !resolveMapboxToken()) return false;
  return true;
}

export class MapEngine {
  /**
   * @param {HTMLElement} container
   * @param {string} engineName 'maplibre' | 'mapbox'
   * @param {object} countries  ISO -> { bbox: [w,s,e,n] }
   */
  constructor(container, engineName, countries) {
    this.container = container;
    this.engineName = engineName;
    this.countries = countries || {};
    this.selected = '';
    this.map = null;
    this._ready = this._build();
  }

  ready() {
    return this._ready;
  }

  async _build() {
    const cfg = ENGINE_CONFIG[this.engineName];
    if (!cfg) throw new Error(`unknown engine: ${this.engineName}`);
    const gl = window[cfg.global];
    if (!gl) throw new Error(`${cfg.global} not loaded`);

    if (cfg.needsToken) {
      const token = resolveMapboxToken();
      if (!token) {
        const err = new Error('mapbox-token-missing');
        err.code = 'MAPBOX_TOKEN_MISSING';
        throw err;
      }
      gl.accessToken = token;
    }

    const map = new gl.Map({
      container: this.container,
      style: cfg.style,
      center: [10, 25],
      zoom: 1.3,
      attributionControl: true,
    });
    this.map = map;

    await new Promise((resolve, reject) => {
      map.on('load', resolve);
      map.on('error', (e) => {
        // Surface style/tile load failures instead of failing silently.
        if (e && e.error) console.warn('[map] error:', e.error.message || e.error);
      });
      // Guard against a style that never loads.
      setTimeout(() => reject(new Error('map load timeout')), 15000).unref?.();
    });

    const boundary = cfg.boundary;
    this.joinProp = boundary.joinProp;
    const noMatch = ['==', ['get', boundary.joinProp], '__none__'];
    this._noMatchFilter = noMatch;

    if (boundary.type === 'vector') {
      map.addSource(HIGHLIGHT_SRC, { type: 'vector', url: boundary.url });
    } else {
      const geo = await (await fetch(GEOJSON_URL)).json();
      map.addSource(HIGHLIGHT_SRC, { type: 'geojson', data: geo });
    }

    const layerBase = { source: HIGHLIGHT_SRC, filter: noMatch };
    if (boundary.type === 'vector') layerBase['source-layer'] = boundary.sourceLayer;

    map.addLayer({ id: HIGHLIGHT_FILL, type: 'fill', paint: { 'fill-color': ACCENT, 'fill-opacity': 0.45 }, ...layerBase });
    map.addLayer({ id: HIGHLIGHT_LINE, type: 'line', paint: { 'line-color': ACCENT, 'line-width': 1.5 }, ...layerBase });

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
