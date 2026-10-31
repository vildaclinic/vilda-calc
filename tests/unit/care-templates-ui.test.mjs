import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const findButton = (root, text) => root.querySelectorAll('button').find(button => button.textContent === text || button.getAttribute('aria-label') === text);
const input = (root, label) => root.querySelectorAll('input,select,textarea').find(element => element.getAttribute('aria-label') === label);
const change = (element, value) => { element.value = value; element.dispatch(element.tagName === 'SELECT' ? 'change' : 'input'); };

function documentFixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  doc.createElement = tag => {
    const element = create(tag); element.scrollIntoView = () => {};
    element.dataset = new Proxy({}, { set(target, property, value) { target[property] = value; element.setAttribute('data-' + property.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value); return true; } });
    if (tag === 'dialog') { element.showModal = () => { element.open = true; }; element.close = () => { element.open = false; }; }
    return element;
  };
  doc.removeEventListener = () => {}; doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  return doc;
}
function definition(model) {
  const draft = model.createDefinitionDraft({ stageId: 'fictional-template-stage', stepId: 'fictional-template-step' }).definition;
  draft.name = 'Fikcyjny ogólny szablon'; draft.stages[0].title = 'Fikcyjny etap'; draft.steps[0].title = 'Fikcyjne badanie';
  draft.steps[0].requiredOutcome = 'resultReceipt'; return draft;
}
function metadata(record) {
  return { templateId: record.templateId, title: record.definition?.name || 'Fikcyjny konflikt', status: record.status,
    headRevisionId: record.headRevisionId, revisionNumber: record.revisionNumber, baseToken: record.baseToken,
    stageCount: record.definition?.stages.length || 0, stepCount: record.definition?.steps.length || 0 };
}
function fixture({ records: initial = [], overrides = {} } = {}) {
  const doc = documentFixture(), host = doc.createElement('div'); doc.body.appendChild(host);
  const win = { document: doc, crypto: globalThis.crypto, setTimeout, clearTimeout, Blob: globalThis.Blob,
    URL: { createObjectURL: vi.fn(() => 'blob:fictional-template-library'), revokeObjectURL: vi.fn() } }, records = new Map(initial.map(record => [record.templateId, structuredClone(record)]));
  loadBrowserScript('vilda_care_template_model.js', win);
  let lock;
  const vault = {
    getCurrentUser: () => ({ userId: 'fictional-template-account' }), isUnlocked: () => true,
    getCarePlanTemplateCapability: vi.fn(async () => ({ readable: true, canSave: true, persistence: 'private-local', syncAvailable: false, maxImportBytes: 1024 })),
    listCarePlanTemplates: vi.fn(async () => Array.from(records.values()).map(metadata)),
    getCarePlanTemplate: vi.fn(async templateId => structuredClone(records.get(templateId) || null)),
    listCarePlanTemplateRevisions: vi.fn(async () => []),
    saveCarePlanTemplateRevision: vi.fn(async request => {
      const old = records.get(request.templateId), record = { templateId: request.templateId, status: 'active',
        baseToken: 'fictional-new-base', headRevisionId: 'fictional-new-revision', revisionNumber: (old?.revisionNumber || 0) + 1, definition: structuredClone(request.definition) };
      records.set(record.templateId, record); return { saved: true, templateId: record.templateId, template: record, persistence: 'local' };
    }),
    setCarePlanTemplateArchived: vi.fn(async request => {
      const record = records.get(request.templateId); record.status = request.archived ? 'archived' : 'active';
      return { saved: true, templateId: request.templateId, template: structuredClone(record), persistence: 'local' };
    }),
    resolveCarePlanTemplateConflict: vi.fn(async () => ({ saved: false, reason: 'conflict' })),
    getCarePlanTemplateOperation: vi.fn(async () => ({ state: 'unknown' })),
    exportCarePlanTemplateLibrary: vi.fn(async () => 'FICTIONAL-ENCRYPTED-LIBRARY'),
    importCarePlanTemplateLibrary: vi.fn(async () => ({ saved: true, persistence: 'local', importedTemplates: 1, importedOperations: 1 })),
    onCarePlanTemplateChanged: vi.fn(() => () => {}), onLock: fn => { lock = fn; }, ...overrides,
  };
  win.VildaVault = vault; loadBrowserScript('vilda_care_templates.js', win);
  const controller = win.VildaCareTemplates.mount(host, { vault });
  return { doc, host, win, model: win.VildaCareTemplateModel, vault, records, controller, lock: () => lock() };
}
function record(model, extra = {}) {
  return { templateId: 'fictional-template', status: 'active', baseToken: 'fictional-base', headRevisionId: 'fictional-revision-1',
    revisionNumber: 1, definition: definition(model), ...extra };
}
function prepareModel() { const win = {}; loadBrowserScript('vilda_care_template_model.js', win); return win.VildaCareTemplateModel; }
async function newWizard(d) {
  await settle(); findButton(d.host, 'Nowy szablon').click();
  change(input(d.host, 'Nazwa szablonu'), 'Fikcyjny nowy szablon'); findButton(d.host, 'Dalej').click();
  change(input(d.host, 'Nazwa etapu'), 'Fikcyjny etap');
  change(input(d.host, 'Co jest do zrobienia?'), 'Fikcyjny krok');
  change(input(d.host, 'Co kończy ten krok?'), 'performance');
}
const reviewBox = root => root.querySelectorAll('.vcp-check').find(label => label.textContent === 'Sprawdziłem nazwy i usunąłem informacje dotyczące pacjenta')?.querySelector('input');

