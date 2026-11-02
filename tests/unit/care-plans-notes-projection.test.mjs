import { describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';

const PATIENT = 'fictional-patient-notes';
function plan(extra = {}) {
  return { id: 'fictional-plan-notes', patientId: PATIENT, title: 'Fikcyjny plan dokumentacji', category: 'care-plan',
    careContext: { version: 1, role: 'plan', status: 'active', steps: [], log: [] }, ...extra };
}
function child(parent, role, extra = {}) {
  const note = { id: 'fictional-child-' + role, patientId: parent.patientId, title: 'Fikcyjny ' + role,
    body: 'Fikcyjna pełna treść.', category: 'observation', careContext: { version: 1, role, planId: parent.id }, ...extra };
  if (role === 'decision') note.id = 'care-decision-' + parent.id;
  else if (role === 'note') parent.careContext.log.push({ dateISO: '2026-10-30', text: 'Fikcyjny zapis.', noteId: note.id });
  else {
    const step = { id: 'fictional-step-' + role, title: 'Fikcyjny krok', state: 'pending' };
    step[{ step: 'reminderNoteId', calendar: 'calendarNoteId', result: 'resultNoteId' }[role]] = note.id;
    note.careContext.stepId = step.id; parent.careContext.steps.push(step);
  }
  return note;
}
function api() { const win = { document: {} }; loadBrowserScript('vilda_care_plans.js', win); return win.VildaCarePlans; }
const freeze = object => { if (object && typeof object === 'object') { Object.values(object).forEach(freeze); Object.freeze(object); } return object; };

describe('Patient Notes project complete plan membership without changing original records', () => {
  it.each(['active', 'closed'])('omits all six roles of a readable %s plan and retains independent documents of identical categories/titles', status => {
    const parent = plan(); parent.careContext.status = status;
    const children = ['step', 'decision', 'calendar', 'result', 'note'].map(role => child(parent, role));
    const independent = children.map((note, index) => ({ ...note, id: 'fictional-independent-' + index, careContext: undefined }));
    const source = freeze([parent, ...children, ...independent]), before = JSON.stringify(source);
    const projected = api().projectPatientNotes(source, PATIENT);
    expect(projected).toEqual(independent); projected.forEach((note, index) => expect(note).toBe(independent[index]));
    expect(JSON.stringify(source)).toBe(before);
  });

  it('keeps an existing appointment ID/body/date when linked later while excluding only its Notes projection', () => {
    const parent = plan(), appointment = child(parent, 'calendar', { id: 'fictional-existing-appointment',
      body: 'Fikcyjny wcześniejszy opis konsultacji.', dueDateISO: '2028-01-14', dueTime: '11:45' });
    const original = freeze([parent, appointment]);
    expect(api().projectPatientNotes(original, PATIENT)).toEqual([]);
    expect(api().resolveNoteDestination(original, appointment, PATIENT)).toEqual({ kind: 'calendar', planId: parent.id, noteId: appointment.id, role: 'calendar' });
    expect(appointment).toMatchObject({ id: 'fictional-existing-appointment', body: 'Fikcyjny wcześniejszy opis konsultacji.', dueDateISO: '2028-01-14', dueTime: '11:45' });
  });

  it.each(['step', 'decision', 'calendar', 'result', 'note'])('retains %s with missing or unreadable parent instead of losing access', role => {
    const parent = plan(), note = child(parent, role);
    for (const parents of [[], [{ ...parent, careContext: null }], [{ ...parent, category: 'observation' }],
      [{ ...parent, careContext: { ...parent.careContext, version: 2 } }], [{ ...parent, careContext: { version: 1, role: 'plan' } }],
      [{ ...parent, patientId: 'fictional-other-patient' }]]) {
      const all = [...parents, note];
      expect(api().projectPatientNotes(all, PATIENT)).toContain(note);
      expect(api().resolveNoteDestination(all, note, PATIENT)).toEqual({ kind: 'notes', noteId: note.id });
    }
  });

  it.each(['step', 'calendar', 'result', 'note'])('retains a context-only %s missing the reverse link from the plan', role => {
    const parent = plan(), note = child(parent, role); parent.careContext.steps = []; parent.careContext.log = [];
    expect(api().projectPatientNotes([parent, note], PATIENT)).toEqual([note]);
    expect(api().resolveNoteDestination([parent, note], note, PATIENT)).toEqual({ kind: 'notes', noteId: note.id });
  });

  it.each([null, { version: 2, role: 'note', planId: 'fictional-plan-notes' },
    { version: 1, role: 'future-role', planId: 'fictional-plan-notes' }, { version: 1, role: 'note', planId: '' }])('retains incomplete/future context %j', context => {
    const parent = plan(), note = { id: 'fictional-document', patientId: PATIENT, category: 'care-plan', title: 'Fikcyjny plan dokumentacji', careContext: context };
    expect(api().projectPatientNotes([parent, note], PATIENT)).toEqual([note]);
  });

  it('does not assign another patient’s document or mismatched step to the plan', () => {
    const parent = plan(), note = child(parent, 'result');
    const other = { ...note, patientId: 'fictional-other-patient' };
    expect(api().projectPatientNotes([parent, other], PATIENT)).toEqual([other]);
    note.careContext.stepId = 'fictional-unrelated-step';
    expect(api().projectPatientNotes([parent, note], PATIENT)).toEqual([note]);
  });

  it('resolves canonical plan/helpers to the plan and original result/notes to their exact full record', () => {
    const parent = plan(), reminder = child(parent, 'step'), decision = child(parent, 'decision'), result = child(parent, 'result'), note = child(parent, 'note');
    const all = [parent, reminder, decision, result, note], actual = api();
    for (const helper of [parent, reminder, decision]) expect(actual.resolveNoteDestination(all, helper, PATIENT)).toMatchObject({ kind: 'care', planId: parent.id, noteId: null });
    for (const record of [result, note]) expect(actual.resolveNoteDestination(all, record, PATIENT)).toMatchObject({ kind: 'care', planId: parent.id, noteId: record.id });
  });
});

function mounted(options = {}) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  doc.createElement = tag => {
    const node = createElement(tag); node.scrollTop = 0;
    node.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; node.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    return node;
  };
  doc.removeEventListener = () => {};
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const parent = plan(), note = child(parent, 'result', { title: 'Fikcyjny bieżący wynik', body: 'Fikcyjny aktualny opis wyniku.' });
  const other = plan({ id: 'fictional-other-plan', patientId: 'fictional-other-patient', title: 'Fikcyjny inny plan' });
  let plans = [parent, other], account = 'fictional-account', unlocked = true;
  const hooks = {};
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => ({ userId: account }),
    listCarePlans: vi.fn(async () => plans.map(entry => ({ ...entry.careContext, id: entry.id, patientId: entry.patientId, title: entry.title }))),
    listPatients: vi.fn(async () => [{ patientId: PATIENT, header: { name: 'Fikcyjny Pacjent Podglądu' } }, { patientId: other.patientId, header: { name: 'Fikcyjny Inny Pacjent' } }]),
    getPatientNote: vi.fn(async () => structuredClone(note)),
    onLock: callback => { hooks.lock = callback; }, onPatientNoteChanged: callback => { hooks.changed = callback; },
    mutateCarePlan: vi.fn(), savePatientNote: vi.fn(),
  };
  const win = { document: doc, setTimeout, clearTimeout, crypto: globalThis.crypto, matchMedia: () => ({ matches: false }) };
  loadBrowserScript('vilda_care_plans.js', win);
  const controller = win.VildaCarePlans.mount(host, { vault, full: true, planId: parent.id, ...options });
  return { doc, host, vault, note, parent, other, hooks, controller,
    changePlans: values => { plans = values; }, changeAccount: value => { account = value; }, lock: () => { unlocked = false; hooks.lock(); } };
}
const settled = () => new Promise(resolve => { setTimeout(resolve, 0); });

