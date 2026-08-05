import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// REGRESJA: Khamis–Roche znika z karty „Podsumowanie wyników”.
//
// Karta „Podsumowanie wyników” (vilda_summary_cards.js) czyta prognozę KR z
// window.advancedGrowthData.khamis. Ten model buduje asembler produkcyjny
// buildAdvancedGrowthDataPayload (min. `Jn`) w vilda_advanced_growth.js —
// przepisuje pola po WHITELIŚCIE (bayleyPinneau/rwt/reinehr/predictionProfile…).
// Wcześniej brakowało w nim `khamis:L(a,"khamis",null)`, więc mimo że model
// wejściowy zawierał `khamis`, klucz był GUBIONY: karta KR działała (liczy KR
// samodzielnie), a podsumowanie nie miało już danych i pomijało linię KR.
//
// Test wywołuje RZECZYWISTĄ funkcję produkcyjną (przez publiczne, zamrożone API
// window.VildaAdvancedGrowth.buildAdvancedGrowthDataPayload), nie kopię logiki.
function loadAssembler() {
  const win = {};
  loadBrowserScript('vilda_khamis_roche.js', win); // definiuje calculateKhamisRochePrediction
  loadBrowserScript('vilda_advanced_growth.js', win);
  const api = win.VildaAdvancedGrowth;
  expect(api && typeof api.buildAdvancedGrowthDataPayload).toBe('function');
  return api.buildAdvancedGrowthDataPayload;
}

// Kształt obiektu KR zgodny z tym, co ustawia model advanced_growth i czym karta
// podsumowania steruje (available + predictedAdultHeightCm + errorBoundHalfWidthCm).
const KH = Object.freeze({
  available: true,
  predictedAdultHeightCm: 178.2,
  errorBoundHalfWidthCm: 5.3,
  hasErrorInterval: true,
});

describe('Advanced growth — asembler modelu zachowuje Khamis–Roche (regresja podsumowania)', () => {
  it('buildAdvancedGrowthDataPayload przenosi `khamis` do modelu (nie gubi jak przed poprawką)', () => {
    const build = loadAssembler();
    const model = build({}, { rwt: { available: true }, reinehr: { available: true }, khamis: KH });
    // Sedno regresji: khamis MUSI przetrwać whitelistę asemblera.
    expect(model.khamis).toBeTruthy();
    expect(model.khamis.available).toBe(true);
    expect(model.khamis.predictedAdultHeightCm).toBeCloseTo(178.2, 6);
    expect(model.khamis.errorBoundHalfWidthCm).toBeCloseTo(5.3, 6);
  });

  it('inne metody prognostyczne nadal przechodzą (whitelist niezepsuty)', () => {
    const build = loadAssembler();
    const model = build({}, { bayleyPinneau: { available: true }, rwt: { available: true }, reinehr: { available: true }, khamis: KH });
    expect(model.bayleyPinneau).toBeTruthy();
    expect(model.rwt).toBeTruthy();
    expect(model.reinehr).toBeTruthy();
  });

  it('brak `khamis` w wejściu → model.khamis === null (bezpieczny domyślny, karta pomija linię)', () => {
    const build = loadAssembler();
    const model = build({}, { rwt: { available: true } });
    // Karta ma strażnik `if(C.khamis && C.khamis.available===true)`, więc null nie psuje renderu.
    expect(model.khamis).toBe(null);
  });

  it('khamis=null przekazany wprost → pozostaje null (bez wyjątku)', () => {
    const build = loadAssembler();
    const model = build({}, { rwt: { available: true }, khamis: null });
    expect(model.khamis).toBe(null);
  });
});
