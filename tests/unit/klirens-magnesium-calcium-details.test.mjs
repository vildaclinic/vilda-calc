import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

// The repository's small DOM double intentionally has no HTML parser. This
// adapter supplies only the static HTML controls used by the actual dialog.
function dialogDocument() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const decode = value => String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  doc.createElement = tag => {
    const node = create(tag);
    node.dataset = {};
    node.value = '';
    node.reportValidity = () => true;
    Object.defineProperty(node, 'open', { get: () => node.hasAttribute('open') });
    Object.defineProperty(node, 'innerHTML', { set(html) {
      node.textContent = '';
      const stack = [node];
      for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
        if (token.startsWith('</')) { stack.pop(); continue; }
        if (!token.startsWith('<')) { stack[stack.length - 1].wlasnyTekst += decode(token); continue; }
        const tagName = /^<([\w-]+)/.exec(token)?.[1];
        if (!tagName) continue;
        const child = doc.createElement(tagName);
        for (const match of token.slice(tagName.length + 1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
          const key = match[1], value = decode(match[2] || '');
          child.setAttribute(key, value);
          if (key.startsWith('data-')) child.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
          if (['value', 'type'].includes(key)) child[key] = value;
          if (['hidden', 'checked', 'required'].includes(key)) child[key] = true;
        }
        stack[stack.length - 1].appendChild(child);
        if (!['input', 'br', 'hr', 'img'].includes(tagName)) stack.push(child);
      }
      for (const select of node.querySelectorAll('select')) select.value = (select.children.find(option => option.hasAttribute('selected')) || select.children[0])?.value || '';
    } });
    return node;
  };
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  return doc;
}
function environment(input = {}) {
  const doc = dialogDocument(), root = { document: doc };
  for (const file of ['clcr_magnesium_calcium_data.js', 'clcr_magnesium_calcium.js', 'clcr_magnesium_calcium_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_result_details.js']) loadBrowserScript(file, root);
  const result = root.VildaClcrMagnesiumCalcium.evaluate({ mode: 'concentration', magnesiumValue: '20', magnesiumUnit: 'mg/L', calciumValue: '2', calciumUnit: 'mmol/L', ...input }, root.VildaClcrMagnesiumCalciumData.getProfile('MGCA_DZM_2026_11'));
  const point = { id: 'Mg_Ca', sourceFormulaId: 'Mg_Ca', testKey: 'clcr:Mg_Ca', label: 'Magnez/wapń (DZM)' };
  expect(root.ClcrMagnesiumCalciumPersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  let note = { id: 'fictional-mgca-details', rev: 3, ...root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-mgca-patient', clinicalDateISO: '2026-11-03', comment: 'Zachowany komentarz.' }) };
  const captured = root.ClcrSavedCalculation.createSnapshot(point, { capture: { values: {}, fields: [] } });
  note.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(captured, note);
  const update = vi.fn(async payload => { note = { ...payload, rev: note.rev + 1 }; return { updated: true }; });
  const vault = { getPatientNote: vi.fn(async () => note), updateExistingPatientNote: update, isUnlocked: () => true };
  const open = () => root.ClcrResultDetails.open({ document: doc, vault, patientId: note.patientId, noteId: note.id });
  const field = id => doc.getElementById('editField-' + id);
  const inputValue = (id, value) => { field(id).value = value; field(id).dispatch('input'); };
  const submit = async () => { const form = doc.getElementById('editForm'); for (const listener of form.sluchacze.get('submit')) await listener({ preventDefault() {} }); };
  return { root, doc, open, field, inputValue, submit, update, vault, note: () => note };
}

describe('Mg/Ca saved details use the actual persistence and transaction', () => {
  it('shows only the active own fields and rebuilds the form and focus in both directions', async () => {
    const env = environment();
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    const controls = () => env.doc.getElementById('editInputFields').querySelectorAll('[data-clcr-edit-field]').map(node => node.dataset.clcrEditField);
    expect(controls()).toEqual(['MGCA_inputMode', 'MGCA_magnesium', 'MGCA_magnesiumUnit', 'MGCA_calcium', 'MGCA_calciumUnit']);
    env.inputValue('MGCA_magnesium', '25');
    env.inputValue('MGCA_inputMode', 'direct');
    expect(controls()).toEqual(['MGCA_inputMode', 'MGCA_reportedValue', 'MGCA_reportedUnit']);
    expect(env.doc.activeElement).toBe(env.field('MGCA_reportedValue'));
    env.inputValue('MGCA_reportedValue', '0.5');
    env.inputValue('MGCA_inputMode', 'concentration');
    expect(env.field('MGCA_magnesium').value).toBe('25');
    expect(env.doc.activeElement).toBe(env.field('MGCA_magnesium'));
    env.inputValue('MGCA_inputMode', 'direct');
    expect(env.field('MGCA_reportedValue').value).toBe('0.5');
    for (const hidden of ['sameSpecimen', 'collectionProblem', 'collectionHours', 'durationKnown']) expect(env.field('MGCA_' + hidden)).toBeNull();
    expect(env.doc.getElementById('changeHistoricalContext').hidden).toBe(true);
  });

  it('keeps two canonical unit choices, original alias evidence and the same note ID on number edit', async () => {
    const env = environment({ mode: 'direct', reportedValue: '0.5', reportedUnit: 'g/g' });
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    expect(env.field('MGCA_reportedUnit').children.map(node => node.value)).toEqual(['mg/mg', 'mmol/mmol']);
    expect(env.field('MGCA_reportedUnit').value).toBe('mg/mg');
    env.inputValue('MGCA_reportedValue', '0.6');
    await env.submit();
    expect(env.update).toHaveBeenCalledOnce();
    expect(env.update.mock.calls[0][0]).toMatchObject({ id: 'fictional-mgca-details', patientId: 'fictional-mgca-patient', baseRev: 3 });
    const saved = env.root.ClcrSavedCalculation.readSaved(env.note());
    expect(saved).toMatchObject({ valid: true, rawValue: 0.6, norm: '', outOfRange: null });
    expect(saved.snapshot.assessment.magnesiumCalciumSnapshot.input.reportedUnit).toBe('g/g');
    expect(env.note().body).toContain('Zachowany komentarz.');
  });

  it('retains the hidden different-specimen fact and blocks changing that direct record to concentrations', async () => {
    const env = environment({ mode: 'direct', reportedValue: '0.5', reportedUnit: 'mg/mg', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: true });
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    env.inputValue('MGCA_inputMode', 'concentration');
    env.inputValue('MGCA_magnesium', '20');
    env.inputValue('MGCA_calcium', '2');
    await env.submit();
    expect(env.update).not.toHaveBeenCalled();
    expect(env.doc.getElementById('editError').hidden).toBe(false);
    expect(env.doc.getElementById('editError').textContent).toMatch(/zbiór|prób/i);
    expect(env.root.ClcrSavedCalculation.readSaved(env.note()).rawValue).toBe(0.5);
  });

  it('keeps a pending edit attached to its original formula and ID until the write completes', async () => {
    const env = environment(), write = env.update.getMockImplementation();
    let release;
    env.update.mockImplementationOnce(payload => new Promise(resolve => { release = async () => resolve(await write(payload)); }));
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    env.inputValue('MGCA_magnesium', '25');
    const pending = env.submit();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(false);
    expect(env.doc.getElementById('editDialog')).not.toBeNull();
    await release();
    await pending;
    expect(env.root.ClcrSavedCalculation.readSaved(env.note())).toMatchObject({ valid: true, rawValue: 6250 / 20039, parameterKey: 'Mg_Ca' });
    expect(env.note().id).toBe('fictional-mgca-details');
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(true);
    expect(env.doc.getElementById('editDialog')).toBeNull();
  });

  it('cancels a nonpending editor when another formula becomes active', async () => {
    const env = environment();
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('Mg_Ca')).toBe(true);
    expect(env.doc.getElementById('editDialog')).not.toBeNull();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(true);
    expect(env.doc.getElementById('editDialog')).toBeNull();
    expect(env.update).not.toHaveBeenCalled();
  });
});
