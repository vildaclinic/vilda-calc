import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P-SW rata 1 (decyzja właściciela 2026-09-24): service worker trzyma wpisy z ?v= jako NIEZMIENNE,
// więc zmiana treści pliku bez podbicia ?v= nigdy nie dotrze do klienta z zainstalowaną aplikacją.
// Ten moduł liczy odcisk (SHA-256) każdego pliku ładowanego z ?v= — ze stron HTML i z plików JS
// w korzeniu (dynamiczne doładowania) — w jego NAJWYŻSZEJ wersji. Zapisany stan:
// tests/fixtures/wersje-zasobow.json; odświeżenie: node tests/scripts/wersje-zasobow.mjs --zapisz.
// Podbicie wersji względem bazy (origin/audyt): npm run podbij-wersje (tests/support/podbij-wersje.mjs).

export const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WZGLEDNY_PLIK_STANU = 'tests/fixtures/wersje-zasobow.json';
export const PLIK_STANU = path.join(korzen, WZGLEDNY_PLIK_STANU);
export const WZORZEC_WERSJI = /(['"])([A-Za-z0-9_./-]+\.(?:js|css|mjs))\?v=(\d+)\1/g;
const POMIJANE = new Set(['service-worker-kalorii.js', 'vilda_smoke_tests.js']);

/** Czy plik z korzenia jest źródłem wersji (strona HTML albo skrypt doładowujący zasoby). */
export function czyZrodloWersji(plik) {
  return (plik.endsWith('.html') || plik.endsWith('.js')) && !POMIJANE.has(plik);
}

/** Najwyższe ?v= każdego istniejącego pliku w podanych źródłach; czytaj(plik) oddaje treść albo null. */
export function skanujWersje(zrodla, czytaj, istnieje) {
  const wersje = new Map();
  for (const f of zrodla) {
    const tresc = czytaj(f);
    if (tresc == null) continue;
    for (const m of tresc.toString('utf8').matchAll(WZORZEC_WERSJI)) {
      const plik = m[2].replace(/^\.?\//, '');
      if (!istnieje(plik)) continue;
      wersje.set(plik, Math.max(wersje.get(plik) || 0, Number(m[3])));
    }
  }
  return wersje;
}

export function biezaceWersje(katalog = korzen) {
  const zrodla = fs.readdirSync(katalog).filter(czyZrodloWersji).sort();
  const wersje = skanujWersje(
    zrodla,
    (f) => fs.readFileSync(path.join(katalog, f), 'utf8'),
    (plik) => fs.existsSync(path.join(katalog, plik)),
  );
  const out = {};
  for (const plik of [...wersje.keys()].sort()) {
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(katalog, plik))).digest('hex');
    out[plik] = { v: wersje.get(plik), sha256 };
  }
  return out;
}

export function zapisaneWersje(katalog = korzen) {
  return JSON.parse(fs.readFileSync(path.join(katalog, WZGLEDNY_PLIK_STANU), 'utf8'));
}
