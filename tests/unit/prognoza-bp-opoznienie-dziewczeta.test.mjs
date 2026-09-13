import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-BP-DZIEWCZETA (decyzja właściciela 2026-09-13): ostrzeżenie o prognozie
// Bayleya-Pinneau przy opóźnieniu wieku kostnego ≥ 2 lata obejmuje także dziewczęta.
// U dziewcząt to KOMUNIKAT, nie reguła liczbowa — korekty −2,0 cm (BIAS_RULES.bpDelayBoys,
// kohorty wyłącznie chłopięce) się nie stosuje. Dane fikcyjne.

function loadCard() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}

// Dziewczynka 13 l 0 mies., wiek kostny 10,5 l → Δ = −30 mies.
const DZIEWCZYNKA = {
  sex: 'K', ageYears: 13, ageMonths: 156, boneAgeYears: 10.5, currentHeightCm: 140.0, currentWeightKg: 34,
  heightSds: -1.8, mphCm: 162.0, adultMedianHeightCm: 165.0,
  bp: { available: true, predictedAdultHeightCm: 158.0, errorBoundHalfWidthCm: 5.3 },
  rwt: { available: true, predictedAdultHeightCm: 156.0, errorBoundHalfWidthCm: 4.4 },
  blum: { available: false },
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'lowered' }, rwt: { levelKey: 'moderate' } } },
};
// Ten sam przypadek, ale opóźnienie 23 mies. (13 l 0 mies. wobec wieku kostnego 11 l 1 mies.).
const DZIEWCZYNKA_23 = { ...DZIEWCZYNKA, boneAgeYears: 133 / 12 };
// Chłopiec 14 l, wiek kostny 11,5 → Δ = −30 mies. (kontrola: korekta liczbowa zostaje).
const CHLOPIEC = {
  sex: 'M', ageYears: 14, ageMonths: 168, boneAgeYears: 11.5, currentHeightCm: 148.0, currentWeightKg: 38,
  heightSds: -2.1, mphCm: 181.0, adultMedianHeightCm: 179.0,
  bp: { available: true, predictedAdultHeightCm: 176.0, errorBoundHalfWidthCm: 5.7 },
  rwt: { available: true, predictedAdultHeightCm: 172.0, errorBoundHalfWidthCm: 4.9 },
  blum: { available: false },
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'lowered' }, rwt: { levelKey: 'moderate' } } },
};

describe('GROWTH-PRED-BP-DZIEWCZETA — reguła tekstu (bpDelayCautionFor)', () => {
  const C = loadCard();

  it('dziewczęta: od Δ = −24 mies. jest ostrzeżenie, przy −23 go nie ma', () => {
    expect(C._bpDelayCautionFor('F', -24, true)).toContain('Bayleya-Pinneau');
    expect(C._bpDelayCautionFor('F', -30, true)).toContain('Bayleya-Pinneau');
    expect(C._bpDelayCautionFor('F', -23, true)).toBe('');
    expect(C._bpDelayCautionFor('F', 30, true)).toBe('');
  });

  it('dziewczęta: tekst mówi o niepewności i wprost o braku korekty liczbowej, z podaniem pracy', () => {
    const t = C._bpDelayCautionFor('F', -26, true);
    expect(t).toContain('26 mies.');
    expect(t).toContain('Korekty liczbowej u dziewcząt nie zastosowano');
    expect(t).toContain('Brämswig 1990');
    // nie wolno twierdzić, że u dziewcząt metoda zawyża — dane tego nie pokazują
    expect(t).not.toMatch(/zawyża u dziewcząt/);
  });

  it('chłopcy: tekst nazywa zawyżanie i zastosowaną korektę −2,0 cm', () => {
    const t = C._bpDelayCautionFor('M', -30, true);
    expect(t).toContain('zawyża u chłopców');
    expect(t).toContain('−2,0 cm');
    expect(t).toContain('Reinehr 2019');
  });

  it('bez wyniku Bayleya-Pinneau, bez wieku kostnego i przy nieznanej płci nie ma ostrzeżenia', () => {
    expect(C._bpDelayCautionFor('F', -30, false)).toBe('');
    expect(C._bpDelayCautionFor('M', null, true)).toBe('');
    expect(C._bpDelayCautionFor('', -30, true)).toBe('');
  });
});

describe('GROWTH-PRED-BP-DZIEWCZETA — model i karta', () => {
  const C = loadCard();

  it('model karty dla dziewczynki z Δ −30 niesie ostrzeżenie', () => {
    const m = C._buildModel(DZIEWCZYNKA);
    expect(m.sexKey).toBe('F');
    expect(m.deltaMonths).toBe(-30);
    expect(m.bpDelayCaution).toContain('30 mies.');
  });

  it('karta rysuje ostrzeżenie jako widoczną linię, a nie tylko w „Szczegółach”', () => {
    const html = C.render(DZIEWCZYNKA);
    expect(html).toContain('vgcc-hint');
    expect(html).toContain('Uwaga:');
    expect(html).toContain('Korekty liczbowej u dziewcz');
    // linia stoi przed rozwijanymi szczegółami
    expect(html.indexOf('Korekty liczbowej')).toBeLessThan(html.indexOf('<details class="vgcc-det"'));
  });

  it('przy opóźnieniu 23 mies. karta nie pokazuje ostrzeżenia', () => {
    const m = C._buildModel(DZIEWCZYNKA_23);
    expect(m.deltaMonths).toBe(-23);
    expect(m.bpDelayCaution).toBe('');
    expect(C.render(DZIEWCZYNKA_23)).not.toContain('Korekty liczbowej');
  });

  it('ostrzeżenie NIE zmienia liczb u dziewczynki: BP bez korekty i bez poszerzenia ±', () => {
    const fh = C.computeFinalHeightPrediction(DZIEWCZYNKA);
    const bp = fh.methods.filter((m) => m.key === 'bp')[0];
    expect(bp.biasCm).toBe(0);
    expect(bp.cm).toBeCloseTo(158.0, 3);
    expect(bp.errorHalfWidthCm).toBeCloseTo(5.3, 3);
    expect(fh.bpDelayCaution).toContain('Bayleya-Pinneau');
  });

  it('u chłopca z tym samym opóźnieniem korekta −2,0 cm zostaje, a ostrzeżenie ją nazywa', () => {
    const fh = C.computeFinalHeightPrediction(CHLOPIEC);
    const bp = fh.methods.filter((m) => m.key === 'bp')[0];
    expect(bp.biasCm).toBeCloseTo(-2.0, 3);
    expect(bp.cm).toBeCloseTo(174.0, 3);
    expect(fh.bpDelayCaution).toContain('skorygowano o −2,0 cm');
  });
});
