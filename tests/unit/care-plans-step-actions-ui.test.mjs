import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const findButton = (root, text) => root.querySelectorAll('button').find(button => button.textContent === text);
const control = (root, label) => root.querySelectorAll('input,textarea,select').find(input => input.getAttribute('aria-label') === label);
const confirmation = root => root.querySelectorAll('.vcp-check').find(label => label.textContent === 'Potwierdzam, że to otrzymany wynik tego kroku').querySelector('input');
const actualDay = '2001-02-03';

function step(extra = {}) {
  return { id: 'fictional-step-actions-step', title: 'Fikcyjny krok do rozstrzygnięcia', kind: 'Badanie',
    state: 'waiting', description: 'Zachowane fikcyjne ustalenia.', reminderDateISO: '2001-02-01',
    eventDateISO: '2099-02-01', eventTime: '09:15', calendarNoteId: 'fictional-step-actions-booking',
    completedDateISO: null, completionSource: undefined, resultNoteId: null, ...extra };
}

function view({ response = { saved: false, conflict: true }, planChanges = {}, vaultChanges = {} } = {}) {
  const doc = atrapaDokumentu(), createElement = doc.createElement;
  doc.createElement = tag => {
    const element = createElement(tag), query = element.querySelector.bind(element);
    element.scrollTop = 0; element.scrollIntoView = () => {};
    element.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; element.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    element.querySelector = selector => selector === 'input:not([type=checkbox]):not([type=radio]),textarea,select'
      ? element.querySelectorAll('input,textarea,select').find(input => input.type !== 'checkbox' && input.type !== 'radio') || null
      : query(selector);
    if (tag === 'dialog') { element.showModal = () => { element.open = true; }; element.close = () => { element.open = false; }; }
    if (tag === 'form') element.reportValidity = () => true;
    return element;
  };
  doc.removeEventListener = () => {};
  const host = doc.createElement('div'); doc.body.appendChild(host);
  const plan = { id: 'fictional-step-actions-plan', patientId: 'fictional-step-actions-patient',
    title: 'Fikcyjny plan', status: 'active', steps: [step(), step({ id: 'fictional-step-actions-other', title: 'Drugi fikcyjny krok', state: 'pending' })],
    log: [], rev: 7, ...planChanges };
  const vault = {
    isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-step-actions-account' }),
    listCarePlans: vi.fn(async () => [structuredClone(plan)]), listPatients: vi.fn(async () => []),
    mutateCarePlan: vi.fn(async () => structuredClone(response)), ...vaultChanges,
  };
  const win = { document: doc, VildaVault: vault, setTimeout, clearTimeout, crypto: globalThis.crypto, matchMedia: () => ({ matches: false }) };
  loadBrowserScript('vilda_care_plans.js', win);
  const controller = win.VildaCarePlans.mount(host, { vault, full: true, planId: plan.id });
  return { doc, host, vault, controller, plan };
}

