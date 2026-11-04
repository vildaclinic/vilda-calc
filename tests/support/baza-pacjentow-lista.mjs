import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';
import { visibleChromeMenu } from './chrome-menu-fixture.mjs';

export const BAZA = '.vilda-patients2.vilda-auth-patients';
export const PICKER = '.vilda-patients-list-picker';
export const LISTA = 'Fikcyjna lista kontroli E2E';
export const DRUGA_LISTA = 'Fikcyjna druga lista E2E';

// Prawdziwy szyfrowany vault w nowym kontekście Playwrighta. Dane są wyłącznie
// fikcyjne; wspólne API powłoki i ramki pozostaje produkcyjne.
export async function przygotujBaze(page) {
  await page.addInitScript(() => {
    const date = new Date();
    const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    for (const key of ['vilda-reminders-shown-v1', 'vilda-reminders-closed-v1']) {
      localStorage.setItem(key, `${day}|${Date.now()}`);
    }
  });
  const created = await createFictionalVault(page, { shell: true });
  const frame = created.frame;
  const fixture = await frame.evaluate(async ({ existing, listName, otherListName }) => {
    const vault = window.VildaVault;
    const base = [], external = [], names = {};
    for (let index = 0; index < 20; index += 1) {
      const lastName = index === 19 ? 'Fikcyjna Żółć' : `Fikcyjny Lista${String(index).padStart(2, '0')}`;
      const firstName = index === 19 ? 'Maria' : index % 2 ? 'Jan' : 'Anna';
      const name = `${lastName} ${firstName}`;
      const record = await vault.savePatient({
        version: 1, name,
        user: {
          lastName, firstName, sex: firstName === 'Jan' ? 'M' : 'F',
          age: 10, ageMonths: 0, height: 138, weight: 32,
          dobISO: '2016-01-15', measuredAtISO: '2026-01-15',
        },
      }, { ...(existing[index] ? { patientId: existing[index] } : {}), dedup: false });
      base.push(record.patientId); names[record.patientId] = name;
    }
    for (let index = 0; index < 4; index += 1) {
      const lastName = `Fikcyjny Spoza${String(index).padStart(2, '0')}`;
      const record = await vault.saveExternalPatient({ lastName, firstName: 'Anna', birthYear: 2016 });
      external.push(record.patientId); names[record.patientId] = `${lastName} Anna`;
    }
    const members = [...base.slice(0, 16), ...external.slice(0, 2)];
    const list = await vault.savePatientList({ name: listName, memberIds: members });
    const other = await vault.savePatientList({ name: otherListName, memberIds: base.slice(16, 19) });
    return { base, external, names, members, listId: list.id, otherListId: other.id };
  }, { existing: [created.ids.a, created.ids.b], listName: LISTA, otherListName: DRUGA_LISTA });
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  const database = frame.locator(BAZA);
  await expect(database).toBeVisible();
  await expect(database.locator('.pt-row')).toHaveCount(24);
  return { frame, database, ...fixture };
}

export async function otworzListe(frame, name = LISTA) {
  const database = frame.locator(BAZA);
  const mobileTrigger = database.locator('.pt-lists-trigger');
  if (await mobileTrigger.isVisible()) {
    await mobileTrigger.click();
    await expect(frame.locator(PICKER)).toBeVisible();
    await frame.locator(PICKER).locator('.pl-tile', { hasText: name }).click();
    await expect(frame.locator(PICKER)).toHaveCount(0);
  } else {
    await database.locator('.pt-seg [data-filter="lists"]').click();
    await database.locator('.pl-tile', { hasText: name }).click();
  }
  await expect(database.locator('.pt-count')).toHaveText(`Lista: ${name}`);
  return database;
}

export async function sortuj(frame, value) {
  await frame.locator(BAZA).locator('.pt-sortpill').click();
  await frame.locator(`.pt-sortopt[data-s="${value}"]`).click();
}

export async function bezPrzewijaniaPoziomego(page, frame) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const overflow = await frame.locator(BAZA).evaluate(node => node.scrollWidth - node.clientWidth);
  expect(overflow, 'Baza mieści się także we własnym kontenerze').toBeLessThanOrEqual(1);
}

export async function ustawSzerokoscBazy(page, frame, width) {
  // Breakpoint Bazy dotyczy ramki. Stały panel powłoki może zmniejszać jej
  // szerokość, więc nie utożsamiamy viewportu całej przeglądarki z ownerem UI.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = await frame.evaluate(() => innerWidth);
    if (actual === width) return;
    await page.setViewportSize({ width: page.viewportSize().width + width - actual, height: 960 });
    await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  }
  expect(await frame.evaluate(() => innerWidth), 'rzeczywista szerokość ramki Bazy').toBe(width);
}
