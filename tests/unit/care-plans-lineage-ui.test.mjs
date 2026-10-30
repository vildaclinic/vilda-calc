import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const findButton = (root, text) => root.querySelectorAll('button').find(button => button.textContent === text);

function editorWithResponse(response = {}, extraPlan = {}) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  doc.createElement = tag => {
    const element = createElement(tag), query = element.querySelector.bind(element);
    element.scrollTop = 0; element.scrollIntoView = () => {};
    element.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; element.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    element.querySelector = selector => selector === 'input:not([type=checkbox]):not([type=radio]),textarea,select'
      ? element.querySelectorAll('input,textarea,select').find(control => control.type !== 'checkbox' && control.type !== 'radio') || null
      : query(selector);
    if (tag === 'dialog') { element.showModal = () => { element.open = true; }; element.close = () => { element.open = false; }; }
    if (tag === 'form') element.reportValidity = () => true;
    return element;
  };
  doc.removeEventListener = () => {};
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const plan = { id: 'fictional-lineage-plan', patientId: 'fictional-lineage-patient', title: 'Fikcyjny plan sprzed zapisu',
    goal: 'Fikcyjne ustalenia.', status: 'active', steps: [], log: [], rev: 7, ...extraPlan };
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-lineage-account' }),
    listCarePlans: vi.fn(async () => [structuredClone(plan)]), listPatients: vi.fn(async () => []),
    mutateCarePlan: vi.fn(async () => ({ saved: false, ...response })),
  };
  const win = { document: doc, VildaVault: vault, setTimeout, clearTimeout, crypto: globalThis.crypto, matchMedia: () => ({ matches: false }) };
  loadBrowserScript('vilda_care_plans.js', win);
  const controller = win.VildaCarePlans.mount(host, { vault, full: true, planId: plan.id });
  return { doc, host, vault, controller, api: win.VildaCarePlans, plan };
}

describe('Care plan editor preserves uncertain earlier submissions for explicit review', () => {
  it.each([{ needsRefresh: true }, { reason: 'operation-outcome-expired' }])('explains %j without clearing the draft or retrying under a new identity', async response => {
    const d = editorWithResponse(response); await settle();
    findButton(d.host, 'Edytuj nazwę i cel').click();
    const form = d.doc.body.querySelector('.vcp-form'), title = form.querySelector('input'), text = form.querySelector('textarea');
    title.value = 'Fikcyjna zachowana zmiana tytułu'; text.value = 'Fikcyjny tekst do sprawdzenia w aktualnym planie.';
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(1);
    expect(form.querySelector('[role="alert"]').textContent).toBe('Nie można potwierdzić wyniku wcześniejszego zapisu. Zachowaj wpisaną treść, anuluj formularz i sprawdź aktualny plan przed ponownym zapisem.');
    expect(d.doc.body.querySelector('.vcp-dialog').open).toBe(true);
    expect(title.value).toBe('Fikcyjna zachowana zmiana tytułu');
    expect(text.value).toBe('Fikcyjny tekst do sprawdzenia w aktualnym planie.');
    expect(findButton(form, 'Zapisz').disabled).toBe(false);
    const request = d.vault.mutateCarePlan.mock.calls[0][0];
    await settle(); expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(1);
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(2);
    expect(d.vault.mutateCarePlan.mock.calls[1][0]).toEqual(request);
    d.controller.destroy();
  });
});

function fullStep(extra = {}) {
  return { id: 'fictional-lineage-step', title: 'Fikcyjny krok z dokumentacją', kind: 'Badanie', state: 'done',
    description: 'Fikcyjny opis bieżącej wersji.', reminderDateISO: '2026-10-29', reminderTime: '08:15',
    eventDateISO: '2026-11-20', eventTime: '10:15', completedDateISO: '2026-10-29', completionSource: 'performance',
    reminderNoteId: 'fictional-current-reminder', calendarNoteId: 'fictional-current-calendar', resultNoteId: null, ...extra };
}
function stepReview() {
  const current = fullStep(), alternate = fullStep({ title: 'Fikcyjny zachowany krok', kind: 'Oczekujący wynik',
    description: 'Fikcyjny zachowany opis.', reminderTime: '14:45', eventTime: '16:45', completionSource: 'result',
    resultNoteId: 'fictional-alternate-result', calendarNoteId: 'fictional-alternate-calendar' });
  return { version: 1, components: [{ key: 'step', stepId: current.id, projected: false, current,
    variants: [{ id: 'fictional-current-author', value: current, selected: true }, { id: 'care-root-' + 'a'.repeat(64), value: alternate, selected: false }] }] };
}

