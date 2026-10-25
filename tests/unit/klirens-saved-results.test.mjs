import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT_ID = 'fictional-saved-results-patient';

function reader(extra = {}) {
  const browser = { ...extra };
  loadBrowserScript('clcr_saved_results.js', browser);
  return { browser, api: browser.ClcrSavedResults };
}

function registry() {
  const browser = {};
  const source = readFileSync(new URL('../../inline_kalkulator_klirens_02.js', import.meta.url), 'utf8');
  new Function('window', 'globalThis', 'document', source)(browser, browser, { addEventListener() {} });
  return browser.FORMULAS;
}

function note(api, outputId, id, changes = {}) {
  const parameter = api.getParam(outputId);
  const base = {
    id,
    patientId: PATIENT_ID,
    rev: 7,
    category: 'wynik-klirens',
    clinicalDateISO: '2026-10-25',
    title: parameter.label,
    body: `Kalkulator klirensu · ${parameter.testKey}`,
    labResult: {
      test: parameter.label,
      value: '45',
      valueNum: 45,
      unit: parameter.unit,
    },
  };
  return { ...base, ...changes, labResult: { ...base.labResult, ...changes.labResult } };
}

function points(series) {
  return series.flatMap((entry) => entry.points);
}

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

describe('ClcrSavedResults — complete shared historical read contract', () => {
  it('maps all 41 active production formulas to exactly 45 saved output identities', () => {
    const { api } = reader();
    const active = registry().filter((formula) => formula.id !== 'sch_var');
    expect(active).toHaveLength(41);
    expect(api.PARAM_DICTIONARY).toHaveLength(45);
    expect(new Set(api.PARAM_DICTIONARY.map((entry) => entry.id)).size).toBe(45);
    expect(new Set(api.PARAM_DICTIONARY.map((entry) => entry.testKey)).size).toBe(45);
    expect(new Set(api.PARAM_DICTIONARY.map((entry) => entry.sourceFormulaId)))
      .toEqual(new Set(active.map((formula) => formula.id)));

    const notes = api.PARAM_DICTIONARY.map((entry, index) => note(api, entry.id, `fictional-all-${entry.id}`, {
      labResult: { value: String(index + 1), valueNum: index + 1 },
    }));
    const series = api.buildSeriesFromNotes(notes, { allParams: true });
    expect(series).toHaveLength(45);
    expect(new Set(series.map((entry) => entry.id)))
      .toEqual(new Set(api.PARAM_DICTIONARY.map((entry) => entry.id)));
    expect(new Set(points(series).map((point) => point.noteId)))
      .toEqual(new Set(notes.map((entry) => entry.id)));
    expect(points(series)).toHaveLength(45);
  });

  it('exposes both stable clcr keys and exact labels without matching by a label slug', () => {
    const { api } = reader();
    for (const parameter of api.PARAM_DICTIONARY) {
      expect(api.getParam(parameter.id)).toEqual(parameter);
      expect(api.getParam(parameter.testKey)).toEqual(parameter);
      expect(api.getParamByLabel(parameter.label)).toEqual(parameter);
    }
    expect(api.getParamByLabel('eGFR — dorośli')).toBeNull();
    expect(api.getParam('not-a-saved-formula')).toBeNull();
    expect(api.getParamGroups().flatMap((group) => group.entries)).toHaveLength(45);
  });

  it.each([
    ['Prot_mgkg', ['Prot_mg24', 'Prot_g24', 'Prot_bsa']],
    ['KTV', ['KTV_spktv', 'KTV_ektv', 'KTV_urr']],
  ])('retains the three outputs of %s without taking an unrelated result', (formulaId, outputIds) => {
    const { api } = reader();
    const notes = api.PARAM_DICTIONARY.map((entry) => note(api, entry.id, `fictional-scope-${entry.id}`));
    const series = api.buildSeriesFromNotes(notes, { formulaId });
    expect(new Set(series.map((entry) => entry.id))).toEqual(new Set(outputIds));
    expect(points(series)).toHaveLength(3);
    expect(series.every((entry) => entry.sourceFormulaId === formulaId)).toBe(true);
  });

  it('keeps serum, urine, spot/DZM and GFR method/indexing identities distinct on the same day', () => {
    const { api } = reader();
    const ids = [
      'egfr', 'egfr_cr_cys', 'ckid_u25', 'ckid_u25_cys', 'ckid_u25_cr_cys',
      'cg', 'cg_norm', 'cl24', 'B_Cr', 'PCR', 'pH_spot', 'pH24', 'AGs', 'AGu_spot',
    ];
    const series = api.buildSeriesFromNotes(ids.map((id) => note(api, id, `fictional-method-${id}`)), { allParams: true });
    expect(series).toHaveLength(ids.length);
    expect(new Set(series.map((entry) => entry.id))).toEqual(new Set(ids));
    expect(new Set(series.map((entry) => entry.key)).size).toBe(ids.length);
    for (const entry of series) {
      expect(entry.label).toBe(api.getParam(entry.id).label);
      expect(entry.points).toHaveLength(1);
    }
  });

  it.each([
    ['-15', -15],
    ['0', 0],
    ['-0,25', -0.25],
    ['1e-100', 1e-100],
  ])('reads the complete exact value %s when the generic vault has no numeric point', (value, expected) => {
    const { api } = reader();
    const saved = note(api, 'AGu_spot', `fictional-signed-${value}`, { labResult: { value, valueNum: undefined } });
    const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
    expect(point).toMatchObject({
      noteId: saved.id,
      valueNum: expected,
      kind: 'exact',
      comparator: '',
      outOfRange: null,
    });
    expect(point.displayValue).toBe(value);
  });

  it.each([
    ['<30', '<'], ['≤30', '≤'], ['>300', '>'], ['≥3', '≥'],
  ])('keeps %s visible without plotting its endpoint as an exact measurement', (value, comparator) => {
    const { api } = reader();
    const saved = note(api, 'ACR', `fictional-censored-${value}`, { labResult: { value, valueNum: undefined } });
    const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
    expect(point).toMatchObject({
      noteId: saved.id,
      valueNum: null,
      kind: 'censored',
      comparator,
      displayValue: value,
      outOfRange: null,
    });
  });

  it.each(['nie oznaczono', '15 nieczytelny', 'NaN', 'Infinity', '', '15 = wynik z komentarza'])(
    'retains nonnumeric text %j without inventing a number or losing the saved note', (value) => {
      const { api } = reader();
      const saved = note(api, 'AGu_spot', `fictional-text-${value}`, { labResult: { value, valueNum: undefined } });
      const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
      expect(point).toMatchObject({ noteId: saved.id, valueNum: null, kind: 'text', outOfRange: null });
      expect(point.displayValue).toBe(value || '—');
    });

  it('deduplicates one canonical note ID while retaining distinct same-day and same-value records', () => {
    const { api } = reader();
    const first = note(api, 'AGu_spot', 'fictional-same-day-one');
    const second = note(api, 'AGu_spot', 'fictional-same-day-two');
    const series = api.buildSeriesFromNotes([first, { ...first }, second], { allParams: true });
    expect(series).toHaveLength(1);
    expect(series[0].points).toHaveLength(2);
    expect(new Set(series[0].points.map((point) => point.noteId))).toEqual(new Set([first.id, second.id]));
    expect(series[0].points.every((point) => point.dateISO === '2026-10-25')).toBe(true);
  });

  it('retains canonical patient, revision and note identity for future edit/delete actions', () => {
    const { api } = reader();
    const saved = note(api, 'ckid_u25', 'fictional-edit-target', {
      rev: 12,
      clinicalDateISO: '2026-10-20',
      labResult: { value: '83', valueNum: 83, norm: '≥90 mL/min/1,73 m²' },
    });
    const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
    expect(point).toMatchObject({
      noteId: saved.id,
      patientId: PATIENT_ID,
      baseRev: 12,
      dateISO: '2026-10-20',
      norm: '≥90 mL/min/1,73 m²',
      displayValue: '83',
    });
    expect(point.note).toEqual(saved);
  });

  it('uses each point’s own reference and never borrows an older norm for a later result', () => {
    const { api } = reader();
    const old = note(api, 'ckid_u25', 'fictional-old-reference', {
      clinicalDateISO: '2026-10-20',
      body: 'Kalkulator klirensu · clcr:ckid_u25 · wynik poza zakresem',
      labResult: { value: '83', valueNum: 83, norm: '≥90 mL/min/1,73 m²' },
    });
    const latest = note(api, 'ckid_u25', 'fictional-no-reference', {
      clinicalDateISO: '2026-10-25',
      labResult: { value: '97', valueNum: 97 },
    });
    const [series] = api.buildSeriesFromNotes([latest, old], { allParams: true });
    expect(series.points.find((point) => point.noteId === old.id)).toMatchObject({
      norm: '≥90 mL/min/1,73 m²', outOfRange: true,
    });
    expect(series.points.find((point) => point.noteId === latest.id)).toMatchObject({ norm: '', outOfRange: null });
    expect(series.norm).toBe('');
  });

  it('splits native units rather than connecting incompatible values through a converter', () => {
    const { api } = reader();
    const native = note(api, 'ACR', 'fictional-native-si', { labResult: { value: '3', valueNum: 3, unit: 'mg/mmol' } });
    const conventional = note(api, 'ACR', 'fictional-native-mass', { labResult: { value: '26,52', valueNum: 26.52, unit: 'mg/g' } });
    const series = api.buildSeriesFromNotes([native, conventional], { allParams: true });
    expect(series).toHaveLength(2);
    expect(new Set(series.map((entry) => entry.unit))).toEqual(new Set(['mg/mmol', 'mg/g']));
    expect(new Set(series.map((entry) => entry.key)).size).toBe(2);
    expect(new Set(points(series).map((point) => point.valueNum))).toEqual(new Set([3, 26.52]));
  });

  it('keeps an undated note visible without assigning its entry date or today as the sample date', () => {
    const { api } = reader();
    const saved = note(api, 'AGu_spot', 'fictional-undated', {
      clinicalDateISO: undefined,
      createdAtISO: '2026-10-25T12:30:00.000Z',
    });
    const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
    expect(point.noteId).toBe(saved.id);
    expect(point.dateISO == null || point.dateISO === '').toBe(true);
  });

  it('keeps an impossible imported sample date as undated rather than moving it to a real calendar day', () => {
    const { api } = reader();
    const saved = note(api, 'AGu_spot', 'fictional-impossible-date', { clinicalDateISO: '2026-02-31' });
    const [point] = points(api.buildSeriesFromNotes([saved], { allParams: true }));
    expect(point).toMatchObject({ noteId: saved.id, dateISO: '', dateSource: 'unknown' });
    expect(point.note.clinicalDateISO).toBe('2026-02-31');
  });

  it('only accepts Klirens notes, leaving unrelated laboratory and treatment records to their own readers', () => {
    const { api } = reader();
    const accepted = note(api, 'AGu_spot', 'fictional-klirens-only');
    const ordinary = note(api, 'ACR', 'fictional-ordinary-lab', { category: 'wynik-badania' });
    const medication = note(api, 'AGu_spot', 'fictional-treatment', { category: 'treatment' });
    const result = api.buildSeriesFromNotes([ordinary, accepted, medication], { allParams: true });
    expect(points(result).map((point) => point.noteId)).toEqual([accepted.id]);
  });

  it('reads frozen note data without engines, converter, current patient, vault or DOM access and without mutation', () => {
    const forbidden = vi.fn(() => { throw new Error('Historical reads must not evaluate or fetch the current patient'); });
    const { api } = reader({
      ClcrClinicalSafety: { computeCkidU25Creatinine: forbidden, egfrPresentation: forbidden },
      VildaClcrAcr: { evaluate: forbidden },
      VildaClcrAcrReferenceData: { getProfile: forbidden },
      LabUnitConverter: { evaluate: forbidden, convertAll: forbidden },
      VildaVault: { getCurrentPatient: forbidden, listPatientNotesForPatient: forbidden },
    });
    const notes = freezeTree([
      note(api, 'ckid_u25', 'fictional-no-reassessment', {
        labResult: { value: '83', valueNum: 83, norm: '≥90 mL/min/1,73 m²' },
      }),
      note(api, 'AGu_spot', 'fictional-no-converter', { labResult: { value: '-15', valueNum: undefined } }),
    ]);
    const before = JSON.stringify(notes);
    const options = { allParams: true };
    Object.defineProperty(options, 'currentPatient', { get: forbidden });
    const result = api.buildSeriesFromNotes(notes, options);
    expect(points(result)).toHaveLength(2);
    expect(forbidden).not.toHaveBeenCalled();
    expect(JSON.stringify(notes)).toBe(before);
  });
});
