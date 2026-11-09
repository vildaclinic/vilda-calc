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
    stageCount: record.definition?.stages.length || 0, stepCount: record.definition?.steps.length || 0, definition: record.definition ? structuredClone(record.definition) : null };
}
function fixture({ records: initial = [], overrides = {} } = {}) {
  const doc = documentFixture(), host = doc.createElement('div'); doc.body.appendChild(host);
  const win = { document: doc, crypto: globalThis.crypto, setTimeout, clearTimeout, Blob: globalThis.Blob,
    URL: { createObjectURL: vi.fn(() => 'blob:fictional-template-library'), revokeObjectURL: vi.fn() } }, records = new Map(initial.map(record => [record.templateId, structuredClone(record)]));
  loadBrowserScript('vilda_care_template_model.js', win); loadBrowserScript('vilda_care_template_transfer.js', win);
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
    findButton(d.host, 'Usunięte').click();
    expect(d.host.textContent).toContain('Nie można teraz odczytać zdalnej biblioteki.');
    expect(d.host.textContent).not.toContain('Nie ma usuniętych szablonów.');
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
    findButton(d.host, 'Usunięte').click();
    expect(d.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(d.host.textContent).not.toContain('Nie ma usuniętych szablonów.');
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

  it('removes from the visible list only after confirmation and restores from Removed without changing the definition', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    const removeLabel = 'Usuń szablon: ' + selected.definition.name;
    findButton(d.host, removeLabel).click(); await settle();
    expect(d.host.textContent).toContain('Plany pacjentów utworzone z tego szablonu pozostaną bez zmian.');
    expect(d.doc.activeElement.textContent).toContain('Usunąć szablon');
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled();
    findButton(d.host, 'Anuluj').click(); expect(d.doc.activeElement).toBe(findButton(d.host, removeLabel));
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled();
    findButton(d.host, removeLabel).click(); await settle(); findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived.mock.calls[0][0]).toMatchObject({ templateId: selected.templateId, baseToken: selected.baseToken, archived: true });
    expect(findButton(d.host, 'Aktywne').getAttribute('aria-pressed')).toBe('true');
    expect(d.host.querySelector('.vct-template-row')).toBeNull();
    expect(d.host.textContent).toContain('Możesz go przywrócić w Usuniętych.');
    findButton(d.host, 'Usunięte').click(); findButton(d.host, 'Przywróć').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived).toHaveBeenCalledTimes(1);
    findButton(d.host, 'Przywróć').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived.mock.calls[1][0].archived).toBe(false);
    expect(findButton(d.host, 'Aktywne').getAttribute('aria-pressed')).toBe('true');
    expect(findButton(d.host, removeLabel)).toBeDefined();
    expect(d.records.get(selected.templateId).definition).toEqual(selected.definition); d.controller.destroy();
  });

  it('reads the current token before asking to remove from a stale preview', async () => {
    const selected = record(prepareModel()), d = fixture({ records: [selected] }); await settle();
    findButton(d.host, 'Podgląd').click(); await settle();
    const latest = d.records.get(selected.templateId); latest.baseToken = 'fictional-revised-base'; latest.definition.name = 'Fikcyjna zmieniona nazwa';
    findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(d.host.textContent).toContain('Usunąć szablon „Fikcyjna zmieniona nazwa”');
    findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(d.vault.setCarePlanTemplateArchived).toHaveBeenCalledWith({ templateId: selected.templateId, baseToken: 'fictional-revised-base', operationId: expect.any(String), archived: true });
    d.controller.destroy();
  });

  it('retains the confirmed token when a template changes during confirmation and requires an explicit new action', async () => {
    const selected = record(prepareModel()), latest = { ...selected, baseToken: 'fictional-concurrent-base' };
    const remove = vi.fn(async () => ({ saved: false, reason: 'conflict', conflict: true, template: latest }));
    const d = fixture({ records: [selected], overrides: { setCarePlanTemplateArchived: remove } }); await settle();
    findButton(d.host, 'Usuń szablon').click(); await settle();
    d.records.set(selected.templateId, latest); findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(remove).toHaveBeenCalledTimes(1); expect(remove.mock.calls[0][0].baseToken).toBe(selected.baseToken);
    expect(d.host.textContent).toContain('Sprawdź bieżącą wersję przed ponownym usunięciem.');
    expect(d.host.textContent).not.toContain('pozostały w formularzu');
    expect(d.host.querySelector('.vct-confirmation')).toBeNull();
    expect(d.records.get(selected.templateId).status).toBe('active'); d.controller.destroy();
  });

  it.each(['conflict', 'archived', 'unsupported'])('does not confirm a removal when a fresh read changes availability to %s', async status => {
    const selected = record(prepareModel()), d = fixture({ records: [selected] }); await settle();
    d.records.set(selected.templateId, { ...selected, status, definition: status === 'unsupported' ? null : selected.definition, readOnly: status === 'unsupported' });
    findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(d.host.querySelector('.vct-confirmation')).toBeNull();
    expect(d.host.textContent).toContain('Sprawdź jego bieżącą wersję.');
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled();
    expect(d.controller.getContext().view).toBe(status === 'conflict' ? 'resolve' : 'detail'); d.controller.destroy();
  });

  it('rejects an unrelated template returned by the pre-confirmation read', async () => {
    const selected = record(prepareModel());
    const d = fixture({ records: [selected], overrides: { getCarePlanTemplate: vi.fn(async () => ({ ...selected, templateId: 'fictional-unrelated-template' })) } }); await settle();
    findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(d.host.querySelector('.vct-confirmation')).toBeNull();
    expect(d.host.textContent).toContain('Nie można potwierdzić bieżącej wersji tego szablonu.');
    expect(d.doc.activeElement.getAttribute('role')).toBe('alert');
    expect(d.doc.activeElement.textContent).toContain('Nie można potwierdzić bieżącej wersji tego szablonu.');
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('keeps an open confirmation stable and signals background changes after cancellation', async () => {
    const selected = record(prepareModel()), d = fixture({ records: [selected] }); await settle();
    findButton(d.host, 'Usuń szablon').click(); await settle();
    const title = d.host.querySelector('.vct-confirmation h2');
    d.vault.onCarePlanTemplateChanged.mock.calls[0][0](); await d.controller.refresh();
    expect(d.host.querySelector('.vct-confirmation h2')).toBe(title);
    expect(d.doc.activeElement).toBe(title);
    findButton(d.host, 'Anuluj').click();
    expect(d.host.textContent).toContain('Biblioteka zmieniła się w tle.');
    expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('retries the exact uncertain removal and disables additional availability actions', async () => {
    const selected = record(prepareModel()), removed = { ...selected, status: 'archived' };
    const remove = vi.fn().mockRejectedValueOnce(new Error('Fikcyjna utrata odpowiedzi.')).mockResolvedValueOnce({ saved: true, template: removed, persistence: 'remote' });
    const d = fixture({ records: [selected], overrides: { setCarePlanTemplateArchived: remove } }); await settle();
    findButton(d.host, 'Usuń szablon').click(); await settle(); findButton(d.host, 'Usuń szablon').click(); await settle();
    expect(findButton(d.host, 'Usuń szablon').disabled).toBe(true);
    findButton(d.host, 'Usuń szablon').click(); expect(remove).toHaveBeenCalledTimes(1);
    d.records.set(selected.templateId, removed); findButton(d.host, 'Ponów zapis').click(); await settle();
    expect(remove).toHaveBeenCalledTimes(2); expect(remove.mock.calls[1][0]).toEqual(remove.mock.calls[0][0]);
    expect(d.host.querySelector('.vct-template-row')).toBeNull(); d.controller.destroy();
  });

  it('ignores a pending removal read after an account switch or lock', async () => {
    let resolveRead, account = 'fictional-template-account';
    const selected = record(prepareModel()), pending = new Promise(resolve => { resolveRead = resolve; });
    const d = fixture({ records: [selected], overrides: { getCurrentUser: () => ({ userId: account }), getCarePlanTemplate: vi.fn(() => pending) } }); await settle();
    findButton(d.host, 'Usuń szablon').click(); account = 'fictional-other-account'; d.lock(); resolveRead(selected); await settle();
    expect(d.host.querySelector('.vct')).toBeNull(); expect(d.vault.setCarePlanTemplateArchived).not.toHaveBeenCalled();
  });

  it('does not expose availability actions for unreadable, read-only or conflicted records', async () => {
    const selected = record(prepareModel());
    for (const extra of [{ status: 'unsupported' }, { readOnly: true }, { status: 'conflict' }]) {
      const d = fixture({ records: [{ ...selected, ...extra }], overrides: { listCarePlanTemplates: vi.fn(async () => [{ ...selected, ...extra }]) } }); await settle();
      expect(findButton(d.host, 'Usuń szablon')).toBeUndefined(); expect(findButton(d.host, 'Przywróć')).toBeUndefined(); d.controller.destroy();
    }
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
    expect(findButton(d.host, 'Edytuj')).toBeUndefined(); expect(findButton(d.host, 'Usuń szablon')).toBeUndefined(); expect(findButton(d.host, 'Przywróć')).toBeUndefined();
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('retains unavailable versions in either filter and does not pretend they have readable step counts', async () => {
    const selected = { templateId: 'fictional-unavailable', title: 'Fikcyjna nieobsługiwana wersja', status: 'unsupported', readOnly: true, definition: null, baseToken: null, headRevisionId: null, revisionNumber: null };
    const d = fixture({ records: [selected] }); await settle();
    expect(d.host.textContent).toContain('Nie można odczytać tej wersji szablonu.');
    expect(d.host.textContent).not.toContain('null etapów'); findButton(d.host, 'Usunięte').click();
    expect(d.host.textContent).toContain('Nie można odczytać tej wersji szablonu.'); d.controller.destroy();
  });
});

function publicationDefinition(model) {
  const value = definition(model); value.contentVersion = 2;
  value.publication = { id: 'fictional-publication', version: '1.0', authors: ['Fikcyjna Autorka'], contributors: [],
    sources: [{ title: 'Fikcyjne źródło', url: 'https://example.org/fictional-source', version: '2026' }],
    license: { id: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/', text: '', allowRedistribution: true, allowAdaptation: true },
    attribution: 'Opracowanie: Fikcyjna Autorka', changes: '', origin: null };
  return value;
}
function checkBox(root, label) { return root.querySelectorAll('.vcp-check').find(element => element.textContent === label)?.querySelector('input'); }
function tick(root, label, checked = true) { const box = checkBox(root, label); expect(box).toBeDefined(); box.checked = checked; box.dispatch('change'); }
async function transferFile(d, value = publicationDefinition(d.model)) {
  const exported = await d.win.VildaCareTemplateTransfer.serialize(value); expect(exported.ok).toBe(true);
  return { size: Buffer.byteLength(exported.text), text: vi.fn(async () => exported.text) };
}

describe('Portable single-template transfer', () => {
  it('offers one-template import and no whole-library interface or controller', async () => {
    const d = fixture(); await settle();
    expect(findButton(d.host, 'Importuj szablon')).toBeDefined();
    expect(findButton(d.host, 'Eksportuj bibliotekę')).toBeUndefined();
    expect(findButton(d.host, 'Importuj bibliotekę')).toBeUndefined();
    expect(d.controller.exportLibrary).toBeUndefined(); expect(d.controller.importLibrary).toBeUndefined();
    expect(input(d.host, 'Plik szablonu').accept).toBe('.vilda-template.json,application/json'); d.controller.destroy();
  });

  it('checks the single-file size before reading or writing', async () => {
    const d = fixture(); await settle(); const file = { size: d.win.VildaCareTemplateTransfer.MAX_BYTES + 1, text: vi.fn(async () => 'FICTIONAL') };
    await d.controller.importTemplate(file);
    expect(file.text).not.toHaveBeenCalled(); expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled();
    expect(d.host.textContent).toContain('Plik szablonu przekracza obsługiwany rozmiar'); d.controller.destroy();
  });

  it('requires explicit author, license and privacy review and saves these with the revision before downloading', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    await d.controller.exportTemplate(selected.templateId);
    expect(findButton(d.host, 'Zapisz informacje o szablonie').disabled).toBe(true);
    change(input(d.host, 'Autor opracowania'), 'Fikcyjny Autor');
    change(input(d.host, 'Źródło medyczne (opcjonalnie)'), 'Fikcyjne źródło');
    change(input(d.host, 'Adres źródła (opcjonalnie)'), 'https://example.org/fictional-source');
    change(input(d.host, 'Zasady udostępniania'), 'CC-BY-4.0');
    expect(d.host.textContent).toContain('także komercyjnie');
    tick(d.host, 'Mam prawo udostępnić ten szablon na wskazanych zasadach');
    tick(d.host, 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów');
    findButton(d.host, 'Zapisz informacje o szablonie').click(); await settle();
    expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1);
    expect(d.vault.saveCarePlanTemplateRevision.mock.calls[0][0]).toMatchObject({ templateId: selected.templateId, baseToken: selected.baseToken,
      definition: { contentVersion: 2, publication: { authors: ['Fikcyjny Autor'], license: { id: 'CC-BY-4.0' } } } });
    expect(d.win.URL.createObjectURL).not.toHaveBeenCalled();
    findButton(d.host, 'Pobierz szablon').click(); await vi.waitFor(() => expect(d.win.URL.createObjectURL).toHaveBeenCalledTimes(1));
    const blob = d.win.URL.createObjectURL.mock.calls[0][0], exported = await d.win.VildaCareTemplateTransfer.parse(await blob.text());
    expect(exported.ok).toBe(true); expect(exported.definition.publication.sources[0].title).toBe('Fikcyjne źródło');
    expect(await blob.text()).not.toContain('fictional-template-account');
    expect(d.vault.exportCarePlanTemplateLibrary).not.toHaveBeenCalled(); d.controller.destroy();
  });

  it('previews content and rights without writing and returns to the filtered library on cancel', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle();
    change(input(d.host, 'Szukaj własnego szablonu'), 'ogólny');
    const file = await transferFile(d); await d.controller.importTemplate(file);
    expect(d.host.textContent).toContain('Fikcyjna Autorka'); expect(d.host.textContent).toContain('Fikcyjne źródło');
    expect(d.host.textContent).toContain('Fikcyjne badanie'); expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled();
    expect(findButton(d.host, 'Zapisz jako nowy szablon').disabled).toBe(true);
    findButton(d.host, 'Anuluj').click(); await settle();
    expect(input(d.host, 'Szukaj własnego szablonu').value).toBe('ogólny'); expect(d.records.size).toBe(1); d.controller.destroy();
  });

  it('imports an independent copy with fresh local identities and warns on repeated publication without overwriting', async () => {
    const d = fixture(); await settle(); const source = publicationDefinition(d.model), file = await transferFile(d, source);
    await d.controller.importTemplate(file); tick(d.host, 'Zapoznałem się z autorstwem i zasadami udostępniania'); findButton(d.host, 'Zapisz jako nowy szablon').click(); await settle();
    const request = d.vault.saveCarePlanTemplateRevision.mock.calls[0][0];
    expect(request.baseToken).toBeNull(); expect(request.definition.stages[0].id).not.toBe(source.stages[0].id);
    expect(request.definition.steps[0].id).not.toBe(source.steps[0].id);
    expect(request.definition.publication.authors).toEqual(source.publication.authors);
    expect(request.definition.publication.license).toEqual(source.publication.license);
    expect(request.definition.publication.origin.id).toBe(source.publication.id);
    await d.controller.importTemplate(file);
    expect(d.host.textContent).toContain('jest już w bibliotece');
    tick(d.host, 'Zapoznałem się z autorstwem i zasadami udostępniania'); expect(findButton(d.host, 'Zapisz dodatkową kopię').disabled).toBe(true);
    tick(d.host, 'Rozumiem, że zapiszę dodatkową kopię istniejącego szablonu'); findButton(d.host, 'Zapisz dodatkową kopię').click(); await settle();
    expect(d.records.size).toBe(2); expect(d.vault.saveCarePlanTemplateRevision.mock.calls[1][0].templateId).not.toBe(request.templateId); d.controller.destroy();
  });

  it('retries an uncertain import using the exact same independent-copy operation', async () => {
    const saved = vi.fn().mockRejectedValueOnce(new Error('Fikcyjna utrata odpowiedzi.')).mockResolvedValueOnce({ saved: true, persistence: 'local', template: null });
    const d = fixture({ overrides: { saveCarePlanTemplateRevision: saved } }); await settle(); const file = await transferFile(d);
    await d.controller.importTemplate(file); tick(d.host, 'Zapoznałem się z autorstwem i zasadami udostępniania'); findButton(d.host, 'Zapisz jako nowy szablon').click(); await settle();
    expect(d.host.textContent).toContain('Fikcyjna utrata odpowiedzi.');
    findButton(d.host, 'Ponów zapis').click(); await settle();
    expect(saved.mock.calls[1][0]).toEqual(saved.mock.calls[0][0]); expect(file.text).toHaveBeenCalledTimes(1);
    expect(d.host.textContent).toContain('Zaimportowano nowy, niezależny szablon.'); d.controller.destroy();
  });

  it('rejects a whole-library payload without invoking the retired account import', async () => {
    const d = fixture(); await settle(); const file = { size: 48, text: async () => JSON.stringify({ format: 'vilda-care-template-library/v1', cipher: 'fictional' }) };
    await d.controller.importTemplate(file);
    expect(d.vault.importCarePlanTemplateLibrary).not.toHaveBeenCalled(); expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled();
    expect(d.host.textContent).toContain('nie są obsługiwane'); d.controller.destroy();
  });

  it('records the author and scope of an imported adaptation without replacing the upstream author or license', async () => {
    const d = fixture(); await settle(); const source = publicationDefinition(d.model), file = await transferFile(d, source);
    await d.controller.importTemplate(file); tick(d.host, 'Zapoznałem się z autorstwem i zasadami udostępniania'); findButton(d.host, 'Zapisz jako nowy szablon').click(); await settle();
    findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Edytuj').click();
    change(input(d.host, 'Co jest do zrobienia?'), 'Fikcyjna zmieniona instrukcja'); findButton(d.host, 'Dalej').click();
    findButton(d.host, 'Zapisz nową wersję').click(); await settle(); expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1);
    change(input(d.host, 'Autor zmian'), 'Fikcyjny Odbiorca'); change(input(d.host, 'Opis zmian'), 'Dostosowanie fikcyjnego kroku.'); change(input(d.host, 'Wersja opracowania'), '2.0');
    findButton(d.host, 'Zapisz nową wersję').click(); await settle();
    const publication = d.vault.saveCarePlanTemplateRevision.mock.calls[1][0].definition.publication;
    expect(publication.authors).toEqual(source.publication.authors); expect(publication.license).toEqual(source.publication.license);
    expect(publication.contributors).toContain('Fikcyjny Odbiorca'); expect(publication.changes).toContain('Dostosowanie fikcyjnego kroku.'); expect(publication.version).toBe('2.0'); d.controller.destroy();
  });

  it('does not require adaptation metadata for a whitespace-only edit of a published template', async () => {
    const model = prepareModel(), published = publicationDefinition(model), selected = record(model, { definition: published }), d = fixture({ records: [selected] }); await settle();
    findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Edytuj').click();
    change(input(d.host, 'Co jest do zrobienia?'), '  ' + published.steps[0].title + '  '); findButton(d.host, 'Dalej').click();
    expect(input(d.host, 'Autor zmian')).toBeUndefined(); findButton(d.host, 'Zapisz nową wersję').click(); await settle();
    expect(d.vault.saveCarePlanTemplateRevision).toHaveBeenCalledTimes(1);
    expect(d.vault.saveCarePlanTemplateRevision.mock.calls[0][0].definition.publication).toEqual(published.publication); d.controller.destroy();
  });

  it('shows provider update guidance without reporting an unsupported reader as an empty library', async () => {
    const d = fixture({ overrides: { getCarePlanTemplateCapability: vi.fn(async () => ({ readable: false, canSave: false, persistence: 'unsupported', reasonCode: 'CARE_TEMPLATE_READER_UPDATE_REQUIRED', maxContentVersion: 1, message: 'Odśwież aplikację, aby obsługiwać autorstwo i licencję.' })) } }); await settle();
    expect(d.host.textContent).toContain('Odśwież aplikację, aby obsługiwać autorstwo i licencję.');
    expect(d.host.textContent).not.toContain('Nie masz jeszcze własnych szablonów.'); expect(d.vault.listCarePlanTemplates).not.toHaveBeenCalled();
    expect(findButton(d.host, 'Importuj szablon').disabled).toBe(true); d.controller.destroy();
  });

  it('honors an imported prohibition on onward sharing and adaptation', async () => {
    const d = fixture(); await settle(); const source = publicationDefinition(d.model);
    source.publication.license = { id: 'custom', url: '', text: 'Fikcyjne zasady: tylko własny użytek, bez modyfikowania i dalszego przekazywania.', allowRedistribution: false, allowAdaptation: false };
    await d.controller.importTemplate(await transferFile(d, source)); tick(d.host, 'Zapoznałem się z autorstwem i zasadami udostępniania'); findButton(d.host, 'Zapisz jako nowy szablon').click(); await settle();
    const importedId = d.vault.saveCarePlanTemplateRevision.mock.calls[0][0].templateId;
    await d.controller.exportTemplate(importedId); expect(d.host.textContent).toContain('autor nie zezwala na dalsze przekazywanie');
    tick(d.host, 'Mam prawo udostępnić ten szablon na wskazanych zasadach'); tick(d.host, 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów');
    expect(findButton(d.host, 'Pobierz szablon').disabled).toBe(true); expect(d.win.URL.createObjectURL).not.toHaveBeenCalled();
    findButton(d.host, 'Anuluj').click(); await settle(); findButton(d.host, 'Podgląd').click(); await settle(); findButton(d.host, 'Edytuj').click();
    expect(d.host.textContent).toContain('nie zezwalają na jego modyfikowanie'); expect(d.controller.getContext().view).toBe('detail'); d.controller.destroy();
  });

  it('clears visible rights and privacy checks when export metadata changes', async () => {
    const model = prepareModel(), selected = record(model), d = fixture({ records: [selected] }); await settle(); await d.controller.exportTemplate(selected.templateId);
    tick(d.host, 'Mam prawo udostępnić ten szablon na wskazanych zasadach'); tick(d.host, 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów');
    change(input(d.host, 'Autor opracowania'), 'Fikcyjny inny autor');
    expect(checkBox(d.host, 'Mam prawo udostępnić ten szablon na wskazanych zasadach').checked).toBe(false);
    expect(checkBox(d.host, 'Sprawdziłem treść szablonu i nie zawiera ona danych pacjentów').checked).toBe(false);
    expect(findButton(d.host, 'Zapisz informacje o szablonie').disabled).toBe(true); d.controller.destroy();
  });

  it('does not import a file whose read finishes after the account was locked', async () => {
    let resolveText;
    const d = fixture(); await settle(); const file = { size: 42, text: () => new Promise(resolve => { resolveText = resolve; }) };
    const loading = d.controller.importTemplate(file); d.lock(); resolveText('FICTIONAL-LATE-FILE'); await loading;
    expect(d.vault.saveCarePlanTemplateRevision).not.toHaveBeenCalled(); expect(d.host.querySelector('.vct')).toBeNull();
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
    expect(d.requests.map(element => element.src || element.href)).toEqual(['vilda_care_template_model.js?v=3']);
    d.win.VildaCareTemplateModel = { CONTENT_VERSION: 2 }; d.requests[0].onload(); await settle();
    expect(d.requests[1].src).toBe('vilda_care_template_store.js?v=2'); d.win.VildaCareTemplateStore = {}; d.requests[1].onload(); await first;
    const ui = d.api.ensureTemplateLibrary(); await settle(); expect(d.requests).toHaveLength(3);
    expect(d.requests[2].src).toBe('vilda_care_template_transfer.js?v=1'); d.win.VildaCareTemplateTransfer = {}; d.requests[2].onload(); await settle();
    expect(d.requests).toHaveLength(5); d.requests[3].onload(); d.win.VildaCareTemplates = { open: vi.fn() }; d.requests[4].onload(); await ui;
    await d.api.ensureTemplateLibrary(); expect(d.requests).toHaveLength(5);
  });
  it('requires an update instead of mixing a new UI with an old live model', async () => {
    const d = loader(); d.win.VildaCareTemplateModel = { CONTENT_VERSION: 1 }; d.win.VildaCareTemplateStore = {};
    await expect(d.api.ensureTemplateLibrary()).rejects.toThrow('odśwież aplikację');
    expect(d.requests).toHaveLength(0);
  });
  it('allows a real retry after a failed asset without changing existing startup readiness', async () => {
    const d = loader(), failed = d.api.ensureTemplateLibrary({ ui: false }); d.requests[0].onerror(); await expect(failed).rejects.toThrow('Nie udało się wczytać');
    const retried = d.api.ensureTemplateLibrary({ ui: false }); expect(d.requests[1].src).toBe('vilda_care_template_model.js?v=3');
    d.win.VildaCareTemplateModel = { CONTENT_VERSION: 2 }; d.requests[1].onload(); await settle(); d.win.VildaCareTemplateStore = {}; d.requests[2].onload(); await retried;
  });
  it('does not open a late library dialog after a lock and unlock of the same account', async () => {
    const d = loader(); let locked; const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-same-account' }), onLock: fn => { locked = fn; } };
    const opened = d.api.openTemplates({ vault }); locked();
    d.win.VildaCareTemplateModel = { CONTENT_VERSION: 2 }; d.requests[0].onload(); await settle(); d.win.VildaCareTemplateStore = {}; d.requests[1].onload(); await settle();
    d.win.VildaCareTemplateTransfer = {}; d.requests[2].onload(); await settle();
    d.requests[3].onload(); d.win.VildaCareTemplates = { open: vi.fn() }; d.requests[4].onload();
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
    const entry = source.indexOf("getElementById('openCareTemplateLibraryBtn')");
    const start = source.lastIndexOf('\n(function (win) {', entry), end = source.indexOf('\n})(window);', entry);
    expect(start).toBeGreaterThan(0);
    expect(entry).toBeGreaterThan(start); expect(end).toBeGreaterThan(entry);
    new Function('window', source.slice(start, end + '\n})(window);'.length))(win);
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
