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
      Boolean(window.ClcrUiModel) &&
      document.documentElement.classList.contains('clcr-workflow-ready')
  );
  await expect(page.locator('#formulaSearch')).toBeVisible();

  const consentDecline = page.locator('#consent-decline');
  if (await consentDecline.isVisible().catch(() => false)) {
    await consentDecline.click();
  }
}

async function selectFromSearch(page, query, formulaId) {
  await page.locator('#formulaSearch').fill(query);
  const result = page.locator(
    `#formulaLive .clcr-search-result[data-formula-id="${formulaId}"]`
  );
  await expect(result).toBeVisible();
  await result.click();
  await page.waitForFunction(
    expectedId =>
      window.ClcrUiWorkflow?.state?.activeFormulaId === expectedId &&
      document.getElementById('formulaPicker')?.value === expectedId,
    formulaId
  );
}

test('globalna wyszukiwarka ACR otwiera osobną ścieżkę próbki moczu', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'ACR', 'ACR');

  expect(
    await page.evaluate(() => ({
      level: window.ClcrUiWorkflow.state.level,
      version: window.currentVersion,
    }))
  ).toEqual({ level: 'spot', version: 'spot' });
  await expect(page.locator('#version-spot')).toHaveClass(/selected/);
  await expect(page.locator('#U_Alb')).toBeVisible();
  await expect(page.locator('#U_Prot_spot')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toBeVisible();
  await expect(
    page.locator('.clcr-field[data-clcr-field-id="U_Alb"]')
  ).toHaveAttribute('data-clcr-status', 'required');
  await expect(
    page.locator('.clcr-field[data-clcr-field-id="U_Prot_spot"]')
  ).toHaveAttribute('data-clcr-status', 'optional');
  await expect(page.locator('#ui_spotSameSpecimen_answer')).toBeVisible();
  await expect(page.locator('#spotSampleKind')).toBeVisible();
  await expect(page.locator('#U_ACR')).toBeHidden();
  await expect(page.locator('#U_PCR')).toBeHidden();
  await expect(page.locator('#clcrReadiness')).toContainText(
    'Do obliczenia'
  );
});

test('wyszukiwarka rozpoznaje zwarty alias tmpgfr', async ({ page }) => {
  await openCalculator(page);
  await selectFromSearch(page, 'tmpgfr', 'TMP_GFR');

  await expect(page.locator('#version-spot')).toHaveClass(/selected/);
  await expect(page.locator('#U_PO4_spot')).toBeVisible();
  await expect(page.locator('#S_PO4_spot')).toBeVisible();
  await expect(page.locator('#tmpOvernightFasting')).toBeVisible();
});

test('czynniki zakłócające i trójstan ograniczają tylko interpretację aktywnej formuły', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'ACR', 'ACR');
  await page.locator('#U_Alb').fill('42');
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#ui_spotSameSpecimen_answer').selectOption('yes');
  await page.locator('#spotSampleKind').selectOption('firstMorning');
  await page.locator('#age').fill('10');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#sex').selectOption('F');
  await page
    .locator('details.clcr-context-details:has(#spotMenstruation) summary')
    .click();
  await page.locator('#spotMenstruation').check();

  await expect.poll(async () =>
    page.evaluate(() => window.getClcrFormulaReadiness('ACR'))
  ).toMatchObject({
    valueReady: true,
    interpretationReady: false,
    limitations: [expect.stringMatching(/Miesiączka/i)],
  });

  await selectFromSearch(page, 'FEHCO3', 'FEHCO3_spot');
  await page.locator('#U_HCO3_spot').fill('20');
  await page.locator('#S_HCO3_spot').fill('24');
  await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Scr_spot').fill('1');
  await page.locator('#ui_spotPairedChemistry_answer').selectOption('yes');
  await page.locator('#spotSampleKind').selectOption('firstMorning');

  const interpretationAnswer = page.locator(
    '#ui_spotBicarbonateLoad_answer'
  );
  await expect(interpretationAnswer).toBeVisible();
  await expect.poll(async () =>
    page.evaluate(() => window.getClcrFormulaReadiness('FEHCO3_spot'))
  ).toMatchObject({
    valueReady: true,
    interpretationReady: false,
    interpretationMissingFieldIds: expect.arrayContaining([
      'spotBicarbonateLoad',
    ]),
  });

  await interpretationAnswer.selectOption('yes');
  await expect.poll(async () =>
    page.evaluate(() => window.getClcrFormulaReadiness('FEHCO3_spot'))
  ).toMatchObject({
    valueReady: true,
    interpretationReady: true,
    interpretationMissingFieldIds: [],
    limitations: [],
  });
});

