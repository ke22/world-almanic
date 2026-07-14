// map.js
// MapEngine: Mapbox GL JS only implementation
// Highlights countries using Mapbox's official country-boundaries tileset
// Supports click-to-select and Traditional Chinese labels

const ACCENT = '#2563eb';
const CAPITAL_ACCENT = '#dc2626';

const HIGHLIGHT_SRC = 'country-boundaries';
const HIGHLIGHT_FILL = 'country-highlight-fill';
const HIGHLIGHT_LINE = 'country-highlight-line';
const HIT_LAYER = 'country-hit-layer';
const CAPITAL_SRC = 'capital-markers';
const CAPITAL_LAYER = 'capital-markers-layer';

const BOUNDARY = {
  type: 'vector',
  url: 'mapbox://mapbox.country-boundaries-v1',
  sourceLayer: 'country_boundaries',
  joinProp: 'iso_3166_1',
};

// country-boundaries-v1 ships multiple overlapping boundary features for
// disputed territories. Uncontested countries (e.g. Germany, France) have
// a single feature tagged worldview="all". Disputed territories (Taiwan,
// Kosovo, etc.) instead have SEVERAL features, each tagged with a
// comma-joined list of worldview codes that agree on that geometry — e.g.
// Taiwan's neutral/consensus boundary is tagged "AR,IN,JP,MA,RS,RU,TR,US"
// (a real observed value, confirmed via the Tilequery API), while the
// competing "China includes Taiwan" boundary is tagged plainly "CN". The
// field is NEVER just the bare string "US" on its own for these cases —
// an exact-equality match against 'US' therefore matches nothing, which
// would make every disputed territory (including Taiwan) fall through
// with no matching feature at all and become unclickable. The correct
// test is "US" as a SUBSTRING of the (possibly comma-joined) field, which
// Mapbox's `in` expression supports for two string operands, combined
// with the exact "all" case for uncontested countries.
const WORLDVIEW_FILTER = ['any', ['==', ['get', 'worldview'], 'all'], ['in', 'US', ['get', 'worldview']]];

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
   * @param {object} countries  ISO -> { bbox: [w,s,e,n], capital?: { name, lat, lng } }
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

    // Invisible fill layer for hit-testing clicks. Filtered to the same
    // single worldview variant as the highlight layers, so a click on
    // Taiwan's territory always resolves to TW, never to a CN-worldview
    // feature that happens to be drawn on top at that pixel.
    map.addLayer({
      id: HIT_LAYER,
      type: 'fill',
      source: HIGHLIGHT_SRC,
      'source-layer': BOUNDARY.sourceLayer,
      filter: WORLDVIEW_FILTER,
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

    // Capital-city markers: a small circle per country with a capital
    // field in countries.json, visually distinct (red) from the blue
    // highlight/hit layers. Countries with no capital field (HK/MO, or
    // any capital the geocoding pass could not resolve) simply have no
    // point in this GeoJSON and render no marker.
    // Use the countries.json key as the iso, not rec.iso — some entries
    // (e.g. US, FR, ES) omit the internal `iso` field even though the key
    // itself is the correct code, which would otherwise leave their
    // capital marker unmatchable by the per-selection filter below.
    const capitalFeatures = Object.entries(this.countries)
      .filter(([, rec]) => rec && rec.capital && typeof rec.capital.lat === 'number' && typeof rec.capital.lng === 'number')
      .map(([iso, rec]) => ({
        type: 'Feature',
        properties: { iso, name: rec.capital.name },
        geometry: { type: 'Point', coordinates: [rec.capital.lng, rec.capital.lat] },
      }));

    map.addSource(CAPITAL_SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: capitalFeatures },
    });

    // Hidden until a country is selected — only the selected country's
    // capital marker should ever be visible, not all 194 at once.
    this._capitalNoMatchFilter = ['==', ['get', 'iso'], '__none__'];

    map.addLayer({
      id: CAPITAL_LAYER,
      type: 'circle',
      source: CAPITAL_SRC,
      filter: this._capitalNoMatchFilter,
      paint: {
        'circle-radius': 4,
        'circle-color': CAPITAL_ACCENT,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      },
    });

    if (this.selected) this._applyHighlight(this.selected);
  }

  _applyHighlight(iso) {
    if (!this.map) return;
    const filter = iso
      ? ['all', ['==', ['get', this.joinProp], iso], WORLDVIEW_FILTER]
      : this._noMatchFilter;
    this.map.setFilter(HIGHLIGHT_FILL, filter);
    this.map.setFilter(HIGHLIGHT_LINE, filter);

    const capitalFilter = iso ? ['==', ['get', 'iso'], iso] : this._capitalNoMatchFilter;
    this.map.setFilter(CAPITAL_LAYER, capitalFilter);
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
