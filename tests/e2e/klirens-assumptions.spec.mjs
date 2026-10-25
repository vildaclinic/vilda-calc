import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Dane wyłącznie syntetyczne, bez logowania lub odblokowania sejfu. Testy
// sprawdzają rzeczywisty formularz i silnik, bez instalowania DOM makiety.
const cysAssumptions = 'Założenia: stabilna czynność nerek, brak podejrzenia AKI oraz oznaczenie cystatyny C standaryzowane do IFCC.';

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort(),
  );
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => (
    !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.clcrUpdate === 'function' &&
    typeof window.applyClcrSessionSnapshot === 'function' &&
    typeof window.buildClcrSessionSnapshot === 'function' &&
    window.clcrIsResetting !== true
  ));
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible()) await decline.click();
}

async function selectFormula(page, id) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await expect.poll(() => page.evaluate(() => ({
    active: window.ClcrUiWorkflow.state.activeFormulaId,
    selected: document.getElementById('formulaPicker').value,
    resetting: window.clcrIsResetting === true,
  }))).toEqual({ active: id, selected: id, resetting: false });
}

async function openDetailsFor(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').evaluate(summary => summary.click());
    }
  }
}

async function fillField(page, selector, value) {
  await openDetailsFor(page, selector);
  await page.locator(selector).fill(value);
}

async function selectField(page, selector, value) {
  await openDetailsFor(page, selector);
  await page.locator(selector).selectOption(value);
}

async function fillCys(page, { age = '10', cystatin = '1.0' } = {}) {
  await selectFormula(page, 'ckid_u25_cys');
  await page.locator('#age').fill(age);
  await page.locator('#sex').selectOption('F');
  await page.locator('#CystatinC').fill(cystatin);
  await page.locator('#CystatinC').blur();
}

function card(page, formulaId) {
  return page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${formulaId}"]`);
}

async function expectOneCard(page, formulaId, displayValue, rawValue) {
  const result = card(page, formulaId);
  await expect(result).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(result.locator('.clcr-result-value')).toHaveText(displayValue);
  expect(Number(await result.getAttribute('data-clcr-value'))).toBeCloseTo(rawValue, 8);
  return result;
}

async function snapshotInputs(page) {
  return page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
}

async function expectUnknownSourceFacts(page) {
  expect(await snapshotInputs(page)).toMatchObject({
    CystatinCStandardization: '', CystatinCAssayMethod: '', ScrAssay: '',
    creatinineState: 'unknown', suspectedAKI: false, CrCysStandardizationConfirmed: false,
  });
}

async function visibleControls(page) {
  return page.evaluate(() => {
    const visible = element => {
      if (!element.getClientRects().length || element.closest('details:not([open])')) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    return [...document.querySelectorAll('#clcrForm input, #clcrForm select, #clcrForm textarea')]
      .filter(element => visible(element) && !element.matches('.clcr-canonical-picker,[type=hidden],[type=button],[type=submit],[type=reset],[type=file]'))
      .map(element => ({
        id: element.id, optional: Boolean(element.closest('details')),
        fontPx: parseFloat(getComputedStyle(element).fontSize),
        heightPx: element.getBoundingClientRect().height,
      }));
  });
}

async function restoreCys(page, inputs) {
  const applied = await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'pro', selectedFormula: 'ckid_u25_cys',
    inputs: {
      currentVersion: 'pro', formulaPicker: 'ckid_u25_cys',
      age: '10', ageMonths: '', sex: 'F', CystatinC: '1.0',
      Scr: '', ScrAssay: '', CystatinCStandardization: '', CystatinCAssayMethod: '',
      CrCysStandardizationConfirmed: false, creatinineState: 'unknown', suspectedAKI: false,
      ...values,
    },
  }, {
    source: 'e2e-calculation-assumptions', update: true,
    dispatchEvents: false, preserveAcrossVersions: true,
  }), inputs);
  expect(applied).toBe(true);
  await page.waitForFunction(() => (
    window.ClcrUiWorkflow.state.activeFormulaId === 'ckid_u25_cys' &&
    document.getElementById('formulaPicker').value === 'ckid_u25_cys' &&
    window.clcrIsResetting !== true
  ));
}