describe('Private care-template wizard', () => {
  it('persists a complete explicit definition through the vault without patient fields', async () => {
    const d = fixture(); await newWizard(d); findButton(d.host, 'Dalej').click();
    findButton(d.host, 'Zapisz szablon').click(); await settle();
    expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1);
    const request = d.vault.saveCarePlanTemplateRevision.mock.calls[0][0];
    expect(request).toEqual({ templateId: expect.any(String), operationId: expect.any(String), baseToken: null, definition: expect.any(Object) });
    expect(d.model.validateDefinition(request.definition).valid).toBe(true);
    expect(request.definition.steps[0]).toMatchObject({ requiredOutcome: 'performance', reminderRule: { kind: 'none' } });
    expect(JSON.stringify(request)).not.toContain('patientId'); expect(JSON.stringify(request)).not.toContain('careContext');
    expect(d.host.textContent).toContain('Zapisano zmiany na tym urządzeniu.'); d.controller.destroy();
  });

  it('keeps a blank reminder offset invalid instead of converting it to zero', async () => {
    const d = fixture(); await newWizard(d);
    change(input(d.host, 'Początek liczenia przypomnienia'), 'stage-offset'); change(input(d.host, 'Liczba jednostek czasu'), '');
    findButton(d.host, 'Dalej').click();
    expect(d.controller.getContext().wizardStep).toBe(2);
    expect(input(d.host, 'Liczba jednostek czasu').value).toBe('');
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled();
    change(input(d.host, 'Liczba jednostek czasu'), '0'); findButton(d.host, 'Dalej').click();
    expect(d.controller.getContext().wizardStep).toBe(3); d.controller.destroy();
  });

  it('retains the exact failed request and freezes editing until its outcome is known', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Fikcyjna utrata odpowiedzi.')).mockResolvedValueOnce({ saved: true, persistence: 'remote', template: null });
    const d = fixture({ overrides: { saveCarePlanTemplateRevision: save } }); await newWizard(d); findButton(d.host, 'Dalej').click(); findButton(d.host, 'Zapisz szablon').click(); await settle();
    const request = structuredClone(save.mock.calls[0][0]);
    expect(d.host.textContent).toContain('Fikcyjna utrata odpowiedzi.');
    findButton(d.host, 'Ponów zapis').click(); await settle();
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[1][0]).toEqual(request);
    expect(d.host.textContent).toContain('Zapisano zmiany biblioteki.'); d.controller.destroy();
  });

  it('keeps draft content after conflict and never starts a second operation automatically', async () => {
    const d = fixture({ overrides: { saveCarePlanTemplateRevision: vi.fn(async () => ({ saved: false, conflict: true, reason: 'conflict' })) } });
    await newWizard(d); findButton(d.host, 'Dalej').click(); findButton(d.host, 'Zapisz szablon').click(); await settle();
    expect(d.host.textContent).toContain('Twoje zmiany pozostały w formularzu');
    expect(d.host.textContent).toContain('Fikcyjny krok');
    expect(findButton(d.host, 'Zapisz jako nowy szablon')).toBeDefined();
    expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1); d.controller.destroy();
  });

  it('requires final patient-copy text review and resets it after changing a reviewed name', async () => {
    const model = prepareModel(), source = definition(model); source.name = ''; source.steps[0].requiredOutcome = null;
    const getter = vi.fn(async () => ({ definition: source, requiresPrivacyReview: true }));
    const d = fixture({ overrides: { getCarePlanTemplateDraftFromPlan: getter } }); await settle(); await d.controller.copyFromPlan('fictional-patient-plan');
    change(input(d.host, 'Nazwa szablonu'), 'Fikcyjny ogólny układ'); findButton(d.host, 'Dalej').click(); change(input(d.host, 'Co kończy ten krok?'), 'decision'); findButton(d.host, 'Dalej').click();
    findButton(d.host, 'Zapisz szablon').click(); await settle(); expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled();
    reviewBox(d.host).checked = true; reviewBox(d.host).dispatch('change');
    findButton(d.host, 'Wstecz').click(); change(input(d.host, 'Co jest do zrobienia?'), 'Fikcyjna zmieniona nazwa'); findButton(d.host, 'Dalej').click();
    expect(reviewBox(d.host).checked).toBe(false);
    reviewBox(d.host).checked = true; reviewBox(d.host).dispatch('change'); findButton(d.host, 'Zapisz szablon').click(); await settle();
    expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.vault.saveCarePlanTemplateRevision.mock.calls[0][0])).not.toContain('fictional-patient-plan'); d.controller.destroy();
  });

  it('clears copied RAM data on lock and ignores a save response from the old session', async () => {
    let resolveSave;
    const pending = new Promise(resolve => { resolveSave = resolve; });
    const d = fixture({ overrides: { saveCarePlanTemplateRevision: vi.fn(() => pending) } }); await newWizard(d); findButton(d.host, 'Dalej').click(); findButton(d.host, 'Zapisz szablon').click();
    d.lock(); resolveSave({ saved: true, persistence: 'remote' }); await settle();
    expect(d.host.querySelector('.vct')).toBeNull(); expect(d.host.textContent).not.toContain('Fikcyjny krok');
  });

  it('does not mark navigation or a canonically reverted edit as unsaved definition changes', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Edytuj').click();
    expect(d.host.textContent).not.toContain('Zmiany niezapisane');
    change(input(d.host, 'Wybierz etap'), selected.definition.stages[0].id);
    expect(d.host.textContent).not.toContain('Zmiany niezapisane');
    const title = selected.definition.steps[0].title; change(input(d.host, 'Co jest do zrobienia?'), title + ' zmiana');
    expect(d.host.textContent).toContain('Zmiany niezapisane');
    change(input(d.host, 'Co jest do zrobienia?'), '  ' + title + '  ');
    expect(d.host.textContent).not.toContain('Zmiany niezapisane'); d.controller.destroy();
  });

  it('shows the confirmed local save immediately while the separate refresh waits for network', async () => {
    let resolveSync;
    const pending = new Promise(resolve => { resolveSync = resolve; });
    const d = fixture(); await newWizard(d); findButton(d.host, 'Dalej').click();
    d.vault.getCarePlanTemplateCapability.mockResolvedValue({ readable: true, canSave: true, persistence: 'private-local', syncAvailable: true, maxImportBytes: 1024 });
    d.win.VildaSync = { syncTemplateLibrary: vi.fn(() => pending) };
    findButton(d.host, 'Zapisz szablon').click(); await settle();
    expect(d.host.textContent).toContain('Zapisano zmiany na tym urządzeniu.');
    expect(d.host.querySelector('.vct-template-row').textContent).toContain('Fikcyjny nowy szablon');
    expect(findButton(d.host, 'Zamknij bibliotekę szablonów').disabled).toBe(false);
    resolveSync({ state: 'ready', pending: false }); await settle(); d.controller.destroy();
  });

  it('updates the wizard counter and clears its transient reorder announcement on preview navigation', async () => {
    const d = fixture(); await newWizard(d);
    expect(d.host.querySelector('.vct-footer').textContent).toContain('1 etap · 1 krok');
    findButton(d.host, 'Dodaj etap').click(); change(input(d.host, 'Co jest do zrobienia?'), 'Fikcyjny drugi krok'); change(input(d.host, 'Co kończy ten krok?'), 'decision');
    findButton(d.host, 'Przesuń etap w górę').click();
    expect(d.host.textContent).toContain('Zmieniono układ szkicu.');
    expect(d.host.querySelector('.vct-footer').textContent).toContain('2 etapy · 2 kroki');
    findButton(d.host, 'Dalej').click();
    expect(d.controller.getContext().wizardStep).toBe(3);
    expect(d.host.textContent).not.toContain('Zmieniono układ szkicu.'); d.controller.destroy();
  });
});

