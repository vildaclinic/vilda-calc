import { describe, it, expect } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Silnik modułu obwodów po naprawie etapu 1 (audyt 2026-08-16):
// centyl i z-score z JEDNEJ interpolacji wartość↔z po punktach percentylowych
// (p3..p97 ↔ z=−1,88..+1,88), ścieżka noworodkowa ocenia URODZENIOWY obwód
// głowy z zapisu SGA (płeć wg zapisu SGA), ogony bez pseudocentyli 0/100.

function loadCirc(extra = {}) {
  const g = Object.assign({ vildaOnReady: () => {} }, extra);
  return loadBrowserScript('circumference_module.js', g).VildaCircumference;
}

describe('silnik regularny: spójność centyla i z-score (tabele IMiD)', () => {
  const api = loadCirc();

  it('wartość na p50 daje z≈0 i centyl≈50 — także dla skośnych tabel klatki', () => {
    // klatka chłopcy 15 lat: p50=79,4, ale mean=80,15 — stary z-score z mean/SD
    // dawał −0,11 dla dziecka dokładnie na 50. centylu (rozjazd z centylem)
    const r = api.assessRegular('chest', 79.4, 'M', 15);
    expect(r.ok).toBe(true);
    expect(r.zScore).toBeCloseTo(0, 5);
    expect(r.perc).toBeCloseTo(50, 3);
  });

  it('błędny wiersz danych klatki K 6 mies. (mean/SD skopiowane z głowy) nie wpływa już na wynik', () => {
    // p50 klatki K w 6. mies. = 42,5; skorumpowane mean=42,81/SD=1,13 nie są używane
    const r = api.assessRegular('chest', 42.5, 'K', 0.5);
    expect(r.zScore).toBeCloseTo(0, 5);
    expect(r.perc).toBeCloseTo(50, 3);
  });

  it('wartość na p97 daje z≈1,88 i centyl≈97; na p3 z≈−1,88 i centyl≈3', () => {
    // głowa chłopcy 12 mies.: p3=45,0, p97=50,0
    const hi = api.assessRegular('head', 50.0, 'M', 1);
    expect(hi.zScore).toBeCloseTo(1.88079, 4);
    expect(hi.perc).toBeCloseTo(97, 1);
    const lo = api.assessRegular('head', 45.0, 'M', 1);
    expect(lo.zScore).toBeCloseTo(-1.88079, 4);
    expect(lo.perc).toBeCloseTo(3, 1);
  });

  it('ogony: poza p3/p97 centyl pozostaje w (0,3) lub (97,100) — nigdy dokładnie 0/100', () => {
    const far = api.assessRegular('head', 58, 'M', 1); // >> p97=50
    expect(far.perc).toBeGreaterThan(97);
    expect(far.perc).toBeLessThan(100);
    expect(far.zScore).toBeGreaterThan(1.88079);
    const tiny = api.assessRegular('head', 40, 'M', 1); // << p3=45
    expect(tiny.perc).toBeGreaterThan(0);
    expect(tiny.perc).toBeLessThan(3);
    expect(tiny.zScore).toBeLessThan(-1.88079);
  });

  it('klasyfikacja progowa bez zmian: 3/10/90/97', () => {
    expect(api.classify(2.9)).toEqual({ cat: 'very_low', severity: 'danger' });
    expect(api.classify(5).cat).toBe('low');
    expect(api.classify(50).cat).toBe('normal');
    expect(api.classify(95).cat).toBe('high');
    expect(api.classify(97.5)).toEqual({ cat: 'very_high', severity: 'danger' });
  });

  it('interpolacja wieku klamruje na brzegach tabeli (1 mies. i 18 lat)', () => {
    expect(api.interpolateRow(api.tables.headM, 0.02).p50).toBe(api.tables.headM[0].p50);
    expect(api.interpolateRow(api.tables.headM, 25).p50).toBe(api.tables.headM.at(-1).p50);
  });
});

describe('ścieżka noworodkowa: ocena wielkości urodzeniowej z zapisu SGA', () => {
  // Sztuczna tabela INTERGROWTH: kanały z=−3..+3 co 1,2 cm wokół 34,6
  const ZS = { female: { head: { '40+0': [31, 32.2, 33.4, 34.6, 35.8, 37, 38.2] } }, male: { head: {} } };

  function loadNewborn(byId, radio) {
    return loadCirc({
      SGA_INTERGROWTH_ZS: ZS,
      VildaPersistence: { readSharedPersist: () => ({ byId, radio }) },
    });
  }

  it('ocenia URODZENIOWY obwód głowy (sgaBirthHead), nie bieżący pomiar; płeć z zapisu SGA', () => {
    const api = loadNewborn(
      { sgaBirthWeeks: '40', sgaBirthDays: '0', sgaBirthHead: '35' },
      { sgaBirthSex: 'female' }
    );
    // #sex formularza mówi 'M', ale tabela istnieje tylko dla female — wynik
    // musi pochodzić z płci zapisanej w SGA
    const r = api.assessNewborn(99, 'M'); // 99 = bieżący pomiar, ma być zignorowany
    expect(r.ok).toBe(true);
    expect(r.birth).toBe(true);
    expect(r.value).toBe(35);
    expect(r.zScore).toBeCloseTo((35 - 34.6) / 1.2, 5);
    expect(r.sourceHtml).toContain('Ocena wielkości urodzeniowej');
    expect(r.sourceHtml).toContain('nie jest oceniany');
  });

  it('GA poza pokryciem tabel → czytelny komunikat zamiast fałszywego „uzupełnij wiek ciążowy"', () => {
    const api = loadNewborn(
      { sgaBirthWeeks: '23', sgaBirthDays: '0', sgaBirthHead: '21' },
      { sgaBirthSex: 'female' }
    );
    const r = api.assessNewborn(21, 'K');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('newborn-ga-range');
    expect(r.message).toContain('poza pokryciem');
  });

  it('brak zapisanego urodzeniowego obwodu głowy → komunikat kierujący do karty SGA', () => {
    const api = loadNewborn({ sgaBirthWeeks: '40', sgaBirthDays: '0' }, { sgaBirthSex: 'female' });
    const r = api.assessNewborn(36, 'K');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('newborn-head-missing');
  });

  it('brak danych SGA w ogóle → null (komunikat zbiorczy daje wywołujący)', () => {
    const api = loadCirc({ VildaPersistence: { readSharedPersist: () => null } });
    expect(api.assessNewborn(36, 'K')).toBeNull();
  });
});
