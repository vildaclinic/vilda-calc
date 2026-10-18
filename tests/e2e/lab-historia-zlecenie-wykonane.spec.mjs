import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR5b (decyzja 6.11): „Wpisz wynik” przy zleceniu z Terminarza zapisuje wynik w edytorze karty
// i zamyka zlecenie tak jak „Wykonano” w Przypomnieniach; „Cofnij” przywraca je do przypomnień.
// Prawdziwy sejf, karta pacjenta i edytor. Dane wyłącznie FIKCYJNE. Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const doPrzypomnienia = (page, noteId) => page.evaluate(async (id) => {
  const grupy = await window.VildaVault.listPatientNotesDueByDate();
  return (grupy || []).some((g) => (g.notes || []).some((n) => n && n.id === id));
}, noteId);
const zlecenie = (page, noteId) => page.evaluate((id) => window.VildaVault.getPatientNote(id), noteId);

test('wpisany wynik zamyka zlecenie i zdejmuje je z przypomnień; „Cofnij” je przywraca, wynik zostaje w serii', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(true);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);

  await badania.getByRole('button', { name: 'Wpisz wynik' }).click();
  await page.locator('.b3-clinical-date').fill('2026-06-16');
  await page.locator('.b3-lab-value-row input').first().fill('0,4');
  await page.getByRole('dialog', { name: /Edytuj notatkę/ }).getByRole('button', { name: 'Zapisz zmiany' }).click();

  const komunikat = badania.locator('.vilda-lab-hist-notice');
  await expect(komunikat).toHaveAttribute('role', 'status');
  await expect(komunikat.locator('.vilda-lab-hist-notice-text')).toHaveText('Wynik zapisany — zlecenie „Kontrola TSH” oznaczone jako wykonane w Przypomnieniach.');
  await expect(badania.locator('.vilda-lab-hist-pending')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-value')).toHaveText('0,4');
  const zamkniete = await zlecenie(page, ids.zlecenie);
  expect(zamkniete.completedAtISO).toBeTruthy();
  expect(zamkniete.noShowAtISO ?? null).toBeNull();
  expect(zamkniete.labResult).toMatchObject({ testKey: 'tsh', valueNum: 0.4 });
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(false);

  await komunikat.getByRole('button', { name: 'Cofnij' }).click();
  await expect(komunikat.locator('.vilda-lab-hist-notice-text')).toHaveText('Cofnięto — zlecenie „Kontrola TSH” znów jest w Przypomnieniach.');
  await expect(komunikat.getByRole('button', { name: 'Cofnij' })).toHaveCount(0);
  const przywrocone = await zlecenie(page, ids.zlecenie);
  expect(przywrocone.completedAtISO ?? null).toBeNull();
  expect(przywrocone.labResult).toMatchObject({ valueNum: 0.4 });
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(true);
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-value')).toHaveText('0,4');
});

test('zamknięcie edytora bez wpisania wyniku nie zamyka zlecenia', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await badania.getByRole('button', { name: 'Wpisz wynik' }).click();
  await expect(page.locator('.b3-template-select')).toHaveValue('lab');
  await page.keyboard.press('Escape');
  await expect(page.locator('.b3-template-select')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-pending-title')).toHaveText('Kontrola TSH · termin 16.06.26');
  await expect(badania.locator('.vilda-lab-hist-notice')).toHaveCount(0);
  expect((await zlecenie(page, ids.zlecenie)).completedAtISO ?? null).toBeNull();
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(true);
});
