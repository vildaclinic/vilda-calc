import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

function harness() {
  const w = {};
  for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js', 'clcr_stone_safety.js', 'clcr_measured_clearance_reference_data.js', 'clcr_measured_clearance_reference.js', 'clcr_saved_results.js', 'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js', 'clcr_ua_reference_data.js', 'clcr_ua.js', 'clcr_ua_persistence.js', 'clcr_saved_legacy_calculator.js']) loadBrowserScript(file, w);
  return w;
}
const specimen = { age: '45', sex: 'F', weight: '60', height: '165', V24: '1500', U_Na: '50', U_K: '20', U_PO4: '50', U_Prot: '240', U_Ox: '5', U_Cit: '5', pH24: '5.5' };
function controls() {
  const fields = {}, emitted = [];
  const doc = { getElementById: id => fields[id] || null, defaultView: { Event: class { constructor(type, options) { this.type = type; this.bubbles = options?.bubbles; this.isTrusted = false; } } } };
  function add(id, value) {
    const listeners = {};
    function deliver(event) {
      for (const capture of [true, false]) for (const listener of listeners[event.type] || []) {
        if (listener.capture === capture) listener.callback(event);
      }
    }
    const control = { id, value, ownerDocument: doc, addEventListener(type, callback, options) { (listeners[type] ||= []).push({ callback, capture: options === true || options?.capture === true }); }, dispatchEvent(event) { emitted.push({ id, type: event.type, bubbles: event.bubbles }); deliver(event); }, emit(type, trusted = true) { deliver({ type, isTrusted: trusted }); } };
    fields[id] = control; return control;
  }
  return { fields, emitted, doc, add };
}
function mountedDurationView(initialSource = 'assumed-24h', initialHours = '24', needsConfirmation = false) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  doc.createElement = name => {
    const node = createElement(name);
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.prepend = (...nodes) => nodes.slice().reverse().forEach(child => node.insertBefore(child, node.firstChild));
    node.dispatchEvent = event => {
      for (let target = node; target; target = event.bubbles ? target.parentNode : null) {
        for (const callback of target.sluchacze.get(event.type) || []) callback(event);
      }
    };
    return node;
  };
  doc.createComment = () => doc.createElement('comment');
  doc.defaultView = { __vildaClcrVersionValueVault: { durationNeedsConfirmation: needsConfirmation }, Event: class { constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles; this.isTrusted = false; } } };
  const container = doc.createElement('div'), wrapper = doc.createElement('label'), hours = doc.createElement('input'), source = doc.createElement('input');
  hours.id = 'Cl24DurationHours'; hours.value = initialHours;
  source.id = 'Cl24DurationSource'; source.value = initialSource;
  wrapper.append(hours); container.append(wrapper, source); doc.body.appendChild(container);
  const w = { document: doc }; loadBrowserScript('clcr_collection_duration.js', w);
  const api = w.ClcrCollectionDuration;
  const render = () => api.syncDurationView(doc, { active: true, fieldViews: new Map([[hours.id, { control: hours, wrapper }]]) });
  api.ensureDefaults(doc); render();
  const host = doc.getElementById('clcrCommonDuration'), editor = doc.getElementById('clcrCommonDurationEditor');
  return { doc, api, hours, source, wrapper, host, editor, render,
    summary: host.querySelector('strong'), button: host.querySelector('button'),
    change(value) { hours.value = value; hours.dispatchEvent({ type: 'input', isTrusted: true }); },
  };
}

