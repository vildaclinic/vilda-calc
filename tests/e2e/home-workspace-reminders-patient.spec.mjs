// Selected-patient reminders use the real home runtime and encrypted, entirely
// fictional Vault. No fixture moves, marks or manually mounts the home card.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { mutatePlan } from '../support/care-plans-fixture.mjs';

const CARD = '#vhomeMainCards #remindersInline .vhome-reminders-card';
const DIALOG = 'dialog.vb22-modal.vhome-reminders-dialog';
const OUTCOME = 'dialog.vb22-outcome.vhome-reminders-child-dialog';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

async function settled(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport.isMainSessionRestorePending() && !window.VildaDobAge.restorePending());
}
async function setup(page, { plans = false } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  const seeded = await fixture.frame.evaluate(async ids => {
    const vault = window.VildaVault, today = new Date();
    const day = offset => {
      const date = new Date(today); date.setDate(date.getDate() + offset);
      return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    };
    const specs = {
      aPast: { patientId: ids.a, title: 'Fikcyjna A zaległa kontrola', offset: -2 },
      aToday: { patientId: ids.a, title: 'Fikcyjna A rozmowa dzisiaj', offset: 0 },
      aFuture: { patientId: ids.a, title: 'Fikcyjna A przyszła kontrola', offset: 7 },
      bPast: { patientId: ids.b, title: 'Fikcyjna B zaległa kontrola', offset: -1 },
      aDone: { patientId: ids.a, title: 'Fikcyjna A wykonana sprawa', offset: -3, completedAtISO: new Date().toISOString() },
      bDone: { patientId: ids.b, title: 'Fikcyjna B wykonana sprawa', offset: -3, completedAtISO: new Date().toISOString() },
      activity: { patientId: vault.ACTIVITY_PATIENT_ID, title: 'Fikcyjne zebranie bez pacjenta', category: 'activity-other', offset: 9 },
    };
    const notes = {};
    for (const [key, { offset, ...spec }] of Object.entries(specs)) notes[key] = (await vault.savePatientNote({
      category: 'reminder-contact', body: 'Fikcyjne ustalenia przypomnienia.', dueDateISO: day(offset), ...spec,
    })).id;
    return { notes, futureDate: day(14) };
  }, fixture.ids);
  let planIds, planReminders;
  if (plans) planIds = {
    a: (await mutatePlan(fixture.frame, fixture.ids.a, null, 'create', { title: 'Fikcyjny plan A', goal: 'Fikcyjne ustalenia A.' })).planId,
    b: (await mutatePlan(fixture.frame, fixture.ids.b, null, 'create', { title: 'Fikcyjny plan B', goal: 'Fikcyjne ustalenia B.' })).planId,
  };
  if (plans) {
    // The native plan actor creates a decision reminder for a new empty plan.
    // Verify those actual records rather than mistaking them for a scope leak
    // or hiding them to obtain the old three-reminder fixture count.
    planReminders = await fixture.frame.evaluate(async planIds => {
      const groups = await window.VildaVault.listPatientNotesDueByDate();
      const notes = groups.flatMap(group => group.notes || []);
      return Object.fromEntries(Object.entries(planIds).map(([key, planId]) => [key,
        notes.find(note => note.careContext?.planId === planId && note.careContext?.role === 'decision')]));
    }, planIds);
    expect(planReminders.a).toMatchObject({ patientId: fixture.ids.a, careContext: { planId: planIds.a, role: 'decision' } });
    expect(planReminders.b).toMatchObject({ patientId: fixture.ids.b, careContext: { planId: planIds.b, role: 'decision' } });
  }
  await loadPatient(fixture.frame, fixture.ids.a, 'restore'); await settled(fixture.frame);
  const card = fixture.frame.locator(CARD);
  await expect(card).toBeVisible(); await expect(card).toHaveAttribute('data-home-reminders-phase', 'ready');
  await expect(card.locator('.vhome-reminders-count')).toHaveText(plans ? '4' : '3');
  return { ...fixture, ...seeded, planIds, planReminders, card };
}
async function open(page, card) {
  await card.getByRole('button', { name: 'Powiększ Przypomnienia', exact: true }).click();
  const dialog = page.locator(DIALOG); await expect(dialog).toBeVisible(); return dialog;
}
async function close(dialog) {
  await dialog.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
const row = (dialog, id) => dialog.locator('.vhome-reminders-full-entry').filter({ has: dialog.page().locator(`[data-note-id="${id}"]`) });
const stored = (frame, id) => frame.evaluate(id => window.VildaVault.getPatientNote(id), id);
async function failNextTopScopedRead(page) {
  await page.evaluate(() => {
    const native = window.VildaVault.listPatientNotesDueByDate; let fail = true;
    window.VildaVault.listPatientNotesDueByDate = function (...args) {
      if (fail && String(args[0] || '').startsWith('9999-12-31')) {
        fail = false; return Promise.reject(Error('Fikcyjny błąd otwarcia przypomnień pacjenta.'));
      }
      return native.apply(this, args);
    };
  });
}
async function boundedGeometry(page, selector) {
  const measure = () => page.locator(selector).evaluate(node => {
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
  await expect.poll(async () => {
    const box = await measure(), mobile = box.viewportWidth <= 600;
    const width = Math.min(1000, box.viewportWidth - (mobile ? 20 : 32));
    const height = Math.min(mobile ? Infinity : 820, box.viewportHeight - (mobile ? 24 : 32));
    return [box.width - width, box.height - height, box.x - (box.viewportWidth - width) / 2,
      box.y - (box.viewportHeight - height) / 2].map(value => Math.round(value) || 0);
  }).toEqual([0, 0, 0, 0]);
  const box = await measure(); expect(box.scrollWidth - box.clientWidth).toBeLessThanOrEqual(1); return box;
}
async function browserBackInApp(page) {
  // An iframe-owned joint-history entry need not commit a main-frame load.
  // Bound that API wait, then prove the actual modal and unchanged APP route.
  try { await page.goBack({ waitUntil: 'commit', timeout: 2500 }); }
  catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    await expect(page).toHaveURL(/\/app\.html#\/start$/);
  }
}

test('selected patient: future matters, history, plans and new reminders stay scoped while the bell stays global', async ({ page }) => {
  const { frame, ids, notes, planIds, planReminders, futureDate, card } = await setup(page, { plans: true });
  await expect(frame.locator('#remindersInline')).toHaveCount(1);
  await expect(frame.locator('#vhomeMainCards #remindersInline')).toHaveAttribute('data-home-reminders-presentation', 'true');
  await expect(card.locator('.vhome-reminders-entry')).toHaveCount(2);
  await expect(card).not.toContainText('Fikcyjna B');
  const slots = frame.locator('#vhomeMainCards > *');
  await expect(slots).toHaveCount(4);
  expect(await slots.evaluateAll(nodes => nodes.map(node => node.id))).toEqual(['vhomeGrowthCard', 'vhomePatientCard', 'vhomeDietCard', 'remindersInline']);
  for (const box of await slots.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))) expect(box).toBeCloseTo(352, 0);
  await card.screenshot({ path: test.info().outputPath('home-reminders-patient-desktop-card.png') });

  await failNextTopScopedRead(page);
  const dialog = await open(page, card);
  await expect(dialog).toHaveAttribute('data-home-reminders-phase', 'error');
  await expect(dialog.getByRole('alert')).toContainText('Nie udało się wczytać przypomnień');
  await dialog.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(dialog).toHaveAttribute('data-home-reminders-phase', 'ready');
  await boundedGeometry(page, DIALOG);
  await expect(frame.locator(DIALOG)).toHaveCount(0);
  await expect(dialog.getByRole('tab')).toHaveText(['Do wykonania', 'Historia', 'Plany']);
  await expect(dialog.locator('[data-home-reminders-context]')).toBeVisible();
  await expect(dialog.locator('[data-home-reminders-context]')).toContainText('Antoni');
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(4);
  await expect(dialog.locator('.vhome-reminders-full-entry > .vb22-detail-patient:visible')).toHaveCount(0);
  await expect(row(dialog, notes.aFuture)).toContainText('Zaplanowane');
  await expect(row(dialog, planReminders.a.id)).toContainText('Fikcyjny plan A');
  await expect(dialog.locator(`[data-note-id="${planReminders.b.id}"]`)).toHaveCount(0);
  await expect(dialog.locator(`[data-note-id="${notes.bPast}"]`)).toHaveCount(0);
  await expect(dialog.locator(`[data-note-id="${notes.activity}"]`)).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Historia', exact: true }).click();
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(1);
  await expect(dialog.locator(`[data-note-id="${notes.aDone}"]`)).toBeVisible();
  await expect(dialog.locator(`[data-note-id="${notes.bDone}"]`)).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Plany', exact: true }).click();
  await expect(dialog.locator(`.vcp [data-plan-id="${planIds.a}"]`)).toBeVisible();
  await expect(dialog.locator(`.vcp [data-plan-id="${planIds.b}"]`)).toHaveCount(0);
  await dialog.getByRole('tab', { name: 'Do wykonania', exact: true }).click();
  const localQuery = dialog.getByRole('searchbox', { name: 'Szukaj przypomnienia', exact: true });
  await localQuery.fill('Fikcyjna A zaległa kontrola');
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(1);
  const beforeEdit = await stored(frame, notes.aPast);
  await row(dialog, notes.aPast).getByRole('button', { name: 'Edytuj treść przypomnienia', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const editor = frame.locator('#vhomePatientNoteDialog'); await expect(editor).toBeVisible();
  await expect(editor.locator('.vilda-patient-note-editor-overlay')).toBeVisible();
  expect(await editor.locator('input').evaluateAll(nodes => nodes.map(node => node.value))).toContain('Fikcyjna A zaległa kontrola');
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeHidden(); await expect(dialog).toBeVisible();
  await expect(localQuery).toHaveValue('Fikcyjna A zaległa kontrola');
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(1);
  await expect(dialog.locator(`[data-note-id="${notes.bPast}"]`)).toHaveCount(0);
  expect(await stored(frame, notes.aPast)).toEqual(beforeEdit);
  await localQuery.fill(''); await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await expect(dialog.locator('.vb22-patient-selected')).toContainText('Fikcyjny Antoni');
  await expect(dialog.locator(`.vb22-patient-option[data-patient-id="${ids.b}"]`)).toHaveCount(0);
  await dialog.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjna nowa sprawa tylko A');
  await dialog.getByLabel('Przypomnij w dniu', { exact: true }).fill(futureDate);
  await dialog.getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect.poll(() => frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId))
    .filter(note => note.title === 'Fikcyjna nowa sprawa tylko A').map(note => note.patientId), ids.a)).toEqual([ids.a]);
  expect(await frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId))
    .some(note => note.title === 'Fikcyjna nowa sprawa tylko A'), ids.b)).toBe(false);
  await close(dialog); await expect(card.locator('.vhome-reminders-count')).toHaveText('5');

  await page.locator('#vildaRemindersBtn').click();
  const legacy = page.locator('dialog.vb22-modal'); await expect(legacy).toBeVisible();
  await expect(legacy).not.toHaveClass(/vhome-reminders-dialog/);
  await expect(legacy.locator('[data-filter="all"] .vb22-count')).toHaveText('5');
  await expect(legacy.locator('.vb22-row:not(.vgs-row)')).toHaveCount(5);
  await expect(legacy.locator(`[data-note-id="${notes.bPast}"]`)).toBeVisible();
  await expect(legacy.locator(`[data-note-id="${planReminders.a.id}"]`)).toBeVisible();
  await expect(legacy.locator(`[data-note-id="${planReminders.b.id}"]`)).toBeVisible();
  await expect(legacy.locator(`[data-note-id="${notes.aFuture}"]`)).toHaveCount(0);
  await legacy.getByRole('button', { name: 'Szukaj', exact: true }).click();
  await legacy.getByRole('searchbox', { name: 'Szukaj we wszystkich pacjentach i sprawach', exact: true }).fill('Fikcyjne zebranie bez pacjenta');
  await expect(legacy.locator(`[data-search-id="note:${notes.activity}"]`)).toBeVisible();
  await legacy.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();

  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await expect(card.locator('.vhome-reminders-count')).toHaveText('2');
  await expect(card).toContainText('Fikcyjna B zaległa kontrola'); await expect(card).not.toContainText('Fikcyjna A');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect((await card.boundingBox()).height).toBeLessThan(352);
  await card.screenshot({ path: test.info().outputPath('home-reminders-patient-mobile-card.png') });
  await open(page, card); const mobile = await boundedGeometry(page, DIALOG);
  await row(dialog, notes.bPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator(OUTCOME); await expect(outcome).toBeVisible();
  const child = await boundedGeometry(page, OUTCOME);
  for (const key of ['x', 'y', 'width', 'height']) expect(child[key]).toBeCloseTo(mobile[key], 0);
  const evidence = test.info().outputPath('home-reminders-patient-mobile-geometry.json');
  writeFileSync(evidence, JSON.stringify({ main: mobile, outcome: child }, null, 2));
  await page.screenshot({ path: test.info().outputPath('home-reminders-patient-mobile-dialog.png') });
  await browserBackInApp(page);
  await expect(outcome).toHaveCount(0); await expect(dialog).toBeVisible();
  await expect(row(dialog, notes.bPast)).toBeVisible(); await expect(page).toHaveURL(/\/app\.html#\/start$/);
  await browserBackInApp(page);
  await expect(dialog).toHaveCount(0); await expect(card).toBeVisible();
  await expect(page).toHaveURL(/\/app\.html#\/start$/);
});

test('selected patient: stale actions cannot start a write and an already submitted result stays with its original patient', async ({ page }) => {
  const { frame, ids, notes, card } = await setup(page);
  const beforeA = await stored(frame, notes.aPast), beforeB = await stored(frame, notes.bPast);
  let dialog = await open(page, card);
  await row(dialog, notes.aPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator(OUTCOME); await expect(outcome).toBeVisible();
  await outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny odrzucony stary formularz.');
  // Change just the ownership pointer and invoke the retained real submit in
  // the same turn, before a poll/event could tear down the old UI. This is a
  // deliberate synchronous boundary probe, not a substitute patient loader.
  await page.evaluate(next => {
    const home = document.querySelector('iframe.app-pane[title="Start"]').contentWindow;
    window.__homeRemindersWrites = [];
    const native = window.VildaVault.saveReminderOutcome;
    window.VildaVault.saveReminderOutcome = function (request) { window.__homeRemindersWrites.push(structuredClone(request)); return native.apply(this, arguments); };
    home.sessionStorage.setItem('vildaCurrentPatientId', next);
    document.querySelector('dialog.vb22-outcome button[type="submit"]').click();
  }, ids.b);
  await expect(outcome).toHaveCount(0); await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__homeRemindersWrites)).toEqual([]);
  expect(await stored(frame, notes.aPast)).toEqual(beforeA); expect(await stored(frame, notes.bPast)).toEqual(beforeB);
  // Restore only the ID-only probe, then let the actual runtime rebuild A.
  await frame.evaluate(original => { sessionStorage.setItem('vildaCurrentPatientId', original); window.VildaHomeRemindersRuntime.refresh(); }, ids.a);
  await expect(card).toBeVisible(); await expect(card.locator('.vhome-reminders-count')).toHaveText('3');
  dialog = await open(page, card);
  await row(dialog, notes.aPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(outcome).toBeVisible();
  await outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny przyjęty zapis wyłącznie dla A.');
  await page.evaluate(() => {
    const native = window.VildaVault.saveReminderOutcome;
    window.VildaVault.saveReminderOutcome = function (request) {
      const submitted = structuredClone(request); window.__homeSubmittedReminder = submitted;
      return new Promise(resolve => { window.__homeReleaseReminder = () => resolve(native.call(this, submitted)); });
    };
  });
  await outcome.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__homeSubmittedReminder));
  expect((await page.evaluate(() => window.__homeSubmittedReminder)).patientId).toBe(ids.a);
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.b);
  await expect(outcome).toHaveCount(0); await expect(dialog).toHaveCount(0);
  await frame.evaluate(original => { sessionStorage.setItem('vildaCurrentPatientId', original); }, ids.a);
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await expect(card.locator('.vhome-reminders-count')).toHaveText('1');
  await page.evaluate(() => window.__homeReleaseReminder());
  await expect.poll(async () => Boolean((await stored(frame, notes.aPast)).completedAtISO)).toBe(true);
  expect((await stored(frame, notes.aPast)).body).toContain('Fikcyjny przyjęty zapis wyłącznie dla A.');
  expect(await stored(frame, notes.bPast)).toEqual(beforeB);
  expect(await page.evaluate(() => window.__homeRemindersWrites.map(request => request.patientId))).toEqual([ids.a]);
  await expect(card).toContainText('Fikcyjna B zaległa kontrola'); await expect(card).not.toContainText('Fikcyjna A');
  await expect(page.locator(DIALOG)).toHaveCount(0); await expect(page.locator(OUTCOME)).toHaveCount(0);
});

