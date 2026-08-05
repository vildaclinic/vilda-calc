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
