import { expect, test } from '@playwright/test';
import { readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { choosePatient, prepareGabinet } from '../support/gabinet-patient-fixture.mjs';

test.use({ reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(180_000);

const codes = ['Q90.9', 'J45.9', 'I10', 'J06.9', 'E66.9', 'E11.9', 'R62.8', 'Z00.0'];
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const start = frame => frame.locator('#vhomeGabinetStart');
const entry = (frame, name) => start(frame).locator(`[data-entry="${name}"]`);
const star = (dialog, code) => dialog.locator(`[data-icd10-favorite-code="${code}"]`);
const option = (dialog, code) => dialog.locator(`[data-icd10-code="${code}"]`);

async function openPicker(frame, launcher) {
  await launcher.click();
  const dialog = frame.getByRole('dialog', { name: 'Wybierz rozpoznanie', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectFavorites(dialog, expected) {
  await expect(dialog.getByRole('heading', { name: 'Ulubione', exact: true })).toBeVisible();
  await expect(dialog.locator('[data-icd10-favorite-code]')).toHaveCount(expected.length);
  for (const code of expected) await expect(star(dialog, code)).toHaveAttribute('aria-pressed', 'true');
}

async function expectFit(dialog, viewportWidth) {
  await expect.poll(() => dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectRapidChart(frame, population, bmiCentile) {
  await expect.poll(() => frame.evaluate(() => window.VildaDsSource.populacja())).toBe(population);
  const reference = frame.locator('.vhome-reference');
  if (population === 'DS') {
    await expect(reference.locator('.vhome-reference-effective')).toBeVisible();
    await expect(reference.locator('.vhome-reference-effective')).toContainText('Zemel 2015');
  } else {
    await expect(reference.locator('.vhome-reference-select')).toBeVisible();
    await expect(reference.locator('.vhome-reference-select')).toHaveValue('OLAF');
  }
  await expect(frame.locator('#bmiResult')).toContainText(new RegExp(bmiCentile + '\\s+centyl', 'u'));
}

async function withDiscardConfirmation(page, action) {
  const discard = prompt => prompt.accept();
  page.on('dialog', discard);
  try {
    await action();
  } finally {
    page.off('dialog', discard);
  }
}

test('ICD-10 favorites are shared across the three Gabinet entries independently of the diagnosis', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const { frame, ids } = await prepareGabinet(page);
  const patientRecords = () => frame.evaluate(async patientId => ({
    visits: await window.VildaVault.getPatientVisits(patientId),
    notes: await window.VildaVault.listPatientNotesForPatient(patientId),
  }), ids.a);
  const archived = await patientRecords();
  const rapid = frame.locator('#vhomeVisitFields .vpt-optional-diagnosis');
  const register = frame.locator('#vhomeGabinetRegistration');
  const card = frame.locator('#vhomePatientOverview');
  const editor = frame.locator('#vhomePatientTreatmentDialog');
  const launch = 'Wybierz z ICD-10';
  const applyLabel = 'Dodaj do formularza';

  await test.step('Favorite stars start empty and neither search nor starring changes the rapid visit', async () => {
    await entry(frame, 'rapid').click();
    for (const [field, value] of Object.entries({ firstName: 'Marek', lastName: 'Fikcyjny ICD', age: '10', ageMonths: '0', height: '135', weight: '45' })) {
      await frame.locator(`#${field}`).fill(value);
    }
    await frame.locator('#sex').selectOption('M');
    await expectRapidChart(frame, 'OGOLNA', 96);

    const dialog = await openPicker(frame, button(rapid, launch));
    const search = dialog.getByLabel('Kod ICD-10 lub nazwa', { exact: true });
    const apply = button(dialog, applyLabel);
    await expectFavorites(dialog, []);
    await expect(dialog.getByText(/Brak ulubionych rozpoznań/u)).toBeVisible();
    await expect(dialog.locator('[data-icd10-code]')).toHaveCount(0);
    await expectFit(dialog, 320);

    await search.fill('zespół Downa');
    await expect(dialog.getByRole('heading', { name: 'Wyniki wyszukiwania', exact: true })).toBeVisible();
    await expect(option(dialog, 'Q90.9')).toBeVisible();
    await expect(star(dialog, 'Q90.9')).toHaveAttribute('aria-pressed', 'false');
    await star(dialog, 'Q90.9').press('Space');
    await expect(star(dialog, 'Q90.9')).toHaveAttribute('aria-pressed', 'true');
    await expect(star(dialog, 'Q90.9')).toBeFocused();
    await expect(star(dialog, 'Q90.9')).toHaveCSS('color', 'rgb(0, 131, 141)');
    await expect(apply).toBeDisabled();
    await expectRapidChart(frame, 'OGOLNA', 96);

    for (const code of codes.slice(1)) {
      await search.fill(code);
      await star(dialog, code).click();
      await expect(star(dialog, code)).toHaveAttribute('aria-pressed', 'true');
    }
    await button(dialog, 'Pokaż ulubione').click();
    await expectFavorites(dialog, codes);
    await expectFit(dialog, 320);
    await expect(apply).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button(rapid, launch)).toBeFocused();
  });

  await test.step('Choosing a favorite applies a draft only after confirmation and clearing it keeps the favorite', async () => {
    const dialog = await openPicker(frame, button(rapid, launch));
    await option(dialog, 'Q90.9').click();
    await expectRapidChart(frame, 'OGOLNA', 96);
    await button(dialog, applyLabel).click();
    await expect(dialog).toBeHidden();
    await expect(rapid).toContainText('Q90.9');
    await expectRapidChart(frame, 'DS', 94);

    await openPicker(frame, button(rapid, 'Zmień rozpoznanie'));
    await button(dialog, 'Usuń wybór').click();
    await expect(dialog).toBeHidden();
    await expectRapidChart(frame, 'OGOLNA', 96);
    await openPicker(frame, button(rapid, launch));
    await expectFavorites(dialog, codes);
    await button(dialog, 'Anuluj').click();
    await withDiscardConfirmation(page, () => button(frame.locator('#gbEntryHeader'), 'Ekran startowy').click());
    await expect(entry(frame, 'new')).toBeVisible();
  });

  await test.step('Registration reads the same account list and changing a star survives cancelling the selector', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entry(frame, 'new').click();
    const dialog = await openPicker(frame, button(register, launch));
    await expectFavorites(dialog, codes);
    await expectFit(dialog, 390);
    await star(dialog, 'J45.9').click();
    await expect(star(dialog, 'J45.9')).toHaveCount(0);
    await expect(button(dialog, applyLabel)).toBeDisabled();
    await button(dialog, 'Anuluj').click();
    await expect(button(register, launch)).toBeFocused();
    await button(register, 'Anuluj').click();
  });

  const remaining = codes.filter(code => code !== 'J45.9');
  await test.step('Leczenie reflects the list without changing saved records and lets a favorite fill the native draft', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await choosePatient(frame, 'Antoni');
    await card.getByRole('tab', { name: 'Leczenie', exact: true }).click();
    await card.locator('[data-treatment-action="new-diagnosis"]').click();
    const dialog = await openPicker(frame, button(editor, launch));
    await expectFavorites(dialog, remaining);
    await expectFit(dialog, 1440);
    const diagnosisName = editor.getByLabel('Nazwa rozpoznania', { exact: true });
    await star(dialog, 'Q90.9').click();
    await expect(star(dialog, 'Q90.9')).toHaveCount(0);
    await expect(button(dialog, applyLabel)).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(editor).toBeVisible();
    await expect(button(editor, launch)).toBeFocused();
    await expect(diagnosisName).toHaveValue('');
    await expect(editor.locator('[data-treatment-growth-reference-preview]')).toBeHidden();
    expect(await patientRecords()).toEqual(archived);

    await openPicker(frame, button(editor, launch));
    await expectFavorites(dialog, remaining.filter(code => code !== 'Q90.9'));
    await option(dialog, 'I10').click();
    await button(dialog, applyLabel).click();
    await expect(dialog).toBeHidden();
    await expect(diagnosisName).not.toHaveValue('');
    expect(await patientRecords()).toEqual(archived);
    await withDiscardConfirmation(page, () => button(editor, 'Anuluj').click());
    await expect(editor).toBeHidden();
  });

  await test.step('A new native page load retains the edited account favorites', async () => {
    await page.reload({ waitUntil: 'load' });
    const reloaded = await shellFrame(page);
    await readyForPatient(reloaded);
    await entry(reloaded, 'new').click();
    const dialog = await openPicker(reloaded, button(reloaded.locator('#vhomeGabinetRegistration'), launch));
    await expectFavorites(dialog, remaining.filter(code => code !== 'Q90.9'));
  });
});
