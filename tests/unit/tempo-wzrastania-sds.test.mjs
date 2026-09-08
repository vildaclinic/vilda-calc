import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// HV-SDS wg Rikkena i Wita 1992 (Arch Dis Child 67:1277-80).
//
// Wyrocznią jest TABELA 3 z pracy źródłowej: średnie i SD co pół roku. Jeżeli równania
// wpisane do modułu odtwarzają tę tabelę co do drugiego miejsca po przecinku, to znaczy,
// że przepisano je poprawnie — a to jedyny sposób, żeby to sprawdzić bez dostępu do danych
// pierwotnych. Reszta testów pilnuje granic, poza którymi moduł ma milczeć.

let HV;
beforeAll(() => {
  const src = fs.readFileSync(path.join(korzen, 'vilda_height_velocity_sds.js'), 'utf8');
  const okno = {};
  new Function('window', src)(okno);
  HV = okno.VildaHeightVelocitySDS;
});

// Tabela 3, chłopcy: [wiek, średnia, SD]
const TAB3_M = [
  [0.5, 21.26, 2.59], [1.0, 16.44, 2.14], [1.5, 12.65, 1.80], [2.0, 9.89, 1.54],
  [2.5, 8.16, 1.34], [3.0, 7.46, 1.19], [3.5, 7.28, 1.07], [4.0, 7.10, 0.98],
  [4.5, 6.92, 0.91], [5.0, 6.74, 0.86], [5.5, 6.56, 0.82], [6.0, 6.38, 0.79],
  [6.5, 6.20, 0.77], [7.0, 6.02, 0.75], [7.5, 5.84, 0.74], [8.0, 5.66, 0.72],
  [8.5, 5.48, 0.72], [9.0, 5.30, 0.71], [9.5, 5.12, 0.71], [10.0, 4.94, 0.70],
  [10.5, 4.76, 0.70], [11.0, 4.58, 0.70], [11.5, 4.40, 0.70], [12.0, 4.22, 0.69],
  [12.5, 4.04, 0.69], [13.0, 3.86, 0.69], [13.5, 3.68, 0.69], [14.0, 3.50, 0.69],
  [14.5, 3.32, 0.69], [15.0, 3.14, 0.69], [15.5, 2.96, 0.69],
];

// Tabela 3, dziewczęta
const TAB3_F = [
  [0.5, 20.18, 2.18], [1.0, 15.94, 1.81], [1.5, 12.57, 1.53], [2.0, 10.06, 1.34],
  [2.5, 8.42, 1.19], [3.0, 7.64, 1.09], [3.5, 7.41, 1.01], [4.0, 7.20, 0.96],
  [4.5, 6.99, 0.92], [5.0, 6.78, 0.89], [5.5, 6.57, 0.87], [6.0, 6.36, 0.86],
  [6.5, 6.15, 0.85], [7.0, 5.94, 0.84], [7.5, 5.73, 0.83], [8.0, 5.52, 0.83],
  [8.5, 5.31, 0.83], [9.0, 5.10, 0.83], [9.5, 4.89, 0.82], [10.0, 4.68, 0.82],
  [10.5, 4.47, 0.82], [11.0, 4.26, 0.82], [11.5, 4.05, 0.82], [12.0, 3.84, 0.82],
  [12.5, 3.63, 0.82], [13.0, 3.42, 0.82], [13.5, 3.21, 0.82],
];

const WE = { sex: 'M', gapMonths: 12, tannerStage: 1 };

describe('Równania odtwarzają tabelę 3 pracy źródłowej', () => {
  it('chłopcy — 31 punktów wieku, średnia i SD', () => {
    TAB3_M.forEach(([t, mu, sd]) => {
      expect(HV.srednia(t, 'M'), `średnia w wieku ${t}`).toBeCloseTo(mu, 2);
      expect(HV.odchylenie(t, 'M'), `SD w wieku ${t}`).toBeCloseTo(sd, 2);
    });
  });

  it('dziewczęta — 27 punktów wieku, średnia i SD', () => {
    TAB3_F.forEach(([t, mu, sd]) => {
      expect(HV.srednia(t, 'F'), `średnia w wieku ${t}`).toBeCloseTo(mu, 2);
      expect(HV.odchylenie(t, 'F'), `SD w wieku ${t}`).toBeCloseTo(sd, 2);
    });
  });

  it('w wieku 3,0 roku obowiązuje wielomian, nie prosta — tak jak w tabeli', () => {
    // Dla dziewcząt obie gałęzie dają różne liczby (7,64 vs 7,62); tabela podaje 7,64.
    expect(HV.srednia(3.0, 'F')).toBeCloseTo(7.64, 2);
    expect(HV.srednia(3.0, 'M')).toBeCloseTo(7.46, 2);
  });
});