describe('Shared DZM numeric duration — new collections versus historical edits', () => {
  it.each([undefined, null, '', '   '])('new blank %s really resolves to assumed24h', value => {
    const api = harness().ClcrCollectionDuration;
    expect(api.resolveHours(value)).toMatchObject({ valid: true, hours: 24, minutes: 1440, source: 'assumed-24h', assumed: true, missing: false, invalid: false });
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e309', '1e-9999', '1e', '0x18', '1,2.3', false, {}, []])('does not conceal invalid explicit duration %j', value => {
    expect(harness().ClcrCollectionDuration.resolveHours(value)).toMatchObject({ valid: false, invalid: true, hours: null, minutes: null });
  });
  it.each([['12', 12], ['23,5', 23.5], ['24', 24], ['.5', 0.5], ['+12', 12], ['1e1', 10], ['1,2e1', 12], ['1E+1', 10]])('keeps explicit %s hours', (value, expected) => {
    expect(harness().ClcrCollectionDuration.fromValues({ Cl24DurationHours: value, Cl24DurationSource: 'hours' })).toMatchObject({ valid: true, hours: expected, source: 'hours', assumed: false });
  });
  it('does not describe an explicit12h input with stale assumed24 provenance as assumed', () => {
    expect(harness().ClcrCollectionDuration.fromValues({ Cl24DurationHours: '12', Cl24DurationSource: 'assumed-24h' })).toMatchObject({ hours: 12, source: 'hours', assumed: false });
  });
  it('never reparses old dates or guesses a historical duration', () => {
    const api = harness().ClcrCollectionDuration;
    const dates = { collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' };
    expect(api.fromValues(dates, {}, { historical: true })).toMatchObject({ valid: false, missing: true, source: 'historical-missing' });
    expect(api.fromValues(dates, { collectionAnalysis: { durationMinutes: 750 } }, { historical: true })).toMatchObject({ valid: true, hours: 12.5, minutes: 750, source: 'captured' });
    expect(api.fromValues({ ...dates, Cl24DurationHours: '' }, { durationMinutes: 720 }, { historical: true })).toMatchObject({ valid: true, hours: 12, source: 'captured' });
    expect(api.fromValues({ ...dates, Cl24DurationHours: '', Cl24DurationSource: 'captured' }, { durationMinutes: 720 }, { historical: true })).toMatchObject({ valid: false, missing: true });
    expect(api.fromValues({ ...dates, Cl24DurationHours: '0' }, { durationMinutes: 720 }, { historical: true })).toMatchObject({ valid: false, invalid: true });
    expect(api.fromValues({ Cl24DurationHours: '' }, { durationMinutes: 720 })).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h' });
    expect(api.fromValues({ ...dates, Cl24DurationHours: '23.5', Cl24DurationSource: 'historical-missing' }, {}, { historical: true })).toMatchObject({ valid: true, hours: 23.5, source: 'hours' });
  });
  it('assumes completeness without falsely confirming six checkbox facts', () => {
    const api = harness().ClcrCollectionDuration, values = Object.fromEntries(api.PROTOCOL_IDS.map(id => [id, false]));
    const result = api.fromValues(values);
    expect(result.complete).toBe(true);
    expect(result.knownProblems).toEqual([]);
    expect(result.collectionAssumptions.collectionCompleteness).toBe('assumed');
    expect(values).toEqual(Object.fromEntries(api.PROTOCOL_IDS.map(id => [id, false])));
    expect(api.fromValues({ ...values, ui_collectionNoMissedVoids_answer: 'no' })).toMatchObject({ complete: false, knownProblems: ['collectionNoMissedVoids'] });
    expect(api.fromValues({ knownFacts: { collectionNoMissedVoids: false } })).toMatchObject({ complete: false, knownProblems: ['collectionNoMissedVoids'] });
  });
  it('restores24 on blur and reset while leaving an invalid explicit value untouched', () => {
    const api = harness().ClcrCollectionDuration, ui = controls(), hours = ui.add('Cl24DurationHours', ''), source = ui.add('Cl24DurationSource', '');
    api.ensureDefaults(ui.doc);
    expect([hours.value, source.value]).toEqual(['24', 'assumed-24h']);
    hours.value = ''; hours.emit('input');
    expect(hours.value).toBe(''); // Editing is not interrupted by a forced24.
    expect(api.readFromDocument(ui.doc)).toMatchObject({ valid: true, hours: 24, assumed: true });
    hours.emit('blur');
    expect([hours.value, source.value]).toEqual(['24', 'assumed-24h']);
    expect(ui.emitted.at(-1)).toEqual({ id: 'Cl24DurationHours', type: 'input', bubbles: true });
    hours.value = '0'; hours.emit('input'); hours.emit('blur');
    expect([hours.value, source.value]).toEqual(['0', 'hours']);
    expect(api.readFromDocument(ui.doc)).toMatchObject({ valid: false, invalid: true });
    hours.value = ''; source.value = ''; api.ensureDefaults(ui.doc);
    expect([hours.value, source.value]).toEqual(['24', 'assumed-24h']);
  });
  it('can bind a duration before its hidden provenance control is mounted', () => {
    const api = harness().ClcrCollectionDuration, ui = controls(), hours = ui.add('CA_collectionHours', '24');
    api.bindControl(hours);
    const source = ui.add('CA_collectionSource', 'assumed-24h');
    api.bindControl(hours, { sourceControl: source });
    hours.value = '12'; hours.emit('input');
    expect(source.value).toBe('hours');
    expect(api.readFromDocument(ui.doc, { fieldId: 'CA_collectionHours' })).toMatchObject({ hours: 12, source: 'hours', assumed: false });
  });
  it('updates provenance before an older result input listener even when assumed24 is explicitly entered as the same24', () => {
    const api = harness().ClcrCollectionDuration, ui = controls(), hours = ui.add('Cl24DurationHours', '24'), source = ui.add('Cl24DurationSource', 'assumed-24h');
    ui.doc.defaultView.__vildaClcrVersionValueVault = { durationNeedsConfirmation: false };
    const computed = [api.readFromDocument(ui.doc)];
    // The legacy producer is registered first, just as inline04 is initialized
    // before the shared duration module binds its input event on the page.
    hours.addEventListener('input', () => computed.push({ ...api.readFromDocument(ui.doc),
      confirmation: ui.doc.defaultView.__vildaClcrVersionValueVault.durationNeedsConfirmation }));
    api.ensureDefaults(ui.doc);
    hours.value = '24'; hours.emit('input');
    expect(computed).toHaveLength(2);
    expect(computed[0]).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h' });
    expect(computed[1]).toMatchObject({ valid: true, hours: 24, source: 'hours', assumed: false, confirmation: false });
    source.value = 'historical-missing'; ui.doc.defaultView.__vildaClcrVersionValueVault.durationNeedsConfirmation = true;
    hours.value = '24'; hours.emit('input');
    expect(computed[2]).toMatchObject({ valid: true, hours: 24, source: 'hours', assumed: false, confirmation: false });
  });
  it.each(['Cl24DurationHours', 'CA_collectionHours', 'UA_collectionHours', 'MG_collectionHours'])('%s requires a positive historical duration before blank can default again and resets without leaking the old flag', fieldId => {
    const api = harness().ClcrCollectionDuration, ui = controls();
    const sourceId = api.SOURCES[fieldId], flagId = fieldId === 'Cl24DurationHours' ? 'durationNeedsConfirmation' : fieldId.split('_')[0] + '_durationNeedsConfirmation';
    const hours = ui.add(fieldId, ''), source = ui.add(sourceId, 'historical-missing');
    ui.doc.defaultView.__vildaClcrVersionValueVault = { [flagId]: true };
    api.ensureDefaults(ui.doc);
    hours.emit('blur');
    expect([hours.value, source.value]).toEqual(['', 'historical-missing']);
    for (const invalid of ['0', '-1', 'NaN', '1e', '']) {
      hours.value = invalid; hours.emit('input'); hours.emit('blur');
      expect([hours.value, source.value]).toEqual([invalid, 'historical-missing']);
      expect(api.readFromDocument(ui.doc, { fieldId }).valid).toBe(false);
    }
    hours.value = '12'; hours.emit('input');
    expect([hours.value, source.value, ui.doc.defaultView.__vildaClcrVersionValueVault[flagId]]).toEqual(['12', 'hours', false]);
    expect(api.readFromDocument(ui.doc, { fieldId })).toMatchObject({ valid: true, hours: 12, source: 'hours', assumed: false });
    hours.value = ''; hours.emit('input'); hours.emit('blur');
    expect([hours.value, source.value]).toEqual(['24', 'assumed-24h']);
    // The same controls survive patient switching. A new source must remove
    // the historical exception without relying on replacing a WeakMap entry.
    hours.value = ''; source.value = 'historical-missing'; ui.doc.defaultView.__vildaClcrVersionValueVault[flagId] = true;
    api.ensureDefaults(ui.doc); expect(hours.value).toBe('');
    source.value = 'assumed-24h'; ui.doc.defaultView.__vildaClcrVersionValueVault[flagId] = false;
    api.ensureDefaults(ui.doc); hours.value = ''; hours.emit('input'); hours.emit('blur');
    expect([hours.value, source.value]).toEqual(['24', 'assumed-24h']);
  });
  it('updates the mounted duration summary while editing without moving the focused input or closing its editor', () => {
    const { doc, api, hours, source, wrapper, editor, summary, button, change } = mountedDurationView();
    expect(summary.textContent).toBe('24 godz.');
    button.click();
    change('12');
    expect(summary.textContent).toBe('12 godz.');
    expect(source.value).toBe('hours');
    expect(doc.activeElement).toBe(hours);
    expect(wrapper.parentNode).toBe(editor);
    expect(hours.parentNode).toBe(wrapper);
    expect(editor.hidden).toBe(false);
    change('23,5'); expect(summary.textContent).toBe('23,5 godz.');
    change('1e1'); expect(summary.textContent).toBe('10 godz.');
    change('+12'); expect(summary.textContent).toBe('12 godz.');
    change('');
    expect([hours.value, summary.textContent, source.value]).toEqual(['', '24 godz.', 'assumed-24h']);
    hours.dispatchEvent({ type: 'blur', isTrusted: true });
    expect([hours.value, summary.textContent, source.value]).toEqual(['24', '24 godz.', 'assumed-24h']);
    expect(doc.activeElement).toBe(hours);
    expect(wrapper.parentNode).toBe(editor);
    expect(editor.hidden).toBe(false);
    change('0'); expect(summary.textContent).toBe('0 godz.');
    expect(api.readFromDocument(doc)).toMatchObject({ valid: false, invalid: true });
  });
  it('opens the mounted editor for unknown historical time and shows no assumed number through invalid input or blur', () => {
    const { doc, api, hours, source, editor, summary, host, change, render } = mountedDurationView('historical-missing', '', true);
    expect([summary.textContent, editor.hidden, hours.value]).toEqual(['Uzupełnij czas', false, '']);
    expect(host.querySelector('.clcr-duration-hint').textContent).not.toContain('24');
    for (const value of ['0', '']) {
      change(value); hours.dispatchEvent({ type: 'blur', isTrusted: true });
      expect([summary.textContent, editor.hidden, hours.value, source.value]).toEqual(['Uzupełnij czas', false, value, 'historical-missing']);
      expect(api.readFromDocument(doc).valid).toBe(false);
    }
    for (const [value, shown] of [['1e1', '10'], ['+12', '12'], ['12', '12']]) {
      source.value = 'historical-missing'; doc.defaultView.__vildaClcrVersionValueVault.durationNeedsConfirmation = true;
      change(value);
      expect([summary.textContent, source.value, editor.hidden]).toEqual([shown + ' godz.', 'hours', false]);
      expect(doc.defaultView.__vildaClcrVersionValueVault.durationNeedsConfirmation).toBe(false);
    }
    hours.value = ''; source.value = 'assumed-24h'; api.ensureDefaults(doc); render();
    expect([summary.textContent, hours.value, source.value]).toEqual(['24 godz.', '24', 'assumed-24h']);
  });
  it('defaults numeric Cl24 actual producer to24 with no dates or checklist', () => {
    const w = harness();
    const result = w.ClcrSavedLegacyCalculator.recalculate('cl24', { ...specimen, Ucr: '100', Scr: '1', ScrUnit: 'mg/dl', V24: '1440', Cl24DurationHours: '' });
    expect(result.valueNum).toBe(100);
    expect(result.measuredClearanceReference.durationSource).toBe('assumed-24h');
    expect(() => w.ClcrSavedLegacyCalculator.recalculate('cl24', { ...specimen, Ucr: '100', Scr: '1', ScrUnit: 'mg/dl', Cl24DurationHours: '0' })).toThrow('większy od 0');
  });
  it.each([['Na_mmol_d', 75], ['K_mmol_d', 30], ['PO4_mgkg', 750], ['Prot_mgkg', 240], ['Ox_mgkg', 1.25], ['Cit_mgkg', 1.25]])('actual legacy %s producer no longer needs dates or six answers', (formula, expected) => {
    const w = harness();
    expect(w.ClcrSavedLegacyCalculator.recalculate(formula, specimen).valueNum).toBe(expected);
    expect(w.ClcrSavedLegacyCalculator.recalculate(formula, { ...specimen, Cl24DurationHours: '12' }).valueNum).toBe(expected * 2);
    expect(() => w.ClcrSavedLegacyCalculator.recalculate(formula, { ...specimen, Cl24DurationHours: '', Cl24DurationSource: 'historical-missing' })).toThrow('nie został utrwalony');
    expect(() => w.ClcrSavedLegacyCalculator.recalculate(formula, { ...specimen, ui_collectionNoMissedVoids_answer: 'no' })).toThrow();
  });
  it('never normalizes measured pH by time', () => {
    const w = harness();
    expect(w.ClcrSavedLegacyCalculator.recalculate('pH24', specimen).valueNum).toBe(5.5);
    expect(w.ClcrSavedLegacyCalculator.recalculate('pH24', { ...specimen, Cl24DurationHours: '12' }).valueNum).toBe(5.5);
  });
  it.each([['CaDzm', 'CA', 'clcr_ca_dzm'], ['Ua', 'UA', 'clcr_ua']])('%s own input defaults blank24, preserves unknown historical time and unchecked DOM facts', (globalName, prefix) => {
    const w = harness(), engine = w['VildaClcr' + globalName];
    const data = { weight: '30', [`${prefix}_concentration`]: '5', [`${prefix}_concentrationUnit`]: 'mg/L', [`${prefix}_volume`]: '1500', [`${prefix}_volumeUnit`]: 'mL', [`${prefix}_collectionHours`]: '', [`${prefix}_collectionSource`]: 'assumed-24h' };
    Object.assign(data, Object.fromEntries(w.ClcrCollectionDuration.PROTOCOL_IDS.map(id => [id, false])));
    const checkboxIds = new Set(w.ClcrCollectionDuration.PROTOCOL_IDS);
    const doc = { getElementById: id => Object.hasOwn(data, id) ? checkboxIds.has(id) ? { type: 'checkbox', checked: false } : { value: data[id] } : null };
    expect(engine.compute(engine.readInputFromDocument(doc))).toMatchObject({ valid: true, hours: 24, input: { durationSource: 'assumed-24h' } });
    expect(engine.compute({ weightKg: '30', concentration: '5', concentrationUnit: 'mg/L', volume: '1500', hours: '', durationNeedsConfirmation: true })).toMatchObject({ valid: false, missingIds: [`${prefix}_collectionHours`] });
    expect(engine.compute({ weightKg: '30', concentration: '5', concentrationUnit: 'mg/L', volume: '1500', hours: '12', durationNeedsConfirmation: true, durationSource: 'historical-missing' })).toMatchObject({ valid: true, hours: 12, input: { durationNeedsConfirmation: false, durationSource: 'hours' } });
    expect(engine.compute({ weightKg: '30', concentration: '5', concentrationUnit: 'mg/L', volume: '1500', hours: '', knownFacts: { collectionNoMissedVoids: false } })).toMatchObject({ valid: false, blocked: true });
  });
});