test('selected patient: late history, PRO revocation and lock dispose old patient views', async ({ page }) => {
  const { frame, ids, notes, card } = await setup(page);
  let dialog = await open(page, card);
  await page.evaluate(() => {
    const native = window.VildaVault.listReminderHistory;
    window.VildaVault.listReminderHistory = async function (...args) {
      const result = await native.apply(this, args); window.__homeHistoryReadStarted = true;
      return new Promise(resolve => { window.__homeReleaseHistory = () => resolve(result); });
    };
  });
  await dialog.getByRole('tab', { name: 'Historia', exact: true }).click();
  await page.waitForFunction(() => window.__homeHistoryReadStarted === true);
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.b);
  await expect(dialog).toHaveCount(0);
  await frame.evaluate(original => { sessionStorage.setItem('vildaCurrentPatientId', original); }, ids.a);
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await expect(card.locator('.vhome-reminders-count')).toHaveText('1');
  await page.evaluate(() => window.__homeReleaseHistory());
  await expect(card).toContainText('Fikcyjna B zaległa kontrola'); await expect(card).not.toContainText('Fikcyjna A');
  await expect(page.locator(`[data-note-id="${notes.aDone}"]`)).toHaveCount(0);
  await failNextTopScopedRead(page); dialog = await open(page, card);
  await expect(dialog).toHaveAttribute('data-home-reminders-phase', 'error');
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.a);
  await expect(dialog).toHaveCount(0);
  await frame.evaluate(original => { sessionStorage.setItem('vildaCurrentPatientId', original); window.VildaHomeRemindersRuntime.refresh(); }, ids.b);
  await expect(card).toBeVisible(); await expect(card.locator('.vhome-reminders-count')).toHaveText('1');
  dialog = await open(page, card);
  await row(dialog, notes.bPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(page.locator(OUTCOME)).toBeVisible();
  await frame.evaluate(() => window.VildaProAccess.setPlan('free'));
  await expect(page.locator(OUTCOME)).toHaveCount(0); await expect(dialog).toHaveCount(0); await expect(card).toBeHidden();
  await frame.evaluate(() => window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z'));
  await expect(card).toBeVisible(); dialog = await open(page, card);
  await row(dialog, notes.bPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(page.locator(OUTCOME)).toBeVisible();
  const lockReports = [], lockWrites = [];
  await page.exposeFunction('__homeReminderLockReport', report => { lockReports.push(report); });
  await page.exposeFunction('__homeReminderLockedWrite', request => { lockWrites.push(request); });
  await page.evaluate(() => {
    const home = document.querySelector('iframe.app-pane[title="Start"]').contentWindow;
    const submit = document.querySelector('dialog.vb22-outcome button[type="submit"]');
    const writes = [], report = window.__homeReminderLockReport, writeReport = window.__homeReminderLockedWrite;
    const native = window.VildaVault.saveReminderOutcome;
    window.VildaVault.saveReminderOutcome = function (request) {
      writes.push(structuredClone(request)); void writeReport(structuredClone(request)).catch(() => {});
      return native.apply(this, arguments);
    };
    // Retain and invoke the actual action synchronously, before APP navigation
    // retires this whole realm. Node receives the result outside that lifetime.
    home.VildaVault.lock(); submit.click();
    void report({ connected: submit.isConnected, writes }).catch(() => {});
  });
  await expect.poll(() => lockReports.length).toBe(1);
  expect(lockReports[0]).toEqual({ connected: false, writes: [] });
  expect(lockWrites).toEqual([]);
  await expect(page.locator(OUTCOME)).toHaveCount(0); await expect(dialog).toHaveCount(0);
  // APP may remove the old iframe when locking. Inspect the live panes rather
  // than waiting on a locator whose original frame has already been retired.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('iframe.app-pane')].every(pane => {
    const card = pane.contentDocument?.querySelector('#vhomeMainCards #remindersInline .vhome-reminders-card');
    return !pane.getClientRects().length || !card || !card.getClientRects().length;
  }))).toBe(true);
});

