import { expect, test } from '../support/test-czas.mjs';
import { otworzSejf, sekcjaBadan, czekajNaBadania } from '../support/lab-historia-dane.mjs';
import { czekajNaHistorie, sekcjaHistorii } from '../support/karta-czekanie.mjs';

// P-WYNIKI-BADAN (decyzja właściciela 2026-11-11, makieta https://claude.ai/artifact/YRYrYpHeZpy1EqT8ctwkDT):
// przypięty wynik badania ma jedno miejsce pełnej treści — zakładkę „Badania”. Notatki go nie pokazują (linia
// z liczbą wyników), Historia ma krótki wpis „Badanie” z wierszem na wynik, a klik w wiersz otwiera Badania
// ze szczegółami wyniku, gdzie są „Edytuj wpis” i „Usuń wpis”. Fikcyjny sejf; zegar stron 17.06.2026.
test.use({ serviceWorkers: 'block' });

const sekcjaNotatek = (page) => page.locator('.vilda-patient-tab-content[data-tab="notes"]');

// Wpisy o kształcie zapisu „Przypnij do wizyty” (lab_pin_result.js): tytuł z wartością, treść z przeliczeniem
// i komentarzem, wartość z równaniem, liczba, jednostka i klucz badania.
async function zapiszWyniki(page, patientId) {
  return page.evaluate(async (pid) => {
    const V = window.VildaVault;
    const pin = async (date, test, testKey, raw, valueNum, unit, converted, comment, extra = {}) => (await V.savePatientNote({
      patientId: pid, title: `${test}: ${raw} ${unit}`, body: `= ${converted}${comment ? `\n${comment}` : ''}`, category: 'wynik-badania',
      clinicalDateISO: date, labResult: { test, testKey, value: `${raw} ${unit} = ${converted}`, valueNum, unit }, ...extra,
    })).id;
    return {
      ft3: await pin('2026-06-02', 'fT3 (wolna trójjodotyronina)', 'ft3', '4,8', 4.8, 'pmol/L', '3,12 pg/mL', ''),
      tsh: await pin('2026-06-02', 'TSH (tyreotropina)', 'tsh', '2,1', 2.1, 'mIU/L', '2,1 μIU/mL', 'Fikcyjna kontrola po zmianie dawki'),
      ft4: await pin('2026-06-02', 'fT4 (wolna tyroksyna)', 'ft4', '15,1', 15.1, 'pmol/L', '1,17 ng/dL', ''),
      tshOld: await pin('2026-04-08', 'TSH (tyreotropina)', 'tsh', '0,12', 0.12, 'mIU/L', '0,12 μIU/mL', 'Fikcyjny starszy wynik TSH'),
      ft4Old: await pin('2026-04-08', 'fT4 (wolna tyroksyna)', 'ft4', '18,4', 18.4, 'pmol/L', '1,43 ng/dL', ''),
      obserwacja: (await V.savePatientNote({ patientId: pid, category: 'observation', title: 'Fikcyjna obserwacja tarczycy', body: 'Bez zmian.', clinicalDateISO: '2026-06-02' })).id,
      zlecenie: (await V.savePatientNote({ patientId: pid, category: 'wynik-badania', title: 'Wynik: TSH (tyreotropina)', body: 'Fikcyjne zlecenie kontroli', dueDateISO: '2026-09-02', recheckDays: 90 })).id,
    };
  }, patientId);
}

test('Notatki bez wyników badań: linia z liczbą wyników przełącza na Badania; zlecenie i obserwacja zostają', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszWyniki(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes' }), patientId);
  const notatki = sekcjaNotatek(page);
  await expect(notatki.locator('.vilda-patient-note-card').first()).toBeVisible();

  const link = notatki.getByRole('button', { name: 'Wyniki badań (5) są w zakładce Badania →' });
  await expect(link).toBeVisible();
  await expect(notatki.locator('.vilda-patient-note-card')).toHaveCount(2);
  await expect(notatki.locator(`.vilda-patient-note-card[data-note-id="${ids.obserwacja}"]`)).toBeVisible();
  await expect(notatki.locator(`.vilda-patient-note-card[data-note-id="${ids.zlecenie}"]`)).toBeVisible();
  for (const id of [ids.tsh, ids.ft4, ids.ft3, ids.tshOld, ids.ft4Old]) await expect(notatki.locator(`[data-note-id="${id}"]`)).toHaveCount(0);
  await expect(notatki).not.toContainText('= 2,1 μIU/mL');
  await expect(notatki.locator('.vilda-patient-notes-clinical-section .vilda-patient-notes-subheader')).toContainText('1');
  // Sejf, z którego czytają Badania i synchronizacja, ma nadal wszystkie wpisy.
  expect(await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid).then((list) => list.length), patientId)).toBe(7);

  await link.click();
  await czekajNaBadania(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-result-row')).toHaveCount(5);
});

