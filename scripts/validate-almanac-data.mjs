// Validates that generated almanac data is traceable to the 03_HTML source set.
//
// Run manually after extraction:
//   node scripts/validate-almanac-data.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ALMANAC_PATH = path.join(ROOT, 'data', 'almanac.mock.json');
const RECENT_MIN_YEAR = 2021;
const RECENT_MAX_YEAR = 2025;

function yearFromDate(date) {
  const m = /^(\d{4})(?:-\d{2})?(?:-\d{2})?$/.exec(String(date || ''));
  return m ? Number(m[1]) : null;
}

function sourceFileExists(source) {
  if (!source || typeof source.file !== 'string') return false;
  if (!source.file.startsWith('03_HTML/')) return false;
  return fs.existsSync(path.join(ROOT, source.file));
}

function main() {
  const almanac = JSON.parse(fs.readFileSync(ALMANAC_PATH, 'utf-8'));
  const issues = [];
  const warnings = [];
  let eventCount = 0;
  let sourcedEventCount = 0;
  let entriesWithoutTimeline = 0;

  for (const [iso, entry] of Object.entries(almanac)) {
    if (!/^[A-Z]{2}$/.test(iso)) issues.push(`${iso}: invalid ISO key`);
    if (!sourceFileExists(entry.source)) {
      issues.push(`${iso}: entry.source.file must point to an existing 03_HTML file`);
    }

    const timelineSections = Array.isArray(entry.sections)
      ? entry.sections.filter((s) => s && s.type === 'timeline')
      : [];

    if (timelineSections.length === 0) {
      entriesWithoutTimeline++;
      warnings.push(`${iso}: no source-backed timeline event extracted`);
      continue;
    }

    for (const section of timelineSections) {
      const isRecentSection = String(section.title || '').includes('近年');
      const events = Array.isArray(section.events) ? section.events : [];
      if (events.length === 0) issues.push(`${iso}: timeline section has no events`);

      for (const event of events) {
        eventCount++;
        const prefix = `${iso} ${event.date || '(no date)'}`;
        const year = yearFromDate(event.date);
        if (year == null) issues.push(`${prefix}: invalid date format`);
        if (isRecentSection && (year < RECENT_MIN_YEAR || year > RECENT_MAX_YEAR)) {
          issues.push(`${prefix}: ${section.title} contains non-recent event`);
        }
        if (!event.title || !event.desc) {
          issues.push(`${prefix}: event must have title and desc`);
        }
        if (/^(復交|斷交|建交|來訪|訪台|訪問|簽署|簽訂)$/.test(String(event.title || '').trim())) {
          issues.push(`${prefix}: title is too context-free (${event.title})`);
        }
        if (String(event.title || '').trim().length < 4) {
          warnings.push(`${prefix}: title is very short (${event.title || ''})`);
        }
        if (!sourceFileExists(event.source)) {
          issues.push(`${prefix}: event.source.file must point to an existing 03_HTML file`);
        } else if (!event.source.section || !event.source.quote) {
          issues.push(`${prefix}: event.source must include section and quote`);
        } else {
          sourcedEventCount++;
        }
      }
    }
  }

  console.log(`Entries: ${Object.keys(almanac).length}`);
  console.log(`Events: ${eventCount}`);
  console.log(`Source-backed events: ${sourcedEventCount}`);
  console.log(`Entries without timeline: ${entriesWithoutTimeline}`);
  console.log(`Warnings: ${warnings.length}`);
  warnings.slice(0, 30).forEach((w) => console.log(`  [warn] ${w}`));
  if (warnings.length > 30) console.log(`  ... ${warnings.length - 30} more warnings`);

  if (issues.length > 0) {
    console.error(`Validation failed: ${issues.length} issue(s)`);
    issues.slice(0, 80).forEach((issue) => console.error(`  [fail] ${issue}`));
    if (issues.length > 80) console.error(`  ... ${issues.length - 80} more issues`);
    process.exit(1);
  }

  console.log('Validation passed');
}

main();
