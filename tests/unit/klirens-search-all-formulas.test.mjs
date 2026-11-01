import { describe, expect, it } from 'vitest';
import { buildKlirensSearchCases, createKlirensSearchEnvironment, KLIRENS_SEARCH_PARAMETER_KEYS } from '../support/klirens-search-all-formulas.mjs';

const PATIENT = 'fictional-klirens-search-entire-registry';
const root = createKlirensSearchEnvironment();
const cases = buildKlirensSearchCases(PATIENT, root);
const sorted = values => [...new Set(values)].sort();
const forbidden = ['VILDA_CLCR', 'exactMain', 'numerator', 'referenceRows', 'engineVersion', '[tekst]', '[liczba]', 'Kalkulator klirensu ·'];

function searchFor(win, notes) {
  const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-all-formulas-account' }),
    listPatients: async () => [{ patientId: PATIENT, header: { name: 'Fikcyjny Rejestr Klirensu' } }], listExternalPatients: async () => [],
    listAllPatientNotes: async () => notes, listCarePlans: async () => [] };
  return win.VildaGlobalSearch.create({ vault });
}

function expectNotesPresentation(summary, model) {
  expect(model).not.toBeNull();
  expect(summary.split('\n')[0]).toBe('Wynik: ' + model.display + (model.unit ? ' ' + model.unit : ''));
  if (model.norm) expect(summary).toContain(model.referenceLabel + ': ' + model.norm);
  else expect(summary).not.toContain('Norma przy zapisie:');
  for (const field of ['status', 'interpretation', 'caution', 'comment']) if (model[field]) expect(summary).toContain(model[field]);
  if (model.boundary) expect(summary).toContain(model.boundaryLabel + ': ' + model.boundary);
  for (const marker of forbidden) expect(summary).not.toContain(marker);
}

describe('Search covers the complete Klirens persisted-output registry', () => {
  it('covers every production output and source formula, including protein and dialysis aliases', () => {
    const registry = root.ClcrSavedResults.PARAM_DICTIONARY;
    expect(sorted(KLIRENS_SEARCH_PARAMETER_KEYS)).toEqual(sorted(registry.map(entry => entry.id)));
    expect(sorted(cases.filter(item => item.variant === 'registry').map(item => item.parameterKey))).toEqual(sorted(registry.map(entry => entry.id)));
    expect(sorted(cases.map(item => item.formulaId))).toEqual(sorted(registry.map(entry => entry.sourceFormulaId)));
    expect(root.ClcrSavedResults.getParam('sch_var')).toBeNull();
  });

  it('actually records the requested modes, mass bases, output representations and zeroes', () => {
    for (const item of cases) {
      const saved = root.ClcrSavedCalculation.readSaved(item.note);
      const typed = Object.entries(saved.snapshot.assessment).filter(([key]) => key.endsWith('Snapshot')).map(([, value]) => value).find(Boolean);
      if (item.variant.startsWith('direct-')) expect(typed.mode || typed.input.mode).toBe('direct');
      if (item.variant.startsWith('reported-') || item.variant.startsWith('typed-reported-')) expect(typed.mode || typed.input.mode).toBe('reported');
      if (item.variant === 'exact-zero') expect(saved.rawValue).toBe(0);
      if (item.variant.endsWith('mass-unknown')) {
        expect(item.expected.model.norm).toBe('');
        expect(item.expected.model.status).toBe('Bez zapisanej oceny');
      }
      if (item.variant.endsWith('censored')) expect(item.expected.model.display).toMatch(/^</);
    }
    expect(sorted(cases.filter(item => item.formulaId === 'Mg_mgkg').map(item => item.expected.model.unit)))
      .toEqual(['mg/1,73 m²/24 h', 'mg/24 h', 'mg/kg/24 h']);
    expect(sorted(cases.filter(item => item.parameterKey === 'Prot_mg24' && item.variant.startsWith('typed-')).map(item => item.expected.model.unit)))
      .toEqual(['g/24 h', 'mg/24 h']);
  });

  it.each(cases)('$key: real persisted output matches Notes in both preview and searchable text', async item => {
    const before = JSON.stringify(item.note);
    expect(root.ClcrSavedCalculation.readSaved(item.note).valid).toBe(true);
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    const summary = root.ClcrNotesView.summary(item.note, { patientId: PATIENT });
    expectNotesPresentation(summary, model);
    const service = searchFor(root, [item.note]);
    try {
      const rows = await service.search(item.key);
      expect(rows).toHaveLength(1);
      expect(rows[0].noteId).toBe(item.note.id);
      expect(rows[0].body).toBe(summary);
      expect(rows[0].source).toBe(item.note);
      expect(await service.search('VILDA_CLCR_CALCULATION')).toEqual([]);
      expect(await service.search('engineVersion')).toEqual([]);
    } finally { service.destroy(); }
    expect(JSON.stringify(item.note)).toBe(before);
  });

  it('reads every frozen output after all current calculators and reference tables become inaccessible', async () => {
    const isolated = createKlirensSearchEnvironment(), isolatedCases = buildKlirensSearchCases(PATIENT, isolated);
    const inaccessible = Object.keys(isolated).filter(name => /^VildaClcr/.test(name) || /ReferenceData$/.test(name)
      || ['ClcrClinicalSafety', 'ClcrExtendedEgfr', 'ClcrResultPresentation', 'ClcrSavedLegacyCalculator', 'ClcrCollectionDuration', 'ClcrStoneSafety', 'ClcrDialysisSafety'].includes(name));
    const accesses = [];
    isolated.ClcrSavedCalculation = { ...isolated.ClcrSavedCalculation, recalculate() { accesses.push('ClcrSavedCalculation.recalculate'); throw new Error('A reader must not recalculate'); } };
    for (const name of inaccessible) Object.defineProperty(isolated, name, { configurable: true, get() { accesses.push(name); throw new Error('Current clinical dependency accessed: ' + name); } });
    const before = JSON.stringify(isolatedCases.map(item => item.note));
    const service = searchFor(isolated, isolatedCases.map(item => item.note));
    try {
      const rows = await service.search('Fikcyjny komentarz');
      expect(rows).toHaveLength(isolatedCases.length);
      for (const item of isolatedCases) {
        const summary = isolated.ClcrNotesView.summary(item.note, { patientId: PATIENT });
        expect(summary).toBe(item.expected.summary);
        expect(rows.find(row => row.noteId === item.note.id).body).toBe(item.expected.summary);
      }
      expect(accesses).toEqual([]);
    } finally { service.destroy(); }
    expect(JSON.stringify(isolatedCases.map(item => item.note))).toBe(before);
  });

  it.each(cases.filter(item => item.variant === 'registry'))('$parameterKey: a pre-envelope legacy note uses exactly the same safe fallback as Notes', async item => {
    const note = { ...item.note, body: 'Kalkulator klirensu · ' + item.note.labResult.testKey + '\n\nKomentarz lekarza:\nFikcyjny komentarz historyczny ' + item.key + '.' };
    const before = JSON.stringify(note), model = root.ClcrNotesView.model(note, { patientId: PATIENT });
    const summary = root.ClcrNotesView.summary(note, { patientId: PATIENT });
    expectNotesPresentation(summary, model);
    const service = searchFor(root, [note]);
    try {
      const rows = await service.search(item.key);
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe(summary);
    } finally { service.destroy(); }
    expect(JSON.stringify(note)).toBe(before);
  });
});
