import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, funkcjaZ } from '../support/silnik-bmi.mjs';

// ADV-REPORT-2 (decyzja właściciela 2026-09-13), etap 2 naprawy Raportu wzrastania.
// Najgroźniejsze znalezisko audytu: kolumny hSDS i ΔhSDS mieszają siatki norm bez
// żadnego oznaczenia. Przy wybranym źródle OLAF pomiar poniżej 3. roku życia spada na
// Palczewską, a powyżej wraca na OLAF — ΔhSDS między takimi wierszami jest w dużej
// części artefaktem zmiany siatki, a nie zmianą tempa wzrastania. Delta ≤ −1 jest w tej
// aplikacji progiem alarmu deceleracji, więc artefakt czyta się jak objaw.
// Drugie znalezisko: mpSDS w kolumnie liczono ze źródła WIERSZA, a linię MPH w
// podsumowaniu ze źródła preferowanego — liczb z nagłówka nie dało się odjąć od hSDS.
// Testy wołają PRAWDZIWE funkcje produkcyjne. Dane wyłącznie FIKCYJNE.

let win;
let fields;
let rows;
let resolved;

function makeDoc() {
  return {
    getElementById(id) {
      if (!Object.prototype.hasOwnProperty.call(fields, id)) return null;
      return { get value() { return fields[id]; }, set value(v) { fields[id] = v; } };
    },
  };
}

// Stub resolvera norm: zwraca źródło zależne od wieku, tak jak produkcyjny łańcuch
// kandydatów (OLAF nie obejmuje wieku < 3 lat i schodzi na Palczewską).
function installResolver(preferred = 'OLAF') {
  resolved = [];
  globalThis.advHistoryGetPreferredSource = () => preferred;
  globalThis.advHistoryResolveMetric = (metric, value, sex, ageYears) => {
    const source = ageYears < 3 ? 'PALCZEWSKA' : preferred;
    resolved.push({ metric, ageYears, source });
    return { result: { sd: value / 100, percentile: 50 }, source, reason: '' };
  };
  // P-OSTATNI-2c: kolumna mpSDS idzie przez PRAWDZIWĄ funkcję rdzenia vildaMpSdsStats (wycięta
  // z app.js), która woła ten sam stubowany resolver — test dalej mierzy wiek 18 lat i źródło.
  globalThis.vildaMpSdsStats = new Function(`${funkcjaZ(appSrc, 'vildaMpSdsStats')}; return vildaMpSdsStats;`)();
  globalThis.advHistoryBuildSourceSummary = () => '';
  globalThis.BMI = (w, h) => w / ((h / 100) ** 2);
  globalThis.velocityCmPerYear = (h1, m1, h2, m2) => ((h2 - h1) / ((m2 - m1) / 12));
  globalThis.formatCentile = (v) => String(Math.round(v));
  globalThis.centylWord = () => 'centyl';
}

beforeEach(() => {
  fields = { sex: 'M', age: '', ageMonths: '', height: '', weight: '', advMotherHeight: '170', advFatherHeight: '182' };
  rows = [];
  globalThis.document = makeDoc();
  globalThis.collectAdvancedMeasurements = () => rows.map((r, i) => ({ ...r, domIndex: i }));
  globalThis.getAgeDecimal = () => 0;
  installResolver('OLAF');
  win = loadBrowserScript('vilda_advanced_growth.js', {});
});

afterEach(() => {
  for (const k of ['document', 'collectAdvancedMeasurements', 'getAgeDecimal', 'advHistoryGetPreferredSource',
    'advHistoryResolveMetric', 'vildaMpSdsStats', 'advHistoryBuildSourceSummary', 'BMI', 'velocityCmPerYear',
    'formatCentile', 'centylWord']) delete globalThis[k];
});

const api = () => win.VildaAdvancedGrowth;

describe('Raport wzrastania — siatki norm w kolumnach hSDS i ΔhSDS', () => {
  it('ΔhSDS liczone przez granicę siatek dostaje znacznik, a model zgłasza to agregatem', () => {
    rows.push({ ageMonths: 24, height: 88, weight: 12 });   // < 3 lat → Palczewska
    rows.push({ ageMonths: 48, height: 104, weight: 16 });  // ≥ 3 lat → OLAF
    const model = api().advGrowthBuildReportRows();
    expect(model.hasDeltaAcrossSourceChange).toBe(true);
    expect(model.hasHeightSourceFallback).toBe(true);
    expect(model.rows[0].heightSourceFallback).toBe(true);   // wiersz z fallbacku
    expect(model.rows[0].hsdsText).toContain('*');
    expect(model.rows[1].deltaAcrossSourceChange).toBe(true);
    expect(model.rows[1].deltaHsdsText).toContain('†');
    expect(model.heightSourcesUsed.sort()).toEqual(['OLAF', 'PALCZEWSKA']);
  });

  it('wiersze z jednej siatki nie dostają żadnego znacznika (kontrola negatywna)', () => {
    rows.push({ ageMonths: 48, height: 104, weight: 16 });
    rows.push({ ageMonths: 72, height: 116, weight: 21 });
    const model = api().advGrowthBuildReportRows();
    expect(model.hasDeltaAcrossSourceChange).toBe(false);
    expect(model.hasHeightSourceFallback).toBe(false);
    expect(model.rows.every((r) => !r.hsdsText.includes('*'))).toBe(true);
    expect(model.rows.every((r) => !r.deltaHsdsText.includes('†'))).toBe(true);
  });

  it('mpSDS liczy się raz, ze źródła preferowanego — tak samo jak linia MPH w podsumowaniu', () => {
    rows.push({ ageMonths: 24, height: 88, weight: 12 });  // wiersz z innej siatki niż preferowana
    rows.push({ ageMonths: 48, height: 104, weight: 16 });
    const model = api().advGrowthBuildReportRows();
    // MPH chłopca: (170 + 13 + 182) / 2 = 182,5 → stub daje sd = 1,825
    expect(model.mpSdsSd).toBeCloseTo(1.825, 6);
    expect(model.mpSdsSource).toBe('OLAF');
    // rozwiązanie MPH poszło przez wiek 18 lat i źródło preferowane, nie przez wiek wiersza
    expect(resolved.some((r) => r.metric === 'HT' && r.ageYears === 18 && r.source === 'OLAF')).toBe(true);
    // kolumna hSDS − mpSDS odejmuje od TEJ wartości w każdym wierszu
    // komórka jest zaokrąglona do dwóch miejsc, więc porównujemy z tą dokładnością
    expect(Number(model.rows[0].hsdsMpSdsText.replace(',', '.'))).toBeCloseTo(0.88 - 1.825, 1);
    expect(Number(model.rows[1].hsdsMpSdsText.replace(',', '.'))).toBeCloseTo(1.04 - 1.825, 1);
  });

  it('noty pod tabelą tłumaczą oba znaczniki i mówią, z jakich siatek liczono', () => {
    rows.push({ ageMonths: 24, height: 88, weight: 12 });
    rows.push({ ageMonths: 48, height: 104, weight: 16 });
    const model = api().advGrowthBuildReportRows();
    const notes = api().advGrowthBuildReportPresentationModel(
      Object.assign({}, model, { predictionsFresh: false })
    ).noteItems.join(' | ');
    expect(notes).toContain('* hSDS w oznaczonych wierszach policzono z innej siatki');
    expect(notes).toContain('† ΔhSDS policzono między wierszami z RÓŻNYCH siatek norm');
    expect(notes).toContain('nie ze zmiany tempa wzrastania');
    expect(notes).toContain('mpSDS pochodzi z tego samego źródła norm, co linia MPH');
  });
});
