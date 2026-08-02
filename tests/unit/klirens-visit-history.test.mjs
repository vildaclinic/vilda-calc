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

  it('buildSeriesFromNotes: łapie zakres (norm) i flagę poza-zakresem z treści', () => {
    const vs = g.ClcrVisitSave;
    const notes = [
      { category: 'wynik-klirens', clinicalDateISO: '2026-06-01',
        body: 'Kalkulator klirensu · clcr:egfr · wynik poza zakresem',
        labResult: { test: EGFR, valueNum: 88, unit: 'mL/min/1,73 m²', norm: '≥ 90' } },
      { category: 'wynik-klirens', clinicalDateISO: '2026-08-01',
        body: 'Kalkulator klirensu · clcr:egfr',
        labResult: { test: EGFR, valueNum: 95, unit: 'mL/min/1,73 m²', norm: '≥ 90' } },
    ];
    const s = vs.buildSeriesFromNotes(notes, { formulaId: 'egfr' })[0];
    expect(s.norm).toBe('≥ 90');
    expect(s.points.find((p) => p.dateISO === '2026-06-01').outOfRange).toBe(true);
    expect(s.points.find((p) => p.dateISO === '2026-08-01').outOfRange).toBe(false);
  });
});

const CA = 'Wydalanie wapnia (DZM)';
function flowNote(dateISO, label, valueNum, unit, { norm = '', hi = false } = {}) {
  return {
    category: 'wynik-klirens',
    clinicalDateISO: dateISO,
    body: 'Kalkulator klirensu · clcr:x' + (hi ? ' · wynik poza zakresem' : ''),
    labResult: { test: label, valueNum, unit, norm: norm || undefined },
  };
}

describe('Klirens — flowsheet karty pacjenta (Faza 3)', () => {
  let g;
  beforeEach(() => {
    g = load();
    g.VildaVault = {
      isUnlocked: () => true,
      listPatientNotesForPatient: async () => [
        flowNote('2026-06-01', EGFR, 88, 'mL/min/1,73 m²', { norm: '≥ 90', hi: true }),
        flowNote('2026-08-01', EGFR, 81, 'mL/min/1,73 m²', { norm: '≥ 90', hi: true }),
        flowNote('2026-08-01', CA, 3.2, 'mg/kg/24 h', { norm: '< 4,0', hi: false }),
      ],
    };
  });

  it('readPatientFlowsheet: buduje siatkę parametry × wizyty (wszystkie parametry)', async () => {
    const vs = g.ClcrVisitSave;
    const data = await vs.readPatientFlowsheet('p1');
    expect(data.visits).toEqual(['2026-06-01', '2026-08-01']);
    // sort wg słownika: egfr przed Ca_mgkg
    expect(data.parameters.map((p) => p.id)).toEqual(['egfr', 'Ca_mgkg']);

    const egfr = data.parameters[0];
    expect(egfr.byDate['2026-06-01']).toMatchObject({ valueNum: 88, outOfRange: true });
    expect(egfr.byDate['2026-08-01']).toMatchObject({ valueNum: 81, outOfRange: true });
    expect(egfr.norm).toBe('≥ 90');
    expect(egfr.trend.direction).toBe('down');

    const ca = data.parameters[1];
    expect(ca.byDate['2026-06-01']).toBeUndefined(); // brak pomiaru → „—"
    expect(ca.byDate['2026-08-01']).toMatchObject({ valueNum: 3.2, outOfRange: false });
    expect(ca.norm).toBe('< 4,0');
  });

  it('readPatientFlowsheet: pusto, gdy sejf zablokowany', async () => {
    const vs = g.ClcrVisitSave;
    g.VildaVault.isUnlocked = () => false;
    const data = await vs.readPatientFlowsheet('p1');
    expect(data).toEqual({ visits: [], parameters: [] });
  });
});
