import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ph-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    const input = document.getElementById('U_pH');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#phInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), input: box('#U_pH'),
      font: parseFloat(getComputedStyle(input).fontSize), height: input.getBoundingClientRect().height,
      saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      text: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .ph-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect(), container = node.getBoundingClientRect();
        return { text: node.textContent.trim(), left: container.left, right: container.right, textLeft: bounds.left, textRight: bounds.right };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.inputCard).not.toBeNull();
  expect(Math.abs(result.form.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(result.height).toBeGreaterThanOrEqual(48);
  expect(result.font).toBeGreaterThanOrEqual(16);
  expect(result.input.x).toBeGreaterThanOrEqual(0);
  expect(result.input.right).toBeLessThanOrEqual(width + 1);
  expect(result.clear.top - result.inputCard.bottom).toBeGreaterThanOrEqual(15);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.report.top - result.activePanel.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.report.width - result.activePanel.width)).toBeLessThanOrEqual(1);
  }
  for (const text of result.text) {
    expect(text.textLeft, text.text).toBeGreaterThanOrEqual(text.left - 0.5);
    expect(text.textRight, text.text).toBeLessThanOrEqual(text.right + 0.5);
  }
  expect(Boolean(result.saveDate)).toBe(Boolean(result.saveButton));
  if (result.saveDate) {
    expect(Math.abs(result.saveDate.x - result.saveButton.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.saveDate.width - result.saveButton.width)).toBeLessThanOrEqual(1);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

async function colors(page) {
  return card(page).evaluate(node => ({
    main: getComputedStyle(node.querySelector('.clcr-result-value')).color,
    reference: getComputedStyle(node.querySelector('.ph-reference-value')).color,
  }));
}

for (const width of [1440, 390, 320]) {
  test(`pH próbki: jedno pole, jedna karta i stała geometria przy ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { U_pH: '' });
    await expect(page.locator('#phRequiredCount')).toHaveText('0/1');
    await expectBlocked(page);
    expect(await page.locator('#phInputCard input:visible').count()).toBe(1);
    expect(await page.locator('#phInputCard select:visible').count()).toBe(0);
    for (const id of ['age', 'sex', 'weight', 'height', 'Scr_spot', 'Ucr_spot', 'spotSampleKind',
      'spotMenstruation', 'spotHematuria', 'spotInfection', 'spotExercise', 'spotAcuteIllness']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#U_pH')).toHaveAccessibleName('pH z wyniku badania');
    const initial = await geometry(page, width);
    await page.locator('#U_pH').fill('6,5');
    await expectResult(page);
    await expect(page.locator('#phRequiredCount')).toHaveText('1/1');
    await expect(card(page)).toContainText('Norma ogólna');
    await expect(card(page)).toContainText('4,5–8,0');
    await expect(card(page)).not.toContainText(/Norma dla wieku|Do pełnej interpretacji|Pełna interpretacja jest ograniczona/);
    const normalColors = await colors(page);
    sameWidths(initial, await geometry(page, width));
    const normalScreenshot = testInfo.outputPath(`ph-normal-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: normalScreenshot });
    await testInfo.attach(`ph-normal-${width}-workspace`, { path: normalScreenshot, contentType: 'image/png' });
    await page.locator('#U_pH').fill('8.0001');
    await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high' });
    const highColors = await colors(page);
    expect(highColors.main).not.toBe(normalColors.main);
    expect(highColors.reference).toBe(normalColors.reference);
    expect(highColors.reference).not.toBe(highColors.main);
    await expect(card(page).locator('.clcr-result-value')).toHaveText('8,0001');
    sameWidths(initial, await geometry(page, width));
    const highScreenshot = testInfo.outputPath(`ph-high-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: highScreenshot });
    await testInfo.attach(`ph-high-${width}-workspace`, { path: highScreenshot, contentType: 'image/png' });
    await kliknij(details(page).locator(':scope > summary'));
    await expect(details(page)).toContainText(/Mayo/);
    await expect(details(page)).toContainText(/Labcorp/);
    await expect(details(page)).toContainText(/EAU/);
    await page.locator('#U_pH').fill('4.4999');
    await expectResult(page, { raw: 4.4999, tone: 'warning', status: 'low' });
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    const screenshot = testInfo.outputPath(`ph-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`ph-${width}-workspace`, { path: screenshot, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#phRequiredCount')).toHaveText('0/1');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('pH próbki: granice normy i dokładne wartości są zgodne w formularzu, zapisie i historii', async ({ page }) => {
  await openCalculator(page);
  const cases = [
    ['4.4999', 4.4999, 'low'], ['4.5', 4.5, 'within'], ['5.0', 5, 'within'],
    ['7.5', 7.5, 'within'], ['8', 8, 'within'], ['8.0001', 8.0001, 'high'],
    ['0', 0, 'low'], ['14', 14, 'high'],
  ];
  for (const [index, [input, raw, status]] of cases.entries()) {
    await restore(page, { U_pH: input });
    const model = await expectResult(page, { raw, status, tone: status === 'within' ? 'normal' : 'warning' });
    const saved = await captureSave(page, `2026-10-${18 + index}`);
    expect(saved.vaultLocked).toBe(true);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points).toHaveLength(1);
    expect(saved.points[0]).toMatchObject({ valueNum: raw, rawValue: raw, phSnapshot: model });
    expect(saved.notes[0].labResult.valueNum).toBe(raw);
    expect(saved.notes[0].labResult.value).toBe(model.display.text);
    const point = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements[0], saved.notes);
    expect(point).toMatchObject({ valueNum: raw, outOfRange: status !== 'within', phAssessment: model });
    expect(point.norm).toContain('4,5');
    expect(point.norm).toContain('8,0');
  }
  const history = await readVisibleSavedHistory(page, '__phSyntheticNotes');
  expect(history.visible).toBe(true);
  expect(history.ids).toEqual(history.originalIds);
  expect(history.dates).toEqual(history.originalDates);
  expect(history.points.map(point => point.valueNum)).toEqual(cases.map(item => item[1]));
  expect(history.values).toEqual(cases.map(([input]) => `${input.replace('.', ',')} —`));
  const frozen = await page.evaluate(() => {
    const engine = window.VildaClcrPh;
    window.VildaClcrPh = { evaluate: () => { throw new Error('Historia nie może przeliczać bieżącej normy'); } };
    try { return window.ClcrSavedResults.projectPatientNotes(window.__phSyntheticNotes).measurements; }
    finally { window.VildaClcrPh = engine; }
  });
  expect(frozen.map(point => point.valueNum)).toEqual(cases.map(item => item[1]));
  expect(frozen.map(point => point.phAssessment.status)).toEqual(cases.map(item => item[2]));
});

