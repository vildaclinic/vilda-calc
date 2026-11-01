import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function api() {
  const win = {}; loadBrowserScript('clcr_collection_duration.js', win);
  return win.ClcrCollectionDuration;
}

describe('shared duration — potassium-only adapter', () => {
  it('uses dedicated potassium controls and requires only a reported daily value in the second mode', () => {
    const duration = api();
    expect(duration.resolveFormulaFields('K_mmol_d')).toMatchObject({ fieldId: 'K_collectionHours', sourceId: 'K_collectionSource', modeId: 'K_inputMode' });
    expect(duration.requiredFields('K_mmol_d')).toEqual(['K_concentration', 'K_volume', 'K_collectionHours']);
    expect(duration.requiredFields('K_mmol_d', { K_inputMode: 'reported' })).toEqual(['K_reportedValue']);
    expect(duration.resolveFormulaFields('FEK_spot')).toBeNull();
    expect(duration.requiredFields('ACR')).toBeNull();
  });

  it('captures a new potassium blank as24h in a copy without touching other calculators', () => {
    const duration = api(), input = { K_collectionHours: '', K_collectionSource: 'assumed-24h', U_K: '20', Prot_collectionHours: '12', Prot_collectionSource: 'hours' };
    const before = structuredClone(input), normalized = duration.normalizeCapturedInputs(input);
    expect(input).toEqual(before);
    expect(normalized).toMatchObject({ K_collectionHours: '24', K_collectionSource: 'assumed-24h', K_durationNeedsConfirmation: false,
      U_K: '20', Prot_collectionHours: '12', Prot_collectionSource: 'hours' });
    expect(duration.fromValues(normalized, {}, duration.resolveFormulaFields('K_mmol_d'))).toMatchObject({ valid: true, hours: 24, assumed: true });
  });

  it.each([
    ['', 'historical-missing', true], ['0', 'hours', false], ['-12', 'hours', false], ['invalid', 'hours', false], ['', 'invalid', false], ['24', 'invalid', false],
  ])('does not replace known potassium clock evidence %j/%s with an assumed day', (hours, source, confirmation) => {
    const duration = api(), input = { K_collectionHours: hours, K_collectionSource: source, K_durationNeedsConfirmation: confirmation };
    expect(duration.normalizeCapturedInputs(input)).toEqual(input);
    expect(duration.fromValues(input, {}, duration.resolveFormulaFields('K_mmol_d')).valid).toBe(false);
  });

  it('keeps an explicit invalid source invalid through default mounting and capture', () => {
    const fields = { K_collectionHours: { id: 'K_collectionHours', value: '', addEventListener() {} },
      K_collectionSource: { id: 'K_collectionSource', value: 'invalid' }, K_durationNeedsConfirmation: { id: 'K_durationNeedsConfirmation', value: 'false' } };
    const document = { getElementById: id => fields[id] || null };
    for (const control of Object.values(fields)) control.ownerDocument = document;
    const duration = api(); duration.ensureDefaults(document);
    expect(fields.K_collectionHours.value).toBe('');
    expect(fields.K_collectionSource.value).toBe('invalid');
    expect(duration.readFromDocument(document, duration.resolveFormulaFields('K_mmol_d'))).toMatchObject({ valid: false, invalid: true, missing: false, source: 'invalid' });
  });

  it('known incomplete collection remains invalid for either input mode', () => {
    const duration = api(), input = { K_collectionHours: '24', K_collectionSource: 'assumed-24h', ui_collectionNoMissedVoids_answer: 'no' };
    const result = duration.fromValues(input, {}, duration.resolveFormulaFields('K_mmol_d'));
    expect(result).toMatchObject({ valid: true, complete: false, knownProblems: ['collectionNoMissedVoids'] });
  });

  it.each(['', 'unknown', 'hours', 'captured', 'historical-missing', 'invalid'])('captures blank clock with source %j without assuming a new day', source => {
    const duration = api(), values = { K_collectionHours: '', K_collectionSource: source, K_durationNeedsConfirmation: 'false' };
    const before = structuredClone(values), result = duration.normalizeCapturedInputs(values);
    expect(result).toEqual(before);
    expect(values).toEqual(before);
    expect(duration.fromValues(values, {}, duration.resolveFormulaFields('K_mmol_d')).valid).toBe(false);
  });

  it('leaves a focused new blank editor and the value vault untouched until blur', () => {
    const listeners = {}, vault = { unrelatedMeasurement: 'retained' };
    const fields = { K_collectionHours: { id: 'K_collectionHours', value: '', addEventListener(type, listener) { listeners[type] = listener; }, dispatchEvent() {} },
      K_collectionSource: { id: 'K_collectionSource', value: 'assumed-24h' }, K_durationNeedsConfirmation: { id: 'K_durationNeedsConfirmation', value: 'false' } };
    const document = { defaultView: { __vildaClcrVersionValueVault: vault }, activeElement: fields.K_collectionHours, getElementById: id => fields[id] || null };
    for (const field of Object.values(fields)) field.ownerDocument = document;
    const duration = api(); duration.ensureDefaults(document);
    expect(fields.K_collectionHours.value).toBe('');
    expect(vault).toEqual({ unrelatedMeasurement: 'retained' });
    expect(duration.readFromDocument(document, duration.resolveFormulaFields('K_mmol_d'))).toMatchObject({ valid: true, hours: 24, assumed: true });
    listeners.blur();
    expect(fields.K_collectionHours.value).toBe('24');
    expect(fields.K_collectionSource.value).toBe('assumed-24h');
    expect(vault).toEqual({ unrelatedMeasurement: 'retained' });
  });

  it.each([['24', 'assumed-24h', false, true], ['12', 'hours', false, false], ['', 'hours', false, false], ['', 'historical-missing', true, false]])('clearing live %j/%s clock preserves its new or historical meaning', (hours, source, confirmation, assumed) => {
    const listeners = {}, fields = { K_collectionHours: { id: 'K_collectionHours', value: hours, addEventListener(type, listener) { listeners[type] = listener; } },
      K_collectionSource: { id: 'K_collectionSource', value: source }, K_durationNeedsConfirmation: { id: 'K_durationNeedsConfirmation', value: String(confirmation) } };
    const vault = {}, document = { defaultView: { __vildaClcrVersionValueVault: vault }, getElementById: id => fields[id] || null };
    for (const field of Object.values(fields)) field.ownerDocument = document;
    const duration = api(); duration.bindControl(fields.K_collectionHours);
    fields.K_collectionHours.value = ''; listeners.input({ isTrusted: true });
    const read = duration.readFromDocument(document, duration.resolveFormulaFields('K_mmol_d'));
    expect(read.valid).toBe(assumed);
    expect(read.assumed).toBe(assumed);
    expect(fields.K_collectionHours.value).toBe('');
    expect(vault).toEqual({});
  });
});