describe('Care plan preview reads exact current documentation with lifecycle guards', () => {
  it('exposes the existing parent return control only while the parent explicitly owns a return destination', async () => {
    let hasReturn = true;
    const onReturn = vi.fn(() => hasReturn);
    const d = mounted({ hasReturn: () => hasReturn, backLabel: () => hasReturn ? '← Szukaj' : '← Lista planów', onReturnToReminders: onReturn });
    await settled();
    const back = d.host.querySelector('[data-vcp-parent-back]');
    expect(back.textContent).toBe('← Szukaj');
    expect(back.classList.contains('vcp-parent-return')).toBe(true);
    back.click();
    expect(onReturn).toHaveBeenCalledTimes(1);
    hasReturn = false; d.controller.refreshNavigation();
    expect(back.textContent).toBe('← Lista planów');
    expect(back.classList.contains('vcp-parent-return')).toBe(false);
    await d.controller.select(d.parent.id);
    d.host.querySelector('[data-vcp-parent-back]').click();
    expect(onReturn).toHaveBeenCalledTimes(2);
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: null, detail: false });
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    expect(d.vault.savePatientNote).not.toHaveBeenCalled();
    d.controller.destroy();
  });

  it('exposes only detached navigation IDs and list/detail state for background card restoration', async () => {
    const d = mounted(); await settled();
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: null, detail: true });
    await d.controller.openRecord(d.note.id);
    const context = d.controller.getContext();
    expect(context).toEqual({ planId: d.parent.id, noteId: d.note.id, detail: true });
    context.planId = 'fictional-external-mutation'; context.noteId = null; context.detail = false;
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: d.note.id, detail: true });
    d.host.querySelector('.vcp-record .vcp-back').click();
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: null, detail: true });
    d.host.querySelector('.vcp-back').click();
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: null, detail: false }); d.controller.destroy();
  });

  it('restores a selected plan without forcing the mobile list into its detail screen', async () => {
    const d = mounted({ detail: false }); await settled();
    expect(d.controller.getContext()).toEqual({ planId: d.parent.id, noteId: null, detail: false });
    expect(d.host.querySelector('.vcp').classList.contains('vcp-show-detail')).toBe(false); d.controller.destroy();
  });

  it('supports record selection while the initial list is still loading and an initial exact note option', async () => {
    const first = mounted(); await first.controller.select(first.parent.id, first.note.id);
    expect(first.host.querySelector('.vcp-record-body').textContent).toBe(first.note.body); first.controller.destroy();
    const second = mounted({ noteId: 'fictional-child-result' }); await settled();
    expect(second.host.querySelector('.vcp-record-body').textContent).toBe(second.note.body); second.controller.destroy();
  });

  it('keeps the latest selection when two initial refreshes finish out of order', async () => {
    const d = mounted(), releases = [];
    d.vault.listCarePlans.mockImplementation(() => new Promise(resolve => { releases.push(resolve); }));
    const first = d.controller.select(d.parent.id, d.note.id), second = d.controller.select(d.other.id);
    const views = [d.parent, d.other].map(entry => ({ ...entry.careContext, id: entry.id, patientId: entry.patientId, title: entry.title }));
    releases[1](views); await second; releases[0](views); await first;
    expect(d.controller.getSelected()).toBe(d.other.id); expect(d.host.querySelector('.vcp-record')).toBeNull();
    expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('reads fresh original text/lab fields on each open and returns to the same plan without writes', async () => {
    const d = mounted(); await settled();
    await d.controller.openRecord(d.note.id);
    expect(d.host.querySelector('.vcp-record').getAttribute('data-note-id')).toBe(d.note.id);
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(d.note.body);
    expect(d.doc.activeElement).toBe(d.host.querySelector('.vcp-record h2'));
    d.host.querySelector('.vcp-record .vcp-back').click();
    expect(d.controller.getSelected()).toBe(d.parent.id); expect(d.host.querySelector('.vcp-record')).toBeNull();
    d.note.body = 'Fikcyjny opis poprawiony w Badaniach.'; d.note.labResult = { test: 'Fikcyjna biopsja po edycji', value: 'Fikcyjny wynik po edycji', unit: 'opis', norm: 'Fikcyjna norma z zapisu' };
    d.note.clinicalDateISO = '2026-10-01'; await d.controller.openRecord(d.note.id);
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(d.note.body);
    expect(d.host.querySelector('.vcp-record-lab').textContent).toContain('Fikcyjny wynik po edycji opis');
    expect(d.host.querySelector('.vcp-record').textContent).toContain('01.10.2026');
    expect(d.vault.getPatientNote).toHaveBeenCalledTimes(2);
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); expect(d.vault.savePatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('clears a removed plan preview before choosing another patient’s plan', async () => {
    const d = mounted(); await settled(); await d.controller.openRecord(d.note.id);
    d.changePlans([d.other]); await d.controller.refresh();
    expect(d.controller.getSelected()).toBe(d.other.id); expect(d.host.querySelector('.vcp-record')).toBeNull();
    expect(d.host.textContent).not.toContain(d.note.body); expect(d.host.textContent).toContain(d.other.title); d.controller.destroy();
  });

  it('refreshes the open original even if the parent plan snapshot did not change', async () => {
    const d = mounted(); await settled(); await d.controller.openRecord(d.note.id);
    d.note.body = 'Fikcyjny nowy opis bez zmiany kopii w kroku.'; await d.controller.refresh();
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(d.note.body); d.controller.destroy();
  });

  it('updates the plan list while refreshing an open original', async () => {
    const d = mounted(); await settled(); await d.controller.openRecord(d.note.id);
    d.parent.title = 'Fikcyjny poprawiony tytuł planu'; await d.controller.refresh();
    expect(d.host.querySelector('.vcp-row-title').textContent).toBe(d.parent.title);
    expect(d.host.querySelector('.vcp-record-plan').textContent).toBe(d.parent.title); d.controller.destroy();
  });

  it.each(['selection', 'lock', 'account'])('discards delayed original after a changed %s', async change => {
    const d = mounted(); await settled(); let release;
    d.vault.getPatientNote.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = d.controller.openRecord(d.note.id);
    if (change === 'selection') await d.controller.select(d.other.id);
    if (change === 'lock') d.lock();
    if (change === 'account') d.changeAccount('fictional-different-account');
    release(structuredClone(d.note)); await pending;
    expect(d.host.textContent).not.toContain(d.note.body); d.controller.destroy();
  });

  it('shows a retryable error for unavailable/wrong-owner originals rather than the copied step text', async () => {
    const d = mounted(); await settled(); d.vault.getPatientNote.mockResolvedValueOnce({ ...d.note, patientId: d.other.patientId });
    await d.controller.openRecord(d.note.id);
    expect(d.host.querySelector('.vcp-record .vcp-error')).not.toBeNull(); expect(d.host.querySelector('.vcp-record-body')).toBeNull();
    expect(d.host.textContent).toContain('Spróbuj ponownie'); d.controller.destroy();
  });

  it('handles a rejected native-details read in the current preview without an unhandled rejection', async () => {
    const d = mounted({ openRecordDetails: vi.fn(async () => { throw new Error('Fikcyjny błąd odczytu szczegółów.'); }) });
    await settled(); await d.controller.openRecord(d.note.id);
    d.host.querySelector('.vcp-record').querySelectorAll('button').find(node => node.textContent === 'Szczegóły wpisu').click();
    await settled();
    expect(d.host.querySelector('.vcp-record .vcp-error').textContent).toContain('Fikcyjny błąd odczytu szczegółów.');
    expect(d.host.textContent).toContain('Spróbuj ponownie'); d.controller.destroy();
  });

  it('does not revive an old record when its native editor saves after selection changes', async () => {
    let saved, isCurrentRecord;
    const d = mounted({ openRecordDetails: vi.fn((_note, onSaved, currentRecord) => { saved = onSaved; isCurrentRecord = currentRecord; }) });
    await settled(); await d.controller.openRecord(d.note.id);
    d.host.querySelector('.vcp-record').querySelectorAll('button').find(node => node.textContent === 'Szczegóły wpisu').click();
    expect(isCurrentRecord()).toBe(true);
    await d.controller.select(d.other.id); expect(isCurrentRecord()).toBe(false); saved(); await settled();
    expect(d.controller.getSelected()).toBe(d.other.id); expect(d.host.querySelector('.vcp-record')).toBeNull();
    expect(d.vault.getPatientNote).toHaveBeenCalledTimes(1); d.controller.destroy();
  });
});