test('Historia: krótki wpis z wierszem na wynik; klik otwiera Badania ze szczegółami; „Usuń wpis” usuwa wynik', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszWyniki(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'timeline' }), patientId);
  await czekajNaHistorie(page);
  const historia = sekcjaHistorii(page);

  const grupy = historia.locator('.vilda-wb-hist-results');
  await expect(grupy).toHaveCount(2);
  // Kolejność paneli Badań (TSH, fT4, fT3), a nie kolejność zapisu; wartość raz, bez linii przeliczenia.
  await expect(grupy.nth(0).locator('.vilda-wb-hist-name')).toHaveText(['TSH', 'fT4', 'fT3']);
  await expect(grupy.nth(0).locator('.vilda-wb-hist-value')).toHaveText(['2,1 mIU/L', '15,1 pmol/L', '4,8 pmol/L']);
  await expect(grupy.nth(0).locator('.vilda-wb-hist-comment')).toHaveText(['Fikcyjna kontrola po zmianie dawki']);
  await expect(grupy.nth(1).locator('.vilda-wb-hist-name')).toHaveText(['TSH', 'fT4']);
  await expect(historia.locator('.vilda-wb-hist-head').first()).toContainText('3 wyniki');
  await expect(historia.locator('.vilda-wb-hist-head').nth(1)).toContainText('2 wyniki');
  await expect(historia).not.toContainText('= 2,1 μIU/mL');
  await expect(historia).not.toContainText('TSH (tyreotropina): 2,1 mIU/L');
  await expect(historia).toContainText('Fikcyjna obserwacja tarczycy');
  // Filtr „Badanie” zostawia tylko krótkie wpisy wyników (zlecenie bez wartości to też „Badanie”).
  await historia.locator('.vilda-patient-timeline-filters button', { hasText: 'Badanie' }).click();
  await expect(historia.locator('.vilda-wb-hist-results')).toHaveCount(2);
  await expect(historia).not.toContainText('Fikcyjna obserwacja tarczycy');

  await historia.locator(`.vilda-wb-hist-result[data-note-id="${ids.ft4}"]`).click();
  await czekajNaBadania(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);
  const badania = sekcjaBadan(page);
  const szczegoly = badania.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.ft4}"]`);
  await expect(szczegoly).toBeVisible();
  await expect(szczegoly).toContainText('15,1');
  await expect(szczegoly.getByRole('button', { name: 'Edytuj wpis', exact: true })).toBeVisible();

  // „Usuń wpis”: to samo potwierdzenie co „Usuń” w Notatkach; po zgodzie wpis znika z sejfu i z widoku.
  let pytanie = '';
  page.once('dialog', (dialog) => { pytanie = dialog.message(); dialog.accept(); });
  await szczegoly.getByRole('button', { name: 'Usuń wpis', exact: true }).click();
  await expect(badania.locator(`.vilda-lab-hist-result-row[data-note-id="${ids.ft4}"]`)).toHaveCount(0);
  await expect(szczegoly).toHaveCount(0);
  expect(pytanie).toContain('fT4 (wolna tyroksyna): 15,1 pmol/L');
  expect(await page.evaluate((id) => window.VildaVault.getPatientNote(id).then((note) => note ? 'jest' : 'brak', () => 'brak'), ids.ft4)).toBe('brak');
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(4);

  // Odmowa w potwierdzeniu niczego nie usuwa.
  await badania.locator(`.vilda-lab-hist-result-row[data-note-id="${ids.tsh}"]`).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await badania.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.tsh}"]`).getByRole('button', { name: 'Usuń wpis', exact: true }).click();
  await expect(badania.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.tsh}"]`)).toBeVisible();
  await expect(badania.locator('.vilda-lab-hist-result-row')).toHaveCount(4);
});

