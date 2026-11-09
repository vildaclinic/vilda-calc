import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const button = (root, label) => root.querySelectorAll('button').find(item => item.textContent === label);
const field = (root, label) => root.querySelectorAll('input,select,textarea').find(item => item.getAttribute('aria-label') === label);
const check = root => root.querySelector('.vcp-check input');
const clinicalDay = '2001-02-03';
const audit = id => ({ operationId: id, effectiveDateISO: clinicalDay, recordedAtISO: clinicalDay + 'T12:00:00.000Z', recordedLocalDateISO: clinicalDay, originTimeZone: 'Europe/Warsaw' });
function planRecord() {
  return { id: 'fictional-staged-plan', patientId: 'fictional-staged-patient', category: 'care-plan', title: 'Fikcyjny plan etapowy', rev: 3,
    careContext: { version: 2, role: 'plan', status: 'active', goal: 'Fikcyjny cel.', stageOrder: ['stage-a', 'stage-b'],
      stages: ['a', 'b'].map(key => ({ id: 'stage-' + key, kind: 'regular', title: 'Fikcyjny etap ' + key, definitionOperationId: 'stage-definition-' + key,
        stepIds: ['step-' + key], control: { state: 'planned', activation: null, review: null } })),
      steps: ['a', 'b'].map(key => ({ id: 'step-' + key, stageId: 'stage-' + key, title: 'Fikcyjny krok ' + key, taskKind: 'examination', instruction: 'Fikcyjna instrukcja.',
        definitionOperationId: 'step-definition-' + key, requiredOutcome: key === 'a' ? 'resultReceipt' : 'decision', reminderRule: { kind: 'none' }, reminderSchedule: null, omission: null })),
      facts: [], factCorrections: [], associations: [], log: [] } };
}
function fixture({ capability = { available: true }, edit, overrides = {}, mount = {} } = {}) {
  const doc = atrapaDokumentu(), create = doc.createElement;
  doc.createElement = tag => {
    const element = create(tag), query = element.querySelector.bind(element); element.scrollTop = 0; element.scrollIntoView = () => {};
    Object.defineProperty(element, 'parentElement', { get: () => element.parentNode });
    element.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; element.setAttribute('data-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    element.querySelector = selector => selector === 'input:not([type=checkbox]):not([type=radio]),textarea,select'
      ? element.querySelectorAll('input,textarea,select').find(input => input.type !== 'checkbox' && input.type !== 'radio') || null : query(selector);
    if (tag === 'dialog') { element.showModal = () => { element.open = true; }; element.close = () => { element.open = false; }; }
    if (tag === 'form') element.reportValidity = () => true;
    return element;
  }; doc.removeEventListener = () => {};
  const host = doc.createElement('section'); doc.body.appendChild(host);
  const plan = planRecord(); let unlocked = true, lock;
  const provider = { getCapability: vi.fn(async () => capability) };
  const vault = {
    isUnlocked: () => unlocked, getCurrentUser: () => ({ userId: 'fictional-staged-user' }), onLock: fn => { lock = fn; },
    listCarePlans: vi.fn(async () => [structuredClone(plan)]), getCarePlan: vi.fn(async () => structuredClone(plan)),
    listPatients: vi.fn(async () => [{ patientId: plan.patientId, header: { name: 'Fikcyjny Pacjent', dobISO: '1990-01-01' } }]),
    listPatientNotesForPatient: vi.fn(async () => []), getPatientNote: vi.fn(async () => null),
    getCarePlanApplicationProvider: () => provider, mutateCarePlan: vi.fn(),
    mutateStagedCarePlan: vi.fn(async () => ({ saved: false, conflict: true })), getStagedCarePlanOperation: vi.fn(async () => ({ state: 'unknown' })), ...overrides,
  };
  const win = { document: doc, crypto: globalThis.crypto, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) };
  loadBrowserScript('vilda_care_plan_model.js', win); if (edit) edit(plan, win.VildaCarePlanModel);
  expect(win.VildaCarePlanModel.decodeCarePlanRecord(plan).kind).toBe('v2');
  loadBrowserScript('vilda_care_plans.js', win);
  const controller = win.VildaCarePlans.mount(host, { vault, full: true, planId: plan.id, ...mount });
  return { host, doc, plan, win, vault, provider, controller, lock: () => { unlocked = false; lock(); } };
}
const formOf = d => d.doc.body.querySelector('.vcp-form');
const active = plan => { plan.careContext.stages[0].control = { state: 'active', activation: audit('fictional-activation'), review: null }; };
function receipt(plan) { plan.careContext.facts.push({ id: 'fictional-fact', stepId: 'step-a', kind: 'resultReceipt', ...audit('fictional-receipt'), evidence: { noteId: 'fictional-document', sourceRecordRevAtCapture: 0 } }); }

