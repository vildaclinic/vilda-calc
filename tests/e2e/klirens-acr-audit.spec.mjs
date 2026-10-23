import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Fikcyjne dane; rzeczywisty formularz, silnik ACR i adapter odtwarzania.
// Testy nie odblokowują sejfu ani nie zapisują danych użytkownika.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ACR"]');
const resultSnapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-acr-snapshot'));
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="ACR"]');
const mode = (page, direct = false) => page.getByRole('button', {
  name: direct ? 'Gotowy wynik ACR' : 'Oblicz ze stężeń', exact: true,
});

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'ACR', inputs: {
      currentVersion: 'spot', formulaPicker: 'ACR', age: '8', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '', U_Alb: '', U_Alb_unit: 'mg/L',
      Ucr_spot: '', Ucr_spot_unit: 'mg/dl', ACR_entry_mode: 'concentration',
      ACR_reported: '', ACR_reported_unit: 'mg/g', ACR_same_specimen: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false,
      spotExercise: false, spotAcuteIllness: false, ...values,
    },
  }, { source: 'e2e-acr-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'ACR' &&
    document.getElementById('formulaPicker').value === 'ACR' && window.clcrIsResetting !== true);
  await expect(mode(page)).toBeVisible();
}

async function expectResult(page, { raw, unit = 'mg/g', category = 'A2', tone = 'warning' } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  if (raw !== undefined) {
    await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  }
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  await expect(card(page)).toHaveAttribute('data-clcr-category', category);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  return details(page);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const value = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element || !element.getClientRects().length) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.left, width: rect.width, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('.acr-input-card'), clear: box('#clearBtn'),
      report: box('#clcrResultReport'), modeButtons: [...document.querySelectorAll('.acr-mode-switch button')].map(button => {
        const rect = button.getBoundingClientRect(); return { x: rect.x, width: rect.width, height: rect.height };
      }),
      fields: [...document.querySelectorAll('.acr-entry-fields input, .acr-entry-fields select')]
        .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
        .map(element => ({ id: element.id, kind: element.tagName, x: element.getBoundingClientRect().x, width: element.getBoundingClientRect().width,
          height: element.getBoundingClientRect().height, font: parseFloat(getComputedStyle(element).fontSize) })),
    };
  });
  expect(value.overflow, 'Brak przewijania poziomego').toBeLessThanOrEqual(1);
  expect(value.inputCard).not.toBeNull();
  expect(Math.abs(value.inputCard.top - value.activePanel.bottom - 16), 'Stały odstęp od nagłówka do pól').toBeLessThanOrEqual(1);
  expect(Math.abs(value.form.width - value.inputCard.width), 'Karta wejść wypełnia kolumnę').toBeLessThanOrEqual(1);
  expect(Math.abs(value.clear.width - value.inputCard.width), 'Przycisk czyszczenia ma szerokość karty').toBeLessThanOrEqual(1);
  expect(value.modeButtons).toHaveLength(2);
  expect(Math.abs(value.modeButtons[0].width - value.modeButtons[1].width)).toBeLessThanOrEqual(0.5);
  for (const button of value.modeButtons) expect(button.height).toBeGreaterThanOrEqual(48);
  for (const field of value.fields) {
    expect(field.height, `${field.id}: wysokość`).toBeGreaterThanOrEqual(48);
    expect(field.font, `${field.id}: czcionka bez autozoomu`).toBeGreaterThanOrEqual(16);
    expect(field.x).toBeGreaterThanOrEqual(0);
    expect(field.x + field.width).toBeLessThanOrEqual(width + 1);
  }
  if (width < 980) {
    expect(value.report.top - value.clear.bottom, 'Odstęp między czyszczeniem a wynikiem').toBeGreaterThanOrEqual(19);
  }
  return value;
}

