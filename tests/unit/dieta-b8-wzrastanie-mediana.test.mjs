import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, oknoZSilnikiem, tablica, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-DIETA-B8 (decyzje właściciela 2026-09-30): czas do normy BMI u rosnącego dziecka liczony na trajektorii wzrostu
// RÓWNOLEGŁEJ DO MEDIANY WZROSTU siatki pacjenta (model B′), zamiast stałego tempa do 19 lat. Stabilizacja ma dwa czasy:
// S1 — masa stała (nagłówek, `months`), S2 — masa rośnie do górnej granicy planu (`gornaGranica`). Koniec wzrastania =
// ostatni miesiąc siatki głównej (OLAF 216 mies.; DS 240). Prognoza / MPH ≤ obecnego wzrostu nie jest sufitem.
// PRAWDZIWY silnik diety + PRAWDZIWY silnik SDS wzrostu z tablicami z app.js + PRAWDZIWE toNormalBMITarget. Dane FIKCYJNE.
// Wartości oczekiwane pochodzą z prototypu opisanego w audycie (część B, B8) i zostały potwierdzone na silniku produkcyjnym.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('bmiSource', 'OLAF');
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });

const TABLICE = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];
function oknoZWzrostem() {
  const win = oknoZSilnikiem();
  new Function('window', 'globalThis', zrodlo('vilda_sds_wzrostu.js'))(win, win);
  const L = win.VildaDsLMS, dane = { palCentyl: (p, m, c) => win.VildaCentileInterp.palCentileValue(p, m, c, 'HT') };
  for (const n of TABLICE) dane[n] = tablica(n);
  Object.assign(dane, {
    LMS_HEIGHT_DS_INFANT_BOYS: L.NIEMOWLE.HT.M, LMS_HEIGHT_DS_INFANT_GIRLS: L.NIEMOWLE.HT.F,
    LMS_HEIGHT_DS_BOYS: L.DZIECKO.HT.M, LMS_HEIGHT_DS_GIRLS: L.DZIECKO.HT.F,
  });
  win.VildaSdsWzrostu.ustawDane(dane);
  return wczytajDoOkna(win, 'vilda_diet_plan_ui.js');
}
const win = oknoZWzrostem();
ustawGlobal('toNormalBMITarget', new Function('window', `${funkcjaZ(appSrc, 'vildaBmiSilnik')}${funkcjaZ(appSrc, 'vildaBmiZrodlo')}${funkcjaZ(appSrc, 'toNormalBMITarget')}return toNormalBMITarget;`)(win));
beforeEach(() => { win.advancedGrowthData = {}; delete win.VildaPopulacjaPacjenta; win.VildaSdsWzrostu.ustawDane({ populacjaDomyslna: null }); });

const sym = (o) => win.energySimulateMonthsToBmiTarget({ ageMonthsOpt: 0, target: 'norm', trajektoria: true, ...o });
const ol = (o) => win.energyChildGrowthOutlook(o);
const ost = (s) => s.trajektoria[s.trajektoria.length - 1];
const DZ12 = { sex: 'F', ageYears: 12, heightCm: 153.8, weightKg: 58.7, weeklyLossKg: 0 };