for (const width of [1440, 390]) {
  test(`U25cys ${width}px: trzy dane dają jeden wynik 79/G2 z jawnymi założeniami, bez dopisania faktów`, async ({ page }, testInfo) => {
    await openCalculator(page, width);
    await fillCys(page);
    const result = await expectOneCard(page, 'ckid_u25_cys', '79', 79.26461484738338);
    await expect(result).toHaveAttribute('data-clcr-category', 'G2');
    await expect(result).toHaveAttribute('data-clcr-tone', 'warning');
    await expect(result.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
    await expect(result.locator('.clcr-result-interpretation')).toHaveText('Łagodnie obniżony eGFR');
    await expect(result.locator('.clcr-result-reference-label')).toHaveText('Zakres G1 (KDIGO)');
    await expect(result.locator('.clcr-result-reference-value')).toHaveText('≥90');
    await expect(result.locator('.clcr-result-reference-unit')).toHaveText('mL/min/1,73 m²');
    const assumptions = page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25_cys"]');
    await expect(assumptions).toBeVisible();
    await expect(assumptions).toHaveText(cysAssumptions);
    await expect(page.locator('.clcr-result-population-note[data-clcr-formula="ckid_u25_cys"]')).toContainText(/PChN.*nie służy do przesiewu zdrowych, bezobjawowych osób/);
    await expect(page.locator('#clcrDataCompletion')).toBeVisible();
    await expect(page.locator('#clcrDataCompletion')).toHaveText('✓ Dane kompletne · 3/3');
    expect((await visibleControls(page)).map(field => field.id).sort()).toEqual(['CystatinC', 'age', 'sex']);
    await expectUnknownSourceFacts(page);
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();

    await czekajNaUstabilizowanyUklad(page);
    const screenshotPath = testInfo.outputPath(`u25cys-${width}-main.png`);
    await page.locator('#clcrWorkspace').screenshot({
      path: screenshotPath, animations: 'disabled',
      style: '#mobileBottomDock, #scrollTopBtn { visibility: hidden !important; }',
    });
    await testInfo.attach(`u25cys-${width}-main.png`, {
      path: screenshotPath, contentType: 'image/png',
    });

    const optional = page.locator('#clcrForm details.clcr-context-details:visible');
    await expect(optional).toHaveCount(1);
    await expect(optional.locator(':scope > summary')).toHaveText('Dokładniejszy wiek (opcjonalnie)');
    await optional.locator(':scope > summary').evaluate(summary => summary.click());
    await expect(page.locator('#ageMonths')).toBeVisible();
    const controls = await visibleControls(page);
    expect(controls.map(field => field.id).sort()).toEqual(['CystatinC', 'age', 'ageMonths', 'sex']);
    expect(controls.filter(field => field.optional).map(field => field.id)).toEqual(['ageMonths']);
    for (const selector of ['#CystatinCStandardization', '#CystatinCAssayMethod', '#ScrAssay', '#CrCysStandardizationConfirmed', '#creatinineState', '#suspectedAKI', '[data-clcr-marker-context]', '#weight', '#height']) {
      await expect(page.locator(selector)).toBeHidden();
    }
    if (width === 390) {
      expect(controls.every(field => field.fontPx >= 16 && field.heightPx >= 48)).toBe(true);
    }
    const geometry = await page.evaluate(() => {
      const legend = document.querySelector('#serumSet > legend');
      const field = document.querySelector('[data-clcr-field-id="CystatinC"]');
      const reference = document.querySelector('[data-clcr-series="ckid_u25_cys"] .clcr-result-reference');
      const value = document.querySelector('[data-clcr-series="ckid_u25_cys"] .clcr-result-patient');
      const referenceBox = reference.getBoundingClientRect();
      const valueBox = value.getBoundingClientRect();
      return {
        legendPosition: getComputedStyle(legend).position,
        legendGap: field.getBoundingClientRect().top - legend.getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        referenceVisible: reference.getBoundingClientRect().width > 0,
        sameCard: reference.closest('.clcr-result-card') === value?.closest('.clcr-result-card'),
        referenceBesideValue: referenceBox.left >= valueBox.right - 1 && Math.abs(referenceBox.top - valueBox.top) <= 2,
      };
    });
    expect(geometry.legendPosition).toBe('static');
    expect(geometry.legendGap).toBeGreaterThanOrEqual(0);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.referenceVisible && geometry.sameCard && geometry.referenceBesideValue).toBe(true);

    const category = result.locator('[data-clcr-category-control]');
    await category.evaluate(button => button.click());
    const details = page.locator('.clcr-result-details[data-clcr-formula="ckid_u25_cys"]');
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('[data-clcr-category-row="G2"]')).toHaveAttribute('aria-current', 'true');
    await expect(details.locator('[data-clcr-category-row="G2"]')).toContainText('60–<90');
    await expect(details).toContainText('nefelometryczn');
    await expectUnknownSourceFacts(page);
  });
}

