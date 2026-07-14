// geocode-capitals.mjs
// One-off enrichment: parses each country's capital name out of its 首都
// factbox value in data/almanac.mock.json, geocodes it via the Mapbox
// Geocoding API, and stores the result as countries.json[iso].capital =
// { name, lat, lng }. Used by src/map.js to render capital-city markers.
//
// Run manually: node scripts/geocode-capitals.mjs
// Requires a Mapbox token — reads it out of config.local.js the same way
// the browser does (window.WORLD_ALMANAC_MAPBOX_TOKEN), or accepts
// MAPBOX_TOKEN as an env var. Never hardcode a token in this file.
//
// Idempotent: skips any country whose countries.json entry already has a
// capital.name matching the freshly-parsed name, so re-runs don't burn API
// quota re-geocoding unchanged capitals.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ALMANAC_PATH = path.join(ROOT, 'data', 'almanac.mock.json');
const COUNTRIES_PATH = path.join(ROOT, 'data', 'countries.json');
const CONFIG_LOCAL_PATH = path.join(ROOT, 'config.local.js');

function resolveMapboxToken() {
  if (process.env.MAPBOX_TOKEN && process.env.MAPBOX_TOKEN.trim()) {
    return process.env.MAPBOX_TOKEN.trim();
  }
  if (fs.existsSync(CONFIG_LOCAL_PATH)) {
    const text = fs.readFileSync(CONFIG_LOCAL_PATH, 'utf-8');
    const m = /WORLD_ALMANAC_MAPBOX_TOKEN\s*=\s*['"]([^'"]+)['"]/.exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

// Countries where 特別行政區/administrative-region text explicitly states
// there is no separate capital (Hong Kong, Macau) — skip geocoding entirely,
// there is nothing real to place a marker at.
function isNoCapitalText(value) {
  return /無另設首都/.test(value);
}

// Extract the geocoding-friendly name from a 首都 factbox value. CJK capital
// names are unreliable to geocode on their own (see geocodeCapital's
// relevance check below — a bare CJK transliteration can fuzzy-match a
// wrong place in a wrong country with low confidence). Romanized
// (Latin-script) names geocode far more reliably, so this always prefers
// the LAST Latin-script run found anywhere in the value, falling back to
// the raw CJK text only when no Latin script is present at all.
//   "東京（Tokyo）"                                      -> "Tokyo"
//   "努山塔拉（Nusantara）2024年8月17日遷都"                -> "Nusantara"
//   "努爾蘇丹（...改名為努爾蘇丹Nur-Sultan）"                -> "Nur-Sultan" (last Latin run, not the CJK name before the parens)
//   "北京"                                                -> "北京" (no Latin script anywhere; use CJK as-is)
const LATIN_RUN_RE = /[A-Za-z][A-Za-z\s.'-]*[A-Za-z]|[A-Za-z]/g;

function parseCapitalName(value) {
  if (!value || isNoCapitalText(value)) return null;
  const latinRuns = value.match(LATIN_RUN_RE);
  if (latinRuns && latinRuns.length > 0) {
    return latinRuns[latinRuns.length - 1].trim();
  }
  const trimmed = value.trim();
  return trimmed || null;
}

// Reject low-confidence fuzzy matches (e.g. a CJK/ambiguous query returning
// an unrelated place in a wholly different country at relevance ~0.5) rather
// than silently accepting garbage coordinates.
const MIN_RELEVANCE = 0.8;

// Mapbox classifies some national capitals as 'region' rather than 'place'
// (e.g. Port Moresby, Lilongwe) — restricting to types=place alone silently
// excludes them and falls through to unrelated low-relevance matches.
async function geocodeCapital(name, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?types=place,region,locality&limit=1&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feature = json.features && json.features[0];
  if (!feature || !Array.isArray(feature.center)) return null;
  if (typeof feature.relevance === 'number' && feature.relevance < MIN_RELEVANCE) return null;
  const [lng, lat] = feature.center;
  return { lat, lng };
}

async function main() {
  const token = resolveMapboxToken();
  if (!token) {
    console.error('No Mapbox token found (MAPBOX_TOKEN env var or config.local.js). Aborting.');
    process.exit(1);
  }

  const almanac = JSON.parse(fs.readFileSync(ALMANAC_PATH, 'utf-8'));
  const countries = JSON.parse(fs.readFileSync(COUNTRIES_PATH, 'utf-8'));

  let geocoded = 0;
  let skippedCached = 0;
  let skippedNoCapital = 0;
  let failed = 0;
  const failures = [];

  for (const [iso, entry] of Object.entries(almanac)) {
    const factbox = entry.factbox || [];
    const capField = factbox.find((f) => f.label === '首都');
    if (!capField) continue;

    const capitalName = parseCapitalName(capField.value);
    if (!capitalName) {
      skippedNoCapital++;
      continue;
    }

    const existing = countries[iso];
    if (existing && existing.capital && existing.capital.name === capitalName) {
      skippedCached++;
      continue;
    }

    try {
      const coords = await geocodeCapital(capitalName, token);
      if (!coords) {
        failed++;
        failures.push(`${iso} (${capitalName}): no geocoding result`);
        continue;
      }
      if (!countries[iso]) countries[iso] = { iso, name_zh: entry.name_zh, name_en: entry.name_en };
      countries[iso].capital = { name: capitalName, lat: coords.lat, lng: coords.lng };
      geocoded++;
    } catch (err) {
      failed++;
      failures.push(`${iso} (${capitalName}): ${err.message}`);
    }
  }

  fs.writeFileSync(COUNTRIES_PATH, `${JSON.stringify(countries, null, 2)}\n`, 'utf-8');

  console.log(`Geocoded: ${geocoded}`);
  console.log(`Skipped (already cached): ${skippedCached}`);
  console.log(`Skipped (no capital concept, e.g. HK/MO): ${skippedNoCapital}`);
  console.log(`Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  ${f}`));
  }
}

main();
