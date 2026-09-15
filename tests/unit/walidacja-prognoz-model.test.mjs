import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Etap 2a „Walidacji prognoz" (decyzja właściciela 2026-09-15). Karta liczyła prognozy dla punktów
// historycznych, wołając cztery surowe silniki wprost i omijając kartę zaawansowaną. Skutki:
// nie mierzyła KONSENSUSU (czyli liczby, którą aplikacja podaje jako prognozę), nie znała Blum/ISS,
// TW Mark II ani „wzrostu przy menarche", pomijała korekty i bramki, a kolumna Reinehr/CDGP
// NIGDY się nie wypełniała. Model liczy teraz przez `computeFinalHeightPrediction`.
//
// Testy wołają PRAWDZIWE funkcje produkcyjne (silniki + karta C + budowniczy profilu KOWD).
// Dane wyłącznie FIKCYJNE.

let win;
let M;

beforeAll(() => {
  win = {};
  for (const f of ['bayley_pinneau_data.js', 'reinehr_cdgp_data.js', 'rwt_data.js', 'tw2_data.js',
    'vilda_tw2_prediction.js', 'vilda_blum_iss.js', 'advanced_growth_kowd.js', 'vilda_khamis_roche.js',
    'vilda_advanced_growth.js', 'vilda_growth_card_c.js', 'vilda_puberty_profile.js',
    'vilda_growth_prediction_validation_model.js']) {
    loadBrowserScript(f, win);
  }
  M = win.VildaGrowthPredictionValidationModel;
});

// Chłopiec z konstytucjonalnym opóźnieniem wzrastania: wiek kostny ok. 2,5 roku za wiekiem
// metrykalnym, wzrost ostateczny 171 cm w wieku 18 lat.
const KOWD = Object.freeze({
  user: { sex: 'M', age: 18, ageMonths: 0, height: 171, weight: 62 },
  advanced: {
    motherHeight: 158, fatherHeight: 172, boneAgeYears: 18,
    growthExclusion: 'nie', testicularVolume: 'lt4', familyDelayedPuberty: 'yes',
    data: { measurements: [
      { ageMonths: 120, height: 125, weight: 25, boneAgeYears: 7.5 },
      { ageMonths: 144, height: 137, weight: 32, boneAgeYears: 9.5 },
      { ageMonths: 168, height: 148, weight: 40, boneAgeYears: 11.5 },
      { ageMonths: 192, height: 163, weight: 54, boneAgeYears: 14 },
    ] },
  },
  puberty: {},
});

const punkt = (m, mies) => m.points.filter((p) => p.ageMonths === mies)[0];

