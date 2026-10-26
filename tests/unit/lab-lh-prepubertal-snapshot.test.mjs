import { describe, expect, it, vi } from 'vitest';
import engine from '../../vilda_lab_puberty.js';
import data from '../../vilda_lab_puberty_data.js';
import adapter from '../../vilda_lab_puberty_ui.js';
import snapshot from '../../vilda_lab_snapshot.js';
import renderer from '../../vilda_lab_assessment_ui.js';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const date = '2026-10-25';
const clone = value => JSON.parse(JSON.stringify(value));

function evaluate(raw = '0,4', { sex = 'M', stage = true, ...extra } = {}) {
  const input = adapter.buildInput({ sex, ageYears: '4', ageMonths: '',
    kind: stage ? sex === 'M' ? 'G' : 'Th' : 'unspecified', stage: stage ? '1' : '',
    pubertyAppliesToCurrentContext: true, currentContextAvailable: true,
    referenceSelection: 'automatic', contextBasis: 'current-patient', ...extra },
  { analyte: 'lh', raw, unit: 'IU/L' });
  return engine.evaluate(input, data);
}

describe('LH dzieci — opcjonalny zapis nowego odniesienia i historyczny odczyt', () => {
  it.each([['M', 'G'], ['F', 'Th']])('utrwala rzeczywistą ocenę %s/%s z własnym źródłem i komentarzem', (sex, kind) => {
    const evaluation = evaluate('0,4', { sex });
    expect(evaluation.prepubertalLh).toMatchObject({ status: 'available',
      comparison: { status: 'above' }, stageContext: { kind, stage: 1 } });
    const saved = snapshot.create(evaluation);
    expect(saved.status).toBe('recorded');
    expect(saved.evaluation).toEqual(evaluation);
    expect(saved.evaluation.prepubertalLh.range).toMatchObject({ method: null,
      bounds: { lower: null, censoredLower: null, upper: { operator: '<=', value: .3 } } });
    expect(snapshot.normalize(clone(saved))).toEqual(saved);
    const view = renderer.buildView(saved.evaluation, { historical: true });
    expect(view.valid).toBe(true);
    expect(JSON.stringify(view)).toContain('Możliwa aktywacja osi pokwitania');
    expect(JSON.stringify(saved)).not.toContain('currentContextAvailable');
    expect(JSON.stringify(saved)).not.toContain('observationProvided');
  });

  it.each(['0,3', '<0,3', '<0,4', '>0,3', '<LOD', '<LOQ', '', '-1'])('zachowuje operator i ówczesny komentarz dla %s', raw => {
    const evaluation = evaluate(raw);
    const saved = snapshot.create(evaluation);
    expect(saved.status).toBe('recorded');
    expect(saved.evaluation).toEqual(evaluation);
    expect(saved.evaluation.measurement.operator).toBe(evaluation.measurement.operator);
    expect(saved.evaluation.prepubertalLh.interpretation).toEqual(evaluation.prepubertalLh.interpretation);
    if (!evaluation.measurement.isExact) expect(saved.evaluation.measurement.plotValue).toBeNull();
  });

  it('odczytuje nowy zapis bez dzisiejszego silnika i nie dopisuje pola do starszej oceny', () => {
    const saved = snapshot.create(evaluate());
    const legacy = clone(saved);
    delete legacy.evaluation.prepubertalLh;
    const recalculate = vi.fn(() => { throw new Error('Historyczny wynik nie jest przeliczany'); });
    const browser = { VildaLabPuberty: { evaluate: recalculate },
      VildaHormoneLifespanReference: { evaluate: recalculate },
      VildaLabPubertyData: { prepubertalLhPolicy: { bounds: { upper: { value: 99 } } } } };
    loadBrowserScript('vilda_lab_snapshot.js', browser);
    const reader = browser.VildaLabSnapshot;
    expect(reader.normalize(clone(saved))).toEqual(saved);
    expect(reader.normalize(legacy)).toEqual(legacy);
    expect(Object.hasOwn(reader.normalize(legacy).evaluation, 'prepubertalLh')).toBe(false);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it('wiąże nową ocenę z wynikiem i unieważnia ją po edycji bez przeliczania', () => {
    const lab = { testKey: 'lh', test: 'LH', value: '0,4', valueNum: .4, unit: 'IU/L',
      norm: 'Górna granica: 0,3', assessment: snapshot.create(evaluate()) };
    const saved = snapshot.reconcile(null, lab, null, date);
    expect(saved.assessment.status).toBe('recorded');
    expect(snapshot.forSeries(saved, date).assessment).toEqual(saved.assessment);
    const changed = snapshot.reconcile(saved, { ...saved, value: '0,2', valueNum: .2 }, date, date);
    expect(changed.assessment.status).toBe('invalidated');
    expect(changed.assessment.evaluation.prepubertalLh).toEqual(saved.assessment.evaluation.prepubertalLh);
  });

  it('nie przechodzi do nieznanych rozszerzeń ani identyfikatorów pacjenta', () => {
    const evaluation = clone(evaluate());
    const extension = Object.create(null);
    Object.defineProperty(extension, 'patientId', { get() { throw new Error('Nie czytaj rozszerzenia'); } });
    evaluation.prepubertalLh.extension = extension;
    evaluation.prepubertalLh.patientId = 'fictional-private-person';
    const saved = snapshot.create(evaluation);
    expect(saved.status).toBe('recorded');
    expect(saved.evaluation.prepubertalLh).not.toHaveProperty('patientId');
    expect(saved.evaluation.prepubertalLh).not.toHaveProperty('extension');
  });

  it.each([
    block => { block.assayMatched = true; },
    block => { block.range.method = { id: 'unconfirmed-method' }; },
    block => { block.range.bounds.lower = { operator: '>=', value: 0 }; },
    block => { block.range.bounds.upper.value = -1; },
    block => { block.range.sourceId = 'different-source'; },
    block => { block.range.sex = 'F'; },
    block => { block.interpretation.text = '<img src=x onerror=alert(1)>'; },
  ])('odrzuca uszkodzony lub fałszywie potwierdzony blok', mutate => {
    const saved = clone(snapshot.create(evaluate()));
    mutate(saved.evaluation.prepubertalLh);
    expect(snapshot.normalize(saved).status).toBe('unavailable');
  });
});