test('U25cys przed 2. rokiem życia liczy bez kategorii G i bez progu 90', async ({ page }) => {
  await openCalculator(page);
  await fillCys(page, { age: '1' });
  await fillField(page, '#ageMonths', '6');
  const result = card(page, 'ckid_u25_cys');
  await expect(result).toBeVisible();
  expect(Number(await result.getAttribute('data-clcr-value'))).toBeGreaterThan(0);
  await expect(result).toHaveAttribute('data-clcr-category', '');
  await expect(result.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(result.locator('.clcr-result-reference')).not.toContainText(/≥90|G1/);
  await expect(page.locator('#clcrResultReport [data-clcr-category-row][aria-current="true"]')).toHaveCount(0);
  await expectUnknownSourceFacts(page);
});

test('U25cys klasyfikuje surowe 89,8 jako G2 mimo wyświetlenia 90', async ({ page }) => {
  await openCalculator(page);
  // Niezależny przypadek liczbowy z audytu równania; nie wyliczamy w teście progu.
  await fillCys(page, { cystatin: '0.8826794526434676' });
  const result = await expectOneCard(page, 'ckid_u25_cys', '90', 89.8);
  await expect(result).toHaveAttribute('data-clcr-category', 'G2');
  await expect(result).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(result.locator('.clcr-result-boundary')).toContainText('<90');
  await expect(result.locator('.clcr-result-reference-value')).toHaveText('≥90');
});

test('jawne wcześniejsze AKI lub szybka zmiana blokują U25cys bez zamiany danych na założenia', async ({ page }) => {
  await openCalculator(page);
  for (const conflict of [
    { creatinineState: 'stable', suspectedAKI: true },
    { creatinineState: 'rapidlyChanging', suspectedAKI: false },
  ]) {
    await restoreCys(page, conflict);
    await expect(card(page, 'ckid_u25_cys')).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('ckid_u25_cys'))).toBe(false);
    await expect(page.locator('#clcrReadiness')).toContainText(/AKI|szybk|zmian|niestacjonarn/i);
    expect(await snapshotInputs(page)).toMatchObject(conflict);
    await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25_cys"]')).toHaveCount(0);
  }
});

test('dawne niejednoznaczne not_ifcc nie staje się faktem IFCC, a jawne non_ifcc blokuje wynik', async ({ page }) => {
  await openCalculator(page);
  await restoreCys(page, { CystatinCStandardization: 'not_ifcc' });
  const result = await expectOneCard(page, 'ckid_u25_cys', '79', 79.26461484738338);
  await expect(result).toHaveAttribute('data-clcr-category', 'G2');
  expect((await snapshotInputs(page)).CystatinCStandardization).toBe('not_ifcc');
  await restoreCys(page, { CystatinCStandardization: 'non_ifcc' });
  await expect(card(page, 'ckid_u25_cys')).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('ckid_u25_cys'))).toBe(false);
  expect((await snapshotInputs(page)).CystatinCStandardization).toBe('non_ifcc');
  await expect(page.locator('#clcrReadiness')).toContainText(/IFCC|standaryzac/i);
});

