import { expect, test } from '@playwright/test';

const PAGE = '/__fictional-native-template-vault.html';
const PASSWORD = 'Fikcyjny#NativeTemplates2026!';

async function nativeTemplateVault(page, { seedTemplate = true } = {}) {
  await page.route(`**${PAGE}`, route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><meta charset="utf-8"><title>Fikcyjny sejf szablonów</title>'
      + '<script>localStorage.setItem("vildaRetention", "0")</script>'
      + '<script src="/vilda_crypto.js"></script><script src="/vilda_retention.js"></script>'
      + '<script src="/vilda_care_plan_model.js"></script>'
      + '<script src="/vilda_care_template_model.js"></script>'
      + '<script src="/vilda_care_template_store.js"></script><script src="/vilda_vault.js"></script>',
  }));
  await page.goto(PAGE);
  await page.waitForFunction(() => Boolean(window.VildaVault?.exportCarePlanTemplateLibrary));
  await page.evaluate(async ({ password, seedTemplate }) => {
    const vault = window.VildaVault, model = window.VildaCareTemplateModel;
    await vault.createUser(password, { iterations: 10000, label: 'Fikcyjna biblioteka natywna' });
    const userId = vault.getCurrentUser().userId;
    const patientId = (await vault.savePatient({ name: 'Fikcyjna Alicja Natywny Test',
      user: { sex: 'F', age: 12, weight: 40, height: 150 } })).patientId;
    await vault.savePatientNote({ patientId, title: 'Fikcyjna niezależna dokumentacja',
      body: 'Fikcyjny oryginał pozostaje niezmieniony.', category: 'wlasne' });
    await vault.saveNote({ title: 'Fikcyjna zwykła Notatka', body: 'Fikcyjny niezależny tekst.', category: 'wlasne' });
    const token = await vault.captureCareTemplateSession();
    const snapshot = async (databaseName, wantedStores = null) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => { request.transaction.abort(); reject(Error('Missing fictional database')); };
      });
      try {
        const names = [...db.objectStoreNames].filter(name => !wantedStores || wantedStores.includes(name));
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(names, 'readonly'), requests = names.map(name => tx.objectStore(name).getAll());
          tx.oncomplete = () => resolve(Object.fromEntries(names.map((name, index) => [name, requests[index].result])));
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    };
    const clinical = () => snapshot(vault.USER_DB_PREFIX + userId,
      ['patients', 'patientNotes', 'notes', 'tombstones', 'patientNoteTombstones', 'noteTombstones']);
    const originalClinical = await clinical(), changes = [];
    for (const hook of ['onPatientSaved', 'onPatientDeleted', 'onPatientNoteChanged', 'onNoteChanged']) {
      if (typeof vault[hook] === 'function') vault[hook](detail => changes.push({ hook, detail }));
    }
    const draft = model.createDefinitionDraft({ stageId: 'fictional-native-stage', stepId: 'fictional-native-step' });
    if (!draft.ok) throw Error('Fictional definition draft unavailable');
    const definition = draft.definition;
    definition.name = 'Fikcyjny prywatny schemat'; definition.stages[0].title = 'Fikcyjny etap';
    definition.steps[0].title = 'Fikcyjna decyzja'; definition.steps[0].requiredOutcome = 'decision';
    const templateId = 'fictional-native-template';
    if (seedTemplate) {
      const saved = await vault.saveCarePlanTemplateRevision({ templateId, operationId: 'fictional-native-create',
        baseToken: null, definition });
      if (!saved.saved) throw Error('Fictional native template was not saved: ' + JSON.stringify(saved));
    }
    window.__fictionalNativeTemplateVault = { vault, model, userId, patientId, definition, templateId,
      keyBinding: token.keyBinding, snapshot, clinical, originalClinical, changes,
      library: () => snapshot('vilda_template_library_v1_' + token.keyBinding) };
  }, { password: PASSWORD, seedTemplate });
}

