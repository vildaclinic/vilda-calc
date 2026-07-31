import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Syntetyczny scenariusz regresyjny (dane w pełni fikcyjne) wzorowany na zgłoszeniu:
// pacjent leczony GH ma pełną historię wizyt w payload.ghTherapyPoints, a w
// advanced.data.measurements tylko ręczne wpisy (wiersze ghSync są wycinane przy
// zapisie w collectUserData). Karta pacjenta (listPatientTimelineEvents) oraz
// walidacja prognoz (computeForPayload) muszą scalać wszystkie źródła punktów.

function loadVault() {
  return loadBrowserScript('vilda_vault.js').VildaVault;
}

function loadGpv() {
  return loadBrowserScript('vilda_growth_prediction_validation.js').VildaGrowthPredictionValidation;
}

function ghPatientPayload() {
  return {
    user: { age: 9, ageMonths: 8, sex: 'M', height: 130, weight: 28 },
    advanced: {
      boneAgeYears: 6,
      motherHeight: 165,
      fatherHeight: 180,
      data: {
        // po stripie ghSync przy zapisie zostaje tylko wpis ręczny
        measurements: [
          { ageYears: 6.5, ageMonths: 78, height: 109, weight: 15.5, boneAgeYears: 3.5, ghSync: false }
        ]
      }
    },
    growthBasic: {
      data: {
        // lustro tabeli (bez filtra ghSync): wpis ręczny + kopie punktów GH
        measurements: [
          { ageYears: 6.5, ageMonths: 78, height: 109, weight: 15.5 },
          { ageYears: 7.166666666666667, ageMonths: 86, height: 111, weight: 16.5 },
          { ageYears: 7.666666666666667, ageMonths: 92, height: 115, weight: 18 },
          { ageYears: 8.166666666666666, ageMonths: 98, height: 120, weight: 21 },
          { ageYears: 8.666666666666666, ageMonths: 104, height: 122.5, weight: 21.5 },
          { ageYears: 9.166666666666666, ageMonths: 110, height: 126, weight: 24.5 }
        ]
      }
    },
    // kanoniczne punkty terapii GH: wiek zapisany jako lata + CZĘŚĆ miesięczna
    ghTherapyPoints: [
      { id: 'p1', ageYears: 9, ageMonths: 8, height: 130, weight: 28, boneAge: 6, dose: 0.5 },
      { id: 'p2', ageYears: 7, ageMonths: 2, height: 111, weight: 16.5, boneAge: null, dose: 0.03 },
      { id: 'p3', ageYears: 7, ageMonths: 8, height: 115, weight: 18, boneAge: 4, dose: 0.033 },
      { id: 'p4', ageYears: 8, ageMonths: 2, height: 120, weight: 21, boneAge: null, dose: 0.029 },
      { id: 'p5', ageYears: 8, ageMonths: 8, height: 122.5, weight: 21.5, boneAge: 5, dose: 0.033 },
      { id: 'p6', ageYears: 9, ageMonths: 2, height: 126, weight: 24.5, boneAge: null, dose: 0.49 }
    ]
  };
}

