import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { przejdz, ramka } from '../support/powloka-przewiniecie.mjs';

// LAB-PAKIETY PR7 w powłoce app.html — tak lekarz wpisuje wyniki przyniesione na wizytę. Formularz główny
// prowadzi ocenę pokwitania DZISIEJSZEJ wizyty. Przy pobraniu sprzed kilku tygodni pakiet nie przypisuje jej
// dawnej próbce: pyta raz, czy stadium było takie samo, a potwierdzenie i ewentualna zmiana stadium są lokalne —
// ocena dzisiejszej wizyty w formularzu głównym zostaje nietknięta. Przy pobraniu dziś wraca wspólna ocena wizyty
// (lab-pakiet-pokwitanie-powloka.spec.mjs). Prawdziwy, fikcyjny sejf i pacjent wczytany zwykłą drogą;
// zegar stron 17.06.2026; dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

test('powłoka: stadium dzisiejszej wizyty przy dawnej próbce wymaga jednego potwierdzenia, a potwierdzenie i zmiana stadium nie ruszają oceny wizyty', async ({ page }) => {
  test.setTimeout(150000);
  // Fikcyjny chłopiec ur. 17.06.2013 (dziś 13 lat) wczytany do nowej wizyty; ocena G3 wpisana w formularzu głównym.
  const { frame: start, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(start, ids.a, 'new');
  await start.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await expect(start.locator('#sex')).toHaveValue('M');
  await start.locator('#tannerToggleBtn').click();
  await start.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await expect.poll(() => start.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.G?.stage)).toBe(3);
  await start.evaluate(() => { window.vildaPersistFlushNow?.({ force: true }); });
  await expect.poll(() => start.evaluate(() => window.VildaSession.getPatient()?.name)).toBe('Fikcyjny Antoni');
  const ocenaWizyty = () => start.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.G?.stage);

  await przejdz(page, 'lab');
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabConverterRuntime && window.VildaLabConverterRuntime.packagePuberty));
  await lab.locator('#labModePackage').click();
  await expect(lab.locator('#labPkgSelect')).toBeVisible();
  await lab.locator('#labPkgNew').click();
  await lab.locator('#labPkgCreatorName').fill('Dojrzewanie chłopców');
  await lab.locator('#labPkgCreatorSearch').fill('lh');
  await lab.locator('#labPkgCreatorOpt-lh').check();
  await lab.locator('#labPkgCreatorSearch').fill('testosteron');
  await lab.locator('#labPkgCreatorOpt-testosterone_total').check();
  await lab.locator('#labPkgCreatorSave').click();
  await expect(lab.locator('#labPkgCreator')).toBeHidden();
  await lab.locator('#labPkgValue-lh').fill('2,1');
  await lab.locator('#labPkgUnit-testosterone_total').selectOption('ng/dL');
  await lab.locator('#labPkgValue-testosterone_total').fill('120');
  const lh = lab.locator('.lab-pkg-card[data-analyte="lh"]');
  const stadiumLh = lh.locator('.vilda-lab-assessment [data-comparison="stage"] h4');

  // Pobranie dziś: wspólna ocena tej wizyty, bez pytania.
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G3');
  await expect(lab.locator('#labPkgStageEdit')).toHaveText('Edytuj ocenę w tej wizycie');
  await expect(lab.locator('#labPkgStageAsk')).toBeHidden();
  await expect(stadiumLh).toHaveText('Dla stadium G3');

  // Pobranie sprzed 28 dni: wiek z daty urodzenia na ten dzień (12 lat i 11 mies.) i jedno pytanie o stadium.
  await lab.locator('#labPkgDate').fill('2026-05-20');
  await expect(lab.locator('#labPkgDateNote')).toHaveText('Pobranie 28 dni temu. Aplikacja ocenia wyniki dla wieku w dniu pobrania: 12 lat i 11 mies. (dziś 13 lat).');
  await expect(lab.locator('#labPkgStageAskText')).toHaveText('Czy w dniu pobrania, 20.05.2026, stadium też było G3?');
  await expect(lab.locator('#labPkgStageLabel')).toHaveText('Pokwitanie — z karty pacjenta');
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G3');
  await expect(stadiumLh).toHaveCount(0);
  await expect(lh.locator('.lab-pkg-card-pending')).toContainText('Dla stadium G3 — po potwierdzeniu stadium w dniu pobrania');
  await expect(lab.locator('.lab-pkg-card[data-analyte="testosterone_total"] .lab-pkg-card-pending')).toContainText('Dla stadium G3');
  const przed = await lab.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.assess('lh', '2,1', 'IU/L'));
  expect(przed.evaluation.input).toMatchObject({ age: { years: 12, months: 11 }, puberty: { appliesToCurrentContext: false } });

  // „Tak, G3”: stadium obowiązuje dla dnia pobrania jako lokalne potwierdzenie; ocena wizyty zostaje bez zmian.
  await lab.locator('#labPkgStageYes').click();
  await expect(lab.locator('#labPkgStageChip')).toHaveText('potwierdzone dla 20.05.2026');
  await expect(stadiumLh).toHaveText('Dla stadium G3');
  await expect(lab.locator('.lab-pkg-card[data-analyte="testosterone_total"] .vilda-lab-assessment [data-comparison="stage"] h4')).toHaveText('Dla stadium G3');
  const po = await lab.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.assess('lh', '2,1', 'IU/L'));
  expect(po.evaluation.input).toMatchObject({ contextBasis: 'current-patient', sampleDateISO: null, age: { years: 12, months: 11 },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'lab-local' } });
  expect(await ocenaWizyty()).toBe(3);

  // Zmiana stadium przy dawnej próbce jest lokalna („Zmień ocenę”, nie „Edytuj ocenę w tej wizycie”).
  await expect(lab.locator('#labPkgStageEdit')).toHaveText('Zmień ocenę');
  await lab.locator('#labPkgStageEdit').click();
  await expect(lab.locator('#labPkgStageEditor .lab-puberty-hint')).toContainText('Korekta tylko dla tego sprawdzenia');
  await lab.locator('#labPkgStageEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="2"]').click();
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G2');
  await expect(lab.locator('#labPkgStageChip')).toHaveText('wpisane dla dnia pobrania');
  await expect(stadiumLh).toHaveText('Dla stadium G2');
  expect(await ocenaWizyty()).toBe(3);
  await lab.locator('#labPkgStageEdit').click();
  await expect(lab.locator('#labPkgStageEditor')).toBeHidden();

  // Pobranie dziś: wraca wspólna ocena tej wizyty — G3 z formularza głównego, bez pytania.
  await lab.locator('#labPkgDate').fill('2026-06-17');
  await expect(lab.locator('#labPkgStageAsk')).toBeHidden();
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G3');
  await expect(lab.locator('#labPkgStageEdit')).toHaveText('Edytuj ocenę w tej wizycie');
  await expect(lab.locator('#labPkgStageChip')).toBeHidden();
  await expect(stadiumLh).toHaveText('Dla stadium G3');
  expect(await ocenaWizyty()).toBe(3);
});
