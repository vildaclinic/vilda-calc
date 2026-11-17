import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15), wcześniej LAB-HISTORIA PR5b (decyzja 6.11): oczekujący wynik
// z Terminarza zamyka się tak jak „Wykonano” w Przypomnieniach. Ręcznego „Wpisz wynik” w edytorze karty już nie ma:
// wynik liczbowy idzie przez Jednostki lab. (oczekujacy-wynik.spec.mjs), a tu — „Opisz wynik”: wynik opisowy
// zapisany operacją sejfu saveReminderOutcome, tą samą co „Dodaj wynik do kartoteki” w Przypomnieniach.
// Prawdziwy sejf i karta pacjenta. Dane wyłącznie FIKCYJNE. Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const doPrzypomnienia = (page, noteId) => page.evaluate(async (id) => {
  const grupy = await window.VildaVault.listPatientNotesDueByDate();
  return (grupy || []).some((g) => (g.notes || []).some((n) => n && n.id === id));
}, noteId);
const zlecenie = (page, noteId) => page.evaluate((id) => window.VildaVault.getPatientNote(id), noteId);
const opisowe = (page, patientId, pomin) => page.evaluate(async ({ pid, pomin }) => {
  const notes = await window.VildaVault.listPatientNotesForPatient(pid);
  return notes.filter((n) => n.id !== pomin && n.category === 'wynik-badania' && n.labResult && n.labResult.value === 'Wynik opisowy — pełna treść w notatce')
    .map((n) => ({ id: n.id, title: n.title, body: n.body, test: n.labResult.test }));
}, { pid: patientId, pomin });

test('„Opisz wynik” zamyka oczekujący wynik i zdejmuje go z przypomnień; opis jest wynikiem opisowym w Badaniach', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(true);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);

  await badania.locator(`.vilda-lab-hist-pending-row[data-note-id="${ids.zlecenie}"]`).getByRole('button', { name: 'Opisz wynik' }).click();
  const okno = page.locator('#labPendingDescribeDialog');
  await expect(okno.locator('.vilda-lab-hist-describe-context')).toHaveText('Kontrola TSH · termin 16.06.26');
  await expect(okno.locator('#labPendingDescribeDate')).toHaveValue('2026-06-17');
  await okno.locator('#labPendingDescribeText').fill('Fikcyjny opis: wynik w normie laboratorium.');
  await okno.locator('#labPendingDescribeDate').fill('2026-06-16');
  await okno.getByRole('button', { name: 'Zapisz opis' }).click();
  await expect(okno).toHaveCount(0);

  const komunikat = badania.locator('.vilda-lab-hist-notice');
  await expect(komunikat).toHaveAttribute('role', 'status');
  await expect(komunikat.locator('.vilda-lab-hist-notice-text')).toHaveText('Opis zapisany — oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');
  await expect(komunikat.getByRole('button', { name: 'Cofnij' })).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-pending')).toHaveCount(0);

  const zamkniete = await zlecenie(page, ids.zlecenie);
  expect(zamkniete.completedAtISO).toBeTruthy();
  expect(zamkniete.noShowAtISO ?? null).toBeNull();
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(false);
  // Opis jest osobnym wpisem — wynikiem opisowym — a nie liczbą dopisaną do wpisu oczekującego.
  expect(zamkniete.labResult?.valueNum ?? null).toBeNull();
  const wyniki = await opisowe(page, patientId, ids.zlecenie);
  expect(wyniki).toHaveLength(1);
  expect(wyniki[0].body).toContain('Otrzymano: 16.06.2026');
  expect(wyniki[0].body).toContain('Fikcyjny opis: wynik w normie laboratorium.');
  await expect(badania.locator(`[data-note-id="${wyniki[0].id}"]`).first()).toBeVisible();
});

test('zamknięcie okna opisu bez zapisu nie zamyka oczekującego wyniku', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await badania.locator(`.vilda-lab-hist-pending-row[data-note-id="${ids.zlecenie}"]`).getByRole('button', { name: 'Opisz wynik' }).click();
  const okno = page.locator('#labPendingDescribeDialog');
  await okno.locator('#labPendingDescribeText').fill('Fikcyjny opis, porzucony.');
  await page.keyboard.press('Escape');
  await expect(okno).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-pending-title')).toHaveText('Kontrola TSH · termin 16.06.26');
  await expect(badania.locator('.vilda-lab-hist-notice')).toHaveCount(0);
  expect((await zlecenie(page, ids.zlecenie)).completedAtISO ?? null).toBeNull();
  expect(await doPrzypomnienia(page, ids.zlecenie)).toBe(true);
  expect(await opisowe(page, patientId, ids.zlecenie)).toHaveLength(0);
});
