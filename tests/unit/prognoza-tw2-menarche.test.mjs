import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-TW2 (decyzja właściciela 2026-09-12): TW Mark II (Tanner 1983, tab. 3.1a–3.1c) dla
// dziewcząt, pseudometoda „wzrost przy menarche / 0,955" (Singleton 1975; korekta Cho 2026) i profil
// „po menarche" w konsensusie (RWT i KR poza, MPH ×0,25). Przypadek właściciela (dane fikcyjne o tej
// samej strukturze): dziewczynka 8 l 9 mies., 147,3 cm, wiek kostny 12 l, menarche w 8,75 r.ż.,
// MPH 168,5 — przed zmianą aplikacja mówiła „≈ 168 cm, preferowana RWT".

function load() {
  const win = {};
  loadBrowserScript('tw2_data.js', win);
  loadBrowserScript('vilda_tw2_prediction.js', win);
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win;
}
const win = load();
const T = win.calculateTW2Prediction;
const M = win.calculateMenarcheFractionPrediction;
const C = win.VildaGrowthCardC;
const D = win.tw2PredictionData;

const row = (tab, age) => tab.rows.find((r) => Math.abs(r.rowAge - age) < 1e-9);

describe('Transkrypcja tablic TW Mark II (dziewczęta) — strażnik komórek wobec druku', () => {
  it('rozmiary i komórki rozstrzygnięte wobec OCR (8,5 wzrost +0,90; 10,5 RUS −3,13; 3.1b 15,5 RUS −0,75)', () => {
    expect(D.girls.premenarcheal.rows).toHaveLength(20);
    expect(D.girls.postmenarchealMenarcheUnknown.rows).toHaveLength(11);
    expect(D.girls.postmenarchealMenarcheKnown.rows).toHaveLength(11);
    expect(row(D.girls.premenarcheal, 8.5)).toMatchObject({ h: 0.90, ca: -1.9, rus: -2.00, konst: 82, residualSdCm: 3.4, r: 0.85 });
    expect(row(D.girls.premenarcheal, 10.5)).toMatchObject({ h: 0.91, ca: -1.7, rus: -3.13, konst: 88, residualSdCm: 3.3 });
    expect(row(D.girls.premenarcheal, 14.5)).toMatchObject({ h: 0.88, ca: -0.1, rus: -3.88, konst: 79, residualSdCm: 2.4, r: 0.95 });
    expect(row(D.girls.postmenarchealMenarcheUnknown, 11.5)).toMatchObject({ h: 0.98, ca: -2.2, rus: -1.05, konst: 49, residualSdCm: 1.9, r: 0.96 });
    expect(row(D.girls.postmenarchealMenarcheUnknown, 15.5)).toMatchObject({ h: 1.02, ca: 0.0, rus: -0.75, konst: 10, residualSdCm: 0.9 });
    expect(row(D.girls.postmenarchealMenarcheKnown, 11.5)).toMatchObject({ h: 1.05, ca: -4.4, rus: -0.12, men: 2.0, konst: 29, residualSdCm: 1.9, r: 0.96 });
    expect(row(D.girls.postmenarchealMenarcheKnown, 14.0)).toMatchObject({ h: 1.09, ca: -0.8, rus: -0.47, men: 1.3, konst: -11, residualSdCm: 1.2, r: 0.99 });
    expect(row(D.girls.postmenarchealMenarcheKnown, 16.5)).toMatchObject({ h: 1.03, ca: 0.0, rus: -2.00, men: 0.0, konst: 29, residualSdCm: 1.1 });
    expect(D.meta.doi).toBe('10.1136/adc.58.10.767');
  });
});

