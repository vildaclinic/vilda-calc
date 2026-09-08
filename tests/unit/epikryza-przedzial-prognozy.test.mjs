import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireCjs = createRequire(import.meta.url);
const epikryza = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
const gen = (metrics, form) => epikryza.generate(metrics, form).text;

// Przedział przy prognozie wzrostu ostatecznego — decyzja właściciela 2026-09-07.
//
// Karta zaawansowana liczy błąd metody w dwóch polach: `errorSdCm` to JEDNO odchylenie
// standardowe, a `errorBoundHalfWidthCm` to półszerokość przedziału 90% (w silniku
// dosłownie `T = F * 1.645`). Karta i opis pacjenta pokazują wersję 90%; epikryza
// drukowała 1 SD, czyli przedział o 40% węższy dla tej samej prognozy — w dokumencie,
// który wychodzi z gabinetu. Do tego obiekt RWT nie ma pola `errorSdCm` w ogóle, więc
// RWT nie dostawał w epikryzie ŻADNEGO przedziału, choć na karcie ma ±4,4 cm.
//
// Po zmianie: epikryza czyta `errorBoundHalfWidthCm` i pisze wprost, jaki to przedział,
// bo samo „±" jest dwuznaczne niezależnie od tego, którą wielkość się wybierze.

const BAZA = { sex: 'M', ageYears: 10, ageMonths: 0 };

describe('Epikryza — przedział przy prognozie wzrostu ostatecznego', () => {
  it('pisze wprost, jaki to przedział, zamiast samego „±"', () => {
    const t = gen({ ...BAZA, predictions: { bp: { value: 170.3, error: 3.2, coverage: 90 } } }, {});
    expect(t).toContain('Prognozowany wzrost ostateczny metodą Bayley‑Pinneau wynosi 170,3 cm (przedział 90%: ±3,2 cm).');
    // Samo „(±3,2 cm)" bez nazwania przedziału jest tym, co naprawiamy.
    expect(t).not.toContain('cm (±3,2 cm)');
  });

  it('RWT też dostaje przedział — dotąd nie dostawał żadnego', () => {
    const t = gen({
      ...BAZA,
      predictions: {
        bp: { value: 170.3, error: 3.2, coverage: 90 },
        rwt: { value: 172.1, error: 4.4, coverage: 90 },
      },
    }, {});
    expect(t).toContain('metodą Bayley‑Pinneau wynosi 170,3 cm (przedział 90%: ±3,2 cm), a metodą RWT (Roche‑Wainer‑Thissen) 172,1 cm (przedział 90%: ±4,4 cm).');
  });

  it('pokrycie idzie z danych, nie z liczby wpisanej na sztywno', () => {
    const t = gen({ ...BAZA, predictions: { rwt: { value: 168, error: 5.1, coverage: 95 } } }, {});
    expect(t).toContain('metodą RWT (Roche‑Wainer‑Thissen) wynosi 168,0 cm (przedział 95%: ±5,1 cm).');
    // Brak pokrycia w danych → 90%, bo tyle wynosi domyślne pokrycie obu silników.
    const bezPokrycia = gen({ ...BAZA, predictions: { rwt: { value: 168, error: 5.1 } } }, {});
    expect(bezPokrycia).toContain('(przedział 90%: ±5,1 cm)');
  });

  it('kontrola pozytywna: prognoza bez przedziału nadal jest zdaniem bez nawiasu', () => {
    const t = gen({ ...BAZA, predictions: { bp: { value: 170.3, error: null } } }, {});
    expect(t).toContain('metodą Bayley‑Pinneau wynosi 170,3 cm.');
    expect(t).not.toContain('przedział');
    // Brak prognoz w ogóle — zdania nie ma, dokument bez zmian.
    expect(gen({ ...BAZA }, {})).not.toContain('Prognozowany wzrost ostateczny');
  });
});

describe('Kolektor epikryzy — czyta półszerokość 90%, nie jedno SD', () => {
  // Kolektor jest wyrażeniem wewnątrz Te() w vilda_epicrisis_ui.js — wycinamy jego
  // realny tekst i wykonujemy (konwencja z trajectory-analysis.test.mjs). `return`
  // zamieniamy na zwykłe wyrażenie, żeby dało się odczytać zbudowany obiekt.
  function kolektorPrognoz() {
    const src = fs.readFileSync(path.join(korzen, 'vilda_epicrisis_ui.js'), 'utf8');
    const start = src.indexOf('var K=e.bayleyPinneau||null');
    const end = src.indexOf(',{ageYears:i,', start);
    expect(start, 'znaleziono kolektor prognoz').toBeGreaterThan(-1);
    expect(end, 'znaleziono koniec kolektora').toBeGreaterThan(start);
    const frag = src.slice(start, end).replace(';return(', ';(');
    expect(frag, 'return zamieniony na wyrażenie').not.toContain(';return(');
    return new Function('e', `${frag};return H;`);
  }

  // Obiekt metody z karty zaawansowanej: OBA pola błędu naraz, żeby pomyłka była widoczna.
  const BP = {
    predictedAdultHeightCm: 170.3,
    errorSdCm: 1.9,                 // jedno odchylenie standardowe
    errorBoundHalfWidthCm: 3.2,     // półszerokość 90% = 1,645 × SD
    errorBoundsCoveragePercent: 90,
  };
  // RWT z karty nie ma errorSdCm w ogóle — stąd brak przedziału przed poprawką.
  const RWT = {
    predictedAdultHeightCm: 172.1,
    errorBoundHalfWidthCm: 4.4,
    errorBoundsCoveragePercent: 90,
  };

  it('bierze półszerokość 90%, a nie jedno SD', () => {
    const H = kolektorPrognoz()({ bayleyPinneau: BP, rwt: RWT });
    expect(H.bp.error, 'BP: przedział 90%, nie 1 SD').toBe(3.2);
    expect(H.bp.coverage).toBe(90);
    expect(H.rwt.error, 'RWT odzyskuje przedział').toBe(4.4);
    expect(H.rwt.coverage).toBe(90);
  });

  it('kontrola pozytywna: prognoza bez przedziału nadal przechodzi bez błędu', () => {
    const H = kolektorPrognoz()({ bayleyPinneau: { predictedAdultHeightCm: 165 } });
    expect(H.bp.value).toBe(165);
    expect(H.bp.error).toBeNull();
    expect(H.rwt).toBeUndefined();
  });
});