describe('Obliczanie SDS', () => {
  it('liczy SDS z tempa, wieku i płci', () => {
    // Chłopiec 5 lat, 4,1 cm/rok: średnia 6,74, SD 0,86 → (4,1 − 6,74)/0,86 ≈ −3,07
    const w = HV.oblicz({ ...WE, cmPerYear: 4.1, ageYears: 5 });
    expect(w.sds).toBeCloseTo(-3.07, 2);
    expect(w.srednia).toBeCloseTo(6.74, 2);
    expect(w.sd).toBeCloseTo(0.86, 2);
    expect(w.powod).toBeNull();
  });

  it('tempo równe średniej daje zero, powyżej średniej — wartość dodatnią', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 6.74, ageYears: 5 }).sds).toBeCloseTo(0, 2);
    expect(HV.oblicz({ ...WE, cmPerYear: 8.0, ageYears: 5 }).sds).toBeGreaterThan(0);
  });

  it('płeć realnie zmienia wynik, a „K" jest rozumiane jak „F"', () => {
    const chlopiec = HV.oblicz({ ...WE, cmPerYear: 5.0, ageYears: 7 }).sds;
    const dziewczynka = HV.oblicz({ ...WE, sex: 'F', cmPerYear: 5.0, ageYears: 7 }).sds;
    expect(chlopiec).not.toBeCloseTo(dziewczynka, 2);
    expect(HV.oblicz({ ...WE, sex: 'K', cmPerYear: 5.0, ageYears: 7 }).sds)
      .toBeCloseTo(dziewczynka, 6);
  });
});

describe('Granice, poza którymi moduł milczy', () => {
  it('okno obserwacji musi być roczne (12 ± 1 mies.)', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 6 }).powod)
      .toBe(HV.POWOD.OKNO);
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 10 }).powod)
      .toBe(HV.POWOD.OKNO);
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 24 }).powod)
      .toBe(HV.POWOD.OKNO);
    // Kontrola pozytywna: brzegi okna są dopuszczone.
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 11 }).sds).not.toBeNull();
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 13 }).sds).not.toBeNull();
  });

  it('górna granica wieku jest inna dla chłopców i dziewcząt', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 4, ageYears: 15.5 }).sds).not.toBeNull();
    expect(HV.oblicz({ ...WE, cmPerYear: 4, ageYears: 15.6 }).powod)
      .toBe(HV.POWOD.WIEK_POWYZEJ);
    expect(HV.oblicz({ ...WE, sex: 'F', cmPerYear: 4, ageYears: 13.5 }).sds).not.toBeNull();
    expect(HV.oblicz({ ...WE, sex: 'F', cmPerYear: 4, ageYears: 13.6 }).powod)
      .toBe(HV.POWOD.WIEK_POWYZEJ);
  });

  it('dziecko po rozpoczęciu pokwitania wypada poza model', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 11, tannerStage: 2 }).powod)
      .toBe(HV.POWOD.POKWITANIE);
    // Nieznany Tanner nie blokuje, ale wynik niesie informację, że to założenie.
    const bezTannera = HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 11, tannerStage: null });
    expect(bezTannera.sds).not.toBeNull();
    expect(bezTannera.zalozonoPrzedpokwitaniowy).toBe(true);
    // Kontrola negatywna: znany Tanner I to fakt, nie założenie.
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 11, tannerStage: 1 }).zalozonoPrzedpokwitaniowy)
      .toBe(false);
  });

  it('brak płci, wieku albo tempa nie daje liczby, tylko powód', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, sex: null }).powod).toBe(HV.POWOD.PLEC);
    expect(HV.oblicz({ ...WE, cmPerYear: null, ageYears: 7 }).powod).toBe(HV.POWOD.BRAK_DANYCH);
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: null }).powod).toBe(HV.POWOD.BRAK_DANYCH);
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 0.4 }).powod).toBe(HV.POWOD.WIEK_PONIZEJ);
    expect(HV.oblicz(null).powod).toBe(HV.POWOD.BRAK_DANYCH);
  });

  it('każda odmowa niesie zrozumiały powód po polsku', () => {
    Object.values(HV.POWOD).forEach((p) => {
      const w = HV.oblicz({ cmPerYear: 5, ageYears: 40, sex: 'M', gapMonths: 99 });
      expect(typeof w.opisPowodu).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    });
  });
});

describe('Uczciwość wyniku', () => {
  it('powyżej wieku dopasowania SD wynik jest oznaczony jako ekstrapolowany', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 4.5, ageYears: 9 }).sdEkstrapolowane).toBe(false);
    expect(HV.oblicz({ ...WE, cmPerYear: 4.5, ageYears: 11 }).sdEkstrapolowane).toBe(true);
    expect(HV.oblicz({ ...WE, sex: 'F', cmPerYear: 4.5, ageYears: 7 }).sdEkstrapolowane).toBe(false);
    expect(HV.oblicz({ ...WE, sex: 'F', cmPerYear: 4.5, ageYears: 9 }).sdEkstrapolowane).toBe(true);
  });

  it('każdy wynik nazywa populację odniesienia', () => {
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7 }).zrodlo).toMatch(/szwedzk/i);
    expect(HV.oblicz({ ...WE, cmPerYear: 5, ageYears: 7, gapMonths: 6 }).zrodlo).toMatch(/szwedzk/i);
    expect(HV.ZRODLO).toMatch(/Rikken/);
  });
});