test('wyszukanie KT/V otwiera formularz PRO bez widocznego przełącznika', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'KT/V', 'KTV');

  expect(
    await page.evaluate(() => ({
      level: window.ClcrUiWorkflow.state.level,
      version: window.currentVersion,
    }))
  ).toEqual({ level: 'pro', version: 'pro' });
  await expect(page.locator('#version-pro')).toHaveClass(/selected/);
  await expect(page.locator('#ktvCard')).toBeVisible();
  await expect(page.locator('#ktvFields')).toBeVisible();
  await expect(page.locator('#ktvModality')).toBeVisible();
  await expect(page.locator('#UreaPre')).toBeVisible();
  await expect(page.locator('#UreaPost')).toBeVisible();
  await expect(page.locator('#ktvToggle')).toBeHidden();
  for (const fieldId of [
    'ktvSameSession',
    'ktvPreBeforeDialysis',
    'ktvPreNoDilution',
  ]) {
    await expect(page.locator(`#ui_${fieldId}_answer`)).toBeVisible();
  }
  await expect(
    page.locator('[data-clcr-field-id="ktvPostMethod"]')
  ).toHaveAttribute('data-clcr-status', 'required');
  await expect(page.locator('#clcrReadiness')).toContainText(
    'Próbki przed i po pochodzą z tej samej sesji'
  );
});

test('DZM grupuje 6 warunków zbiórki i pozwala potwierdzić je jednym kliknięciem', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'wydalanie sodu', 'Na_mmol_d');

  await expect(page.locator('#collectionStartAt')).toBeVisible();
  await expect(page.locator('#collectionEndAt')).toBeVisible();
  const qualityGroup = page.locator('#clcrDzmQualityGroup');
  const details = qualityGroup.locator('details');
  const confirmAll = qualityGroup.locator('.clcr-dzm-quality__confirm');
  await expect(qualityGroup).toBeVisible();
  await expect(qualityGroup).toContainText(
    'Jakość zbiórki moczu'
  );
  await expect(qualityGroup).toContainText('0/6 potwierdzono');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(confirmAll).toHaveText(
    'Tak — wszystkie warunki spełniono'
  );
  for (const fieldId of [
    'collectionStartVoidDiscarded',
    'collectionFinalVoidIncluded',
    'collectionNoMissedVoids',
    'collectionNoSpillage',
    'collectionNoExtraVoids',
    'collectionStorageFollowed',
  ]) {
    await expect(page.locator(`#ui_${fieldId}_answer`)).toBeHidden();
  }
  await expect(page.locator('#clcrReadiness')).toContainText(
    'Jakość czasowej lub dobowej zbiórki moczu'
  );
  await expect(page.locator('#clcrReadiness')).not.toContainText(
    'Początkową mikcję odrzucono'
  );
  await confirmAll.click();
  await expect(qualityGroup).toContainText('6/6 potwierdzono');
  await expect(confirmAll).not.toHaveAttribute('aria-pressed', /.*/);
  for (const fieldId of [
    'collectionStartVoidDiscarded',
    'collectionFinalVoidIncluded',
    'collectionNoMissedVoids',
    'collectionNoSpillage',
    'collectionNoExtraVoids',
    'collectionStorageFollowed',
  ]) {
    await expect(page.locator(`#${fieldId}`)).toBeChecked();
  }
  await expect(page.locator('#clcrReadiness')).toContainText(
    'Początek zbiórki'
  );
  await expect(
    page.locator('[data-clcr-field-id="collectionStartAt"]')
  ).toHaveAttribute('data-clcr-status', 'required');

  await qualityGroup.locator('summary').click();
  const firstAnswer = page.locator(
    '#ui_collectionStartVoidDiscarded_answer'
  );
  await firstAnswer.selectOption('no');
  await expect(qualityGroup).toContainText('5 Tak · 1 Nie');
  await expect(confirmAll).toHaveText(
    'Przejdź do odpowiedzi wymagającej zmiany'
  );
  await expect(confirmAll).toBeEnabled();
  await expect(page.locator('#collectionStartVoidDiscarded')).not.toBeChecked();
  await expect(page.locator('#clcrReadiness')).toContainText(
    'co najmniej jeden warunek nie został spełniony'
  );

  await firstAnswer.selectOption('yes');
  await expect(qualityGroup).toContainText('6/6 potwierdzono');
  await expect(page.locator('#collectionStartVoidDiscarded')).toBeChecked();
});