test('real encrypted template backup restores exact history and refuses a tampered file before any write', async ({ page }) => {
  await nativeTemplateVault(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalNativeTemplateVault;
    const beforeView = await f.vault.getCarePlanTemplate(f.templateId);
    const text = await f.vault.exportCarePlanTemplateLibrary(), envelope = JSON.parse(text);
    const before = await f.library(), tampered = structuredClone(envelope);
    tampered.cipher.data = (tampered.cipher.data[0] === 'A' ? 'B' : 'A') + tampered.cipher.data.slice(1);
    let refused = false;
    try { await f.vault.importCarePlanTemplateLibrary(JSON.stringify(tampered)); } catch { refused = true; }
    const afterRefusal = await f.library();
    const restored = await f.vault.importCarePlanTemplateLibrary(text);
    const afterView = await f.vault.getCarePlanTemplate(f.templateId);
    return { format: envelope.format, plaintextLeaked: text.includes(f.definition.name), refused,
      before, afterRefusal, restored, beforeView, afterView,
      originalClinical: f.originalClinical, clinical: await f.clinical(), changes: f.changes };
  });
  expect(result.format).toBe('vilda-care-template-library/v1');
  expect(result.plaintextLeaked).toBe(false);
  expect(result.refused).toBe(true);
  expect(result.afterRefusal).toEqual(result.before);
  expect(result.restored.saved).toBe(true);
  expect(result.afterView.definition).toEqual(result.beforeView.definition);
  expect(result.afterView.baseToken).toBe(result.beforeView.baseToken);
  expect(result.afterView.revisions).toEqual(result.beforeView.revisions);
  expect(result.clinical).toEqual(result.originalClinical);
  expect(result.changes).toEqual([]);
});

test('another real account cannot import the first account library or expose its local records', async ({ page }) => {
  await nativeTemplateVault(page);
  const result = await page.evaluate(async password => {
    const f = window.__fictionalNativeTemplateVault, text = await f.vault.exportCarePlanTemplateLibrary();
    const originalLibrary = await f.library();
    await f.vault.createUser(password, { iterations: 10000, label: 'Fikcyjne drugie konto biblioteki' });
    const nextUserId = f.vault.getCurrentUser().userId, token = await f.vault.captureCareTemplateSession();
    const before = await f.vault.listCarePlanTemplates({ archived: 'all' });
    let errorCode = null;
    try { await f.vault.importCarePlanTemplateLibrary(text); } catch (error) { errorCode = error.code; }
    return { changedUser: nextUserId !== f.userId, distinctKeyBinding: token.keyBinding !== f.keyBinding,
      before, after: await f.vault.listCarePlanTemplates({ archived: 'all' }), errorCode,
      unavailableSource: await f.vault.getCarePlanTemplate(f.templateId), originalLibrary,
      sourceLibrary: await f.library(), originalClinical: f.originalClinical, sourceClinical: await f.clinical() };
  }, PASSWORD);
  expect(result.changedUser).toBe(true);
  expect(result.distinctKeyBinding).toBe(true);
  expect(result.errorCode).toBe('CARE_TEMPLATE_KEY_MISMATCH');
  expect(result.before).toEqual([]);
  expect(result.after).toEqual([]);
  expect(result.unavailableSource).toBeNull();
  expect(result.sourceLibrary).toEqual(result.originalLibrary);
  expect(result.sourceClinical).toEqual(result.originalClinical);
});

test('real local commit rejects untransportable operation IDs and accepts the exact 128-character wire grammar', async ({ page }) => {
  await nativeTemplateVault(page);
  const result = await page.evaluate(async () => {
    const f = window.__fictionalNativeTemplateVault, initial = await f.vault.getCarePlanTemplate(f.templateId);
    const definition = structuredClone(initial.definition); definition.name = 'Fikcyjna nowa wersja';
    const before = await f.library(), failures = [];
    for (const operationId of ['_fictional-bad', 'x'.repeat(129)]) {
      try {
        const response = await f.vault.saveCarePlanTemplateRevision({ templateId: f.templateId,
          operationId, baseToken: initial.baseToken, definition });
        failures.push({ saved: response.saved === true, code: response.code || response.reason });
      } catch (error) { failures.push({ saved: false, code: error.code }); }
    }
    const afterRefusal = await f.library(), operationId = 'x' + ':'.repeat(127);
    const saved = await f.vault.saveCarePlanTemplateRevision({ templateId: f.templateId,
      operationId, baseToken: initial.baseToken, definition });
    return { before, afterRefusal, failures, saved, view: await f.vault.getCarePlanTemplate(f.templateId),
      originalClinical: f.originalClinical, clinical: await f.clinical(), changes: f.changes };
  });
  expect(result.failures).toHaveLength(2);
  expect(result.failures.every(value => value.saved === false && /^CARE_TEMPLATE_/.test(value.code))).toBe(true);
  expect(result.afterRefusal).toEqual(result.before);
  expect(result.saved.saved).toBe(true);
  expect(result.view.definition.name).toBe('Fikcyjna nowa wersja');
  expect(result.view.revisions).toHaveLength(2);
  expect(result.clinical).toEqual(result.originalClinical);
  expect(result.changes).toEqual([]);
});

