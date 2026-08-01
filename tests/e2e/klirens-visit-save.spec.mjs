import { expect, test } from '@playwright/test';

// Faza 1 — pełny łańcuch: tagi silnika → ClcrVisitSave.collect → VildaVault.savePatientNote.
// Sejf syntetyczny tworzony w kontenerze (nie dotyka danych użytkownika);
// niskie KDF_ITERATIONS dla szybkości.

async function openCalculatorGuest(page) {
  await page.addInitScript(() => {
    window.__CLCR_TEST_LEGACY_BROAD = true;
  });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: 'Korzystaj bez logowania', exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(
    () =>
      typeof window.clcrUpdate === 'function' &&
      Boolean(window.ClcrClinicalSafety) &&
      typeof window.applyVersion === 'function' &&
      Boolean(window.VildaVault) &&
      Boolean(window.ClcrVisitSave),
  );
  await page.evaluate(() => window.applyVersion('basic'));
}

async function setupVaultPatient(page) {
  return page.evaluate(async () => {
    const V = window.VildaVault;
    const user = await V.createUser('Haslo-Testowe-123', { iterations: 1, label: 'E2E' });
    await V.unlockUser(user.userId, 'Haslo-Testowe-123');
    const saved = await V.savePatient({ name: 'Pacjent Testowy' });
    const patientId = saved.patientId || saved.id || (saved.patient && saved.patient.patientId);
    document.dispatchEvent(
      new CustomEvent('vilda:patient-loaded', { detail: { patientId } }),
    );
    return { patientId, unlocked: V.isUnlocked() };
  });
}

test('zapisuje wynik eGFR jako notatkę wynik-klirens w karcie pacjenta', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);
  expect(setup.unlocked).toBe(true);
  expect(typeof setup.patientId).toBe('string');
  expect(setup.patientId.length).toBeGreaterThan(0);

  // dorosły → eGFR (2021 CKD-EPI)
  await page.locator('#age').fill('50');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('80');
  await page.locator('#height').fill('180');
  await page.locator('#Scr').fill('1.0');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());

  // tag silnika obecny
  await expect(page.locator('#clcrInfo [data-clcr-series="egfr"]')).toHaveCount(1);

  // karta zapisu widoczna i aktywna (sejf + pacjent)
  const card = page.locator('#clcrVisitSaveCard');
  await expect(card).toBeVisible();
  const btn = page.locator('#clcrVisitSaveBtn');
  await expect(btn).toBeEnabled();

  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await btn.click();

  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', {
    timeout: 15000,
  });

  // odczyt z sejfu — notatki wynik-klirens
  const notes = await page.evaluate(async (pid) => {
    const list = await window.VildaVault.listPatientNotesForPatient(pid);
    return list
      .filter((n) => n.category === 'wynik-klirens')
      .map((n) => ({
        category: n.category,
        clinicalDateISO: n.clinicalDateISO,
        title: n.title,
        body: n.body,
        labResult: n.labResult,
      }));
  }, setup.patientId);

  expect(notes.length).toBeGreaterThan(0);
  const egfr = notes.find(
    (n) => n.labResult && n.labResult.test === 'eGFR — dorośli (kreatynina)',
  );
  expect(egfr, 'notatka eGFR istnieje').toBeTruthy();
  expect(egfr.clinicalDateISO).toContain('2026-08-01');
  expect(egfr.labResult.unit).toBe('mL/min/1,73 m²');
  expect(egfr.labResult.valueNum).toBeGreaterThan(85);
  expect(egfr.labResult.valueNum).toBeLessThan(100);
  // OBEJŚCIE §2: testKey wędruje do treści notatki
  expect(egfr.body).toContain('clcr:egfr');
});

test('gość bez pacjenta — karta zapisu nieaktywna z podpowiedzią', async ({ page }) => {
  await openCalculatorGuest(page);
  // liczymy bez sejfu/pacjenta
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('80');
  await page.locator('#height').fill('180');
  await page.locator('#Scr').fill('1.0');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());

  const card = page.locator('#clcrVisitSaveCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await expect(page.locator('#clcrVisitHint')).toContainText('Zaloguj się');
});
