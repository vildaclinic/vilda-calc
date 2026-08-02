import { expect, test } from '@playwright/test';

async function openCalculator(page) {
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort()
  );
  await page.goto('/kalkulator-klirens.html', {
    waitUntil: 'domcontentloaded',
  });
  const guestButton = page.getByRole('button', {
    name: 'Korzystaj bez logowania',
    exact: true,
  });
  await guestButton.waitFor({ state: 'visible' });
  await guestButton.evaluate(button => button.click());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked')
  );
  await page.waitForFunction(
    () =>
      Boolean(window.ClcrUiWorkflow) &&
      typeof window.applyClcrSessionSnapshot === 'function' &&
      document.documentElement.classList.contains('clcr-workflow-ready')
  );
}

async function selectFormula(page, formulaId) {
  await page.evaluate(id => {
    window.ClcrUiWorkflow.selectFormula(id);
  }, formulaId);
  await page.waitForFunction(
    id =>
      window.ClcrUiWorkflow?.state?.activeFormulaId === id &&
      document.getElementById('formulaPicker')?.value === id,
    formulaId
  );
}

async function applySnapshot(page, snapshot) {
  const applied = await page.evaluate(value => {
    return window.applyClcrSessionSnapshot(value, {
      source: 'e2e-delayed-restore',
      update: true,
      dispatchEvents: false,
      preserveAcrossVersions: true,
    });
  }, snapshot);
  expect(applied).toBe(true);
}

test('opóźnione odtworzenie eGFR → ACR synchronizuje aktywną ścieżkę i pola', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFormula(page, 'egfr');

  // Oba opóźnione odświeżenia inicjalizacyjne workflow (50 i 900 ms)
  // muszą zakończyć się przed odtworzeniem sesji.
  await page.waitForTimeout(1050);
  await applySnapshot(page, {
    version: 2,
    currentVersion: 'spot',
    selectedFormula: 'ACR',
    inputs: {
      currentVersion: 'spot',
      formulaPicker: 'ACR',
      U_Alb: '42',
      Ucr_spot: '100',
      Ucr_spot_unit: 'mg/dl',
      spotSampleKind: 'firstMorning',
      spotSameSpecimen: false,
      ui_spotSameSpecimen_answer: 'unknown',
    },
  });

  await expect.poll(async () =>
    page.evaluate(() => ({
      activeFormulaId: window.ClcrUiWorkflow.state.activeFormulaId,
      level: window.ClcrUiWorkflow.state.level,
      picker: document.getElementById('formulaPicker')?.value,
      version: window.currentVersion,
    }))
  ).toEqual({
    activeFormulaId: 'ACR',
    level: 'spot',
    picker: 'ACR',
    version: 'spot',
  });
  await expect(page.locator('#version-spot')).toHaveClass(/selected/);
  await expect(page.locator('#U_Alb')).toBeVisible();
  await expect(page.locator('#U_Alb')).toHaveValue('42');
  await expect(page.locator('#Ucr_spot')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toHaveValue('100');
  await expect(page.locator('#ui_spotSameSpecimen_answer')).toHaveValue(
    'unknown'
  );
  await expect(page.locator('#clcrReadiness')).toContainText(
    'wymaga potwierdzenia'
  );

  await applySnapshot(page, {
    version: 1,
    currentVersion: 'spot',
    selectedFormula: 'ACR',
    inputs: {
      currentVersion: 'spot',
      formulaPicker: 'ACR',
      U_Alb: '42',
      Ucr_spot: '100',
      Ucr_spot_unit: 'mg/dl',
      spotSampleKind: 'firstMorning',
      spotSameSpecimen: true,
    },
  });
  await expect(page.locator('#ui_spotSameSpecimen_answer')).toHaveValue('yes');
  await expect(page.locator('#Scr')).toBeHidden();
});

test('opóźnione odtworzenie ACR → KT/V synchronizuje PRO i protokół dializy', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFormula(page, 'ACR');
  await page.waitForTimeout(1050);

  await applySnapshot(page, {
    version: 2,
    currentVersion: 'pro',
    selectedFormula: 'KTV',
    inputs: {
      currentVersion: 'pro',
      formulaPicker: 'KTV',
      ktvModality: 'IHD',
      ktvSessionsPerWeek: '3',
      ktvPidiDays: '2',
      ktvDurationMinutes: '240',
      ktvUF: '2',
      ktvW: '70',
      ktvUreaAnalyte: 'urea',
      ktvUreaUnit: 'mg/dL',
      UreaPre: '120',
      UreaPost: '36',
      ktvPostMethod: 'slow_flow_100ml_15s',
      ktvSameSession: true,
      ktvPreBeforeDialysis: true,
      ktvPreNoDilution: true,
    },
  });

  await expect.poll(async () =>
    page.evaluate(() => ({
      activeFormulaId: window.ClcrUiWorkflow.state.activeFormulaId,
      level: window.ClcrUiWorkflow.state.level,
      picker: document.getElementById('formulaPicker')?.value,
      version: window.currentVersion,
    }))
  ).toEqual({
    activeFormulaId: 'KTV',
    level: 'pro',
    picker: 'KTV',
    version: 'pro',
  });
  await expect(page.locator('#version-pro')).toHaveClass(/selected/);
  await expect(page.locator('#ktvCard')).toBeVisible();
  await expect(page.locator('#ktvFields')).toBeVisible();
  await expect(page.locator('#ktvModality')).toHaveValue('IHD');
  await expect(page.locator('#UreaPre')).toHaveValue('120');
  await expect(page.locator('#UreaPost')).toHaveValue('36');
  await expect(page.locator('#ui_ktvSameSession_answer')).toHaveValue('yes');
  await expect(page.locator('#ui_ktvPreBeforeDialysis_answer')).toHaveValue(
    'yes'
  );
  await expect(page.locator('#ui_ktvPreNoDilution_answer')).toHaveValue('yes');
  await expect(page.locator('#U_Alb')).toBeHidden();
});