describe('Silnik TW Mark II — przypadek właściciela i brzegi', () => {
  const base = { sex: 'F', chronologicalAgeMonths: 105, currentHeightCm: 147.3, boneAgeYears: 12 };
  it('po menarche przed 11,5 r.ż. ze znanym wiekiem menarche: tab. 3.1c, wiersz 11,5, dwa warianty → środek 157,9 ±6,4', () => {
    const r = T({ ...base, postmenarcheal: true, menarcheAgeYears: 8.75 });
    expect(r.available).toBe(true);
    expect(r.table).toBe('3.1c');
    expect(r.rowAge).toBe(11.5);
    expect(r.extrapolatedBelowTable).toBe(true);
    expect(r.variants).toEqual({ exactCa: 161.2, clampedCa: 154.6 });
    expect(r.predictedAdultHeightCm).toBeCloseTo(157.9, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(6.4, 1); // 1,645·1,9 + |161,2 − 154,6|/2
    expect(r.boneAgeSource).toBe('GP');
    expect(r.notes.join(' ')).toContain('nie były testowane w przedwczesnym dojrzewaniu');
  });
  it('bez wieku menarche: tab. 3.1b → 158,5 ±6,1 (warianty 161,5 / 155,5)', () => {
    const r = T({ ...base, postmenarcheal: true });
    expect(r.table).toBe('3.1b');
    expect(r.variants).toEqual({ exactCa: 161.5, clampedCa: 155.5 });
    expect(r.predictedAdultHeightCm).toBeCloseTo(158.5, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(6.1, 1);
  });
  it('przed menarche: tab. 3.1a, wiersz 9 → 172,8 ±5,9 — sam status menarche zmienia prognozę o ~15 cm', () => {
    const r = T({ ...base, postmenarcheal: false });
    expect(r.table).toBe('3.1a');
    expect(r.rowAge).toBe(9);
    expect(r.extrapolatedBelowTable).toBe(false);
    expect(r.predictedAdultHeightCm).toBeCloseTo(172.8, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(5.9, 1);
  });
  it('w zakresie tablicy: 13-latka po menarche (12,2), 158 cm, BA 13 → 163,1 ±2,8 bez ekstrapolacji', () => {
    const r = T({ sex: 'F', chronologicalAgeMonths: 156, currentHeightCm: 158, boneAgeYears: 13, postmenarcheal: true, menarcheAgeYears: 12.2 });
    expect(r.table).toBe('3.1c');
    expect(r.rowAge).toBe(13);
    expect(r.extrapolatedBelowTable).toBe(false);
    expect(r.variants).toBeNull();
    expect(r.predictedAdultHeightCm).toBeCloseTo(163.1, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(2.8, 1);
  });
  it('brzegi: status nieznany, chłopiec, menarche w przyszłości, wiersz 16,5 powyżej tablicy, clamp do wzrostu', () => {
    expect(T({ ...base })).toMatchObject({ available: false, reason: 'menarche-status-unknown' });
    // GROWTH-PRED-TW2B: chłopiec liczony z tab. 2.1 niezależnie od statusu menarche (przekazany status ignorowany)
    expect(T({ ...base, sex: 'M', postmenarcheal: false })).toMatchObject({ available: true, table: '2.1', sex: 'M', postmenarcheal: null, menarcheStatusUnknown: false });
    expect(T({ ...base, sex: 'M' })).toMatchObject({ available: true, table: '2.1' });
    expect(T({ ...base, boneAgeYears: null, postmenarcheal: true })).toMatchObject({ available: false, reason: 'missing-bone-age' });
    const fut = T({ ...base, postmenarcheal: true, menarcheAgeYears: 10 });
    expect(fut.table).toBe('3.1a');
    expect(fut.postmenarcheal).toBe(false);
    const older = T({ sex: 'F', chronologicalAgeMonths: 204, currentHeightCm: 170, boneAgeYears: 18, postmenarcheal: true, menarcheAgeYears: 13 });
    expect(older.rowAge).toBe(16.5);
    expect(older.extrapolatedAboveTable).toBe(true);
    // 1,03·170 − 2,00·18 + 29 = 168,1 < 170 → obcięte do obecnego wzrostu
    expect(older.predictedAdultHeightCmRaw).toBeCloseTo(168.1, 1);
    expect(older.predictedAdultHeightCm).toBe(170);
    expect(older.clampedToCurrentHeight).toBe(true);
  });
});

describe('Pseudometoda „wzrost przy menarche / 0,955"', () => {
  it('147,3 cm przy menarche, wiek kostny 12: baza 154,2 + korekta +3,1 = 157,3 ±3,3', () => {
    const r = M({ heightAtMenarcheCm: 147.3, boneAgeAtMenarcheYears: 12, menarcheAgeYears: 8.75, currentHeightCm: 147.3 });
    expect(r.available).toBe(true);
    expect(r.baseCm).toBeCloseTo(154.2, 1);
    expect(r.boneAgeAdjustmentCm).toBeCloseTo(3.1, 1);
    expect(r.predictedAdultHeightCm).toBeCloseTo(157.3, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(3.3, 1);
  });
  it('bez wieku kostnego bez korekty; korekta obcięta do [−3, +6]; bez wzrostu przy menarche — niedostępna', () => {
    expect(M({ heightAtMenarcheCm: 147.3 }).predictedAdultHeightCm).toBeCloseTo(154.2, 1);
    expect(M({ heightAtMenarcheCm: 147.3, boneAgeAtMenarcheYears: 9 }).boneAgeAdjustmentCm).toBe(6);
    expect(M({ heightAtMenarcheCm: 147.3, boneAgeAtMenarcheYears: 16 }).boneAgeAdjustmentCm).toBe(-3);
    expect(M({})).toMatchObject({ available: false, reason: 'missing-height-at-menarche' });
  });
});

describe('Karta konsensusu — profil po menarche', () => {
  const P = {
    sex: 'F', ageYears: 105 / 12, ageMonths: 105, boneAgeYears: 12, currentHeightCm: 147.3, currentWeightKg: 38.3,
    mphCm: 168.5, heightSds: 2.23, adultMedianHeightCm: 165.0, postmenarcheal: true, menarcheAgeYears: 8.75,
    heightAtMenarcheCm: 147.3, boneAgeAtMenarcheYears: 12,
    bp: { available: true, predictedAdultHeightCm: 159.8, errorBoundHalfWidthCm: 6.4, groupOverrideApplied: true },
    rwt: { available: true, predictedAdultHeightCm: 171.2, errorBoundHalfWidthCm: 5.2 },
    khamis: { available: true, predictedAdultHeightCm: 176.7, errorBoundHalfWidthCm: 4.3 },
    reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'low' }, rwt: { levelKey: 'lowered' } } },
  };
  it('RWT i KR poza konsensusem, MPH ×0,25, TW2 3.1c orientacyjna, menarche preferowana, konsensus ≈ 158 cm (przedtem 168)', () => {
    const r = C.computeFinalHeightPrediction(P);
    expect(r.postmenarcheal).toBe(true);
    expect(r.excludedMethods.sort()).toEqual(['khamis', 'rwt']);
    expect(r.mphWeightFactor).toBeCloseTo(0.25, 6);
    expect(r.mphShare).toBeLessThan(0.06);
    const keys = r.methods.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining(['tw2', 'menarche']));
    const tw2 = r.methods.find((m) => m.key === 'tw2');
    expect(tw2).toMatchObject({ tw2Table: '3.1c', tw2Extrapolated: true, levelKey: 'indicative', excluded: false });
    expect(tw2.cm).toBeCloseTo(157.9, 1);
    expect(r.preferredKey).toBe('menarche');
    expect(r.cm).toBeGreaterThan(157);
    expect(r.cm).toBeLessThan(159);
    expect(r.halfWidthCm).toBeCloseTo(3.3, 1);
  });
  it('karta: wiersze TW Mark II i menarche, akapity profilu, nota o tablicy „przeciętnej" BP; bez noty Bayley o przyspieszonych', () => {
    const html = C.render(P);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('TW Mark II 157,9 cm ±6,4');
    expect(text).toContain('Wzrost przy menarche / 0,955 157,3 cm ±3,3');
    expect(text).toContain('Profil po menarche:');
    expect(text).toContain('RWT: poza konsensusem, bo metoda nie zna statusu menarche');
    expect(text).toContain('waga ×0,25 po menarche');
    expect(text).toContain('tablica 3.1c (po menarche, ze znanym wiekiem menarche), wiersz 11,5 l; warianty: wiek dokładny 161,2 cm, wiek obcięty 154,6 cm');
    expect(text).toContain('Po menarche użyto tablicy dla dziewcząt „przeciętnych"');
    expect(text).not.toContain('dzieci przyspieszone o ponad 2 lata osiągają zwykle wzrost wyższy');
  });
  it('bez menarche (przed menarche): TW2 z tab. 3.1a, RWT w konsensusie, MPH z pełną wagą; chłopiec bez TW2', () => {
    const pre = C.computeFinalHeightPrediction({ ...P, postmenarcheal: false, menarcheAgeYears: null, heightAtMenarcheCm: null, bp: { available: true, predictedAdultHeightCm: 165.3, errorBoundHalfWidthCm: 6.4 } });
    expect(pre.postmenarcheal).toBe(false);
    expect(pre.excludedMethods).toEqual(['khamis']); // tylko bramka Δ +39
    expect(pre.methods.find((m) => m.key === 'tw2')).toMatchObject({ tw2Table: '3.1a', tw2Extrapolated: false, levelKey: 'lowered' });
    expect(pre.methods.find((m) => m.key === 'menarche')).toBeUndefined();
    expect(pre.mphWeightFactor).toBe(1);
    // GROWTH-PRED-TW2B: chłopiec dostaje wiersz TW Mark II z tab. 2.1 (silnik wołany z karty), bez profilu po menarche
    const boy = C.computeFinalHeightPrediction({ ...P, sex: 'M', postmenarcheal: null, tw2: null, menarche: null });
    expect(boy.methods.find((m) => m.key === 'tw2')).toMatchObject({ tw2Table: '2.1', tw2Extrapolated: false, levelKey: 'lowered', excluded: false });
    expect(boy.methods.find((m) => m.key === 'menarche')).toBeUndefined();
    expect(boy.postmenarcheal).toBe(false);
    expect(boy.mphWeightFactor).toBe(1);
    expect(C._gateFor('rwt', 36, { postmenarcheal: true })).toMatchObject({ excluded: true, factor: 0 });
    expect(C._gateFor('bp', 36, { postmenarcheal: true })).toMatchObject({ excluded: false, factor: 1 });
  });
});

describe('GROWTH-PRED-TW2B — chłopcy (tab. 2.1) i wzrost przy menarche z pola', () => {
  const B = (o) => T({ sex: 'M', chronologicalAgeMonths: 108, currentHeightCm: 145, boneAgeYears: 12, ...o });
  it('transkrypcja tab. 2.1: rozmiar 26 wierszy 6,0–18,5; komórki rozstrzygnięte wobec OCR (9,0 SD 4,1; 13,0 stała 99; 16,0 stała 80)', () => {
    const t = D.boys.all;
    expect(t.table).toBe('2.1');
    expect(t.rows.length).toBe(26);
    expect(t.rows[0]).toMatchObject({ rowAge: 6, h: 1.28, ca: -7.5, rus: -0.12, konst: 75, residualSdCm: 4.7, r: 0.82 });
    expect(t.rows.find((r) => r.rowAge === 9)).toMatchObject({ h: 1.16, ca: -5.0, rus: -1.30, konst: 79, residualSdCm: 4.1, r: 0.87 });
    expect(t.rows.find((r) => r.rowAge === 13)).toMatchObject({ h: 1.01, ca: -2.1, rus: -3.90, konst: 99, residualSdCm: 3.7, r: 0.89 });
    expect(t.rows.find((r) => r.rowAge === 16)).toMatchObject({ h: 0.85, ca: -0.4, rus: -2.65, konst: 80, residualSdCm: 2.9, r: 0.93 });
    expect(t.rows[25]).toMatchObject({ rowAge: 18.5, h: 0.98, ca: 0, rus: -1.90, konst: 37, residualSdCm: 1.4, r: 0.99 });
  });
  it('chłopiec 9 l, 145 cm, BA 12: 1,16·145 − 5,0·9 − 1,30·12 + 79 = 186,6 ±6,7 (1,645·4,1), poziom obniżony', () => {
    const r = B({});
    expect(r).toMatchObject({ available: true, table: '2.1', rowAge: 9, extrapolatedBelowTable: false, extrapolatedAboveTable: false, variants: null });
    expect(r.predictedAdultHeightCm).toBeCloseTo(186.6, 1);
    expect(r.errorBoundHalfWidthCm).toBeCloseTo(6.7, 1);
    expect(r.notes.join(' ')).toContain('tablica 2.2 z przyrostem nie jest używana');
    expect(r.notes.join(' ')).toContain('Greulicha');
  });
  it('brzegi chłopców: poniżej 6 lat poza zakresem; 19-latek z niezrośniętymi nasadami → ostatni wiersz 18,5 z flagą; powyżej 20 lat poza zakresem', () => {
    expect(B({ chronologicalAgeMonths: 66, currentHeightCm: 112, boneAgeYears: 5.5 })).toMatchObject({ available: false, reason: 'out-of-range' });
    const old = B({ chronologicalAgeMonths: 228, currentHeightCm: 172, boneAgeYears: 17 });
    expect(old).toMatchObject({ available: true, rowAge: 18.5, extrapolatedAboveTable: true });
    // 0,98·172 − 1,90·17 + 37 = 173,3
    expect(old.predictedAdultHeightCm).toBeCloseTo(173.3, 1);
    expect(old.notes.join(' ')).toContain('niezrośniętymi nasadami');
    expect(B({ chronologicalAgeMonths: 246 })).toMatchObject({ available: false, reason: 'out-of-range' });
  });
  it('karta: chłopiec z TW Mark II w konsensusie obok BP i RWT; akapit nazywa tablicę 2.1 i chłopców', () => {
    const boyP = { sex: 'M', ageYears: 9, ageMonths: 108, currentHeightCm: 145, boneAgeYears: 12, motherHeightCm: 165, fatherHeightCm: 185,
      bp: { available: true, predictedAdultHeightCm: 179.0, errorBoundHalfWidthCm: 5.7 },
      rwt: { available: true, predictedAdultHeightCm: 190.7, errorBoundHalfWidthCm: 4.9 },
      khamis: { available: true, predictedAdultHeightCm: 193.5, errorBoundHalfWidthCm: 5.3 } };
    const f = C.computeFinalHeightPrediction(boyP);
    const tw2 = f.methods.find((m) => m.key === 'tw2');
    expect(tw2).toMatchObject({ tw2Table: '2.1', excluded: false });
    expect(tw2.cm).toBeCloseTo(186.6, 1);
    expect(f.excludedMethods).toEqual(['khamis']);
    expect(f.postmenarcheal).toBe(false);
    const text = C.render(boyP).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('TW Mark II 186,6 cm ±6,7');
    expect(text).toContain('równania Tannera i wsp. (1983) dla chłopców, tablica 2.1 (3 zmienne: wzrost, wiek metrykalny, wiek kostny), wiersz 9 l');
    expect(text).not.toContain('Profil po menarche:');
  });
});

