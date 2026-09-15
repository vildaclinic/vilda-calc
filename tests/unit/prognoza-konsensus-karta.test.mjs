import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-PROGNOZA-KONSENSUS (decyzja właściciela 2026-09-15). Karta „Podsumowanie wyników"
// wypisywała CZTERY równorzędne prognozy wzrostu ostatecznego — Bayley–Pinneau, RWT,
// Khamis–Roche, Reinehr — nie mówiąc, która jest odpowiedzią aplikacji. Ważony konsensus
// z karty zaawansowanej JUŻ jest tą odpowiedzią: żyje nim raport PDF (ADV-REPORT-3)
// i zalecenia dietetyczne. Od tej zmiany karta pokazuje konsensus, a surowe prognozy
// metod chowa za przyciskiem; do schowka idzie tylko konsensus.
//
// Testy wołają PRAWDZIWĄ funkcję produkcyjną. Dane wyłącznie FIKCYJNE.

let win;

// Kształt zgodny z window.advancedGrowthData.finalHeightPrediction
// (vilda_growth_card_c.js → computeFinalHeightPrediction).
const FHP = Object.freeze({
  cm: 174.1,
  halfWidthCm: 5.3,
  sourceLabel: 'konsensus 3 metod i MPH',
  agreementLabel: 'dobra',
  minCm: 172.0,
  maxCm: 176.4,
  methods: [
    { key: 'rwt', label: 'RWT', cm: 174.1, errorHalfWidthCm: 5.3 },
    { key: 'bp', label: 'Bayley-Pinneau', cm: 175.6, errorHalfWidthCm: 5.0 },
  ],
});

const LINIE_METOD = [
  'Prognoza wzrostu ostatecznego (metoda Bayley-Pinneau): 175,6 cm (±5,0 cm)',
  'Prognoza wzrostu ostatecznego (RWT): 174,1 cm (±5,3 cm)',
  'Prognoza wzrostu ostatecznego (metoda Khamis-Roche): 176,2 cm (±5,3 cm)',
  'Prognoza wzrostu ostatecznego (Reinehr 2019): 173,0 cm',
];

function srodowisko(fh) {
  const w = {};
  loadBrowserScript('vilda_advanced_growth.js', w);
  w.advancedGrowthData = fh === undefined ? null : { finalHeightPrediction: fh };
  loadBrowserScript('vilda_growth_prediction_lines.js', w);
  return w;
}

function konsensus(w, fh) {
  return w.VildaAdvancedGrowth.advGrowthBuildConsensusSummaryLines(fh);
}

beforeEach(() => { win = srodowisko(FHP); });
afterEach(() => { win = null; });