function sameWidths(before, after) {
  for (const name of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[name].width - after[name].width), `${name}: stała szerokość`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[name].x - after[name].x), `${name}: stała lewa krawędź`).toBeLessThanOrEqual(0.5);
  }
  for (const field of after.fields) {
    const original = before.fields.find(item => item.kind === field.kind);
    expect(original, `${field.id}: odpowiednia kolumna w drugim trybie`).toBeTruthy();
    expect(Math.abs(original.x - field.x), `${field.id}: wyrównana kolumna`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(original.width - field.width), `${field.id}: stała szerokość kolumny`).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`ACR ${width}px: domyślne stężenia, równy układ obu trybów i jeden wynik z normą`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(mode(page, true)).toHaveAttribute('aria-pressed', 'false');
    expect(await mode(page).evaluate(button => button.nextElementSibling?.textContent.trim())).toBe('Gotowy wynik ACR');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#U_Alb')).toBeVisible();
    await expect(page.locator('#Ucr_spot')).toBeVisible();
    const initial = await geometry(page, width);
    await page.locator('#U_Alb').fill('45');
    await page.locator('#Ucr_spot').fill('100');
    await expectResult(page, { raw: 45 });
    await expect(card(page).locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
    await expect(card(page).locator('.clcr-result-reference-value')).toHaveText('<30');
    await expect(card(page).locator('.clcr-result-reference-unit')).toHaveText('mg/g');
    await expect(card(page)).toContainText('Umiarkowanie zwiększona albuminuria');
    await expect(card(page).locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
    expect(await resultSnapshot(page)).toMatchObject({
      schema: 'clcr-acr', version: 1, mode: 'concentration', rawValue: 45, unit: 'mg/g',
      category: 'A2', context: { ageYears: 8, sameSpecimen: 'assumed', sampleType: '', confounders: [] },
      profileId: 'KDIGO_ACR_2024',
    });
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#acrSampleInfo > summary'));
    await expect(page.locator('#acrSampleInfo')).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    for (const field of await page.locator('#acrSampleInfo select:visible').all()) {
      const dimensions = await field.evaluate(element => ({
        font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height,
      }));
      expect(dimensions.font).toBeGreaterThanOrEqual(16);
      expect(dimensions.height).toBeGreaterThanOrEqual(48);
    }
    await kliknij(page.locator('#acrSampleInfo > summary'));
    await kliknij(mode(page, true));
    await expect(page.locator('#ACR_reported')).toBeVisible();
    await expect(page.locator('#U_Alb')).toBeHidden();
    await expect(page.locator('#Ucr_spot')).toBeHidden();
    sameWidths(initial, await geometry(page, width));
    await page.locator('#ACR_reported').fill('3');
    await page.locator('#ACR_reported_unit').selectOption('mg/mmol');
    await expectResult(page, { raw: 3, unit: 'mg/mmol' });
    await expect(card(page).locator('.clcr-result-reference-value')).toHaveText('<3');
    expect(await resultSnapshot(page)).toMatchObject({
      mode: 'direct', rawValue: 3, unit: 'mg/mmol', convertedValue: 26.52, convertedUnit: 'mg/g',
      category: 'A2', context: { sameSpecimen: 'not-applicable' },
    });
    const expanded = await openDetails(page);
    await expect(expanded.locator('[data-clcr-category-row="A2"]')).toHaveAttribute('aria-current', 'true');
    await expect(expanded).toContainText(/3.*30/);
    await expect(expanded).toContainText(/zaokrągl|przybliż/);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#ACR_reported').fill('12345678');
    await expectResult(page, { raw: 12345678, unit: 'mg/mmol', category: 'A3', tone: 'danger' });
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page));
    await expectResult(page, { raw: 45 });
    sameWidths(initial, await geometry(page, width));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    const path = testInfo.outputPath(`acr-${width}-production.png`);
    await page.locator('#clcrWorkspace').screenshot({ path, animations: 'disabled', style: '#mobileBottomDock, #scrollTopBtn { visibility:hidden!important }' });
    await testInfo.attach('ACR-production', { path, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#U_Alb')).toHaveValue('');
    await expect(page.locator('#Ucr_spot')).toHaveValue('');
    await expect(page.locator('#ACR_reported')).toHaveValue('');
    await expect(card(page)).toHaveCount(0);
    // Globalne czyszczenie usuwa także wybór wzoru. Ponowny wybór ma
    // odtworzyć pusty domyślny tryb bez starego wyniku i bez zmiany szerokości.
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'ACR' && window.clcrIsResetting !== true);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page)).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('ACR: jednostki stężeń, zero albuminy i nieprawidłowa kreatynina', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Alb: '45', Ucr_spot: '100' });
  await expectResult(page, { raw: 45 });
  await page.locator('#U_Alb_unit').selectOption('mg/dL');
  await page.locator('#U_Alb').fill('4.5');
  await expectResult(page, { raw: 45 });
  await page.locator('#Ucr_spot_unit').selectOption('umol');
  await page.locator('#Ucr_spot').fill('8840');
  await expectResult(page, { raw: 45 });
  await page.locator('#Ucr_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('8.84');
  await expectResult(page, { raw: 45 });
  await page.locator('#U_Alb').fill('0');
  await expectResult(page, { raw: 0, category: 'A1', tone: 'success' });
  for (const value of ['0', '-1', '']) {
    await page.locator('#Ucr_spot').fill(value);
    await expect(card(page)).toHaveCount(0);
  }
  await page.locator('#Ucr_spot').fill('8.84');
  await expectResult(page, { raw: 0, category: 'A1', tone: 'success' });
});

