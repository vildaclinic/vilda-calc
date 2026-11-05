import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { caCitSessionSource, patchCaCitSessionHooks } from '../../tools/patch-klirens-ca-cit-session.mjs';
import { patchCitDzmSessionHooks } from '../../tools/patch-klirens-cit-dzm-session.mjs';
import { patchOxDzmSessionHooks } from '../../tools/patch-klirens-ox-dzm-session.mjs';

const deployedSource = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');
const source = patchCaCitSessionHooks(deployedSource);
const clone = value => JSON.parse(JSON.stringify(value));

// Real Ca/Cit controls and the complete session runtime. Only document/storage
// are synthetic; session migration and capture use the shipped functions.
function runtime(initial = {}) {
  const document = atrapaDokumentu(), create = document.createElement;
  document.createElement = tag => {
    const node = create(tag); node.append = (...children) => children.forEach(child => node.appendChild(child));
    node.dispatchEvent = event => { for (const callback of node.sluchacze.get(event.type) || []) callback(event); return true; };
    return node;
  };
  document.querySelector = selector => document.documentElement.querySelector(selector);
  document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
  const form = document.createElement('form'); form.id = 'clcrForm'; document.body.appendChild(form);
  for (const [id, value] of Object.entries({ formulaPicker: 'Ca_Cit', age: '10', ageMonths: '0', ageDays: '', sex: 'F', weight: '30', height: '135',
    U_Ca: '99', U_Cit: '98', V24: '2000', Cl24DurationHours: '', Cl24DurationSource: '', ...initial })) {
    const input = document.createElement('input'); input.id = id; input.type = typeof value === 'boolean' ? 'checkbox' : 'text';
    if (input.type === 'checkbox') input.checked = value; else input.value = value;
    form.append(input);
  }
  const clearBtn = document.createElement('button'); clearBtn.id = 'clearBtn'; document.body.appendChild(clearBtn);
  const storage = new Map(), writes = [], timers = [];
  const window = { document, currentVersion: 'advanced', addEventListener() {},
    sessionStorage: { getItem: key => storage.get(key) ?? null,
      setItem(key, value) { writes.push([key, value]); storage.set(key, value); },
      removeItem(key) { writes.push([key, null]); storage.delete(key); } } };
  document.defaultView = window;
  const context = vm.createContext({ window, document,
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js', 'clcr_ca_cit_ui.js']) {
    vm.runInContext(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), context, { filename: file });
  }
  vm.runInContext(source, context, { filename: 'inline_kalkulator_klirens_07.js' });
  return { api: window, context, document, clearBtn, storage, writes, timers,
    field: id => document.getElementById(id), snapshot: () => clone(window.buildClcrSessionSnapshot()) };
}
function restore(session, initial) {
  const result = runtime(initial), before = clone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true })).toBe(true);
  expect(session).toEqual(before);
  return result;
}
function typedSnapshot(input) {
  const result = runtime(); result.context.syntheticInput = JSON.stringify(input);
  return clone(vm.runInContext('window.VildaClcrCaCit.evaluate(JSON.parse(syntheticInput), window.ClcrCaCitReferenceData.getProfile(window.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID)).snapshot', result.context));
}
function evaluateCurrent(result) {
  const engine = result.api.VildaClcrCaCit;
  return engine.evaluate(engine.readInputFromDocument(result.document, result.api.ClcrCaCitSession.readContext()), result.api.ClcrCaCitReferenceData.getProfile(result.api.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID));
}

