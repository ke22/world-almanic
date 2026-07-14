// geocode-country-bboxes.mjs
// One-off enrichment: geocodes each country's name_en via the Mapbox
// Geocoding API (types=country) and stores the returned bounding box as
// countries.json[iso].bbox = [w, s, e, n]. src/map.js's flyToCountry()
// uses this to pan/zoom the camera to a selected country.
//
// Fixes a long-standing gap: only 8/199 countries.json entries ever had a
// bbox (US, FR, ES, PT, NL, TH, VN, UA — seeded manually before the
// extraction pipeline existed). Every other country silently never
// received a camera fly-to on selection, since flyToCountry() no-ops
// without a bbox.
//
// Run manually: node scripts/geocode-country-bboxes.mjs
// Requires a Mapbox token — reads it out of config.local.js the same way
// geocode-capitals.mjs does, or accepts MAPBOX_TOKEN as an env var.
//
// Idempotent: skips any country that already has a bbox, so re-runs only
// fill in gaps rather than re-querying the whole dataset.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
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

const MIN_RELEVANCE = 0.8;

async function geocodeCountryBbox(nameEn, token) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(nameEn)}.json?types=country,region&limit=1&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feature = json.features && json.features[0];
  if (!feature || !Array.isArray(feature.bbox)) return null;
  if (typeof feature.relevance === 'number' && feature.relevance < MIN_RELEVANCE) return null;
  return feature.bbox;
}

async function main() {
  const token = resolveMapboxToken();
  if (!token) {
    console.error('No Mapbox token found (MAPBOX_TOKEN env var or config.local.js). Aborting.');
    process.exit(1);
  }

  const countries = JSON.parse(fs.readFileSync(COUNTRIES_PATH, 'utf-8'));

  let geocoded = 0;
  let skippedCached = 0;
  let failed = 0;
  const failures = [];

  for (const [iso, rec] of Object.entries(countries)) {
    if (Array.isArray(rec.bbox)) {
      skippedCached++;
      continue;
    }
    const nameEn = rec.name_en;
    if (!nameEn) {
      failed++;
      failures.push(`${iso}: no name_en to geocode`);
      continue;
    }

    try {
      const bbox = await geocodeCountryBbox(nameEn, token);
      if (!bbox) {
        failed++;
        failures.push(`${iso} (${nameEn}): no geocoding result`);
        continue;
      }
      rec.bbox = bbox;
      geocoded++;
    } catch (err) {
      failed++;
      failures.push(`${iso} (${nameEn}): ${err.message}`);
    }
  }

  fs.writeFileSync(COUNTRIES_PATH, `${JSON.stringify(countries, null, 2)}\n`, 'utf-8');

  console.log(`Geocoded: ${geocoded}`);
  console.log(`Skipped (already cached): ${skippedCached}`);
  console.log(`Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log(`  ${f}`));
  }
}

main();