test('ACR: surowe granice i znak wyniku laboratoryjnego zachowują znaczenie', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { ACR_entry_mode: 'direct' });
  const input = page.locator('#ACR_reported');
  for (const [value, category, tone, boundary] of [
    ['29.96', 'A1', 'success', '<30'], ['30', 'A2', 'warning', ''],
    ['300', 'A2', 'warning', ''], ['300.0001', 'A3', 'danger', '>300'],
  ]) {
    await input.fill(value);
    await expectResult(page, { raw: Number(value), category, tone });
    if (boundary) await expect(card(page)).toHaveAttribute('data-clcr-boundary', boundary);
    const points = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'ACR' }));
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ valueNum: Number(value), unit: 'mg/g',
      acrSnapshot: { rawValue: Number(value), category, boundary, context: { ageYears: 8 } },
    });
  }
  for (const [value, category, tone, symbol] of [
    ['<30', 'A1', 'success', '<'], ['>300', 'A3', 'danger', '>'], ['≤30', '', 'neutral', '≤'],
  ]) {
    await input.fill(value);
    await expectResult(page, { category, tone });
    await expect(card(page).locator('.clcr-result-value')).toContainText(symbol);
    await expect(input).toHaveValue(value);
  }
  await page.locator('#ACR_reported_unit').selectOption('mg/mmol');
  await input.fill('3');
  await expectResult(page, { raw: 3, unit: 'mg/mmol' });
  await expect(card(page).locator('.clcr-result-reference-value')).toHaveText('<3');
});

test('ACR: brak wieku i dziecko poniżej 2 lat mają wynik bez normy dorosłych', async ({ page }) => {
  await openCalculator(page);
  for (const [age, message] of [['', /wiek|wieku/], ['1', /pediatr|2 lat/]]) {
    await restore(page, { age, ACR_entry_mode: 'direct', ACR_reported: '45' });
    await expectResult(page, { raw: 45, category: '', tone: 'neutral' });
    await expect(card(page)).toContainText(message);
    await expect(card(page).locator('.clcr-result-reference-value')).toHaveCount(0);
    await expect(card(page)).not.toContainText(/Prawidłowa|Umiarkowanie zwiększona/);
    expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'ACR' })))
      .toMatchObject([{ valueNum: 45, outOfRange: null, acrSnapshot: { category: null, status: 'unassessed' } }]);
    await expect(details(page).locator('[aria-current="true"]')).toHaveCount(0);
  }
  await restore(page, { age: '2', ACR_entry_mode: 'direct', ACR_reported: '45' });
  await expectResult(page, { raw: 45 });
});

test('ACR: losowa próbka nie wymaga ankiety, znane różne próbki blokują tylko iloraz stężeń', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Alb: '45', Ucr_spot: '100', spotSampleKind: 'random' });
  await expectResult(page, { raw: 45 });
  await expect(card(page)).toContainText(/potwierdz/);
  const expanded = await openDetails(page);
  await expect(expanded).toContainText(/porann/);
  await restore(page, { U_Alb: '45', Ucr_spot: '100', spotInfection: true });
  await expectResult(page, { raw: 45, category: '', tone: 'neutral' });
  expect(await resultSnapshot(page)).toMatchObject({
    status: 'unassessed', qualification: { reasonCode: 'confounded-sample' },
    context: { confounders: ['infection'] },
  });
  await restore(page, { U_Alb: '45', Ucr_spot: '100', ACR_same_specimen: 'different' });
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).toContainText(/różn.*prób/);
  await kliknij(mode(page, true));
  await page.locator('#ACR_reported').fill('45');
  await expectResult(page, { raw: 45 });
  const snapshot = await page.evaluate(() => window.buildClcrSessionSnapshot());
  await restore(page, { age: '1', U_Alb: '999', Ucr_spot: '100' });
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-acr-roundtrip', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), snapshot)).toBe(true);
  await expect(mode(page, true)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#ACR_reported')).toHaveValue('45');
  await expect(page.locator('#ACR_reported_unit')).toHaveValue('mg/g');
  await expectResult(page, { raw: 45 });
  expect((await page.evaluate(() => window.buildClcrSessionSnapshot().inputs)).ACR_same_specimen).toBe('different');
});

