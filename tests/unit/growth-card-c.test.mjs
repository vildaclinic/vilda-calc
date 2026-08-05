import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Moduł prezentacji „Wariant B (clean)” (vilda_growth_card_c.js): hero + lista metod z ±,
// BEZ pastylek (NOWA/wiarygodność), BEZ przypisu i „Uwagi ogólnej”, reszta w „Szczegółach”.
// KR liczony przez STUB globalnego silnika. Dane fikcyjne.

function load(khamisReturn) {
  const win = {};
  win.calculateKhamisRochePrediction = (input) => {
    if (typeof khamisReturn === 'function') return khamisReturn(input);
    if (!input || input.currentHeightCm == null || input.currentWeightKg == null ||
        input.motherHeightCm == null || input.fatherHeightCm == null) {
      return { available: false, reason: 'missing-input' };
    }
    return { available: true, predictedAdultHeightCm: khamisReturn };
  };
  return loadBrowserScript('vilda_growth_card_c.js', win).VildaGrowthCardC;
}

function baseInput(over = {}) {
  return {
    sex: 'M', ageYears: 13, ageMonths: 156, boneAgeYears: 12.5,
    currentHeightCm: 155, currentWeightKg: 44, motherHeightCm: 165, fatherHeightCm: 179,
    bp: { available: true, predictedAdultHeightCm: 179.2, errorBoundHalfWidthCm: 5.2 },
    rwt: { available: true, predictedAdultHeightCm: 177.8, errorBoundHalfWidthCm: 4.6 },
    reinehr: { available: true, predictedAdultHeightCm: 176.5 },
    reliabilityModel: {
      entryMap: { rwt: { levelKey: 'high' }, bayleyPinneau: { levelKey: 'moderate' }, reinehr: { levelKey: 'indicative' } },
      profileStatusLabel: 'Profil standardowy',
      profileSummaryText: 'Dla tego profilu pokazano standardowe modele Bayley-Pinneau i RWT.',
    },
    mphCm: 178.5, mphCentileText: '55c',
    growthVelocityCmPerYear: 5.1, growthVelocityContext: 'cm/rok (7 mies.)',
    ...over,
  };
}

describe('Wariant B — konsensus i model', () => {
  const C = load(178.1);
  it('konsensus: mediana/zakres/zgodność (progi 3/6)', () => {
    const c = C._consensus([176.5, 177.8, 178.1, 179.2]);
    expect(c.median).toBeCloseTo(177.95, 5);
    expect(c.min).toBe(176.5); expect(c.max).toBe(179.2);
    expect(c.agreementLabel).toBe('dobra');
    expect(C._consensus([170, 175]).agreementLabel).toBe('umiarkowana');
    expect(C._consensus([170, 178]).agreementLabel).toBe('niska');
  });
  it('kolejność STAŁA RWT→BP→KR→Reinehr; KR ± wg płci', () => {
    expect(C._buildModel(baseInput()).entries.map((e) => e.key)).toEqual(['rwt', 'bp', 'khamis', 'reinehr']);
    expect(C._buildModel(baseInput({ sex: 'M' })).entries.find((e) => e.key === 'khamis').pm).toBe(5.3);
    expect(C._buildModel(baseInput({ sex: 'F' })).entries.find((e) => e.key === 'khamis').pm).toBe(4.3);
  });
});

describe('Wariant B — render (clean, HTML)', () => {
  const C = load(178.1);

  it('komplet: hero konsensus, lista metod z ±, MPH, kafel tempa; BEZ pastylek/przypisu/Uwagi', () => {
    const html = C.render(baseInput());
    expect(html).toContain('Konsensus 4 metod');
    expect(html).toContain('≈ 178 cm');
    expect(html).toContain('177,8 cm'); // RWT wartość
    expect(html).toContain('±4,6');     // przedział przy metodzie
    expect(html).toContain('Cel rodzicielski (MPH)');
    expect(html).toContain('178,5 cm');
    expect(html).toContain('Tempo wzrastania');
    expect(html).toContain('5,1');
    // kolejność metod
    const iR = html.indexOf('RWT'), iB = html.indexOf('Bayley'), iK = html.indexOf('Khamis'), iRe = html.indexOf('Reinehr');
    expect(iR).toBeLessThan(iB); expect(iB).toBeLessThan(iK); expect(iK).toBeLessThan(iRe);
    // USUNIĘTE elementy
    expect(html).not.toContain('NOWA');
    expect(html).not.toContain('Uwaga ogólna');
    expect(html).not.toContain('vgcc-badge'); // brak pastylek wiarygodności
    // wiarygodność i nota KR tylko w Szczegółach
    expect(html).toContain('Szczegóły i wiarygodność');
    expect(html).toContain('Wiarygodność:');
    expect(html).toContain('RWT wysoka');
    expect(html).toContain('Profil predykcyjny:');
    expect(html).toContain('Profil standardowy');
    expect(html).toContain('Khamis–Roche 1994'); // nota w szczegółach
    // „Profil standardowy” NIE jako wielka pastylka (zwykły tekst) — brak markup pastylki
    expect(html).not.toContain('bigpill');
  });

  it('tylko KR (brak wieku kostnego): hero bez słowa „orientacyjna”, bez listy metod, z podpowiedzią', () => {
    const html = C.render(baseInput({
      sex: 'F', boneAgeYears: null, mphCm: 164.5, mphCentileText: '48c',
      bp: { available: false }, rwt: { available: false }, reinehr: { available: false },
    }));
    expect(html).toContain('Khamis–Roche');
    expect(html).toContain('bez wieku kostnego');
    expect(html).toContain('±4,3 cm');
    // słowo „orientacyjna” dozwolone TYLKO w Szczegółach (wiarygodność słownie), nie na wierzchu
    expect(html.split('Szczegóły')[0]).not.toContain('orientacyjna');
    expect(html).not.toContain('Konsensus');
    // etykieta poprawiona: nie twierdzi już fałszywie, że RWT/Reinehr wymagają wieku kostnego
    expect(html).toContain('Część metod (np. Bayley–Pinneau) wymaga wieku kostnego');
    expect(html).not.toContain('RWT i Reinehr wymagają');
    expect(html).toContain('Cel rodzicielski (MPH)');
    // brak wierszy metod BP/RWT/Reinehr
    expect(html).not.toContain('<span class="vgcc-nm">Bayley');
    expect(html).not.toContain('<span class="vgcc-nm">Reinehr');
  });

  it('brak wszystkich metod → komunikat o uzupełnieniu', () => {
    const C0 = load(null);
    const html = C0.render(baseInput({ currentWeightKg: null, bp: { available: false }, rwt: { available: false }, reinehr: { available: false } }));
    expect(html).toContain('Uzupełnij dane');
    expect(html).not.toContain('Konsensus');
  });

  it('brak MPH i brak tempa → sekcje znikają', () => {
    const html = C.render(baseInput({ mphCm: null, growthVelocityCmPerYear: null }));
    expect(html).not.toContain('Cel rodzicielski (MPH)');
    expect(html).not.toContain('Tempo wzrastania');
  });

  it('2 metody → hero konsensus dla 2', () => {
    const html = C.render(baseInput({ reinehr: { available: false }, bp: { available: false } }));
    expect(html).toContain('Konsensus 2 metod');
  });
});

