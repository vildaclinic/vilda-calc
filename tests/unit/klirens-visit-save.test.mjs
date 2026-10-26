import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Ładujemy clcr_ui_workflow.js (zawiera ClcrUiModel + dopięty ClcrVisitSave).
// Bez `document` w globalu moduł pomija budowę UI — testujemy czystą logikę.
function loadVisitSave(extra = {}) {
  const g = Object.assign({}, extra);
  loadBrowserScript('clcr_ui_workflow.js', g);
  return g;
}

// Explicit persisted identity in capture-only vault fixtures; never a real account.
function selectPersistedPatient(global, patientId) {
  global.VildaVault.getPatient = async id => id === patientId ? { id, patientId: id, name: 'Fikcyjny pacjent' } : null;
  global.ClcrVisitSave._setPatientId(patientId);
}

function fakeEl(series, value, { visible = true, attributes = {} } = {}) {
  return {
    getAttribute(name) {
      if (Object.prototype.hasOwnProperty.call(attributes, name)) return attributes[name];
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

function u25Model(g, { ageYears = 10, state = 'unknown', assay = '' } = {}) {
  for (const file of ['clcr_clinical_safety.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js']) {
    loadBrowserScript(file, g);
  }
  const safety = g.ClcrClinicalSafety;
  const value = safety.computeCkidU25Creatinine({ sex: 'F', ageYears, heightCm: 140, creatinineMgDl: 0.6 });
  const markerPolicy = safety.creatininePolicy(state, false);
  return g.ClcrResultPresentation.createModel({
    formulaId: 'ckid_u25', series: 'ckid_u25', ageYears, assay, markerPolicy,
    value, displayValue: safety.formatGfrForDisplay(value).rounded, unit: 'mL/min/1,73 m²',
    presentation: safety.egfrPresentation({ value, age: ageYears, assay, markerPolicy }),
  }, g.ClcrResultReferenceData.PROFILE);
}

// DOM contract of the common result card. Browser tests exercise the actual
// rendered DOM; these fixtures isolate its production save adapter.
function resultCard(model, { legacyRange = '' } = {}) {
  const reference = {
    getAttribute: name => name === 'data-clcr-reference-kind' ? model.reference.kind : null,
    querySelector: selector => {
      if (selector === '.clcr-result-reference-value') return { textContent: model.reference.value };
      if (selector === '.clcr-result-reference-unit' && model.reference.unit) return { textContent: model.reference.unit };
      return null;
    },
  };
  return {
    ...fakeEl(model.series, String(model.rawValue)),
    getAttribute: name => ({
      'data-clcr-series': model.series,
      'data-clcr-value': String(model.rawValue),
      'data-clcr-display-value': model.displayValue,
      'data-clcr-category': model.category?.code || '',
      'data-clcr-age-used-years': model.ageUsedYears == null ? null : String(model.ageUsedYears),
      'data-clcr-age-policy': model.agePolicy || null,
    })[name] ?? null,
    classList: { contains: name => name === 'out-of-range' && ['warning', 'danger'].includes(model.tone) },
    querySelector: selector => selector === '.clcr-result-reference' ? reference
      : selector === '.range' && legacyRange ? { textContent: legacyRange } : null,
  };
}

const STREFA_BAZOWA = process.env.TZ;

describe('Klirens — ClcrVisitSave (Faza 1: zapis do karty)', () => {
  let g;
  beforeEach(() => {
    g = loadVisitSave();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = STREFA_BAZOWA;
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

  it('collectActiveDatapoints: zachowuje założenia i ich pochodzenie, a błędny JSON nie psuje wyniku', () => {
    loadBrowserScript('clcr_calculation_assumptions.js', g);
    const resolved = g.VildaClcrCalculationAssumptions.resolve('ckid_u25_cys', {});
    for (const encoded of [JSON.stringify(resolved.provenance), '{', 'null', '[]', '"assumed"']) {
      const root = fakeRoot([fakeEl('ckid_u25_cys', '79.26461484738338', {
        attributes: {
          'data-clcr-display-value': '79',
          'data-clcr-assumptions': `  ${resolved.assumptionsText}  `,
          'data-clcr-assumption-provenance': encoded,
        },
      })]);
      const datapoints = g.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'ckid_u25_cys' });
      expect(datapoints).toHaveLength(1);
      expect(datapoints[0]).toMatchObject({ valueNum: 79, assumptions: resolved.assumptionsText });
      if (encoded === JSON.stringify(resolved.provenance)) {
        expect(datapoints[0].assumptionProvenance).toEqual(resolved.provenance);
      } else {
        expect(datapoints[0]).not.toHaveProperty('assumptionProvenance');
      }
    }
  });

  it('saveActiveResultToCard: zapisuje założenia w komentarzu bez rozszerzania schematu badania', async () => {
    loadBrowserScript('clcr_calculation_assumptions.js', g);
    const resolved = g.VildaClcrCalculationAssumptions.resolve('ckid_u25_cys', {});
    const element = {
      ...fakeEl('ckid_u25_cys', '79.26461484738338', {
        attributes: {
          'data-clcr-display-value': '79',
          'data-clcr-assumptions': resolved.assumptionsText,
          'data-clcr-assumption-provenance': JSON.stringify(resolved.provenance),
        },
      }),
      classList: { contains: name => name === 'out-of-range' },
    };
    const datapoints = g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([element]), { formulaId: 'ckid_u25_cys' });
    const before = JSON.stringify(datapoints);
    const saved = [];
    g.VildaVault = { isUnlocked: () => true, savePatientNote: async note => saved.push(note) };
    selectPersistedPatient(g, 'synthetic-cys-assumptions');
    const result = await g.ClcrVisitSave.saveActiveResultToCard({
      patientId: 'synthetic-cys-assumptions', clinicalDateISO: '2026-10-22', datapoints,
    });
    expect(result).toMatchObject({ ok: true, saved: 1, total: 1 });
    expect(saved[0].body).toBe(`Kalkulator klirensu · clcr:ckid_u25_cys · wynik poza zakresem\n\n${resolved.assumptionsText}`);
    expect(saved[0].labResult).toEqual({
      test: datapoints[0].label, value: '79', valueNum: 79, unit: 'mL/min/1,73 m²',
    });
    expect(JSON.stringify(datapoints)).toBe(before);
  });

  it('zapis indeksowanego CG utrwala użyty wiek w treści nowej notatki, bez zmiany badania i dawnych wyników', async () => {
    for (const file of ['clcr_result_reference_data.js', 'clcr_result_presentation.js']) loadBrowserScript(file, g);
    const model = g.ClcrResultPresentation.createModel({
      formulaId: 'cg_norm', series: 'cg_norm', value: 65.51340637632258, displayValue: '66',
      unit: 'mL/min/1,73 m²', ageYears: 60.5, calculationAgeYears: 60,
      calculationAssumptions: { assumptionsText: 'Założenia: stabilna czynność nerek oraz brak podejrzenia AKI.' },
    }, g.ClcrResultReferenceData.PROFILE);
    const card = resultCard(model);
    const element = { ...card, getAttribute: name => name === 'data-clcr-assumptions' ? model.assumptions : card.getAttribute(name) };
    const datapoints = g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([element]), { formulaId: 'cg_norm' });
    expect(datapoints).toHaveLength(1);
    expect(datapoints[0]).toMatchObject({ valueNum: 66, ageUsedYears: 60, agePolicy: 'completed-years', norm: '', outOfRange: false });
    const previousNotes = [{
      id: 'synthetic-old-cg-indexed', category: 'wynik-klirens', clinicalDateISO: '2026-10-01',
      body: 'Kalkulator klirensu · clcr:cg_norm',
      labResult: { test: datapoints[0].label, value: '65', valueNum: 65, unit: 'mL/min/1,73 m²' },
    }];
    const oldBefore = JSON.stringify(previousNotes);
    const datapointsBefore = JSON.stringify(datapoints);
    const saved = [];
    g.VildaVault = { isUnlocked: () => true, savePatientNote: async note => saved.push(note) };
    selectPersistedPatient(g, 'synthetic-cg-indexed-age');
    const result = await g.ClcrVisitSave.saveActiveResultToCard({
      patientId: 'synthetic-cg-indexed-age', clinicalDateISO: '2026-10-23', datapoints,
    });
    expect(result).toMatchObject({ ok: true, saved: 1, total: 1 });
    expect(saved[0].body).toBe('Kalkulator klirensu · clcr:cg_norm\n\nZałożenia: stabilna czynność nerek oraz brak podejrzenia AKI.\n\nWiek użyty we wzorze: 60 ukończonych lat.');
    expect(saved[0].labResult).toEqual({ test: datapoints[0].label, value: '66', valueNum: 66, unit: 'mL/min/1,73 m²' });
    expect(JSON.stringify(datapoints)).toBe(datapointsBefore);
    expect(g.ClcrVisitSave.buildSeriesFromNotes(previousNotes, { formulaId: 'cg_norm' })[0].points[0]).toMatchObject({ valueNum: 65, norm: '', outOfRange: false });
    expect(JSON.stringify(previousNotes)).toBe(oldBefore);
  });

  it.each([
    ['cg_norm', '60', 'fractional-years'],
    ['cg_norm', '', 'completed-years'],
    ['cg_norm', 'bad', 'completed-years'],
    ['cg_norm', 'Infinity', 'completed-years'],
    ['cg_norm', '17', 'completed-years'],
    ['cg_norm', '60.5', 'completed-years'],
    ['cg', '60', 'completed-years'],
    ['egfr', '60', 'completed-years'],
  ])('nie utrwala metadanych wieku dla serii %s, wieku %s i polityki %s', async (series, age, policy) => {
    const element = fakeEl(series, '66', { attributes: {
      'data-clcr-age-used-years': age, 'data-clcr-age-policy': policy,
    } });
    const datapoints = g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([element]), { formulaId: series });
    expect(datapoints).toHaveLength(1);
    expect(datapoints[0]).not.toHaveProperty('ageUsedYears');
    expect(datapoints[0]).not.toHaveProperty('agePolicy');
    const saved = [];
    g.VildaVault = { isUnlocked: () => true, savePatientNote: async note => saved.push(note) };
    selectPersistedPatient(g, 'synthetic-no-cg-age-policy');
    const result = await g.ClcrVisitSave.saveActiveResultToCard({
      patientId: 'synthetic-no-cg-age-policy', clinicalDateISO: '2026-10-23',
      datapoints: [{ ...datapoints[0], ageUsedYears: Number(age), agePolicy: policy }],
    });
    expect(result).toMatchObject({ ok: true, saved: 1 });
    expect(saved[0].body).not.toContain('Wiek użyty we wzorze');
    expect(saved[0].labResult).not.toHaveProperty('agePolicy');
    expect(saved[0].labResult).not.toHaveProperty('ageUsedYears');
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

  it('karta B: oszacowanie U25 83 zapisuje widoczną normę i flagę bez nadawania G', async () => {
    const model = u25Model(g);
    expect(model).toMatchObject({ tone: 'warning', category: null, referenceComparison: true });
    const root = fakeRoot([resultCard(model)]);
    const datapoints = g.ClcrVisitSave.collectActiveDatapoints(root, { formulaId: 'ckid_u25' });
    expect(datapoints).toHaveLength(1);
    expect(datapoints[0]).toMatchObject({ valueNum: 83, norm: '≥90 mL/min/1,73 m²', outOfRange: true });
    expect(datapoints[0]).not.toHaveProperty('category');
    const saved = [];
    g.VildaVault = { isUnlocked: () => true, savePatientNote: async note => saved.push(note) };
    selectPersistedPatient(g, 'synthetic-u25');
    const result = await g.ClcrVisitSave.saveActiveResultToCard({
      patientId: 'synthetic-u25', clinicalDateISO: '2026-10-22', datapoints,
    });
    expect(result).toMatchObject({ ok: true, saved: 1 });
    expect(saved[0].labResult).toEqual({
      test: datapoints[0].label, value: '83', valueNum: 83, unit: 'mL/min/1,73 m²', norm: '≥90 mL/min/1,73 m²',
    });
    expect(saved[0].body).toBe('Kalkulator klirensu · clcr:ckid_u25 · wynik poza zakresem');
    expect(saved[0].body).not.toContain('G2');
  });

  it('karta B: kwalifikowane G2 zachowuje tę samą normę przy zapisie', () => {
    const model = u25Model(g, { state: 'stable', assay: 'enzymatic_idms' });
    expect(model.category.code).toBe('G2');
    expect(g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([resultCard(model)]), { formulaId: 'ckid_u25' })[0]).toMatchObject({
      valueNum: 83, norm: '≥90 mL/min/1,73 m²', outOfRange: true,
    });
  });

  it('karta B: wiek poniżej progu nie zamienia komentarza w normę ani nie przejmuje starego zakresu', () => {
    const model = u25Model(g, { ageYears: 1.5 });
    expect(model).toMatchObject({ category: null, tone: 'neutral', reference: { kind: 'none' } });
    expect(g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([resultCard(model, { legacyRange: '≥90' })]), { formulaId: 'ckid_u25' })[0]).toMatchObject({
      norm: '', outOfRange: false,
    });
  });

  it('karta B: brak uniwersalnej normy klirensu nie staje się zakresem laboratoryjnym', () => {
    u25Model(g);
    const model = g.ClcrResultPresentation.createModel({ formulaId: 'cg', series: 'cg', value: 100, displayValue: '100', unit: 'mL/min', ageYears: 50 }, g.ClcrResultReferenceData.PROFILE);
    expect(g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([resultCard(model)]), { formulaId: 'cg' })[0]).toMatchObject({
      valueNum: 100, norm: '', outOfRange: false,
    });
  });

  it('dawny boks nadal odczytuje zakres .range i flagę poza zakresem', () => {
    const element = {
      ...fakeEl('egfr', '83'),
      classList: { contains: name => name === 'out-of-range' },
      querySelector: selector => selector === '.range' ? { textContent: '  ≥ 90\n mL/min/1,73 m²  ' } : null,
    };
    expect(g.ClcrVisitSave.collectActiveDatapoints(fakeRoot([element]), { formulaId: 'egfr' })[0]).toMatchObject({
      valueNum: 83, norm: '≥ 90 mL/min/1,73 m²', outOfRange: true,
    });
  });

  it('odczyt zapisanych dawniej 83 nie przelicza flagi ani nie dopisuje nowej normy', () => {
    const label = g.ClcrVisitSave.mapDatapoint('ckid_u25', 83).label;
    const notes = [{
      id: 'synthetic-old', category: 'wynik-klirens', clinicalDateISO: '2026-10-01',
      body: 'Kalkulator klirensu · clcr:ckid_u25',
      labResult: { test: label, value: '83', valueNum: 83, unit: 'mL/min/1,73 m²' },
    }];
    const before = JSON.stringify(notes);
    expect(g.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'ckid_u25' })[0].points[0]).toMatchObject({
      valueNum: 83, outOfRange: false, norm: '', noteId: 'synthetic-old',
    });
    expect(JSON.stringify(notes)).toBe(before);
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

    selectPersistedPatient(g, 'p1');
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
    selectPersistedPatient(g, 'patient-42');

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

  it('saveActiveResultToCard: domyślna data = LOKALNY dzień, nie dzień UTC', async () => {
    // 2026-07-27 13:00 UTC = 2026-07-28 01:45 w Pacific/Chatham (UTC+12:45, zima NZ).
    // Poprzednia wersja tego testu sprawdzała wyłącznie KSZTAŁT (/^\d{4}-\d{2}-\d{2}$/),
    // więc przechodziła też dla dnia UTC — czyli dla usterki, której miała pilnować.
    // Ta chwila rozdziela oba dni, a asercja offsetu potwierdza, że strefa faktycznie się przełączyła.
    process.env.TZ = 'Pacific/Chatham';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-27T13:00:00Z'));
    expect(new Date().getTimezoneOffset()).toBe(-765);

    const calls = [];
    g.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async (n) => {
        calls.push(n);
        return { id: '1' };
      },
    };
    const vs = g.ClcrVisitSave;
    selectPersistedPatient(g, 'p1');
    const res = await vs.saveActiveResultToCard({
      datapoints: [
        { testKey: 'clcr:egfr', label: 'eGFR', unit: 'mL/min/1,73 m²', valueNum: 90 },
      ],
    });
    expect(res.ok).toBe(true);
    expect(res.clinicalDateISO).toBe('2026-07-28');
    expect(calls[0].clinicalDateISO).toBe(res.clinicalDateISO);
    // kontrola negatywna: dzień UTC tej samej chwili to 2026-07-27
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-07-27');
  });
});
