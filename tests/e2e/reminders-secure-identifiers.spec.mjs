import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);
const WORKSPACE = 'dialog.vb22-modal';
const OUTCOME = 'dialog.vb22-outcome';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

async function setup(page, id = 'fictional-imported-reminder-rng-2026') {
  const created = await createFictionalVault(page);
  const note = await page.evaluate(async ({ patientId, id }) => {
    const today = new Date();
    const dueDateISO = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const result = await window.VildaVault.savePatientNoteOnce({ id, patientId, title: 'Fikcyjne przypomnienie RNG',
      category: 'reminder-task', dueDateISO, body: 'Fikcyjna treść przed wykonaniem.' });
    if (!result.saved) throw Error('Fictional reminder setup failed');
    return window.VildaVault.getPatientNote(id);
  }, { patientId: created.ids.a, id });
  await expect(page.locator('#remindersInline .vb22-row:not(.vgs-row)')).toHaveCount(1);
  await page.locator('#vildaRemindersBtn').click();
  await expect(page.locator(WORKSPACE)).toBeVisible();
  await page.evaluate(() => {
    // Keep genuine browser WebCrypto; only exercise the supported UUID fallback.
    Object.defineProperty(window.crypto, 'randomUUID', { configurable: true, value: undefined });
  });
  return { ...created, note };
}

async function outcome(page) {
  await page.locator(`${WORKSPACE} .vb22-row`).filter({ hasText: 'Fikcyjne przypomnienie RNG' }).click();
  await page.locator(WORKSPACE).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(page.locator(OUTCOME)).toBeVisible();
}

async function add(page, patientId) {
  await page.locator(WORKSPACE).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  const form = page.locator(`${WORKSPACE} .vb22-reminder-form`);
  await form.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('Antoni');
  await form.locator(`[data-patient-id="${patientId}"]`).click();
  return form;
}

async function verifyAria(locator) {
  const broken = await locator.evaluate(root => [...root.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')]
    .flatMap(node => ['aria-labelledby', 'aria-describedby', 'aria-controls'].flatMap(name =>
      (node.getAttribute(name) || '').split(/\s+/).filter(Boolean).filter(id => !document.getElementById(id)))));
  expect(broken).toEqual([]);
}

test('secure fallback preserves outcome DOM/ARIA and native request retry identity', async ({ page }) => {
  const { note } = await setup(page, 'fictional imported reminder / żółć 2026'); await outcome(page);
  const dialog = page.locator(OUTCOME);
  await expect(dialog.locator('h2')).toHaveAttribute('id', new RegExp('^rem-outcome-' + UUID + '-title$'));
  await verifyAria(dialog);
  await dialog.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjna pierwsza treść.');
  await page.evaluate(() => {
    const native = window.VildaVault.saveReminderOutcome;
    window.__secureReminderRequests = [];
    window.VildaVault.saveReminderOutcome = function (request) {
      window.__secureReminderRequests.push(structuredClone(request));
      if (window.__secureReminderRequests.length < 4) return Promise.reject(Error('Fikcyjna próba bez zapisu'));
      return native.call(this, request);
    };
  });
  const save = dialog.getByRole('button', { name: 'Zapisz wykonanie', exact: true });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await save.click(); await expect(dialog.getByRole('alert')).toHaveCount(attempt);
  }
  await dialog.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjna zmieniona treść.');
  await save.click(); await expect(dialog.getByRole('alert')).toHaveCount(3);
  await save.click(); await expect(page.locator(`${WORKSPACE} .vb22-notice`)).toContainText('Zapisano w Karcie pacjenta');
  const data = await page.evaluate(async id => ({ requests: window.__secureReminderRequests,
    stored: await window.VildaVault.getPatientNote(id) }), note.id);
  const ids = data.requests.map(request => request.operationId);
  ids.forEach(id => expect(id).toMatch(new RegExp('^' + UUID + '$')));
  expect(ids[1]).toBe(ids[0]); expect(ids[2]).not.toBe(ids[0]); expect(ids[3]).toBe(ids[2]);
  expect(data.requests.map(request => request.id)).toEqual(Array(4).fill(note.id));
  expect(data.stored.id).toBe(note.id); expect(data.stored.body).toContain('Fikcyjna zmieniona treść.');
});