describe('Care plan single-step omission form', () => {
  it.each(['', '   ', 'x'.repeat(20001)])('rejects an absent or over-limit reason before calling the vault', async reason => {
    const d = view(); await settle(); findButton(d.host, 'Pomiń krok').click();
    const form = d.doc.body.querySelector('.vcp-form');
    control(form, 'Powód pominięcia').value = reason; control(form, 'Data decyzji').value = actualDay;
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    expect(form.querySelector('[role="alert"]').textContent).toContain('Podaj powód pominięcia');
    expect(control(form, 'Powód pominięcia').value).toBe(reason); d.controller.destroy();
  });

  it.each(['', '2026-02-31', '1899-12-31', '2999-12-31'])('rejects an absent, invalid or future decision day %s', async value => {
    const d = view(); await settle(); findButton(d.host, 'Pomiń krok').click();
    const form = d.doc.body.querySelector('.vcp-form');
    control(form, 'Powód pominięcia').value = 'Fikcyjny powód.'; control(form, 'Data decyzji').value = value;
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    expect(form.querySelector('[role="alert"]').textContent).toContain('Podaj prawidłową datę decyzji'); d.controller.destroy();
  });

  it('submits only the selected step and explicit reason/date, preserving the draft and operation identity after conflict', async () => {
    const d = view(), before = structuredClone(d.plan); await settle(); findButton(d.host, 'Pomiń krok').click();
    const form = d.doc.body.querySelector('.vcp-form');
    control(form, 'Powód pominięcia').value = '  Fikcyjne odstąpienie od oczekiwania.  ';
    control(form, 'Data decyzji').value = actualDay;
    expect(form.textContent).toContain('Dotychczasowe wykonanie, wyniki i rezerwacja w Terminarzu pozostaną zachowane.');
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(1);
    const request = d.vault.mutateCarePlan.mock.calls[0][0];
    expect(request).toEqual({ action: 'omitStep', stepId: before.steps[0].id,
      text: 'Fikcyjne odstąpienie od oczekiwania.', dateISO: actualDay, operationId: expect.any(String),
      planId: before.id, patientId: before.patientId, baseRev: before.rev });
    expect(control(form, 'Powód pominięcia').value).toBe('  Fikcyjne odstąpienie od oczekiwania.  ');
    expect(control(form, 'Data decyzji').value).toBe(actualDay);
    expect(d.doc.body.querySelector('.vcp-dialog').open).toBe(true);
    expect(findButton(form, 'Zapisz pominięcie').disabled).toBe(false);
    expect(d.plan).toEqual(before);
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(2);
    expect(d.vault.mutateCarePlan.mock.calls[1][0]).toEqual(request); d.controller.destroy();
  });

  it('requires sync review before an omission and hides the action for completed/cancelled steps and closed plans', async () => {
    const review = view({ planChanges: { syncNeedsReview: true } }); await settle();
    const omitted = findButton(review.host, 'Pomiń krok'); expect(omitted.disabled).toBe(true); omitted.click();
    expect(review.doc.body.querySelector('.vcp-dialog')).toBeNull(); review.controller.destroy();
    for (const state of ['done', 'cancelled']) {
      const d = view({ planChanges: { steps: [step({ state })] } }); await settle();
      expect(findButton(d.host, 'Pomiń krok')).toBeUndefined();
      if (state === 'cancelled') { expect(d.host.textContent).toContain('Niewykonany'); expect(d.host.textContent).not.toContain('Pominięty'); }
      d.controller.destroy();
    }
    const closed = view({ planChanges: { status: 'closed' } }); await settle();
    expect(findButton(closed.host, 'Pomiń krok')).toBeUndefined(); closed.controller.destroy();
  });
});

function omissionResult(extra = {}, envelope = {}) {
  return { planId: 'fictional-step-actions-plan', rev: 7,
    omissions: { 'fictional-step-actions-step': { protected: true, confirmed: true,
      noteId: 'care-omit-fictional-step-actions', reasonAvailable: true, dateISO: actualDay,
      reason: 'Fikcyjne uzasadnienie potwierdzone przez sejf.', ...extra } }, ...envelope };
}