test('pojedyncza widoczna kolumna DZM zajmuje całą szerokość przy 1600 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await openCalculator(page);
  await selectFromSearch(page, 'wydalanie sodu', 'Na_mmol_d');

  const columns = page.locator('#clcrForm > .param-row > .param-col');
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0)).toBeHidden();
  await expect(columns.nth(1)).toBeVisible();

  const desktopLayout = await page.evaluate(() => {
    const row = document.querySelector('#clcrForm > .param-row');
    const dzm = document.getElementById('dzmSet');
    const rowRect = row.getBoundingClientRect();
    const dzmRect = dzm.getBoundingClientRect();
    return {
      visibleColumns: row.dataset.clcrVisibleColumns,
      leftDifference: Math.abs(rowRect.left - dzmRect.left),
      widthDifference: Math.abs(rowRect.width - dzmRect.width),
    };
  });
  expect(desktopLayout.visibleColumns).toBe('1');
  expect(desktopLayout.leftDifference).toBeLessThanOrEqual(1);
  expect(desktopLayout.widthDifference).toBeLessThanOrEqual(2);
});

test('DZM inicjalizuje pełną szerokość bez przewijania przy 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await openCalculator(page);
  await selectFromSearch(page, 'wydalanie sodu', 'Na_mmol_d');

  const columns = page.locator('#clcrForm > .param-row > .param-col');
  await expect(columns.nth(0)).toBeHidden();
  await expect(columns.nth(1)).toBeVisible();
  const mobileLayout = await page.evaluate(() => {
    const row = document.querySelector('#clcrForm > .param-row');
    const dzm = document.getElementById('dzmSet');
    const rowRect = row.getBoundingClientRect();
    const dzmRect = dzm.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      leftDifference: Math.abs(rowRect.left - dzmRect.left),
      widthDifference: Math.abs(rowRect.width - dzmRect.width),
    };
  });
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(
    mobileLayout.clientWidth + 1
  );
  expect(mobileLayout.leftDifference).toBeLessThanOrEqual(1);
  expect(mobileLayout.widthDifference).toBeLessThanOrEqual(2);
});

