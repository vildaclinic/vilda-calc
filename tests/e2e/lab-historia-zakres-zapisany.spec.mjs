import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzPrzelicznik, pasekHistorii, sekcjaBadan } from '../support/lab-historia-dane.mjs';

// Decyzja 6.3 (LAB-HISTORIA): przypięcie w prawdziwym przeliczniku zapisuje z wynikiem zakres, którego przelicznik
// użył (selectRange + evaluate dla fikcyjnej dziewczynki 12 l 3 mies. z formularza), a pasek i zakładka „Badania”
// pokazują go z zapisu. Starsze wpisy z fikcyjnej historii (tests/support/lab-historia-dane.mjs) zostają bez oceny
// z zakresu. Dane wyłącznie FIKCYJNE. Zegar stron: 17.06.2026.
test.use({ serviceWorkers: 'block' });

const bezTwardejSpacji = (s) => String(s).replace(/\u00a0/g, ' ');
const tekst = async (locator) => bezTwardejSpacji(await locator.innerText()).replace(/\s+/g, ' ').trim();

test('przypięcie TSH zapisuje zakres przelicznika; pasek i zakładka „Badania” pokazują go z zapisu', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('5,1');
  await expect(page.locator('#labResultStatus')).toContainText('powyżej normy');

  await page.locator('#labPinResultBtn').click();
  const zakres = page.locator('#labPinRange');
  expect(await tekst(zakres)).toBe('Zapisze się z wynikiem: powyżej zakresu 0,5–4,3 mIU/L Młodzież 11–19 lat · dobrano dla: dziewczynka, 12 l 3 m · Mayo Test 8939 — TSH');
  const nota = page.locator('#labPinRangeDateNote');
  await page.locator('#labPinDate').fill('2026-06-17');
  await expect(nota).toBeHidden();
  await page.locator('#labPinDate').fill('2026-06-10');
  await expect(nota).toBeVisible();
  await expect(nota).toContainText('Zakres dobrano do danych pacjenta widocznych teraz w przeliczniku. Badanie było w innym dniu');
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  // Zapis w sejfie: kopia zakresu z wiązaniem do pól wyniku i daty badania.
  const zapis = await page.evaluate(async (pid) => {
    const notes = await window.VildaVault.listPatientNotesForPatient(pid);
    return notes.find((n) => n.labResult && n.labResult.testKey === 'tsh' && n.clinicalDateISO === '2026-06-17').labResult;
  }, patientId);
  expect(zapis).toMatchObject({ testKey: 'tsh', valueNum: 5.1, unit: 'mIU/L',
    range: { status: 'recorded', classification: 'above', analyte: 'tsh',
      context: { sex: 'F', ageYears: 12.25, lifeStage: 'pediatric', localOverride: false },
      range: { id: 'tsh_11_19y', low: 0.5, high: 4.3, unit: 'mIU/L', context: 'Młodzież 11–19 lat', sourceIds: ['mayo_test_tsh'] },
      binding: { testKey: 'tsh', valueNum: 5.1, unit: 'mIU/L', clinicalDateISO: '2026-06-17' } } });

  // Pasek: nowy chip ze strzałką z zapisu, szczegóły z granicami i źródłem.
  const pasek = pasekHistorii(page);
  const chip = pasek.locator('button.lab-strip-chip[data-note-id]').last();
  await expect(chip.locator('.lab-strip-chip-v')).toHaveText('5,1↑');
  await chip.click();
  expect(await tekst(pasek.locator('.lab-strip-detail-range'))).toBe('zakres zapisany z wynikiem: 0,5–4,3 mIU/L · powyżej · Młodzież 11–19 lat · dziewczynka, 12 l 3 m · Mayo Test 8939 — TSH');

  // Zwarta tabela pokazuje granice i kolor; pełny zachowany kontekst jest w szczegółach wpisu.
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  const row = badania.locator('.vilda-lab-hist-result-row[data-series="tsh"]').first();
  await expect(row.locator('.vilda-lab-hist-flag')).toHaveText('↑');
  await expect(row.locator('.vilda-lab-hist-cell-value.tone-above')).toHaveText('5,1');
  expect(await tekst(row.locator('.vilda-lab-hist-result-norm'))).toContain('0,5–4,3 mIU/L');
  await row.click();
  const details = badania.locator('.vilda-lab-hist-result-details');
  await details.locator('.vilda-lab-hist-result-sources > summary').click();
  expect(await tekst(details.locator('.vilda-lab-hist-status.is-range .vilda-lab-hist-status-text'))).toBe('↑ powyżej zapisanego zakresu · 0,5–4,3 mIU/L');
  await expect(details.locator('.vilda-lab-hist-status.is-range .vilda-lab-hist-status-context')).toHaveText('Młodzież 11–19 lat · dziewczynka, 12 l 3 m · Mayo Test 8939 — TSH');

  // Telefon: norma w zwiniętym wierszu mieści się bez poziomego przewijania.
  await details.locator('.vilda-lab-hist-details-close').click();
  const rozmiar = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const norm = row.locator('.vilda-lab-hist-result-norm');
  await expect(norm).toBeVisible();
  const [boxN, boxR] = [await norm.boundingBox(), await row.boundingBox()];
  expect(boxN.x).toBeGreaterThanOrEqual(boxR.x);
  expect(boxN.x + boxN.width).toBeLessThanOrEqual(boxR.x + boxR.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize(rozmiar);

  // Edytor: sam komentarz zachowuje zakres; zmiana wartości unieważnia dawną ocenę.
  const zakresWpisu = () => page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
    .find((n) => n.labResult && n.labResult.testKey === 'tsh' && n.clinicalDateISO === '2026-06-17').labResult.range, patientId);
  const edytor = page.getByRole('dialog', { name: /Edytuj notatkę/ });
  await row.click();
  await details.getByRole('button', { name: 'Edytuj wpis', exact: true }).click();
  await edytor.locator('textarea').first().fill('= 5,1 mIU/L\nkontrola po zmianie dawki');
  await edytor.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(edytor).toHaveCount(0);
  expect((await zakresWpisu()).status).toBe('recorded');
  await expect(row.locator('.vilda-lab-hist-flag')).toHaveText('↑');
  await row.click();
  await details.getByRole('button', { name: 'Edytuj wpis', exact: true }).click();
  await page.locator('.b3-lab-value-row input').first().fill('4,0');
  await edytor.getByRole('button', { name: 'Zapisz zmiany' }).click();
  await expect(edytor).toHaveCount(0);
  expect(await zakresWpisu()).toMatchObject({ status: 'invalidated', reasonCodes: ['result_or_clinical_date_changed'] });
  await expect(row.locator('.vilda-lab-hist-cell-value.tone-neutral')).toHaveText('4');
  await expect(row.locator('.vilda-lab-hist-flag')).toHaveCount(0);
  await expect(row.locator('.vilda-lab-hist-result-norm')).toHaveText('—');
  await row.click();
  await details.locator('.vilda-lab-hist-result-sources > summary').click();
  await expect(details.locator('.vilda-lab-hist-status.is-range-invalidated .vilda-lab-hist-status-text')).toHaveText('zakres nieaktualny · zmieniono wynik lub datę badania');

});