test('real local account deletion finds the encrypted library even after its discovery flag and live context disappear', async ({ page }) => {
  await nativeTemplateVault(page);
  const result = await page.evaluate(async password => {
    const f = window.__fictionalNativeTemplateVault, before = await f.library();
    localStorage.removeItem('vilda-care-template-library-present-v1:' + f.userId);
    f.vault.lock();
    await f.vault.unlockUser(f.userId, password);
    let errorCode = null;
    try { await f.vault.removeUser(f.userId); } catch (error) { errorCode = error.code; }
    const patient = await f.vault.getPatient(f.patientId);
    return { errorCode, currentUser: f.vault.getCurrentUser()?.userId,
      sourceUser: f.userId, patientAvailable: Boolean(patient), before, after: await f.library(),
      originalClinical: f.originalClinical, clinical: await f.clinical() };
  }, PASSWORD);
  expect(result.errorCode).toBe('CARE_TEMPLATE_LIBRARY_RETAINED');
  expect(result.currentUser).toBe(result.sourceUser);
  expect(result.patientAvailable).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.clinical).toEqual(result.originalClinical);
});

test('real empty-account deletion fences a first template save paused in encryption before its native commit', async ({ page }) => {
  await nativeTemplateVault(page, { seedTemplate: false });
  const result = await page.evaluate(async () => {
    const f = window.__fictionalNativeTemplateVault, subtle = crypto.subtle, originalEncrypt = subtle.encrypt;
    let enter, release, paused = false;
    const entered = new Promise(resolve => { enter = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    subtle.encrypt = async function (algorithm, key, data) {
      if (!paused && algorithm.additionalData
          && new TextDecoder().decode(algorithm.additionalData).includes('care-template-library')) {
        paused = true; enter(); await gate;
      }
      return originalEncrypt.call(subtle, algorithm, key, data);
    };
    const saving = f.vault.saveCarePlanTemplateRevision({ templateId: f.templateId,
      operationId: 'fictional-first-save-race', baseToken: null, definition: f.definition })
      .then(value => ({ saved: value.saved === true }), error => ({ saved: false, code: error.code }));
    await entered;
    let removed = false, removeError = null;
    try { removed = await f.vault.removeUser(f.userId); }
    catch (error) { removeError = error.code || error.name; }
    finally { release(); }
    const save = await saving; subtle.encrypt = originalEncrypt;
    const names = await indexedDB.databases();
    const libraryExists = names.some(item => item.name === 'vilda_template_library_v1_' + f.keyBinding);
    const stored = libraryExists ? await f.library() : { templates: [], events: [], meta: [] };
    return { paused, removed, removeError, save, stored, currentUser: f.vault.getCurrentUser()?.userId ?? null };
  });
  expect(result.paused).toBe(true);
  expect(result.removeError).toBeNull();
  expect(result.removed).toBe(true);
  expect(result.save.saved).toBe(false);
  expect(/^(SESSION_CHANGED|CARE_TEMPLATE_)/.test(result.save.code)).toBe(true);
  expect(result.stored.templates).toEqual([]);
  expect(result.stored.events).toEqual([]);
  expect(result.stored.meta.every(row => (row.count || 0) === 0)).toBe(true);
  expect(result.currentUser).toBeNull();
});

test('real local deletion preserves an unknown newer library database even when current-format stores are empty', async ({ page }) => {
  await nativeTemplateVault(page, { seedTemplate: false });
  const result = await page.evaluate(async password => {
    const f = window.__fictionalNativeTemplateVault;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('vilda_template_library_v1_' + f.keyBinding, 2);
      request.onupgradeneeded = () => {
        const value = request.result;
        for (const [name, keyPath] of [['meta', 'id'], ['templates', 'templateId'], ['events', 'eid']]) {
          if (!value.objectStoreNames.contains(name)) value.createObjectStore(name, { keyPath });
        }
        value.createObjectStore('fictionalFutureProtectedData', { keyPath: 'id' })
          .put({ id: 'fictional-future-original', cipher: 'fictional-unknown-format-ciphertext' });
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close();
    const before = await f.library();
    localStorage.removeItem('vilda-care-template-library-present-v1:' + f.userId);
    f.vault.lock(); await f.vault.unlockUser(f.userId, password);
    let errorCode = null;
    try { await f.vault.removeUser(f.userId); } catch (error) { errorCode = error.code; }
    return { errorCode, before, after: await f.library(), sourceUser: f.userId,
      currentUser: f.vault.getCurrentUser()?.userId,
      originalClinical: f.originalClinical, clinical: await f.clinical() };
  }, PASSWORD);
  expect(result.errorCode).toBe('CARE_TEMPLATE_LIBRARY_RETAINED');
  expect(result.currentUser).toBe(result.sourceUser);
  expect(result.after).toEqual(result.before);
  expect(result.after.fictionalFutureProtectedData).toEqual([
    { id: 'fictional-future-original', cipher: 'fictional-unknown-format-ciphertext' },
  ]);
  expect(result.clinical).toEqual(result.originalClinical);
});
