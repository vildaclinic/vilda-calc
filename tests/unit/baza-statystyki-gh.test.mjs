import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-STATYSTYKI, etap 2 (decyzja właściciela 2026-11-24): statystyki leczenia hormonem wzrostu.
// Model z PLIKU PRODUKCYJNEGO (vilda_patients_list.js) uruchomiony na PRAWDZIWYCH silnikach:
// tempo liczy VildaTempoWzrastania.odcinek, kursy dzieli VildaTrajectoryAnalysis.ghKursy.
// Wszystkie osoby i pomiary są fikcyjne.

function srodowisko() {
  const win = {};
  loadBrowserScript('vilda_tempo_wzrastania.js', win);
  loadBrowserScript('vilda_trajectory_analysis.js', win);
  loadBrowserScript('vilda_patients_list.js', win);
  const deps = { tempo: win.VildaTempoWzrastania, kursy: win.VildaTrajectoryAnalysis.ghKursy };
  return { ...win.VildaPatientsList, deps, win };
}
const punkt = (type, lata, mies, height, extra = {}) => ({ type, ageYears: lata, ageMonths: mies, height, ...extra });

// Dziewczynka, SNP: Włączenie w 6 lat (109,2 cm); rok wcześniej 105,0 cm.
const ALA = {
  user: { sex: 'F' },
  growthBasic: { data: { measurements: [{ ageMonths: 60, ageYears: 5, height: 105.0 }] } },
  ghTherapyPoints: [
    punkt('start', 6, 0, 109.2, { program: 'SNP', drug: 'Genotropin 12 mg' }),
    punkt('continue', 6, 6, 114.5, { program: 'SNP' }),
    punkt('continue', 7, 0, 118.8, { program: 'SNP' }),
    punkt('continue', 8, 1, 126.4, { program: 'SNP' }),
  ],
};
// Chłopiec, SGA: Włączenie w 5 lat (100,0 cm); kontrole po 10 i 15 mies.
const BARTEK = {
  user: { sex: 'M' },
  ghTherapyPoints: [
    punkt('start', 5, 0, 100.0, { program: 'SGA' }),
    punkt('continue', 5, 10, 106.0, { program: 'SGA' }),
    punkt('continue', 6, 3, 108.4, { program: 'SGA' }),
  ],
};

