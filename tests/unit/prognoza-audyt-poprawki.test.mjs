import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-AUDYT1 (2026-09-11): poprawki po podwójnym sprawdzeniu algorytmów prognozy wzrostu
// ostatecznego — punkty 1–8 audytu. Dane fikcyjne.

function loadAll() {
  const win = {};
  for (const f of ['bayley_pinneau_data.js', 'rwt_data.js', 'vilda_khamis_roche.js', 'vilda_advanced_growth.js', 'vilda_blum_iss.js', 'vilda_growth_card_c.js']) loadBrowserScript(f, win);
  return { win, A: win.VildaAdvancedGrowth || win, C: win.VildaGrowthCardC, blum: win.calculateBlumIssPrediction };
}

describe('1. Profil wiarygodności: brak przedziału ≠ „±0,0 cm = wysoka"', () => {
  const { A } = loadAll();
  it('BP poniżej 8 lat (brak tablic błędu) → poziom „orientacyjna" z powodem, nie „wysoka"', () => {
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 95, boneAgeYears: 8, currentHeightCm: 125 });
    expect(bp.available).toBe(true);
    expect(bp.errorBoundHalfWidthCm).toBeNull();
    const bt = A.advGrowthAssessBayleyPinneauReliability(bp, null);
    expect(bt.levelKey).toBe('indicative');
    expect(bt.reasonText).toContain('braku oryginalnych tabel błędu Bayley-Pinneau poniżej');
    expect(bt.reasonText).not.toContain('±0,0');
  });
  it('RWT bez przedziału → „orientacyjna"; ± 0 również nie jest „wysoka"', () => {
    expect(A.advGrowthAssessRWTReliability({ available: true, errorBoundHalfWidthCm: null, chronologicalAgeMonths: 120 }, null).levelKey).toBe('indicative');
    expect(A.advGrowthAssessRWTReliability({ available: true, errorBoundHalfWidthCm: 0, chronologicalAgeMonths: 120 }, null).levelKey).toBe('indicative');
    expect(A.advGrowthAssessRWTReliability({ available: true, errorBoundHalfWidthCm: 4.4, chronologicalAgeMonths: 120 }, null).levelKey).toBe('high');
  });
});

describe('2. Karta: metoda bez przedziału nie wygrywa dzięki domyślnemu σ', () => {
  const { A, C } = loadAll();
  it('σ domyślne = 5,7/1,645; BP bez ± przegrywa z Khamis–Roche (±5,3), ± wyniku = najszerszy znany, nie 4,9', () => {
    expect(C.DEFAULT_ERR_HALFWIDTH_CM).toBe(5.7);
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 95, boneAgeYears: 8, currentHeightCm: 125 });
    const bt = A.advGrowthAssessBayleyPinneauReliability(bp, null);
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 7.9, ageMonths: 95, boneAgeYears: 8, currentHeightCm: 125, currentWeightKg: 25, motherHeightCm: 165, fatherHeightCm: 179,
      bp, reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: bt.levelKey } } },
    });
    expect(r.methodCount).toBe(2);
    expect(r.preferredKey).toBe('khamis');
    expect(r.halfWidthCm).toBe(5.3);
    expect(r.halfWidthSource).toBe('preferred');
  });
  it('gdy preferowana nie ma ±: najszerszy znany ± wśród aktywnych; bez żadnego — 5,7 (nigdy 4,9)', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 12, ageMonths: 144, boneAgeYears: 12, currentHeightCm: 150,
      bp: { available: true, predictedAdultHeightCm: 176 }, // bez ±, poziom high → i tak σ 3,47
      rwt: { available: true, predictedAdultHeightCm: 175, errorBoundHalfWidthCm: 4.9 },
      reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'high' }, rwt: { levelKey: 'low' } } },
    });
    expect(r.preferredKey).toBe('bp');
    expect(r.halfWidthCm).toBe(4.9);
    expect(r.halfWidthSource).toBe('widest-known');
    const r2 = C.computeFinalHeightPrediction({ sex: 'M', ageYears: 12, ageMonths: 144, currentHeightCm: 150, bp: { available: true, predictedAdultHeightCm: 176 } });
    expect(r2.halfWidthCm).toBe(5.7);
    expect(r2.halfWidthSource).toBe('default');
  });
});

