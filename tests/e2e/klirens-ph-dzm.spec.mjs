import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ph-dzm-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    const input = document.getElementById('pH24');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#phDzmInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), input: box('#pH24'),
      font: parseFloat(getComputedStyle(input).fontSize), height: input.getBoundingClientRect().height,
      saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      text: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .ph-dzm-reference-value')].map(node => {
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
  expect(result.height).toBeGreaterThanOrEqual(48); expect(result.font).toBeGreaterThanOrEqual(16);
  expect(result.input.x).toBeGreaterThanOrEqual(0); expect(result.input.right).toBeLessThanOrEqual(width + 1);
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

const colors = page => card(page).evaluate(node => ({
  main: getComputedStyle(node.querySelector('.clcr-result-value')).color,
  reference: getComputedStyle(node.querySelector('.ph-dzm-reference-value')).color,
}));

for (const width of [1440, 390, 320]) {
  test(`pH DZM: jedno pole, jedna karta i stała geometria przy ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width); await restore(page, { pH24: '' });
    await expect(page.locator('#phDzmRequiredCount')).toHaveText('0/1'); await expectBlocked(page);
    await expect(page.locator('#phDzmInputCard input:visible')).toHaveCount(1);
    await expect(page.locator('#phDzmInputCard select:visible')).toHaveCount(0);
    for (const id of ['age', 'sex', 'weight', 'height', 'Cl24DurationHours', 'collectionStartAt', 'collectionEndAt',
      'stoneMetabolicEvaluationContext', 'stoneCollectionPlausibilityReviewed', 'stoneTwoCollectionsConfirmed',
      'stonePhPersistent', 'stoneUtiExcluded', 'stoneKnownCystinuria', 'U_pH', 'spotInfection']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#pH24').fill('5,2'); const normal = await expectResult(page);
    await expect(page.locator('#phDzmRequiredCount')).toHaveText('1/1');
    await expect(card(page)).toContainText('Norma ogólna'); await expect(card(page)).toContainText('4,5–8,0');
    await expect(card(page)).toContainText(/Kwaśny odczyn.*krystalizacji kwasu moczowego/);
    await expect(card(page)).not.toContainText(/Norma dla wieku|Do pełnej interpretacji|Pełna interpretacja jest ograniczona|Profil pH/);
    expect(normal.input.urinePh).toBe('5,2');
    const normalColors = await colors(page); sameWidths(initial, await geometry(page, width));
    const normalPng = testInfo.outputPath(`ph-dzm-normal-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: normalPng });
    await testInfo.attach(`ph-dzm-normal-${width}`, { path: normalPng, contentType: 'image/png' });
    await page.locator('#pH24').fill('8.0001'); await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high' });
    const highColors = await colors(page);
    expect(highColors.main).not.toBe(normalColors.main); expect(highColors.reference).toBe(normalColors.reference);
    expect(highColors.reference).not.toBe(highColors.main); sameWidths(initial, await geometry(page, width));
    await kliknij(details(page).locator(':scope > summary'));
    await expect(details(page)).toContainText('UPH24'); await expect(details(page)).toContainText('EAU');
    await expect(details(page)).toContainText(/śwież|różnych porach/);
    await page.locator('#pH24').fill('4.4999'); await expectResult(page, { raw: 4.4999, tone: 'warning', status: 'low' });
    await expect(details(page)).toHaveAttribute('open', ''); sameWidths(initial, await geometry(page, width));
    const highPng = testInfo.outputPath(`ph-dzm-boundary-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: highPng });
    await testInfo.attach(`ph-dzm-boundary-${width}`, { path: highPng, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page); await expect(page.locator('#phDzmRequiredCount')).toHaveText('0/1');
    sameWidths(initial, await geometry(page, width)); expect(errors).toEqual([]);
  });
}

test('pH DZM: granice i dokładna liczba pozostają zgodne w karcie, zapisie i odczycie', async ({ page }) => {
  await openCalculator(page);
  const cases = [['4.4999', 4.4999, 'low'], ['4.5', 4.5, 'within'], ['5.2', 5.2, 'within'],
    ['8', 8, 'within'], ['8.0001', 8.0001, 'high'], ['0', 0, 'low'], ['10', 10, 'high'], ['14', 14, 'high']];
  for (const [index, [input, raw, status]] of cases.entries()) {
    await restore(page, { pH24: input });
    const model = await expectResult(page, { raw, status, tone: status === 'within' ? 'normal' : 'warning' });
    const saved = await captureSave(page, `2026-10-${20 + index}`);
    expect(saved.vaultLocked).toBe(true); expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points).toHaveLength(1);
    expect(saved.points[0]).toMatchObject({ valueNum: raw, rawValue: raw, phDzmSnapshot: model });
    expect(saved.notes[0].labResult.valueNum).toBe(raw); expect(saved.notes[0].labResult.value).toBe(model.display.text);
    const point = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements[0], saved.notes);
    expect(point).toMatchObject({ valueNum: raw, parameterKey: 'clcr:pH24', outOfRange: status !== 'within' });
    expect(point.norm).toContain('4,5'); expect(point.norm).toContain('8,0');
  }
  const frozen = await page.evaluate(() => {
    const engine = window.VildaClcrPhDzm;
    window.VildaClcrPhDzm = new Proxy({}, { get() { return () => { throw new Error('Historia nie może przeliczać pH DZM'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(window.__phDzmSyntheticNotes).measurements; }
    finally { window.VildaClcrPhDzm = engine; }
  });
  expect(frozen.map(point => point.valueNum)).toEqual(cases.map(item => item[1]));
  expect(frozen.map(point => point.outOfRange)).toEqual(cases.map(item => item[2] !== 'within'));
});

test('pH DZM: błędny wpis nie zachowuje poprzedniego wyniku do zapisania', async ({ page }) => {
  await openCalculator(page); await restore(page);
  for (const invalid of ['', ' ', '-0.0001', '14.0001', 'NaN', '6x', '0x6', '4,5.6']) {
    await page.locator('#pH24').fill('5.2'); await expectResult(page);
    await page.locator('#pH24').fill(invalid); await expectBlocked(page);
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled(); await expect(page.locator('#pH24')).toHaveValue(invalid);
  }
});

test('pH DZM: norma ogólna działa bez wieku i bez zastępowania jej normą dla wieku', async ({ page }) => {
  await openCalculator(page);
  let reference;
  for (const age of ['', '0', '10', '40']) {
    await restore(page, { age, pH24: '7.5' }); const model = await expectResult(page, { raw: 7.5 });
    reference ||= model.reference; expect(model.reference).toEqual(reference);
    await expect(page.locator('#age')).toBeHidden(); await expect(page.locator('#phDzmRequiredCount')).toHaveText('1/1');
    await expect(card(page)).not.toContainText('Norma dla wieku');
  }
});

test('pH DZM: znane fakty zbiórki ograniczają porównanie bez dodatkowych pytań i zmiany odczytu', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [
    { PH24_preservative: 'acid' }, { PH24_preservative: 'boric-acid' },
    { PH24_sampleType: 'spot' }, { Cl24DurationHours: '12', Cl24DurationSource: 'hours' },
    { Cl24DurationHours: '', Cl24DurationSource: 'historical-missing' },
  ]) {
    await restore(page, fields);
    const model = await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    expect(model.outOfRange).toBeNull();
    await expect(page.locator('#phDzmRequiredCount')).toHaveText('1/1');
    await expect(page.locator('#phDzmInputCard input:visible')).toHaveCount(1);
    await expect(card(page)).not.toContainText('4,5–8,0');
    if (fields.Cl24DurationHours === '12') {
      await expect(page.locator('#clcrActivePanel')).toContainText(/12\s*godz/);
      await expect(page.locator('#clcrActivePanel')).not.toContainText(/DZM\s*[·•]\s*24\s*godz/);
    }
  }
  // A fact about another spot sample must not become a fact about this DZM.
  await restore(page, { spotInfection: true, U_pH: '8.1' });
  const independent = await expectResult(page);
  expect(independent.input.infection).not.toBe(true);
  await restore(page, { PH24_infection: 'true' });
  for (const [value, raw, status] of [['5.2', 5.2, 'within'], ['4.2', 4.2, 'low'], ['8.2', 8.2, 'high']]) {
    await page.locator('#pH24').fill(value);
    const model = await expectResult(page, { raw, status, tone: status === 'within' ? 'normal' : 'warning' });
    expect(model.input.infection).toBe(true);
    expect(model.interpretation).toMatch(/zakażen/i);
    expect(model.interpretation).not.toMatch(/Wynik w zakresie ogólnym/);
  }
});

test('pH DZM: przełączanie zachowuje dwa odczyty i odrębne źródła, nowa sesja ich nie dziedziczy', async ({ page }) => {
  await openCalculator(page); await restore(page, { pH24: '5.2', U_pH: '8.1' });
  const dzm = await expectResult(page);
  expect(dzm.policy.id).toContain('PH_DZM');
  await choose(page, 'pH_spot');
  const spotCard = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH_spot"]');
  await expect(spotCard).toBeVisible();
  const spot = await spotCard.evaluate(node => JSON.parse(node.getAttribute('data-clcr-ph-snapshot')));
  expect(spot.rawValue).toBe(8.1); expect(spot.policy.id).not.toBe(dzm.policy.id);
  await choose(page, 'pH24'); await expectResult(page);
  await expect(page.locator('#phInputCard')).toBeHidden(); await expect(page.locator('#phDzmInputCard')).toBeVisible();
  await expect(page.locator('#pH24')).toHaveValue('5.2'); await expect(page.locator('#U_pH')).toHaveValue('8.1');
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'pH24', inputs: { currentVersion: 'pro', formulaPicker: 'pH24' } });
  await expectBlocked(page); await expect(page.locator('#pH24')).toHaveValue('');
});

test('pH DZM: wyszukiwarka prowadzi do jednego brakującego pola i zachowuje fokus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390); await restore(page, { pH24: '' });
  const count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('pH dobowej');
  await page.locator('.clcr-search-result[data-formula-id="pH24"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('pH24');
  await expect(page.locator('#pH24')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(1);
  await expect.poll(() => page.locator('#pH24').evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 40 && r.bottom <= innerHeight - 40; })).toBe(true);
  await page.locator('#pH24').focus(); await expect(page.locator('#pH24')).toBeFocused();
});

test('pH DZM: zapis, edycja i usunięcie dotyczą wyłącznie wybranego pomiaru', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page, { pH24: '4.4999' });
  await expectResult(page, { raw: 4.4999, tone: 'warning', status: 'low', guest: false });
  const [first] = await saveVisible(page, '2026-11-04');
  await page.locator('#pH24').fill('8.0001'); await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high', guest: false });
  const [sibling] = await saveVisible(page, '2026-11-05');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  await expect(page.locator('#editDialog [data-clcr-edit-field]')).toHaveCount(1);
  await expect(page.locator('#editDialog [data-clcr-edit-field]')).toHaveAttribute('data-clcr-edit-field', 'pH24');
  await page.locator('#editField-pH24').fill('14.0001'); await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible(); expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-pH24').fill('0'); await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  let stored = await memory(page); expect(stored.updates).toHaveLength(1);
  expect(stored.notes.find(note => note.id === first.id).labResult.valueNum).toBe(0);
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-pH24').fill('8.0001');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).not.toBeVisible();
  stored = await memory(page); const edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult.valueNum).toBe(8.0001); expect(edited.labResult.value).toBe('8,0001');
  const projection = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(projection).toMatchObject({ valueNum: 8.0001, outOfRange: true });
  expect(projection.norm).toContain('4,5');
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).not.toBeVisible();
  stored = await memory(page); expect(stored.notes).toEqual([sibling]);
  expect(stored.deletes).toHaveLength(1); expect(stored.originalsLocked).toBe(true);
});

test('pH DZM: schowek i Word zachowują dokładny wynik, normę i komentarz', async ({ page }) => {
  await openCalculator(page); await restore(page, { pH24: '8.0001' });
  const model = await expectResult(page, { raw: 8.0001, tone: 'warning', status: 'high' });
  await page.evaluate(() => {
    window.__phDzmClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__phDzmClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI')); await expect.poll(() => page.evaluate(() => window.__phDzmClipboard)).toContain(model.display.text);
  const copied = await page.evaluate(() => window.__phDzmClipboard);
  expect(copied).toContain(model.interpretation); expect(copied).toContain('4,5'); expect(copied).toContain('8,0');
  const pending = page.waitForEvent('download'); await kliknij(page.locator('#downloadDOCX'));
  const download = await pending; expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain(model.display.text); expect(exported).toContain(model.interpretation); expect(exported).toContain('4,5');
});
