import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-BIAS (decyzja właściciela 2026-09-11, poziom A + C, próg ±2 SDS, wiersz pokazuje
// wartość skorygowaną): korekty błędu systematycznego metod wg profilu pacjenta, MPH jako cel
// warunkowy (regresja do średniej 0,78; Luo 1998), waga MPH ×0,5 w niskorosłości, Reinehr z własnym
// przedziałem ±5,7 zamiast domyślnego σ 3,0. Dane fikcyjne.

function loadCard() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}
const SD = 1.645;

// Chłopiec 14 l z opóźnieniem kostnym 30 mies., niski (hSDS −2,1), MPH +0,3 SDS (typowy KOWD).
const KOWD = {
  sex: 'M', ageYears: 14, ageMonths: 168, boneAgeYears: 11.5, currentHeightCm: 148.0, currentWeightKg: 38,
  heightSds: -2.1, mphCm: 181.0, adultMedianHeightCm: 179.0,
  bp: { available: true, predictedAdultHeightCm: 176.0, errorBoundHalfWidthCm: 5.7 },
  rwt: { available: true, predictedAdultHeightCm: 172.0, errorBoundHalfWidthCm: 4.9 },
  reinehr: { available: true, predictedAdultHeightCm: 173.0 },
  blum: { available: false }, // bez wzrostów rodziców; arytmetyka niżej ma trzy metody + MPH
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'lowered' }, rwt: { levelKey: 'moderate' }, reinehr: { levelKey: 'moderate' } } },
};

describe('GROWTH-PRED-BIAS — reguły korekt (biasFor)', () => {
  const C = loadCard();
  it('BP, chłopcy, Δ ≤ −24: −2,0 cm i σ×1,2; przy Δ −23 bez korekty; dziewczęta bez korekty', () => {
    expect(C._biasFor('bp', { sexKey: 'M', deltaMonths: -24 })).toMatchObject({ shiftCm: -2.0, sigmaFactor: 1.2 });
    expect(C._biasFor('bp', { sexKey: 'M', deltaMonths: -23 })).toBeNull();
    expect(C._biasFor('bp', { sexKey: 'F', deltaMonths: -30 })).toBeNull();
  });
  it('BP, chłopcy wysocy (hSDS ≥ +2) z wiekiem kostnym < 12: −4,0 i σ×1,3; przy BA 12 już nie', () => {
    expect(C._biasFor('bp', { sexKey: 'M', heightSds: 2.0, boneAgeYears: 11.9, deltaMonths: 6 })).toMatchObject({ shiftCm: -4.0, sigmaFactor: 1.3 });
    expect(C._biasFor('bp', { sexKey: 'M', heightSds: 2.0, boneAgeYears: 12, deltaMonths: 6 })).toBeNull();
    expect(C._biasFor('bp', { sexKey: 'M', heightSds: 1.9, boneAgeYears: 10, deltaMonths: 6 })).toBeNull();
  });
  it('BP, dziewczęta wysokie z wiekiem kostnym 12–14: −1,0; poza tym oknem bez korekty', () => {
    expect(C._biasFor('bp', { sexKey: 'F', heightSds: 2.3, boneAgeYears: 12 })).toMatchObject({ shiftCm: -1.0, sigmaFactor: 1 });
    expect(C._biasFor('bp', { sexKey: 'F', heightSds: 2.3, boneAgeYears: 13.9 })).toMatchObject({ shiftCm: -1.0 });
    expect(C._biasFor('bp', { sexKey: 'F', heightSds: 2.3, boneAgeYears: 14 })).toBeNull();
    expect(C._biasFor('bp', { sexKey: 'F', heightSds: 2.3, boneAgeYears: 11 })).toBeNull();
  });
  it('reguły BP są rozłączne: opóźnienie ma pierwszeństwo, korekty się nie sumują', () => {
    const b = C._biasFor('bp', { sexKey: 'M', deltaMonths: -30, heightSds: 2.5, boneAgeYears: 10 });
    expect(b.shiftCm).toBe(-2.0);
  });
  it('RWT w niskorosłości (hSDS ≤ −2): −1,3; hSDS −1,9 bez korekty; KR/Blum/Reinehr nigdy', () => {
    expect(C._biasFor('rwt', { heightSds: -2 })).toMatchObject({ shiftCm: -1.3 });
    expect(C._biasFor('rwt', { heightSds: -1.9 })).toBeNull();
    expect(C._biasFor('khamis', { heightSds: -3, deltaMonths: -30 })).toBeNull();
    expect(C._biasFor('blum', { heightSds: -3 })).toBeNull();
    expect(C._biasFor('reinehr', { sexKey: 'M', deltaMonths: -30 })).toBeNull();
  });
  it('cel warunkowy MPH: M + 0,78·(MPH − M); bez mediany zwraca MPH', () => {
    expect(C._mphAnchor(190, 179.5)).toBeCloseTo(187.69, 2);
    expect(C._mphAnchor(170, 179.5)).toBeCloseTo(172.09, 2);
    expect(C._mphAnchor(179.5, 179.5)).toBeCloseTo(179.5, 5);
    expect(C._mphAnchor(185, null)).toBe(185);
    expect(C.MPH_SHRINK).toBe(0.78);
  });
});