describe('VildaVault._extractSnapshotMeasurements (merge źródeł historii dla osi czasu i siatek karty)', () => {
  it('scala advanced + growthBasic + ghTherapyPoints z deduplikacją, zamiast brać tylko pierwsze niepuste źródło', () => {
    const vault = loadVault();
    const rows = vault._extractSnapshotMeasurements({ payload: ghPatientPayload() });

    expect(rows.map((r) => r.ageMonths)).toEqual([78, 86, 92, 98, 104, 110, 116]);
    expect(rows.every((r) => r.sex === 'M')).toBe(true);

    const at = (m) => rows.find((r) => r.ageMonths === m);
    expect(at(78).height).toBe(109);
    expect(at(116).height).toBe(130);
    // wiek kostny: z wpisu ręcznego oraz dosycony z punktów GH
    expect(at(78).boneAgeYears).toBe(3.5);
    expect(at(92).boneAgeYears).toBe(4);
    expect(at(104).boneAgeYears).toBe(5);
    expect(at(116).boneAgeYears).toBe(6);
    expect(at(86).boneAgeYears).toBeUndefined();
  });

  it('normalizuje wiek punktu GH jako lata*12 + część miesięczna (nie samą część)', () => {
    const vault = loadVault();
    const rows = vault._extractSnapshotMeasurements({
      payload: {
        user: { sex: 'F' },
        ghTherapyPoints: [{ ageYears: 9, ageMonths: 8, height: 130, weight: 28 }]
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].ageMonths).toBe(116);
    expect(rows[0].ageYears).toBeCloseTo(116 / 12, 10);
  });

  it('zachowuje dotychczasową semantykę dla pacjenta bez punktów GH (advanced bez zmian)', () => {
    const vault = loadVault();
    const rows = vault._extractSnapshotMeasurements({
      payload: {
        user: { sex: 'F' },
        advanced: {
          data: {
            measurements: [
              { ageMonths: 30, height: 92, weight: 13, boneAgeYears: 2, uid: 'u-30', dateISO: '2024-05-01' },
              { ageMonths: 24, height: 88, weight: 12 },
              { ageYears: 3, height: 95, weight: 14 },
              { ageMonths: 40, height: 0, weight: -1 },
              { ageMonths: -5, height: 100, weight: 15 },
              null,
              { ageMonths: 50 }
            ]
          }
        }
      }
    });

    expect(rows.map((r) => r.ageMonths)).toEqual([24, 30, 36]);
    const r30 = rows.find((r) => r.ageMonths === 30);
    expect(r30.boneAgeYears).toBe(2);
    expect(r30.uid).toBe('u-30');
    expect(r30.dateISO).toBe('2024-05-01');
  });

  it('growthBasic pozostaje źródłem, gdy advanced jest puste (dotychczasowy fallback)', () => {
    const vault = loadVault();
    const rows = vault._extractSnapshotMeasurements({
      payload: {
        user: { sex: 'M' },
        advanced: { data: { measurements: [] } },
        growthBasic: { data: { measurements: [{ ageMonths: 60, height: 105, weight: 17 }] } }
      }
    });

    expect(rows.map((r) => r.ageMonths)).toEqual([60]);
  });

  it('jeden ręczny wpis w advanced nie maskuje już pełnej historii growthBasic (sedno zgłoszenia)', () => {
    const vault = loadVault();
    const payload = ghPatientPayload();
    delete payload.ghTherapyPoints;
    const rows = vault._extractSnapshotMeasurements({ payload });

    expect(rows.map((r) => r.ageMonths)).toEqual([78, 86, 92, 98, 104, 110]);
  });

  it('identyczne pomiary z wielu źródeł nie dublują się, a pierwsze źródło wygrywa metadanymi', () => {
    const vault = loadVault();
    const rows = vault._extractSnapshotMeasurements({
      payload: {
        user: { sex: 'M' },
        advanced: { data: { measurements: [{ ageMonths: 86, height: 111, weight: 16.5, uid: 'adv-86' }] } },
        growthBasic: { data: { measurements: [{ ageMonths: 86, height: 111, weight: 16.5 }] } },
        ghTherapyPoints: [{ ageYears: 7, ageMonths: 2, height: 111, weight: 16.5 }]
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].uid).toBe('adv-86');
  });

  it('zwraca pustą listę dla snapshotu bez payloadu', () => {
    const vault = loadVault();
    expect(vault._extractSnapshotMeasurements(null)).toEqual([]);
    expect(vault._extractSnapshotMeasurements({ payload: {} })).toEqual([]);
  });
});

describe('VildaGrowthPredictionValidation.computeForPayload (punkty GH w walidacji prognoz)', () => {
  it('dołącza punkty ghTherapyPoints do punktów analizy wraz z wiekiem kostnym', () => {
    const gpv = loadGpv();
    const result = gpv.computeForPayload(ghPatientPayload(), {});

    expect(result.ok).toBe(true);
    expect(result.points.map((p) => p.ageMonths)).toEqual([78, 86, 92, 98, 104, 110, 116]);

    const at = (m) => result.points.find((p) => p.ageMonths === m);
    expect(at(92).boneAgeYears).toBe(4);
    expect(at(104).boneAgeYears).toBe(5);
    expect(at(86).boneAgeYears).toBeNull();
    // punkt bieżący nadal pochodzi z user + advanced.boneAgeYears i wygrywa przy tym samym wieku
    expect(at(116).height).toBe(130);
    expect(at(116).boneAgeYears).toBe(6);
  });

  it('ręczny wpis advanced wygrywa z punktem GH przy kolizji tego samego wieku', () => {
    const gpv = loadGpv();
    const payload = ghPatientPayload();
    payload.advanced.data.measurements.push({ ageMonths: 86, height: 111.7, weight: 16.8, ghSync: false });
    const result = gpv.computeForPayload(payload, {});

    const p86 = result.points.find((p) => p.ageMonths === 86);
    expect(p86.height).toBe(111.7);
    expect(p86.weight).toBe(16.8);
  });

  it('starsze payloady z wierszami ghSync w advanced nie dublują punktów GH', () => {
    const gpv = loadGpv();
    const payload = ghPatientPayload();
    // legacy: przed stripem zapis zawierał lustrzane wiersze ghSync
    payload.advanced.data.measurements.push(
      { ageMonths: 86, height: 111, weight: 16.5, ghSync: true, ghId: 'p2' },
      { ageMonths: 92, height: 115, weight: 18, ghSync: true, ghId: 'p3' }
    );
    const result = gpv.computeForPayload(payload, {});

    expect(result.points.map((p) => p.ageMonths)).toEqual([78, 86, 92, 98, 104, 110, 116]);
  });

  it('ignoruje śmieciowe wpisy w ghTherapyPoints', () => {
    const gpv = loadGpv();
    const payload = ghPatientPayload();
    payload.ghTherapyPoints.push(null, {}, { ageYears: 'x', ageMonths: 'y' }, { ageYears: 0, ageMonths: 0, height: 50 });
    const result = gpv.computeForPayload(payload, {});

    expect(result.points.map((p) => p.ageMonths)).toEqual([78, 86, 92, 98, 104, 110, 116]);
  });

  it('pacjent bez ghTherapyPoints zachowuje dotychczasowe wyniki (regresja)', () => {
    const gpv = loadGpv();
    const payload = ghPatientPayload();
    delete payload.ghTherapyPoints;
    delete payload.growthBasic; // walidacja czyta wyłącznie advanced + user
    const result = gpv.computeForPayload(payload, {});

    expect(result.ok).toBe(true);
    expect(result.points.map((p) => p.ageMonths)).toEqual([78, 116]);
    expect(result.mode).toBe('prognosis');
  });
});
