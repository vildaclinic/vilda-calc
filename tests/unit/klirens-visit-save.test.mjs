import { describe, expect, it, beforeEach } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Ładujemy clcr_ui_workflow.js (zawiera ClcrUiModel + dopięty ClcrVisitSave).
// Bez `document` w globalu moduł pomija budowę UI — testujemy czystą logikę.
function loadVisitSave(extra = {}) {
  const g = Object.assign({}, extra);
  loadBrowserScript('clcr_ui_workflow.js', g);
  return g;
}

function fakeEl(series, value, { visible = true } = {}) {
  return {
    getAttribute(name) {
      if (name === 'data-clcr-series') return series;
      if (name === 'data-clcr-value') return value;
      return null;
    },
    getClientRects() {
      return visible ? [{ width: 10, height: 10 }] : [];
    },
  };
}

function fakeRoot(els) {
  return {
    querySelectorAll() {
      return els;
    },
  };
}

describe('Klirens — ClcrVisitSave (Faza 1: zapis do karty)', () => {
  let g;
  beforeEach(() => {
    g = loadVisitSave();
  });

  it('mapDatapoint: mapuje tag serii przez słownik, odrzuca nieznane i nieliczbowe', () => {
    const vs = g.ClcrVisitSave;
    const dp = vs.mapDatapoint('egfr', '91.6914');
    expect(dp).toMatchObject({
      id: 'egfr',
      testKey: 'clcr:egfr',
      label: 'eGFR — dorośli (kreatynina)',
      unit: 'mL/min/1,73 m²',
      sourceFormulaId: 'egfr',
    });
    expect(dp.valueNum).toBeCloseTo(91.6914, 4);

    // seria wieloczłonowa: białko rozbite
    expect(vs.mapDatapoint('Prot_mg24', '1500').testKey).toBe('clcr:Prot_mg24');
    expect(vs.mapDatapoint('KTV_urr', '65').unit).toBe('%');

    expect(vs.mapDatapoint('nie-istnieje', '1')).toBeNull();
    expect(vs.mapDatapoint('egfr', 'abc')).toBeNull();
    expect(vs.mapDatapoint('egfr', '')).toBeNull();
  });

  it('collectActiveDatapoints: zbiera widoczne, deduplikuje serię, pomija ukryte i nietagowane', () => {
    const vs = g.ClcrVisitSave;
    const root = fakeRoot([
      fakeEl('egfr', '91.6'),
      fakeEl('cg', '100'),
      fakeEl('egfr', '92.1'), // duplikat serii → pomiń
      fakeEl('Prot_mg24', '1500'),
      fakeEl('nie-istnieje', '5'), // spoza słownika → pomiń
      fakeEl('Ca_mgkg', '3', { visible: false }), // ukryte → pomiń
    ]);
    const dps = vs.collectActiveDatapoints(root);
    expect(dps.map((d) => d.id)).toEqual(['egfr', 'cg', 'Prot_mg24']);
    expect(dps.find((d) => d.id === 'egfr').valueNum).toBeCloseTo(91.6, 3);
  });

  it('normalizeDateISO / formatValueString / seriesWord', () => {
    const vs = g.ClcrVisitSave;
    expect(vs.normalizeDateISO('2026-08-01')).toBe('2026-08-01');
    expect(vs.normalizeDateISO('  2026-8-1 ')).toBe('2026-8-1');
    expect(vs.normalizeDateISO('01.08.2026')).toBeNull();
    expect(vs.normalizeDateISO(null)).toBeNull();

    expect(vs.formatValueString(100)).toBe('100');
    expect(vs.formatValueString(91.69148)).toBe('91.691');
    expect(vs.formatValueString(NaN)).toBe('');

    expect(vs.seriesWord(1)).toBe('seria');
    expect(vs.seriesWord(3)).toBe('serie');
    expect(vs.seriesWord(5)).toBe('serii');
  });

  it('saveActiveResultToCard: bramka — sejf zablokowany / brak pacjenta / brak danych', async () => {
    const calls = [];
    g.VildaVault = {
      isUnlocked: () => false,
      savePatientNote: async (n) => {
        calls.push(n);
        return { id: 'x' };
      },
    };
    const vs = g.ClcrVisitSave;

    let res = await vs.saveActiveResultToCard({
      datapoints: [{ testKey: 'clcr:egfr', label: 'x', unit: 'y', valueNum: 1 }],
      patientId: 'p1',
    });
    expect(res).toMatchObject({ ok: false, reason: 'locked', saved: 0 });

    g.VildaVault.isUnlocked = () => true;
    vs._setPatientId(null);
    res = await vs.saveActiveResultToCard({
      datapoints: [{ testKey: 'clcr:egfr', label: 'x', unit: 'y', valueNum: 1 }],
    });
    expect(res).toMatchObject({ ok: false, reason: 'no-patient' });

    res = await vs.saveActiveResultToCard({ patientId: 'p1', datapoints: [] });
    expect(res).toMatchObject({ ok: false, reason: 'no-data' });

    expect(calls).toHaveLength(0);
  });

  it('saveActiveResultToCard: zapisuje osobną notatkę na serię z poprawnym payloadem', async () => {
    const calls = [];
    g.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async (n) => {
        calls.push(n);
        return { id: 'n' + calls.length };
      },
    };
    const vs = g.ClcrVisitSave;
    vs._setPatientId('patient-42');

    const root = fakeRoot([
      fakeEl('egfr', '91.6914'),
      fakeEl('Prot_mg24', '1500'),
      fakeEl('Prot_g24', '1.5'),
    ]);
    const res = await vs.saveActiveResultToCard({
      root,
      clinicalDateISO: '2026-08-01',
    });

    expect(res).toMatchObject({ ok: true, saved: 3, total: 3, clinicalDateISO: '2026-08-01' });
    expect(calls).toHaveLength(3);

    const egfr = calls.find((c) => c.title === 'eGFR — dorośli (kreatynina)');
    expect(egfr.patientId).toBe('patient-42');
    expect(egfr.category).toBe('wynik-klirens');
    expect(egfr.clinicalDateISO).toBe('2026-08-01');
    // OBEJŚCIE §2: testKey w treści (magazyn i tak gubi go w labResult), grupujemy po pełnej etykiecie
    expect(egfr.body).toContain('clcr:egfr');
    expect(egfr.labResult).toMatchObject({
      test: 'eGFR — dorośli (kreatynina)',
      unit: 'mL/min/1,73 m²',
    });
    expect(egfr.labResult.valueNum).toBeCloseTo(91.6914, 4);

    // białko: dwie osobne serie z tą samą datą (jedna wizyta), różne etykiety/jednostki
    const prot = calls.filter((c) => c.labResult.test.startsWith('Białko w DZM'));
    expect(prot).toHaveLength(2);
    expect(new Set(prot.map((p) => p.labResult.unit))).toEqual(
      new Set(['mg/24 h', 'g/24 h']),
    );
    expect(prot.every((p) => p.clinicalDateISO === '2026-08-01')).toBe(true);
  });

  it('saveActiveResultToCard: domyślna data = dziś (YYYY-MM-DD) gdy nie podano', async () => {
    const calls = [];
    g.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async (n) => {
        calls.push(n);
        return { id: '1' };
      },
    };
    const vs = g.ClcrVisitSave;
    vs._setPatientId('p1');
    const res = await vs.saveActiveResultToCard({
      datapoints: [
        { testKey: 'clcr:egfr', label: 'eGFR', unit: 'mL/min/1,73 m²', valueNum: 90 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.clinicalDateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls[0].clinicalDateISO).toBe(res.clinicalDateISO);
  });
});
