import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

const WORKSPACE = 'dialog.vb22-modal';
const title = page => page.locator(`${WORKSPACE} .vb22-detail-title`);
const row = (page, id) => page.locator(`${WORKSPACE} [data-note-id="${id}"]`);

async function fixture(page) {
  const created = await createFictionalVault(page);
  const records = await page.evaluate(async ids => {
    const vault = window.VildaVault;
    const day = offset => {
      const date = new Date(); date.setDate(date.getDate() + offset);
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    };
    const futureA = await vault.savePatientNote({ patientId: ids.a, title: 'Fikcyjny kolejny krok A', body: 'Przyszły krok A.', category: 'reminder-task', dueDateISO: day(7) });
    const futureB = await vault.savePatientNote({ patientId: ids.b, title: 'Fikcyjny kolejny krok B', body: 'Przyszły krok B.', category: 'reminder-task', dueDateISO: day(8) });
    const parentA = await vault.savePatientNote({ patientId: ids.a, title: 'Fikcyjne przypomnienie A', body: 'Fikcyjna sprawa A z kolejnym krokiem.', category: 'reminder-task', dueDateISO: day(-2), reminderContext: { version: 1, nextId: futureA.id } });
    const parentB = await vault.savePatientNote({ patientId: ids.b, title: 'Fikcyjne przypomnienie B', body: 'Fikcyjna sprawa B z kolejnym krokiem.', category: 'reminder-task', dueDateISO: day(-1), reminderContext: { version: 1, nextId: futureB.id } });
    const historical = await vault.savePatientNote({ patientId: ids.a, title: 'Fikcyjna zakończona sprawa C', body: 'Stary zakończony opis C.', category: 'reminder-task', dueDateISO: day(-3), completedAtISO: new Date().toISOString() });
    return { parentA: parentA.id, parentB: parentB.id, futureA: futureA.id, futureB: futureB.id, historical: historical.id, futureDayA: day(7), futureDayC: day(9) };
  }, created.ids);
  await expect(page.locator('#remindersInline .vb22-row')).toHaveCount(2);
  await page.locator('#vildaRemindersBtn').click();
  await expect(page.locator(WORKSPACE)).toBeVisible();
  return { ...created, ...records };
}

async function pauseFirstFutureRead(page, day) {
  await page.evaluate(futureDay => {
    const native = window.VildaVault.listPatientNotesInRange;
    let paused = false;
    window.VildaVault.listPatientNotesInRange = async function (...args) {
      // Keep the real vault result; delay only its delivery to the presentation.
      const records = await native.apply(this, args);
      if (!paused && args[0] === futureDay) {
        paused = true;
        window.__a7FutureReadStarted = true;
        await new Promise(resolve => { window.__a7ReleaseFutureRead = resolve; });
        window.__a7FutureReadReturned = true;
      }
      return records;
    };
  }, day);
}

async function startDelayedStep(page, records) {
  await pauseFirstFutureRead(page, records.futureDayA);
  await row(page, records.parentA).click();
  await page.locator(WORKSPACE).getByRole('button', { name: 'Otwórz kolejny krok →', exact: true }).click();
  await page.waitForFunction(() => window.__a7FutureReadStarted === true);
}

async function releaseFutureRead(page) {
  await page.evaluate(() => window.__a7ReleaseFutureRead());
  await page.waitForFunction(() => window.__a7FutureReadReturned === true);
}

async function refreshParentB(page, records) {
  await page.evaluate(({ id, patientId }) => window.VildaVault.savePatientNote({
    id, patientId, title: 'Fikcyjne przypomnienie B — odświeżone',
  }), { id: records.parentB, patientId: records.ids.b });
  // A changed visible title proves that the real note-change refresh rendered.
  await expect(row(page, records.parentB).locator('.vb22-row-title')).toHaveText('Fikcyjne przypomnienie B — odświeżone');
}

