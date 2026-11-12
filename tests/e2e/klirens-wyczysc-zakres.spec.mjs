import { expect, test } from '../support/test-czas.mjs';
import { CLEAR_DIALOG, loadPatient, openFictionalClearAccount, readyClearPage } from '../support/clear-current-state-fixture.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

// P-KLIRENS-WYCZYSC (decyzja właściciela 2026-11-12). Przycisk na stronie Klirensu
// („Wyczyść dane Klirensu”) czyści tylko badanie i wynik; pacjent i wybrany wzór
// zostają. „Wyczyść” w menu bocznym kończy pracę z pacjentem jak na Starcie i w DocPro:
// pyta o niezapisane zmiany i nie zostawia w pamięci strony danych poprzedniego
// pacjenta (wcześniej jego pomiar trafiał do rekordu następnego pacjenta).
// Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const A = { firstName: 'Bartek Klirens', lastName: 'Fikcyjny', sex: 'M', age: 10, ageMonths: 0, height: 140, weight: 32 };
const DISCARD_CALCULATION = 'Odrzuć obliczenie i wyczyść';

const savePatientA = owner => owner.evaluate(async user => (await window.VildaVault.savePatient({
  version: 1, name: 'Fikcyjny Bartek Klirens', user,
}, { dedup: false })).patientId, A);

// Ślady pacjenta A (10 lat = 120 mies., 140 cm, 32 kg, imię) w dowolnym miejscu obiektu.
// Pomija stałe tabel i progów, które przypadkiem mają te same liczby.
const tracesOfA = (frame, expression) => frame.evaluate(async source => {
  const value = await (0, eval)(source);
  const hits = [];
  const walk = (item, path) => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) { item.forEach((entry, index) => walk(entry, `${path}[${index}]`)); return; }
    if (typeof item === 'object') { Object.keys(item).forEach(key => walk(item[key], path ? `${path}.${key}` : key)); return; }
    if ([120, 140, 32].includes(item) || (typeof item === 'string' && item.includes('Bartek'))) hits.push(`${path}=${item}`);
  };
  walk(value, '');
  return hits.filter(hit => !/periodVelocities|bayleyPinneau|reinehr|pubertyProfile|\.rwt\.|khamis|tw2|adultHeightLMS|progi/.test(hit));
}, expression);

const status = (page, frame) => Promise.all([
  frame.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    indicator: window.VildaSaveStatusIndicator.getState(),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision().state,
  })),
  page.evaluate(() => document.querySelector('.chrome-menu-save-status [data-menu-save-label]')?.textContent.trim()),
]).then(([own, menu]) => ({ ...own, menu }));

async function klirensWithPatientA(page, context) {
  const { owner } = await openFictionalClearAccount(page, context);
  const patientId = await savePatientA(owner);
  await loadPatient(owner, patientId, 'restore');
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
  await readyClearPage(page);
  await expect(page.locator('#height')).toHaveValue('140');
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await expect(page.locator('#formulaPicker')).toHaveValue('ckid_u25');
  await page.locator('#clcrIdentityBar [data-ident-act="toggle"]').click();
  return patientId;
}

async function fillPatientB(frame) {
  await frame.evaluate(() => {
    const set = (id, value) => { const control = document.getElementById(id); if (!control) return;
      control.value = value; control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('change', { bubbles: true })); };
    set('fullName', 'Fikcyjna Celina Nowa'); set('name', 'Fikcyjna Celina Nowa');
    set('age', '7'); set('ageMonths', '0'); set('sex', 'F'); set('height', '121'); set('weight', '23');
    if (typeof window.update === 'function') window.update();
  });
}

async function saveNewPatient(frame) {
  const saved = await frame.evaluate(async () => (await window.VildaDataImportExport.saveUserDataWithReceipt({ source: 'e2e' }))?.saved);
  expect(saved).toBe(true);
  const patientId = await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'));
  expect(patientId).toBeTruthy();
  return patientId;
}

test('przycisk na stronie czyści tylko dane Klirensu: pacjent, wzór i stan „Zapisano” zostają', async ({ page, context }) => {
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.accept(); });
  const patientId = await klirensWithPatientA(page, context);
  await page.locator('#Scr').fill('0.6');
  await expect.poll(() => status(page, page)).toMatchObject({ patientId, decision: 'dirty', menu: 'Niezapisane zmiany' });
  await expect(page.locator('#clearBtn')).toHaveText('Wyczyść dane Klirensu');

  // Niezapisane obliczenie: okno pyta tylko o Klirens; „Wróć do obliczenia” niczego nie zmienia.
  await page.locator('#clearBtn').click();
  const dialog = page.getByRole('dialog', { name: 'Odrzucić obliczenie Klirensu?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Zapisz/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Wróć do obliczenia' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#Scr')).toHaveValue('0.6');

  await page.locator('#clearBtn').click();
  await dialog.getByRole('button', { name: DISCARD_CALCULATION }).click();
  await expect(page.locator('#Scr')).toHaveValue('');
  await expect(page.locator('#formulaPicker')).toHaveValue('ckid_u25');
  for (const [id, value] of [['fullName', 'Fikcyjny Bartek Klirens'], ['age', '10'], ['sex', 'M'], ['height', '140'], ['weight', '32']]) {
    await expect(page.locator('#' + id)).toHaveValue(value);
  }
  await expect.poll(() => status(page, page)).toEqual({ patientId, indicator: 'saved', decision: 'saved', menu: 'Zapisano' });

  // F5 nie ostrzega o niezapisanych zmianach, a Start nadal ma tego samego pacjenta.
  await page.reload({ waitUntil: 'load' });
  await readyClearPage(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await readyClearPage(page);
  await expect(page.locator('#name')).toHaveValue('Fikcyjny Bartek Klirens');
  await expect.poll(() => status(page, page)).toEqual({ patientId, indicator: 'saved', decision: 'saved', menu: 'Zapisano' });
  expect(dialogs).toEqual([]);
});

test('„Wyczyść” w menu Klirensu pyta jak na Starcie, kończy pracę z pacjentem i nie przenosi jego danych do następnego', async ({ page, context }) => {
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.accept(); });
  const patientA = await klirensWithPatientA(page, context);
  await page.locator('#height').fill('141');
  await expect.poll(() => status(page, page)).toMatchObject({ patientId: patientA, decision: 'dirty' });

  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Wyczyść', exact: true }).click();
  const guard = page.getByRole('dialog', { name: CLEAR_DIALOG });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Odrzuć zmiany i wyczyść' }).click();
  await expect(page.locator('#height')).toHaveValue('');
  await expect(page.locator('#fullName')).toHaveValue('');
  await expect.poll(() => status(page, page)).toEqual({ patientId: null, indicator: 'hidden', decision: 'hidden', menu: 'Brak danych' });
  expect(await tracesOfA(page, 'window.collectUserData()')).toEqual([]);

  // Nowa pacjentka wpisana w Klirensie: jej rekord nie zawiera pomiaru ani imienia A.
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await fillPatientB(page);
  const patientB = await saveNewPatient(page);
  expect(patientB).not.toBe(patientA);
  expect(await tracesOfA(page, `window.VildaVault.getPatient(${JSON.stringify(patientB)})`)).toEqual([]);
  expect(dialogs).toEqual([]);
});