test('link do wyniku z innego miejsca (focusNoteId) otwiera Badania, a link do zlecenia zostaje w Notatkach', async ({ page }) => {
  const patientId = await otworzSejf(page);
  const ids = await zapiszWyniki(page, patientId);
  await page.evaluate(({ pid, id }) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes', focusNoteId: id }), { pid: patientId, id: ids.tshOld });
  await czekajNaBadania(page);
  await expect(page.locator('.vilda-patient-tab[data-tab="lab"]')).toHaveClass(/vilda-patient-tab--active/);
  await expect(sekcjaBadan(page).locator(`.vilda-lab-hist-result-details[data-note-id="${ids.tshOld}"]`)).toContainText('Fikcyjny starszy wynik TSH');

  await page.evaluate(({ pid, id }) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes', focusNoteId: id }), { pid: patientId, id: ids.zlecenie });
  await expect(page.locator('.vilda-patient-tab[data-tab="notes"]')).toHaveClass(/vilda-patient-tab--active/);
  await expect(sekcjaNotatek(page).locator(`.vilda-patient-note-card[data-note-id="${ids.zlecenie}"]`)).toBeVisible();
});

test('wynik dodany w Notatkach: trwały komunikat, gdzie trafił, bez wiersza na liście', async ({ page }) => {
  const patientId = await otworzSejf(page);
  await page.evaluate(async (pid) => window.VildaVault.savePatientNote({ patientId: pid, category: 'observation', title: 'Fikcyjna obserwacja', body: 'Bez zmian.' }), patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'notes' }), patientId);
  const notatki = sekcjaNotatek(page);
  await expect(notatki.locator('.vilda-patient-note-card')).toHaveCount(1);
  await expect(notatki.locator('.vilda-wb-notes-link')).toHaveCount(0);

  await notatki.getByRole('button', { name: '+ Dodaj notatkę' }).click();
  const edytor = page.getByRole('dialog', { name: /Nowa notatka/ });
  await page.locator('.b3-template-select').selectOption('lab');
  await page.locator('.b3-lab-test').fill('TSH (tyreotropina)');
  await page.locator('.b3-lab-value-row input').first().fill('3,4');
  await edytor.getByRole('radio', { name: /Wpisz datę zdarzenia/ }).check();
  await page.locator('.b3-clinical-date').fill('2026-06-10');
  await edytor.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(page.locator('.b3-template-select')).toHaveCount(0);

  const status = notatki.locator('.vilda-wb-notes-status');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toContainText('Wynik TSH 3,4');
  await expect(status).toContainText('zapisany w zakładce Badania.');
  await expect(notatki.getByRole('button', { name: 'Wyniki badań (1) są w zakładce Badania →' })).toBeVisible();
  await expect(notatki.locator('.vilda-patient-note-card')).toHaveCount(1);
  await status.getByRole('button', { name: 'Otwórz Badania →' }).click();
  await czekajNaBadania(page);
  await expect(sekcjaBadan(page).locator('.vilda-lab-hist-result-row')).toHaveCount(1);
});

test('telefon 390 px: wiersze Historii co najmniej 44 px, akcje wyniku w Badaniach, bez poziomego przewijania', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const patientId = await otworzSejf(page);
  const ids = await zapiszWyniki(page, patientId);
  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'timeline' }), patientId);
  await czekajNaHistorie(page);
  const wiersze = sekcjaHistorii(page).locator('.vilda-wb-hist-result');
  await expect(wiersze).toHaveCount(5);
  for (const box of await wiersze.evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await sekcjaHistorii(page).locator(`.vilda-wb-hist-result[data-note-id="${ids.tsh}"]`).click();
  await czekajNaBadania(page);
  const szczegoly = sekcjaBadan(page).locator(`.vilda-lab-hist-result-details[data-note-id="${ids.tsh}"]`);
  await expect(szczegoly).toBeVisible();
  for (const name of ['Edytuj wpis', 'Usuń wpis']) {
    const height = await szczegoly.getByRole('button', { name, exact: true }).evaluate((button) => button.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await page.locator('.vilda-patient-tab[data-tab="notes"]').click();
  await expect(sekcjaNotatek(page).getByRole('button', { name: 'Wyniki badań (5) są w zakładce Badania →' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