describe('GROWTH-PRED-BIAS — chłopiec KOWD (Δ −30, hSDS −2,1)', () => {
  const C = loadCard();
  it('BP 176,0 → 174,0 (σ×1,2), RWT 172,0 → 170,7, Reinehr ±5,7; MPH jako cel warunkowy z wagą ×0,5', () => {
    const r = C.computeFinalHeightPrediction(KOWD);
    const bp = r.methods.find((m) => m.key === 'bp');
    const rwt = r.methods.find((m) => m.key === 'rwt');
    const re = r.methods.find((m) => m.key === 'reinehr');
    expect(bp.cm).toBeCloseTo(174.0, 5); expect(bp.uncorrectedCm).toBeCloseTo(176.0, 5); expect(bp.biasCm).toBe(-2.0);
    expect(bp.errorHalfWidthCm).toBeCloseTo(5.7 * 1.2, 5);
    expect(rwt.cm).toBeCloseTo(170.7, 5); expect(rwt.biasCm).toBe(-1.3);
    expect(re.errorHalfWidthCm).toBe(5.7);
    expect(r.biasApplied).toEqual(['rwt', 'bp']);
    expect(r.mphAnchorCm).toBeCloseTo(179 + 0.78 * 2, 5); // 180,56
    expect(r.mphWeightFactor).toBe(0.5);
    // wynik = średnia ważona skorygowanych wartości i kotwicy:
    const w = (f, pm) => f / Math.pow(pm / SD, 2);
    const wBp = w(0.5, 5.7 * 1.2), wRwt = w(0.7, 4.9), wRe = w(0.7, 5.7), wM = 0.5 * 0.7 / (5.1 * 5.1);
    const expected = (wBp * 174.0 + wRwt * 170.7 + wRe * 173.0 + wM * 180.56) / (wBp + wRwt + wRe + wM);
    expect(r.cm).toBeCloseTo(expected, 3);
    expect(r.preferredKey).toBe('rwt'); // po A1 Reinehr nie dominuje już „z urzędu"
  });
  it('karta: wiersz pokazuje wartość skorygowaną, Szczegóły mają surową, korektę, źródło i cel warunkowy', () => {
    const html = C.render(KOWD);
    const rows = html.slice(html.indexOf('vgcc-methods'), html.indexOf('vgcc-mph'));
    expect(rows).toContain('Bayley–Pinneau</span><span><span class="vgcc-val">174,0 cm</span> <span class="vgcc-pm">±6,8</span>');
    expect(rows).toContain('RWT</span><span><span class="vgcc-val">170,7 cm</span>');
    expect(rows).not.toContain('176,0');
    expect(html).toContain('Cel rodzicielski (MPH): <b>181,0 cm</b>'); // kafel bez zmian
    const det = html.slice(html.indexOf('vgcc-det'));
    expect(det).toContain('Korekta błędu systematycznego:</span> RWT 172,0 → 170,7 cm (−1,3 cm): RWT w niskorosłości (hSDS ≤ −2) zawyża (Blum 2022); Bayley–Pinneau 176,0 → 174,0 cm (−2,0 cm, σ ×1,2): Bayley–Pinneau przy opóźnieniu kostnym ≥ 2 lata zawyża u chłopców (Reinehr 2019; Brämswig 1990).');
    expect(det).toContain('MPH w konsensusie jako cel warunkowy 180,6 cm (regresja do średniej 0,78, Luo 1998; udział ');
    expect(det).toContain('waga ×0,5 w niskorosłości');
  });
  it('bez korekt (dziecko przeciętne, Δ 0, hSDS 0) Szczegóły nie mają akapitu o korekcie, MPH pozostaje „kotwicą"', () => {
    const html = C.render({ ...KOWD, boneAgeYears: 14, heightSds: 0, mphCm: 179.0, reinehr: { available: false } });
    expect(html).not.toContain('Korekta błędu systematycznego');
    expect(html).toContain('MPH w konsensusie jako kotwica (udział ');
    expect(html).not.toContain('waga ×0,5');
  });
});