test('Cockcroft i zmierzony klirens DZM zachowują własne jednostki bez kategorii G', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'cg');
  for (const [selector, value] of [['#age', '50'], ['#weight', '70'], ['#Scr', '1']]) await fillField(page, selector, value);
  await page.locator('#sex').selectOption('F');
  const cg = await expectOneCard(page, 'cg', '74', 74.375);
  await expect(cg).toHaveAttribute('data-clcr-category', '');
  await expect(cg.locator('.clcr-result-unit')).toHaveText('mL/min');
  await expect(cg.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="cg"]')).not.toContainText(/IFCC|IDMS/);

  await selectFormula(page, 'cl24');
  for (const [selector, value] of [
    ['#Scr', '1'], ['#Ucr', '100'], ['#V24', '720'],
    ['#Cl24DurationHours', '12'],
  ]) await fillField(page, selector, value);
  const measured = await expectOneCard(page, 'cl24', '100', 100);
  await expect(measured).toHaveAttribute('data-clcr-category', '');
  await expect(measured.locator('.clcr-result-unit')).toHaveText('mL/min');
  await expect(measured.locator('[data-clcr-category-control]')).toHaveCount(0);
});

test('FENa przyjmuje sparowanie jako założenie, dializa zachowuje potwierdzenia, bez założeń eGFR lub IFCC', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'FENa_spot');
  expect(await page.evaluate(() => {
    const snapshot = window.buildClcrSessionSnapshot();
    snapshot.inputs.creatinineState = 'rapidlyChanging';
    snapshot.inputs.suspectedAKI = true;
    return window.applyClcrSessionSnapshot(snapshot, {
      source: 'e2e-fe-known-aki', update: true, dispatchEvents: false, preserveAcrossVersions: true,
    });
  })).toBe(true);
  for (const [selector, value] of [['#U_Na_spot', '40'], ['#S_Na_spot', '140'], ['#Ucr_spot', '100'], ['#Scr_spot', '1']]) {
    await fillField(page, selector, value);
  }
  const fena = card(page, 'FENa_spot');
  await expect(fena).toBeVisible();
  expect(Number(await fena.getAttribute('data-clcr-value'))).toBeCloseTo(0.2857142857142857, 10);
  await expect(fena).toHaveAttribute('data-clcr-tone', 'neutral');
  const fenaAssessment = JSON.parse(await fena.getAttribute('data-clcr-fena-snapshot'));
  expect(fenaAssessment.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  await expect(page.locator('#fenaInputCard')).toContainText(/Zakładamy.*próbkę moczu.*krew/);
  await expect(page.locator('#clcrResultReport .clcr-result-assumptions')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).not.toContainText(/standaryzowane do IFCC|brak podejrzenia AKI/);
  expect(await snapshotInputs(page)).toMatchObject({ creatinineState: 'rapidlyChanging', suspectedAKI: true });

  const applied = await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'pro', selectedFormula: 'KTV',
    inputs: {
      currentVersion: 'pro', formulaPicker: 'KTV', age: '60',
      creatinineState: 'rapidlyChanging', suspectedAKI: true,
      ktvModality: 'IHD', ktvSessionsPerWeek: '3', ktvPidiDays: '2',
      ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70',
      ktvUreaAnalyte: 'urea', ktvUreaUnit: 'mg/dL', UreaPre: '150', UreaPost: '45',
      ktvPostMethod: 'slow_flow_100ml_15s', ktvSameSession: true,
      ktvPreBeforeDialysis: true, ktvPreNoDilution: true,
    },
  }, { source: 'e2e-assumptions-dialysis', update: true, dispatchEvents: false, preserveAcrossVersions: true }));
  expect(applied).toBe(true);
  // Dializa zachowuje osobne, otagowane kontenery URR i spKt/V; ich karty
  // prezentacji pozostają wewnątrz tych kontenerów, bez podwajania serii.
  const urr = page.locator('#clcrResultReport [data-clcr-series="KTV_urr"] .clcr-result-card');
  const spktv = page.locator('#clcrResultReport [data-clcr-series="KTV_spktv"] .clcr-result-card');
  await expect(urr).toBeVisible();
  await expect(spktv).toBeVisible();
  await expect(urr.locator('.clcr-result-value')).toHaveText('70,0');
  await expect(page.locator('#clcrResultReport .clcr-result-assumptions')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).not.toContainText(/standaryzowane do IFCC|brak podejrzenia AKI/);
  expect(await snapshotInputs(page)).toMatchObject({ creatinineState: 'rapidlyChanging', suspectedAKI: true });
  await selectField(page, '#ui_ktvSameSession_answer', 'no');
  await expect(urr).toHaveCount(0);
  await expect(spktv).toHaveCount(0);
});

