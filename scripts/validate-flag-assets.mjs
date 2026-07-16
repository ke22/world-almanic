#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data', 'almanac.mock.json');
const emojiDir = path.join(root, 'emoji');

const assetOverrides = {
  // XK is intentionally supported as the Kosovo regional-indicator convention.
  XK: '1f1fd-1f1f0.svg',
};

function flagAssetName(iso) {
  const code = String(iso || '').toUpperCase();
  if (assetOverrides[code]) return assetOverrides[code];
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return [...code]
    .map((char) => (0x1f1e6 + char.charCodeAt(0) - 65).toString(16))
    .join('-') + '.svg';
}

const entries = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const failures = [];

for (const iso of Object.keys(entries)) {
  const assetName = flagAssetName(iso);
  if (!assetName) {
    failures.push(`${iso}: unsupported ISO code`);
    continue;
  }

  const assetPath = path.join(emojiDir, assetName);
  if (!fs.existsSync(assetPath)) {
    failures.push(`${iso}: missing ${path.relative(root, assetPath)}`);
    continue;
  }

  const content = fs.readFileSync(assetPath, 'utf8').trimStart();
  if (!content.startsWith('<svg')) {
    failures.push(`${iso}: ${path.relative(root, assetPath)} is not an SVG`);
  }
}

if (failures.length) {
  console.error(`Flag asset validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Flag asset validation passed: ${Object.keys(entries).length} countries`);