describe('B8: trajektoria wzrostu wg mediany siatki (OLAF)', () => {
  it('dz. 12;0, 153,8 cm: w najbliższym roku 5,26 cm, dalej coraz wolniej; pozostało 11,2 cm do końca siatki (216 mies.)', () => {
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.annualGrowthCm).toBeCloseTo(5.26, 2);
    expect(o.modelWzrastania).toBe('mediana');
    expect(o.source).toBe('median');
    expect(o.zrodloWzrastania).toBe('OLAF');
    expect(o.koniecWzrastaniaMies).toBe(216);
    expect(o.pozostalyWzrostMedianaCm).toBe(11.2);
    expect(o.practicallyEnded).toBe(false);
    expect(o).not.toHaveProperty('hAt');
    const t = win.energyTrajektoriaWzrostu({ sex: 'F', ageMonths: 144 });
    // mediana zwalnia: drugi rok daje mniej niż pierwszy, a po 216 mies. nic
    expect(t.dMed(24) - t.dMed(12)).toBeLessThan(t.dMed(12));
    expect(t.dMed(72)).toBeCloseTo(t.dMed(80), 6);
  });

  it('T14: obie płcie, start 24–215 mies. — przebieg niemalejący, krok ≤ 0,41 cm/0,5 mies., bez wzrostu po końcu siatki; szew 36 mies. bez skoku', () => {
    for (const sex of ['F', 'M']) for (let m0 = 24; m0 <= 215; m0 += 7) {
      const t = win.energyTrajektoriaWzrostu({ sex, ageMonths: m0 });
      let prev = 0;
      for (let k = 1; k <= 480; k += 1) {
        const d = t.dMed(k / 2);
        expect(d).toBeGreaterThanOrEqual(prev);
        expect(d - prev).toBeLessThanOrEqual(0.41);
        if (m0 + (k - 1) / 2 >= t.koniecMies) expect(d).toBe(prev);
        prev = d;
      }
    }
    const t2 = win.energyTrajektoriaWzrostu({ sex: 'F', ageMonths: 24 });
    const d3435 = t2.dMed(11) - t2.dMed(10), d3536 = t2.dMed(12) - t2.dMed(11), d3637 = t2.dMed(13) - t2.dMed(12);
    expect(Math.abs(d3536 - d3435)).toBeLessThan(0.05);
    // na szwie Palczewska → OLAF zmienia się tylko nachylenie (≤ 0,1 cm/mies.), bez skoku poziomu między siatkami
    expect(Math.abs(d3637 - d3536)).toBeLessThan(0.1);
    // suma przyrostów w obrębie siatek (77,96 cm) ≠ surowa różnica median dwóch siatek (78,62 cm) — ta miała skok na szwie
    const T = win.VildaSdsWzrostu, surowa = T.mediana('F', 216, 'OLAF').mediana - T.mediana('F', 24, 'OLAF').mediana;
    expect(t2.pozostaloCm).toBeCloseTo(77.96, 2);
    expect(surowa).toBeCloseTo(78.62, 2);
  });

  it('T11/T12: koniec wzrastania bez powrotu — chł. 178 cm: 17;0 1,07 (trwa), 17;1 0,98 (zakończone), 17;7 0,45, 18;0 0; dz. 165 cm 17;0 0,32', () => {
    const g = (m, sex = 'M', h = 178) => ol({ sex, ageYears: m / 12, heightCm: h });
    expect(g(204).annualGrowthCm).toBeCloseTo(1.07, 2); expect(g(204).practicallyEnded).toBe(false);
    expect(g(205).annualGrowthCm).toBeCloseTo(0.98, 2); expect(g(205).practicallyEnded).toBe(true);
    expect(g(211).annualGrowthCm).toBeCloseTo(0.45, 2); expect(g(211).practicallyEnded).toBe(true);
    expect(g(215).practicallyEnded).toBe(true);
    expect(g(216).annualGrowthCm).toBe(0);
    expect(g(204, 'F', 165).annualGrowthCm).toBeCloseTo(0.32, 2);
  });

  it('T13: dz. 2;0, 86 cm — 9,20 cm w pierwszym roku (bez szwu siatek), S1 12 mies., S2 65 mies.', () => {
    const s = sym({ sex: 'F', ageYears: 2, heightCm: 86, weightKg: 15.5, weeklyLossKg: 0 });
    expect(s.annualGrowthCm).toBeCloseTo(9.2, 2);
    expect(s.months).toBe(12);
    expect(ost(s).wzrostCm).toBeCloseTo(95.2, 1);
    expect(s.gornaGranica.months).toBe(65);
    expect(ol({ sex: 'M', ageYears: 2.5, heightCm: 92 }).annualGrowthCm).toBeCloseTo(7.93, 2);
  });

  it('T17: populacja DS (resolver) — siatka DS, koniec 240 mies., dz. 12 l. 140 cm 2,19 cm w roku', () => {
    win.VildaPopulacjaPacjenta = () => 'DS';
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 140 });
    expect(o.siatkaWzrastania).toBe('DS');
    expect(o.koniecWzrastaniaMies).toBe(240);
    expect(o.zrodloWzrastania).toContain('DS');
    expect(o.annualGrowthCm).toBeCloseTo(2.19, 2);
  });

  it('bez silnika siatek (izolowany moduł) — dawny model zapasowy: stałe tempo z tabeli wiekowej', () => {
    const w2 = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
    const o = w2.energyChildGrowthOutlook({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.modelWzrastania).toBe('stale');
    expect(o.annualGrowthCm).toBe(6.5);
    expect(o.zrodloWzrastania).toBeNull();
  });
});