describe('V2 staged care-plan UI uses its protected writer', () => {
  it('shows separate planned stages and never activates anything merely by opening a plan', async () => {
    const d = fixture(); await settle();
    expect(d.host.querySelectorAll('.vcp-stage')).toHaveLength(2);
    expect(button(d.host, 'Uruchom pierwszy etap')).toBeTruthy(); expect(button(d.host, 'Uruchom etap')).toBeUndefined();
    expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
  it('does not expose writable actions when the real provider is unavailable', async () => {
    const d = fixture({ capability: { available: false, message: 'Fikcyjna niedostępność.' } }); await settle();
    expect(d.host.textContent).toContain('Fikcyjna niedostępność.'); expect(button(d.host, 'Uruchom pierwszy etap')).toBeUndefined(); expect(button(d.host, 'Zapisz wykonanie')).toBeUndefined(); d.controller.destroy();
  });
  it('retains both complete portable versions in a readonly conflict view without choosing a winner', async () => {
    const d = fixture({ edit: plan => {
      active(plan); receipt(plan);
      plan.careContext.log.push({ ...audit('fictional-first-log'), action: 'recordFact', stageId: 'stage-a', stepId: 'step-a', documentIds: ['fictional-document'], text: 'Fikcyjny przebieg pierwszej wersji.' });
      const alternative = structuredClone(plan);
      alternative.title = 'Fikcyjna druga wersja planu'; alternative.careContext.stages[0].title = 'Fikcyjny zachowany drugi etap';
      alternative.careContext.steps[0].title = 'Fikcyjny zachowany drugi krok';
      alternative.careContext.facts[0].kind = 'performance';
      alternative.careContext.log[0].text = 'Fikcyjny odrębny przebieg drugiej wersji.';
      plan.nativeConflicts = [{ record: alternative, operations: [{ id: 'fictional-alternate-operation' }] }];
    } }); await settle();
    const original = JSON.stringify(d.plan), versions = d.host.querySelectorAll('.vcp-native-conflict-version');
    expect(d.host.textContent).toContain('Konflikt synchronizacji. Ten plan jest dostępny tylko do odczytu.');
    expect(versions).toHaveLength(2); expect(versions.every(version => version.open === false)).toBe(true);
    versions.forEach(version => { version.open = true; version.dispatch('toggle'); });
    expect(versions[0].textContent).toContain('Fikcyjny plan etapowy');
    expect(versions[0].textContent).toContain('Fikcyjny przebieg pierwszej wersji.');
    expect(versions[0].textContent).toContain('Otrzymanie wyniku: 03.02.2001');
    expect(versions[1].textContent).toContain('Fikcyjna druga wersja planu');
    expect(versions[1].textContent).toContain('Fikcyjny zachowany drugi etap');
    expect(versions[1].textContent).toContain('Fikcyjny zachowany drugi krok');
    expect(versions[1].textContent).toContain('Wykonanie: 03.02.2001');
    expect(versions[1].textContent).toContain('Fikcyjny odrębny przebieg drugiej wersji.');
    for (const label of ['Uruchom pierwszy etap', 'Potwierdź przegląd etapu', 'Zapisz wykonanie', 'Zapisz otrzymanie wyniku', 'Zapisz decyzję', 'Pomiń krok', 'Zmień przypomnienie', 'Zamknij plan', 'Przygotuj plany z etapami']) expect(button(d.host, label)).toBeUndefined();
    expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled();
    expect(JSON.stringify(d.plan)).toBe(original); d.controller.destroy();
  });
  it('opens evidence retained only in an alternative version and restores its expanded place on return', async () => {
    const original = { id: 'fictional-document', patientId: 'fictional-staged-patient', rev: 0, category: 'observation', title: 'Fikcyjny zachowany dokument', body: 'Fikcyjny oryginał z drugiej wersji.' };
    const d = fixture({ edit: plan => {
      const alternative = structuredClone(plan); active(alternative); receipt(alternative);
      plan.nativeConflicts = [{ record: alternative, operations: [{ id: 'fictional-alternate-operation' }] }]; plan.syncNeedsReview = true;
    }, overrides: { getPatientNote: vi.fn(async () => structuredClone(original)) } }); await settle();
    const alternative = d.host.querySelectorAll('.vcp-native-conflict-version')[1];
    alternative.open = true; alternative.dispatch('toggle'); button(alternative, 'Otwórz dokument').click(); await settle();
    expect(d.host.textContent).toContain(original.body); expect(d.vault.getPatientNote).toHaveBeenCalledWith(original.id);
    expect(d.host.querySelector('.vcp-record')).toBeTruthy();
    button(d.host, '← Wróć do planu').click();
    expect(d.host.querySelectorAll('.vcp-native-conflict-version')[1].open).toBe(true);
    expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
  it.each(['fact', 'association'])('does not present a changed ordinary document as its captured %s version', async relation => {
    const changed = { id: 'fictional-document', patientId: 'fictional-staged-patient', rev: 1, category: 'observation', title: 'Fikcyjny zmieniony dokument', body: 'Fikcyjna późniejsza treść z drugiego urządzenia.' };
    const d = fixture({ edit: plan => {
      if (relation === 'fact') receipt(plan);
      else plan.careContext.associations.push({ id: 'fictional-association', stepId: 'step-a', kind: 'document', noteId: changed.id,
        sourceRecordRevAtCapture: 0, operationId: 'fictional-association-operation', recordedAtISO: clinicalDay + 'T12:00:00.000Z' });
    }, overrides: { getPatientNote: vi.fn(async () => structuredClone(changed)) } }); await settle();
    const before = JSON.stringify(d.plan); button(d.host, relation === 'fact' ? 'Otwórz dokument' : 'Otwórz wpis').click(); await settle();
    expect(d.host.textContent).toContain('Dokument został zmieniony po powiązaniu z planem.');
    expect(d.host.textContent).toContain('nie przechowuje jej treści');
    expect(d.host.textContent).not.toContain(changed.body);
    expect(d.host.querySelector('.vcp-record-body')).toBeNull();
    expect(d.vault.getPatientNote).toHaveBeenCalledWith(changed.id);
    expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); expect(JSON.stringify(d.plan)).toBe(before); d.controller.destroy();
  });
  it('blocks writes when a portable review marker arrives without its readable alternatives', async () => {
    const d = fixture({ edit: plan => { plan.syncNeedsReview = true; plan.nativeConflicts = []; } }); await settle();
    expect(d.host.textContent).toContain('Nie można wyświetlić wszystkich zachowanych wersji.');
    expect(button(d.host, 'Uruchom pierwszy etap')).toBeUndefined();
    expect(button(d.host, 'Zamknij plan')).toBeUndefined(); expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it.each(['', '2026-02-31', '2999-01-01'])('requires a valid explicit activation date (%s)', async date => {
    const d = fixture(); await settle(); button(d.host, 'Uruchom pierwszy etap').click(); const form = formOf(d);
    expect(field(form, 'Data uruchomienia etapu').value).toBe(''); field(form, 'Data uruchomienia etapu').value = date; form.dispatch('submit'); await settle();
    expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled(); expect(form.textContent).toContain('Podaj prawidłową datę'); d.controller.destroy();
  });
  it('submits the chosen activation day, exact revision and independent operation identity', async () => {
    const d = fixture(); await settle(); button(d.host, 'Uruchom pierwszy etap').click(); const form = formOf(d); field(form, 'Data uruchomienia etapu').value = clinicalDay; form.dispatch('submit'); await settle();
    const command = d.vault.mutateStagedCarePlan.mock.calls[0][0];
    expect(command).toEqual({ action: 'activateStage', stageId: 'stage-a', effectiveDateISO: clinicalDay, operationId: expect.any(String), planId: d.plan.id, patientId: d.plan.patientId, expectedRevision: 3 });
    expect(Object.isFrozen(command)).toBe(true); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
  it('documents receipt on a planned stage without activating that stage or advancing the next', async () => {
    const d = fixture(); await settle(); button(d.host, 'Zapisz otrzymanie wyniku').click(); const form = formOf(d);
    field(form, 'Data otrzymania wyniku').value = clinicalDay; field(form, 'Treść dokumentacji').value = 'Fikcyjnie otrzymany dokument.'; check(form).checked = true;
    form.dispatch('submit'); await settle(); const command = d.vault.mutateStagedCarePlan.mock.calls[0][0];
    expect(command).toMatchObject({ action: 'recordFact', stepId: 'step-a', kind: 'resultReceipt', effectiveDateISO: clinicalDay, document: { title: 'Otrzymanie wyniku: Fikcyjny krok a', body: 'Fikcyjnie otrzymany dokument.' } });
    expect(command.document.id).not.toBe(command.factId); expect(Object.isFrozen(command.document)).toBe(true);
    expect(d.vault.mutateStagedCarePlan).toHaveBeenCalledTimes(1); expect(d.plan.careContext.stages[0].control.state).toBe('planned'); d.controller.destroy();
  });
  it('requires explicit review of a ready stage and leaves the next stage planned', async () => {
    const d = fixture({ edit: plan => { active(plan); receipt(plan); } }); await settle();
    expect(button(d.host, 'Potwierdź przegląd etapu')).toBeTruthy(); expect(button(d.host, 'Uruchom etap')).toBeUndefined();
    button(d.host, 'Potwierdź przegląd etapu').click(); const form = formOf(d); expect(form.textContent).toContain('Otrzymanie wyniku: 03.02.2001');
    field(form, 'Data przeglądu etapu').value = clinicalDay; form.dispatch('submit'); await settle();
    expect(d.vault.mutateStagedCarePlan.mock.calls[0][0]).toMatchObject({ action: 'reviewStage', stageId: 'stage-a', effectiveDateISO: clinicalDay }); d.controller.destroy();
  });
  it('retries the exact frozen command after an unknown outcome and checks its receipt', async () => {
    const d = fixture({ overrides: { mutateStagedCarePlan: vi.fn(async () => ({ saved: false, outcome: 'unknown' })) } }); await settle();
    button(d.host, 'Uruchom pierwszy etap').click(); const form = formOf(d); field(form, 'Data uruchomienia etapu').value = clinicalDay; form.dispatch('submit'); await settle();
    const command = d.vault.mutateStagedCarePlan.mock.calls[0][0]; expect(field(form, 'Data uruchomienia etapu').disabled).toBe(true); expect(button(form, 'Anuluj').disabled).toBe(true);
    field(form, 'Data uruchomienia etapu').value = '2002-01-01'; form.dispatch('submit'); await settle(); expect(d.vault.mutateStagedCarePlan.mock.calls[1][0]).toBe(command);
    button(form, 'Sprawdź zapis').click(); await settle(); expect(d.vault.getStagedCarePlanOperation).toHaveBeenCalledWith({ operationId: command.operationId, planId: d.plan.id, patientId: d.plan.patientId }); d.controller.destroy();
  });
  it('does not treat a wrong-patient success as a failed safe-to-edit attempt', async () => {
    const d = fixture({ overrides: { mutateStagedCarePlan: vi.fn(async request => ({ saved: true, planId: request.planId, patientId: 'fictional-other-patient' })) } }); await settle();
    button(d.host, 'Uruchom pierwszy etap').click(); const form = formOf(d); field(form, 'Data uruchomienia etapu').value = clinicalDay; form.dispatch('submit'); await settle();
    expect(button(form, 'Ponów ten sam zapis')).toBeTruthy(); expect(field(form, 'Data uruchomienia etapu').disabled).toBe(true); d.controller.destroy();
  });
  it('links an existing revision-zero document only after preview and a fresh same-patient read', async () => {
    const original = { id: 'fictional-existing', patientId: 'fictional-staged-patient', rev: 0, title: 'Fikcyjny dokument', body: 'Fikcyjna treść.', category: 'observation' };
    const d = fixture({ overrides: { listPatientNotesForPatient: vi.fn(async () => [original]), getPatientNote: vi.fn(async () => structuredClone(original)) } }); await settle();
    button(d.host, 'Zapisz otrzymanie wyniku').click(); const form = formOf(d); await settle(); field(form, 'Dokumentacja').value = 'existing'; field(form, 'Dokumentacja').dispatch('change');
    field(form, 'Dokument pacjenta').value = original.id; field(form, 'Dokument pacjenta').dispatch('change'); await settle(); expect(form.textContent).toContain('Fikcyjna treść.');
    field(form, 'Data otrzymania wyniku').value = clinicalDay; check(form).checked = true; form.dispatch('submit'); await settle();
    expect(d.vault.getPatientNote).toHaveBeenCalledTimes(2); expect(d.vault.mutateStagedCarePlan.mock.calls[0][0]).toMatchObject({ action: 'recordFact', evidence: { noteId: original.id, sourceRecordRevAtCapture: 0 } }); d.controller.destroy();
  });
  it('keeps associations separate from completion facts', async () => {
    const original = { id: 'fictional-existing', patientId: 'fictional-staged-patient', rev: 1, title: 'Fikcyjny termin', body: '', category: 'calendar' };
    const d = fixture({ overrides: { listPatientNotesForPatient: vi.fn(async () => [original]), getPatientNote: vi.fn(async () => original) } }); await settle();
    button(d.host, 'Powiąż dokument lub termin').click(); const form = formOf(d); await settle(); field(form, 'Rodzaj powiązania').value = 'event';
    field(form, 'Dokument pacjenta').value = original.id; field(form, 'Dokument pacjenta').dispatch('change'); await settle(); check(form).checked = true; form.dispatch('submit'); await settle();
    expect(d.vault.mutateStagedCarePlan.mock.calls[0][0]).toMatchObject({ action: 'associate', kind: 'event', stepId: 'step-a', evidence: { noteId: original.id, sourceRecordRevAtCapture: 1 } });
    expect(d.vault.mutateStagedCarePlan.mock.calls[0][0]).not.toHaveProperty('effectiveDateISO'); d.controller.destroy();
  });
  it('requires a reason and date for omission and explicit acknowledgement when closing unfinished work', async () => {
    const d = fixture(); await settle(); button(d.host, 'Pomiń krok').click(); let form = formOf(d); form.dispatch('submit'); await settle(); expect(d.vault.mutateStagedCarePlan).not.toHaveBeenCalled();
    field(form, 'Uzasadnienie').value = 'Fikcyjna decyzja.'; field(form, 'Data decyzji').value = clinicalDay; form.dispatch('submit'); await settle();
    expect(d.vault.mutateStagedCarePlan.mock.calls[0][0]).toMatchObject({ action: 'omitStep', stepId: 'step-a', reason: 'Fikcyjna decyzja.', documentId: expect.any(String), effectiveDateISO: clinicalDay });
    button(form, 'Anuluj').click(); button(d.host, 'Zamknij plan').click(); form = formOf(d); field(form, 'Powód zakończenia planu').value = 'Fikcyjny powód'; field(form, 'Ustalenia przy zakończeniu').value = 'Fikcyjne ustalenia'; field(form, 'Data decyzji').value = clinicalDay; form.dispatch('submit'); await settle();
    expect(d.vault.mutateStagedCarePlan).toHaveBeenCalledTimes(1); check(form).checked = true; form.dispatch('submit'); await settle(); expect(d.vault.mutateStagedCarePlan.mock.calls[1][0]).toMatchObject({ action: 'closePlan', confirmOpenWork: true }); d.controller.destroy();
  });
  it('drops clinical editor content when the account locks', async () => {
    const d = fixture(); await settle(); button(d.host, 'Zapisz wykonanie').click(); expect(formOf(d)).toBeTruthy(); d.lock(); expect(formOf(d)).toBeNull(); expect(d.host.textContent).toBe('');
  });
  it('opens the newly saved stage state and never sends an automatic follow-up command', async () => {
    const d = fixture(); await settle(); d.vault.mutateStagedCarePlan.mockImplementation(async request => {
      active(d.plan); d.plan.rev += 1; return { saved: true, planId: request.planId, patientId: request.patientId, plan: structuredClone(d.plan) };
    });
    button(d.host, 'Uruchom pierwszy etap').click(); const form = formOf(d); field(form, 'Data uruchomienia etapu').value = clinicalDay; form.dispatch('submit'); await settle();
    expect(formOf(d)).toBeNull(); expect(d.host.textContent).toContain('W realizacji'); expect(d.host.textContent).toContain('Uruchomiono: 03.02.2001'); expect(d.vault.mutateStagedCarePlan).toHaveBeenCalledTimes(1); d.controller.destroy();
  });
  it('offers exact Pusty plan / Szablon labels and hands the real provider and patient context to the library', async () => {
    const d = fixture({ capability: { available: false, canPrepare: true }, mount: { patientId: 'fictional-staged-patient' } }); await settle();
    expect(button(d.host, 'Uruchom pierwszy etap')).toBeUndefined();
    d.win.VildaCareTemplateModel = { CONTENT_VERSION: 2 }; d.win.VildaCareTemplateStore = {}; d.win.VildaCareTemplateTransfer = {}; const destroy = vi.fn();
    d.win.VildaCareTemplates = { open: vi.fn(() => ({ destroy })) };
    d.controller.create(); const form = formOf(d); expect(button(form, 'Pusty plan')).toBeTruthy(); expect(button(form, 'Szablon')).toBeTruthy();
    button(form, 'Szablon').click(); await settle(); d.doc.body.querySelectorAll('link').forEach(link => { if (link.onload) link.onload(); }); await settle();
    expect(d.win.VildaCareTemplates.open).toHaveBeenCalledTimes(1);
    const options = d.win.VildaCareTemplates.open.mock.calls[0][0]; expect(options.application).toBe(d.provider); expect(options.patientId).toBe(d.plan.patientId);
    const returnContext = { view: 'detail', templateId: 'fictional-template', query: 'Fikcyjny', archived: false, scrollTop: 183 };
    d.provider.getCapability.mockResolvedValue({ available: true });
    options.onApplied({ saved: true, planId: d.plan.id, patientId: d.plan.patientId, plan: d.plan }, { returnContext }); await settle();
    expect(button(d.host, 'Uruchom pierwszy etap')).toBeTruthy();
    expect(destroy).toHaveBeenCalledTimes(1); expect(button(d.host, '← Szablon')).toBeTruthy(); button(d.host, '← Szablon').click(); await settle();
    expect(d.win.VildaCareTemplates.open.mock.calls[1][0].navigationContext).toEqual(returnContext); expect(d.vault.mutateCarePlan).not.toHaveBeenCalled(); d.controller.destroy();
  });
});
