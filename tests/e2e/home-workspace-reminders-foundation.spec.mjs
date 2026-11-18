// The accepted selected-patient card mounts through the real home runtime.
// Every record here belongs to one fictional patient; the separate patient
// scope suite covers boundaries between different patients and the global bell.
import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

const CARD = '#vhomeMainCards #remindersInline .vhome-reminders-card';
const DIALOG = 'dialog.vb22-modal.vhome-reminders-dialog';
const OUTCOME = 'dialog.vb22-outcome.vhome-reminders-child-dialog';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

async function geometry(page, selector) {
  const measure = () => page.locator(selector).evaluate(node => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height, x: box.x, y: box.y,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
  // Retain the real geometry even when a bounded-size assertion fails, so a
  // nested mobile dialog cannot hide its differing inset behind a poll timeout.
  const initial = await measure();
  const evidence = test.info().outputPath(`geometry-${initial.viewportWidth}-${selector.includes('outcome') ? 'outcome' : 'main'}.json`);
  writeFileSync(evidence, JSON.stringify(initial, null, 2));
  await test.info().attach('actual-dialog-geometry', { path: evidence, contentType: 'application/json' });
  await expect.poll(async () => {
    const value = await measure(), mobile = value.viewportWidth <= 600;
    const width = Math.min(1000, value.viewportWidth - (mobile ? 20 : 32));
    const height = Math.min(mobile ? Infinity : 820, value.viewportHeight - (mobile ? 24 : 32));
    return [value.width - width, value.height - height,
      value.x - (value.viewportWidth - width) / 2, value.y - (value.viewportHeight - height) / 2]
      .map(value => Math.round(value) || 0);
  }).toEqual([0, 0, 0, 0]);
  const actual = await measure();
  expect(actual.scrollWidth - actual.clientWidth).toBeLessThanOrEqual(1);
  expect(actual.x).toBeGreaterThanOrEqual(0); expect(actual.y).toBeGreaterThanOrEqual(0);
  expect(actual.x + actual.width).toBeLessThanOrEqual(actual.viewportWidth + 1);
  expect(actual.y + actual.height).toBeLessThanOrEqual(actual.viewportHeight + 1);
  return actual;
}

async function alignedEntryTitle(dialog) {
  const row = dialog.locator('.vhome-reminders-full-entry > .vhome-reminders-entry-open').first();
  const title = row.locator('.vb22-row-title');
  expect(Math.abs((await title.boundingBox()).x - (await row.boundingBox()).x)).toBeLessThanOrEqual(1);
}

test('native home reminders retain card geometry, top-shell actions, history, retry and the legacy bell', async ({ page }) => {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const { frame, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await loadPatient(frame, ids.a, 'restore');
  await frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.__vildaSuspendIntakeUserReset && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDobAge.restorePending() && Boolean(window.VildaHomeRemindersPresentation));
  await expect(frame.locator('#vhomeMainCards')).toBeVisible();
  await expect(frame.locator('#vhomeMainCards #remindersInline')).toHaveAttribute('data-home-reminders-presentation', 'true');
  await frame.evaluate(() => { window.__homeRemindersOriginalHost = document.getElementById('remindersInline'); });
  const seeded = await frame.evaluate(async patientId => {
    const vault = window.VildaVault, today = new Date();
    const day = offset => {
      const date = new Date(today); date.setDate(date.getDate() + offset);
      return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    };
    const active = [];
    for (const [title, offset, dueTime] of [
      ['Fikcyjny kontakt kontrolny', -2, '09:30'],
      ['Fikcyjna kontrola dokumentów', -1, ''],
      ['Fikcyjna rozmowa podsumowująca', 0, '14:30'],
    ]) active.push((await vault.savePatientNote({ patientId, title, dueDateISO: day(offset), dueTime,
      category: 'reminder-contact', body: 'Fikcyjne ustalenia testu prezentacji.' })).id);
    for (let index = 0; index < 51; index += 1) await vault.savePatientNote({ patientId,
      title: `Fikcyjna zamknięta sprawa ${String(index + 1).padStart(2, '0')}`,
      category: 'reminder-task', body: 'Fikcyjna zakończona sprawa.',
      dueDateISO: day(-3), completedAtISO: new Date().toISOString() });
    return { active };
  }, ids.a);
  expect(await frame.evaluate(async patientId => (await window.VildaVault.listPatientNotesForPatient(patientId)).length, ids.b)).toBe(0);
  const card = frame.locator(CARD);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-home-reminders-phase', 'ready');
  expect(await frame.evaluate(() => document.querySelector('#vhomeMainCards #remindersInline') === window.__homeRemindersOriginalHost)).toBe(true);
  await expect(card.locator('.vhome-reminders-entry')).toHaveCount(2);
  await expect(card.locator('.vhome-reminders-count')).toHaveText('3');
  expect((await card.boundingBox()).height).toBeCloseTo(352, 0);
  expect((await card.locator('.vb22-head').boundingBox()).height).toBeCloseTo(80, 0);
  await expect(card).toContainText('09:30');
  await expect(card.getByRole('button', { name: 'Wszystkie przypomnienia', exact: true })).toBeVisible();
  await card.screenshot({ path: test.info().outputPath('home-reminders-foundation-desktop-card.png') });

  await card.getByRole('button', { name: 'Powiększ Przypomnienia', exact: true }).click();
  const dialog = page.locator(DIALOG);
  await expect(dialog).toBeVisible();
  await expect(frame.locator(DIALOG)).toHaveCount(0); // Native routing belongs to app.html, not its Start iframe.
  await geometry(page, DIALOG);
  await expect(dialog.getByRole('tab')).toHaveText(['Do wykonania', 'Historia', 'Plany']);
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(3);
  await expect(dialog.locator('.vhome-reminders-full-entry .vb22-back:visible')).toHaveCount(0);
  await alignedEntryTitle(dialog);
  await expect(dialog.getByRole('button', { name: 'Szukaj', exact: true })).toHaveCount(0);
  expect(await dialog.locator('.vhome-reminders-full-entry button button').count()).toBe(0);
  const first = dialog.locator('.vhome-reminders-full-entry').filter({ has: page.locator(`[data-note-id="${seeded.active[0]}"]`) });
  await expect(first.getByRole('button', { name: 'Oznacz jako wykonane', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('home-reminders-foundation-desktop-dialog.png') });

  // The actual native add form must remain visible, with its original cancel.
  await dialog.getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await expect(dialog.getByLabel('Treść przypomnienia', { exact: true })).toBeVisible();
  await dialog.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny niezapisany szkic');
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog.getByLabel('Treść przypomnienia', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(3);
  await first.getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  const outcome = page.locator(OUTCOME);
  await expect(outcome).toBeVisible(); await geometry(page, OUTCOME);
  await outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true }).fill('Fikcyjny zapis wykonania z nowej prezentacji.');
  await page.evaluate(() => {
    const native = window.VildaVault.saveReminderOutcome;
    let fail = true;
    window.VildaVault.saveReminderOutcome = function (...args) {
      if (fail) { fail = false; return Promise.reject(new Error('Fikcyjna awaria zapisu prezentacji')); }
      return native.apply(this, args);
    };
  });
  await outcome.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(outcome.getByRole('alert')).toContainText('Fikcyjna awaria zapisu prezentacji');
  await expect(outcome.getByLabel('Co zostało zrobione? (opcjonalnie)', { exact: true })).toHaveValue('Fikcyjny zapis wykonania z nowej prezentacji.');
  await outcome.getByRole('button', { name: 'Zapisz wykonanie', exact: true }).click();
  await expect(outcome).toHaveCount(0);
  await expect(dialog.locator('.vb22-notice')).toContainText('Zapisano w Karcie pacjenta');
  await expect(dialog.getByRole('button', { name: '← Lista spraw', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '← Lista spraw', exact: true }).click();
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(2);
  const completed = await page.evaluate(id => window.VildaVault.getPatientNote(id), seeded.active[0]);
  expect(completed.patientId).toBe(ids.a); expect(completed.completedAtISO).toBeTruthy();
  expect(completed.body).toContain('Fikcyjny zapis wykonania z nowej prezentacji.');

  // An actual reader failure must retain the native error and retry controls;
  // the successful retry then retains its native fifty-row history pagination.
  await page.evaluate(() => {
    const native = window.VildaVault.listReminderHistory;
    let fail = true;
    window.VildaVault.listReminderHistory = function (...args) {
      if (fail) { fail = false; return Promise.reject(new Error('Fikcyjna awaria odczytu historii')); }
      return native.apply(this, args);
    };
  });
  await dialog.getByRole('tab', { name: 'Historia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fikcyjna awaria odczytu historii');
  await expect(dialog.getByRole('button', { name: 'Spróbuj ponownie', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(50);
  await dialog.getByRole('button', { name: 'Pokaż kolejne 2 spraw', exact: true }).click();
  await expect(dialog.locator('.vhome-reminders-full-entry')).toHaveCount(52);
  await dialog.getByRole('tab', { name: 'Plany', exact: true }).click();
  await expect(dialog.locator('.vb22-care-host')).toBeVisible();
  await dialog.getByRole('tab', { name: 'Do wykonania', exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await geometry(page, DIALOG);
  await alignedEntryTitle(dialog);
  await page.screenshot({ path: test.info().outputPath('home-reminders-foundation-mobile-dialog.png') });
  await dialog.locator('.vhome-reminders-full-entry').first().getByRole('button', { name: 'Oznacz jako wykonane', exact: true }).click();
  await expect(outcome).toBeVisible();
  const mobileOutcome = await geometry(page, OUTCOME);
  const mobileEvidence = test.info().outputPath('home-reminders-foundation-mobile-geometry.json');
  writeFileSync(mobileEvidence, JSON.stringify({ main: mobileDialog, outcome: mobileOutcome }, null, 2));
  await test.info().attach('home-reminders-foundation-mobile-geometry.json', { path: mobileEvidence, contentType: 'application/json' });
  for (const key of ['width', 'height', 'x', 'y']) expect(mobileOutcome[key]).toBeCloseTo(mobileDialog[key], 0);
  await page.screenshot({ path: test.info().outputPath('home-reminders-foundation-mobile-outcome.png') });
  await outcome.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(outcome).toHaveCount(0);
  await expect(dialog.locator('.vhome-reminders-full-entry .vb22-back:visible')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card.locator('.vhome-reminders-entry')).toHaveCount(2);
  await expect(card.locator('.vhome-reminders-count')).toHaveText('2');
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await card.evaluate(node => getComputedStyle(node).height)).not.toBe('352px');
  await card.screenshot({ path: test.info().outputPath('home-reminders-foundation-mobile-card.png') });

  // This separate, unmarked entry point must still expose native global Search.
  await page.locator('#vildaRemindersBtn').click();
  const legacy = page.locator('dialog.vb22-modal');
  await expect(legacy).toBeVisible(); await expect(legacy).not.toHaveClass(/vhome-reminders-dialog/);
  await legacy.getByRole('button', { name: 'Szukaj', exact: true }).click();
  await expect(legacy.getByRole('searchbox', { name: 'Szukaj we wszystkich pacjentach i sprawach', exact: true })).toBeVisible();
});