describe('3. Silnik BP: prognoza nie niżej niż obecny wzrost', () => {
  const { A } = loadAll();
  it('chłopiec 18 l, BA 18-6 (100%), 175 cm: korekta w dół (−0,36 cm) nie schodzi pod wzrost; pola clamp jak w RWT', () => {
    // GROWTH-PRED-BP-SIGN: korekta = −(błąd średni); u chłopców 18-0 błąd +0,14 cala → −0,36 cm → 174,6 → obcięte do 175.
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 216, boneAgeYears: 18.6, currentHeightCm: 175 });
    expect(bp.available).toBe(true);
    expect(bp.predictedAdultHeightCm).toBe(175);
    expect(bp.remainingGrowthCm).toBe(0);
    expect(bp.clampedToCurrentHeight).toBe(true);
    expect(bp.predictedAdultHeightCmRaw).toBeCloseTo(174.6, 5);
    expect(bp.predictionIntervalLowerCm).toBeGreaterThanOrEqual(175);
  });
  it('zwykły przypadek: bez clampu, raw = prognoza', () => {
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 120, boneAgeYears: 10, currentHeightCm: 140 });
    expect(bp.clampedToCurrentHeight).toBe(false);
    expect(bp.predictedAdultHeightCmRaw).toBe(bp.predictedAdultHeightCm);
  });
});

describe('4. Karta: „surowa" wartość to wskazanie metody przed clampem i korektą', () => {
  const { C } = loadAll();
  it('BP obcięte przez silnik (raw 160 → 165) + korekta −4,0: Szczegóły mówią prawdę', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 10, ageMonths: 120, boneAgeYears: 11, currentHeightCm: 165, heightSds: 2.3,
      bp: { available: true, predictedAdultHeightCm: 165, predictedAdultHeightCmRaw: 160, clampedToCurrentHeight: true, errorBoundHalfWidthCm: 5.0 },
      rwt: { available: true, predictedAdultHeightCm: 170, errorBoundHalfWidthCm: 4.9 },
    });
    const bp = r.methods.find((m) => m.key === 'bp');
    expect(bp.uncorrectedCm).toBe(160);
    expect(bp.rawCm).toBeCloseTo(156, 5);
    expect(bp.cm).toBe(165);
    expect(bp.clamped).toBe(true);
    const html = C.render({
      sex: 'M', ageYears: 10, ageMonths: 120, boneAgeYears: 11, currentHeightCm: 165, heightSds: 2.3,
      bp: { available: true, predictedAdultHeightCm: 165, predictedAdultHeightCmRaw: 160, clampedToCurrentHeight: true, errorBoundHalfWidthCm: 5.0 },
      rwt: { available: true, predictedAdultHeightCm: 170, errorBoundHalfWidthCm: 4.9 },
    });
    expect(html).toContain('Bayley–Pinneau 160,0 → 156,0 cm (−4,0 cm, σ ×1,3), obcięte do obecnego wzrostu 165,0 cm');
    expect(html).toContain('Bayley–Pinneau wskazała 160,0 cm (po korekcie 156,0 cm)');
    expect(html).not.toContain('165,0 → 165,0');
  });
  it('dolna granica przedziału nigdy poniżej obecnego wzrostu (także bez clampu)', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 16, ageMonths: 192, boneAgeYears: 16, currentHeightCm: 172,
      bp: { available: true, predictedAdultHeightCm: 173.0, errorBoundHalfWidthCm: 4.0 },
      rwt: { available: true, predictedAdultHeightCm: 172.5, errorBoundHalfWidthCm: 4.0 },
      khamis: { available: true, predictedAdultHeightCm: 174 },
    });
    expect(r.methodCount).toBe(3);
    const es = C._buildEntries({
      sex: 'M', ageYears: 16, ageMonths: 192, boneAgeYears: 16, currentHeightCm: 172,
      bp: { available: true, predictedAdultHeightCm: 173.0, errorBoundHalfWidthCm: 4.0 },
      rwt: { available: true, predictedAdultHeightCm: 172.5, errorBoundHalfWidthCm: 4.0 },
      khamis: { available: true, predictedAdultHeightCm: 174 },
    });
    for (const e of es) expect(e.loCm).toBeGreaterThanOrEqual(172);
    expect(es.find((e) => e.key === 'bp').loCm).toBe(172);      // 173 − 4 = 169 → 172
    expect(es.find((e) => e.key === 'khamis').loCm).toBe(172);  // 174 − 5,3 = 168,7 → 172
    expect(es.find((e) => e.key === 'bp').hiCm).toBe(177);
  });
});