describe('Care plan review renders complete typed changes and original document links', () => {
  it('shows dates, both times, completion origins and existing documents without technical identities', async () => {
    const snapshot = stepReview(), d = editorWithResponse({}, { syncNeedsReview: true, syncReview: snapshot }); await settle();
    const review = d.host.querySelector('.vcp-sync-review'), versions = review.querySelector('.vcp-sync-versions');
    expect(versions.open).toBe(true);
    for (const text of ['Zachowane wersje zmian', 'Bieżący stan planu', 'Zachowana wersja 2', '08:15', '14:45', '10:15', '16:45',
      'Zapis wykonania', 'Zapis otrzymanego wyniku', 'Oczekujący wynik', 'Fikcyjny zachowany opis.', 'Brak powiązanego wyniku']) expect(versions.textContent).toContain(text);
    for (const value of ['fictional-current-author', 'care-root-', 'fictional-alternate-result', 'fictional-alternate-calendar', 'projected']) expect(versions.textContent).not.toContain(value);
    expect(versions.querySelector('[data-record-id="fictional-alternate-result"]')).not.toBeNull();
    expect(versions.querySelector('[data-record-id="fictional-alternate-calendar"]')).not.toBeNull();
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('shows the current open state separately when every retained authored state was closed', async () => {
    const closed = { status: 'closed', closedAtISO: new Date(2026, 9, 29, 10, 15, 30).toISOString(), closeReason: 'Fikcyjny powód', closeText: 'Fikcyjne zamknięcie.' };
    const current = { status: 'active', closedAtISO: null, closeReason: '', closeText: '' };
    const snapshot = { version: 1, components: [{ key: 'status', current, projected: true,
      variants: [{ id: 'fictional-closed-author', selected: false, value: closed }] }] };
    const d = editorWithResponse({}, { syncNeedsReview: true, syncReview: snapshot }); await settle();
    const versions = d.host.querySelector('.vcp-sync-component').querySelectorAll('.vcp-sync-version');
    expect(versions).toHaveLength(2);
    expect(versions[0].textContent).toContain('Bieżący stan planu'); expect(versions[0].textContent).toContain('Otwarty');
    expect(versions[1].textContent).toContain('Zachowana wersja 1'); expect(versions[1].textContent).toContain('Zamknięty');
    expect(versions[1].textContent).toContain('Fikcyjne zamknięcie.'); expect(versions[1].textContent).toContain('29.10.2026 · 10:15:30'); d.controller.destroy();
  });

  it.each([undefined, 'performance'])('treats an original result link as explicit result provenance despite legacy source %s', async source => {
    const snapshot = stepReview(), component = snapshot.components[0];
    component.current.resultNoteId = 'fictional-original-result';
    if (source === undefined) delete component.current.completionSource; else component.current.completionSource = source;
    const d = editorWithResponse({}, { syncNeedsReview: true, syncReview: snapshot }); await settle();
    const current = d.host.querySelector('.vcp-sync-version');
    expect(current.textContent).toContain('Rodzaj zakończenia: Zapis otrzymanego wyniku');
    expect(current.textContent).not.toContain('Rodzaj zakończenia: Zapis wykonania');
    expect(current.textContent).not.toContain('Nie zapisano źródła zakończenia'); d.controller.destroy();
  });

  it.each(['nieprawidłowa-data', '2026-02-31T10:15:30.000Z'])('does not render an invalid archived closure instant %s as a valid status or NaN', async closedAtISO => {
    const value = { status: 'closed', closedAtISO, closeReason: 'Fikcyjny powód', closeText: 'Fikcyjne zamknięcie.' };
    const snapshot = { version: 1, components: [{ key: 'status', current: value, projected: false,
      variants: [{ id: 'fictional-invalid-date-author', selected: true, value }] }] };
    const d = editorWithResponse({}, { log: [{ dateISO: '2026-10-29', text: 'Fikcyjny historyczny wpis.', resolution: snapshot }] }); await settle();
    expect(d.host.querySelector('.vcp-history').textContent).toContain('Fikcyjny historyczny wpis.');
    expect(d.host.querySelector('.vcp-history .vcp-sync-versions')).toBeNull();
    expect(d.host.textContent).not.toContain('NaN'); d.controller.destroy();
  });

  it('preserves alternate goals and the difference between an absent and scheduled further decision', async () => {
    const metadata = { title: 'Fikcyjny bieżący tytuł', goal: 'Fikcyjny bieżący cel.' }, decision = { needsDecision: false, decisionDueDateISO: null };
    const snapshot = { version: 1, components: [
      { key: 'metadata', current: metadata, projected: false, variants: [
        { id: 'fictional-metadata-current', selected: true, value: metadata },
        { id: 'fictional-metadata-alternate', selected: false, value: { title: 'Fikcyjny zachowany tytuł', goal: 'Fikcyjny zachowany cel.' } },
      ] },
      { key: 'decision', current: decision, projected: false, variants: [
        { id: 'fictional-decision-current', selected: true, value: decision },
        { id: 'fictional-decision-alternate', selected: false, value: { needsDecision: true, decisionDueDateISO: '2027-01-20' } },
      ] },
    ] };
    const d = editorWithResponse({}, { syncNeedsReview: true, syncReview: snapshot }); await settle();
    const metadataGroup = d.host.querySelector('[data-review-key="metadata"]'), decisionGroup = d.host.querySelector('[data-review-key="decision"]');
    expect(metadataGroup.textContent).toContain('Fikcyjny bieżący cel.'); expect(metadataGroup.textContent).toContain('Fikcyjny zachowany cel.');
    expect(decisionGroup.textContent).toContain('Dalsze postępowanie do ustalenia: Nie');
    expect(decisionGroup.textContent).toContain('Dalsze postępowanie do ustalenia: Tak');
    expect(decisionGroup.textContent).toContain('Bez terminu'); expect(decisionGroup.textContent).toContain('20.01.2027'); d.controller.destroy();
  });

  it('retains the same review in history after acknowledgment and reads the current original on demand', async () => {
    const snapshot = stepReview(), d = editorWithResponse({}, { log: [{ dateISO: '2026-10-29', text: 'Fikcyjne potwierdzenie przeglądu.', resolution: snapshot }] });
    const original = { id: 'fictional-alternate-result', patientId: d.plan.patientId, title: 'Fikcyjny oryginalny wynik', body: 'Fikcyjna bieżąca treść oryginału.',
      careContext: { version: 1, role: 'result', planId: d.plan.id, stepId: snapshot.components[0].stepId } };
    d.vault.getPatientNote = vi.fn(async () => structuredClone(original)); await settle();
    expect(d.host.querySelector('.vcp-sync-review')).toBeNull();
    const versions = d.host.querySelector('.vcp-history .vcp-sync-versions');
    expect(versions.open).toBe(false); expect(versions.textContent).toContain('Stan planu przed zapisaniem zmian');
    expect(versions.textContent).toContain('14:45'); expect(versions.textContent).toContain('16:45');
    versions.open = true; versions.dispatch('toggle');
    versions.querySelector('[data-record-id="fictional-alternate-result"]').click(); await settle();
    expect(d.vault.getPatientNote).toHaveBeenCalledWith(original.id);
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(original.body);
    findButton(d.host, '← Wróć do planu').click();
    expect(d.host.querySelector('.vcp-history .vcp-sync-versions').open).toBe(true);
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not imply a completed review for a conflict resolved by editing before acknowledgment', async () => {
    const snapshot = stepReview(), d = editorWithResponse({}, { syncNeedsReview: true, syncReview: snapshot,
      log: [{ dateISO: '2026-10-29', text: 'Zmieniono krok planu.', resolution: snapshot }] }); await settle();
    expect(d.host.querySelector('.vcp-sync-review')).not.toBeNull();
    const archived = d.host.querySelector('.vcp-history .vcp-sync-versions');
    expect(archived.textContent).toContain('Stan planu przed zapisaniem zmian');
    expect(archived.textContent).toContain('Wartości zachowane przed zapisaniem zmian');
    expect(archived.textContent).not.toContain('przed potwierdzeniem przeglądu');
    expect(archived.textContent).not.toContain('w chwili przeglądu');
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
});

function membershipFixture({ archived = false, snapshot = stepReview() } = {}) {
  const d = editorWithResponse(), patientId = d.plan.patientId, context = { version: 1, role: 'plan', status: 'active',
    syncNeedsReview: !archived, steps: [], log: archived ? [{ dateISO: '2026-10-29', text: 'Fikcyjny przegląd.', resolution: snapshot }] : [] };
  const parent = { id: d.plan.id, patientId, title: d.plan.title, category: 'care-plan', careContext: context };
  const result = { id: 'fictional-alternate-result', patientId, title: 'Fikcyjny wynik z drugiej wersji',
    careContext: { version: 1, role: 'result', planId: parent.id, stepId: 'fictional-lineage-step' } };
  const calendar = { id: 'fictional-alternate-calendar', patientId, title: 'Fikcyjny termin z drugiej wersji',
    careContext: { version: 1, role: 'calendar', planId: parent.id, stepId: 'fictional-lineage-step' } };
  d.vault.getCarePlanSyncReview = vi.fn(() => structuredClone(snapshot));
  return { ...d, parent, result, calendar, patientId };
}

describe('Patient Notes retain exact membership of typed current and archived review documents', () => {
  it.each([false, true])('routes original records before/after acknowledgment (archived=%s) without duplicating Notes', archived => {
    const d = membershipFixture({ archived }), source = [d.parent, d.result, d.calendar], before = JSON.stringify(source);
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([]);
    expect(d.api.resolveNoteDestination(source, d.result, d.patientId)).toEqual({ kind: 'care', role: 'result', planId: d.parent.id, noteId: d.result.id });
    expect(d.api.resolveNoteDestination(source, d.calendar, d.patientId)).toEqual({ kind: 'calendar', role: 'calendar', planId: d.parent.id, noteId: d.calendar.id });
    expect(JSON.stringify(source)).toBe(before);
    if (archived) expect(d.vault.getCarePlanSyncReview).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('keeps an explicitly detached calendar independent despite a retained historical reference', () => {
    const d = membershipFixture({ archived: true }); d.calendar.careContext = null;
    const source = [d.parent, d.calendar];
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([d.calendar]);
    expect(d.api.resolveNoteDestination(source, d.calendar, d.patientId)).toEqual({ kind: 'notes', noteId: d.calendar.id }); d.controller.destroy();
  });

  it('retains calendar membership through a legacy plain history reference to the same patient, plan and step', () => {
    const d = membershipFixture({ archived: true });
    d.parent.careContext.steps = [fullStep()];
    d.parent.careContext.log = [{ dateISO: '2026-10-29', text: 'Fikcyjny historyczny termin.', noteId: d.calendar.id }];
    const source = [d.parent, d.calendar], before = JSON.stringify(source);
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([]);
    expect(d.api.resolveNoteDestination(source, d.calendar, d.patientId)).toEqual({ kind: 'calendar', role: 'calendar', planId: d.parent.id, noteId: d.calendar.id });
    expect(JSON.stringify(source)).toBe(before); d.controller.destroy();
  });

  it.each(['patient', 'plan', 'step', 'missing-step', 'wrong-reference-field', 'unknown-role', 'detached'])('does not infer legacy calendar membership for %s', change => {
    const d = membershipFixture({ archived: true });
    d.parent.careContext.steps = [fullStep()];
    d.parent.careContext.log = [{ dateISO: '2026-10-29', text: 'Fikcyjny historyczny termin.', noteId: d.calendar.id }];
    if (change === 'patient') d.calendar.patientId = 'fictional-other-patient';
    if (change === 'plan') d.calendar.careContext.planId = 'fictional-other-plan';
    if (change === 'step') d.calendar.careContext.stepId = 'fictional-other-step';
    if (change === 'missing-step') delete d.calendar.careContext.stepId;
    if (change === 'wrong-reference-field') { delete d.parent.careContext.log[0].noteId; d.parent.careContext.log[0].resultNoteId = d.calendar.id; }
    if (change === 'unknown-role') d.calendar.careContext.role = 'future-role';
    if (change === 'detached') d.calendar.careContext = null;
    const source = [d.parent, d.calendar];
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([d.calendar]);
    expect(d.api.resolveNoteDestination(source, d.calendar, d.patientId)).toEqual({ kind: 'notes', noteId: d.calendar.id }); d.controller.destroy();
  });

  it.each(['future-version', 'wrong-step', 'untyped-value', 'invalid-variant-id', 'incidental-metadata-id'])('keeps documents visible when %s is not a valid matching step reference', kind => {
    const snapshot = stepReview();
    if (kind === 'future-version') snapshot.version = 2;
    if (kind === 'wrong-step') snapshot.components[0].stepId = 'fictional-unrelated-step';
    if (kind === 'untyped-value') delete snapshot.components[0].variants[1].value.eventTime;
    if (kind === 'invalid-variant-id') snapshot.components[0].variants[1].id = 'not a valid operation id';
    if (kind === 'incidental-metadata-id') snapshot.components = [{ key: 'metadata', projected: false,
      current: { title: 'Fikcyjny tytuł', goal: '', resultNoteId: 'fictional-alternate-result' },
      variants: [{ id: 'fictional-author', selected: true, value: { title: 'Fikcyjny tytuł', goal: '', resultNoteId: 'fictional-alternate-result' } }] }];
    const d = membershipFixture({ archived: true, snapshot }), source = [d.parent, d.result];
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([d.result]);
    expect(d.api.resolveNoteDestination(source, d.result, d.patientId)).toEqual({ kind: 'notes', noteId: d.result.id }); d.controller.destroy();
  });

  it.each(['patient', 'role', 'step'])('requires the original record to match the retained reference owner and %s', change => {
    const d = membershipFixture({ archived: true });
    if (change === 'patient') d.result.patientId = 'fictional-other-patient';
    if (change === 'role') d.result.careContext.role = 'calendar';
    if (change === 'step') d.result.careContext.stepId = 'fictional-unrelated-step';
    const source = [d.parent, d.result];
    expect(d.api.projectPatientNotes(source, d.patientId)).toEqual([d.result]); d.controller.destroy();
  });
});

describe('Plain history fallbacks remain visible until the complete corresponding typed review is readable', () => {
  const fallbackText = 'Fikcyjna pełna kopia tekstowa zachowanej wersji.';
  const fallback = extra => ({ dateISO: '2026-10-29', text: fallbackText, ...extra });

  it('replaces a current alternative fallback with its complete typed review without changing the stored history', async () => {
    const log = [fallback({ syncOrigin: 'alternative' }), { dateISO: '2026-10-29', text: 'Fikcyjna notatka autorska.' }], before = JSON.stringify(log);
    const d = editorWithResponse({}, { syncNeedsReview: true, syncReview: stepReview(), log }); await settle();
    const history = d.host.querySelector('.vcp-history');
    expect(history.textContent).not.toContain(fallbackText);
    expect(history.textContent).toContain('Fikcyjna notatka autorska.');
    expect(history.querySelectorAll('.vcp-timeline-entry')).toHaveLength(1);
    expect(d.host.querySelector('.vcp-sync-review .vcp-sync-versions')).not.toBeNull();
    expect(JSON.stringify(log)).toBe(before); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it.each(['missing', 'future-version', 'partial', 'missing-marker'])('keeps a current plaintext fallback when %s prevents exact typed replacement', async change => {
    const snapshot = stepReview(), entry = fallback({ syncOrigin: 'alternative' });
    if (change === 'future-version') snapshot.version = 2;
    if (change === 'partial') snapshot.components.push({ key: 'future-component' });
    if (change === 'missing-marker') delete entry.syncOrigin;
    const d = editorWithResponse({}, { syncNeedsReview: true, syncReview: change === 'missing' ? null : snapshot, log: [entry] }); await settle();
    expect(d.host.querySelector('.vcp-history').textContent).toContain(fallbackText); d.controller.destroy();
  });

  it('replaces only the archived fallback whose operation has a complete typed resolution', async () => {
    const resolvedBy = 'fictional-review-operation', resolution = { ...stepReview(), resolvedBy };
    const d = editorWithResponse({}, { log: [
      { dateISO: '2026-10-29', text: 'Fikcyjne rozstrzygnięcie zmian.', resolution },
      fallback({ reviewFallbackFor: resolvedBy }),
      { ...fallback({ reviewFallbackFor: 'fictional-unrelated-operation' }), text: 'Fikcyjna inna kopia tekstowa.' },
    ] }); await settle();
    const history = d.host.querySelector('.vcp-history');
    expect(history.textContent).not.toContain(fallbackText);
    expect(history.textContent).toContain('Fikcyjna inna kopia tekstowa.');
    expect(history.querySelector('.vcp-sync-versions')).not.toBeNull();
    expect(history.querySelectorAll('.vcp-timeline-entry')).toHaveLength(2); d.controller.destroy();
  });

  it.each(['missing-resolution', 'different-operation', 'future-version', 'partial', 'missing-marker'])('keeps archived plaintext when %s prevents exact typed replacement', async change => {
    const resolvedBy = 'fictional-review-operation', resolution = { ...stepReview(), resolvedBy }, entry = fallback({ reviewFallbackFor: resolvedBy });
    if (change === 'different-operation') resolution.resolvedBy = 'fictional-other-operation';
    if (change === 'future-version') resolution.version = 2;
    if (change === 'partial') resolution.components.push({ key: 'future-component' });
    if (change === 'missing-marker') delete entry.reviewFallbackFor;
    const d = editorWithResponse({}, { log: [
      { dateISO: '2026-10-29', text: 'Fikcyjne rozstrzygnięcie zmian.', resolution: change === 'missing-resolution' ? null : resolution }, entry,
    ] }); await settle();
    expect(d.host.querySelector('.vcp-history').textContent).toContain(fallbackText); d.controller.destroy();
  });
});