describe('Private template library browsing and revision actions', () => {
  it.each([[1, 'etap', 'krok'], [2, 'etapy', 'kroki'], [5, 'etapów', 'kroków'], [12, 'etapów', 'kroków'], [14, 'etapów', 'kroków'], [21, 'etapów', 'kroków'], [22, 'etapy', 'kroki']])('uses Polish structure counts for %i', async (count, stages, steps) => {
    const d = fixture({ overrides: { listCarePlanTemplates: vi.fn(async () => [{ templateId: 'fictional-count', title: 'Fikcyjny licznik', status: 'active', stageCount: count, stepCount: count, revisionNumber: 1 }]) } }); await settle();
    expect(d.host.querySelector('.vct-template-row').textContent).toContain(count + ' ' + stages + ' · ' + count + ' ' + steps); d.controller.destroy();
  });

  it('treats a library failure as an error rather than an empty account', async () => {
    const d = fixture({ overrides: { listCarePlanTemplates: vi.fn(async () => { throw new Error('Fikcyjny błąd odczytu.'); }) } }); await settle();
    expect(d.host.textContent).toContain('Fikcyjny błąd odczytu.'); expect(d.host.textContent).not.toContain('Nie masz jeszcze własnych szablonów.'); d.controller.destroy();
  });

  it('retains the previous readable list when a later refresh fails', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    d.vault.listCarePlanTemplates.mockRejectedValueOnce(new Error('Fikcyjny późniejszy błąd.')); await d.controller.refresh();
    expect(d.host.textContent).toContain(selected.definition.name);
    expect(d.host.textContent).toContain('Fikcyjny późniejszy błąd.');
    expect(d.host.textContent).not.toContain('Nie masz jeszcze własnych szablonów.'); d.controller.destroy();
  });

  it('does not infer an empty remote library when the independent sync phase is disabled', async () => {
    const d = fixture({ overrides: { getCarePlanTemplateCapability: vi.fn(async () => ({ readable: true, canSave: false, persistence: 'remote-ack', syncAvailable: true })) } });
    d.win.VildaSync = { syncTemplateLibrary: vi.fn(async () => ({ state: 'disabled' })) }; await settle();
    expect(d.host.textContent).toContain('Nie można teraz odczytać zdalnej biblioteki.');
    expect(d.host.textContent).not.toContain('Nie masz jeszcze własnych szablonów.'); d.controller.destroy();
  });

  it('keeps remote authority unavailable through filters when the transport SDK is missing and recovers only after refresh', async () => {
    const capability = vi.fn(async () => ({ readable: true, canSave: false, persistence: 'remote-ack', syncAvailable: false }));
    const d = fixture({ overrides: { getCarePlanTemplateCapability: capability } }); await settle();
    expect(d.vault.listCarePlanTemplates).not.toHaveBeenCalled();
    expect(d.host.textContent).toContain('Nie można teraz odczytać zdalnej biblioteki.');
    expect(findButton(d.host, 'Nowy szablon').disabled).toBe(true);
    findButton(d.host, 'Archiwum').click();
    expect(d.host.textContent).toContain('Nie można teraz odczytać zdalnej biblioteki.');
    expect(d.host.textContent).not.toContain('Archiwum jest puste.');
    findButton(d.host, 'Aktywne').click(); change(input(d.host, 'Szukaj własnego szablonu'), 'Fikcyjny');
    expect(d.host.textContent).not.toContain('Brak pasujących szablonów.');
    change(input(d.host, 'Szukaj własnego szablonu'), '');
    expect(d.host.textContent).not.toContain('Nie masz jeszcze własnych szablonów.');
    capability.mockResolvedValue({ readable: true, canSave: true, persistence: 'remote-ack', syncAvailable: true });
    d.win.VildaSync = { syncTemplateLibrary: vi.fn(async () => ({ state: 'ready', pending: false })) }; await d.controller.refresh();
    expect(d.vault.listCarePlanTemplates).toHaveBeenCalledTimes(1);
    expect(d.host.textContent).toContain('Nie masz jeszcze własnych szablonów.');
    expect(d.host.querySelector('[role="alert"]')).toBeNull(); d.controller.destroy();
  });

  it.each(['missing', 'disabled', 'rejected'])('retains previously received remote records after the transport becomes %s', async transport => {
    const model = prepareModel(), selected = record(model);
    const capability = vi.fn(async () => ({ readable: true, canSave: true, persistence: 'remote-ack', syncAvailable: true }));
    const d = fixture({ records: [selected], overrides: { getCarePlanTemplateCapability: capability } });
    d.win.VildaSync = { syncTemplateLibrary: vi.fn(async () => ({ state: 'ready', pending: false })) }; await settle();
    expect(d.vault.listCarePlanTemplates).toHaveBeenCalledTimes(1);
    d.vault.listCarePlanTemplates.mockResolvedValue([]);
    if (transport === 'missing') { delete d.win.VildaSync; capability.mockResolvedValue({ readable: true, canSave: false, persistence: 'remote-ack', syncAvailable: false }); }
    else if (transport === 'disabled') d.win.VildaSync.syncTemplateLibrary.mockResolvedValue({ state: 'disabled' });
    else d.win.VildaSync.syncTemplateLibrary.mockRejectedValue(new Error('Fikcyjny błąd transportu.'));
    await d.controller.refresh();
    expect(d.vault.listCarePlanTemplates).toHaveBeenCalledTimes(1);
    expect(d.host.querySelector('.vct-template-row').textContent).toContain(selected.definition.name);
    expect(d.host.querySelector('[role="alert"]')).not.toBeNull();
    findButton(d.host, 'Archiwum').click();
    expect(d.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(d.host.textContent).not.toContain('Archiwum jest puste.');
    findButton(d.host, 'Aktywne').click();
    expect(d.host.querySelector('.vct-template-row').textContent).toContain(selected.definition.name); d.controller.destroy();
  });

  it('respects intentional disabled sync in private mode and labels the local scope without an error', async () => {
    const d = fixture({ overrides: { getCarePlanTemplateCapability: vi.fn(async () => ({ readable: true, canSave: true, persistence: 'private-local', syncAvailable: true, maxImportBytes: 1024 })) } });
    d.win.VildaSync = { syncTemplateLibrary: vi.fn(async () => ({ state: 'disabled' })) }; await settle();
    expect(d.host.textContent).toContain('Synchronizacja jest wyłączona.');
    expect(d.host.textContent).toContain('Brak szablonów zapisanych na tym urządzeniu.');
    expect(d.host.querySelector('[role="alert"]')).toBeNull();
    expect(findButton(d.host, 'Nowy szablon').disabled).toBe(false); d.controller.destroy();
  });

  it('passes both chosen content and archive state when explicitly resolving parallel edits', async () => {
    const model = prepareModel(), first = definition(model), second = structuredClone(first); second.name = 'Fikcyjna druga wersja';
    const selected = record(model, { status: 'conflict', headRevisionId: null, definition: null,
      conflicts: { heads: [{ revisionId: 'fictional-head-a', definition: first, operationIds: ['fictional-op-a'] }, { revisionId: 'fictional-head-b', definition: second, operationIds: ['fictional-op-b'] }], archiveChoices: [{ archived: false }, { archived: true }], observedOperationHeads: ['fictional-op-a', 'fictional-op-b'] } });
    const d = fixture({ records: [selected] }); await settle(); findButton(d.host, 'Przejrzyj zmiany').click(); await settle();
    findButton(d.host, 'Potwierdź wybrane zmiany').click(); expect(d.vault.resolveCarePlanTemplateConflict).not.toHaveBeenCalled();
    findButton(d.host, 'Wybierz wersję 2').click(); change(input(d.host, 'Po przeglądzie szablon ma być'), 'archived');
    findButton(d.host, 'Potwierdź wybrane zmiany').click(); await settle();
    expect(d.vault.resolveCarePlanTemplateConflict).toHaveBeenCalledWith({ templateId: selected.templateId, operationId: expect.any(String), baseToken: selected.baseToken, headRevisionId: 'fictional-head-b', archived: true }); d.controller.destroy();
  });

  it('archives and restores by metadata actions while previewing the original definition', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Archiwizuj').click();
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled(); findButton(d.host, 'Potwierdź').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived.mock.calls[0][0]).toMatchObject({ templateId: selected.templateId, baseToken: selected.baseToken, archived: true });
    findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Przywróć do biblioteki').click(); findButton(d.host, 'Potwierdź').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived.mock.calls[1][0].archived).toBe(false);
    expect(d.records.get(selected.templateId).definition).toEqual(selected.definition); d.controller.destroy();
  });

  it('creates independent definition identities when duplicating a stored template', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle(); findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Utwórz kopię').click();
    change(input(d.host, 'Nazwa szablonu'), 'Fikcyjna osobna kopia'); findButton(d.host, 'Dalej').click(); findButton(d.host, 'Dalej').click(); findButton(d.host, 'Zapisz szablon').click(); await settle();
    const request = d.vault.saveCarePlanTemplateRevision.mock.calls[0][0]; expect(request.templateId).not.toBe(selected.templateId);
    expect(request.definition.stages[0].id).not.toBe(selected.definition.stages[0].id);
    expect(request.definition.steps[0].id).not.toBe(selected.definition.steps[0].id);
    expect(d.records.get(selected.templateId).definition).toEqual(selected.definition); d.controller.destroy();
  });

  it('opens an exact historical revision as read-only rather than editing the current head', async () => {
    const model = prepareModel(), selected = record(model), historical = definition(model); historical.name = 'Fikcyjna dawna nazwa';
    const get = vi.fn(async (_templateId, options) => options.revisionId ? { ...selected, definition: historical, revisionId: options.revisionId } : selected);
    const d = fixture({ records: [selected], overrides: { getCarePlanTemplate: get } }); await settle();
    await d.controller.open(selected.templateId, 'fictional-old-revision');
    expect(get).toHaveBeenCalledWith(selected.templateId, { revisionId: 'fictional-old-revision' });
    expect(d.host.textContent).toContain('Fikcyjna dawna nazwa');
    expect(findButton(d.host, 'Edytuj')).toBeUndefined(); expect(findButton(d.host, 'Archiwizuj')).toBeUndefined();
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('retains unavailable versions in either filter and does not pretend they have readable step counts', async () => {
    const selected = { templateId: 'fictional-unavailable', title: 'Fikcyjna nieobsługiwana wersja', status: 'unsupported', readOnly: true, definition: null, baseToken: null, headRevisionId: null, revisionNumber: null };
    const d = fixture({ records: [selected] }); await settle();
    expect(d.host.textContent).toContain('Nie można odczytać tej wersji szablonu.');
    expect(d.host.textContent).not.toContain('null etapów'); findButton(d.host, 'Archiwum').click();
    expect(d.host.textContent).toContain('Nie można odczytać tej wersji szablonu.'); d.controller.destroy();
  });
});

