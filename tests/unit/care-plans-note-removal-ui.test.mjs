import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const findButton = (root, text) => root.querySelectorAll('button').find(button => button.textContent === text);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = log => createHash('sha256').update(JSON.stringify(canonical(log))).digest('hex');
const noteId = 'care-note-fictional-manual-entry';
const text = 'Fikcyjne ustalenie zapisane omyłkowo.';
const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });

function view({ planChanges = {}, response = { saved: false, conflict: true }, api = true } = {}) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  doc.createElement = tag => {
    const element = createElement(tag), query = element.querySelector.bind(element);
    element.scrollTop = 0; element.scrollIntoView = () => {};
    element.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; element.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    element.querySelector = selector => selector === 'input:not([type=checkbox]):not([type=radio]),textarea,select'
      ? element.querySelectorAll('input,textarea,select').find(input => input.type !== 'checkbox' && input.type !== 'radio') || null : query(selector);
    if (tag === 'dialog') { element.showModal = () => { element.open = true; }; element.close = () => { element.open = false; }; }
    if (tag === 'form') element.reportValidity = () => true;
    return element;
  };
  doc.removeEventListener = () => {};
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const plan = { id: 'fictional-removal-plan', patientId: 'fictional-removal-patient', title: 'Fikcyjny plan ustaleń', status: 'active', steps: [], rev: 7,
    removedNoteIds: [], log: [{ dateISO: '2026-10-20', text: 'Fikcyjne utworzenie planu.' }, { dateISO: '2026-10-20', text, noteId }], ...planChanges };
  let locked;
  const dto = () => ({ planId: plan.id, patientId: plan.patientId, rev: plan.rev, logDigest: digest(plan.log), removedNoteIds: plan.removedNoteIds.slice(),
    entries: [{ noteId, removable: !plan.removedNoteIds.includes(noteId), removed: plan.removedNoteIds.includes(noteId), linkedRev: 2, readToken: 'a'.repeat(64), dateISO: '2026-10-20', text }] });
  const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-removal-account' }), onLock: callback => { locked = callback; },
    listCarePlans: vi.fn(async () => [structuredClone(plan)]), listPatients: vi.fn(async () => []),
    mutateCarePlan: vi.fn(async () => structuredClone(response)),
    getPatientNote: vi.fn(async () => ({ id: noteId, patientId: plan.patientId, title: 'Fikcyjny oryginał', body: text, careContext: { version: 1, role: 'note', planId: plan.id } })),
    ...(api ? { getCarePlanNoteEntries: vi.fn(async () => dto()) } : {}) };
  const win = { document: doc, VildaVault: vault, setTimeout, clearTimeout, crypto: globalThis.crypto, matchMedia: () => ({ matches: false }) };
  loadBrowserScript('vilda_care_plans.js', win);
  const controller = win.VildaCarePlans.mount(host, { vault, full: true, planId: plan.id });
  return { doc, host, vault, controller, plan, dto, lock: () => locked() };
}
const ready = async d => { await d.controller.refresh(); };
const openRemoval = async d => { findButton(d.host, 'Usuń wpis').click(); await vi.waitFor(() => expect(d.doc.body.querySelector('.vcp-form')).not.toBeNull()); return d.doc.body.querySelector('.vcp-form'); };