describe('5. Karta: wszystkie metody poza konsensusem → jasny komunikat, nie „Uzupełnij dane"', () => {
  const { C } = loadAll();
  it('tylko Khamis–Roche przy Δ +30: hero mówi, że metoda jest poza konsensusem i czego brakuje', () => {
    const input = { sex: 'M', ageYears: 9, ageMonths: 108, boneAgeYears: 11.5, currentHeightCm: 140, khamis: { available: true, predictedAdultHeightCm: 180 } };
    expect(C.computeFinalHeightPrediction(input)).toBeNull();
    const html = C.render(input);
    expect(html).toContain('Prognoza bez konsensusu');
    expect(html).toContain('Dostępne metody (Khamis–Roche) są poza konsensusem — rozbieżność wieku kostnego i metrykalnego +30 mies.');
    expect(html).not.toContain('Uzupełnij dane (wzrost, masę');
    expect(html).toContain('is-excl');
  });
  it('bez żadnej metody nadal „Uzupełnij dane"', () => {
    expect(C.render({ sex: 'M', ageYears: 9, ageMonths: 108 })).toContain('Uzupełnij dane (wzrost, masę');
  });
});

describe('6. Blum: masa urodzeniowa w gramach i wartości nierealne', () => {
  const { blum } = loadAll();
  const base = { sex: 'M', chronologicalAgeYears: 10, currentHeightCm: 121, heightSds: -2.5, boneAgeYears: 8, motherHeightCm: 160, fatherHeightCm: 170 };
  it('3200 (gramy) → 3,2 kg → model M1, wynik jak dla 3,2 kg; 12 kg → ignorowane (M2)', () => {
    const kg = blum({ ...base, birthWeightKg: 3.2 });
    const g = blum({ ...base, birthWeightKg: 3200 });
    expect(kg.modelId).toBe(1);
    expect(g.modelId).toBe(1);
    expect(g.predictedAdultHeightCm).toBe(kg.predictedAdultHeightCm);
    expect(g.predictedAdultHeightCm).toBeLessThan(200);
    expect(blum({ ...base, birthWeightKg: 12 }).modelId).toBe(2);
    expect(blum({ ...base }).modelId).toBe(2);
  });
});

describe('7. Blum i karta: dolna granica przedziału nie niżej niż obecny wzrost', () => {
  const { blum, C } = loadAll();
  it('Blum: chłopiec 16,9 l, 172 cm, raw 172,4 (bez clampu): dolna granica = 172, nie 167', () => {
    const r = blum({ sex: 'M', chronologicalAgeYears: 16.9, currentHeightCm: 172, heightSds: -2.2, boneAgeYears: 16.5, motherHeightCm: 150, fatherHeightCm: 160 });
    expect(r.available).toBe(true);
    expect(r.clampedToCurrentHeight).toBe(false);
    expect(r.predictionIntervalLowerCm).toBe(172);
    expect(r.predictionIntervalUpperCm).toBeGreaterThan(172);
  });
  it('karta: przy wysokim dziecku bez korekty loCm liczy się zwyczajnie (wartość − ±)', () => {
    const es = C._buildEntries({
      sex: 'M', ageYears: 10, ageMonths: 120, boneAgeYears: 10, currentHeightCm: 140,
      bp: { available: true, predictedAdultHeightCm: 176.0, errorBoundHalfWidthCm: 5.0 },
    });
    expect(es[0].loCm).toBe(171);
    expect(es[0].hiCm).toBe(181);
  });
});

