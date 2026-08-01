import { describe, expect, it, beforeEach } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function load() {
  const g = {};
  loadBrowserScript('clcr_ui_workflow.js', g);
  return g;
}

const EGFR = 'eGFR — dorośli (kreatynina)';
const CG = 'Klirens kreatyniny — dorośli (ml/min)';

function note(dateISO, label, valueNum, unit = 'mL/min/1,73 m²', category = 'wynik-klirens') {
  return { category, clinicalDateISO: dateISO, labResult: { test: label, valueNum, unit } };
}

describe('Klirens — historia serii (Faza 2)', () => {
  let g;
  beforeEach(() => {
    g = load();
  });

  it('buildSeriesFromNotes: grupuje po pełnej etykiecie i sortuje punkty po dacie', () => {
    const vs = g.ClcrVisitSave;
    const notes = [
      note('2026-06-01', EGFR, 90),
      note('2026-07-01', EGFR, 85),
      note('2026-05-01', EGFR, 95),
    ];
    const series = vs.buildSeriesFromNotes(notes);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe(EGFR);
    expect(series[0].id).toBe('egfr');
    expect(series[0].unit).toBe('mL/min/1,73 m²');
    expect(series[0].points.map((p) => p.dateISO)).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
    ]);
    expect(series[0].points.map((p) => p.valueNum)).toEqual([95, 90, 85]);
  });

  it('buildSeriesFromNotes: filtruje po module aktywnej formuły', () => {
    const vs = g.ClcrVisitSave;
    const notes = [
      note('2026-07-01', EGFR, 85),
      note('2026-07-01', CG, 100, 'mL/min'),
    ];
    // bez filtra → obie serie
    expect(vs.buildSeriesFromNotes(notes).map((s) => s.id).sort()).toEqual([
      'cg',
      'egfr',
    ]);
    // filtr do modułu egfr → tylko egfr (CG to inny moduł)
    const only = vs.buildSeriesFromNotes(notes, { formulaId: 'egfr' });
    expect(only.map((s) => s.id)).toEqual(['egfr']);
  });

  it('buildSeriesFromNotes: pomija inną kategorię, brak wartości i nieznane etykiety', () => {
    const vs = g.ClcrVisitSave;
    const notes = [
      note('2026-07-01', EGFR, 85),
      note('2026-07-01', EGFR, 1, 'x', 'obserwacja'), // zła kategoria
      { category: 'wynik-klirens', clinicalDateISO: '2026-07-02', labResult: { test: EGFR } }, // brak wartości
      note('2026-07-01', 'Etykieta spoza słownika', 5, 'x'), // bez wpisu w słowniku
    ];
    const series = vs.buildSeriesFromNotes(notes);
    // etykieta spoza słownika bez filtra i tak wchodzi (grupujemy po tekście),
    // ale bez id/grupy; egfr ma jeden ważny punkt
    const egfr = series.find((s) => s.id === 'egfr');
    expect(egfr.points).toHaveLength(1);
    expect(egfr.points[0].valueNum).toBe(85);
  });

  it('buildSeriesFromNotes: odczytuje valueNum z tekstowego value gdy brak liczby', () => {
    const vs = g.ClcrVisitSave;
    const notes = [
      { category: 'wynik-klirens', clinicalDateISO: '2026-07-01', labResult: { test: EGFR, value: '83', unit: 'mL/min/1,73 m²' } },
    ];
    const series = vs.buildSeriesFromNotes(notes, { formulaId: 'egfr' });
    expect(series[0].points[0].valueNum).toBe(83);
  });

  it('seriesTrend: kierunek up/down/flat i null dla pojedynczego punktu', () => {
    const vs = g.ClcrVisitSave;
    expect(vs.seriesTrend([{ valueNum: 90 }])).toBeNull();
    expect(vs.seriesTrend([])).toBeNull();
    expect(vs.seriesTrend([{ valueNum: 85 }, { valueNum: 90 }]).direction).toBe('up');
    expect(vs.seriesTrend([{ valueNum: 90 }, { valueNum: 85 }]).direction).toBe('down');
    expect(vs.seriesTrend([{ valueNum: 90 }, { valueNum: 90 }]).direction).toBe('flat');
    const t = vs.seriesTrend([{ valueNum: 95 }, { valueNum: 90 }, { valueNum: 85 }]);
    expect(t).toMatchObject({ direction: 'down', prev: 90, latest: 85 });
  });
});