// Decyzja 6.30 (wariant 3): prolaktyna u fikcyjnej dziewczynki 12 l 3 m — przelicznik nie ma wiersza dla wieku i używa
// wiersza domyślnego „Dorośli, zakres ogólny”. Zapis niesie zakres i kategorię jak dotąd; historia pokazuje je bez strzałki.
test('prolaktyna u dziecka z zakresem ogólnym: okno i historia bez oceny, zapis bez zmian', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { badanie: 'prolactin', szukaj: 'Prolaktyna', wartosc: '' });
  await page.locator('#labUnit').selectOption('ng/mL');
  await page.locator('#labValue').fill('35');
  // Decyzja 6.31: przelicznik na żywo też bez kategorii — ta sama informacja co okno i historia.
  await expect(page.locator('#labResultStatus .lab-range-status.is-general')).toHaveText('zakres ogólny — bez oceny dla dziecka');
  await expect(page.locator('#labRangeBlock .lab-range-scale')).toHaveCount(0);
  await page.locator('#labPinResultBtn').click();
  expect(await tekst(page.locator('#labPinRange'))).toBe('Zapisze się z wynikiem: zakres ogólny 2–29 ng/mL — bez oceny dla dziecka Dorośli, zakres ogólny · bez zakresu dla: dziewczynka, 12 l 3 m · Mayo Test 85670 — Prolaktyna');
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  const zapis = await page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
    .find((n) => n.labResult && n.labResult.testKey === 'prolactin').labResult, patientId);
  expect(zapis).toMatchObject({ valueNum: 35, unit: 'ng/mL', range: { status: 'recorded', classification: 'above',
    context: { sex: 'F', ageYears: 12.25, lifeStage: 'pediatric' },
    range: { id: 'prl_default', low: 2, high: 29, context: 'Dorośli, zakres ogólny', matched: false, isDefault: true } } });

  const pasek = pasekHistorii(page);
  const chip = pasek.locator('button.lab-strip-chip[data-note-id]').last();
  await expect(chip.locator('.lab-strip-chip-v')).toHaveText('35');
  await chip.click();
  expect(await tekst(pasek.locator('.lab-strip-detail-range'))).toBe('zakres zapisany z wynikiem: 2–29 ng/mL · zakres ogólny — bez oceny dla dziecka · Dorośli, zakres ogólny · dziewczynka, 12 l 3 m · Mayo Test 85670 — Prolaktyna');

  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  const row = badania.locator('.vilda-lab-hist-result-row[data-series="prolactin"]').first();
  await expect(row.locator('.vilda-lab-hist-cell-value.tone-neutral')).toHaveText('35');
  await expect(row.locator('.vilda-lab-hist-result-norm')).toContainText('2–29');
  await expect(row.locator('.vilda-lab-hist-flag')).toHaveCount(0);
  await row.click();
  const details = badania.locator('.vilda-lab-hist-result-details');
  await details.locator('.vilda-lab-hist-result-sources > summary').click();
  await expect(details.locator('.vilda-lab-hist-status.is-range-general.tone-muted .vilda-lab-hist-status-context')).toHaveText('Dorośli, zakres ogólny · dziewczynka, 12 l 3 m · Mayo Test 85670 — Prolaktyna');
  expect(await tekst(details.locator('.vilda-lab-hist-status.is-range-general .vilda-lab-hist-status-text'))).toBe('zakres ogólny — bez oceny dla dziecka · 2–29 ng/mL');
  await details.locator('.vilda-lab-hist-details-close').click();

  const rozmiar = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  const norm = row.locator('.vilda-lab-hist-result-norm');
  await expect(norm).toBeVisible();
  const [boxN, boxR] = [await norm.boundingBox(), await row.boundingBox()];
  expect(boxN.x + boxN.width).toBeLessThanOrEqual(boxR.x + boxR.width + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize(rozmiar);

});

