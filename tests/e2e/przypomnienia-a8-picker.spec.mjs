import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

const WORKSPACE = 'dialog.vb22-modal';
const PICKER = `${WORKSPACE} .vb22-patient-picker`;

async function setup(page, extraPatients = false) {
  const created = await createFictionalVault(page);
  const extras = extraPatients ? [
    { ...fictionalPatient({ firstName: 'Łukasz Żółć' }), user: { ...fictionalPatient().user, firstName: 'Łukasz Żółć', dobISO: '2012-06-17' } },
    { ...fictionalPatient({ firstName: 'Łukasz Żółć' }), user: { ...fictionalPatient().user, firstName: 'Łukasz Żółć', dobISO: '2014-06-17' } },
    ...Array.from({ length: 22 }, (_, index) => fictionalPatient({ firstName: 'Osoba ' + String(index + 1).padStart(2, '0') })),
  ] : [];
  const extraIds = await page.evaluate(async records => {
    const ids = [];
    for (const record of records) ids.push((await window.VildaVault.savePatient(record, { dedup: false })).patientId);
    return ids;
  }, extras);
  await page.evaluate(async patientId => {
    const date = new Date();
    const dueDateISO = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna sprawa wejścia do pickera A8', category: 'reminder-task', dueDateISO });
  }, created.ids.a);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '1');
  await page.locator('#vildaRemindersBtn').click();
  await expect(page.locator(WORKSPACE)).toBeVisible();
  return { ...created, extraIds };
}

async function add(page) {
  await page.locator(WORKSPACE).getByRole('button', { name: 'Dodaj przypomnienie', exact: true }).click();
  await expect(page.locator(PICKER)).toBeVisible();
}

async function choose(page, patientId) {
  await page.locator(`${PICKER} [data-patient-id="${patientId}"]`).click();
  await expect(page.locator(`${PICKER} .vb22-patient-selected`)).toBeVisible();
  await expect(page.locator(PICKER).getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true })).toBeHidden();
}

test('A8 searches real encrypted headers once, limits results, distinguishes names and saves only the selected ID', async ({ page }) => {
  const { ids, extraIds } = await setup(page, true);
  await page.evaluate(() => {
    const original = window.VildaVault.listPatients.bind(window.VildaVault);
    window.__a8PickerReads = 0;
    window.VildaVault.listPatients = (...args) => {
      if (document.querySelector('dialog.vb22-modal .vb22-patient-picker')) window.__a8PickerReads += 1;
      return original(...args);
    };
  });
  await add(page);
  const workspace = page.locator(WORKSPACE), picker = page.locator(PICKER);
  const search = picker.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true });
  const save = workspace.getByRole('button', { name: 'Zapisz przypomnienie', exact: true });
  await expect(picker.locator('.vb22-patient-option')).toHaveCount(20);
  await expect(picker.getByRole('status')).toContainText('Pokazano 20 z 26');
  await expect(save).toBeDisabled();

  await search.fill('LUKASZ ZOLC');
  await expect(picker.locator('.vb22-patient-option')).toHaveCount(2);
  await expect(picker.locator(`[data-patient-id="${extraIds[0]}"]`)).toContainText('ur. 17.06.2012');
  await expect(picker.locator(`[data-patient-id="${extraIds[1]}"]`)).toContainText('ur. 17.06.2014');
  await choose(page, extraIds[0]);
  await expect(picker.locator('.vb22-patient-selected')).toContainText('Fikcyjny Łukasz Żółć');
  await expect(save).toBeEnabled();
  await workspace.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny kontakt po zmianie wyboru A8');
  await workspace.getByLabel('Przypomnij w dniu', { exact: true }).fill('2027-02-02');
  await workspace.getByLabel('Dodatkowe informacje (opcjonalnie)', { exact: true }).fill('Fikcyjne ustalenia pozostają po wyczyszczeniu wyboru.');

  await picker.getByRole('button', { name: 'Wyczyść wybór', exact: true }).click();
  await expect(search).toBeVisible(); await expect(search).toHaveValue('');
  await expect(save).toBeDisabled();
  await expect(workspace.getByLabel('Treść przypomnienia', { exact: true })).toHaveValue('Fikcyjny kontakt po zmianie wyboru A8');
  await expect(workspace.getByLabel('Przypomnij w dniu', { exact: true })).toHaveValue('2027-02-02');
  await expect(workspace.getByLabel('Dodatkowe informacje (opcjonalnie)', { exact: true })).toHaveValue('Fikcyjne ustalenia pozostają po wyczyszczeniu wyboru.');
  await search.fill('Fikcyjna osoba bez zapisanego rekordu');
  await expect(picker.locator('.vb22-patient-option')).toHaveCount(0);
  await search.evaluate(node => node.form.requestSubmit());
  expect(await search.evaluate(node => node.validity.customError)).toBe(true);
  expect(await page.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).some(note => note.title === 'Fikcyjny kontakt po zmianie wyboru A8'), extraIds[0])).toBe(false);

  await search.fill('beata'); await choose(page, ids.b);
  await save.click();
  await expect.poll(() => page.evaluate(async patientId => {
    const note = (await window.VildaVault.listPatientNotesForPatient(patientId)).find(item => item.title === 'Fikcyjny kontakt po zmianie wyboru A8');
    return note ? { patientId: note.patientId, dueDateISO: note.dueDateISO, body: note.body } : null;
  }, ids.b)).toEqual({ patientId: ids.b, dueDateISO: '2027-02-02T00:00:00.000Z', body: 'Fikcyjne ustalenia pozostają po wyczyszczeniu wyboru.' });
  expect(await page.evaluate(() => window.__a8PickerReads)).toBe(1);
  expect(await page.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(26);
});