test('ACR → PCR: wspólna kreatynina 8,84 mmol/L zachowuje jednostkę, stężenie i poprawny iloraz', async ({ page }) => {
  await openCalculator(page);
  await restore(page, {
    U_Alb: '45', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', U_Prot_spot: '100',
    spotSampleKind: 'firstMorning', spotSameSpecimen: true,
    ui_spotSameSpecimen_answer: 'yes', ACR_same_specimen: 'confirmed',
  });
  await expectResult(page, { raw: 45 });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('PCR'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'PCR' && window.clcrIsResetting !== true);
  await expect(page.locator('#Ucr_spot')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toHaveValue('8.84');
  await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
  const field = page.locator('#Ucr_spot').locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," clcr-field ")][1]');
  await expect(field.locator('.clcr-field__name')).toBeVisible();
  await expect(field.locator('.clcr-field__name')).toContainText(/Kreatynina.*moczu/i);
  await page.locator('#U_Prot_spot').fill('100');
  const pcr = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="PCR"]');
  await expect(pcr).toBeVisible();
  const mmolResult = Number(await pcr.getAttribute('data-clcr-value'));
  expect(mmolResult).toBeCloseTo(100, 8);
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('100');
  await expect.poll(async () => Number(await pcr.getAttribute('data-clcr-value'))).toBeCloseTo(mmolResult, 8);
  await expect(page.locator('#Ucr_spot')).toHaveValue('100');
  await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mg/dl');
});

test('ACR telefon: zmiana wieku zachowuje fokus i odświeża normę bez dodatkowego formularza', async ({ page }) => {
  await openCalculator(page, 390);
  await restore(page, { age: '1', U_Alb: '45', Ucr_spot: '100' });
  await expectResult(page, { raw: 45, category: '', tone: 'neutral' });
  const edit = page.locator('.acr-patient-age__edit');
  await expect(page.locator('.acr-patient-age')).toContainText(/1/);
  await expect(page.locator('#age')).toBeHidden();
  await kliknij(edit);
  await expect(page.locator('#age')).toBeVisible();
  for (const id of ['age', 'ageMonths']) {
    const dimensions = await page.locator(`#${id}`).evaluate(element => ({
      font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height,
    }));
    expect(dimensions.font, `${id}: bez autozoomu`).toBeGreaterThanOrEqual(16);
    expect(dimensions.height, `${id}: wysokość`).toBeGreaterThanOrEqual(48);
  }
  await page.locator('#age').fill('2');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 45 });
  await expect(card(page).locator('.clcr-result-reference-value')).toHaveText('<30');
  await page.locator('#age').fill('1');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 45, category: '', tone: 'neutral' });
  await expect(card(page).locator('.clcr-result-reference-value')).toHaveCount(0);
  await kliknij(edit);
  await expect(page.locator('#age')).toBeHidden();
  await expect(page.locator('.acr-patient-age')).toContainText(/1/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('ACR: odtworzenie kolejnego pacjenta nie dziedziczy wcześniejszej niezgodnej próbki ani infekcji', async ({ page }) => {
  await openCalculator(page);
  await restore(page, {
    U_Alb: '45', Ucr_spot: '100', ACR_same_specimen: 'different',
    spotSameSpecimen: false, ui_spotSameSpecimen_answer: 'no', spotInfection: true,
  });
  await expect(card(page)).toHaveCount(0);
  // Brak kluczy kontekstu w następnej sesji to brak danych tej osoby.
  // Nie wolno przywrócić zaznaczeń poprzedniego formularza ani założenia
  // „potwierdzono” zamiast jawnego, domyślnego założenia tej samej próbki.
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'ACR', inputs: {
      currentVersion: 'spot', formulaPicker: 'ACR', age: '12',
      U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl',
    },
  }, { source: 'e2e-acr-next-fictional-patient', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expectResult(page, { raw: 45 });
  expect(await resultSnapshot(page)).toMatchObject({
    context: { ageYears: 12, sameSpecimen: 'assumed', sampleType: '', confounders: [] }, category: 'A2',
  });
  const fields = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(fields.ACR_same_specimen).toBe('');
  expect(fields.ui_spotSameSpecimen_answer || '').toBe('');
  expect(fields.spotSameSpecimen).toBe(false);
  expect(fields.spotInfection).toBe(false);
});

test('ACR: ukryty domyślny tryb nie tworzy wyniku ani ostrzeżenia wieku na pustej stronie', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#ACR_entry_mode')).toHaveAttribute('type', 'hidden');
  await expect(page.locator('#ACR_entry_mode')).toHaveValue('concentration');
  await expect(page.locator('#age')).toHaveValue('');
  await expect(page.locator('#formulaPicker')).toHaveValue('');
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.activeFormulaId)).toBe('');
  // Wywołujemy ten sam update, który przelicza formularz po zmianie pola.
  // Sam niepusty ukryty wybór trybu nie jest daną kliniczną pacjenta.
  await page.evaluate(() => window.clcrUpdate());
  await czekajNaUstabilizowanyUklad(page);
  await expect(page.locator('#clcrInfo')).toBeEmpty();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('.clcr-result-card:visible')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).not.toContainText(/Wiek:\s*podaj pełne lata i miesiące/);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
});