test('badanie bez zakresu w przeliczniku i LH z własną oceną: przypięcie bez pola zakresu', async ({ page }) => {
  const { patientId } = await otworzPrzelicznik(page, { badanie: 'vit_d3', szukaj: 'cholekalcyferol', wartosc: '' });
  await page.locator('#labValue').fill('40');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinSave')).toBeVisible();
  await expect(page.locator('#labPinRange')).toHaveCount(0);
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="lh"]').click();
  await page.locator('#labValue').fill('2,4');
  await page.locator('#labPinResultBtn').click();
  await expect(page.locator('#labPinAssessment')).toBeVisible();
  await expect(page.locator('#labPinRange')).toHaveCount(0);
  await page.locator('#labPinDate').fill('2026-06-17');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);

  const dzis = await page.evaluate(async (pid) => (await window.VildaVault.listPatientNotesForPatient(pid))
    .filter((n) => n.labResult && n.clinicalDateISO === '2026-06-17').map((n) => n.labResult), patientId);
  const witD = dzis.find((lab) => lab.testKey === 'vit_d3'), lh = dzis.find((lab) => lab.testKey === 'lh');
  expect(witD).toMatchObject({ valueNum: 40 });
  expect(witD).not.toHaveProperty('range');
  expect(lh).toHaveProperty('assessment');
  expect(lh).not.toHaveProperty('range');
});
