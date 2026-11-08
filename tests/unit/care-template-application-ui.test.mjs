import { describe, expect, it, vi } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const button = (root, label) => root.querySelectorAll('button').find(item => item.textContent === label || item.getAttribute('aria-label') === label);
const field = (root, label) => root.querySelectorAll('input,select,textarea').find(item => item.getAttribute('aria-label') === label);
const change = (element, value) => { element.value = value; element.dispatch(element.tagName === 'SELECT' ? 'change' : 'input'); };
const include = (root, name, checked) => {
  const input = root.querySelectorAll('.vcp-check').find(item => item.textContent === 'Dołącz krok: ' + name)?.querySelector('input');
  expect(input).toBeTruthy(); input.checked = checked; input.dispatch('change');
};

function fixture({ patientId, capability = { available: true }, sourceChange, serviceOverrides = {}, options = {} } = {}) {
  const doc = atrapaDokumentu(), originalCreate = doc.createElement;
  doc.createElement = tag => {
    const element = originalCreate(tag); element.scrollIntoView = () => {}; element.scrollTop = 0;
    element.dataset = new Proxy({}, { set(target, key, value) { target[key] = value; element.setAttribute('data-' + key.replace(/[A-Z]/g, char => '-' + char.toLowerCase()), value); return true; } });
    return element;
  };
  doc.removeEventListener = () => {};
  const host = doc.createElement('section'); doc.body.appendChild(host);
  const win = { document: doc, crypto: globalThis.crypto, setTimeout, clearTimeout }, owner = { userId: 'fictional-application-account' };
  loadBrowserScript('vilda_care_template_model.js', win);
  const definition = win.VildaCareTemplateModel.createDefinitionDraft({ stageId: 'fictional-stage-a', stepId: 'fictional-step-a' }).definition;
  definition.name = 'Fikcyjny wniosek'; definition.stages[0].title = 'Fikcyjny pierwszy etap'; definition.steps[0].title = 'Fikcyjny pierwszy krok'; definition.steps[0].requiredOutcome = 'performance';
  definition.stageOrder.push('fictional-stage-b'); definition.stages.push({ id: 'fictional-stage-b', title: 'Fikcyjny drugi etap', stepIds: ['fictional-step-b'] });
  definition.steps.push({ ...structuredClone(definition.steps[0]), id: 'fictional-step-b', stageId: 'fictional-stage-b', title: 'Fikcyjny drugi krok', requiredOutcome: 'resultReceipt', includedByDefault: false });
  const source = { templateId: 'fictional-template', status: 'active', baseToken: 'fictional-template-base', headRevisionId: 'fictional-revision', revisionNumber: 1, definition };
  const patients = [
    { patientId: 'fictional-patient-a', header: { name: 'Fikcyjny Antoni', dobISO: '2013-06-17' } },
    { patientId: 'fictional-patient-b', header: { name: 'Fikcyjna Beata', dobISO: '2014-06-17' } },
  ];
  let unlocked = true, lock, changed;
  const vault = {
    getCurrentUser: () => owner, isUnlocked: () => unlocked,
    getCarePlanTemplateCapability: vi.fn(async () => ({ readable: true, canSave: true, persistence: 'private-local', syncAvailable: false })),
    listCarePlanTemplates: vi.fn(async () => [{ ...source, definition: undefined, title: definition.name, stageCount: 2, stepCount: 2 }]),
    getCarePlanTemplate: vi.fn(async (id, options) => sourceChange ? sourceChange(source, options) : ({ ...structuredClone(source), ...(options?.revisionId ? { revisionId: options.revisionId, readOnly: true } : {}) })),
    listCarePlanTemplateRevisions: vi.fn(async () => []), saveCarePlanTemplateRevision: vi.fn(),
    onCarePlanTemplateChanged: fn => { changed = fn; }, onLock: fn => { lock = fn; },
  };
  const token = Object.freeze({ authority: 'fictional-prepared-token' });
  const application = {
    getCapability: vi.fn(async () => capability), listPatients: vi.fn(async () => structuredClone(patients)),
    prepare: vi.fn(async () => ({ token, definition: structuredClone(definition) })),
    commit: vi.fn(async request => ({ saved: true, planId: 'fictional-created-plan', patientId: request.patientId })),
    getOutcome: vi.fn(async () => ({ state: 'unknown' })), ...serviceOverrides,
  };
  const onApplied = vi.fn(); win.VildaVault = vault; loadBrowserScript('vilda_care_templates.js', win);
  const controller = win.VildaCareTemplates.mount(host, { vault, application, patientId, onApplied, ...options });
  return { doc, host, controller, source, definition, patients, token, vault, application, onApplied,
    changed: () => changed(), lock: () => { unlocked = false; lock(); }, changeOwner: () => { owner.userId = 'fictional-other-account'; } };
}