describe('Wariant B — konsensus ważony wiarygodnością (Wniosek 2)', () => {
  const C = load(176.0);
  it('_weightedConsensus: waga = f(poziom)/σ², metoda preferowana = największa waga', () => {
    const wc = C._weightedConsensus([
      { key: 'rwt', label: 'RWT', value: 177.8, pm: 4.6, levelKey: 'high' },
      { key: 'bp', label: 'Bayley–Pinneau', value: 182.0, pm: 5.2, levelKey: 'low' },
      { key: 'reinehr', label: 'Reinehr/CDGP', value: 175.5, pm: 4.0, levelKey: 'high' },
    ]);
    expect(wc.recommendedKey).toBe('reinehr');      // high + najwęższy błąd
    expect(wc.weighted).toBeCloseTo(177.0, 1);       // odciąga od obniżonego BP (182)
    // przy równych poziomach i błędach ważony == średnia
    const eq = C._weightedConsensus([
      { key: 'a', label: 'A', value: 170, pm: 4, levelKey: 'moderate' },
      { key: 'b', label: 'B', value: 176, pm: 4, levelKey: 'moderate' },
    ]);
    expect(eq.weighted).toBeCloseTo(173, 5);
  });
  it('nagłówek konsensusu jest „ważony"; kompatybilność wsteczna wartości', () => {
    const html = C.render(baseInput());
    expect(html).toContain('Konsensus 4 metod (ważony)');
    expect(html).toContain('≈ 178 cm'); // ważony 177,9 → 178 (jak mediana)
  });
  it('niska zgodność (spread>6): flaga is-low + metoda preferowana na wierzchu', () => {
    const html = C.render(baseInput({
      sex: 'M', boneAgeYears: 11.5,
      bp: { available: true, predictedAdultHeightCm: 184.0, errorBoundHalfWidthCm: 5.2 },
      rwt: { available: true, predictedAdultHeightCm: 177.8, errorBoundHalfWidthCm: 4.6 },
      reinehr: { available: true, predictedAdultHeightCm: 175.5, errorBoundHalfWidthCm: 4.0 },
      reliabilityModel: { entryMap: { rwt: { levelKey: 'high' }, bayleyPinneau: { levelKey: 'low' }, reinehr: { levelKey: 'high' } } },
    }));
    expect(html).toContain('is-low');
    expect(html).toContain('zgodność niska');
    expect(html).toContain('preferowana:');
  });
  it('mediana i ważony pokazane w Szczegółach', () => {
    const html = C.render(baseInput());
    expect(html).toContain('ważony wiarygodnością');
    expect(html).toContain('mediana metod');
  });
});

describe('Wariant B — poprawki UI (C+)', () => {
  const C = load(170.8);
  it('MPH: centyl czytelnie „NN. centyl"', () => {
    expect(C.render(baseInput({ mphCentileText: '37' }))).toContain('; <span class="vgcc-mph-cent">37. centyl</span>');
    // odporność na format „55c" → „55. centyl"
    expect(C.render(baseInput({ mphCentileText: '55c' }))).toContain('55. centyl');
  });
  it('Tempo: wartość i jednostka w jednej linii', () => {
    expect(C.render(baseInput())).toContain('<div class="vu"><span class="v">5,1</span> <span class="u">cm/rok (7 mies.)</span></div>');
  });
  it('metoda preferowana wyróżniona w tabeli (is-pref na wierszu o największej wadze = RWT)', () => {
    const html = C.render(baseInput());
    expect(html).toMatch(/<div class="vgcc-row is-pref"><span class="vgcc-nm">RWT/);
    expect(html).not.toContain('is-pref"><span class="vgcc-nm">Bayley');
  });
});
