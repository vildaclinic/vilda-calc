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

  it('collectActiveDatapoints: filtr po module wybranej formuły — wyklucza porównania z innych modułów', () => {
    const vs = g.ClcrVisitSave;
    // U 20-latka wybór CKiD U25 renderuje też egfr/cg/cg_norm (panel porównawczy) —
    // zapisujemy TYLKO wybraną formułę (moduł child-egfr = [ckid_u25]).
    const root = fakeRoot([
      fakeEl('ckid_u25', '83'),
      fakeEl('egfr', '95'),
      fakeEl('cg', '110'),
      fakeEl('cg_norm', '96'),
    ]);
    const dps = vs.collectActiveDatapoints(root, { formulaId: 'ckid_u25' });
    expect(dps.map((d) => d.id)).toEqual(['ckid_u25']);
  });

  it('collectActiveDatapoints: panel DZM zapisuje anality swojego modułu, pomija cudze', () => {
    const vs = g.ClcrVisitSave;
    // timed-urine-panel zawiera Ca_mgkg, UA_mgkg… ale NIE Ox_mgkg (stone-profile).
    const root = fakeRoot([
      fakeEl('Ca_mgkg', '4'),
      fakeEl('UA_mgkg', '8'),
      fakeEl('Ox_mgkg', '0.3'), // inny moduł → pomiń
      fakeEl('egfr', '95'), // inny moduł → pomiń
    ]);
    const dps = vs.collectActiveDatapoints(root, { formulaId: 'Ca_mgkg' });
    const ids = dps.map((d) => d.id).sort();
    expect(ids).toContain('Ca_mgkg');
    expect(ids).toContain('UA_mgkg');
    expect(ids).not.toContain('Ox_mgkg');
    expect(ids).not.toContain('egfr');
  });

  it('collectActiveDatapoints: pojedyncza formuła (eGFR dorośli) — bez CG obok', () => {
    const vs = g.ClcrVisitSave;
    const root = fakeRoot([fakeEl('egfr', '92'), fakeEl('cg', '100'), fakeEl('cg_norm', '87')]);
    const dps = vs.collectActiveDatapoints(root, { formulaId: 'egfr' });
    expect(dps.map((d) => d.id)).toEqual(['egfr']);
  });

  it('collectActiveDatapoints: białko DZM — wybór modułu zapisuje 3 serie (①)', () => {
    const vs = g.ClcrVisitSave;
    const root = fakeRoot([
      fakeEl('Prot_mg24', '1500'),
      fakeEl('Prot_g24', '1.5'),
      fakeEl('Prot_bsa', '850'),
    ]);
    const dps = vs.collectActiveDatapoints(root, { formulaId: 'Prot_mgkg' });
    expect(dps.map((d) => d.id).sort()).toEqual(['Prot_bsa', 'Prot_g24', 'Prot_mg24']);
  });

  it('normalizeDateISO / formatValueString / seriesWord', () => {
    const vs = g.ClcrVisitSave;
    expect(vs.normalizeDateISO('2026-08-01')).toBe('2026-08-01');
    expect(vs.normalizeDateISO('  2026-8-1 ')).toBe('2026-8-1');
    expect(vs.normalizeDateISO('01.08.2026')).toBeNull();
    expect(vs.normalizeDateISO(null)).toBeNull();

    expect(vs.formatValueString(100)).toBe('100');
    expect(vs.formatValueString(91.69148)).toBe('91,69'); // 2 miejsca, przecinek
    expect(vs.formatValueString(3.2)).toBe('3,2');
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