describe('Dedicated encrypted template-library backup', () => {
  it('explains the same-key scope before downloading the opaque encrypted blob', async () => {
    const d = fixture(); await settle(); findButton(d.host, 'Eksportuj bibliotekę').click();
    expect(d.host.textContent).toContain('pełny kod synchronizacji');
    expect(d.vault.exportCarePlanTemplateLibrary).not.toHaveBeenCalled(); findButton(d.host, 'Potwierdź').click(); await settle();
    expect(d.vault.exportCarePlanTemplateLibrary).toHaveBeenCalledTimes(1);
    const blob = d.win.URL.createObjectURL.mock.calls[0][0];
    expect(await blob.text()).toBe('FICTIONAL-ENCRYPTED-LIBRARY');
    expect(d.host.textContent).toContain('Pobrano szyfrowaną bibliotekę.'); d.controller.destroy();
  });

  it('uses the shared import size before reading a selected fictional file', async () => {
    const d = fixture(); await settle(); const file = { size: 2048, text: vi.fn(async () => 'FICTIONAL') };
    await d.controller.importLibrary(file);
    expect(file.text).not.toHaveBeenCalled(); expect(d.vault.importCarePlanTemplateLibrary).not.toHaveBeenCalled();
    expect(d.host.textContent).toContain('Plik biblioteki przekracza obsługiwany rozmiar.'); d.controller.destroy();
  });

  it('retains the selected file and existing draft after an unconfirmed import and retries exactly that ciphertext', async () => {
    const imported = vi.fn().mockRejectedValueOnce(new Error('Fikcyjnie nie potwierdzono przesyłki.')).mockResolvedValueOnce({ saved: true, persistence: 'remote' });
    const d = fixture({ overrides: { importCarePlanTemplateLibrary: imported } }); await newWizard(d);
    findButton(d.host, '← Moje szablony').click();
    const file = { size: 42, text: vi.fn(async () => 'FICTIONAL-SAME-ENCRYPTED-FILE') };
    await d.controller.importLibrary(file);
    expect(d.host.textContent).toContain('Fikcyjnie nie potwierdzono przesyłki.');
    expect(findButton(d.host, 'Wróć do edycji')).toBeDefined();
    findButton(d.host, 'Ponów import').click(); await settle();
    expect(file.text).toHaveBeenCalledTimes(1);
    expect(imported.mock.calls.map(call => call[0])).toEqual(['FICTIONAL-SAME-ENCRYPTED-FILE', 'FICTIONAL-SAME-ENCRYPTED-FILE']);
    findButton(d.host, 'Wróć do edycji').click(); expect(input(d.host, 'Co jest do zrobienia?').value).toBe('Fikcyjny krok'); d.controller.destroy();
  });

  it('does not import a file whose read finishes after the account was locked', async () => {
    let resolveText;
    const d = fixture(); await settle(); const file = { size: 42, text: () => new Promise(resolve => { resolveText = resolve; }) };
    const loading = d.controller.importLibrary(file); d.lock(); resolveText('FICTIONAL-LATE-FILE'); await loading;
    expect(d.vault.importCarePlanTemplateLibrary).not.toHaveBeenCalled(); expect(d.host.querySelector('.vct')).toBeNull();
  });
});

