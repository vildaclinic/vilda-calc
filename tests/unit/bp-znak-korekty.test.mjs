import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-BP-SIGN (decyzja właściciela 2026-09-11): błąd średni z tabel IV/V Bayley–Pinneau 1952
// (próba walidacyjna Berkeley) ma konwencję „przewidziany − osiągnięty" (wywnioskowaną z Roche 1975
// i ryc. 2 pracy), więc korektę się ODEJMUJE. Do SW 1.0.891 była dodawana. Plus: reguła RWT „przed
// 13. rokiem u chłopców / 8. u dziewcząt" ściśle, noty z prac w Szczegółach karty. Dane fikcyjne.

function loadAll() {
  const win = {};
  for (const f of ['bayley_pinneau_data.js', 'rwt_data.js', 'vilda_khamis_roche.js', 'vilda_advanced_growth.js', 'vilda_blum_iss.js', 'vilda_growth_card_c.js']) loadBrowserScript(f, win);
  return { win, A: win.VildaAdvancedGrowth || win, C: win.VildaGrowthCardC, BPD: win.bayleyPinneauData, RWD: win.rwtData };
}

describe('Znak korekty błędu średniego Bayley–Pinneau', () => {
  const { A, BPD } = loadAll();
  it('dziewczynka 8-0, BA 8, 120 cm: surowo 151,9; błąd tabelaryczny −0,86 cala → korekta +2,18 cm → 154,1 (nie 149,7)', () => {
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'F', chronologicalAgeMonths: 96, boneAgeYears: 8, currentHeightCm: 120 });
    expect(bp.available).toBe(true);
    expect(bp.predictedAdultHeightCmUncorrected).toBe(151.9);
    expect(bp.tabledMeanErrorCmRaw).toBeCloseTo(-2.1844, 4);
    expect(bp.meanErrorCorrectionCm).toBeCloseTo(2.18, 2);
    expect(bp.predictedAdultHeightCm).toBe(154.1);
    expect(bp.hasBiasCorrection).toBe(true);
  });
  it('chłopiec 12-0, BA 12, 150 cm: błąd +0,16 cala → korekta −0,41 cm → 179,4 (nie 180,3)', () => {
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'M', chronologicalAgeMonths: 144, boneAgeYears: 12, currentHeightCm: 150 });
    expect(bp.predictedAdultHeightCmUncorrected).toBe(179.9);
    expect(bp.meanErrorCorrectionCm).toBeCloseTo(-0.41, 2);
    expect(bp.predictedAdultHeightCm).toBe(179.4);
  });
  it('przedział 90% liczy się wokół wartości skorygowanej', () => {
    const bp = A.calculateBayleyPinneauPrediction({ sex: 'F', chronologicalAgeMonths: 96, boneAgeYears: 8, currentHeightCm: 120 });
    expect(bp.predictionIntervalLowerCm).toBeCloseTo(154.1 - bp.errorBoundHalfWidthCm, 1);
    expect(bp.predictionIntervalUpperCm).toBeCloseTo(154.1 + bp.errorBoundHalfWidthCm, 1);
  });
  it('metadane tabel opisują konwencję: korekta odejmowana, definicja błędu wywnioskowana', () => {
    expect(BPD.meta.errorModel.pointEstimateCorrection).toContain('- meanErrorCm');
    expect(BPD.meta.errorModel.signConventionUsedInApp).toContain('SUBTRACTED');
    expect(BPD.meta.errorModel.errorDefinitionInSource).toContain('inferred as predicted minus attained');
  });
});