test('A8 cancels a slow picker without replacing the newer form and removes it on vault lock', async ({ page }) => {
  const { ids } = await setup(page);
  await page.evaluate(() => {
    const original = window.VildaVault.listPatients.bind(window.VildaVault);
    let calls = 0;
    window.VildaVault.listPatients = async (...args) => {
      const fromPicker = Boolean(document.querySelector('dialog.vb22-modal .vb22-patient-picker'));
      const records = await original(...args); if (!fromPicker) return records; calls += 1;
      if (calls === 1) return new Promise(resolve => { window.__a8ReleasePatients = () => resolve(records); });
      return records;
    };
  });
  await add(page);
  await page.waitForFunction(() => typeof window.__a8ReleasePatients === 'function');
  await page.locator(WORKSPACE).getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(page.locator(PICKER)).toHaveCount(0);
  await add(page);
  await page.locator(PICKER).getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true }).fill('beata');
  await choose(page, ids.b);
  await page.locator(WORKSPACE).getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny nowy formularz po anulowaniu odczytu');
  await page.evaluate(() => window.__a8ReleasePatients());
  await expect(page.locator(`${PICKER} .vb22-patient-selected`)).toContainText('Fikcyjny Beata');
  await expect(page.locator(WORKSPACE).getByLabel('Treść przypomnienia', { exact: true })).toHaveValue('Fikcyjny nowy formularz po anulowaniu odczytu');
  await expect(page.locator(PICKER)).toHaveCount(1);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(page.locator(WORKSPACE)).toHaveCount(0);
  await expect(page.locator('.vb22-patient-picker')).toHaveCount(0);
});

test('A8 can retry a failed header read while retaining the reminder draft', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const original = window.VildaVault.listPatients.bind(window.VildaVault);
    let fail = true;
    window.VildaVault.listPatients = (...args) => {
      if (fail && document.querySelector('dialog.vb22-modal .vb22-patient-picker')) { fail = false; return Promise.reject(new Error('Fikcyjny błąd nagłówków A8')); }
      return original(...args);
    };
  });
  await add(page);
  const workspace = page.locator(WORKSPACE);
  await expect(page.locator(PICKER).getByRole('alert')).toContainText('Fikcyjny błąd nagłówków A8');
  await workspace.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny szkic zachowany po błędzie listy');
  await page.locator(PICKER).getByRole('button', { name: 'Spróbuj ponownie wczytać pacjentów', exact: true }).click();
  await expect(page.locator(`${PICKER} .vb22-patient-option`)).toHaveCount(2);
  await expect(page.locator(PICKER).getByRole('alert')).toHaveCount(0);
  await expect(workspace.getByLabel('Treść przypomnienia', { exact: true })).toHaveValue('Fikcyjny szkic zachowany po błędzie listy');
  await expect(workspace.getByRole('button', { name: 'Zapisz przypomnienie', exact: true })).toBeDisabled();
});

test.describe('A8 touch patient selection', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 393, height: 480 } });

  test('the searchable patient choice fits a reduced phone viewport and clears without losing the draft', async ({ page }) => {
    const { ids } = await setup(page); await add(page);
    const picker = page.locator(PICKER), workspace = page.locator(WORKSPACE);
    const search = picker.getByRole('searchbox', { name: 'Szukaj pacjenta', exact: true });
    await search.fill('antoni');
    const option = picker.locator(`[data-patient-id="${ids.a}"]`);
    await expect(option).toBeVisible();
    const styles = await option.evaluate(node => {
      const name = node.querySelector('.vb22-patient-name'), style = getComputedStyle(name);
      return { height: node.getBoundingClientRect().height, size: style.fontSize, weight: style.fontWeight };
    });
    expect(styles.height).toBeGreaterThanOrEqual(44);
    expect(styles.size).toBe('16.8px'); expect(styles.weight).toBe('400');
    await choose(page, ids.a);
    await workspace.getByLabel('Treść przypomnienia', { exact: true }).fill('Fikcyjny mobilny szkic po wyborze pacjenta');
    await picker.getByRole('button', { name: 'Wyczyść wybór', exact: true }).tap();
    await expect(search).toBeVisible();
    await expect(workspace.getByLabel('Treść przypomnienia', { exact: true })).toHaveValue('Fikcyjny mobilny szkic po wyborze pacjenta');
    await expect(workspace.getByRole('button', { name: 'Zapisz przypomnienie', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('a8-picker-phone.png') });
  });
});
