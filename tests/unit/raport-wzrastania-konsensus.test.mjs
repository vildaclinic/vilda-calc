import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// ADV-REPORT-3 (decyzja właściciela 2026-09-13), etap 3 naprawy Raportu wzrastania.
// Audyt: sekcja PODSUMOWANIE nie była widokiem modelu prognozy, którym żyje reszta
// aplikacji, tylko równoległym opisem z surowych wyjść dwóch–trzech silników. Skutki:
//  - raport nie podawał KONSENSUSU, choć karta i zalecenia dietetyczne liczą właśnie nim;
//  - drukował wartości SPRZED korekty błędu systematycznego, więc ta sama metoda miała
//    inną liczbę na karcie i w PDF — i to akurat w sytuacji, o której raport ostrzegał;
//  - drukował metody, które karta świadomie wyklucza z konsensusu, jako równorzędne;
//  - pomijał Khamis–Roche, Blum i TW Mark II, więc dziecko bez wieku kostnego nie miało
//    w PDF żadnej prognozy, mimo że karta pokazywała liczbę.
// Testy wołają PRAWDZIWĄ funkcję produkcyjną. Dane wyłącznie FIKCYJNE.

let win;

// Model zgodny z kształtem window.advancedGrowthData.finalHeightPrediction
// (vilda_growth_card_c.js → computeFinalHeightPrediction).
const FHP = Object.freeze({
  cm: 174.1,
  halfWidthCm: 5.3,
  sourceLabel: 'konsensus 3 metod i MPH',
  preferredKey: 'rwt',
  minCm: 169.0,
  maxCm: 186.0,
  agreementLabel: 'niska',
  methods: [
    { key: 'rwt', label: 'RWT', cm: 174.1, errorHalfWidthCm: 5.3 },
    { key: 'bp', label: 'Bayley-Pinneau', cm: 189.1, rawCm: 191.1, errorHalfWidthCm: 5.0, biasCm: -2 },
    { key: 'khamis', label: 'Khamis-Roche', cm: 176.2, excluded: true, gateNote: 'poza konsensusem w profilu przedwczesnym' },
  ],
});

beforeEach(() => { win = loadBrowserScript('vilda_advanced_growth.js', {}); });
afterEach(() => { win = null; });

const lines = (fhp) => win.VildaAdvancedGrowth.advGrowthBuildConsensusSummaryLines(fhp);

describe('Raport wzrastania — podsumowanie jako widok modelu prognozy z karty', () => {
  it('pierwsza linia to konsensus z etykietą i przedziałem, nie pojedyncza metoda', () => {
    const out = lines(FHP);
    expect(out[0]).toBe('Prognoza wzrostu ostatecznego (konsensus 3 metod i MPH): 174,1 cm ±5,3 cm');
  });

  // ADV-REPORT-9 (decyzja właściciela 2026-09-13): podsumowanie schudło do tego, co lekarz czyta.
  // Rozpiska metod, adnotacje o wykluczeniach i korektach oraz linia zgodności znikają z WYDRUKU —
  // lekarz ma je na karcie, na ekranie. Sedno ADV-REPORT-3 zostaje nienaruszone: raport podaje tę
  // samą liczbę, co karta i zalecenia, a nie surowe wyjścia silników. Poniższe testy pilnują obu
  // rzeczy naraz: że liczba jest ta właściwa i że reszta naprawdę zniknęła.

  it('to JEDYNA linia — rozpiska metod nie trafia do wydruku', () => {
    const out = lines(FHP);
    expect(out.length).toBe(1);
  });

  it('żadna pojedyncza metoda nie jest wypisana z osobna', () => {
    const out = lines(FHP).join(' | ');
    expect(out).not.toContain('– RWT');
    expect(out).not.toContain('Bayley-Pinneau');
    expect(out).not.toContain('Khamis-Roche');
    expect(out).not.toContain('metoda preferowana');
  });

  it('znikają też adnotacje o korekcie i o wykluczeniu z konsensusu', () => {
    const out = lines(FHP).join(' | ');
    // Surowa wartość silnika nie trafiała do wydruku wcześniej i nie trafia teraz.
    expect(out).not.toContain('191,1');
    expect(out).not.toContain('po korekcie błędu systematycznego');
    expect(out).not.toContain('poza konsensusem');
  });

  it('linia zgodności metod znika, mimo że model ją niesie', () => {
    const out = lines(FHP);
    expect(FHP.agreementLabel).toBe('niska');
    expect(out.some((l) => l.startsWith('Zgodność metod'))).toBe(false);
  });

  it('etykieta źródła zostaje, bo mówi, ile metod złożyło się na liczbę', () => {
    const out = lines({
      cm: 176.2, halfWidthCm: 4.1, sourceLabel: 'Khamis-Roche', preferredKey: 'khamis',
      methods: [{ key: 'khamis', label: 'Khamis-Roche', cm: 176.2, errorHalfWidthCm: 4.1 }],
    });
    expect(out.length).toBe(1);
    expect(out[0].replace(/\u00A0/g, ' ')).toBe('Prognoza wzrostu ostatecznego (Khamis-Roche): 176,2 cm ±4,1 cm');
  });

  it('brak modelu konsensusu nie produkuje żadnej linii (zapas zostaje surowym liniom silników)', () => {
    expect(lines(null)).toEqual([]);
    expect(lines({})).toEqual([]);
    expect(lines({ cm: Number.NaN })).toEqual([]);
  });
});