describe('B8: stabilizacja — S1 (masa stała, nagłówek) i S2 (masa do górnej granicy planu)', () => {
  it('T1: dz. 12;0, 153,8 cm, 58,7 kg — S1 18,5 mies. (160,8 cm); S2 dopiero po zmianie kryterium w 18. r.ż. → bez czasu (dotąd 47 mies. przy 174,4 cm)', () => {
    const s = sym(DZ12);
    expect(s.scenariusz).toBe('masa-stala');
    expect(s.months).toBe(18.5);
    expect(ost(s).wzrostCm).toBeCloseTo(160.8, 1);
    expect(ost(s).masaKg).toBe(58.7);
    expect(s.celPoZmianieKryterium).toBe(false);
    expect(s.gornaGranica.months).toBeNull();
    expect(s.gornaGranica.celPoZmianieKryterium).toBe(true);
    expect(s.gornaGranica.przyrostMasyKg).toBeCloseTo(6.82, 2);
    expect(s.przyrostMasyKg).toBe(0);
    expect(s.zrodloWzrastania).toBe('OLAF');
  });

  it('T2: dz. 12;0, 153,8 cm, 77,1 kg — ani S1, ani S2; wzrost w symulacji kończy się na 165,0 cm (dotąd 190,6 cm w 19. r.ż.)', () => {
    const s = sym({ ...DZ12, weightKg: 77.1 });
    expect(s.months).toBeNull();
    expect(s.gornaGranica.months).toBeNull();
    expect(Math.max(...s.trajektoria.map((q) => q.wzrostCm))).toBeCloseTo(165.0, 1);
  });

  it('T3/T4: chł. 12;0 150/58 — S1 17,5 (160,5 cm), S2 51 mies.; dz. 12;0 152/56 — S1 14, S2 46,5 mies.', () => {
    const c = sym({ sex: 'M', ageYears: 12, heightCm: 150, weightKg: 58, weeklyLossKg: 0 });
    expect(c.months).toBe(17.5);
    expect(ost(c).wzrostCm).toBeCloseTo(160.5, 1);
    expect(c.gornaGranica.months).toBe(51);
    expect(c.gornaGranica.celPoZmianieKryterium).toBe(false);
    expect(c.gornaGranica.przyrostMasyKg).toBeCloseTo(14.36, 2);
    const d = sym({ sex: 'F', ageYears: 12, heightCm: 152, weightKg: 56, weeklyLossKg: 0 });
    expect(d.months).toBe(14);
    expect(d.gornaGranica.months).toBe(46.5);
  });

  it('T9: alarm tempa wzrastania — bez czasu w obu scenariuszach', () => {
    win.advancedGrowthData = { tempo: { cmPerYear: 2.0, alarm: true } };
    const s = sym(DZ12);
    expect(s.tempoAlarm).toBe(true);
    expect(s.months).toBeNull();
    expect(s.gornaGranica.months).toBeNull();
  });
});

