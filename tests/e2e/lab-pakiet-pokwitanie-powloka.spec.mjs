import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { przejdz, ramka } from '../support/powloka-przewiniecie.mjs';

// LAB-PAKIETY PR6 w powłoce app.html — tak lekarz otwiera „Jednostki lab.” na co dzień. Formularz główny
// prowadzi ocenę pokwitania bieżącej wizyty; pakiet badań bierze ją bez pytania o stadium, a „Edytuj ocenę
// w tej wizycie” zmienia tę jedną, wspólną ocenę — dokładnie tak, jak robi to pojedyncze badanie
// (lab-puberty-shared-assessment.spec.mjs: „the shell edits one live visit from lab”).
// Prawdziwy, fikcyjny sejf i pacjent wczytany zwykłą drogą (karta pacjenta → „Wczytaj tego pacjenta” → nowa
// wizyta); dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

test('powłoka: pakiet bierze ocenę pokwitania bieżącej wizyty z formularza głównego i edytuje ją wspólnie, jak pojedyncze badanie', async ({ page }) => {
  test.setTimeout(150000);
  // Fikcyjny chłopiec 13 lat wczytany do nowej wizyty; ocena G3 wpisana w formularzu głównym.
  const { frame: start, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(start, ids.a, 'new');
  await start.waitForFunction(() => window.VildaPubertyAssessmentState && window.VildaPubertyAssessmentUI);
  await expect(start.locator('#sex')).toHaveValue('M');
  await start.locator('#tannerToggleBtn').click();
  await start.locator('#pubertyAssessmentEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="3"]').click();
  await expect.poll(() => start.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.G?.stage)).toBe(3);
  await start.evaluate(() => { window.vildaPersistFlushNow?.({ force: true }); });
  await expect.poll(() => start.evaluate(() => window.VildaSession.getPatient()?.name)).toBe('Fikcyjny Antoni');

  await przejdz(page, 'lab');
  const lab = await ramka(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => Boolean(window.VildaLabPubertyRuntime && window.VildaLabConverterRuntime && window.VildaLabConverterRuntime.packagePuberty));
  await lab.locator('#labModePackage').click();
  await expect(lab.locator('#labPkgSelect')).toBeVisible();
  // Własny pakiet: LH i testosteron całkowity.
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

  // Stadium z formularza głównego, bez pytania; edycja dotyczy wspólnej oceny tej wizyty.
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G3');
  await expect(lab.locator('#labPkgStageEdit')).toHaveText('Edytuj ocenę w tej wizycie');
  const lh = lab.locator('.lab-pkg-card[data-analyte="lh"]');
  await expect(lh.locator('.vilda-lab-assessment [data-comparison="stage"] h4')).toHaveText('Dla stadium G3');
  await expect(lab.locator('.lab-pkg-card[data-analyte="testosterone_total"] .vilda-lab-assessment [data-comparison="stage"] h4')).toHaveText('Dla stadium G3');
  const ocena = await lab.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.assess('lh', '2,1', 'IU/L'));
  expect(ocena.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3, appliesToCurrentContext: true });
  expect(ocena.evaluation.input.puberty.source).not.toBe('lab-local');

  await lab.locator('#labPkgStageEdit').click();
  await expect(lab.locator('#labPkgStageEditor .lab-puberty-hint')).toContainText('Wspólna ocena tej wizyty');
  await lab.locator('#labPkgStageEditor .vpa-segments [data-puberty-axis="G"][data-puberty-stage="4"]').click();
  await expect(lab.locator('#labPkgStageSummary')).toHaveText('G4');
  await expect(lh.locator('.vilda-lab-assessment [data-comparison="stage"] h4')).toHaveText('Dla stadium G4');
  // Ta sama ocena jest w formularzu głównym i w pojedynczym badaniu; wpisane wyniki pakietu zostają.
  await expect.poll(() => start.evaluate(() => window.VildaPubertyAssessmentState.read().assessment.observations.G?.stage)).toBe(4);
  await expect(lab.locator('#labPkgValue-lh')).toHaveValue('2,1');
  const pakiet = await lab.evaluate(() => window.VildaLabConverterRuntime.packagePuberty.assess('lh', '2,1', 'IU/L'));
  expect(pakiet.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 4, appliesToCurrentContext: true });
  await lab.locator('#labModeSingle').click();
  await lab.locator('#labSubstance').fill('LH');
  await lab.locator('#labSubstanceDropdown .lab-substance-option[data-id="lh"]').click();
  await lab.locator('#labUnit').selectOption('IU/L');
  await lab.locator('#labValue').fill('2,1');
  await expect(lab.locator('#labPubertyStageSummary')).toContainText('G4');
  const pojedyncza = await lab.evaluate(() => window.VildaLabPubertyRuntime.getAssessment());
  expect(pakiet.evaluation).toEqual(pojedyncza.evaluation);
});