describe('Podział linii podsumowania: konsensus zostaje, metody idą za przycisk', () => {
  it('prognozy pojedynczych metod trafiają do „pozostałych", konsensus zostaje widoczny', () => {
    const linie = ['Waga: 48,0 kg, 55 centyl', ...konsensus(win, FHP), ...LINIE_METOD];
    const { widoczne, pozostale } = win.VildaGrowthPredictionLines.podziel(linie);

    expect(pozostale).toEqual(LINIE_METOD);
    expect(widoczne).toEqual(['Waga: 48,0 kg, 55 centyl', ...konsensus(win, FHP)]);
  });

  it('MPH zostaje widoczne — to cel genetyczny, nie prognoza', () => {
    const mph = 'MPH: 176,0 cm – centyl: 62, Z-score: 0,31';
    const linie = [mph, 'hSDS - mpSDS: -0,42', ...konsensus(win, FHP), ...LINIE_METOD];
    const { widoczne } = win.VildaGrowthPredictionLines.podziel(linie);

    expect(widoczne).toContain(mph);
    expect(widoczne).toContain('hSDS - mpSDS: -0,42');
  });

  // Bezpiecznik: brak konsensusu nie może zostawić karty BEZ prognozy. Cztery liczby są złe,
  // ale zero liczb wygląda jak brak danych — a dane są.
  it('bez konsensusu nic nie znika', () => {
    const w = srodowisko(null);
    const { widoczne, pozostale } = w.VildaGrowthPredictionLines.podziel(LINIE_METOD);

    expect(pozostale).toEqual([]);
    expect(widoczne).toEqual(LINIE_METOD);
  });

  // Przy JEDNEJ dostępnej metodzie `sourceLabel` to nazwa tej metody, więc linia konsensusu
  // wygląda jak linia metody. Rozpoznanie po słowie „konsensus" pomyliłoby się tutaj —
  // dlatego moduł porównuje z wynikiem tej samej funkcji produkcyjnej, a nie z tekstem.
  it('przy jednej metodzie linia konsensusu nie jest chowana, choć nie ma w niej słowa „konsensus"', () => {
    const jedna = Object.freeze({
      cm: 174.1, halfWidthCm: 5.3, sourceLabel: 'RWT', agreementLabel: 'dobra',
      methods: [{ key: 'rwt', label: 'RWT', cm: 174.1, errorHalfWidthCm: 5.3 }],
    });
    const w = srodowisko(jedna);
    const linieK = konsensus(w, jedna);
    expect(linieK[0]).not.toContain('konsensus');

    const { widoczne, pozostale } = w.VildaGrowthPredictionLines.podziel([...linieK, ...LINIE_METOD]);
    expect(widoczne).toEqual(linieK);
    expect(pozostale).toEqual(LINIE_METOD);
  });

  // Ta sama treść przychodzi z dwóch ścieżek: raport skleja „174,1 cm" twardą spacją,
  // kolektor bywa przepuszczany przez zamianę spacji. Porównanie musi to znieść.
  it('twarda spacja nie robi z linii konsensusu obcej linii', () => {
    const linieK = konsensus(win, FHP);
    const zeZwyklaSpacja = linieK.map((t) => t.replace(/\u00A0/g, ' '));
    const { widoczne, pozostale } = win.VildaGrowthPredictionLines.podziel(zeZwyklaSpacja);

    expect(pozostale).toEqual([]);
    expect(widoczne).toEqual(zeZwyklaSpacja);
  });

  it('linia zgodności metod zostaje widoczna — mówi o konsensusie, nie o metodzie', () => {
    const niska = { ...FHP, agreementLabel: 'niska', minCm: 169.0, maxCm: 186.0 };
    const w = srodowisko(niska);
    const linieK = konsensus(w, niska);
    expect(linieK.length).toBe(2);

    const { widoczne } = w.VildaGrowthPredictionLines.podziel([...linieK, ...LINIE_METOD]);
    expect(widoczne.some((t) => t.startsWith('Zgodność metod:'))).toBe(true);
  });

  it('czyPrognoza rozpoznaje tylko linie prognozy wzrostu ostatecznego', () => {
    const czy = win.VildaGrowthPredictionLines.czyPrognoza;
    expect(czy('Prognoza wzrostu ostatecznego (RWT): 174,1 cm')).toBe(true);
    expect(czy('Tempo wzrastania: 5,4 cm/rok')).toBe(false);
    expect(czy('MPH: 176,0 cm')).toBe(false);
    expect(czy('')).toBe(false);
    expect(czy(null)).toBe(false);
  });

  it('pozostałe prognozy zachowują kolejność z podsumowania', () => {
    const linie = [...konsensus(win, FHP), ...LINIE_METOD];
    const { pozostale } = win.VildaGrowthPredictionLines.podziel(linie);
    expect(pozostale[0]).toContain('Bayley-Pinneau');
    expect(pozostale[pozostale.length - 1]).toContain('Reinehr');
  });

  it('jawnie podany konsensus wygrywa z tym z okna — ścieżka kopiowania z zapisanego pomiaru', () => {
    const zPayloadu = { ...FHP, cm: 168.2, sourceLabel: 'konsensus 2 metod' };
    const w = srodowisko(FHP);
    const linieK = konsensus(w, zPayloadu);
    const { widoczne, pozostale } = w.VildaGrowthPredictionLines.podziel(
      [...linieK, ...LINIE_METOD], { konsensus: linieK },
    );
    expect(widoczne).toEqual(linieK);
    expect(pozostale).toEqual(LINIE_METOD);
  });
});