describe('B8: karta zaawansowana — prognoza wzrostu końcowego i tempo zmierzone', () => {
  it('T5: prognoza ≤ obecnego wzrostu (GROWTH-PRED-CLAMP) nie jest sufitem ani końcem wzrastania — dotąd redukcja i najkrótszy czas', () => {
    win.advancedGrowthData = { finalHeightPrediction: { cm: 153.8, clampedToCurrentHeight: true } };
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.capCm).toBeNull();
    expect(o.remainingCm).toBeNull();
    expect(o.practicallyEnded).toBe(false);
    expect(o.prognozaNiePrzekraczaWzrostu).toBe(true);
    expect(sym(DZ12).months).toBe(18.5);
    win.advancedGrowthData = { finalHeightPrediction: { cm: 150 } };
    expect(ol({ sex: 'F', ageYears: 12, heightCm: 153.8 }).practicallyEnded).toBe(false);
  });

  it('T6: prognoza 156,8 cm (> wzrostu) jest sufitem: 3,0 cm w roku, praktycznie zakończone (≤ 3 cm); 156,9 — jeszcze nie', () => {
    win.advancedGrowthData = { finalHeightPrediction: { cm: 156.8 } };
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.capCm).toBe(156.8);
    expect(o.annualGrowthCm).toBeCloseTo(3.0, 6);
    expect(o.practicallyEnded).toBe(true);
    expect(o.notaPokwitania).toBe(false);
    const s = sym(DZ12);
    expect(s.months).toBe(63);
    expect(Math.max(...s.trajektoria.map((q) => q.wzrostCm))).toBeCloseTo(156.8, 6);
    win.advancedGrowthData = { finalHeightPrediction: { cm: 156.9 } };
    expect(ol({ sex: 'F', ageYears: 12, heightCm: 153.8 }).practicallyEnded).toBe(false);
  });

  it('T7: tempo zmierzone 7,8 cm/rok (> mediany) — obowiązuje rok, łącznie nie więcej niż pozostały wzrost wg mediany; S1 13 mies.', () => {
    win.advancedGrowthData = { growthVelocity: 7.8 };
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.source).toBe('observed');
    expect(o.skalaTempa).toBe(1.48);
    expect(o.annualGrowthCm).toBeCloseTo(7.8, 6);
    const s = sym(DZ12);
    expect(s.months).toBe(13);
    expect(ost(s).wzrostCm).toBeCloseTo(161.9, 1);
    const s2 = sym({ ...DZ12, weightKg: 77.1 });
    expect(Math.max(...s2.trajektoria.map((q) => q.wzrostCm))).toBeCloseTo(153.8 + o.pozostalyWzrostMedianaCm, 0);
  });

  it('T8: tempo zmierzone 3,0 cm/rok (< mediany) skaluje cały przebieg (×0,57); S1 31,5 mies.', () => {
    win.advancedGrowthData = { growthVelocity: 3.0 };
    const o = ol({ sex: 'F', ageYears: 12, heightCm: 153.8 });
    expect(o.skalaTempa).toBe(0.57);
    const s = sym(DZ12);
    expect(s.months).toBe(31.5);
    expect(ost(s).wzrostCm).toBeCloseTo(159.1, 1);
  });
});

