import { describe, it, expect } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Moduł „Proporcja masy do wysokości ciała" (weight-for-height) — Tabele 63–64 IMiD
// (Palczewska i Niedźwiedzka), chłopcy 50–195 cm, dziewczęta 50–185 cm, krok 5 cm.
// Silnik jak w obwodach: wiersz interpolowany po WZROŚCIE, z-score interpolacją
// wartość↔z po punktach percentylowych, centyl = Φ(z)·100.

function loadWfh() {
  return loadBrowserScript('wfh_module.js', { vildaOnReady: () => {} }).VildaWfh;
}

describe('silnik weight-for-height: spójność centyla i z-score', () => {
  const api = loadWfh();

  it('masa na p50 daje z≈0 i centyl≈50 (chłopcy 90 cm: 13,3 kg; dziewczęta 160 cm: 50,3 kg)', () => {
    const m = api.assess(13.3, 90, 'M', 1.2);
    expect(m.ok).toBe(true);
    expect(m.zScore).toBeCloseTo(0, 5);
    expect(m.perc).toBeCloseTo(50, 3);
    const k = api.assess(50.3, 160, 'K', 14);
    expect(k.zScore).toBeCloseTo(0, 5);
    expect(k.perc).toBeCloseTo(50, 3);
  });

  it('masa na p97/p3 daje z≈±1,88 i centyl≈97/3 (chłopcy 90 cm: 16,0 / 11,6 kg)', () => {
    const hi = api.assess(16.0, 90, 'M', 1.2);
    expect(hi.zScore).toBeCloseTo(1.88079, 4);
    expect(hi.perc).toBeCloseTo(97, 1);
    const lo = api.assess(11.6, 90, 'M', 1.2);
    expect(lo.zScore).toBeCloseTo(-1.88079, 4);
    expect(lo.perc).toBeCloseTo(3, 1);
  });

  it('ogony: poza p3/p97 centyl pozostaje w (0,3)/(97,100) — nigdy dokładnie 0/100', () => {
    const far = api.assess(22, 90, 'M', 1.2); // >> p97=16,0
    expect(far.perc).toBeGreaterThan(97);
    expect(far.perc).toBeLessThan(100);
    const tiny = api.assess(8, 90, 'M', 1.2); // << p3=11,6
    expect(tiny.perc).toBeGreaterThan(0);
    expect(tiny.perc).toBeLessThan(3);
  });

  it('interpolacja między wierszami: wzrost 92,5 cm daje p50 w połowie między 13,3 a 14,4', () => {
    const row = api.rowFor('M', 92.5);
    expect(row.p50).toBeCloseTo((13.3 + 14.4) / 2, 6);
  });

  it('mapowanie płci: ta sama masa/wzrost ocenia się z właściwej tabeli (M vs K)', () => {
    // 165 cm, 54,0 kg: chłopcy p50=54,0 (centyl 50), dziewczęta p50=54,6 (poniżej 50)
    const m = api.assess(54.0, 165, 'M', 15);
    expect(m.perc).toBeCloseTo(50, 3);
    const k = api.assess(54.0, 165, 'K', 15);
    expect(k.perc).toBeLessThan(50);
    expect(api.rowFor('male', 165).p50).toBe(api.rowFor('M', 165).p50);
    expect(api.rowFor('female', 165).p50).toBe(api.rowFor('K', 165).p50);
  });

  it('klasyfikacja progowa 3/10/90/97 jak w całej aplikacji', () => {
    expect(api.classify(2.9)).toEqual({ cat: 'very_low', severity: 'danger' });
    expect(api.classify(5).cat).toBe('low');
    expect(api.classify(50)).toEqual({ cat: 'normal', severity: '' });
    expect(api.classify(95).severity).toBe('warning');
    expect(api.classify(97.5)).toEqual({ cat: 'very_high', severity: 'danger' });
  });
});

describe('bramki walidacyjne', () => {
  const api = loadWfh();

  it('wzrost poza pokryciem tabel → height-range (bez klamrowania), z progiem wg płci (195 M / 185 K)', () => {
    expect(api.assess(3.5, 49, 'M', 0.2).reason).toBe('height-range');
    expect(api.assess(80, 196, 'M', 17).reason).toBe('height-range');
    expect(api.assess(80, 190, 'K', 17).reason).toBe('height-range');
    expect(api.assess(80, 190, 'M', 17).ok).toBe(true);
  });

  it('wiek > 18,5 r. → age-range; wiek < 1 mies. → kierowanie do modułu SGA', () => {
    expect(api.assess(70, 175, 'M', 19).reason).toBe('age-range');
    const nb = api.assess(3.5, 52, 'M', 0.01);
    expect(nb.reason).toBe('newborn');
    expect(nb.message).toContain('SGA');
    // wiek nieznany (NaN) nie blokuje oceny — liczy się z samej masy i wzrostu
    expect(api.assess(13.3, 90, 'M', NaN).ok).toBe(true);
  });

  it('masa poza wiarygodnym zakresem 1–200 kg → implausible-weight', () => {
    expect(api.assess(0.5, 90, 'M', 1.2).reason).toBe('implausible-weight');
    expect(api.assess(250, 170, 'M', 16).reason).toBe('implausible-weight');
  });
});

describe('jakość danych z digitalizacji (skan 300 dpi, Tabele 63–64)', () => {
  const api = loadWfh();

  it('każdy wiersz obu tabel ma rosnące percentyle p3<p10<p25<p50<p75<p90<p97', () => {
    const keys = ['p3', 'p10', 'p25', 'p50', 'p75', 'p90', 'p97'];
    for (const [name, tab] of [['male', api.tables.male], ['female', api.tables.female]]) {
      for (const row of tab) {
        for (let i = 0; i < keys.length - 1; i++) {
          expect(row[keys[i]], `${name} ${row.h} cm: ${keys[i]}<${keys[i + 1]}`).toBeLessThan(row[keys[i + 1]]);
        }
      }
    }
  });

  it('mediana p50 rośnie monotonicznie z wysokością w obu tabelach', () => {
    for (const tab of [api.tables.male, api.tables.female]) {
      for (let i = 0; i < tab.length - 1; i++) {
        expect(tab[i].p50).toBeLessThan(tab[i + 1].p50);
      }
    }
  });

  it('korekta transpozycji z druku: dziewczęta 75 cm mają p3=7,3 < p10=8,0', () => {
    const row = api.tables.female.find((r) => r.h === 75);
    expect(row.p3).toBe(7.3);
    expect(row.p10).toBe(8.0);
  });

  it('zakresy tabel: chłopcy 50–195 cm (30 wierszy), dziewczęta 50–185 cm (28 wierszy)', () => {
    expect(api.tables.male.length).toBe(30);
    expect(api.tables.male[0].h).toBe(50);
    expect(api.tables.male.at(-1).h).toBe(195);
    expect(api.tables.female.length).toBe(28);
    expect(api.tables.female.at(-1).h).toBe(185);
  });
});