test('A7 a delayed future read cannot erase a newer future selection during the next real refresh', async ({ page }) => {
  const records = await fixture(page);
  await startDelayedStep(page, records);
  await row(page, records.parentB).click();
  await page.locator(WORKSPACE).getByRole('button', { name: 'Otwórz kolejny krok →', exact: true }).click();
  await expect(title(page)).toHaveText('Fikcyjny kolejny krok B');
  await expect(page.locator(`${WORKSPACE} .vb22-notice`)).toContainText('Zapisano na przyszły termin');
  await releaseFutureRead(page);
  await refreshParentB(page, records);
  await expect(title(page)).toHaveText('Fikcyjny kolejny krok B');
  await expect(page.locator(`${WORKSPACE} .vb22-detail h3`)).toHaveText('Fikcyjny Beata');
  await expect(page.locator(`${WORKSPACE} .vb22-count`)).toHaveText(['2', '2', '0', '0']);
  await expect(row(page, records.futureA)).toHaveCount(0);
  await expect(row(page, records.futureB)).toHaveCount(0);
});

test('A7 a cached historical version cannot replace a reopened future note in explicit details', async ({ page }) => {
  const records = await fixture(page);
  await page.locator(WORKSPACE).getByRole('button', { name: 'Historia', exact: true }).click();
  await row(page, records.historical).click();
  await expect(title(page)).toHaveText('Fikcyjna zakończona sprawa C');
  await expect(page.locator(`${WORKSPACE} .vb22-body`)).toHaveText('Stary zakończony opis C.');
  await page.locator(WORKSPACE).getByRole('button', { name: 'Do wykonania', exact: true }).click();
  await page.evaluate(async ({ noteId, parentId, patientId, futureDay }) => {
    await window.VildaVault.savePatientNote({
      id: noteId, patientId, title: 'Fikcyjna ponownie otwarta sprawa C', body: 'Nowy aktualny opis przyszłej sprawy C.',
      completedAtISO: null, noShowAtISO: null, dueDateISO: futureDay,
    });
    await window.VildaVault.savePatientNote({
      id: parentId, patientId, title: 'Fikcyjne przypomnienie A — nowy odnośnik',
      reminderContext: { version: 1, nextId: noteId },
    });
  }, { noteId: records.historical, parentId: records.parentA, patientId: records.ids.a, futureDay: records.futureDayC });
  await expect(row(page, records.parentA).locator('.vb22-row-title')).toHaveText('Fikcyjne przypomnienie A — nowy odnośnik');
  await row(page, records.parentA).click();
  await page.locator(WORKSPACE).getByRole('button', { name: 'Otwórz kolejny krok →', exact: true }).click();
  await expect(title(page)).toHaveText('Fikcyjna ponownie otwarta sprawa C');
  await expect(page.locator(`${WORKSPACE} .vb22-body`)).toHaveText('Nowy aktualny opis przyszłej sprawy C.');
  await expect(page.locator(WORKSPACE).getByRole('button', { name: 'Oznacz jako wykonane', exact: true })).toBeVisible();
  await expect(page.locator(`${WORKSPACE} .vb22-notice`)).toContainText('Zapisano na przyszły termin');
  await expect(row(page, records.historical)).toHaveCount(0);
});

test('A7 clicking an ordinary row invalidates an older pending future navigation', async ({ page }) => {
  const records = await fixture(page);
  await startDelayedStep(page, records);
  await row(page, records.parentB).click();
  await expect(title(page)).toHaveText('Fikcyjne przypomnienie B');
  await releaseFutureRead(page);
  await refreshParentB(page, records);
  await expect(title(page)).toHaveText('Fikcyjne przypomnienie B — odświeżone');
  await expect(page.locator(`${WORKSPACE} .vb22-row[aria-current=true]`)).toHaveAttribute('data-note-id', records.parentB);
  await expect(row(page, records.futureA)).toHaveCount(0);
});