describe('Jeden pacjent leczony GH (ghPatient)', () => {
  it('silniki mają okno roczne 9–15 mies. z celem 12 — model bierze je z silnika tempa', () => {
    const { deps } = srodowisko();
    expect(deps.tempo.P.ROCZNE_OKNO_MIN_M).toBe(9);
    expect(deps.tempo.P.ROCZNE_OKNO_MAX_M).toBe(15);
    expect(deps.tempo.P.ROCZNE_CEL_M).toBe(12);
  });

  it('1. rok: od Włączenia do kontroli najbliższej 12 mies.; kolejne lata łańcuchem; tempo sprzed leczenia z historii', () => {
    const { ghPatient, deps } = srodowisko();
    const wynik = ghPatient(ALA, deps);
    expect(wynik.program).toBe('SNP');
    expect(wynik.reason).toBeNull();
    expect(wynik.firstYear).toBeCloseTo(9.6, 6);            // (118,8 − 109,2) / (12/12); kontrola po 6 mies. pominięta
    expect(wynik.years).toHaveLength(2);
    expect(wynik.years[1]).toBeCloseTo(7.6 / (13 / 12), 6); // (126,4 − 118,8) / (13/12) = 7,02
    expect(wynik.before).toBeCloseTo(4.2, 6);               // (109,2 − 105,0) / (12/12)
  });

  it('z dwóch kontroli w oknie wygrywa bliższa 12 mies.; przy remisie — wcześniejsza', () => {
    const { ghPatient, deps } = srodowisko();
    const bartek = ghPatient(BARTEK, deps);
    expect(bartek.firstYear).toBeCloseTo(6.0 / (10 / 12), 6); // kontrola po 10 mies. (2 od celu) przed 15 mies. (3 od celu)
    expect(bartek.years).toHaveLength(1);                     // od kontroli w 5 l. 10 mies. do następnej jest 5 mies.
    expect(bartek.before).toBeNull();
    const remis = ghPatient({ user: { sex: 'M' }, ghTherapyPoints: [
      punkt('start', 5, 0, 100), punkt('continue', 5, 11, 107.7), punkt('continue', 6, 1, 109.1),
    ] }, deps);
    expect(remis.firstYear).toBeCloseTo(7.7 / (11 / 12), 6);
  });

  it('pacjent bez pary w oknie nie dostaje tempa, tylko powód', () => {
    const { ghPatient, deps } = srodowisko();
    expect(ghPatient({ ghTherapyPoints: [punkt('continue', 7, 0, 120), punkt('continue', 8, 0, 127)] }, deps))
      .toMatchObject({ firstYear: null, years: [], reason: 'no-start' });
    expect(ghPatient({ ghTherapyPoints: [punkt('start', 7, 0, null), punkt('continue', 8, 0, 127)] }, deps).reason, 'Włączenie bez wzrostu').toBe('no-start');
    expect(ghPatient({ ghTherapyPoints: [punkt('start', 7, 0, 120), punkt('continue', 7, 6, 124)] }, deps))
      .toMatchObject({ firstYear: null, reason: 'too-early' });
    expect(ghPatient({ ghTherapyPoints: [punkt('start', 7, 0, 120)] }, deps).reason).toBe('too-early');
    expect(ghPatient({ ghTherapyPoints: [punkt('start', 7, 0, 120), punkt('continue', 8, 8, 132)] }, deps))
      .toMatchObject({ firstYear: null, reason: 'no-control' });
  });

  it('leczenie wznowione po Zakończeniu: liczy się pierwszy kurs z Włączeniem', () => {
    const { ghPatient, deps } = srodowisko();
    const wynik = ghPatient({ user: { sex: 'F' }, ghTherapyPoints: [
      punkt('start', 5, 0, 100, { program: 'SNP' }), punkt('end', 6, 0, 108.4, { program: 'SNP' }),
      punkt('start', 8, 0, 120, { program: 'SGA' }), punkt('continue', 9, 0, 126, { program: 'SGA' }),
    ] }, deps);
    expect(wynik.program).toBe('SNP');
    expect(wynik.years).toHaveLength(1);
    expect(wynik.firstYear).toBeCloseTo(8.4, 6);
  });

  it('karta bez punktów GH nie jest „leczona”; pusty i uszkodzony zapis nie rzuca', () => {
    const { ghPatient, deps } = srodowisko();
    for (const zapis of [null, undefined, {}, 'tekst', { ghTherapyPoints: null }, { ghTherapyPoints: [] }, { ghTherapyPoints: [null, { type: 'inne' }] }]) {
      expect(ghPatient(zapis, deps)).toBeNull();
    }
  });

  it('bez silnika tempa nie zmyśla wyniku', () => {
    const { ghPatient, deps } = srodowisko();
    expect(ghPatient(ALA, { kursy: deps.kursy })).toMatchObject({ firstYear: null, reason: 'no-engine', program: 'SNP' });
  });

  it('zmiana hSDS: kontrola 1. roku minus Włączenie, na siatce i populacji z karty; bez płci — brak', () => {
    const { ghPatient, deps } = srodowisko();
    const wywolania = [];
    const sds = (o) => { wywolania.push(o); return o.wzrost / 10 - o.wiekMies / 100; };
    const wynik = ghPatient({ ...ALA, zscore: { dataSource: 'palczewska' }, clinical: { downSyndrome: true } }, { ...deps, sds, defaultSource: 'OLAF' });
    expect(wynik.deltaSds).toBeCloseTo((11.88 - 0.84) - (10.92 - 0.72), 6);
    expect(wywolania).toEqual([
      { wzrost: 109.2, plec: 'F', wiekMies: 72, zrodlo: 'PALCZEWSKA', populacja: 'DS' },
      { wzrost: 118.8, plec: 'F', wiekMies: 84, zrodlo: 'PALCZEWSKA', populacja: 'DS' },
    ]);
    wywolania.length = 0;
    ghPatient(BARTEK, { ...deps, sds, defaultSource: 'WHO' });
    expect(wywolania.map((o) => [o.zrodlo, o.populacja, o.plec])).toEqual([['WHO', 'OGOLNA', 'M'], ['WHO', 'OGOLNA', 'M']]);
    expect(ghPatient({ ...ALA, user: { sex: '' } }, { ...deps, sds }).deltaSds, 'silnik hSDS nie dostaje zgadywanej płci').toBeNull();
    expect(ghPatient(ALA, { ...deps, sds: () => null }).deltaSds).toBeNull();
    expect(ghPatient(ALA, deps).deltaSds, 'strona bez silnika hSDS').toBeNull();
  });
});

