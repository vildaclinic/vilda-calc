import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_inhibin_b_data.js', 'vilda_lab_inhibin_b.js', 'vilda_lab_puberty_ui.js']) loadBrowserScript(file, browser);
const ui = browser.VildaLabPubertyUI;
const measurement = { analyte: 'inhibin_b', raw: '350', unit: 'pg/mL' };
const fields = { referenceSelection: 'automatic', contextBasis: 'current-patient', sex: 'M', ageYears: '0', ageMonths: '3', preterm: 'no' };
const input = (extra = {}, value = measurement) => ui.buildInput({ ...fields, ...extra }, value);
const evaluate = (extra = {}, value = measurement) => browser.VildaLabInhibinB.evaluate(input(extra, value), browser.VildaLabInhibinBData);

// These tests execute the production form serializer, its actual engine and the
// page's dispatch. The browser suite covers visibility, source imports and pins.
describe('Inhibina B — bieżący formularz i rzeczywisty silnik', () => {
  it('nie zamienia trzech miesięcy w dokładne 90 dni ani nie ustala metody', () => {
    const result = evaluate();
    expect(result.input.age).toMatchObject({ years: 0, months: 3, days: null, precision: 'month' });
    expect(result.input).not.toHaveProperty('neonatalAge');
    expect(result.input).toMatchObject({ specimen: 'unknown', measurementKind: 'unknown', assay: { confirmation: 'unknown' }, treatment: { context: 'unknown' } });
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants.map(item => item.comparison.range.bounds.upper.value)).toEqual([631, 662]);
    expect(result.biochemical.primary).toBeNull();
  });

  it('wykorzystuje znane PNA, zachowując niepewność dat i bez daty historycznej', () => {
    const neonatalAge = { postnatalDays: { lower: 89, upper: 90, source: 'main-calendar-dates' }, gestationalDays: { lower: 280, upper: 280, source: 'patient-record' } };
    const result = evaluate({ neonatalAge, useNeonatalAge: true, birthDate: '2026-03-19' });
    expect(result.input.age).toBeNull();
    expect(result.input.neonatalAge).toEqual(neonatalAge);
    expect(result.input.birthDateISO).toBeNull();
    expect(result.input.sampleDateISO).toBeNull();
    expect(result.referencePreview.byAge).toMatchObject({ status: 'within', range: { bounds: { lower: { value: 229 }, upper: { value: 631 } } } });
    expect(fields).toMatchObject({ ageYears: '0', ageMonths: '3' });
  });

  it('jawne Nie przy braku GA dopuszcza tylko porównanie orientacyjne', () => {
    const result = evaluate({ useNeonatalAge: true, neonatalAge: { postnatalDays: ui.parsePostnatalDays('90') } });
    expect(result.referencePreview.byAge.status).toBe('within');
    expect(result.referenceSelection.reasonCodes).toContain('term_birth_unconfirmed');
    expect(result.input.neonatalAge.gestationalDays).toBeNull();
    expect(result.biochemical.primary).toBeNull();
  });

  it.each(['yes', 'unknown'])('wcześniactwo %s nie uruchamia zakresu donoszonych', preterm => {
    const result = evaluate({ preterm, useNeonatalAge: true, neonatalAge: { postnatalDays: ui.parsePostnatalDays('90') } });
    expect(result.referenceSelection.status).toBe('unavailable');
    expect(result).not.toHaveProperty('referencePreview');
  });

  it('nie kasuje obserwacji G3 podczas używania analitu bez norm stadium', () => {
    const result = evaluate({ ageYears: '12', ageMonths: '0', kind: 'G', stage: '3', preterm: 'yes' });
    expect(result.input.puberty).toMatchObject({ kind: 'G', stage: 3, appliesToCurrentContext: true });
    expect(result.referencePreview.byStage.status).toBe('unavailable');
    expect(result.referencePreview.byAge.status).not.toBe('unavailable');
    expect(result.clinical.code).toBe('reference_comparison_only');
  });

  it.each(['pg/mL', 'ng/L'])('zachowuje operator w jednostce %s bez punktu liczbowego', unit => {
    const result = evaluate({ ageYears: '90', ageMonths: '0' }, { ...measurement, raw: '<LOD', unit });
    expect(result.measurement).toMatchObject({ status: 'valid', raw: '<LOD', isExact: false, plotValue: null });
    expect(result.input.unit).toBe(unit);
    expect(result.referenceSelection.status).toBe('selected');
  });

  it.each([['follicular', 2], ['luteal', 2], ['unknown', 6]])('F45: wybór %s daje %s oddzielnych wariantów', (reproductiveContext, count) => {
    const result = evaluate({ sex: 'F', ageYears: '45', ageMonths: '0', reproductiveContext });
    expect(result.referencePreview.variants).toHaveLength(count);
    expect(result.biochemical.primary).toBeNull();
  });
});

const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
function between(start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  if (from < 0 || to <= from) throw new Error(`Missing production function ${start}`);
  return html.slice(from, to);
}
const route = between('    function isPubertySubstance(substance) {', '    function readPubertyPatientContext() {');
const makeRender = new Function('pubertyUI', 'valueEl', 'unitEl', 'unitTargetEl', 'showError', 'updateStepStates', `${route}\n${between('    function renderResults(substance) {', '    function renderNotesBody(container, body) {')}\nreturn renderResults;`);
const makeSteps = new Function('currentSubstance', 'valueEl', 'unitEl', 'Conv', 'window', 'stepNums', `var step3HintEl = null, step4DefaultHintEl = null; ${route}\n${between('    function updateStepStates() {', '    function substance_label_for_target() {')}\nreturn updateStepStates;`);

describe('Inhibina B — routing w produkcyjnym HTML', () => {
  it('kieruje do wspólnego formularza i nie korzysta z dawnej normy przelicznika', () => {
    const render = vi.fn(() => ({ measurement: { status: 'valid' } }));
    const error = vi.fn(), steps = vi.fn();
    makeRender({ render }, { value: '<LOD' }, { value: 'pg/mL' }, { value: 'ng/L' }, error, steps)({ id: 'inhibin_b' });
    expect(render).toHaveBeenCalledExactlyOnceWith({ raw: '<LOD', unit: 'pg/mL', targetUnit: 'ng/L' });
    expect(error).toHaveBeenCalledExactlyOnceWith('');
    expect(steps).toHaveBeenCalledOnce();
  });

  it.each(['lh', 'fsh', 'inhibin_b'])('%s używa właściwego parsera zamiast zamieniać <LOD na NaN', id => {
    const steps = Object.fromEntries([1, 2, 3, 4, 5].map(i => [`step${i}`, { textContent: '', classList: { add() {}, remove() {} } }]));
    const lh = { parseMeasurement: vi.fn(() => ({ status: 'valid' })) }, inhibin = { parseMeasurement: vi.fn(() => ({ status: 'valid' })) };
    const unit = id === 'inhibin_b' ? 'pg/mL' : 'IU/L';
    makeSteps({ id }, { value: '<LOD' }, { value: unit }, { parseNumber: Number }, { VildaLabPuberty: lh, VildaLabInhibinB: inhibin }, steps)();
    expect((id === 'inhibin_b' ? inhibin : lh).parseMeasurement).toHaveBeenCalledExactlyOnceWith('<LOD', unit);
    expect((id === 'inhibin_b' ? lh : inhibin).parseMeasurement).not.toHaveBeenCalled();
    expect(steps.step2.textContent).toBe('✓');
    expect(steps.step5.textContent).toBe('✓');
  });
});
