import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bezKomentarzy } from '../support/silnik-bmi.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const testy = path.join(korzen, 'tests');

// STRAŻNIK FAŁSZYWYCH BRAMEK (2026-09-19).
//
// page.waitForFunction z predykatem `async` NIE CZEKA: predykat oddaje `Promise`, a `Promise`
// jest zawsze prawdziwy, więc bramka przepuszcza na pierwszym sprawdzeniu. Zmierzone osobnym
// eksperymentem w Chromium: predykat `async` zwracający ZAWSZE `false` przechodził po 341 ms,
// jego synchroniczny odpowiednik poprawnie czekał do timeoutu 3026 ms.
//
// Wzorzec siedział w trzech plikach e2e i we wszystkich trzech bramka była pusta. Skutek
// widoczny w pełnych przebiegach: test scalania duplikatów czytał rekord docelowy w połowie
// scalania i widział 1 wersję zamiast 4 (odtworzone 3 razy na 6 powtórzeń przy 6 workerach).
// Sam sejf był poprawny — mergePatients przepina wersje PRZED skasowaniem rekordu źródłowego.
//
// Czekanie na stan sejfu należy robić po stronie Node (tests/support/sejf-czekanie.mjs),
// gdzie `await` działa.

/** Wszystkie pliki .mjs w tests/ (rekurencyjnie). */
function plikiTestowe(katalog) {
  const out = [];
  for (const wpis of fs.readdirSync(katalog, { withFileTypes: true })) {
    const p = path.join(katalog, wpis.name);
    if (wpis.isDirectory()) out.push(...plikiTestowe(p));
    else if (wpis.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/** Wiersz jest prozą, nie kodem (komentarz liniowy albo ciało bloku /** … *\/). */
const proza = (w) => {
  const t = w.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
};

describe('strażnik: bramka, która nie czeka', () => {
  // Wzorzec składany z kawałków, żeby ten plik nie łapał sam siebie.
  const WZORZEC = new RegExp('waitForFunction\\(\\s*' + 'async' + '\\b');

  it('żaden test nie używa page.waitForFunction z predykatem asynchronicznym', () => {
    const pliki = plikiTestowe(testy);
    expect(pliki.length, 'skaner znalazł pliki testowe').toBeGreaterThan(50);

    const trafienia = [];
    for (const p of pliki) {
      const wiersze = bezKomentarzy(fs.readFileSync(p, 'utf8')).split('\n');
      wiersze.forEach((w, i) => {
        if (!proza(w) && WZORZEC.test(w)) trafienia.push(`${path.relative(korzen, p)}:${i + 1}`);
      });
    }
    expect(trafienia, 'taka bramka przepuszcza od razu — czekaj przez expect.poll w Node').toEqual([]);
  });

  it('kontrola negatywna: wzorzec faktycznie łapie taki zapis', () => {
    // Próbki składane z kawałków — inaczej ten plik złapałby sam siebie, a strażnik ma
    // obejmować WSZYSTKIE pliki testowe, łącznie z własnym.
    const zly = 'await page.waitForFunction(' + 'async () => true);';
    const zlyZArg = 'await page.waitForFunction(' + 'async (x) => x);';
    const dobry = 'await page.waitForFunction(() => true);';
    expect(WZORZEC.test(zly)).toBe(true);
    expect(WZORZEC.test(zlyZArg)).toBe(true);
    expect(WZORZEC.test(dobry), 'synchroniczny jest w porządku').toBe(false);
  });

  it('pomocnik do czekania na sejf istnieje i nie używa zakazanego wzorca', () => {
    const p = path.join(testy, 'support', 'sejf-czekanie.mjs');
    expect(fs.existsSync(p), 'tests/support/sejf-czekanie.mjs').toBe(true);
    const kod = bezKomentarzy(fs.readFileSync(p, 'utf8'));
    expect(kod).toContain('expect');
    expect(kod).toContain('poll');
    for (const w of kod.split('\n')) {
      if (!proza(w)) expect(WZORZEC.test(w), `pomocnik sam używa złej bramki: ${w.trim()}`).toBe(false);
    }
  });
});