describe('Care plan omission provenance and deliberate restore', () => {
  it('shows the current reason only after a matching confirmed proof and submits an explicit restore without replacing old facts', async () => {
    const d = view({ planChanges: { steps: [step({ state: 'cancelled', completedDateISO: '2001-01-30', completionSource: 'performance' })] },
      vaultChanges: { getCarePlanStepOmissions: vi.fn(async () => omissionResult()) } }); await settle();
    const current = d.host.querySelector('[data-step-id="fictional-step-actions-step"]');
    expect(current.textContent).toContain('Pominięty'); expect(current.textContent).toContain('Fikcyjne uzasadnienie potwierdzone przez sejf.');
    expect(d.vault.getCarePlanStepOmissions).toHaveBeenCalledWith(d.plan.id);
    findButton(current, 'Wznów pominięty krok').click();
    const form = d.doc.body.querySelector('.vcp-form');
    expect(control(form, 'Stan po wznowieniu').value).toBe('');
    control(form, 'Powód wznowienia kroku').value = 'Fikcyjna świadoma zmiana ustalenia.';
    control(form, 'Data wznowienia kroku').value = actualDay;
    form.dispatch('submit'); await settle(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    control(form, 'Stan po wznowieniu').value = 'waiting';
    form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledWith({ action: 'editStep', restoreOmitted: true,
      stepId: d.plan.steps[0].id, step: { state: 'waiting' }, text: 'Fikcyjna świadoma zmiana ustalenia.',
      dateISO: actualDay, planId: d.plan.id, patientId: d.plan.patientId, baseRev: d.plan.rev, operationId: expect.any(String) });
    expect(d.plan.steps[0].completedDateISO).toBe('2001-01-30');
    expect(d.plan.steps[0].completionSource).toBe('performance');
    expect(d.plan.steps[0].calendarNoteId).toBe('fictional-step-actions-booking');
    expect(control(form, 'Powód wznowienia kroku').value).toBe('Fikcyjna świadoma zmiana ustalenia.');
    expect(control(form, 'Data wznowienia kroku').value).toBe(actualDay); d.controller.destroy();
  });

  it.each([
    [{ confirmed: false }, {}], [{ protected: false }, {}], [{ reasonAvailable: false }, {}], [{ reason: '' }, {}],
    [{ dateISO: null }, {}], [{}, { rev: 8 }], [{}, { planId: 'fictional-other-plan' }],
  ])('retains a neutral cancelled label when the current reason is not proven: %j %j', async (extra, envelope) => {
    const d = view({ planChanges: { steps: [step({ state: 'cancelled' })] },
      vaultChanges: { getCarePlanStepOmissions: vi.fn(async () => omissionResult(extra, envelope)) } }); await settle();
    const current = d.host.querySelector('[data-step-id="fictional-step-actions-step"]');
    expect(current.textContent).toContain('Niewykonany'); expect(current.textContent).not.toContain('Pominięty');
    expect(current.querySelector('.vcp-omission-reason')).toBeNull(); d.controller.destroy();
  });

  it('drops previously confirmed current reason when its separate proof is unavailable on refresh', async () => {
    const proof = vi.fn(async () => omissionResult()), d = view({ planChanges: { steps: [step({ state: 'cancelled' })] }, vaultChanges: { getCarePlanStepOmissions: proof } }); await settle();
    expect(d.host.querySelector('.vcp-omission-reason')).not.toBeNull();
    proof.mockRejectedValueOnce(new Error('Fikcyjnie brak oryginalnego uzasadnienia.'));
    await d.controller.refresh();
    expect(d.host.querySelector('.vcp-omission-reason')).toBeNull();
    expect(d.host.querySelector('[data-step-id="fictional-step-actions-step"]').textContent).toContain('Niewykonany'); d.controller.destroy();
  });
});

function resultRecord(extra = {}) {
  return { id: 'fictional-step-actions-result', patientId: 'fictional-step-actions-patient', title: 'Fikcyjny istniejący wynik',
    category: 'wynik-badania', rev: 3, updatedAtISO: '2001-02-05T10:00:00.000Z', clinicalDateISO: '2001-02-01',
    body: 'Fikcyjna pełna treść oryginalnego wyniku <tekst>.', careContext: null,
    labResult: { test: 'Fikcyjne badanie', valueNum: 0, unit: 'jednostka testowa' }, ...extra };
}
async function resultEditor({ extraVault = {}, original = resultRecord() } = {}) {
  const { body: _body, careContext: _context, ...metadata } = original;
  const d = view({ vaultChanges: {
    listCarePlanResultCandidates: vi.fn(async () => [metadata, { ...metadata, id: 'fictional-other-patient-result', patientId: 'fictional-other-patient' }]),
    getCarePlanResultCandidate: vi.fn(async () => structuredClone(original)), ...extraVault,
  } }); await settle(); findButton(d.host, 'Podepnij istniejący wynik').click(); await settle();
  return { ...d, form: d.doc.body.querySelector('.vcp-form'), original, metadata };
}
async function chooseResult(d, id = d.original.id) {
  control(d.form, 'Wybierz wynik').value = id; control(d.form, 'Wybierz wynik').dispatch('change'); await settle();
}

describe('Care plan links an original result by explicit receipt confirmation', () => {
  it('shows the full original with its own clinical date and zero numeric value while keeping receipt date blank', async () => {
    const d = await resultEditor();
    expect(control(d.form, 'Wybierz wynik').querySelectorAll('option').map(option => option.value)).toEqual(['', d.original.id]);
    expect(findButton(d.form, 'Podepnij wynik').disabled).toBe(true);
    await chooseResult(d);
    expect(d.vault.getCarePlanResultCandidate).toHaveBeenCalledWith({ planId: d.plan.id, stepId: d.plan.steps[0].id,
      noteId: d.original.id, linkedRev: d.original.rev, linkedUpdatedAtISO: d.original.updatedAtISO });
    const preview = d.form.querySelector('.vcp-result-preview');
    expect(preview.getAttribute('aria-label')).toBe('Podgląd wybranego wyniku');
    expect(preview.getAttribute('data-note-id')).toBe(d.original.id);
    expect(preview.textContent).toContain(d.original.body);
    expect(preview.textContent).toContain('01.02.2001');
    expect(preview.textContent).toContain('Zapisany wynik: 0 jednostka testowa');
    expect(control(d.form, 'Data otrzymania wyniku').value).toBe('');
    expect(confirmation(d.form).checked).toBe(false);
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('requires the doctor to confirm receipt and an actual date, then sends only the original identity and selected stamps', async () => {
    const d = await resultEditor(); await chooseResult(d);
    control(d.form, 'Data otrzymania wyniku').value = actualDay;
    d.form.dispatch('submit'); await settle(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    confirmation(d.form).checked = true; control(d.form, 'Data otrzymania wyniku').value = '';
    d.form.dispatch('submit'); await settle(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    control(d.form, 'Data otrzymania wyniku').value = '2999-12-31';
    d.form.dispatch('submit'); await settle(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    control(d.form, 'Data otrzymania wyniku').value = actualDay;
    d.form.dispatch('submit'); await settle();
    const request = d.vault.mutateCarePlan.mock.calls[0][0];
    expect(request).toEqual({ action: 'linkResult', stepId: d.plan.steps[0].id, noteId: d.original.id,
      linkedRev: d.original.rev, linkedUpdatedAtISO: d.original.updatedAtISO, dateISO: actualDay,
      confirmReceived: true, continuation: 'existing', decisionDateISO: null, next: null,
      planId: d.plan.id, patientId: d.plan.patientId, baseRev: d.plan.rev, operationId: expect.any(String) });
    expect(control(d.form, 'Data otrzymania wyniku').value).toBe(actualDay);
    expect(control(d.form, 'Wybierz wynik').value).toBe(d.original.id);
    expect(confirmation(d.form).checked).toBe(true);
    expect(d.form.querySelector('.vcp-result-preview').textContent).toContain(d.original.body);
    d.form.dispatch('submit'); await settle();
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(2);
    expect(d.vault.mutateCarePlan.mock.calls[1][0]).toEqual(request); d.controller.destroy();
  });

  it('preserves the original selection and receipt date when source validation throws during commit', async () => {
    const d = await resultEditor({ extraVault: { mutateCarePlan: vi.fn(async () => { throw new Error('Fikcyjnie zmieniono wynik.'); }) } }); await chooseResult(d);
    confirmation(d.form).checked = true; control(d.form, 'Data otrzymania wyniku').value = actualDay;
    d.form.dispatch('submit'); await settle();
    expect(d.form.querySelector('[role="alert"]').textContent).toBe('Fikcyjnie zmieniono wynik.');
    expect(control(d.form, 'Data otrzymania wyniku').value).toBe(actualDay);
    expect(control(d.form, 'Wybierz wynik').value).toBe(d.original.id);
    expect(findButton(d.form, 'Podepnij wynik').disabled).toBe(false);
    expect(d.vault.mutateCarePlan).toHaveBeenCalledTimes(1); d.controller.destroy();
  });

  it('clears receipt confirmation when the selected result is deliberately removed from the picker by search', async () => {
    const d = await resultEditor(); await chooseResult(d);
    confirmation(d.form).checked = true; control(d.form, 'Data otrzymania wyniku').value = actualDay;
    control(d.form, 'Szukaj wyniku').value = 'nieistniejący fikcyjny wynik'; control(d.form, 'Szukaj wyniku').dispatch('input');
    expect(control(d.form, 'Wybierz wynik').value).toBe(''); expect(control(d.form, 'Data otrzymania wyniku').value).toBe('');
    expect(confirmation(d.form).checked).toBe(false); expect(d.form.querySelector('.vcp-result-preview').hidden).toBe(true);
    expect(findButton(d.form, 'Podepnij wynik').disabled).toBe(true); d.controller.destroy();
  });

  it('rejects a wrong-patient preview and leaves no editable receipt or source content', async () => {
    const d = await resultEditor({ extraVault: { getCarePlanResultCandidate: vi.fn(async () => resultRecord({ patientId: 'fictional-other-patient' })) } }); await chooseResult(d);
    expect(d.form.querySelector('.vcp-result-preview').hidden).toBe(true);
    expect(d.form.querySelector('.vcp-result-preview').textContent).toBe('');
    expect(control(d.form, 'Data otrzymania wyniku').disabled).toBe(true);
    expect(findButton(d.form, 'Podepnij wynik').disabled).toBe(true);
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('ignores a result response delivered after its form was cancelled', async () => {
    let resolvePreview;
    const pending = new Promise(resolve => { resolvePreview = resolve; });
    const d = await resultEditor({ extraVault: { getCarePlanResultCandidate: vi.fn(() => pending) } });
    control(d.form, 'Wybierz wynik').value = d.original.id; control(d.form, 'Wybierz wynik').dispatch('change');
    findButton(d.form, 'Anuluj').click(); resolvePreview(d.original); await settle();
    expect(d.doc.body.querySelector('.vcp-dialog')).toBeNull();
    expect(d.host.querySelector('.vcp-result-preview')).toBeNull();
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not display a preview returned after the account changed', async () => {
    let resolvePreview;
    const pending = new Promise(resolve => { resolvePreview = resolve; });
    const d = await resultEditor({ extraVault: { getCarePlanResultCandidate: vi.fn(() => pending) } });
    control(d.form, 'Wybierz wynik').value = d.original.id; control(d.form, 'Wybierz wynik').dispatch('change');
    d.vault.getCurrentUser = () => ({ userId: 'fictional-new-account' }); resolvePreview(d.original); await settle();
    expect(d.form.querySelector('.vcp-result-preview').textContent).not.toContain(d.original.body);
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('keeps the newest explicit candidate-list refresh when an older read arrives later', async () => {
    let resolveOld;
    const old = new Promise(resolve => { resolveOld = resolve; });
    const newer = resultRecord({ id: 'fictional-newer-list-result', title: 'Fikcyjny nowszy wynik' });
    const list = vi.fn().mockImplementationOnce(() => old).mockResolvedValueOnce([newer]);
    const d = await resultEditor({ extraVault: { listCarePlanResultCandidates: list } });
    findButton(d.form, 'Odśwież listę wyników').click(); await settle();
    resolveOld([d.metadata]); await settle();
    expect(control(d.form, 'Wybierz wynik').querySelectorAll('option').map(option => option.value)).toEqual(['', newer.id]);
    expect(control(d.form, 'Wybierz wynik').value).toBe('');
    expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
});

describe('Care plan original result previews use the scoped reference API', () => {
  it.each([null, { version: 1, role: 'result', planId: 'fictional-other-creator', stepId: 'fictional-other-step' }])('opens a current original with context %j only through the exact step reference', async careContext => {
    const original = resultRecord({ careContext }), getPatientNote = vi.fn();
    const d = view({ planChanges: { steps: [step({ state: 'done', resultNoteId: original.id })] }, vaultChanges: {
      getPatientNote, getCarePlanResultReference: vi.fn(async () => ({ note: original, relation: 'current' })),
    } }); await settle(); findButton(d.host, 'Otwórz wynik').click(); await settle();
    expect(d.vault.getCarePlanResultReference).toHaveBeenCalledWith({ planId: d.plan.id, stepId: d.plan.steps[0].id, noteId: original.id });
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(original.body);
    expect(getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not fall back to a broad original getter after the current reference was refused', async () => {
    const original = resultRecord({ careContext: { version: 1, role: 'result', planId: 'fictional-step-actions-plan' } });
    const d = view({ planChanges: { steps: [step({ state: 'done', resultNoteId: original.id })] }, vaultChanges: {
      getPatientNote: vi.fn(async () => original), getCarePlanResultReference: vi.fn(async () => null),
    } }); await settle(); findButton(d.host, 'Otwórz wynik').click(); await settle();
    expect(d.host.querySelector('.vcp-record-body')).toBeNull();
    expect(d.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not authorize an unrelated ordinary result from log.noteId alone', async () => {
    const original = resultRecord(), d = view({ planChanges: { log: [{ dateISO: actualDay, text: 'Fikcyjny dawny wpis.', noteId: original.id }] }, vaultChanges: {
      getPatientNote: vi.fn(async () => original), getCarePlanResultReference: vi.fn(async () => ({ note: original, relation: 'history' })),
    } }); await settle(); findButton(d.host, 'Otwórz wpis').click(); await settle();
    expect(d.vault.getCarePlanResultReference).not.toHaveBeenCalled();
    expect(d.host.querySelector('.vcp-record-body')).toBeNull(); expect(d.host.querySelector('[role="alert"]')).not.toBeNull(); d.controller.destroy();
  });

  it('passes the exact step from a typed archived result variant to the scoped resolver', async () => {
    const original = resultRecord(), current = step({ state: 'done', reminderTime: null, reminderNoteId: 'fictional-current-reminder', resultNoteId: 'fictional-current-result' });
    const alternate = { ...current, resultNoteId: original.id };
    const snapshot = { version: 1, resolvedBy: 'fictional-resolution', components: [{ key: 'step', stepId: current.id,
      current, projected: false, variants: [{ id: 'fictional-alternate-writer', selected: false, value: alternate }] }] };
    const d = view({ planChanges: { steps: [current], log: [{ dateISO: actualDay, text: 'Fikcyjny przegląd.', resolution: snapshot }] }, vaultChanges: {
      getPatientNote: vi.fn(), getCarePlanResultReference: vi.fn(async () => ({ note: original, relation: 'history' })),
    } }); await settle();
    d.host.querySelector('[data-record-id="fictional-step-actions-result"]').click(); await settle();
    expect(d.vault.getCarePlanResultReference).toHaveBeenCalledWith({ planId: d.plan.id, stepId: current.id, noteId: original.id });
    expect(d.host.querySelector('.vcp-record-body').textContent).toBe(original.body);
    expect(d.vault.getPatientNote).not.toHaveBeenCalled(); d.controller.destroy();
  });
});
