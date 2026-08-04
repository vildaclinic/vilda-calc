import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Integracja: silnik KR (vilda_khamis_roche.js) wpięty do modułu walidacji prognoz
// (vilda_growth_prediction_validation.js). Test wywołuje RZECZYWISTE funkcje produkcyjne
// (computeForPayload, _cohortRowsForEntry) — nie kopię wzoru. Dane w pełni fikcyjne.
//
// Kolejność ładowania jak na stronie: najpierw silnik (definiuje window.calculateKhamisRochePrediction),
// potem moduł walidacji (rozwiązuje silniki z window przez B(name)=window[name]).
function loadWired() {
  const win = {};
  loadBrowserScript('vilda_khamis_roche.js', win);
  loadBrowserScript('vilda_growth_prediction_validation.js', win);
  return win.VildaGrowthPredictionValidation;
}

// Chłopiec, rodzice 163/178 (MPH 177). Wiek podany PRODUKCYJNIE: ageMonths (łączne) + ageYears.
function payload() {
  return {
    user: { sex: 'M' },
    advanced: {
      motherHeight: 163,
      fatherHeight: 178,
      data: {
        measurements: [
          { ageYears: 8, ageMonths: 96, height: 126, weight: 25, boneAgeYears: 8 },
          { ageYears: 10, ageMonths: 120, height: 138, weight: 32, boneAgeYears: 10 },
          { ageYears: 14, ageMonths: 168, height: 162, weight: 50, boneAgeYears: 14 },
          { ageYears: 17, ageMonths: 204, height: 176, weight: 65, boneAgeYears: 17 },
        ],
      },
    },
  };
}

describe('Khamis-Roche — integracja z modułem walidacji', () => {
  it('KR jest aktywną metodą prognostyczną (nie „wkrótce”/skeleton)', () => {
    const V = loadWired();
    const kh = V.METHODS.find((m) => m.key === 'khamis');
    expect(kh).toBeTruthy();
    expect(kh.pred).toBe(true);
    expect(kh.skeleton).toBeFalsy();
    // 4 metody prognostyczne: bp, rwt, reinehr, khamis (mph to cel, nie prognoza)
    expect(V.METHODS.filter((m) => m.pred).map((m) => m.key)).toEqual(['bp', 'rwt', 'reinehr', 'khamis']);
  });

  it('computeForPayload liczy KR we właściwym wieku (regresja: 120 mies. = 10 l., NIE 20)', () => {
    const V = loadWired();
    const model = V.computeForPayload(payload());
    expect(model.ok).toBe(true);

    const at = (mo) => model.points.find((p) => p.ageMonths === mo);
    // Punkt 10 l. (120 mies.) MUSI mieć liczbową prognozę KR — nie out-of-range.
    const p10 = at(120);
    expect(p10.preds.khamis.reason).not.toBe('out-of-range');
    expect(typeof p10.preds.khamis.value).toBe('number');
    expect(p10.preds.khamis.value).toBeGreaterThan(150);
    expect(p10.preds.khamis.value).toBeLessThan(200);
    // Punkt 14 l. (168 mies.) również w zakresie.
    expect(typeof at(168).preds.khamis.value).toBe('number');
    // Podsumowanie KR policzone (n>0), nie skeleton.
    expect(model.summary.khamis.n).toBeGreaterThan(0);
  });

  it('KR uczestniczy w wyborze najlepszej metody i nie wymaga wieku kostnego', () => {
    const V = loadWired();
    const model = V.computeForPayload(payload());
    // best musi być jedną z metod prognostycznych (KR jest kandydatem)
    expect(['bp', 'rwt', 'reinehr', 'khamis']).toContain(model.best);

    // KR liczy nawet bez wieku kostnego (jego przewaga kliniczna): usuń boneAgeYears.
    const noBA = payload();
    noBA.advanced.data.measurements.forEach((m) => { delete m.boneAgeYears; });
    const m2 = V.computeForPayload(noBA);
    const anyKhamis = m2.points.some((p) => typeof p.preds.khamis.value === 'number');
    expect(anyKhamis).toBe(true);
  });

  it('eksport kohorty zawiera wiersze metody Khamis–Roche', () => {
    const V = loadWired();
    const model = V.computeForPayload(payload());
    const rows = V._cohortRowsForEntry({ id: 'TEST', name: 'Fikcyjny', model });
    // kolumna etykiety metody (indeks 11) — musi wystąpić „Khamis–Roche”
    const methodLabels = rows.map((r) => r[11]);
    expect(methodLabels).toContain('Khamis–Roche');
  });
});
