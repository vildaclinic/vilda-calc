import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// GROWTH-PRED-DOBOR (decyzja właściciela 2026-09-12): bramki stosowalności wg Δ = wiek kostny −
// wiek metrykalny, MPH jako kotwica konsensusu i nagłówek = metoda preferowana przy niskiej
// zgodności. Przypadek właściciela (dane fikcyjne o tej samej strukturze): chłopiec ~9 l,
// wiek kostny 12 l (Δ +36 mies.), 152,3 cm, MPH 178,5; BP 179,0 ±5,7 · RWT 190,7 ±4,9 ·
// KR 193,5. Przed zmianą aplikacja mówiła „≈ 190, preferowana: RWT", bo kara za rozbieżność
// wieku kostnego spadała symetrycznie na BP i RWT, a KR (bez wieku kostnego) nie była karana.

function loadCard() {
  const win = {};
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  return win.VildaGrowthCardC;
}
function loadAdvanced() {
  const win = {};
  loadBrowserScript('vilda_khamis_roche.js', win);
  loadBrowserScript('vilda_advanced_growth.js', win);
  const api = win.VildaAdvancedGrowth || {};
  return {
    bp: api.advGrowthAssessBayleyPinneauReliability || win.advGrowthAssessBayleyPinneauReliability,
    rwt: api.advGrowthAssessRWTReliability || win.advGrowthAssessRWTReliability,
  };
}
const PRZYPADEK = {
  sex: 'M', ageYears: 9, ageMonths: 108, boneAgeYears: 12, currentHeightCm: 152.3, currentWeightKg: 57, mphCm: 178.5,
  bp: { available: true, predictedAdultHeightCm: 179.0, errorBoundHalfWidthCm: 5.7 },
  rwt: { available: true, predictedAdultHeightCm: 190.7, errorBoundHalfWidthCm: 4.9 },
  khamis: { available: true, predictedAdultHeightCm: 193.5 },
  reliabilityModel: { entryMap: { bayleyPinneau: { levelKey: 'lowered' }, rwt: { levelKey: 'lowered' } } },
};