describe('Manual care-plan note removal', () => {
  it('offers removal only for a verified manual entry and reads its current text/date before confirmation', async () => {
    const d = view(), before = JSON.stringify(d.plan); await ready(d);
    expect(d.host.querySelectorAll('[data-remove-note-id]')).toHaveLength(1);
    const calls = d.vault.getCarePlanNoteEntries.mock.calls.length, form = await openRemoval(d);
    expect(d.vault.getCarePlanNoteEntries).toHaveBeenCalledTimes(calls + 1);
    expect(form.textContent).toContain(text); expect(form.textContent).toContain('20.10.2026');
    expect(form.textContent).toContain('Wpis zniknie z przebiegu planu. Wcześniejszy zapis pozostanie w historii zmian');
    findButton(form, 'Anuluj').click();
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); expect(JSON.stringify(d.plan)).toBe(before); d.controller.destroy();
  });

  it('removes the original and receipt from the main count but preserves only the original in the archive without a dead document link', async () => {
    const d = view(); await ready(d);
    d.vault.mutateCarePlan.mockImplementation(async () => {
      d.plan.rev += 1; d.plan.removedNoteIds = [noteId]; d.plan.log.push({ dateISO: '2026-10-21', text: 'Fikcyjny techniczny zapis wycofania.', noteId });
      return { saved: true, plan: structuredClone(d.plan) };
    });
    const form = await openRemoval(d); form.dispatch('submit');
    await vi.waitFor(() => expect(d.doc.body.querySelector('.vcp-form')).toBeNull()); await ready(d);
    const history = d.host.querySelector('.vcp-history');
    expect(history.querySelector('summary').textContent).toBe('Przebieg planu · 1 wpis');
    expect(history.textContent).not.toContain(text); expect(history.textContent).not.toContain('Fikcyjny techniczny zapis wycofania.');
    expect(d.host.querySelectorAll('[data-remove-note-id]')).toHaveLength(0);
    findButton(d.host, 'Wcześniejsze wersje planu').click();
    const archive = d.host.querySelector('.vcp-history-archive');
    expect(archive.textContent).toContain('Usunięte ustalenie'); expect(archive.textContent).toContain(text);
    expect(archive.textContent).not.toContain('Fikcyjny techniczny zapis wycofania.');
    expect(archive.querySelector(`[data-record-id="${noteId}"]`)).toBeNull();
    expect(d.plan.log.find(entry => entry.text === text).noteId).toBe(noteId); d.controller.destroy();
  });

  it.each([{ saved: false, conflict: true }, { saved: false, needsRefresh: true }, { saved: false, reason: 'operation-outcome-expired' }])('keeps the same captured token and operation after %j', async response => {
    const d = view({ response }); await ready(d); const form = await openRemoval(d), calls = d.vault.getCarePlanNoteEntries.mock.calls.length;
    d.vault.getCarePlanNoteEntries.mockImplementation(async () => ({ ...d.dto(), entries: [{ ...d.dto().entries[0], readToken: 'b'.repeat(64) }] }));
    form.dispatch('submit'); await settle(); const first = d.vault.mutateCarePlan.mock.calls[0][0];
    expect(first).toMatchObject({ action: 'removePlanNote', noteId, linkedRev: 2, readToken: 'a'.repeat(64), planId: d.plan.id, patientId: d.plan.patientId, baseRev: 7 });
    expect(form.querySelector('[role="alert"]')).not.toBeNull(); expect(d.doc.body.querySelector('.vcp-dialog').open).toBe(true);
    form.dispatch('submit'); await settle(); expect(d.vault.mutateCarePlan.mock.calls[1][0]).toEqual(first);
    expect(d.vault.getCarePlanNoteEntries).toHaveBeenCalledTimes(calls); expect(d.plan.removedNoteIds).toEqual([]); d.controller.destroy();
  });

  it('blocks double clicks during the fresh read and duplicate submits while removal is pending', async () => {
    const d = view(); await ready(d); let finishRead;
    d.vault.getCarePlanNoteEntries.mockReturnValue(new Promise(resolve => { finishRead = resolve; }));
    const remove = findButton(d.host, 'Usuń wpis'), calls = d.vault.getCarePlanNoteEntries.mock.calls.length;
    remove.click(); remove.click(); expect(d.vault.getCarePlanNoteEntries).toHaveBeenCalledTimes(calls + 1);
    finishRead(d.dto()); await vi.waitFor(() => expect(d.doc.body.querySelector('.vcp-form')).not.toBeNull());
    let finishWrite; d.vault.mutateCarePlan.mockReturnValue(new Promise(resolve => { finishWrite = resolve; }));
    const form = d.doc.body.querySelector('.vcp-form'); form.dispatch('submit'); form.dispatch('submit');
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(1); finishWrite({ saved: false, conflict: true }); await settle(); d.controller.destroy();
  });

  it.each(['missing-api', 'throws', 'review', 'unrecognized', 'not-removable', 'wrong-patient', 'wrong-plan', 'wrong-rev', 'wrong-log', 'bad-token'])('does not offer removal when %s prevents a verified capability', async failure => {
    const d = view({ api: failure !== 'missing-api', planChanges: failure === 'review' ? { syncNeedsReview: true } : {} });
    if (failure !== 'missing-api') d.vault.getCarePlanNoteEntries.mockImplementation(async () => {
      if (failure === 'throws') throw Error('Fikcyjny błąd odczytu.');
      const value = d.dto();
      if (failure === 'unrecognized') value.entries = [];
      if (failure === 'not-removable') value.entries[0].removable = false;
      if (failure === 'wrong-patient') value.patientId = 'fictional-other-patient';
      if (failure === 'wrong-plan') value.planId = 'fictional-other-plan';
      if (failure === 'wrong-rev') value.rev += 1;
      if (failure === 'wrong-log') value.logDigest = '0'.repeat(64);
      if (failure === 'bad-token') value.entries[0].readToken = 'invalid';
      return value;
    });
    await ready(d); expect(findButton(d.host, 'Usuń wpis')).toBeUndefined(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not offer a stale capability after the log changes without a new revision', async () => {
    const d = view(); await ready(d); const stale = d.dto();
    d.plan.log[0].text = 'Fikcyjna podmiana historii przy tej samej rewizji.'; d.vault.getCarePlanNoteEntries.mockResolvedValue(stale);
    await ready(d); expect(findButton(d.host, 'Usuń wpis')).toBeUndefined(); d.controller.destroy();
  });

  it('does not open confirmation if the original changed after the button was shown', async () => {
    const d = view(); await ready(d);
    d.vault.getCarePlanNoteEntries.mockImplementation(async () => ({ ...d.dto(), entries: [{ ...d.dto().entries[0], removable: false, reason: 'changed' }] }));
    findButton(d.host, 'Usuń wpis').click(); await vi.waitFor(() => expect(d.host.querySelector('.vcp-feedback').textContent).toContain('nie można potwierdzić'));
    expect(d.doc.body.querySelector('.vcp-dialog')).toBeNull(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('discards a pending confirmation when the vault locks', async () => {
    const d = view(); await ready(d); let finish;
    d.vault.getCarePlanNoteEntries.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    findButton(d.host, 'Usuń wpis').click(); d.lock(); finish(d.dto()); await settle();
    expect(d.doc.body.querySelector('.vcp-dialog')).toBeNull(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
  });

  it.each(['known-parent', 'newer-parent'])('shows a removed state without reading a resurrected child for %s', async scenario => {
    const d = view({ planChanges: scenario === 'known-parent' ? { removedNoteIds: [noteId] } : {} });
    if (scenario === 'newer-parent') d.vault.getCarePlanNoteEntries.mockImplementation(async () => ({ ...d.dto(), rev: d.plan.rev + 1, logDigest: 'f'.repeat(64), removedNoteIds: [noteId],
      entries: [{ ...d.dto().entries[0], removable: false, removed: true, linkedRev: null, readToken: null }] }));
    await ready(d); await d.controller.openRecord(noteId);
    expect(d.host.querySelector('.vcp-record').textContent).toContain('Ustalenie usunięte');
    expect(d.host.querySelector('.vcp-record-body')).toBeNull(); expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not show a stale child when the current deletion state cannot be read', async () => {
    const d = view(); await ready(d); d.vault.getCarePlanNoteEntries.mockRejectedValue(Error('Fikcyjny błąd odczytu.'));
    await d.controller.openRecord(noteId);
    expect(d.host.querySelector('.vcp-record [role="alert"]')).not.toBeNull(); expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('shows a later retained document only inside the archive while ordinary navigation still reports removal', async () => {
    const d = view({ planChanges: { removedNoteIds: [noteId] } });
    const retainedNote = { id: noteId, patientId: d.plan.patientId, title: 'Fikcyjna późniejsza wersja', body: 'Fikcyjna nowa treść ze starszego klienta.', clinicalDateISO: '2026-10-21', careContext: null };
    d.vault.getCarePlanNoteEntries.mockImplementation(async () => ({ ...d.dto(), entries: [{ ...d.dto().entries[0], retainedNote }] }));
    await ready(d); expect(d.host.querySelector('.vcp-history').textContent).not.toContain(retainedNote.body);
    findButton(d.host, 'Wcześniejsze wersje planu').click();
    const archive = d.host.querySelector('.vcp-history-archive');
    expect(archive.textContent).toContain(text); expect(archive.textContent).toContain('Wersja zachowana po usunięciu');
    expect(archive.querySelector('.vcp-retained-note .vcp-record-body').textContent).toBe(retainedNote.body);
    expect(archive.textContent).toContain('21.10.2026'); expect(archive.querySelector(`[data-record-id="${noteId}"]`)).toBeNull();
    await d.controller.openRecord(noteId); expect(d.host.querySelector('.vcp-record').textContent).toContain('Ustalenie usunięte');
    expect(d.host.querySelector('.vcp-record-body')).toBeNull(); expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('never renders a retained document from another patient', async () => {
    const d = view({ planChanges: { removedNoteIds: [noteId] } });
    d.vault.getCarePlanNoteEntries.mockImplementation(async () => ({ ...d.dto(), entries: [{ ...d.dto().entries[0], retainedNote: {
      id: noteId, patientId: 'fictional-other-patient', title: 'Fikcyjny obcy dokument', body: 'Fikcyjna treść innego pacjenta.',
    } }] }));
    await ready(d); findButton(d.host, 'Wcześniejsze wersje planu').click();
    expect(d.host.querySelector('.vcp-history-archive').textContent).toContain(text);
    expect(d.host.querySelector('.vcp-retained-note')).toBeNull(); d.controller.destroy();
  });
});
