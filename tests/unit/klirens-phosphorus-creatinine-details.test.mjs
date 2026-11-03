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
  for (const file of ['clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js', 'clcr_phosphorus_creatinine_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_results.js', 'clcr_result_details.js']) loadBrowserScript(file, root);
  const result = root.VildaClcrPhosphorusCreatinine.evaluate({ mode: 'concentration', phosphorusValue: '15', phosphorusUnit: 'mmol/L', creatinineValue: '10', creatinineUnit: 'mmol/L', ageYears: 10, sex: 'F', ...input }, root.VildaClcrPhosphorusCreatinineData.getProfile('PICR_DZM_2026_11'));
  const point = { id: 'PO4_Cr', sourceFormulaId: 'PO4_Cr', testKey: 'clcr:PO4_Cr', label: 'Fosforany/kreatynina (Pi, DZM)' };
  expect(root.ClcrPhosphorusCreatininePersistence.augmentDatapoint({ getAttribute: () => JSON.stringify(result.snapshot) }, point)).toBe(true);
  let note = { id: 'fictional-picr-details', rev: 3, ...root.ClcrSavedResults.buildPatientNotePayload(point, { patientId: 'fictional-picr-patient', clinicalDateISO: '2026-11-03', comment: 'Zachowany komentarz.' }) };
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

describe('Pᵢ/Cr saved details use the actual persistence and transaction', () => {
  it('shows only the active own fields and rebuilds the form and focus in both directions', async () => {
    const env = environment();
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    const controls = () => env.doc.getElementById('editInputFields').querySelectorAll('[data-clcr-edit-field]').map(node => node.dataset.clcrEditField);
    expect(controls()).toEqual(['PICR_inputMode', 'PICR_phosphorus', 'PICR_phosphorusUnit', 'PICR_creatinine', 'PICR_creatinineUnit']);
    env.inputValue('PICR_phosphorus', '25');
    env.inputValue('PICR_inputMode', 'direct');
    expect(controls()).toEqual(['PICR_inputMode', 'PICR_reportedValue', 'PICR_reportedUnit']);
    expect(env.doc.activeElement).toBe(env.field('PICR_reportedValue'));
    env.inputValue('PICR_reportedValue', '0.5');
    env.inputValue('PICR_inputMode', 'concentration');
    expect(env.field('PICR_phosphorus').value).toBe('25');
    expect(env.doc.activeElement).toBe(env.field('PICR_phosphorus'));
    env.inputValue('PICR_inputMode', 'direct');
    expect(env.field('PICR_reportedValue').value).toBe('0.5');
    for (const hidden of ['sameSpecimen', 'collectionProblem', 'collectionHours', 'durationKnown']) expect(env.field('PICR_' + hidden)).toBeNull();
    expect(env.doc.getElementById('changeHistoricalContext').hidden).toBe(true);
    expect(env.doc.getElementById('editHistoricalSummary').textContent).toContain('10 lat');
    expect(env.doc.getElementById('editHistoricalSummary').textContent).toContain('kobieta');
  });

  it('keeps three report unit choices, original alias evidence and the same note ID on number edit', async () => {
    const env = environment({ mode: 'direct', reportedValue: '0.5', reportedUnit: 'g/g' });
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    expect(env.field('PICR_reportedUnit').children.map(node => node.value)).toEqual(['mg/mg', 'mg/g', 'mmol/mmol']);
    expect(env.field('PICR_reportedUnit').value).toBe('mg/mg');
    env.inputValue('PICR_reportedValue', '0.6');
    await env.submit();
    expect(env.update).toHaveBeenCalledOnce();
    expect(env.update.mock.calls[0][0]).toMatchObject({ id: 'fictional-picr-details', patientId: 'fictional-picr-patient', baseRev: 3 });
    const saved = env.root.ClcrSavedCalculation.readSaved(env.note());
    expect(saved).toMatchObject({ valid: true, rawValue: 0.6, norm: '0,142–1,321 mg/mg', outOfRange: false });
    expect(saved.snapshot.assessment.phosphorusCreatinineSnapshot.input.reportedUnit).toBe('g/g');
    expect(env.note().body).toContain('Zachowany komentarz.');
  });

  it('retains the hidden different-specimen fact and blocks changing that direct record to concentrations', async () => {
    const env = environment({ mode: 'direct', reportedValue: '0.5', reportedUnit: 'mg/mg', sameSpecimen: 'different', collectionProblem: true, collectionHours: '25', durationKnown: true });
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    env.inputValue('PICR_inputMode', 'concentration');
    env.inputValue('PICR_phosphorus', '20');
    env.inputValue('PICR_creatinine', '2');
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
    env.inputValue('PICR_phosphorus', '25');
    const pending = env.submit();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(false);
    expect(env.doc.getElementById('editDialog')).not.toBeNull();
    await release();
    await pending;
    expect(env.root.ClcrSavedCalculation.readSaved(env.note())).toMatchObject({ valid: true, rawValue: 25 / 10 * 30.973761998 / 113.12, parameterKey: 'PO4_Cr' });
    expect(env.note().id).toBe('fictional-picr-details');
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(true);
    expect(env.doc.getElementById('editDialog')).toBeNull();
  });

  it('cancels a nonpending editor when another formula becomes active', async () => {
    const env = environment();
    await env.open();
    env.doc.getElementById('editMeasurement').click();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('PO4_Cr')).toBe(true);
    expect(env.doc.getElementById('editDialog')).not.toBeNull();
    expect(env.root.ClcrResultDetails.cancelForFormulaChange('ACR')).toBe(true);
    expect(env.doc.getElementById('editDialog')).toBeNull();
    expect(env.update).not.toHaveBeenCalled();
  });
});
