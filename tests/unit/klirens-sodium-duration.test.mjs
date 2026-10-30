import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function api() {
  const win = {}; loadBrowserScript('clcr_collection_duration.js', win);
  return win.ClcrCollectionDuration;
}

describe('shared duration — sodium-only adapter', () => {
  it('uses dedicated sodium controls and requires only a reported daily value in the second mode', () => {
    const duration = api();
    expect(duration.resolveFormulaFields('Na_mmol_d')).toMatchObject({ fieldId: 'Na_collectionHours', sourceId: 'Na_collectionSource', modeId: 'Na_inputMode' });
    expect(duration.requiredFields('Na_mmol_d')).toEqual(['Na_concentration', 'Na_volume', 'Na_collectionHours']);
    expect(duration.requiredFields('Na_mmol_d', { Na_inputMode: 'reported' })).toEqual(['Na_reportedValue']);
    expect(duration.resolveFormulaFields('FENa_spot')).toBeNull();
    expect(duration.requiredFields('K_mmol_d')).toBeNull();
  });

  it('captures a new sodium blank as24h in a copy without touching other calculators', () => {
    const duration = api(), input = { Na_collectionHours: '', Na_collectionSource: 'assumed-24h', U_Na: '20', Prot_collectionHours: '12', Prot_collectionSource: 'hours' };
    const before = structuredClone(input), normalized = duration.normalizeCapturedInputs(input);
    expect(input).toEqual(before);
    expect(normalized).toMatchObject({ Na_collectionHours: '24', Na_collectionSource: 'assumed-24h', Na_durationNeedsConfirmation: false,
      U_Na: '20', Prot_collectionHours: '12', Prot_collectionSource: 'hours' });
    expect(duration.fromValues(normalized, {}, duration.resolveFormulaFields('Na_mmol_d'))).toMatchObject({ valid: true, hours: 24, assumed: true });
  });

  it.each([
    ['', 'historical-missing', true], ['0', 'hours', false], ['-12', 'hours', false], ['invalid', 'hours', false], ['', 'invalid', false], ['24', 'invalid', false],
  ])('does not replace known sodium clock evidence %j/%s with an assumed day', (hours, source, confirmation) => {
    const duration = api(), input = { Na_collectionHours: hours, Na_collectionSource: source, Na_durationNeedsConfirmation: confirmation };
    expect(duration.normalizeCapturedInputs(input)).toEqual(input);
    expect(duration.fromValues(input, {}, duration.resolveFormulaFields('Na_mmol_d')).valid).toBe(false);
  });

  it('keeps an explicit invalid source invalid through default mounting and capture', () => {
    const fields = { Na_collectionHours: { id: 'Na_collectionHours', value: '', addEventListener() {} },
      Na_collectionSource: { id: 'Na_collectionSource', value: 'invalid' }, Na_durationNeedsConfirmation: { id: 'Na_durationNeedsConfirmation', value: 'false' } };
    const document = { getElementById: id => fields[id] || null };
    for (const control of Object.values(fields)) control.ownerDocument = document;
    const duration = api(); duration.ensureDefaults(document);
    expect(fields.Na_collectionHours.value).toBe('');
    expect(fields.Na_collectionSource.value).toBe('invalid');
    expect(duration.readFromDocument(document, duration.resolveFormulaFields('Na_mmol_d'))).toMatchObject({ valid: false, invalid: true, missing: false, source: 'invalid' });
  });

  it('known incomplete collection remains invalid for either input mode', () => {
    const duration = api(), input = { Na_collectionHours: '24', Na_collectionSource: 'assumed-24h', ui_collectionNoMissedVoids_answer: 'no' };
    const result = duration.fromValues(input, {}, duration.resolveFormulaFields('Na_mmol_d'));
    expect(result).toMatchObject({ valid: true, complete: false, knownProblems: ['collectionNoMissedVoids'] });
  });
});