describe('Cała baza (ghCohort)', () => {
  function baza() {
    const { ghPatient, ghCohort, deps } = srodowisko();
    const karty = {
      ala: ALA,
      bartek: BARTEK,
      celina: { user: { sex: 'F' }, growthBasic: { data: { measurements: [{ ageMonths: 86, height: 115.5 }] } }, ghTherapyPoints: [
        punkt('start', 8, 0, 119.5, { program: 'SNP' }), punkt('continue', 9, 0, 128.5, { program: 'SNP' })] },
      daniel: { user: { sex: 'M' }, ghTherapyPoints: [punkt('start', 7, 0, 120, { program: 'SNP' }), punkt('continue', 7, 6, 124, { program: 'SNP' })] },
      ewa: { user: { sex: 'F' }, ghTherapyPoints: [punkt('continue', 7, 0, 120), punkt('continue', 8, 0, 127)] },
      franek: { user: { sex: 'M' }, growthBasic: { data: { measurements: [{ ageMonths: 100, height: 130 }] } } },
    };
    const wpisy = Object.entries(karty).map(([id, karta]) => ({ id, gh: ghPatient(karta, deps) })).filter((wpis) => wpis.gh);
    return ghCohort(wpisy);
  }

  it('leczeni, średnia i mediana 1. roku, pary „przed → 1. rok”, lata leczenia', () => {
    const wynik = baza();
    expect(wynik.treated).toBe(5);                 // Franek nie ma punktów GH
    expect(wynik.ids).toEqual(['ala', 'bartek', 'celina', 'daniel', 'ewa']);
    expect(wynik.first.n).toBe(3);                 // Ala 9,6 · Bartek 7,2 · Celina 9,0
    expect(wynik.first.mean).toBeCloseTo((9.6 + 7.2 + 9.0) / 3, 6);
    expect(wynik.first.median).toBeCloseTo(9.0, 6);
    expect(wynik.first.ids).toEqual(['ala', 'bartek', 'celina']);
    // Pary: tylko Ala (4,2 → 9,6) i Celina ((119,5 − 115,5) / (10/12) = 4,8 → 9,0).
    expect(wynik.paired.n).toBe(2);
    expect(wynik.paired.before).toBeCloseTo((4.2 + 4.8) / 2, 6);
    expect(wynik.paired.first).toBeCloseTo((9.6 + 9.0) / 2, 6);
    expect(wynik.years.map((rok) => [rok.year, rok.n])).toEqual([[1, 3], [2, 1]]);
    expect(wynik.years[1].mean).toBeCloseTo(7.6 / (13 / 12), 6);
    expect(wynik.deltaSds).toEqual({ n: 0, mean: null, median: null });
  });

  it('programy od najliczniejszego; mała grupa oznaczona; pacjenci bez tempa wykazani z powodem', () => {
    const wynik = baza();
    expect(wynik.programs.map((p) => [p.program, p.treated, p.n])).toEqual([['SNP', 3, 2], ['bez programu', 1, 0], ['SGA', 1, 1]]);
    const snp = wynik.programs[0];
    expect(snp.mean).toBeCloseTo((9.6 + 9.0) / 2, 6);
    expect(snp.paired).toMatchObject({ n: 2 });
    expect(snp.small, 'mniej niż 5 pacjentów z tempem').toBe(true);
    expect(wynik.programs[1].small, 'grupa bez żadnego tempa nie dostaje ostrzeżenia o średniej').toBe(false);
    expect(wynik.missing).toEqual({ 'no-start': ['ewa'], 'no-control': [], 'too-early': ['daniel'] });
  });

  it('pusta lista i baza bez leczonych', () => {
    const { ghCohort } = srodowisko();
    for (const wejscie of [[], null, [{ id: 'x', gh: null }]]) {
      expect(ghCohort(wejscie)).toMatchObject({ treated: 0, programs: [], years: [], first: { n: 0, mean: null, median: null } });
    }
  });
});
