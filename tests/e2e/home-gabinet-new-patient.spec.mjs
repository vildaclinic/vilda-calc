import { expect, test } from '@playwright/test';
import { prepareGabinet } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

test('Nowy pacjent lays out the shared registration, returns to its entry and opens the newly saved chart', async ({ page }) => {
  const { frame, patients } = await prepareGabinet(page);
  const entry = frame.locator('#vhomeGabinetStart [data-entry="new"]');
  const registration = frame.locator('#vhomeGabinetRegistration');
  const form = registration.getByRole('form', { name: 'Formularz dodawania pacjenta' });
  const cards = form.locator('.gb-registration-card').filter({ visible: true });
  const surname = form.getByLabel('Nazwisko', { exact: true });
  const firstName = form.getByLabel('Imię', { exact: true });
  const dob = form.getByLabel('Pełna data urodzenia', { exact: true });
  const save = form.getByRole('button', { name: 'Dodaj pacjenta', exact: true });
  const before = await frame.evaluate(async () => (await window.VildaVault.listPatients()).length);
  const geometry = () => cards.evaluateAll(elements => elements.map(element => {
    const { left, top, width } = element.getBoundingClientRect();
    return [Math.round(left), Math.round(top), Math.round(width), getComputedStyle(element).backgroundColor];
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await entry.click();
  await expect(registration.getByRole('heading', { name: 'Dodaj pacjenta', exact: true })).toBeVisible();
  await expect(dob).toBeVisible();
  await expect(surname).toBeFocused();
  await expect(form.getByRole('button', { name: 'Do bazy' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(4);
  const [identity, birth, contact, parents] = await geometry();
  expect(identity[0]).toBeLessThan(birth[0]);
  expect(identity[1]).toBe(birth[1]);
  expect(contact[1]).toBe(parents[1]);
  expect([identity, birth, contact, parents].every(card => card[3] === 'rgb(255, 255, 255)')).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const boxes = await geometry();
    return boxes.length === 4 && boxes.every(([left, top, width], index) =>
      left === boxes[0][0] && width === boxes[0][2] && (index === 0 || top > boxes[index - 1][1]));
  }).toBe(true);
  await form.getByRole('button', { name: 'Anuluj' }).press('Enter');
  await expect(form).toHaveCount(0);
  await expect(entry).toBeFocused();

  await entry.click();
  await expect(form).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(form).toHaveCount(0);
  await expect(entry).toBeFocused();
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(before);

  await entry.click();
  const external = form.getByRole('button', { name: 'Spoza bazy' });
  await external.press('Space');
  await expect(external).toHaveAttribute('aria-pressed', 'true');
  await expect(cards).toHaveCount(3);
  await expect(dob).toBeHidden();
  await surname.fill('Fikcyjna Zewnętrzna');
  const year = form.getByLabel(/Rok urodzenia/);
  await year.fill('2015');
  await year.press('Enter');
  await expect(form).toHaveCount(0);
  await expect.poll(() => frame.evaluate(async () => (await window.VildaVault.listExternalPatients())
    .some(record => record.header.lastName === 'Fikcyjna Zewnętrzna'))).toBe(true);
  await expect(entry).toBeVisible();

  await entry.click();
  const original = patients.a.user;
  await surname.fill(original.lastName);
  await firstName.fill(original.firstName);
  await dob.fill(original.dobISO.split('-').reverse().join('-'));
  await dob.press('Enter');
  const duplicate = frame.getByRole('dialog', { name: 'Ten pacjent może już być w bazie', exact: true });
  await expect(duplicate).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(duplicate).toBeHidden();
  await expect(save).toBeFocused();

  await surname.fill('Fikcyjna Kartoteka');
  await firstName.fill('Maria');
  await dob.fill('22-05-2016');
  await dob.press('Enter');
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText('Maria');
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible();
  expect(await frame.evaluate(async () => (await window.VildaVault.listPatients()).length)).toBe(before + 1);
});
