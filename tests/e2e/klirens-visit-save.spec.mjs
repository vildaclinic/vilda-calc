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

async function readClinicalNotes(page, patientId) {
  return page.evaluate(async (pid) => {
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
  }, patientId);
}

test('zapisuje TYLKO wybraną formułę (eGFR dorośli) — bez Cockcrofta obok', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);
  expect(setup.unlocked).toBe(true);
  expect(setup.patientId.length).toBeGreaterThan(0);

  // ręczny wybór formuły (jak w produkcji) → activeFormulaId = egfr
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(60);
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('80');
  await page.locator('#height').fill('180');
  await page.locator('#Scr').fill('1.0');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());

  await expect(page.locator('[data-clcr-series="egfr"]')).toHaveCount(1);
  const btn = page.locator('#clcrVisitSaveBtn');
  await expect(page.locator('#clcrVisitSaveCard')).toBeVisible();
  await expect(btn).toBeEnabled();
  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await btn.click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const notes = await readClinicalNotes(page, setup.patientId);
  const labels = notes.map((n) => n.labResult && n.labResult.test);
  expect(labels).toContain('eGFR — dorośli (kreatynina)');
  // wybrano tylko eGFR — Cockcroft nie może się zapisać
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (ml/min)');
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (1,73 m²)');

  const egfr = notes.find((n) => n.labResult.test === 'eGFR — dorośli (kreatynina)');
  expect(egfr.clinicalDateISO).toContain('2026-08-01');
  expect(egfr.labResult.unit).toBe('mL/min/1,73 m²');
  expect(egfr.labResult.valueNum).toBeGreaterThan(85);
  expect(egfr.labResult.valueNum).toBeLessThan(100);
  expect(egfr.body).toContain('clcr:egfr');
});

test('CKiD U25 u 20-latka — zapisuje tylko wybraną formułę, wyklucza panel porównawczy', async ({ page }) => {
  await openCalculatorGuest(page);
  const setup = await setupVaultPatient(page);

  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await page.waitForTimeout(60);
  await page.locator('#age').fill('20');
  await page.locator('#sex').selectOption('F');
  await page.locator('#weight').fill('60');
  await page.locator('#height').fill('165');
  await page.locator('#Scr').fill('0.9');
  await page.locator('#creatinineState').selectOption('stable');
  await page.evaluate(() => window.clcrUpdate());

  // silnik renderuje egfr/cg jako porównanie (otagowane), ale zapis ich pomija
  const visibleSeries = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-clcr-series]'))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => el.getAttribute('data-clcr-series')),
  );
  expect(visibleSeries).toContain('ckid_u25');
  expect(visibleSeries).toContain('egfr'); // panel porównawczy widoczny

  await page.locator('#clcrVisitDate').fill('2026-08-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const labels = (await readClinicalNotes(page, setup.patientId)).map(
    (n) => n.labResult && n.labResult.test,
  );
  expect(labels).toContain('eGFR — dzieci i młodzież 1–25 lat (kreatynina)');
  // porównawcze egfr/cg NIE mogą trafić do karty
  expect(labels).not.toContain('eGFR — dorośli (kreatynina)');
  expect(labels).not.toContain('Klirens kreatyniny — dorośli (ml/min)');
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

test('Faza 2: historia pokazuje datowane punkty, sparkline i trend kierunkowy', async ({ page }) => {
  await openCalculatorGuest(page);
  await setupVaultPatient(page);
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('egfr'));
  await page.waitForTimeout(60);

  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').fill('80');
  await page.locator('#height').fill('180');
  await page.locator('#creatinineState').selectOption('stable');

  // wizyta 1 (Scr 1.0 → wyższy eGFR)
  await page.locator('#Scr').fill('1.0');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-06-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  // wizyta 2 (Scr 1.4 → niższy eGFR)
  await page.locator('#Scr').fill('1.4');
  await page.evaluate(() => window.clcrUpdate());
  await page.locator('#clcrVisitDate').fill('2026-07-01');
  await page.locator('#clcrVisitSaveBtn').click();
  await expect(page.locator('#clcrVisitStatus')).toContainText('Zapisano', { timeout: 15000 });

  const hist = page.locator('#clcrHistoryCard');
  await expect(hist).toBeVisible();
  await expect(hist).toContainText('Historia — eGFR — dorośli (kreatynina)');
  await expect(hist.locator('.cvs-hist-points li')).toHaveCount(2);
  await expect(hist.locator('.cvs-spark')).toHaveCount(1);
  await expect(hist).toContainText('vs. poprzednio');
  // punkty datowane
  await expect(hist).toContainText('2026-06-01');
  await expect(hist).toContainText('2026-07-01');
});