describe('Ca/Cit — actual session capture, migration and patient isolation', () => {
  it('materializes independent controls and never takes raw aliases merely after menu selection', () => {
    const result = runtime(), inputs = result.snapshot().inputs;
    expect(inputs).toMatchObject({ CACIT_inputMode: 'concentration', CACIT_calcium: '', CACIT_calciumUnit: 'mmol/L',
      CACIT_citrate: '', CACIT_citrateUnit: 'mg/dL', CACIT_reportedValue: '', CACIT_reportedUnit: 'mg/mg',
      CACIT_sampleType: 'timed', CACIT_sampleSource: 'assumed-current' });
    expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({});
  });

  it.each(['0', '0.00000000000000001', '5.00000000000000001', '1e-12', '-1', 'invalid'])('preserves exact raw operand %s and explicit sample facts through two restores', value => {
    const input = { CACIT_inputMode: 'concentration', CACIT_calcium: value, CACIT_calciumUnit: 'mg/L', CACIT_citrate: '10,0000', CACIT_citrateUnit: 'µmol/L',
      CACIT_sameSpecimen: 'different', CACIT_collectionProblem: 'false', CACIT_collectionHours: '12.000', CACIT_durationKnown: 'true',
      CACIT_sampleType: 'spot', CACIT_sampleSource: 'captured', CACIT_durationSource: 'captured', age: '', sex: '' };
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: input });
    expect(result.snapshot().inputs).toMatchObject(input);
    expect(restore(result.snapshot()).snapshot().inputs).toMatchObject(input);
  });

  it('restores report mode and exact molar units from preserved input without filling preceding patient data', () => {
    const input = { formulaPicker: 'Ca_Cit', CACIT_inputMode: 'reported', CACIT_reportedValue: '0,000000000000001', CACIT_reportedUnit: 'mmol/mmol',
      CACIT_calcium: '', CACIT_citrate: '', age: '', ageMonths: '', ageDays: '', sex: '', weight: '', height: '' };
    const result = restore({ preservedInputs: input });
    expect(result.snapshot().inputs).toMatchObject(input);
    expect(result.field('age').value).toBe(''); expect(result.field('sex').value).toBe('');
  });

  it('migrates only actual legacy Ca_Cit operands and records their known acid label without arithmetic', () => {
    const input = { U_Ca: '2.000', U_Cit: '40.000', citrateSpotReportingEntity: 'citrate_ion' };
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: input });
    expect(result.snapshot().inputs).toMatchObject({ CACIT_inputMode: 'concentration', CACIT_calcium: '2.000', CACIT_calciumUnit: 'mmol/L',
      CACIT_citrate: '40.000', CACIT_citrateUnit: 'mg/dL', CACIT_reportingEntity: 'citric_acid',
      CACIT_sampleType: 'unknown', CACIT_sampleSource: 'historical-missing', CACIT_durationKnown: 'false', CACIT_durationSource: 'historical-missing',
      CACIT_collectionHours: '', U_Ca: '2.000', U_Cit: '40.000' });
    expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({ U_Ca: '2.000', U_Cit: '40.000' });
    result.field('formulaPicker').value = 'Ca_Cr'; expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({});
  });

  it.each(['Ca_Cr', 'Cit_mgkg', 'CaCr_spot', 'ACR'])('a restored %s cannot seed the independent Ca/Cit form or keep its previous sample facts', selectedFormula => {
    const result = restore({ selectedFormula, inputs: { U_Ca: '2', U_Cit: '40' } }, { CACIT_calcium: '7', CACIT_citrate: '8', CACIT_sampleType: 'spot' });
    expect(result.snapshot().inputs).toMatchObject(result.api.ClcrCaCitSession.DEFAULTS);
    expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({});
  });

  it.each([{}, { V24: '1500' }, { collectionStartAt: '2026-11-01T08:00', collectionEndAt: '2026-11-02T08:00' },
    { Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' }])('does not infer historical material or 24 hours from placement, volume or local dates: %j', context => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40', ...context } });
    expect(result.snapshot().inputs).toMatchObject({ CACIT_collectionHours: '', CACIT_durationKnown: 'false',
      CACIT_sampleType: 'unknown', CACIT_sampleSource: 'historical-missing' });
  });

  it('preserves captured short/incomplete collection and actual mismatch through a mode change', () => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40' },
      context: { sameUrineSample: false, sampleType: 'spot', sampleSource: 'captured', durationHours: '12', durationKnown: true, collectionProblem: true } });
    result.field('CACIT_inputMode').value = 'reported'; result.field('CACIT_reportedValue').value = '0.5';
    expect(result.snapshot().inputs).toMatchObject({ CACIT_sameSpecimen: 'false', CACIT_sampleType: 'spot', CACIT_collectionHours: '12',
      CACIT_durationKnown: 'true', CACIT_collectionProblem: 'true', CACIT_inputMode: 'reported', CACIT_reportedValue: '0.5' });
  });

  it('retains directly recorded legacy urine mismatch, an explicit clock without a source, and all incomplete protocol facts', () => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40', sameUrineSample: false,
      Cl24DurationHours: '12', ui_collectionStorageFollowed_answer: 'no' } });
    expect(result.snapshot().inputs).toMatchObject({ CACIT_sameSpecimen: 'false', CACIT_collectionProblem: 'true',
      CACIT_collectionHours: '12', CACIT_durationKnown: 'true', CACIT_durationSource: 'captured' });
  });

  it('retains captured typed snapshot context and respects explicit new blanks', () => {
    const context = { sampleType: 'spot', sampleSource: 'captured', collectionHours: '12', durationKnown: true, sameSpecimen: false };
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_calcium: '2', CACIT_citrate: '40', CACIT_sameSpecimen: '' },
      caCitSnapshot: { snapshot: { schema: 'clcr-ca-cit', version: 1, sourceFormula: 'Ca_Cit', context } } });
    expect(result.snapshot().inputs).toMatchObject({ CACIT_sameSpecimen: '', CACIT_sampleType: 'spot', CACIT_collectionHours: '12', CACIT_durationKnown: 'true' });
  });

  it('keeps exact material metadata, explicit false facts and legacy acid provenance portable to the live engine', () => {
    const context = { collectionHours: '12.000', sampleType: 'spot', sampleSource: 'captured', sameUrineSample: false,
      knownFacts: { collectionNoMissedVoids: false, fictionalMethodUncertain: null }, confounders: ['fictional recorded limitation'] };
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40' }, context });
    const fields = result.snapshot().inputs, carried = JSON.parse(fields.CACIT_sourceContext);
    expect(carried).toEqual({ version: 1, contexts: [context] });
    const patient = result.api.ClcrCaCitSession.readContext();
    expect(patient.knownFacts).toMatchObject({ collectionNoMissedVoids: false, fictionalMethodUncertain: null,
      legacyCitrateReportingBasis: 'citric-acid', importedMaterialContext: carried });
    expect(patient.confounders).toEqual(context.confounders);
    const second = restore(result.snapshot());
    expect(second.api.ClcrCaCitSession.readContext()).toEqual(patient);
    const input = second.api.VildaClcrCaCit.readInputFromDocument(second.document, second.api.ClcrCaCitSession.readContext());
    expect(input.knownFacts).toMatchObject(patient.knownFacts);
    const resultOnly = second.api.VildaClcrCaCit.evaluate(input, second.api.ClcrCaCitReferenceData.getProfile(second.api.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID));
    expect(resultOnly.valid).toBe(false); expect(resultOnly.reasonCode).toBe('different-specimens');
  });

  it('keeps a dormant module carrier, and combines newly recorded context with existing exact evidence once', () => {
    const previous = { version: 1, contexts: [{ knownFacts: { collectionNoMissedVoids: false } }] };
    const input = { CACIT_calcium: '2', CACIT_citrate: '40', CACIT_sourceContext: JSON.stringify(previous) };
    const dormant = restore({ selectedFormula: 'ACR', inputs: input });
    expect(JSON.parse(dormant.snapshot().inputs.CACIT_sourceContext)).toEqual(previous);
    const current = restore({ selectedFormula: 'Ca_Cit', inputs: input, context: { sampleType: 'spot', sampleSource: 'captured' } });
    const carried = JSON.parse(current.snapshot().inputs.CACIT_sourceContext);
    expect(carried.contexts).toEqual([...previous.contexts, { sampleType: 'spot', sampleSource: 'captured' }]);
    expect(JSON.parse(restore(current.snapshot()).snapshot().inputs.CACIT_sourceContext)).toEqual(carried);
  });

  it('retains independently confirmed report specimen context when the former paired concentrations differ', () => {
    const frozen = typedSnapshot({ mode: 'reported', reportedValue: '0.2', reportedUnit: 'mg/mg', ageYears: 10, sex: 'F',
      sameSpecimen: 'different', reportedSameSpecimen: 'confirmed', sampleType: 'timed', sampleSource: 'captured', durationKnown: true, collectionHours: '24' });
    expect(frozen.category).toBe('within');
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2', CACIT_reportedUnit: 'mg/mg', age: '10', sex: 'F' }, caCitSnapshot: frozen });
    expect(result.api.ClcrCaCitSession.readContext().reportedSameSpecimen).toBe('confirmed');
    expect(evaluateCurrent(result)).toMatchObject({ valid: true, category: 'within', context: { reportedSameSpecimen: 'confirmed' } });
    expect(evaluateCurrent(restore(result.snapshot()))).toMatchObject({ valid: true, category: 'within', context: { reportedSameSpecimen: 'confirmed' } });
  });

  it.each(['reportedSameSpecimen', 'CACIT_reportedSameSpecimen'])('retains explicit imported %s without a new control or question', key => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2', CACIT_reportedUnit: 'mg/mg',
      CACIT_sameSpecimen: 'different', CACIT_sampleType: 'timed', CACIT_sampleSource: 'captured', CACIT_durationKnown: 'true', CACIT_collectionHours: '24',
      age: '10', sex: 'F', [key]: 'confirmed' } });
    expect(evaluateCurrent(result)).toMatchObject({ valid: true, category: 'within', context: { reportedSameSpecimen: 'confirmed' } });
  });

  it.each([
    { ageYears: 10.5, ageYearsRaw: '10.5', ageExact: { numerator: '21', denominator: '2' } },
    { ageYears: 10, ageYearsRaw: '10', agePrecision: 'completed-years', ageInterval: { minimumAgeYearsInclusive: 10, maximumAgeYearsExclusive: 11 } },
  ])('uses recorded typed age and precision only for omitted patient fields: %j', age => {
    const frozen = typedSnapshot({ mode: 'reported', reportedValue: '0.2', reportedUnit: 'mg/mg', ...age, sex: 'F',
      sameSpecimen: 'confirmed', sampleType: 'timed', sampleSource: 'captured', durationKnown: true, collectionHours: '24' });
    expect(frozen.category).toBe('within');
    const session = { selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2', CACIT_reportedUnit: 'mg/mg' }, caCitSnapshot: frozen };
    const result = restore(session, { age: '17', sex: 'M' }), after = evaluateCurrent(result);
    expect(after).toMatchObject({ valid: true, category: 'within', context: { ...age, sex: 'F' } });
    expect(evaluateCurrent(restore(result.snapshot()))).toMatchObject({ valid: true, category: 'within', context: { ...age, sex: 'F' } });
    const explicit = restore({ ...session, inputs: { ...session.inputs, age: '', ageMonths: '', ageDays: '', sex: '' } });
    expect(evaluateCurrent(explicit)).toMatchObject({ valid: true, category: null, reasonCode: 'missing-age', context: { ageYears: null, sex: '' } });
    result.field('age').value = '13'; result.field('ageMonths').value = '0'; result.field('sex').value = 'M';
    result.field('age').dispatchEvent({ type: 'input', isTrusted: true }); result.field('sex').dispatchEvent({ type: 'input', isTrusted: true });
    expect(evaluateCurrent(result)).toMatchObject({ valid: true, category: 'within', context: { ageYears: 13, sex: 'M' }, reference: { upper: 0.8 } });
    result.field('age').value = ''; result.field('age').dispatchEvent({ type: 'input', isTrusted: true });
    expect(evaluateCurrent(result)).toMatchObject({ valid: true, category: null, reasonCode: 'missing-age', context: { ageYears: null, sex: 'M' } });
    expect(evaluateCurrent(restore(result.snapshot()))).toMatchObject({ valid: true, category: null, reasonCode: 'missing-age', context: { ageYears: null, sex: 'M' } });
  });

  it.each([
    ['collectionNoMissedVoids', true, false], ['collectionNoSpillage', true, false], ['collectionNoExtraVoids', true, false],
    ['collectionStartVoidDiscarded', true, false], ['collectionFinalVoidIncluded', true, false], ['collectionStorageFollowed', true, false],
    ['Cl24CollectionProblem', false, true], ['knownIncomplete', false, true],
  ])('keeps adverse %s from an incoming context despite an earlier favorable carrier fact', (key, prior, incoming) => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.2', CACIT_reportedUnit: 'mg/mg',
      CACIT_collectionProblem: '', CACIT_sampleType: 'timed', CACIT_sampleSource: 'captured', CACIT_durationKnown: 'true', CACIT_collectionHours: '24',
      age: '10', sex: 'F', CACIT_sourceContext: JSON.stringify({ version: 1, contexts: [{ knownFacts: { [key]: prior } }] }) },
      context: { knownFacts: { [key]: incoming } } });
    expect(result.api.ClcrCaCitSession.readContext().knownFacts[key]).toBe(incoming);
    expect(evaluateCurrent(result)).toMatchObject({ valid: true, category: null, reasonCode: 'collection-problem' });
    expect(evaluateCurrent(restore(result.snapshot()))).toMatchObject({ valid: true, category: null, reasonCode: 'collection-problem' });
  });

  it.each([['g/g', 'mg/mg'], ['mol/mol', 'mmol/mmol']])('normalizes equal ratio alias %s and preserves its provenance', (original, canonical) => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'direct', CACIT_reportedValue: '0.3', CACIT_reportedUnit: original } });
    expect(result.snapshot().inputs).toMatchObject({ CACIT_inputMode: 'reported', CACIT_reportedValue: '0.3',
      CACIT_reportedUnit: canonical, CACIT_reportedUnitOriginal: original });
  });

  it('read-only capture preserves raw values, original value vault and storage', () => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { CACIT_inputMode: 'reported', CACIT_reportedValue: '0', CACIT_reportedUnit: 'mg/mg' } });
    const vault = result.api.__vildaClcrVersionValueVault, beforeVault = clone(vault), storage = [...result.storage], raw = result.field('CACIT_reportedValue').value;
    const captured = result.api.VildaClcrSessionRuntime.captureCurrentSessionReadOnly();
    expect(captured.inputs.CACIT_reportedValue).toBe('0'); expect(result.field('CACIT_reportedValue').value).toBe(raw);
    expect(result.api.__vildaClcrVersionValueVault).toBe(vault); expect(vault).toEqual(beforeVault);
    expect([...result.storage]).toEqual(storage); expect(result.writes).toEqual([]);
  });

  it('clear keeps only patient context and removes previous aliases, material and time facts', () => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40', age: '10', sex: 'F' }, context: { collectionProblem: true } });
    result.document.dispatchEvent({ type: 'DOMContentLoaded' });
    result.clearBtn.dispatchEvent({ type: 'click', clcrClearedFormula: 'Ca_Cit', clcrPreservedCaCitContext: { age: '10', sex: 'F', CACIT_sampleType: 'spot', unsafe: 'discard' } });
    expect(result.snapshot().inputs).toMatchObject({ ...result.api.ClcrCaCitSession.DEFAULTS, age: '10', sex: 'F' });
    expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({});
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('CACIT_reportingEntity');
    expect(result.api.__vildaClcrVersionValueVault).not.toHaveProperty('unsafe');
    expect(result.api.ClcrCaCitSession.readContext()).toEqual({ knownFacts: {} });
  });

  it('a new patient without a renal session does not receive the preceding measurement', () => {
    const result = restore({ selectedFormula: 'Ca_Cit', inputs: { U_Ca: '2', U_Cit: '40' } });
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(result.snapshot().inputs).toMatchObject(result.api.ClcrCaCitSession.DEFAULTS);
    expect(result.api.ClcrCaCitSession.legacyAliasValues()).toEqual({});
  });

  it('rebuilds the additive source reproducibly and preserves already shipped adapter contracts', () => {
    expect(patchCaCitSessionHooks(source)).toBe(source);
    const without = source.replace(caCitSessionSource, '').replace('try{window.ClcrCaCitUi?.ensureControls?.(document)}catch{}', '');
    expect(patchCaCitSessionHooks(without)).toBe(source);
    expect(patchCitDzmSessionHooks(source)).toBe(source); expect(patchOxDzmSessionHooks(source)).toBe(source);
    expect(() => patchCaCitSessionHooks(without.replace('(function(){const b="vildaClcrSessionV1";', ''))).toThrow('Ambiguous Ca/Cit session integration anchor');
  });
});