test('secure outcome retry after a real committed save reuses the operation and creates one child', async ({ page }) => {
  const { note, ids } = await setup(page); await outcome(page);
  const dialog = page.locator(OUTCOME);
  await dialog.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny zapis z utraconą odpowiedzią.');
  await dialog.locator('.vb22-next-step summary').click();
  await dialog.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjny jedyny kolejny krok RNG');
  await dialog.getByLabel('Termin kolejnego kroku', { exact: true }).fill('2027-02-02');
  await page.evaluate(() => {
    const native = window.VildaVault.saveReminderOutcome;
    window.__secureReminderRequests = []; window.__secureReminderResults = [];
    window.VildaVault.saveReminderOutcome = async function (request) {
      window.__secureReminderRequests.push(structuredClone(request));
      const result = await native.call(this, request); window.__secureReminderResults.push(structuredClone(result));
      if (window.__secureReminderRequests.length === 1) throw Error('Fikcyjna utrata odpowiedzi po zapisie');
      return result;
    };
  });
  const save = dialog.getByRole('button', { name: 'Zapisz wykonanie', exact: true });
  await save.click(); await expect(dialog.getByRole('alert')).toContainText('Fikcyjna utrata odpowiedzi po zapisie');
  const committed = await page.evaluate(async id => window.VildaVault.getPatientNote(id), note.id);
  expect(committed.completedAtISO).toBeTruthy();
  await save.click(); await expect(page.locator(`${WORKSPACE} .vb22-notice`)).toContainText('Zapisano w Karcie pacjenta');
  const data = await page.evaluate(async ({ parentId, patientId }) => ({ requests: window.__secureReminderRequests,
    results: window.__secureReminderResults, parent: await window.VildaVault.getPatientNote(parentId),
    notes: await window.VildaVault.listPatientNotesForPatient(patientId) }), { parentId: note.id, patientId: ids.a });
  expect(data.requests[1]).toEqual(data.requests[0]);
  expect(data.results[1]).toMatchObject({ saved: true, reused: true, nextId: data.results[0].nextId });
  expect(data.parent).toEqual(committed);
  const children = data.notes.filter(item => item.reminderContext?.parentId === note.id);
  expect(children).toHaveLength(1); expect(children[0].id).toBe(data.parent.reminderContext.nextId);
});

test('secure generic add keeps one reminder ID per form while fields change before retry', async ({ page }) => {
  const { ids } = await setup(page); const form = await add(page, ids.a);
  await expect(form.locator('h3')).toHaveAttribute('id', new RegExp('^rem-add-title-' + UUID + '$'));
  await expect(form.locator('.vb22-patient-status')).toHaveAttribute('id', new RegExp('^rem-patient-' + UUID + '-status$'));
  await verifyAria(form);
  await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny pierwszy tytuł RNG');
  await page.evaluate(() => {
    const native = window.VildaVault.savePatientNoteOnce;
    window.__secureReminderAdds = [];
    window.VildaVault.savePatientNoteOnce = function (request) {
      window.__secureReminderAdds.push(structuredClone(request));
      if (window.__secureReminderAdds.length < 3) return Promise.reject(Error('Fikcyjna próba dodania bez zapisu'));
      return native.call(this, request);
    };
  });
  const save = form.getByRole('button', { name: 'Zapisz przypomnienie', exact: true });
  await save.click(); await expect(form.getByRole('alert')).toHaveCount(1);
  await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny zmieniony tytuł RNG');
  await save.click(); await expect(form.getByRole('alert')).toHaveCount(2);
  await save.click(); await expect(page.locator(`${WORKSPACE} .vb22-detail-title`)).toHaveText('Fikcyjny zmieniony tytuł RNG');
  const data = await page.evaluate(async patientId => ({ requests: window.__secureReminderAdds,
    notes: await window.VildaVault.listPatientNotesForPatient(patientId) }), ids.a);
  const [first, second, third] = data.requests;
  expect(first.id).toMatch(new RegExp('^reminder-' + UUID + '$'));
  expect(second.id).toBe(first.id); expect(third.id).toBe(first.id);
  expect(second.title).not.toBe(first.title); expect(third.title).toBe(second.title);
  expect(data.notes.filter(note => note.id === first.id)).toHaveLength(1);
});