describe('Model bierze liczby z karty zaawansowanej, nie z surowych silników', () => {
  it('konsensus jest policzony dla każdego punktu — to jego aplikacja podaje jako prognozę', () => {
    const m = M.policzDlaPayloadu(KOWD);
    expect(m.ok).toBe(true);
    const bezFH = m.points.filter((p) => !p.isFH);
    expect(bezFH.length).toBe(4);
    bezFH.forEach((p) => {
      expect(p.konsensus, `punkt ${p.ageMonths}`).toBeTruthy();
      expect(typeof p.konsensus.cm).toBe('number');
      expect(typeof p.konsensus.err).toBe('number');
    });
    expect(m.konsensus.n).toBe(4);
    expect(typeof m.konsensus.mae).toBe('number');
  });

  // Sedno naprawy: silnik Reinehra wymaga `profileModel`, którego karta nie przekazywała,
  // a opóźnienie wieku kostnego liczyła z odwrotnym znakiem. Kolumna była zawsze pusta.
  it('Reinehr/CDGP wypełnia się tam, gdzie model jest stosowalny (chłopiec ≥ 12 l, opóźnienie > 1 r.)', () => {
    const m = M.policzDlaPayloadu(KOWD);
    expect(punkt(m, 168).preds.reinehr.publikacja).toBeGreaterThan(150);
    expect(punkt(m, 192).preds.reinehr.publikacja).toBeGreaterThan(150);
    // poniżej 12. roku życia model nie ma zastosowania — i tak ma zostać
    expect(punkt(m, 120).preds.reinehr).toBeUndefined();
    expect(m.summary.reinehr.n).toBe(2);
  });

  it('profil KOWD bierzemy z produkcyjnego budowniczego, nie z przepisanej reguły', () => {
    const p = { ageYears: 14, ageMonths: 168, height: 148, weight: 40, boneAgeYears: 11.5, heightSds: -2.1 };
    const ctx = { plec: 'M', mph: 171.5, matka: 158, ojciec: 172, jadra: 'lt4', wywiadOpoznienie: 'yes', wykluczenie: 'nie' };
    expect(M._profilKowd(p, ctx).shouldShowReinehr).toBe(true);
    expect(M._profilKowd({ ...p, ageYears: 11, ageMonths: 132 }, ctx).shouldShowReinehr).toBe(false);
    expect(M._profilKowd(p, { ...ctx, plec: 'F' }).shouldShowReinehr).toBe(false);
  });

  it('każda metoda niesie obie liczby, a różnica to dokładnie korekta aplikacji', () => {
    const m = M.policzDlaPayloadu(KOWD);
    const bp = punkt(m, 168).preds.bp;
    expect(bp.biasCm).toBe(-2);
    expect(bp.publikacja + bp.biasCm).toBeCloseTo(bp.konsensus, 5);
    expect(bp.errPub).not.toBe(bp.errKons);
  });

  it('metoda wykluczona bramką jest oznaczona i niesie powód', () => {
    const m = M.policzDlaPayloadu(KOWD);
    const kr = punkt(m, 168).preds.khamis;
    expect(kr.excluded).toBe(true);
    expect(kr.gateNote).toContain('poza konsensusem');
    expect(typeof kr.publikacja).toBe('number'); // liczbę nadal pokazujemy
    expect(m.summary.khamis.nWKonsensusie).toBe(0);
  });
});

describe('Ranking „najbliżej FH"', () => {
  it('startują tylko metody z co najmniej trzema punktami W konsensusie', () => {
    const m = M.policzDlaPayloadu(KOWD);
    expect(M.MIN_PUNKTOW_RANKINGU).toBe(3);
    // Khamis–Roche: 4 punkty, ale ani razu w konsensusie → nie startuje mimo policzonego MAE.
    expect(m.summary.khamis.n).toBe(4);
    expect(m.best).not.toBe('khamis');
    // Reinehr: tylko 2 punkty → poniżej progu.
    expect(m.summary.reinehr.n).toBe(2);
    expect(m.best).not.toBe('reinehr');
    expect(m.best).toBeTruthy();
    expect(m.summary[m.best].nWKonsensusie).toBeGreaterThanOrEqual(3);
  });

  it('konsensus nigdy nie wygrywa rankingu — jest metodą pochodną', () => {
    const m = M.policzDlaPayloadu(KOWD);
    expect(m.best).not.toBe('konsensus');
    expect(m.methods.some((x) => x.key === 'konsensus')).toBe(false);
    expect(m.konsensus.mae).toBeGreaterThan(0);
  });

  it('ranking idzie z wartości w konsensusie, bo tych aplikacja użyła', () => {
    const m = M.policzDlaPayloadu(KOWD);
    const kandydaci = m.methods.filter((x) => x.pred
      && m.summary[x.key] && m.summary[x.key].nWKonsensusie >= M.MIN_PUNKTOW_RANKINGU);
    const najlepsze = Math.min(...kandydaci.map((x) => m.summary[x.key].maeKons));
    expect(m.summary[m.best].maeKons).toBe(najlepsze);
  });
});