describe('Care-template assets load only on explicit use', () => {
  function loader() {
    const doc = documentFixture(), requests = [], append = doc.body.appendChild.bind(doc.body);
    doc.body.appendChild = element => { append(element); if (element.tagName === 'SCRIPT' || element.tagName === 'LINK') requests.push(element); return element; };
    const win = { document: doc }; loadBrowserScript('vilda_care_plans.js', win);
    return { doc, win, requests, api: win.VildaCarePlans };
  }
  it('coalesces model/store loading and adds UI/CSS only when requested', async () => {
    const d = loader(); expect(d.requests).toHaveLength(0);
    const first = d.api.ensureTemplateLibrary({ ui: false }), second = d.api.ensureTemplateLibrary({ ui: false }); expect(first).toBe(second);
    expect(d.requests.map(element => element.src || element.href)).toEqual(['vilda_care_template_model.js?v=1']);
    d.win.VildaCareTemplateModel = {}; d.requests[0].onload(); await settle();
    expect(d.requests[1].src).toBe('vilda_care_template_store.js?v=1'); d.win.VildaCareTemplateStore = {}; d.requests[1].onload(); await first;
    const ui = d.api.ensureTemplateLibrary(); await settle(); expect(d.requests).toHaveLength(4);
    d.requests[2].onload(); d.win.VildaCareTemplates = { open: vi.fn() }; d.requests[3].onload(); await ui;
    await d.api.ensureTemplateLibrary(); expect(d.requests).toHaveLength(4);
  });
  it('allows a real retry after a failed asset without changing existing startup readiness', async () => {
    const d = loader(), failed = d.api.ensureTemplateLibrary({ ui: false }); d.requests[0].onerror(); await expect(failed).rejects.toThrow('Nie udało się wczytać');
    const retried = d.api.ensureTemplateLibrary({ ui: false }); expect(d.requests[1].src).toBe('vilda_care_template_model.js?v=1');
    d.win.VildaCareTemplateModel = {}; d.requests[1].onload(); await settle(); d.win.VildaCareTemplateStore = {}; d.requests[2].onload(); await retried;
  });
  it('does not open a late library dialog after a lock and unlock of the same account', async () => {
    const d = loader(); let locked; const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-same-account' }), onLock: fn => { locked = fn; } };
    const opened = d.api.openTemplates({ vault }); locked();
    d.win.VildaCareTemplateModel = {}; d.requests[0].onload(); await settle(); d.win.VildaCareTemplateStore = {}; d.requests[1].onload(); await settle();
    d.requests[2].onload(); d.win.VildaCareTemplates = { open: vi.fn() }; d.requests[3].onload();
    expect(await opened).toBeNull(); expect(d.win.VildaCareTemplates.open).not.toHaveBeenCalled();
  });
});

