import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15) — strona karty pacjenta. „Opisz wynik” przy oczekującym wyniku
// zapisuje wynik opisowy (np. biopsja, USG) operacją sejfu saveReminderOutcome — tą samą co „Dodaj wynik do kartoteki”
// w Przypomnieniach — i nie wymaga wczytania pacjenta. Przy pacjencie niewczytanym „Wczytaj pacjenta i wpisz wynik →”
// wczytuje go drogą karty i otwiera Jednostki lab. z tym wpisem.
// Wyłącznie fikcyjny sejf w efemerycznym profilu Playwrighta; natywny zegar.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const TERMIN = '2026-12-01';
const sekcjaBadan = (owner) => owner.locator('.vilda-patient-lab-section');
const zalozOczekujacy = (owner, patientId, title) => owner.evaluate(async ({ patientId, title, termin }) => {
  const id = 'fikcyjny-oczekujacy-' + Math.random().toString(36).slice(2, 10);
  await window.VildaVault.savePatientNote({ id, patientId, title, body: '', category: 'wynik-badania', dueDateISO: termin });
  return id;
}, { patientId, title, termin: TERMIN });
const notatki = (owner, patientId) => owner.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId);
const dzis = (owner) => owner.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });

async function otworzKarte(page, owner, shell, patientId) {
  if (shell) await page.evaluate((pid) => window.VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' }), patientId);
  else {
    await owner.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, (record) => {
      if (record) window.applyLoadedData(record);
      window.VildaChrome?.refreshPatientChip?.();
    }, null, { activeTab: 'lab' }), patientId);
  }
  await expect(sekcjaBadan(owner).locator('.vilda-lab-hist-heading')).toBeVisible();
}

async function wybierzWizyte(owner, choice) {
  const okno = owner.locator('#vildaLoadChoiceModal');
  await expect(okno).toBeVisible();
  await owner.waitForFunction(() => !window.VildaDobAge?.restorePending?.());
  await owner.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await owner.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(okno).toHaveCount(0);
}

test('„Opisz wynik”: okno bez pól wartości i jednostki; zapis tworzy wynik opisowy w karcie i zamyka oczekujący wynik — bez wczytania pacjenta', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: false });
  // W formularzu jest pacjent A; karta dotyczy pacjentki B (niewczytanej).
  await loadPatient(page, fixture.ids.a, 'restore');
  const id = await zalozOczekujacy(page, fixture.ids.b, 'Wynik: Biopsja tarczycy (BACC)');
  await otworzKarte(page, page, false, fixture.ids.b);
  const badania = sekcjaBadan(page);
  const wiersz = badania.locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"]`);
  await expect(wiersz.locator('.vilda-lab-hist-pending-actions > *')).toHaveText(['Wczytaj pacjenta i wpisz wynik →', 'Opisz wynik']);

  await wiersz.getByRole('button', { name: 'Opisz wynik' }).click();
  const okno = page.locator('#labPendingDescribeDialog');
  await expect(okno).toBeVisible();
  await expect(okno.locator('#labPendingDescribeTitle')).toHaveText('Opisz wynik');
  await expect(okno.locator('.vilda-lab-hist-describe-context')).toHaveText('Wynik: Biopsja tarczycy (BACC) · termin 01.12.26');
  // Wynik liczbowy idzie przez Jednostki lab.: tu nie ma pola wartości ani jednostki.
  await expect(okno.locator('input:not([type="date"]), select')).toHaveCount(0);
  await expect(okno.locator('#labPendingDescribeDate')).toHaveValue(await dzis(page));

  // Bez opisu nic się nie zapisuje.
  await okno.getByRole('button', { name: 'Zapisz opis' }).click();
  await expect(okno.locator('.vilda-lab-hist-describe-error')).toHaveText('Wpisz opis otrzymanego wyniku.');
  expect((await page.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), id)).completedAtISO ?? null).toBeNull();

  await okno.locator('#labPendingDescribeText').fill('Fikcyjny opis: obraz łagodny, bez cech atypii.');
  await okno.getByRole('button', { name: 'Zapisz opis' }).click();
  await expect(okno).toHaveCount(0);

  const komunikat = badania.locator('.vilda-lab-hist-notice');
  await expect(komunikat).toHaveAttribute('role', 'status');
  await expect(komunikat.locator('.vilda-lab-hist-notice-text')).toHaveText('Opis zapisany — oczekujący wynik „Wynik: Biopsja tarczycy (BACC)” oznaczony jako wykonany.');
  await expect(badania.locator('.vilda-lab-hist-pending')).toHaveCount(0);

  // Sejf: wpis wykonany, a opis jest osobnym wynikiem opisowym (jak po „Dodaj wynik do kartoteki” w Przypomnieniach).
  const wszystkie = await notatki(page, fixture.ids.b);
  const zamkniety = wszystkie.find((n) => n.id === id);
  expect(zamkniety.completedAtISO).toBeTruthy();
  const opisowe = wszystkie.filter((n) => n.id !== id && n.category === 'wynik-badania' && n.labResult);
  expect(opisowe).toHaveLength(1);
  expect(opisowe[0].title).toBe('Wynik: Biopsja tarczycy (BACC)');
  expect(opisowe[0].labResult).toMatchObject({ test: 'Biopsja tarczycy (BACC)', value: 'Wynik opisowy — pełna treść w notatce' });
  expect(opisowe[0].labResult.valueNum ?? null).toBeNull();
  expect(opisowe[0].body).toContain('Fikcyjny opis: obraz łagodny, bez cech atypii.');
  // Wynik opisowy jest w Badaniach jako wiersz tekstowy.
  await expect(badania.locator(`[data-note-id="${opisowe[0].id}"]`).first()).toBeVisible();
  // Pacjent A w formularzu bez zmian: opis nie wczytuje pacjenta.
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
});

