// data-adapter.js
// Single entry-retrieval contract: getEntry(iso) -> CountryEntry | null
//
// This is the ONLY data seam between the map/panel layers and the source.
// Today it reads a bundled mock JSON. To ship real 世界年鑑 data, replace the
// contents of data/almanac.mock.json (or repoint ALMANAC_URL) with data that
// conforms to the same CountryEntry schema — no map/panel code changes needed.
//
// CountryEntry = {
//   iso, name_zh, name_en, flag,
//   factbox: [{ label, value }],
//   sections: [ TimelineSection | ArticleSection ]
// }

const ALMANAC_URL = new URL('../data/almanac.mock.json', import.meta.url);

let _cache = null;

async function loadAll() {
  if (_cache) return _cache;
  const res = await fetch(ALMANAC_URL);
  if (!res.ok) throw new Error(`almanac load failed: ${res.status}`);
  _cache = await res.json();
  return _cache;
}

/** Normalize any input to a canonical ISO 3166-1 alpha-2 key, or "" if invalid. */
export function normalizeIso(iso) {
  if (typeof iso !== 'string') return '';
  const s = iso.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : '';
}

/**
 * Retrieve one country's entry.
 * @param {string} iso ISO 3166-1 alpha-2 code (case-insensitive)
 * @returns {Promise<object|null>} the entry, or null when unknown / invalid
 */
export async function getEntry(iso) {
  const key = normalizeIso(iso);
  if (!key) return null;
  const all = await loadAll();
  return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
}

/** True when an entry exists for this ISO (used to style search results). */
export async function hasEntry(iso) {
  return (await getEntry(iso)) !== null;
}
