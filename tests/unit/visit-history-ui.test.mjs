import { afterEach, describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Synthetic patients only. Execute the actual view; no extracted functions or
// fresh clinical calculations stand in for saved visit state.
const PID = 'fictional-visit-patient';
const opened = [];
const visit = (id, date, user = {}, extra = {}) => ({
  patientId: PID, visitId: id, clinicalDateISO: date, origin: 'explicit',
  savedAtISO: date + 'T10:25:00.000Z', revisionCount: 1,
  payload: { user: { age: 12, ageMonths: 3, height: 152.5, weight: 43.2, sex: 'M', ...user } },
  ...extra,
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(rows = [visit('visit-1', '2026-11-03')]) {
  const doc = atrapaDokumentu(), events = new Map(), locks = [];
  doc.addEventListener = (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); };
  doc.removeEventListener = (type, fn) => events.get(type)?.delete(fn);
  doc.dispatchEvent = event => { [...(events.get(event.type) || [])].forEach(fn => fn(event)); };
  const state = { userId: 'fictional-doctor', generation: 1, unlocked: true, patientCurrent: true };
  const vault = {
    isUnlocked: () => state.unlocked,
    getCurrentUser: () => state.unlocked ? { userId: state.userId } : null,
    captureSyncOperationSession: () => ({ userId: state.userId, generation: state.generation }),
    assertSyncOperationSession(token) {
      if (!state.unlocked || token.userId !== state.userId || token.generation !== state.generation) throw new Error('stale fictional owner');
    },
    onLock: vi.fn(fn => locks.push(fn)),
    listCarePlans: vi.fn(async () => []),
    getPatientVisits: vi.fn(async () => structuredClone(rows)),
    loadPatient: vi.fn(), restoreSnapshot: vi.fn(), saveSnapshot: vi.fn(),
  };
  const win = { document: doc, VildaVault: vault, setInterval, clearInterval, VildaDataImportExport: { applyLoadedUserData: vi.fn() } };
  loadBrowserScript('vilda_visit_history_ui.js', win);
  const opener = doc.body.appendChild(doc.createElement('button'));
  opener.textContent = 'Historia wizyt';
  opener.focus();
  const env = { win, doc, vault, state, opener, events,
    open: (opts = {}) => win.VildaVisitHistory.open(PID, { patientName: 'Pacjent fikcyjny', isCurrent: () => state.patientCurrent, ...opts }),
    close: () => win.VildaVisitHistory.close(),
    lock: () => { state.unlocked = false; state.generation++; locks.forEach(fn => fn()); },
    dialog: () => doc.body.querySelector('.vvisit-dialog'),
    detail: () => doc.body.querySelector('.vvisit-detail'),
    buttons: () => doc.body.querySelectorAll('.vvisit-visit'),
  };
  opened.push(env);
  return env;
}
afterEach(() => { opened.splice(0).forEach(env => env.close()); vi.useRealTimers(); });

describe('Historia wizyt — canonical read-only patient state', () => {
  it('shows stored measurements and age, then another visit without loading or saving anything', async () => {
    const env = setup([visit('current', '2026-11-03'), visit('older', '2025-09-01', { age: 11, ageMonths: 0, height: 140, weight: 37 })]);
    await env.open();
    expect(env.vault.getPatientVisits).toHaveBeenCalledExactlyOnceWith(PID);
    expect(env.detail().textContent).toContain('152,5 cm');
    expect(env.detail().textContent).toContain('12 lat 3 mies.');
    env.buttons()[1].click();
    expect(env.detail().textContent).toContain('01.09.2025');
    expect(env.detail().textContent).toContain('140 cm');
    expect(env.detail().textContent).toContain('11 lat');
    expect(env.buttons().map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(env.vault.loadPatient).not.toHaveBeenCalled();
    expect(env.vault.restoreSnapshot).not.toHaveBeenCalled();
    expect(env.vault.saveSnapshot).not.toHaveBeenCalled();
    expect(env.win.VildaDataImportExport.applyLoadedUserData).not.toHaveBeenCalled();
  });

  it('distinguishes visits on the same day without exposing persistent identifiers', async () => {
    const env = setup([visit('secret-visit-a', '2026-11-03'), visit('secret-visit-b', '2026-11-03')]);
    await env.open();
    expect(env.buttons()[0].textContent).toContain('Wpis 1 z 2 tego dnia');
    expect(env.buttons()[1].textContent).toContain('Wpis 2 z 2 tego dnia');
    expect(env.dialog().textContent).not.toContain('secret-visit');
  });

  it('preserves a recorded infant age in weeks and displays the latest in-place update time', async () => {
    const env = setup([visit('infant', '2026-11-03', { age: 0, ageMonths: 0, ageWeeks: 8 }, { updatedAtISO: '2026-11-05T14:30:00.000Z' })]);
    await env.open();
    expect(env.buttons()[0].textContent).toContain('Wiek: 8 tyg.');
    expect(env.detail().textContent).toContain('8 tyg.');
    const expected = new Date('2026-11-05T14:30:00.000Z').toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
    expect(env.detail().textContent).toContain('Ostatni zapis tej wizyty: ' + expected);
  });

  it.each(['savedAt', 'measuredAt'])('labels inferred visits and the date source %s', async dateSource => {
    const env = setup([visit('legacy', '2024-09-03', {}, { origin: 'legacy-inferred', dateSource, revisionCount: 4 })]);
    await env.open();
    expect(env.detail().textContent).toContain('Wizyta odtworzona z dawnych zapisów');
    expect(env.detail().textContent).toContain(dateSource === 'savedAt' ? 'Faktyczna data wizyty nie jest potwierdzona' : 'zapisanej daty pomiaru');
    expect(env.detail().textContent).toContain('Zachowane wersje tej wizyty: 4');
  });

  it('uses no current or unrelated clinical state, HTML, or inferred note associations', async () => {
    const env = setup([visit('safe', '2026-11-03', {}, {
      payload: { user: { age: 0, ageMonths: 8, height: '<img src=x onerror=alert(1)>', weight: null },
        advanced: { motherHeight: 168, fatherHeight: 182 },
        notes: [{ body: 'NOT A VISIT-LINKED NOTE' }],
        treatment: 'NOT A VISIT-LINKED TREATMENT' },
    })]);
    await env.open({ patientName: '<script>fictional name</script>' });
    expect(env.detail().textContent).toContain('0 lat 8 mies.');
    expect(env.detail().textContent).toContain('<img src=x onerror=alert(1)> cm');
    expect(env.detail().textContent).toContain('168 cm');
    expect(env.detail().textContent).not.toContain('VISIT-LINKED');
    expect(env.dialog().querySelectorAll('script, img')).toHaveLength(0);
    expect(env.detail().textContent).not.toContain('BMI');
  });

  it('shows documents linked to the exact visit even for two encounters on the same day', async () => {
    const env = setup([visit('first', '2026-11-03'), visit('second', '2026-11-03')]);
    env.win.__VILDA_HOME_GABINET_PREVIEW__ = true;
    env.win.VildaLabHistory = {isResultNote: note => !!note.labResult, isClcrResultNote: () => false};
    env.vault.listPatientNotesForPatient = vi.fn(async () => [
      {patientId: PID, title: 'Tylko pierwsza', visitContext: {visitId: 'first'}},
      {patientId: PID, title: 'Fikcyjny wynik', clinicalDateISO: '2026-10-26', labResult: {}, visitContext: {visitId: 'first'}},
      {patientId: PID, title: 'Krok planu', dueDateISO: '2026-11-24T00:00:00.000Z', careContext: {role: 'step'},
        visitContext: {visitId: 'first'}},
      {patientId: PID, title: 'Tylko druga', visitContext: {visitId: 'second'}, reminderContext: {version: 1}},
      {patientId: PID, title: 'Ogólna notatka', clinicalDateISO: '2026-11-03'},
      {patientId: 'foreign', title: 'Inna osoba', visitContext: {visitId: 'first'}},
      {patientId: PID, title: 'Leczenie', treatmentContext: {followups: [
        {visitContext: {visitId: 'first'}, body: 'Kontrola pierwsza'},
        {visitContext: {visitId: 'second'}, body: 'Kontrola druga'}
      ]}}
    ]);
    await env.open({onEdit: vi.fn()});
    expect(env.detail().textContent).toContain('Tylko pierwsza');
    expect(env.detail().textContent).toContain('Kontrola pierwsza');
    expect(env.detail().textContent).toContain('Data badania · 26.10.2026');
    expect(env.detail().textContent).toContain('Termin · 24.11.2026');
    expect(env.detail().textContent).not.toMatch(/Tylko druga|Kontrola druga|Ogólna notatka|Inna osoba/);
    env.buttons()[1].click();
    expect(env.detail().textContent).toContain('Tylko druga');
    expect(env.detail().textContent).toContain('Kontrola druga');
    expect(env.detail().textContent).not.toMatch(/Tylko pierwsza|Kontrola pierwsza|Fikcyjny wynik|Krok planu|24.11.2026/);
  });

  it('shows only care-plan entries recorded at the selected visit, once, from either native representation', async () => {
    const env = setup([visit('first', '2026-10-01'), visit('second', '2026-09-01')]);
    env.win.__VILDA_HOME_GABINET_PREVIEW__ = true;
    const first = {visitId: 'first'}, second = {visitId: 'second'};
    env.vault.listPatientNotesForPatient = vi.fn(async () => [
      {id: 'parent', patientId: PID, title: 'Plan kontroli', visitContext: first, careContext: {role: 'plan'}, body: 'Późniejszy opis planu'},
      {id: 'linked', patientId: PID, title: 'Ustalenie z wizyty', visitContext: first, careContext: {role: 'note'}}
    ]);
    env.vault.listCarePlans.mockResolvedValue([
      {id: 'parent', patientId: PID, title: 'Plan kontroli', visitContext: first, log: [
        {visitContext: first, noteId: 'linked', text: 'Ustalenie z wizyty'},
        {visitContext: second, text: 'Zamknięto krok'},
        {text: 'Wpis poza wizytą'}
      ]},
      {state: {record: {id: 'staged', patientId: PID, title: 'Plan żywienia', careContext: {log: [
        {visitContext: first, text: 'Omówiono plan żywienia'}
      ]}}}},
      {id: 'foreign', patientId: 'another', title: 'Inny pacjent', visitContext: first}
    ]);
    await env.open({onEdit: vi.fn()});
    expect(env.vault.listCarePlans).toHaveBeenCalledWith({patientId: PID});
    const detail = env.detail().textContent;
    expect(detail.match(/Plan kontroli/g)).toHaveLength(1);
    expect(detail.match(/Ustalenie z wizyty/g)).toHaveLength(1);
    expect(detail).toContain('Omówiono plan żywienia');
    expect(detail).not.toMatch(/Późniejszy opis planu|Zamknięto krok|Wpis poza wizytą|Inny pacjent/);
    env.buttons()[1].click();
    expect(env.detail().textContent).toContain('Zamknięto krok');
    expect(env.detail().textContent).not.toMatch(/Omówiono plan żywienia|Ustalenie z wizyty/);
  });

  it('handles empty visits and filters a defensive foreign-patient row', async () => {
    const env = setup([visit('foreign', '2026-11-03', {}, { patientId: 'someone-else' })]);
    await env.open();
    expect(env.detail().textContent).toContain('Brak zapisanych wizyt');
    expect(env.buttons()).toHaveLength(0);
  });

  it('has an accessible dialog, selection announcements, keyboard close and focus return', async () => {
    const env = setup();
    await env.open();
    expect(env.dialog().getAttribute('aria-labelledby')).toBeTruthy();
    expect(env.dialog().getAttribute('aria-describedby')).toBeTruthy();
    expect(env.dialog().querySelector('[role="status"]').textContent).toContain('03.11.2026');
    expect(env.doc.activeElement.className).toBe('vvisit-close');
    const lastButton = env.buttons()[0];
    const tab = { type: 'keydown', key: 'Tab', shiftKey: true, preventDefault: vi.fn() };
    env.doc.dispatchEvent(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(env.doc.activeElement).toBe(lastButton);
    env.doc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: vi.fn() });
    expect(env.dialog()).toBeNull();
    expect(env.doc.activeElement).toBe(env.opener);
    expect([...env.events.values()].every(listeners => listeners.size === 0)).toBe(true);
  });

  it('shows an error with a retry without exposing the exception or patient payload', async () => {
    const env = setup();
    env.vault.getPatientVisits.mockRejectedValueOnce(new Error('SECRET ERROR DATA'));
    await env.open();
    expect(env.detail().textContent).toContain('Nie udało się odczytać');
    expect(env.detail().textContent).not.toContain('SECRET');
    env.detail().querySelector('button').click();
    await vi.waitFor(() => expect(env.detail().textContent).toContain('152,5 cm'));
    expect(env.vault.getPatientVisits).toHaveBeenCalledTimes(2);
  });
});

describe('Historia wizyt — owner fencing and plaintext cleanup', () => {
  it.each(['account', 'generation', 'patient', 'lock'])('discards a deferred result after %s changes', async change => {
    const env = setup(), pending = deferred();
    env.vault.getPatientVisits.mockReturnValueOnce(pending.promise);
    const reading = env.open();
    if (change === 'account') env.state.userId = 'another-fictional-doctor';
    if (change === 'generation') env.state.generation++;
    if (change === 'patient') env.state.patientCurrent = false;
    if (change === 'lock') env.lock();
    pending.resolve([visit('do-not-paint', '2026-11-03', { height: 'CONFIDENTIAL' })]);
    await reading;
    expect(env.dialog()).toBeNull();
    expect(env.doc.body.textContent).not.toContain('CONFIDENTIAL');
  });

  it('immediately clears all already rendered plaintext when the vault locks', async () => {
    const env = setup();
    await env.open();
    const oldDialog = env.dialog(), oldDetail = env.detail();
    expect(oldDetail.textContent).toContain('152,5 cm');
    env.lock();
    expect(env.dialog()).toBeNull();
    expect(oldDialog.textContent).toBe('');
    expect(oldDetail.textContent).toBe('');
    expect(oldDialog.isConnected).toBe(false);
    expect(env.doc.body.textContent).not.toContain('Pacjent fikcyjny');
  });

  it('removes rendered data after a silent session change even without interaction', async () => {
    vi.useFakeTimers();
    const env = setup();
    await env.open();
    env.state.generation++;
    await vi.advanceTimersByTimeAsync(250);
    expect(env.dialog()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cannot replace a newly opened patient history with an earlier request', async () => {
    const env = setup(), first = deferred();
    env.vault.getPatientVisits.mockReturnValueOnce(first.promise);
    const stale = env.open({ patientName: 'Fictional first patient' });
    await env.open({ patientName: 'Fictional second patient' });
    first.resolve([visit('stale', '2020-01-01', { height: 'STALE HEIGHT' })]);
    await stale;
    expect(env.dialog().textContent).toContain('Fictional second patient');
    expect(env.dialog().textContent).not.toContain('STALE HEIGHT');
    expect(env.vault.onLock).toHaveBeenCalledOnce();
  });

  it('closes on clearing the patient form and skips reads when locked or lacking a session guard', async () => {
    const env = setup();
    await env.open();
    env.doc.dispatchEvent({ type: 'vilda:user-state-cleared' });
    expect(env.dialog()).toBeNull();
    env.vault.getPatientVisits.mockClear();
    env.state.unlocked = false;
    expect(await env.open()).toBe(false);
    env.state.unlocked = true;
    delete env.vault.captureSyncOperationSession;
    expect(await env.open()).toBe(false);
    expect(env.vault.getPatientVisits).not.toHaveBeenCalled();
  });
});