describe('Kolumny metod', () => {
  it('cztery metody podstawowe stoją zawsze, także gdy nic nie policzyły', () => {
    const bezDanych = { user: { sex: 'F', age: 9, ageMonths: 0, height: 130, weight: 28 },
      advanced: { data: { measurements: [
        { ageMonths: 84, height: 118, weight: 21 }, { ageMonths: 96, height: 124, weight: 24 }] } } };
    const m = M.policzDlaPayloadu(bezDanych);
    expect(m.ok).toBe(true);
    ['rwt', 'bp', 'khamis', 'reinehr'].forEach((k) => {
      expect(m.methods.some((x) => x.key === k), `kolumna ${k}`).toBe(true);
    });
  });

  // P-WALIDACJA-DECYZJE, decyzja 3 (2026-09-15): metoda wąskiego wskazania stoi, gdy PROFIL
  // pacjenta jej dotyczy — także gdy się nie policzyła — a pusta komórka niesie powód silnika.
  it('metody wąskiego wskazania stoją, gdy profil pacjenta ich dotyczy', () => {
    const m = M.policzDlaPayloadu(KOWD);
    const klucze = m.methods.map((x) => x.key);
    expect(klucze).toContain('tw2'); // chłopiec z wiekiem kostnym — tablica 2.1 Tannera
    expect(klucze).not.toContain('menarche'); // chłopiec
    expect(klucze).not.toContain('blum'); // bez siatek hSDS jest null → profil nieznany
  });

  it('bez profilu nie ma trzech pustych kolumn — dziewczynka bez wieku kostnego i bez menarche', () => {
    const m = M.policzDlaPayloadu({
      user: { sex: 'F', age: 9, ageMonths: 0, height: 130, weight: 28 },
      advanced: { motherHeight: 160, fatherHeight: 175, data: { measurements: [
        { ageMonths: 84, height: 118, weight: 21 }, { ageMonths: 96, height: 124, weight: 24 }] } },
    });
    expect(m.methods.map((x) => x.key).sort()).toEqual(['bp', 'khamis', 'mph', 'reinehr', 'rwt']);
  });

  it('wzrost przy menarche: kolumna stoi u dziewczynki z wiekiem menarche, a komórki mówią „przed menarche" i „brak wzrostu przy menarche"', () => {
    const m = M.policzDlaPayloadu({
      user: { sex: 'F', age: 17, ageMonths: 0, height: 163, weight: 55 },
      puberty: { menarcheAgeYears: 12.5 },
      advanced: { motherHeight: 162, fatherHeight: 176, data: { measurements: [
        { ageMonths: 132, height: 143, weight: 36, boneAgeYears: 11 },
        { ageMonths: 156, height: 156, weight: 46 },
        { ageMonths: 180, height: 161.5, weight: 52, boneAgeYears: 14.5 }] } },
    });
    expect(m.ok).toBe(true);
    expect(m.methods.map((x) => x.key)).toContain('menarche');
    expect(punkt(m, 132).preds.menarche.reason).toBe('before-menarche');
    expect(punkt(m, 156).preds.menarche.reason).toBe('missing-menarche-height');
    expect(punkt(m, 156).preds.menarche.publikacja).toBeNull();
    // TW Mark II: punkt bez wieku kostnego dostaje powód, punkt z wiekiem — liczbę.
    expect(punkt(m, 156).preds.tw2.reason).toBe('missing-bone-age');
    expect(typeof punkt(m, 132).preds.tw2.publikacja).toBe('number');
    // Metryki liczą tylko z liczb — puste komórki ich nie psują.
    expect(m.summary.tw2.n).toBe(2);
  });

  it('Blum/ISS: kolumna stoi u dziecka niskiego, a punkt poza zakresem wieku modelu dostaje powód silnika', () => {
    const poprzednie = win.calcPercentileStats;
    win.calcPercentileStats = () => ({ sd: -2.0 }); // niskorosłość we wszystkich punktach
    try {
      const m = M.policzDlaPayloadu({
        user: { sex: 'M', age: 18, ageMonths: 0, height: 168, weight: 60 },
        advanced: { motherHeight: 158, fatherHeight: 170, data: { measurements: [
          { ageMonths: 24, height: 82, weight: 11, boneAgeYears: 1.5 },
          { ageMonths: 120, height: 125, weight: 25, boneAgeYears: 8 },
          { ageMonths: 168, height: 148, weight: 40, boneAgeYears: 12 }] } },
      });
      expect(m.methods.map((x) => x.key)).toContain('blum');
      expect(punkt(m, 24).preds.blum.reason, 'dwulatek jest poniżej zakresu kohorty Bluma').toBe('out-of-range');
      expect(typeof punkt(m, 120).preds.blum.publikacja).toBe('number');
    } finally {
      if (poprzednie === undefined) delete win.calcPercentileStats; else win.calcPercentileStats = poprzednie;
    }
  });

  it('dziecko o prawidłowym wzroście nie dostaje kolumny Blum/ISS — profil jej nie dotyczy', () => {
    const poprzednie = win.calcPercentileStats;
    win.calcPercentileStats = () => ({ sd: 0.3 });
    try {
      const m = M.policzDlaPayloadu(KOWD);
      expect(m.methods.map((x) => x.key)).not.toContain('blum');
    } finally {
      if (poprzednie === undefined) delete win.calcPercentileStats; else win.calcPercentileStats = poprzednie;
    }
  });

  it('MPH jest na liście jako cel, nie jako prognoza', () => {
    const m = M.policzDlaPayloadu(KOWD);
    const mph = m.methods.filter((x) => x.key === 'mph')[0];
    expect(mph).toBeTruthy();
    expect(mph.pred).toBe(false);
    expect(mph.cel).toBe(true);
    expect(m.summary.mph).toBeUndefined(); // cel nie dostaje metryk błędu
  });
});