test('pH próbki: puste, niepoprawne i poza skalą nie pozostawiają poprzedniego wyniku do zapisania', async ({ page }) => {
  await openCalculator(page);
  await restore(page);
  for (const invalid of ['', ' ', '-0.0001', '14.0001', '1e309', 'NaN', '6x', '4,5.6']) {
    await page.locator('#U_pH').fill('6.5');
    await expectResult(page);
    await page.locator('#U_pH').fill(invalid);
    await expectBlocked(page);
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    // The field must retain invalid input for correction, never silently clamp it.
    await expect(page.locator('#U_pH')).toHaveValue(invalid);
  }
  await page.locator('#U_pH').fill('0');
  await expectResult(page, { raw: 0, tone: 'warning', status: 'low' });
});

test('pH próbki: znane fakty nie dodają pytań, a przełączanie nie usuwa kontekstu innych wzorów', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { spotInfection: true, spotSampleKind: 'firstMorning', U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', age: '10', sex: 'F' });
  await expectResult(page);
  await expect(page.locator('#spotInfection')).toBeHidden();
  await expect(card(page)).not.toContainText(/albuminuria|białkomocz/i);
  await choose(page, 'ACR');
  await expect(page.locator('#spotInfection')).toBeChecked();
  await choose(page, 'pH_spot');
  await expectResult(page);
  await expect(page.locator('#spotInfection')).toBeChecked();
  await expect(page.locator('#spotInfection')).toBeHidden();
  // A newly restored single-field session must not borrow the previous value.
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'pH_spot', inputs: { currentVersion: 'spot', formulaPicker: 'pH_spot' } });
  await expect(page.locator('#U_pH')).toHaveValue('');
  await expectBlocked(page);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'pH_spot', preservedInputs: { ...base } });
  await expectResult(page);
});