describe('GROWTH-PRED-BIAS — pozostałe profile', () => {
  const C = loadCard();
  it('wysoki chłopiec, BA 10: BP −4,0 i ±7,4 (5,7×1,3); RWT bez korekty', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 9, ageMonths: 108, boneAgeYears: 10, currentHeightCm: 150, heightSds: 2.4, mphCm: 186, adultMedianHeightCm: 179,
      bp: { available: true, predictedAdultHeightCm: 196.0, errorBoundHalfWidthCm: 5.7 },
      rwt: { available: true, predictedAdultHeightCm: 191.0, errorBoundHalfWidthCm: 4.9 },
    });
    const bp = r.methods.find((m) => m.key === 'bp');
    expect(bp.cm).toBeCloseTo(192.0, 5); expect(bp.errorHalfWidthCm).toBeCloseTo(7.41, 2);
    expect(r.methods.find((m) => m.key === 'rwt').biasCm).toBe(0);
    expect(r.mphAnchorCm).toBeCloseTo(179 + 0.78 * 7, 5); // 184,46 — regresja do średniej
    expect(r.mphWeightFactor).toBe(1);
  });
  it('wysoka dziewczynka, BA 13: BP −1,0; ta sama przy BA 15: bez korekty', () => {
    const base = {
      sex: 'F', ageYears: 12, ageMonths: 144, boneAgeYears: 13, currentHeightCm: 165, heightSds: 2.2, mphCm: 172, adultMedianHeightCm: 165.5,
      bp: { available: true, predictedAdultHeightCm: 180.0, errorBoundHalfWidthCm: 4.0 },
      rwt: { available: true, predictedAdultHeightCm: 178.0, errorBoundHalfWidthCm: 4.2 },
    };
    expect(C.computeFinalHeightPrediction(base).methods.find((m) => m.key === 'bp').cm).toBeCloseTo(179.0, 5);
    expect(C.computeFinalHeightPrediction({ ...base, boneAgeYears: 15 }).methods.find((m) => m.key === 'bp').cm).toBeCloseTo(180.0, 5);
  });
  it('przypadek z GROWTH-PRED-DOBOR (Δ +36, hSDS +3,3, MPH 49 c.) — bez korekt, konsensus nadal 182,3', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 9, ageMonths: 108, boneAgeYears: 12, currentHeightCm: 152.3, currentWeightKg: 57, mphCm: 178.5, heightSds: 3.3,
      bp: { available: true, predictedAdultHeightCm: 179.0, errorBoundHalfWidthCm: 5.7 },
      rwt: { available: true, predictedAdultHeightCm: 190.7, errorBoundHalfWidthCm: 4.9 },
      khamis: { available: true, predictedAdultHeightCm: 193.5 },
      reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'lowered' }, rwt: { levelKey: 'lowered' } } },
    });
    expect(r.biasApplied).toEqual([]);
    expect(r.cm).toBeCloseTo(182.3, 0);
    expect(r.mphWeightFactor).toBe(1);
  });
  it('korekta działa przed clampem: skorygowana prognoza poniżej obecnego wzrostu zostaje obcięta', () => {
    const r = C.computeFinalHeightPrediction({
      sex: 'M', ageYears: 15, ageMonths: 180, boneAgeYears: 12.5, currentHeightCm: 161.0, heightSds: -2.3, mphCm: 175,
      bp: { available: true, predictedAdultHeightCm: 162.5, errorBoundHalfWidthCm: 4.0 },
      rwt: { available: true, predictedAdultHeightCm: 161.8, errorBoundHalfWidthCm: 4.0 },
    });
    const bp = r.methods.find((m) => m.key === 'bp'), rwt = r.methods.find((m) => m.key === 'rwt');
    expect(bp.cm).toBe(161.0); expect(bp.clamped).toBe(true); expect(bp.rawCm).toBeCloseTo(160.5, 5);
    expect(rwt.cm).toBe(161.0); expect(rwt.clamped).toBe(true);
  });
});

describe('GROWTH-PRED-BIAS — Reinehr z własnym przedziałem błędu (A1)', () => {
  it('silnik Reinehr 2019 zwraca errorBoundHalfWidthCm 5,7', () => {
    const win = {};
    loadBrowserScript('reinehr_cdgp_data.js', win);
    loadBrowserScript('advanced_growth_kowd.js', win);
    const r = win.advGrowthCalculateReinehrCdgpPrediction({
      sex: 'M', chronologicalAgeYears: 14, boneAgeYears: 12, currentHeightCm: 150, profileModel: { shouldShowReinehr: true },
    });
    expect(r.available).toBe(true);
    expect(r.errorBoundHalfWidthCm).toBe(5.7);
  });
  it('waga Reinehra w karcie liczy się z ±5,7 (σ 3,46), nie z domyślnego σ 3,0', () => {
    const C = loadCard();
    const wc = C._weightedConsensus([
      { key: 'rwt', label: 'RWT', value: 172, pm: 4.9, levelKey: 'moderate', gateFactor: 1 },
      { key: 'reinehr', label: 'Reinehr/CDGP', value: 173, pm: 5.7, levelKey: 'moderate', gateFactor: 1 },
    ], null);
    expect(wc.recommendedKey).toBe('rwt');
    expect(C.REINEHR_ERR_HALFWIDTH_CM).toBe(5.7);
  });
});