for (const shell of [true, false]) {
  test(`${shell ? 'powłoka' : 'samodzielnie'}: pacjent niewczytany → „Wczytaj pacjenta i wpisz wynik →” → wybór wizyty → Jednostki lab. z tym wpisem`, async ({ page }) => {
    const fixture = await createFictionalVault(page, { shell });
    const start = fixture.frame;
    await loadPatient(start, fixture.ids.a, 'restore');
    const id = await zalozOczekujacy(start, fixture.ids.b, 'Kontrola TSH');
    await otworzKarte(page, start, shell, fixture.ids.b);
    const wiersz = sekcjaBadan(start).locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"]`);
    // Przycisk, nie odnośnik: w ramce powłoki odnośnik przełączyłby trasę bez wczytania pacjenta.
    await expect(wiersz.locator('a')).toHaveCount(0);
    await wiersz.getByRole('button', { name: 'Wczytaj pacjenta i wpisz wynik →' }).click();
    await wybierzWizyte(start, 'new');

    await expect(page).toHaveURL(shell ? /\/app\.html#\/lab/ : /\/przelicznik-jednostek\.html\?oczekujacy=/, { timeout: 20_000 });
    const lab = shell ? await shellFrame(page, 'Jednostki laboratoryjne') : page;
    await lab.waitForLoadState('load');
    await expect(lab.locator('#labPendingStrip .lab-pending-title')).toHaveText('Oczekujący wynik: Kontrola TSH · termin 01.12.26', { timeout: 20_000 });
    await expect.poll(() => lab.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId')).catch(() => null)).toBe(fixture.ids.b);
    await expect(lab.locator('#labPatientText')).toContainText(/Kobieta · 12(\.\d)? lat/);
  });
}

test('powłoka: po zamknięciu oczekującego wyniku „Otwórz Badania →” pokazuje wynik z oceną i brak wpisu w oczekujących', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  const start = fixture.frame;
  await loadPatient(start, fixture.ids.b, 'restore');
  const id = await zalozOczekujacy(start, fixture.ids.b, 'Kontrola TSH');
  await otworzKarte(page, start, true, fixture.ids.b);
  await sekcjaBadan(start).locator(`.vilda-lab-hist-pending-row[data-note-id="${id}"] a.vilda-lab-hist-pending-enter`).click();
  await expect(page).toHaveURL(/\/app\.html#\/lab/);
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await expect(lab.locator('#labPendingStrip')).toBeVisible();
  await lab.locator('#labSubstance').fill('TSH');
  await lab.locator('#labSubstanceDropdown .lab-substance-option[data-id="tsh"]').click();
  await lab.locator('#labUnit').selectOption('mIU/L');
  await lab.locator('#labValue').fill('6,8');
  await lab.locator('#labPinResultBtn').click();
  await lab.locator('#labPinSave').click();
  const pasek = lab.locator('#labPendingStrip');
  await expect(pasek.locator('.lab-pending-text')).toHaveText('Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.');

  await pasek.getByRole('button', { name: 'Otwórz Badania →' }).click();
  await expect(page).toHaveURL(/\/app\.html#\/start/);
  const badania = sekcjaBadan(start);
  await expect(badania.locator('.vilda-lab-hist-heading')).toBeVisible();
  await expect(badania.locator('.vilda-lab-hist-pending')).toHaveCount(0);
  await expect(badania.locator('.vilda-lab-hist-result-row .vilda-lab-hist-cell-value').first()).toHaveText('6,8');
});