describe('Punkty i FH', () => {
  it('oś czasu scala pomiary, punkty terapii GH i pomiar bieżący po wieku', () => {
    const zGh = { ...KOWD, ghTherapyPoints: [{ ageYears: 13, ageMonths: 0, height: 131, weight: 28, boneAge: 8.5 }] };
    const m = M.policzDlaPayloadu(zGh);
    expect(punkt(m, 156)).toBeTruthy();
    expect(punkt(m, 156).height).toBe(131);
    expect(punkt(m, 156).boneAgeYears).toBe(8.5);
    expect(m.points.length).toBe(6); // 4 pomiary + punkt GH + pomiar bieżący
  });

  it('ostatni pomiar zostaje FH, a prognoz dla niego nie liczymy', () => {
    const m = M.policzDlaPayloadu(KOWD);
    expect(m.mode).toBe('validation');
    expect(m.fh.ageMonths).toBe(216);
    expect(m.fh.height).toBe(171);
    const fh = punkt(m, 216);
    expect(fh.isFH).toBe(true);
    expect(fh.konsensus).toBeNull();
    expect(Object.keys(fh.preds).length).toBe(0);
  });

  it('bez zakończonego wzrostu karta idzie w tryb prognozy, bez FH i bez błędów', () => {
    const rosnie = { ...KOWD, user: { sex: 'M', age: 12, ageMonths: 0, height: 137, weight: 32 },
      advanced: { ...KOWD.advanced, boneAgeYears: 9.5,
        data: { measurements: KOWD.advanced.data.measurements.slice(0, 2) } } };
    const m = M.policzDlaPayloadu(rosnie);
    expect(m.mode).toBe('prognosis');
    expect(m.fh).toBeNull();
    m.points.forEach((p) => { expect(p.pctFH).toBeNull(); });
  });

  it('status „po menarche" wynika z wieku menarche w rekordzie — nic nie trzeba dopisywać', () => {
    const ctx = { plec: 'F', wiekMenarche: 12.5 };
    expect(M._poMenarche({ ageYears: 11 }, ctx)).toBe(false);
    expect(M._poMenarche({ ageYears: 13 }, ctx)).toBe(true);
    expect(M._poMenarche({ ageYears: 13 }, { plec: 'M', wiekMenarche: 12.5 })).toBe(false);
    expect(M._poMenarche({ ageYears: 13 }, { plec: 'F', wiekMenarche: null })).toBe(false);
  });

  it('mniej niż dwa punkty albo brak wzrostu — model odmawia i mówi dlaczego', () => {
    expect(M.policzDlaPayloadu(null).reason).toBe('no-payload');
    const jeden = { user: { sex: 'M', age: 10, ageMonths: 0, height: 130 }, advanced: { data: { measurements: [] } } };
    expect(M.policzDlaPayloadu(jeden).reason).toBe('too-few-points');
  });
});