test('selected patient: replacing an account closes an active editor before its retained action can write', async ({ page }) => {
  const { frame, notes, card } = await setup(page), dialog = await open(page, card);
  await row(dialog, notes.aPast).getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(page.locator(OUTCOME)).toBeVisible();
  await page.evaluate(() => {
    window.__homeOldAccountSubmit = document.querySelector('dialog.vb22-outcome button[type="submit"]');
    window.__homeReplacementWrites = [];
    const native = window.VildaVault.saveReminderOutcome;
    window.VildaVault.saveReminderOutcome = function (request) { window.__homeReplacementWrites.push(structuredClone(request)); return native.apply(this, arguments); };
  });
  const previousAccount = await frame.evaluate(() => window.VildaVault.getCurrentUser().userId);
  const created = await frame.evaluate(() => window.VildaVault.createUser('Fictional#ReminderAccount2026!', {
    label: 'Fikcyjne drugie konto przypomnień', iterations: 10000,
  }));
  expect(created.userId).not.toBe(previousAccount);
  await expect(page.locator(DIALOG)).toHaveCount(0); await expect(page.locator(OUTCOME)).toHaveCount(0);
  await page.evaluate(() => window.__homeOldAccountSubmit.click());
  expect(await page.evaluate(() => window.__homeReplacementWrites)).toEqual([]);
  await expect(card).toBeHidden();
});
