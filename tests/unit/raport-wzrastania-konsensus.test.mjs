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

  it('metody idą w kolejności karty, a preferowana jest nazwana', () => {
    const out = lines(FHP);
    expect(out[1]).toContain('RWT');
    expect(out[1]).toContain('metoda preferowana');
    expect(out[2]).toContain('Bayley-Pinneau'); // mniej wiarygodna NIE stoi przed preferowaną
  });

  it('drukuje wartość po korekcie błędu systematycznego, nie surową z silnika', () => {
    const out = lines(FHP).join(' | ');
    expect(out).toContain('189,1'); // wartość karty
    expect(out).not.toContain('191,1'); // surowa wartość silnika nie trafia do wydruku
    expect(out).toContain('po korekcie błędu systematycznego');
  });

  it('metoda wykluczona z konsensusu jest oznaczona wraz z powodem, nie podana jako równorzędna', () => {
    const out = lines(FHP).join(' | ');
    expect(out).toContain('Khamis-Roche');
    expect(out).toContain('poza konsensusem w profilu przedwczesnym');
    // powód zaczyna się od „poza konsensusem", więc nie dublujemy tego zwrotu
    expect(out).not.toContain('poza konsensusem: poza konsensusem');
  });

  it('podaje zgodność metod z różnicą w centymetrach — tego raport nie miał wcale', () => {
    const out = lines(FHP);
    expect(out[out.length - 1]).toBe('Zgodność metod: niska (różnica 17,0 cm)');
  });

  it('metoda bez wieku kostnego (Khamis–Roche jako jedyna) też trafia do wydruku', () => {
    const out = lines({
      cm: 176.2, halfWidthCm: 4.1, sourceLabel: 'Khamis-Roche', preferredKey: 'khamis',
      methods: [{ key: 'khamis', label: 'Khamis-Roche', cm: 176.2, errorHalfWidthCm: 4.1 }],
    });
    expect(out[0]).toContain('Khamis-Roche');
    expect(out.some((l) => l.includes('Khamis-Roche: 176,2'))).toBe(true);
    // jedna metoda → bez linii o zgodności
    expect(out.some((l) => l.startsWith('Zgodność metod'))).toBe(false);
  });

  it('brak modelu konsensusu nie produkuje żadnej linii (zapas zostaje surowym liniom silników)', () => {
    expect(lines(null)).toEqual([]);
    expect(lines({})).toEqual([]);
    expect(lines({ cm: Number.NaN })).toEqual([]);
  });
});