async function start(d) {
  await settle(); button(d.host, 'Użyj u pacjenta: Fikcyjny wniosek').click(); await settle();
}
async function review(d) {
  await start(d);
  if (d.controller.getContext().view === 'application' && field(d.host, 'Szukaj pacjenta')) {
    d.host.querySelector('[data-patient-id="fictional-patient-a"]').click(); button(d.host, 'Dalej').click(); await settle();
  }
}

describe('Applying a care template through its guarded provider', () => {
  it('never offers or starts account preparation when an older provider advertises it', async () => {
    const capability = { available: false, canPrepare: true, message: 'Przygotuj miejsce zapisu planów.' };
    const prepareWorkspace = vi.fn(async () => { capability.available = true; return { available: true }; });
    const d = fixture({ capability, serviceOverrides: { prepareWorkspace } }); await settle();
    const use = button(d.host, 'Użyj u pacjenta: Fikcyjny wniosek');
    expect(use.disabled).toBe(true); use.click(); await settle();
    expect(button(d.host, 'Przygotuj plany z etapami')).toBeUndefined();
    expect(d.host.textContent).not.toContain(capability.message);
    expect(d.host.textContent).toContain('Odśwież aplikację i spróbuj ponownie.');
    expect(prepareWorkspace).not.toHaveBeenCalled(); expect(d.application.prepare).not.toHaveBeenCalled();
    expect(d.application.commit).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('shows the explicit unavailable reason and never calls a missing writer', async () => {
    const d = fixture({ capability: { available: false, message: 'Fikcyjnie niedostępny zapis planu.' } }); await settle();
    const use = button(d.host, 'Użyj u pacjenta: Fikcyjny wniosek'); expect(use.disabled).toBe(true); use.click();
    expect(d.host.textContent).toContain('Fikcyjnie niedostępny zapis planu.');
    expect(d.application.prepare).not.toHaveBeenCalled(); expect(d.application.commit).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('re-reads the source and requires explicit patient selection outside a patient card', async () => {
    const d = fixture(); await start(d);
    expect(d.vault.getCarePlanTemplate).toHaveBeenCalledWith('fictional-template');
    expect(button(d.host, 'Dalej').disabled).toBe(true); expect(d.application.prepare).not.toHaveBeenCalled();
    d.host.querySelector('[data-patient-id="fictional-patient-b"]').click(); button(d.host, 'Dalej').click(); await settle();
    expect(d.application.prepare).toHaveBeenCalledWith({ patientId: 'fictional-patient-b', templateId: 'fictional-template', revisionId: 'fictional-revision' });
    expect(d.host.textContent).toContain('Fikcyjna Beata'); expect(field(d.host, 'Nazwa planu').value).toBe('Fikcyjny wniosek'); d.controller.destroy();
  });

  it('prefills only the fixed patient from the open card and does not mutate the clinical form', async () => {
    const d = fixture({ patientId: 'fictional-patient-b' }); await review(d);
    expect(d.application.prepare).toHaveBeenCalledTimes(1); expect(d.application.prepare.mock.calls[0][0].patientId).toBe('fictional-patient-b');
    expect(field(d.host, 'Szukaj pacjenta')).toBeUndefined(); expect(button(d.host, 'Zmień pacjenta')).toBeUndefined();
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('does not replace a missing patient-card identity with another patient', async () => {
    const d = fixture({ patientId: 'fictional-missing-patient' }); await start(d);
    expect(d.host.textContent).toContain('Pacjent z otwartej Karty jest niedostępny'); expect(d.application.prepare).not.toHaveBeenCalled(); expect(d.application.commit).not.toHaveBeenCalled(); d.controller.destroy();
  });
  it('asks to repair an incomplete source without inventing its required outcome', async () => {
    const d = fixture({ sourceChange: source => { const copy = structuredClone(source); copy.definition.steps[0].requiredOutcome = null; return copy; } }); await start(d);
    expect(d.host.textContent).toContain('wybierz „Edytuj”'); expect(d.host.textContent).toContain('Co kończy ten krok?'); expect(d.application.prepare).not.toHaveBeenCalled(); d.controller.destroy();
  });
  it('disables creation with a per-step message until every selected step has an explicit outcome', async () => {
    const d = fixture({ patientId: 'fictional-patient-a' }); await review(d); const outcome = field(d.host, 'Co kończy ten krok?'); change(outcome, '');
    expect(button(d.host, 'Utwórz plan').disabled).toBe(true); expect(outcome.getAttribute('aria-invalid')).toBe('true'); expect(d.host.textContent).toContain('Wybierz, co kończy ten krok');
    change(outcome, 'decision'); expect(button(d.host, 'Utwórz plan').disabled).toBe(false); button(d.host, 'Utwórz plan').click(); await settle();
    expect(d.application.commit.mock.calls[0][0].definition.steps[0].requiredOutcome).toBe('decision'); d.controller.destroy();
  });

  it.each(['archived', 'conflict', 'changed-head'])('rejects a fresh %s template before preparing a patient plan', async status => {
    const d = fixture({ sourceChange: source => ({ ...structuredClone(source), ...(status === 'changed-head' ? { headRevisionId: 'fictional-new-head' } : { status }) }) }); await start(d);
    expect(d.host.textContent).toContain('Szablon zmienił się lub wymaga przeglądu'); expect(d.application.prepare).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('keeps historical read-only versions out of direct application', async () => {
    const d = fixture(); await settle(); await d.controller.open('fictional-template', 'fictional-old-revision');
    expect(button(d.host, 'Użyj u pacjenta')).toBeUndefined(); expect(button(d.host, 'Utwórz kopię')).toBeTruthy(); d.controller.destroy();
  });

  it('commits one independent, explicitly reviewed copy and omits unchecked empty stages', async () => {
    const d = fixture({ patientId: 'fictional-patient-a' }), before = structuredClone(d.definition); await review(d);
    change(field(d.host, 'Nazwa planu'), 'Fikcyjne indywidualne ustalenie'); change(field(d.host, 'Nazwa kroku'), 'Fikcyjny dopasowany krok');
    button(d.host, 'Utwórz plan').click(); await settle();
    const request = d.application.commit.mock.calls[0][0];
    expect(request).toMatchObject({ token: d.token, patientId: 'fictional-patient-a', templateId: 'fictional-template', revisionId: 'fictional-revision', operationId: expect.any(String) });
    expect(request.definition.stageOrder).toEqual(['fictional-stage-a']); expect(request.definition.steps).toHaveLength(1);
    expect(request.definition.steps[0]).toMatchObject({ title: 'Fikcyjny dopasowany krok', requiredOutcome: 'performance', reminderRule: { kind: 'none' } });
    expect(request.definition.name).toBe('Fikcyjne indywidualne ustalenie'); expect(d.definition).toEqual(before);
    expect(d.onApplied).toHaveBeenCalledWith({ saved: true, planId: 'fictional-created-plan', patientId: 'fictional-patient-a' }, { returnContext: expect.objectContaining({ view: 'library' }) });
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled(); expect(JSON.stringify(request)).not.toContain('active'); d.controller.destroy();
  });

  it('requires at least one selected step and distinguishes a blank timing offset from zero', async () => {
    const d = fixture({ patientId: 'fictional-patient-a' }); await review(d);
    include(d.host, 'Fikcyjny pierwszy krok', false); expect(button(d.host, 'Utwórz plan').disabled).toBe(true);
    include(d.host, 'Fikcyjny drugi krok', true); change(field(d.host, 'Przypomnienie'), 'stage-offset');
    button(d.host, 'Utwórz plan').click(); await settle(); expect(d.application.commit).not.toHaveBeenCalled();
    expect(d.host.textContent).toContain('Sprawdź nazwy, instrukcje, kryteria zakończenia i przypomnienia');
    change(field(d.host, 'Liczba jednostek czasu'), '0'); button(d.host, 'Utwórz plan').click(); await settle();
    expect(d.application.commit.mock.calls[0][0].definition.steps[0].reminderRule).toEqual({ kind: 'stage-offset', amount: 0, unit: 'day' }); d.controller.destroy();
  });

  it('retains the same operation and exact request after an unknown result, without permitting edits or duplicate clicks', async () => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { commit: vi.fn().mockReturnValueOnce(pending).mockImplementation(async request => ({ saved: true, planId: 'fictional-created-plan', patientId: request.patientId })) } }); await review(d);
    button(d.host, 'Utwórz plan').click(); button(d.host, 'Ponów tę samą próbę').click(); expect(d.application.commit).toHaveBeenCalledTimes(1);
    complete({ saved: false, outcome: 'unknown' }); await settle();
    const request = d.application.commit.mock.calls[0][0]; expect(field(d.host, 'Nazwa planu').disabled).toBe(true);
    change(field(d.host, 'Nazwa planu'), 'Fikcyjna wymuszona zmiana zdarzeniem');
    button(d.host, 'Ponów tę samą próbę').click(); await settle();
    expect(d.application.commit).toHaveBeenCalledTimes(2); expect(d.application.commit.mock.calls[1][0]).toBe(request); expect(request.definition.name).toBe('Fikcyjny wniosek'); d.controller.destroy();
  });

  it('uses the saved outcome for the same patient without sending a second commit', async () => {
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { commit: vi.fn(async () => ({ saved: false, outcome: 'unknown' })), getOutcome: vi.fn(async () => ({ state: 'saved', planId: 'fictional-created-plan', patientId: 'fictional-patient-a' })) } });
    await review(d); button(d.host, 'Utwórz plan').click(); await settle(); button(d.host, 'Sprawdź wynik').click(); await settle();
    const request = d.application.commit.mock.calls[0][0];
    expect(d.application.getOutcome).toHaveBeenCalledWith({ operationId: request.operationId, token: request.token, patientId: request.patientId });
    expect(d.application.commit).toHaveBeenCalledTimes(1); expect(d.onApplied).toHaveBeenCalledTimes(1); d.controller.destroy();
  });

  it('shows protected Polish limit guidance while retaining an unconfirmed application request', async () => {
    const message = 'Osiągnięto limit zapisu. Zachowaj kopię danych i sprawdź ustawienia synchronizacji.';
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { commit: vi.fn(async () => { throw Object.assign(new Error('limit'), { code: 'WORKSPACE_CLIENT_LIMIT', userMessage: message }); }) } });
    await review(d); button(d.host, 'Utwórz plan').click(); await settle();
    expect(d.host.textContent).toContain(message); expect(d.host.textContent).toContain('Zachowano tę samą próbę');
    expect(field(d.host, 'Nazwa planu').disabled).toBe(true); expect(button(d.host, 'Sprawdź wynik')).toBeTruthy(); d.controller.destroy();
  });

  it('releases the draft only after an explicit provider not-saved refusal', async () => {
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { commit: vi.fn(async () => { throw Object.assign(new Error('unavailable'), { userMessage: 'Zapis jest obecnie niedostępny.', outcome: 'not-saved' }); }) } });
    await review(d); button(d.host, 'Utwórz plan').click(); await settle();
    expect(field(d.host, 'Nazwa planu').disabled).toBe(false); expect(button(d.host, 'Utwórz plan')).toBeTruthy(); expect(d.onApplied).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('rejects a reported success for a different patient and keeps the original operation', async () => {
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { commit: vi.fn(async () => ({ saved: true, planId: 'fictional-other-plan', patientId: 'fictional-patient-b' })) } });
    await review(d); button(d.host, 'Utwórz plan').click(); await settle(); expect(d.onApplied).not.toHaveBeenCalled();
    expect(button(d.host, 'Sprawdź wynik')).toBeTruthy(); expect(field(d.host, 'Nazwa planu').disabled).toBe(true); d.controller.destroy();
  });

  it('preserves library search, scroll and origin focus when cancelling before editing', async () => {
    const d = fixture(); await settle(); change(field(d.host, 'Szukaj własnego szablonu'), 'Fikcyjny');
    d.host.querySelector('.vct-library-list').scrollTop = 185;
    const use = button(d.host, 'Użyj u pacjenta: Fikcyjny wniosek'); use.focus(); use.click(); await settle(); button(d.host, 'Anuluj').click(); await settle();
    expect(field(d.host, 'Szukaj własnego szablonu').value).toBe('Fikcyjny'); expect(d.host.querySelector('.vct-library-list').scrollTop).toBe(185);
    expect(d.doc.activeElement.getAttribute('data-template-use')).toBe('fictional-template'); expect(d.application.commit).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('keeps edits through background library notifications and asks before discarding them', async () => {
    const d = fixture({ patientId: 'fictional-patient-a' }); await review(d); change(field(d.host, 'Nazwa planu'), 'Fikcyjna zachowana zmiana'); d.changed(); await settle();
    expect(field(d.host, 'Nazwa planu').value).toBe('Fikcyjna zachowana zmiana'); button(d.host, 'Anuluj').click();
    expect(d.host.textContent).toContain('Odrzucić dopasowanie planu?'); button(d.host, 'Zostań').click(); expect(field(d.host, 'Nazwa planu').value).toBe('Fikcyjna zachowana zmiana'); d.controller.destroy();
  });

  it('discards draft RAM on lock and ignores a pending preparation from the old owner', async () => {
    let resolve;
    const d = fixture({ patientId: 'fictional-patient-a', serviceOverrides: { prepare: vi.fn(() => new Promise(done => { resolve = done; })) } }); await start(d);
    expect(d.application.prepare).toHaveBeenCalledTimes(1); d.lock(); resolve({ token: d.token, definition: structuredClone(d.definition) }); await settle();
    expect(d.host.querySelector('.vct')).toBeNull(); expect(d.application.commit).not.toHaveBeenCalled(); expect(d.onApplied).not.toHaveBeenCalled();
  });
});