describe('8. Drobne: centyl MPH „<1"/„>100", wiek kostny w RWT, ostatni węzeł BP, stała KR', () => {
  const { A, C } = loadAll();
  it('centyl MPH: „&lt;1" → „<1. centyla", „&gt;100" → „>100. centyla", „49" → „49. centyl"', () => {
    const base = { sex: 'M', ageYears: 10, ageMonths: 120, currentHeightCm: 140, mphCm: 178.5, bp: { available: true, predictedAdultHeightCm: 176, errorBoundHalfWidthCm: 5 } };
    expect(C.render({ ...base, mphCentileText: '&lt;1' })).toContain('&lt;1. centyla');
    expect(C.render({ ...base, mphCentileText: '<1' })).toContain('&lt;1. centyla');
    expect(C.render({ ...base, mphCentileText: '&gt;100' })).toContain('&gt;100. centyla');
    expect(C.render({ ...base, mphCentileText: '49' })).toContain('49. centyl</span>');
    expect(C.render({ ...base, mphCentileText: '49' })).not.toContain('49. centyla');
  });
  it('RWT: wiek kostny 90 (miesiące zamiast lat) i „abc" → invalid-bone-age, nie cicha prognoza ani CA zamiast BA', () => {
    const base = { sex: 'M', chronologicalAgeMonths: 120, currentHeightCm: 140, currentWeightKg: 35, motherHeightCm: 165, fatherHeightCm: 178 };
    expect(A.calculateRWTPrediction({ ...base, boneAgeYears: 90 }).reason).toBe('invalid-bone-age');
    expect(A.calculateRWTPrediction({ ...base, boneAgeYears: 'abc' }).reason).toBe('invalid-bone-age');
    const ok = A.calculateRWTPrediction({ ...base, boneAgeYears: 10 });
    expect(ok.available).toBe(true);
    expect(ok.usedChronologicalAgeAsSkeletalAge).toBe(false);
    const fallback = A.calculateRWTPrediction({ ...base, boneAgeYears: null });
    expect(fallback.available).toBe(true);
    expect(fallback.usedChronologicalAgeAsSkeletalAge).toBe(true);
  });
  it('BP: wiek kostny powyżej ostatniego węzła o 100% (chłopcy 18-6, dziewczęta 18-0) → prognoza = wzrost, nie „poza zakresem"', () => {
    const m = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 216, boneAgeYears: 18.6, currentHeightCm: 175 });
    expect(m.available).toBe(true);
    expect(m.percentMatureHeight).toBe(100);
    // 100% × 175 = 175; korekta populacyjna (−0,36 cm) obcięta clampem do wzrostu
    expect(m.predictedAdultHeightCmUncorrected).toBe(175);
    expect(m.predictedAdultHeightCm).toBe(175);
    const f = A.calculateBayleyPinneauPrediction({ sex: 'F', chronologicalAgeMonths: 216, boneAgeYears: 18.4, currentHeightCm: 165 });
    expect(f.available).toBe(true);
    expect(f.predictedAdultHeightCmUncorrected).toBe(165);
    expect(f.predictedAdultHeightCm).toBeGreaterThanOrEqual(165); // korekta ujemna obcięta do wzrostu
    // tablica przyspieszona chłopców kończy się na 17-0 = 99,0% → nadal poza zakresem
    const acc = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 180, boneAgeYears: 17.5, currentHeightCm: 175 });
    expect(acc.available).toBe(false);
  });
  it('stała ±KR jest eksportowana z karty (adapter czyta ją zamiast własnej kopii)', () => {
    expect(C.KR_ERR_HALFWIDTH_CM).toEqual({ M: 5.3, F: 4.3 });
  });
});