describe('sodium live document reader — shared new-collection default', () => {
  function setup(patch = {}, { shared = true, omit = [] } = {}) {
    const win = { __vildaClcrVersionValueVault: { unrelatedMeasurement: 'unchanged' } };
    for (const file of [...(shared ? ['clcr_collection_duration.js'] : []), 'clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js']) loadBrowserScript(file, win);
    const values = { Na_inputMode: 'concentration', Na_concentration: '50', Na_volume: '1440', Na_volumeUnit: 'mL',
      Na_collectionHours: '', Na_collectionSource: 'assumed-24h', Na_durationNeedsConfirmation: 'false', ...patch };
    const fields = Object.fromEntries(Object.entries(values).filter(([id]) => !omit.includes(id)).map(([id, value]) =>
      [id, { id, type: typeof value === 'boolean' ? 'checkbox' : 'text', value, checked: value === true }]));
    const document = { defaultView: win, getElementById: id => fields[id] || null };
    const capture = () => ({ controls: structuredClone(fields), vault: structuredClone(win.__vildaClcrVersionValueVault) });
    return { win, document, capture, engine: win.VildaClcrSodiumDzm, policy: win.ClcrSodiumDzmReferenceData.DEFAULT_POLICY };
  }

  it('computes through a blank new clock while preserving raw controls and the value vault', () => {
    const { win, document, capture, engine, policy } = setup();
    const before = capture();
    expect(win.ClcrCollectionDuration.readFromDocument(document, { fieldId: 'Na_collectionHours', sourceId: 'Na_collectionSource' }))
      .toMatchObject({ valid: true, assumed: true, hours: 24 });
    const input = engine.readInputFromDocument(document);
    expect(input).toMatchObject({ hours: '24', durationSource: 'assumed-24h', durationNeedsConfirmation: false });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: true, rawValue: 72, hours: 24 });
    expect(capture()).toEqual(before);
    // The pure historical adapter must retain its original evidence contract.
    expect(engine.evaluate(engine.inputFromValues({ Na_concentration: '50', Na_volume: '1440', Na_collectionSource: 'assumed-24h' }), policy))
      .toMatchObject({ valid: false, errorCode: 'missing-hours' });
  });

  it.each(['', 'unknown', 'hours', 'captured', 'historical-missing', 'invalid'])('does not infer a day from unknown or non-default source %j', source => {
    const { document, capture, engine, policy } = setup({ Na_collectionSource: source });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe('');
    expect(engine.evaluate(input, policy).valid).toBe(false);
    expect(capture()).toEqual(before);
  });

  it.each([true, 'true'])('preserves unresolved historical confirmation %j even with default provenance', flag => {
    const { document, capture, engine, policy } = setup({ Na_durationNeedsConfirmation: flag });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input).toMatchObject({ hours: '', durationSource: 'historical-missing', durationNeedsConfirmation: true });
    expect(engine.evaluate(input, policy)).toMatchObject({ valid: false, errorCode: 'missing-hours' });
    expect(capture()).toEqual(before);
  });

  it.each(['0', '-12', 'invalid', '1e-400', '0.000000000001', '1e1'])('preserves explicit clock bytes %s and the actual engine decision', hours => {
    const { document, capture, engine, policy } = setup({ Na_collectionHours: hours });
    const before = capture(), input = engine.readInputFromDocument(document);
    expect(input.hours).toBe(hours);
    const expected = engine.evaluate(engine.inputFromValues({ Na_inputMode: 'concentration', Na_concentration: '50',
      Na_volume: '1440', Na_volumeUnit: 'mL', Na_collectionHours: hours, Na_collectionSource: 'assumed-24h' }), policy);
    expect(engine.evaluate(input, policy)).toEqual(expected);
    expect(capture()).toEqual(before);
  });

  it.each([
    { shared: false, omit: [] },
    { shared: true, omit: ['Na_collectionHours'] },
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