test('secure generic form reuses its fallback UUID as the native care-step operation ID', async ({ page }) => {
  const { ids } = await setup(page);
  const plan = await page.evaluate(async patientId => window.VildaVault.mutateCarePlan({ patientId, action: 'create',
    operationId: 'fictional-rng-plan-setup', title: 'Fikcyjny plan RNG', goal: 'Fikcyjny test identyfikatora kroku.' }), ids.a);
  expect(plan.saved).toBe(true);
  const form = await add(page, ids.a);
  await form.getByLabel('Plan opieki (opcjonalnie)', { exact: true }).selectOption(plan.planId);
  await form.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny krok RNG');
  await page.evaluate(() => {
    const native = window.VildaVault.mutateCarePlan;
    window.__secureCareRequests = [];
    window.VildaVault.mutateCarePlan = function (request) {
      window.__secureCareRequests.push(structuredClone(request));
      if (window.__secureCareRequests.length === 1) return Promise.reject(Error('Fikcyjny krok bez zapisu'));
      return native.call(this, request);
    };
  });
  const save = form.getByRole('button', { name: 'Zapisz przypomnienie', exact: true });
  await save.click(); await expect(form.getByRole('alert')).toContainText('Fikcyjny krok bez zapisu');
  await save.click();
  await expect(page.locator(`${WORKSPACE} [data-tab=plans]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(form).not.toBeVisible();
  const data = await page.evaluate(async planId => ({ requests: window.__secureCareRequests,
    plan: await window.VildaVault.getCarePlan(planId) }), plan.planId);
  expect(data.requests[0].operationId).toMatch(new RegExp('^' + UUID + '$'));
  expect(data.requests[1].operationId).toBe(data.requests[0].operationId);
  expect(data.plan.steps.filter(step => step.title === 'Fikcyjny krok RNG')).toHaveLength(1);
});

test('missing secure randomness reports the existing error and permits neither a partial editor nor writes', async ({ page }) => {
  await setup(page);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    Object.defineProperty(window.crypto, 'getRandomValues', { configurable: true, value: undefined });
    window.__secureMissingWrites = [];
    for (const name of ['saveReminderOutcome', 'savePatientNoteOnce', 'mutateCarePlan']) {
      const native = window.VildaVault[name];
      window.VildaVault[name] = function (...args) { window.__secureMissingWrites.push(name); return native.apply(this, args); };
    }
  });
  await page.locator(`${WORKSPACE} .vb22-row`).filter({ hasText: 'Fikcyjne przypomnienie RNG' }).click();
  await page.locator(WORKSPACE).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(page.locator(WORKSPACE).getByRole('alert')).toBeVisible();
  await expect(page.locator(OUTCOME)).toHaveCount(0);
  await page.locator(WORKSPACE).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await expect(page.locator(`${WORKSPACE} .vb22-reminder-form`)).toHaveCount(0);
  await expect(page.locator(WORKSPACE)).not.toHaveClass(/vb22-form-editing/);
  expect(await page.evaluate(() => window.__secureMissingWrites)).toEqual([]);
  expect(errors).toEqual([]);
});