describe('Settings template-library entry lifecycle', () => {
  function settingsEntry() {
    const doc = documentFixture(), button = doc.createElement('button'), status = doc.createElement('div');
    button.id = 'openCareTemplateLibraryBtn'; status.id = 'vaultBackupStatus'; status.textContent = 'Fikcyjny bieżący status.';
    doc.body.appendChild(button); doc.body.appendChild(status);
    const listeners = { lock: [], unlock: [] }; let unlocked = true, userId = 'fictional-settings-owner';
    const vault = { isUnlocked: () => unlocked, getCurrentUser: () => unlocked ? { userId } : null,
      onLock: fn => listeners.lock.push(fn), onUnlock: fn => listeners.unlock.push(fn) };
    const open = vi.fn(), win = { document: doc, VildaVault: vault, VildaCarePlans: { openTemplates: open } };
    const source = readFileSync(new URL('../../inline_ustawienia_04.js', import.meta.url), 'utf8');
    const start = source.lastIndexOf('\n(function (win) {');
    expect(start).toBeGreaterThan(0);
    new Function('window', source.slice(start))(win);
    return { button, status, open,
      lock() { unlocked = false; listeners.lock.forEach(fn => fn()); },
      unlock(nextUserId = userId) { userId = nextUserId; unlocked = true; listeners.unlock.forEach(fn => fn()); } };
  }

  it('restores the neutral entry after a lazy open rejects while locked without replaying its status after unlock', async () => {
    let rejectOpen; const d = settingsEntry();
    d.open.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectOpen = reject; }));
    d.button.click(); expect(d.button.disabled).toBe(true); const oldCurrent = d.open.mock.calls[0][0].isCurrent;
    d.lock(); expect(oldCurrent()).toBeFalsy();
    rejectOpen(new Error('Fikcyjny prywatny błąd starej sesji.')); await settle();
    expect(d.button.disabled).toBe(true);
    expect(d.status.textContent).not.toContain('Fikcyjny prywatny błąd starej sesji.');
    d.unlock(); expect(d.button.disabled).toBe(false); expect(oldCurrent()).toBeFalsy();
    d.status.textContent = 'Fikcyjny nowy status.'; d.open.mockResolvedValueOnce(null); d.button.click(); await settle();
    expect(d.open).toHaveBeenCalledTimes(2); expect(d.button.disabled).toBe(false);
    expect(d.status.textContent).toBe('Fikcyjny nowy status.');
  });

  it.each(['fictional-settings-owner', 'fictional-settings-other-owner'])('ignores an old settled open while a new request owns the entry for %s', async userId => {
    let resolveOld, resolveNew; const d = settingsEntry();
    d.open.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
    d.button.click(); const oldCurrent = d.open.mock.calls[0][0].isCurrent;
    d.lock(); d.unlock(userId); expect(d.button.disabled).toBe(false);
    d.status.textContent = 'Fikcyjny status nowej sesji.'; d.button.click();
    const newCurrent = d.open.mock.calls[1][0].isCurrent;
    expect(newCurrent()).toBe(true); expect(oldCurrent()).toBe(false);
    resolveOld(null); await settle();
    expect(d.button.disabled).toBe(true); expect(d.status.textContent).toBe('Wczytywanie biblioteki szablonów…');
    resolveNew(null); await settle();
    expect(d.button.disabled).toBe(false); expect(d.status.textContent).toBe('Fikcyjny status nowej sesji.');
  });
});
