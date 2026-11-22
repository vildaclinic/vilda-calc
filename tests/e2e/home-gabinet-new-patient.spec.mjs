import { expect, test } from '@playwright/test';
import { prepareGabinet } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

test('Nowy pacjent opens the shared directory form, returns to its entry and opens the newly saved chart', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  const entry = frame.locator('#vhomeGabinetStart [data-entry="new"]');
  const form = frame.locator('.vilda-auth-screen.vilda-edit2');
  const before = await frame.evaluate(async () => (await window.VildaVault.listPatients()).length);

  await entry.click();
  await expect(form.getByRole('heading', { name: 'Dodaj pacjenta' })).toBeVisible();
  await expect(form.getByPlaceholder('DD-MM-RRRR')).toBeVisible();
  await form.getByRole('button', { name: 'Anuluj' }).click();
  await expect(form).toHaveCount(0);
  await expect(entry).toBeFocused();
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(before);

  await entry.click();
  await form.getByRole('button', { name: 'Spoza bazy' }).click();
  await form.getByPlaceholder('Nazwisko', { exact: true }).fill('Fikcyjna Zewnętrzna');
  await form.getByPlaceholder('np. 2014').fill('2015');
  await form.getByRole('button', { name: /Dodaj pacjenta/ }).click();
  await expect(form).toHaveCount(0);
  await expect.poll(() => frame.evaluate(async () => (await window.VildaVault.listExternalPatients())
    .some(record => record.header.lastName === 'Fikcyjna Zewnętrzna'))).toBe(true);
  await expect(entry).toBeVisible();

  await entry.click();
  await form.getByPlaceholder('Nazwisko', { exact: true }).fill('Fikcyjna Kartoteka');
  await form.getByPlaceholder('Imię', { exact: true }).fill('Maria');
  await form.getByPlaceholder('DD-MM-RRRR').fill('22-05-2016');
  await form.getByRole('button', { name: /Dodaj pacjenta/ }).click();
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText('Maria');
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible();
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(before + 1);
});
