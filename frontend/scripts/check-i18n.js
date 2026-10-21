import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const localesDir = path.resolve(__dirname, '../src/i18n/locales');
const enPath = path.join(localesDir, 'en.json');
const hiPath = path.join(localesDir, 'hi.json');
const knPath = path.join(localesDir, 'kn.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const hi = JSON.parse(fs.readFileSync(hiPath, 'utf8'));
const kn = JSON.parse(fs.readFileSync(knPath, 'utf8'));

function getKeys(obj, prefix = '') {
  let keys = [];
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
      keys = keys.concat(getKeys(obj[k], full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const enKeys = new Set(getKeys(en));
const hiKeys = new Set(getKeys(hi));
const knKeys = new Set(getKeys(kn));

let hasError = false;

const missingInHi = [...enKeys].filter((k) => !hiKeys.has(k));
const missingInKn = [...enKeys].filter((k) => !knKeys.has(k));
const extraInHi = [...hiKeys].filter((k) => !enKeys.has(k));
const extraInKn = [...knKeys].filter((k) => !enKeys.has(k));

if (missingInHi.length > 0) {
  console.error(`Missing in hi.json (${missingInHi.length} keys):`, missingInHi);
  hasError = true;
}
if (missingInKn.length > 0) {
  console.error(`Missing in kn.json (${missingInKn.length} keys):`, missingInKn);
  hasError = true;
}
if (extraInHi.length > 0) {
  console.warn(`Extra keys in hi.json not in en.json (${extraInHi.length} keys):`, extraInHi);
  hasError = true;
}
if (extraInKn.length > 0) {
  console.warn(`Extra keys in kn.json not in en.json (${extraInKn.length} keys):`, extraInKn);
  hasError = true;
}

if (hasError) {
  console.error('i18n:check failed: Locale key mismatch found.');
  process.exit(1);
} else {
  console.log(`i18n:check passed: All locales (en, hi, kn) match perfectly (${enKeys.size} keys).`);
  process.exit(0);
}
