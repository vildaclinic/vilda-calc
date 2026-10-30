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