describe('potassium live document reader — shared new-collection default', () => {
  function setup(patch = {}, { shared = true, omit = [] } = {}) {
    const win = { __vildaClcrVersionValueVault: { unrelatedMeasurement: 'unchanged' } };
    for (const file of [...(shared ? ['clcr_collection_duration.js'] : []), 'clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js']) loadBrowserScript(file, win);
    const values = { K_inputMode: 'concentration', K_concentration: '50', K_volume: '1440', K_volumeUnit: 'mL',
      K_collectionHours: '', K_collectionSource: 'assumed-24h', K_durationNeedsConfirmation: 'false', ...patch };
    const fields = Object.fromEntries(Object.entries(values).filter(([id]) => !omit.includes(id)).map(([id, value]) =>
      [id, { id, type: typeof value === 'boolean' ? 'checkbox' : 'text', value, checked: value === true }]));
    const document = { defaultView: win, getElementById: id => fields[id] || null };
    const capture = () => ({ controls: structuredClone(fields), vault: structuredClone(win.__vildaClcrVersionValueVault) });
    return { win, document, capture, engine: win.VildaClcrPotassiumDzm, policy: win.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY };
  }

  it('computes through a blank new clock while preserving raw controls and the value vault', () => {
    const { win, document, capture, engine, policy } = setup();
    const before = capture();
    expect(win.ClcrCollectionDuration.readFromDocument(document, { fieldId: 'K_collectionHours', sourceId: 'K_collectionSource' }))
      .toMatchObject({ valid: true, assumed: true, hours: 24 });
    const input = engine.readInputFromDocument(document);
    expect(input).toMatchObject({ hours: '24', durationSource: 'assumed-24h', durationNeedsConfirmation: false });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: true, rawValue: 72, hours: 24 });
    expect(capture()).toEqual(before);
    // The pure historical adapter must retain its original evidence contract.
    expect(engine.evaluate(engine.inputFromValues({ K_concentration: '50', K_volume: '1440', K_collectionSource: 'assumed-24h' }), policy))
      .toMatchObject({ valid: false, errorCode: 'missing-hours' });
  });

  it.each(['', 'unknown', 'hours', 'captured', 'historical-missing', 'invalid'])('does not infer a day from unknown or non-default source %j', source => {
    const { document, capture, engine, policy } = setup({ K_collectionSource: source });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe('');
    expect(engine.evaluate(input, policy).valid).toBe(false);
    expect(capture()).toEqual(before);
  });

  it.each([true, 'true'])('preserves unresolved historical confirmation %j even with default provenance', flag => {
    const { document, capture, engine, policy } = setup({ K_durationNeedsConfirmation: flag });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input).toMatchObject({ hours: '', durationSource: 'historical-missing', durationNeedsConfirmation: true });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, errorCode: 'missing-hours' });
    expect(capture()).toEqual(before);
  });

  it.each(['0', '-12', 'invalid', '1e-400', '0.000000000001', '1e1'])('preserves explicit clock bytes %s and the actual engine decision', hours => {
    const { document, capture, engine, policy } = setup({ K_collectionHours: hours });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe(hours);
    const expected = engine.evaluate(engine.inputFromValues({ K_inputMode: 'concentration', K_concentration: '50',
      K_volume: '1440', K_volumeUnit: 'mL', K_collectionHours: hours, K_collectionSource: 'assumed-24h' }), policy);
    expect(engine.evaluate(input, policy)).toEqual(expected);
    expect(capture()).toEqual(before);
  });

  it.each([
    { shared: false, omit: [] },
    { shared: true, omit: ['K_collectionHours'] },
  ])('does not manufacture a duration without the shared qualifier or its control %j', options => {
    const { document, capture, engine, policy } = setup({}, options);
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe('');
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, errorCode: 'missing-hours' });
    expect(capture()).toEqual(before);
  });

  it('keeps known collection problems blocking after qualifying the new clock', () => {
    const { document, capture, engine, policy } = setup({ ui_collectionNoMissedVoids_answer: 'no' });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe('24');
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, blocked: true });
    expect(capture()).toEqual(before);
  });
});
