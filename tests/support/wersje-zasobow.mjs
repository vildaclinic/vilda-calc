import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P-SW rata 1 (decyzja właściciela 2026-09-24): service worker trzyma wpisy z ?v= jako NIEZMIENNE,
// więc zmiana treści pliku bez podbicia ?v= nigdy nie dotrze do klienta z zainstalowaną aplikacją.
// Ten moduł liczy odcisk (SHA-256) każdego pliku ładowanego z ?v= — ze stron HTML i z plików JS
// w korzeniu (dynamiczne doładowania) — w jego NAJWYŻSZEJ wersji. Zapisany stan:
// tests/fixtures/wersje-zasobow.json; odświeżenie: node tests/scripts/wersje-zasobow.mjs --zapisz.

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PLIK_STANU = path.join(korzen, 'tests/fixtures/wersje-zasobow.json');
const WZORZEC = /(['"])([A-Za-z0-9_./-]+\.(?:js|css|mjs))\?v=(\d+)\1/g;
const POMIJANE = new Set(['service-worker-kalorii.js', 'vilda_smoke_tests.js']);

export function biezaceWersje() {
  const zrodla = fs.readdirSync(korzen)
    .filter((f) => (f.endsWith('.html') || f.endsWith('.js')) && !POMIJANE.has(f))
    .sort();
  const wersje = new Map();
  for (const f of zrodla) {
    for (const m of fs.readFileSync(path.join(korzen, f), 'utf8').matchAll(WZORZEC)) {
      const plik = m[2].replace(/^\.?\//, '');
      if (!fs.existsSync(path.join(korzen, plik))) continue;
      wersje.set(plik, Math.max(wersje.get(plik) || 0, Number(m[3])));
    }
  }
  const out = {};
  for (const plik of [...wersje.keys()].sort()) {
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(korzen, plik))).digest('hex');
    out[plik] = { v: wersje.get(plik), sha256 };
  }
  return out;
}

export function zapisaneWersje() {
  return JSON.parse(fs.readFileSync(PLIK_STANU, 'utf8'));
}