describe('Dobór metody — przypadek właściciela (Δ +36 mies., otyłość, MPH przeciętne)', () => {
  const C = loadCard();
  it('bramki: KR poza konsensusem, RWT ×0,5, BP bez kary', () => {
    expect(C._gateFor('khamis', 36)).toMatchObject({ excluded: true, factor: 0 });
    expect(C._gateFor('khamis', 18)).toMatchObject({ excluded: false, factor: 0.5 });
    expect(C._gateFor('khamis', 6)).toMatchObject({ excluded: false, factor: 1 });
    expect(C._gateFor('rwt', 36)).toMatchObject({ excluded: false, factor: 0.5 });
    expect(C._gateFor('rwt', -36)).toMatchObject({ excluded: false, factor: 1 }); // opóźnienie: RWT z wyboru
    expect(C._gateFor('bp', 36)).toMatchObject({ excluded: false, factor: 1 });
    expect(C._gateFor('khamis', null)).toMatchObject({ excluded: false, factor: 1 }); // bez wieku kostnego bramki nie działają
  });
  it('Δ liczy się z wieku kostnego i łącznych miesięcy (12 l − 108 mies. = +36)', () => {
    expect(C._deltaMonths(PRZYPADEK)).toBe(36);
    expect(C._deltaMonths({ boneAgeYears: 11.5, ageMonths: 156 })).toBe(-18);
    expect(C._deltaMonths({ ageMonths: 156 })).toBeNull();
  });
  it('prognoza: nagłówek = konsensus ważony 182,3 z MPH (udział ~28%), preferowana Bayley–Pinneau, ± = jej przedział', () => {
    const r = C.computeFinalHeightPrediction(PRZYPADEK);
    // GROWTH-PRED-UI2 (2026-09-11): `cm` to zawsze konsensus ważony — metoda preferowana
    // nie zastępuje nagłówka (decyzja właściciela: konsensus jest metodą autorską).
    expect(r.headlineSource).toBe('weighted');
    expect(r.preferredKey).toBe('bp');
    expect(r.cm).toBeCloseTo(r.weightedCm, 5);
    expect(r.cm).toBeCloseTo(182.3, 0);
    expect(r.halfWidthCm).toBeCloseTo(5.7, 5);
    expect(r.weightedCm).toBeCloseTo(182.3, 0);
    expect(r.mphInConsensus).toBe(true);
    expect(r.mphShare).toBeGreaterThan(0.25);
    expect(r.mphShare).toBeLessThan(0.32);
    expect(r.excludedMethods).toEqual(['khamis']);
    expect(r.deltaMonths).toBe(36);
    expect(r.agreementLabel).toBe('niska');
    expect(r.minCm).toBe(179.0); expect(r.maxCm).toBe(190.7); // KR poza widełkami
    expect(r.methodCount).toBe(2);
    expect(r.sourceLabel).toBe('konsensus 2 metod i MPH');
    const kr = r.methods.find((m) => m.key === 'khamis');
    expect(kr.excluded).toBe(true);
    expect(kr.gateNote).toContain('poza konsensusem');
  });
  it('karta (GROWTH-PRED-UI2): hero = „Konsensus metod (ważony) ≈ 182", podtytuł = zgodność + preferowana, bez widełek; wiersze bez not; powody w Szczegółach', () => {
    const html = C.render(PRZYPADEK);
    const hero = html.slice(html.indexOf('vgcc-hero'), html.indexOf('vgcc-methods'));
    expect(hero).toContain('Konsensus metod (ważony)');
    expect(hero).toContain('≈ 182 cm');
    expect(hero).toContain('zgodność niska');
    expect(hero).toContain('preferowana: Bayley–Pinneau');
    expect(hero).not.toContain('179,0–190,7');
    expect(hero).not.toContain('metoda preferowana dla profilu');
    const rows = html.slice(html.indexOf('vgcc-methods'), html.indexOf('vgcc-mph'));
    expect(rows).toMatch(/<div class="vgcc-row is-pref"><span class="vgcc-nm">Bayley–Pinneau<\/span>/);
    expect(rows).toMatch(/<div class="vgcc-row is-excl"><span class="vgcc-nm">Khamis–Roche<\/span>/);
    expect(rows).not.toContain('vgcc-note');
    expect(rows).not.toContain('poza konsensusem');
    expect(rows).not.toContain('×0,5');
    const det = html.slice(html.indexOf('vgcc-det'));
    expect(det).toContain('widełki metod 179,0–190,7 cm');
    expect(det).toContain('MPH w konsensusie jako kotwica (udział 28%)');
    expect(det).toContain('wiek kostny wyprzedza metrykalny o 36 mies.');
    expect(det).toContain('RWT: waga ×0,5, bo wiek kostny ma w tej metodzie małą wagę');
    expect(det).toContain('Khamis–Roche: poza konsensusem, bo metoda nie zna wieku kostnego');
  });
  it('MPH nie może zostać „metodą preferowaną" ani wejść do widełek', () => {
    const wc = C._weightedConsensus([
      { key: 'bp', label: 'BP', value: 170, pm: 5.7, levelKey: 'low', gateFactor: 1 },
      { key: 'rwt', label: 'RWT', value: 171, pm: 4.9, levelKey: 'low', gateFactor: 1 },
    ], 190);
    expect(wc.recommendedKey).toBe('rwt');
    expect(wc.withMph).toBe(true);
    expect(wc.weighted).toBeGreaterThan(171); expect(wc.weighted).toBeLessThan(180);
  });
  it('przy jednej metodzie MPH nie wchodzi do konsensusu (nie ma czego uśredniać)', () => {
    const wc = C._weightedConsensus([{ key: 'bp', label: 'BP', value: 170, pm: 5.7, levelKey: 'moderate', gateFactor: 1 }], 190);
    expect(wc.withMph).toBe(false);
    expect(wc.weighted).toBe(170);
  });
  it('bez zadziałanej bramki i przy dobrej zgodności: brak wykluczeń, Szczegóły mówią „bez bramek"', () => {
    const r = C.computeFinalHeightPrediction({ ...PRZYPADEK, boneAgeYears: 9.2,
      bp: { available: true, predictedAdultHeightCm: 180, errorBoundHalfWidthCm: 5.7 },
      rwt: { available: true, predictedAdultHeightCm: 181, errorBoundHalfWidthCm: 4.9 },
      khamis: { available: true, predictedAdultHeightCm: 182 } });
    expect(r.headlineSource).toBe('weighted');
    expect(r.excludedMethods).toEqual([]);
    expect(r.gateFired).toBe(false);
    const html = C.render({ ...PRZYPADEK, boneAgeYears: 9.2,
      bp: { available: true, predictedAdultHeightCm: 180, errorBoundHalfWidthCm: 5.7 },
      rwt: { available: true, predictedAdultHeightCm: 181, errorBoundHalfWidthCm: 4.9 },
      khamis: { available: true, predictedAdultHeightCm: 182 } });
    expect(html).toContain('Bez bramek: wszystkie metody z pełną wagą.');
    expect(html).not.toContain('preferowana:'); // zgodność wysoka → bez metody preferowanej w podtytule
  });
});

describe('Dobór metody — kierunek kary za rozbieżność wieku kostnego w profilu wiarygodności', () => {
  const A = loadAdvanced();
  it('Bayley–Pinneau: kara tylko przy OPÓŹNIENIU ≤ −24 mies. (przyspieszenie obsługuje tablica „przyspieszona")', () => {
    expect(typeof A.bp).toBe('function');
    const adv = A.bp({ available: true, errorBoundHalfWidthCm: 5.7, deltaMonths: 36 }, null);
    const del = A.bp({ available: true, errorBoundHalfWidthCm: 5.7, deltaMonths: -36 }, null);
    expect(adv.levelKey).toBe('lowered');
    expect(del.levelKey).toBe('low');
    expect(del.reasonText).toContain('opóźnieni');
  });
  it('RWT: kara tylko przy PRZYSPIESZENIU ≥ +24 mies. (przy opóźnieniu RWT jest metodą z wyboru)', () => {
    expect(typeof A.rwt).toBe('function');
    const adv = A.rwt({ available: true, errorBoundHalfWidthCm: 4.9, enteredBoneAgeYears: 12, chronologicalAgeMonths: 108 }, null);
    const del = A.rwt({ available: true, errorBoundHalfWidthCm: 4.9, enteredBoneAgeYears: 11, chronologicalAgeMonths: 168 }, null);
    expect(adv.levelKey).toBe('lowered');
    expect(del.levelKey).toBe('moderate');
    expect(adv.reasonText).toContain('przyspieszeni');
  });
});