test('po restore zmiana odpowiedzi DZM nie wraca do starego vaultu', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'wydalanie sodu', 'Na_mmol_d');
  await page.waitForFunction(
    () => typeof window.applyClcrSessionSnapshot === 'function'
  );

  const qualityIds = [
    'collectionStartVoidDiscarded',
    'collectionFinalVoidIncluded',
    'collectionNoMissedVoids',
    'collectionNoSpillage',
    'collectionNoExtraVoids',
    'collectionStorageFollowed',
  ];
  const applied = await page.evaluate(ids => {
    const inputs = {
      currentVersion: 'advanced',
      formulaPicker: 'Na_mmol_d',
      age: '10',
      ageMonths: '0',
      U_Na: '100',
      V24: '1000',
      collectionStartAt: '2026-07-27T08:00',
      collectionEndAt: '2026-07-28T08:00',
    };
    ids.forEach((id, index) => {
      const answer = index === 0 ? 'no' : index === 1 ? 'unknown' : 'yes';
      inputs[id] = answer === 'yes';
      inputs[`ui_${id}_answer`] = answer;
    });
    return window.applyClcrSessionSnapshot(
      {
        version: 2,
        currentVersion: 'advanced',
        selectedFormula: 'Na_mmol_d',
        preserveAcrossVersions: true,
        preservedInputs: { ...inputs },
        inputs,
      },
      {
        source: 'e2e-dzm-restore',
        update: true,
        dispatchEvents: false,
        preserveAcrossVersions: true,
      }
    );
  }, qualityIds);
  expect(applied).toBe(true);

  const qualityGroup = page.locator('#clcrDzmQualityGroup');
  await expect(qualityGroup).toContainText('4 Tak · 1 Nie · 1 Nie wiem');
  await expect(
    page.locator('#ui_collectionStartVoidDiscarded_answer')
  ).toHaveValue('no');
  await expect(
    page.locator('#ui_collectionFinalVoidIncluded_answer')
  ).toHaveValue('unknown');

  await page
    .locator('#ui_collectionStartVoidDiscarded_answer')
    .selectOption('yes');
  await page
    .locator('#ui_collectionFinalVoidIncluded_answer')
    .selectOption('yes');
  await expect(qualityGroup).toContainText('6/6 potwierdzono');
  for (const fieldId of qualityIds) {
    await expect(page.locator(`#${fieldId}`)).toBeChecked();
    await expect(page.locator(`#ui_${fieldId}_answer`)).toHaveValue('yes');
  }
  await expect.poll(async () =>
    page.evaluate(() => window.getClcrFormulaReadiness('Na_mmol_d'))
  ).toMatchObject({
    valueReady: true,
    missingFieldIds: [],
    hasBlockedProtocol: false,
  });

  await page.evaluate(() => window.ClcrUiWorkflow.refresh());
  await expect(qualityGroup).toContainText('6/6 potwierdzono');
  for (const fieldId of qualityIds) {
    await expect(page.locator(`#${fieldId}`)).toBeChecked();
    await expect(page.locator(`#ui_${fieldId}_answer`)).toHaveValue('yes');
  }
});

test('CKD-EPI pokazuje listę braków, a błąd ukrytego pola spot nie bramkuje wyniku', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'CKD-EPI eGFRcr', 'egfr');

  const readiness = page.locator('#clcrReadiness');
  await expect(readiness).toContainText('Do obliczenia');
  await expect(readiness.locator('.clcr-missing-link')).toHaveCount(3);
  await expect(readiness).toContainText('Wiek');
  await expect(readiness).toContainText('Płeć');
  await expect(readiness).toContainText('Kreatynina');

  await page.evaluate(() => {
    const hiddenSpotField = document.getElementById('U_PO4_spot');
    hiddenSpotField.value = '999';
    hiddenSpotField.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#U_PO4_spot')).toHaveClass(/error/);
  expect(
    await page.evaluate(() =>
      window.ClcrUiWorkflow.hasBlockingValidationError()
    )
  ).toBe(false);
  await expect(readiness).not.toHaveClass(/clcr-readiness--error/);

  await page.locator('#height').fill('999');
  await expect(page.locator('#height')).toHaveClass(/error/);
  expect(
    await page.evaluate(() =>
      window.ClcrUiWorkflow.hasBlockingValidationError()
    )
  ).toBe(false);

  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#Scr').fill('1');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');
  await page.locator('#creatinineState').selectOption('stable');

  await expect(page.locator('#clcrInfo')).toContainText('2021 CKD');
  await expect(readiness).not.toContainText(
    'Popraw nieprawidłowe wartości w aktywnym obliczeniu'
  );
});