describe('B8: redukcja i dorośli — liczby bez zmian', () => {
  it('T15: redukcja u dziecka jak w racie X (przyrost masy ze wzrastania), stabilizacja 8-latka S1 3 / S2 7 mies.', () => {
    expect(sym({ sex: 'F', ageYears: 12, heightCm: 153.8, weightKg: 77.1, weeklyLossKg: 0.3445 }).months).toBe(15.5);
    expect(sym({ sex: 'F', ageYears: 8, heightCm: 130, weightKg: 42.3, weeklyLossKg: 0.1145 }).months).toBe(17);
    expect(sym({ sex: 'F', ageYears: 8, heightCm: 130, weightKg: 45, weeklyLossKg: 126 * 7 / 7700 }).months).toBe(21);
    expect(sym({ sex: 'M', ageYears: 13, heightCm: 160, weightKg: 93.8, weeklyLossKg: 0.2908 }).months).toBe(25.5);
    const st = sym({ sex: 'M', ageYears: 8, heightCm: 130, weightKg: 33, weeklyLossKg: 0 });
    expect([st.months, st.gornaGranica.months]).toEqual([3, 7]);
  });
  it('T16: dorosła 25 l., 165 cm, 80 kg, 0,115 kg/tydz. — 25 mies., bez wzrastania', () => {
    const s = sym({ sex: 'F', ageYears: 25, heightCm: 165, weightKg: 80, weeklyLossKg: 0.115 });
    expect(s.months).toBe(25);
    expect(s.growthAware).toBe(false);
    expect(s.gornaGranica).toBeUndefined();
  });
});

describe('B8: brzmienie (T18) — bez „stałego tempa”, bez prognozowanego wzrostu w cm, z nazwą siatki', () => {
  it('opis wzrastania: „w najbliższym roku ok. 5,3 cm, potem coraz wolniej, jak mediana wzrostu (siatka OLAF)”; tempo zmierzone — na najbliższy rok', () => {
    expect(win.energyOpisWzrastania(sym(DZ12))).toBe('w najbliższym roku ok.\u00A05,3\u00A0cm, potem coraz wolniej, jak mediana wzrostu (siatka OLAF)');
    expect(win.energyOpisWzrastania(sym(DZ12), true)).toBe('wg mediany wzrostu, siatka OLAF');
    win.advancedGrowthData = { growthVelocity: 7.8 };
    expect(win.energyOpisWzrastania(sym(DZ12))).toBe('zmierzone tempo ok.\u00A07,8\u00A0cm/rok przyjęto na najbliższy rok, potem coraz wolniej, jak mediana wzrostu (siatka OLAF)');
  });
  it('S2: czas albo zdanie o 18 latach; S1 bez czasu: zdanie o 18 latach albo o ocenie tempa', () => {
    expect(win.energyZdanieStabS2(sym({ sex: 'M', ageYears: 12, heightCm: 150, weightKg: 58, weeklyLossKg: 0 })))
      .toBe('Jeżeli masa będzie rosła do górnej granicy planu (ok.\u00A00,3\u00A0kg/mies.) — za ok. 51 miesięcy.');
    expect(win.energyZdanieStabS2(sym(DZ12))).toContain('BMI prawdopodobnie nie zejdzie poniżej 85. centyla przed ukończeniem 18 lat (potem obowiązuje kryterium dorosłych: BMI 24,9).');
    expect(win.energyZdanieStabBrak(sym({ ...DZ12, weightKg: 77.1 }))).toBe('Samo utrzymanie obecnej masy ciała prawdopodobnie nie obniży BMI poniżej 85. centyla przed ukończeniem 18 lat (potem obowiązuje kryterium dorosłych: BMI 24,9).');
    win.advancedGrowthData = { tempo: { cmPerYear: 2.0, alarm: true } };
    expect(win.energyZdanieStabBrak(sym(DZ12))).toBe('Tempo wzrastania wymaga oceny — czasu dojścia do normy BMI nie podano.');
    expect(win.energyZdanieStabS2(sym(DZ12))).toBe('');
  });
  it('parametry jako dane (ENERGY_WZRASTANIE), zamrożone', () => {
    const W = win.ENERGY_WZRASTANIE;
    expect(Object.isFrozen(W)).toBe(true);
    expect([W.zakonczoneCmRok, W.zakonczonePozostaloCm, W.notaPokwitaniaCm, W.notaPokwitaniaOdLat.F, W.notaPokwitaniaOdLat.M]).toEqual([1, 3, 6, 8, 9]);
  });
});