test('historia i raport AI opisują założenia, zachowując nieznane fakty oraz wcześniejszy wynik', async ({ page }) => {
  await openCalculator(page);
  await fillCys(page);
  await expectOneCard(page, 'ckid_u25_cys', '79', 79.26461484738338);
  const before = await snapshotInputs(page);
  const contextText = await page.evaluate(() => window.getClcrCreatinineContextText());
  expect(contextText).toBe(cysAssumptions);
  expect(contextText).not.toMatch(/podejrzenie AKI:\s*nie|kreatynina stabilna/i);

  const saved = await page.evaluate(async () => {
    const api = window.ClcrVisitSave;
    const datapoints = api.collectActiveDatapoints(document, { formulaId: 'ckid_u25_cys' });
    const previous = {
      id: 'synthetic-historical-cys', patientId: 'synthetic-assumptions-only',
      category: 'wynik-klirens', clinicalDateISO: '2025-01-01',
      title: datapoints[0].label, body: 'Poprzedni wynik — zachować bez przeliczenia. clcr:ckid_u25_cys',
      labResult: { test: datapoints[0].label, value: '123,4', valueNum: 123.4, unit: datapoints[0].unit, norm: 'Historyczny opis zakresu' },
    };
    const previousJson = JSON.stringify(previous);
    const notes = [previous];
    const originalVault = window.VildaVault;
    // Adapter wyłącznie w pamięci tej strony. Nie wywołujemy create/unlock/read
    // prawdziwego sejfu ani nie zapisujemy nic do persistence.
    window.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async note => {
        const copy = JSON.parse(JSON.stringify({ ...note, id: 'synthetic-current-cys' }));
        notes.push(copy);
        return copy;
      },
    };
    try {
      const outcome = await api.saveActiveResultToCard({
        patientId: 'synthetic-assumptions-only', clinicalDateISO: '2026-10-22',
        root: document, formulaId: 'ckid_u25_cys',
      });
      return {
        outcome, datapoints, notes, previousUnchanged: JSON.stringify(previous) === previousJson,
        series: api.buildSeriesFromNotes(notes, { formulaId: 'ckid_u25_cys' }),
      };
    } finally {
      window.VildaVault = originalVault;
    }
  });
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1, total: 1 });
  expect(saved.datapoints).toHaveLength(1);
  expect(saved.datapoints[0]).toMatchObject({
    sourceFormulaId: 'ckid_u25_cys', valueNum: 79, unit: 'mL/min/1,73 m²',
    norm: '≥90 mL/min/1,73 m²', outOfRange: true, assumptions: cysAssumptions,
    assumptionProvenance: {
      creatinineState: 'assumed', suspectedAKI: 'assumed', cystatinCStandardization: 'assumed',
    },
  });
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes[1].body).toContain(cysAssumptions);
  expect(saved.notes[1].body).not.toMatch(/podejrzenie AKI:\s*nie/i);
  expect(saved.notes[1].labResult).toMatchObject({ valueNum: 79, norm: '≥90 mL/min/1,73 m²' });
  expect(saved.previousUnchanged).toBe(true);
  expect(saved.notes[0].body).not.toContain('Założenia:');
  expect(saved.series).toHaveLength(1);
  expect(saved.series[0].points.map(point => point.valueNum)).toEqual([123.4, 79]);
  expect(await snapshotInputs(page)).toEqual(before);

  await page.evaluate(() => {
    window.__assumptionsTestClipboard = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => window.__assumptionsTestClipboard.push(text) },
    });
  });
  page.once('dialog', dialog => dialog.accept());
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__assumptionsTestClipboard.length)).toBe(1);
  const aiText = await page.evaluate(() => window.__assumptionsTestClipboard[0]);
  expect(aiText).toContain(cysAssumptions);
  expect(aiText).toContain('79');
  expect(aiText).toContain('G2');
  expect(aiText).not.toMatch(/podejrzenie AKI:\s*nie/i);
  await expectUnknownSourceFacts(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
});