test('odpowiedź dyskwalifikująca wzór daje blocker zamiast fałszywej gotowości', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'noworodek', 'neonatal_egfr');

  await page.locator('#age').fill('0');
  await page.locator('#ageMonths').fill('0');
  await page.locator('#ageDays').fill('14');
  await page.locator('#neonatalTermStatus').selectOption('preterm');
  await page.locator('#weight').fill('3.4');
  await page.locator('#height').fill('50');
  await page.locator('#Scr').fill('0.5');
  await page.locator('#ScrAssay').selectOption('enzymatic_idms');

  const readiness = page.locator('#clcrReadiness');
  await expect(readiness).toHaveClass(/clcr-readiness--error/);
  await expect(readiness).toContainText('wcześniaków');
  await expect(readiness).not.toContainText('Komplet danych');
  expect(
    await page.evaluate(() =>
      window.getClcrFormulaReadiness('neonatal_egfr')
    )
  ).toMatchObject({
    status: 'blocked',
    valueReady: false,
  });
});

test('profil kamicy pokazuje tylko pola wybranej formuły', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'szczawiany DZM', 'Ox_mgkg');

  await expect(page.locator('#U_Ox')).toBeVisible();
  await expect(page.locator('#oxalateReportingEntity')).toBeVisible();
  await expect(page.locator('#U_Ca')).toBeHidden();
  await expect(page.locator('#U_Cit')).toBeHidden();
  await expect(page.locator('#pH24')).toBeHidden();
});

test('Ca/Cit ma minimalny formularz i renderuje rzeczywisty wynik', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'Ca/Cit', 'Ca_Cit');

  await expect(page.locator('#U_Ca')).toBeVisible();
  await expect(page.locator('#U_Cit')).toBeVisible();
  await expect(page.locator('#V24')).toBeHidden();
  await expect(page.locator('#collectionStartAt')).toBeHidden();
  await page.locator('#U_Ca').fill('2');
  await page.locator('#U_Cit').fill('40');
  await expect(page.locator('#elecInfo')).toContainText('Wapń/cytryniany');
});

test('każdy widoczny przycisk Info ma dostępny i niepusty opis', async ({
  page,
}) => {
  await openCalculator(page);
  await selectFromSearch(page, 'TmP/GFR', 'TMP_GFR');

  const infoButtons = page.locator(
    '.clcr-field:not([hidden]) .clcr-info-button'
  );
  const count = await infoButtons.count();
  expect(count).toBeGreaterThanOrEqual(10);

  for (let index = 0; index < count; index += 1) {
    const button = infoButtons.nth(index);
    const controls = await button.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const help = page.locator(`#${controls}`);
    await expect(help).toBeVisible();
    await expect(help).not.toHaveAttribute(
      'data-clcr-help-source',
      'generated'
    );
    const text = (await help.textContent())?.trim() || '';
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/Brak opisu/i);
  }
});

test('widok 320 px nie przewija się poziomo i zachowuje mobilne wyszukiwanie', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await openCalculator(page);

  await page.locator('#formulaSearch').fill('ACR');
  const result = page.locator(
    '#formulaLive .clcr-search-result[data-formula-id="ACR"]'
  );
  await expect(result).toBeVisible();

  const searchGeometry = await result.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(searchGeometry.left).toBeGreaterThanOrEqual(0);
  expect(searchGeometry.right).toBeLessThanOrEqual(
    searchGeometry.viewportWidth + 1
  );

  await result.click();
  await page.waitForFunction(
    () => window.ClcrUiWorkflow?.state?.activeFormulaId === 'ACR'
  );
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    workflowWidth:
      document.getElementById('clcrWorkflow')?.getBoundingClientRect().width ||
      0,
    viewportWidth: window.innerWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.workflowWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  await expect(page.locator('#U_Alb')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toBeVisible();
});