test('pH próbki: norma ogólna nie wymaga wieku i nie zmienia się w zależności od wieku', async ({ page }) => {
  await openCalculator(page);
  let initialReference;
  for (const age of ['', '0', '10', '40']) {
    await restore(page, { age, U_pH: '7.5' });
    const model = await expectResult(page, { raw: 7.5 });
    if (!initialReference) initialReference = model.reference;
    expect(model.reference).toEqual(initialReference);
    await expect(page.locator('#phRequiredCount')).toHaveText('1/1');
    await expect(page.locator('#age')).toBeHidden();
    await expect(card(page)).not.toContainText('Norma dla wieku');
  }
});

test('pH próbki: przełączenie nie przenosi normy ani walidacji do pH dobowej zbiórki', async ({ page }) => {
  await openCalculator(page);
  const inputs = { ...base, currentVersion: 'pro', formulaPicker: 'pH24', U_pH: '8.1', pH24: '5.4',
    age: '40', sex: 'F', Cl24DurationHours: '24', Cl24DurationSource: 'hours',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' };
  for (const id of ['collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids',
    'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed', 'stoneMetabolicEvaluationContext',
    'stoneCollectionPlausibilityReviewed', 'stoneTwoCollectionsConfirmed', 'stonePhPersistent']) {
    inputs[id] = true; inputs[`ui_${id}_answer`] = 'yes';
  }
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'pH24', inputs }, 'pH24');
  const dzm = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH24"]');
  await expect(dzm).toBeVisible();
  const before = await dzm.innerText();
  await expect(dzm).not.toContainText('Norma ogólna');
  await choose(page, 'pH_spot');
  await expectResult(page, { raw: 8.1, tone: 'warning', status: 'high' });
  await choose(page, 'pH24');
  await expect(page.locator('#phInputCard')).toBeHidden();
  await expect(dzm).toBeVisible();
  expect(await dzm.innerText()).toBe(before);
  await expect(page.locator('#pH24')).toHaveValue('5.4');
  await expect(page.locator('#U_pH')).toHaveValue('8.1');
  await page.locator('#pH24').fill('10');
  await expect(page.locator('#pH24')).toHaveClass(/error/);
  await choose(page, 'pH_spot');
  await page.locator('#U_pH').fill('10');
  await expectResult(page, { raw: 10, tone: 'warning', status: 'high' });
});

test('pH próbki: edycja zera i dokładnej granicy oraz usunięcie dotyczą wyłącznie wybranego pomiaru', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { U_pH: '4.4999', spotInfection: true, spotSampleKind: 'firstMorning' });
  await expectResult(page, { raw: 4.4999, tone: 'warning', status: 'low', guest: false });
  const [first] = await saveVisible(page);
  await page.locator('#U_pH').fill('8.0001');
  await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high', guest: false });
  const [sibling] = await saveVisible(page);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  await expect(page.locator('#editDialog [data-clcr-edit-field]')).toHaveCount(1);
  await expect(page.locator('#editDialog [data-clcr-edit-field]')).toHaveAttribute('data-clcr-edit-field', 'U_pH');
  await page.locator('#editField-U_pH').fill('14.0001');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-U_pH').fill('0');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  let stored = await memory(page);
  expect(stored.updates).toHaveLength(1);
  expect(stored.notes.find(note => note.id === first.id).labResult.valueNum).toBe(0);
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#editMeasurement').click();
  await page.locator('#editField-U_pH').fill('8.0001');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  stored = await memory(page);
  const edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult.valueNum).toBe(8.0001);
  expect(edited.labResult.value).toBe('8,0001');
  const editedSnapshot = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note).snapshot, edited);
  expect(editedSnapshot.values).toMatchObject({ spotInfection: true, spotSampleKind: 'firstMorning' });
  const projection = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(projection).toMatchObject({ valueNum: 8.0001, outOfRange: true, phAssessment: { status: 'high' } });
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).not.toBeVisible();
  stored = await memory(page);
  expect(stored.notes).toEqual([sibling]);
  expect(stored.deletes).toHaveLength(1);
  expect(stored.originalsLocked).toBe(true);
});

test('pH próbki: schowek i Word zachowują dokładny wynik, normę oraz komentarz', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_pH: '8.0001' });
  const model = await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high' });
  await page.evaluate(() => {
    window.__phClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__phClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__phClipboard)).toContain(model.display.text);
  const copied = await page.evaluate(() => window.__phClipboard);
  expect(copied).toContain(model.interpretation);
  expect(copied).toContain('4,5');
  expect(copied).toContain('8,0');
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain(model.display.text);
  expect(exported).toContain(model.interpretation);
  expect(exported).toContain('4,5');
});
