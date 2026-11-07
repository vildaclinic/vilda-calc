import { expect, test } from '@playwright/test';
import { shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(90_000);

async function ready(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && window.VildaDataImportExport?.getSaveReadiness().ready);
}

async function emptyAccount(page, context) {
  await context.route(/https?:\/\/[^/]+\.workers\.dev(?:\/|$)/u, route => route.fulfill({
    status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}',
  }));
  await context.routeWebSocket(/wss?:\/\/[^/]+\.workers\.dev(?:\/|$)/u, socket => socket.close());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({
      version: 1, acceptedAtISO: new Date().toISOString(),
    }));
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await shellFrame(page, 'Start');
  await start.waitForFunction(() => typeof window.VildaVault?.createUser === 'function');
  await start.evaluate(() => window.VildaVault.createUser('Fikcyjny#PustyFormularz26!', {
    label: 'Fikcyjny lekarz', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  start = await shellFrame(page, 'Start');
  await ready(start);
  return start;
}

async function visit(page, route, title) {
  await page.evaluate(key => window.VildaShell.navigate(key), route);
  const frame = await shellFrame(page, title);
  await ready(frame);
  return frame;
}

async function unknownAge(frame) {
  await expect(frame.locator('#age')).toHaveValue('');
  await expect(frame.locator('#ageMonths')).toHaveValue('');
  await expect(frame.locator('#ageWeeks')).toHaveValue('');
  await expect(frame.locator('#ageWeeksRow')).toBeHidden();
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`pusty formularz pozostaje pusty po trzech przejściach Start–DocPro i F5 (${viewport.width}px)`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    let start = await emptyAccount(page, context);
    await unknownAge(start);
    for (let round = 0; round < 3; round++) {
      const docpro = await visit(page, 'docpro', 'DocPro');
      await unknownAge(docpro);
      start = await visit(page, 'start', 'Start');
      await unknownAge(start);
      await expect(start.locator('#loadDataMessage')).toBeHidden();
      expect(await start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
      expect(await start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('hidden');
    }
    await page.reload({ waitUntil: 'load' });
    start = await shellFrame(page, 'Start');
    await ready(start);
    await unknownAge(start);
    await expect(start.locator('#loadDataMessage')).toBeHidden();
    expect(await start.evaluate(() => window.VildaVault.listPatients())).toEqual([]);
  });
}

test('samo nazwisko zachowuje nieznany wiek po przejściu przez DocPro', async ({ page, context }) => {
  let start = await emptyAccount(page, context);
  await start.locator('#lastName').fill('Fikcyjny Bez Pomiaru');
  await visit(page, 'docpro', 'DocPro');
  start = await visit(page, 'start', 'Start');
  await unknownAge(start);
  await expect(start.locator('#lastName')).toHaveValue('Fikcyjny Bez Pomiaru');
  expect(await start.evaluate(() => window.VildaDataImportExport.collectUserData().user))
    .toMatchObject({ age: null, ageMonths: null });
});

test('jawny wiek noworodka 0 lat i 0 miesięcy pozostaje po zapisie, przejściach i F5', async ({ page, context }) => {
  let start = await emptyAccount(page, context);
  for (const [id, value] of Object.entries({
    lastName: 'Fikcyjny', firstName: 'Noworodek', age: '0', ageMonths: '0', height: '50', weight: '3.2',
  })) await start.locator(`#${id}`).fill(value);
  await ready(start);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  const saved = await start.evaluate(async () => {
    const id = sessionStorage.getItem('vildaCurrentPatientId');
    return { id, record: await window.VildaVault.getPatient(id) };
  });
  expect(saved.record.snapshots[0].payload.user).toMatchObject({ age: 0, ageMonths: 0, height: 50, weight: 3.2 });
  for (let round = 0; round < 2; round++) {
    const docpro = await visit(page, 'docpro', 'DocPro');
    await expect(docpro.locator('#age')).toHaveValue('0');
    await expect(docpro.locator('#ageMonths')).toHaveValue('0');
    start = await visit(page, 'start', 'Start');
    await expect(start.locator('#age')).toHaveValue('0');
    await expect(start.locator('#ageMonths')).toHaveValue('0');
    await expect(start.locator('#ageWeeksRow')).toBeVisible();
  }
  await page.reload({ waitUntil: 'load' });
  start = await shellFrame(page, 'Start');
  await ready(start);
  await expect(start.locator('#age')).toHaveValue('0');
  await expect(start.locator('#ageMonths')).toHaveValue('0');
  await expect(start.locator('#height')).toHaveValue('50');
  await expect(start.locator('#weight')).toHaveValue('3.2');
  expect(await start.evaluate(id => window.VildaVault.getPatient(id), saved.id)).toEqual(saved.record);
});