test('po „Wyczyść” w menu Klirensu Start nie pokazuje „Nowy pacjent”, a F5 nie ostrzega', async ({ page, context }) => {
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.accept(); });
  await klirensWithPatientA(page, context);
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Wyczyść', exact: true }).click();
  await expect(page.locator('#height')).toHaveValue('');
  await expect.poll(() => status(page, page)).toEqual({ patientId: null, indicator: 'hidden', decision: 'hidden', menu: 'Brak danych' });
  await page.reload({ waitUntil: 'load' });
  await readyClearPage(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await readyClearPage(page);
  await expect.poll(() => status(page, page)).toEqual({ patientId: null, indicator: 'hidden', decision: 'hidden', menu: 'Brak danych' });
  expect(await tracesOfA(page, 'window.VildaPersistence.readMainSession()')).toEqual([]);
  expect(dialogs).toEqual([]);
});

test('powłoka: przycisk Klirensu nie czyści Startu ani pacjenta', async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context, { shell: true, path: '/index.html' });
  const patientId = await savePatientA(owner);
  await loadPatient(owner, patientId, 'restore');
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  const klirens = await shellFrame(page, 'Kalkulator klirensu');
  await readyClearPage(klirens);
  await klirens.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await klirens.locator('#Scr').fill('0.6');
  await klirens.locator('#clearBtn').click();
  await klirens.getByRole('dialog', { name: 'Odrzucić obliczenie Klirensu?' }).getByRole('button', { name: DISCARD_CALCULATION }).click();
  await expect(klirens.locator('#Scr')).toHaveValue('');
  await expect(klirens.locator('#height')).toHaveValue('140');
  await expect.poll(() => status(page, klirens)).toEqual({ patientId, indicator: 'saved', decision: 'saved', menu: 'Zapisano' });
  await expect(owner.locator('#name')).toHaveValue('Fikcyjny Bartek Klirens');
  await expect(owner.locator('#height')).toHaveValue('140');
  await expect.poll(() => owner.evaluate(() => ({ patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision().state }))).toEqual({ patientId, decision: 'saved' });
});

test('powłoka: „Wyczyść” w menu na Starcie zeruje też ukrytą ramkę Klirensu; jej dane nie wracają po F5', async ({ page, context }) => {
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.type()); dialog.accept(); });
  const { owner } = await openFictionalClearAccount(page, context, { shell: true, path: '/index.html' });
  const patientA = await savePatientA(owner);
  await loadPatient(owner, patientA, 'restore');
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  const klirens = await shellFrame(page, 'Kalkulator klirensu');
  await readyClearPage(klirens);
  await expect(klirens.locator('#height')).toHaveValue('140');
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();

  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Wyczyść', exact: true }).click();
  await expect(owner.locator('#height')).toHaveValue('');
  await expect(klirens.locator('#height')).toHaveValue('');
  await expect.poll(() => tracesOfA(klirens, 'window.collectUserData()')).toEqual([]);

  // Ponowne pokazanie Klirensu nie wskrzesza pacjenta A w sesji karty.
  await page.evaluate(() => window.VildaShell.navigate('klirens'));
  await expect.poll(() => status(page, klirens)).toEqual({ patientId: null, indicator: 'hidden', decision: 'hidden', menu: 'Brak danych' });
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await expect.poll(() => status(page, owner)).toEqual({ patientId: null, indicator: 'hidden', decision: 'hidden', menu: 'Brak danych' });
  expect(await tracesOfA(owner, 'window.VildaPersistence.readMainSession()')).toEqual([]);

  await page.reload({ waitUntil: 'load' });
  const start = await shellFrame(page, 'Start');
  await readyClearPage(start);
  expect(await tracesOfA(start, 'window.VildaPersistence.readMainSession()')).toEqual([]);
  await fillPatientB(start);
  const patientB = await saveNewPatient(start);
  expect(await tracesOfA(start, `window.VildaVault.getPatient(${JSON.stringify(patientB)})`)).toEqual([]);
  expect(dialogs).toEqual([]);
});