describe('Errata J Pediatr 1952;40:371 — tabela IID (chłopcy przyspieszeni 12-0…17-0)', () => {
  const { BPD } = loadAll();
  it('21 odsetków wzrostu dojrzałego = wiersz z erraty (komórki w calach nie są przechowywane, więc przesunięcie kolumn nie dotyczy aplikacji)', () => {
    const errata = { '12-0': 80.9, '12-3': 81.8, '12-6': 82.8, '12-9': 83.9, '13-0': 85.0, '13-3': 86.3, '13-6': 87.5, '13-9': 89.0, '14-0': 90.5, '14-3': 91.8, '14-6': 93.0, '14-9': 94.3, '15-0': 95.8, '15-3': 96.7, '15-6': 97.1, '15-9': 97.6, '16-0': 98.0, '16-3': 98.3, '16-6': 98.5, '16-9': 98.8, '17-0': 99.0 };
    const rows = BPD.groups.boys.accelerated.factors;
    for (const [label, pct] of Object.entries(errata)) {
      const row = rows.find((r) => r.boneAgeLabel === label);
      expect(row, label).toBeTruthy();
      expect(row.percentMatureHeight, label).toBe(pct);
    }
    expect(BPD.meta.sourceErratum.scope).toContain('Table IID');
  });
});

describe('RWT: wiek metrykalny zamiast kostnego tylko PRZED 13. rokiem (chłopcy) / 8. (dziewczęta)', () => {
  const { A, RWD } = loadAll();
  const base = { currentHeightCm: 150, currentWeightKg: 40, motherHeightCm: 165, fatherHeightCm: 178, boneAgeYears: null };
  it('chłopiec 155 mies. → zastąpienie z flagą; 156 mies. → brak danych (uzupełnij wiek kostny)', () => {
    const a = A.calculateRWTPrediction({ ...base, sex: 'M', chronologicalAgeMonths: 155 });
    expect(a.available).toBe(true);
    expect(a.usedChronologicalAgeAsSkeletalAge).toBe(true);
    const b = A.calculateRWTPrediction({ ...base, sex: 'M', chronologicalAgeMonths: 156 });
    expect(b.available).toBe(false);
    expect(b.reason).toBe('missing-input');
    expect(b.message).toContain('wiek kostny');
  });
  it('dziewczynka 95 mies. → zastąpienie; 96 mies. → brak danych', () => {
    expect(A.calculateRWTPrediction({ ...base, sex: 'F', chronologicalAgeMonths: 95 }).usedChronologicalAgeAsSkeletalAge).toBe(true);
    expect(A.calculateRWTPrediction({ ...base, sex: 'F', chronologicalAgeMonths: 96 }).reason).toBe('missing-input');
    expect(RWD.meta.chronologicalAgeMayReplaceSkeletalAgeRule).toContain('strictly BEFORE');
  });
});

describe('Noty z prac źródłowych w Szczegółach karty', () => {
  const { C } = loadAll();
  const base = {
    sex: 'M', ageYears: 9, ageMonths: 108, currentHeightCm: 152.3, mphCm: 178.5,
    bp: { available: true, predictedAdultHeightCm: 179.0, errorBoundHalfWidthCm: 5.7 },
    rwt: { available: true, predictedAdultHeightCm: 190.7, errorBoundHalfWidthCm: 4.9 },
  };
  it('BP obecna: zalecenie uśredniania odczytów RTG; Δ +36 → zdanie o przyspieszonych; Δ −36 → o opóźnionych', () => {
    const acc = C.render({ ...base, boneAgeYears: 12 });
    expect(acc).toContain('Bayley–Pinneau:</span> błąd odczytu wieku kostnego z RTG jest głównym źródłem błędu prognozy');
    expect(acc).toContain('dzieci przyspieszone o ponad 2 lata osiągają zwykle wzrost wyższy, niż wskazują tabele');
    expect(acc).not.toContain('opóźnione o ponad 2 lata');
    const ret = C.render({ ...base, ageYears: 14, ageMonths: 168, boneAgeYears: 11 });
    expect(ret).toContain('dzieci opóźnione o ponad 2 lata osiągają zwykle wzrost niższy, niż wskazują tabele');
    expect(ret).not.toContain('przyspieszone o ponad 2 lata');
    const norm = C.render({ ...base, boneAgeYears: 9.5 });
    expect(norm).toContain('uśrednić kilka niezależnych odczytów');
    expect(norm).not.toContain('o ponad 2 lata');
  });
  it('bez BP nota nie pojawia się', () => {
    const html = C.render({ ...base, bp: { available: false }, boneAgeYears: 12, khamis: { available: true, predictedAdultHeightCm: 193.5 } });
    expect(html).not.toContain('Bayley–Pinneau:</span>');
  });
});
