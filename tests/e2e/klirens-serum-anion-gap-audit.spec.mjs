import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { installMemoryVault, memory, saveVisible, selectPatient } from '../support/klirens-patient-record.mjs';
import { applySession, base, card, choose, collect, details, ELECTROLYTES, expectBlocked, expectResult, inputCard, openCalculator, restore } from '../support/klirens-serum-anion-gap-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const measured = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    const card = document.querySelector('.ags-result-card');
    const valueUnit = card?.querySelector('.clcr-result-unit');
    const referenceUnit = card?.querySelector('.ags-reference-unit');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), input: box('#agsInputCard'), active: box('#clcrActivePanel'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#agsInputCard input,#agsInputCard select')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id, font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height,
      })),
      units: valueUnit && referenceUnit ? {
        valueTop: valueUnit.getBoundingClientRect().top, referenceTop: referenceUnit.getBoundingClientRect().top,
        valueColor: getComputedStyle(valueUnit).color, referenceColor: getComputedStyle(referenceUnit).color,
      } : null,
    };
  });
  expect(measured.overflow).toBeLessThanOrEqual(1);
  for (const control of measured.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
  }
  expect(Math.abs(measured.form.width - measured.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(measured.clear.width - measured.input.width)).toBeLessThanOrEqual(1);
  if (width < 980) expect(measured.report.top - measured.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(measured.report.top - measured.active.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(measured.report.width - measured.active.width)).toBeLessThanOrEqual(1);
  }
  if (measured.units) expect(Math.abs(measured.units.valueTop - measured.units.referenceTop)).toBeLessThanOrEqual(1);
  return measured;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(.5);
  }
}

test('AG surowicy: wyszukiwarka wskazuje trzy wymagane pola i przewija do pierwszego', async ({ page }) => {
  await openCalculator(page, 390);
  await restore(page, { S_Na: '', S_Cl: '', S_HCO3: '' });
  await choose(page, 'ACR');
  await page.evaluate(() => scrollTo(0, 0));
  const search = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
  await search.fill('anionowa surowicy');
  await list.locator('[data-formula-id="AGs"]').click();
  await expect(list).toBeHidden();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.selectionGuidance.lastFormula === 'AGs' &&
    window.ClcrUiWorkflow.state.selectionGuidance.lastTarget === 'S_Na');
  for (const id of ELECTROLYTES) await expect(page.locator('#' + id)).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#S_Na')).toBeInViewport();
  await expectBlocked(page);
});

for (const width of [1440, 390, 320]) {
  test(`AG surowicy ${width}px: trzy pola, jeden wynik i stały układ także z albuminą`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { S_Na: '', S_Cl: '', S_HCO3: '' });
    await expect(page.locator('#agsRequiredCount')).toHaveText('0/3');
    await expect(inputCard(page).locator('input:visible')).toHaveCount(3);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(0);
    for (const id of ['age', 'sex', 'weight', 'height', 'S_K', 'S_Albumin']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    for (const id of ELECTROLYTES) await page.locator('#' + id).fill(base[id]);
    await expectResult(page);
    await expect(page.locator('#agsRequiredCount')).toHaveText('3/3');
    await expect(card(page)).toContainText('Norma dla wieku');
    await expect(card(page)).toContainText('7–15');
    await expect(card(page)).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji/);
    const high = await geometry(page, width);
    expect(high.units).not.toBeNull();
    expect(high.units.referenceColor).not.toBe(high.units.valueColor);
    sameWidths(initial, high);
    for (const [chloride, raw, assessment, tone] of [['110', 12, 'normal', 'normal'], ['118', 4, 'low', 'warn'], ['122', 0, 'low', 'warn'], ['122.04', -.04, 'low', 'warn']]) {
      await page.locator('#S_Cl').fill(chloride);
      await expectResult(page, { raw, assessment, tone });
      sameWidths(initial, await geometry(page, width));
    }
    await kliknij(details(page).locator(':scope > summary'));
    await expect(details(page)).toContainText(/Mayo|Figge/);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_Na').fill('1234567890123456789012345');
    await page.locator('#S_Cl').fill('0'); await page.locator('#S_HCO3').fill('0');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-clcr-display-value', /^≈/);
    sameWidths(initial, await geometry(page, width));
    await restore(page, { AGS_albuminEnabled: true, S_Albumin: '20' });
    await expectResult(page);
    await expect(page.locator('#S_Albumin')).toBeVisible();
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_Albumin').fill('-1');
    await expectResult(page, { saveable: false });
    await expect(page.locator('#agsAlbuminError')).toBeVisible();
    sameWidths(initial, await geometry(page, width));
    await restore(page);
    await expectResult(page);
    const screenshot = testInfo.outputPath(`ags-${width}-production.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`ags-${width}-production`, { path: screenshot, contentType: 'image/png' });
    const workspace = testInfo.outputPath(`ags-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: workspace });
    await testInfo.attach(`ags-${width}-workspace`, { path: workspace, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#agsRequiredCount')).toHaveText('0/3');
    await expect(page.locator('#AGS_albuminEnabled')).not.toBeChecked();
    await expect(page.locator('#S_Albumin')).toHaveValue('');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('AG surowicy: dokładne zero, małe znaki, granice normy i ścisła walidacja stężeń', async ({ page }) => {
  await openCalculator(page);
  for (const [sodium, chloride, bicarbonate, raw] of [
    ['140.04', '116', '24', .04], ['139.96', '116', '24', -.04], ['140,1', '116', '24,1', 0],
    ['0', '0', '0', 0], ['140', '118', '24', -2],
  ]) {
    await restore(page, { S_Na: sodium, S_Cl: chloride, S_HCO3: bicarbonate });
    const result = await expectResult(page, { raw, assessment: 'low', tone: 'warn' });
    if (raw !== 0) expect(result.display.text).not.toMatch(/^[-−]?0(?:[.,]0+)?$/);
    else expect(result.display.text).not.toMatch(/^[-−]/);
  }
  for (const [sodium, raw, assessment, tone] of [['6.999999', 6.999999, 'low', 'warn'], ['7', 7, 'normal', 'normal'], ['15', 15, 'normal', 'normal'], ['15.000001', 15.000001, 'high', 'warn']]) {
    await restore(page, { S_Na: sodium, S_Cl: '0', S_HCO3: '0' });
    await expectResult(page, { raw, assessment, tone });
  }
  for (const id of ELECTROLYTES) for (const value of ['', '-1', '0x10', '<1', '1e309', '1e-999']) {
    await restore(page, { [id]: value });
    await expect(page.locator('#' + id)).toHaveValue(value);
    await expectBlocked(page);
  }
  await restore(page, { S_Na: '0', S_Cl: '1e308', S_HCO3: '1e308' });
  await expectBlocked(page);
  await expect(page.locator('#clcrResultReport')).toContainText(/Sprawdź|zakres/);
});

test('AG surowicy: norma zaczyna się od 7 lat, brak wieku i młodszy wiek zachowują neutralną liczbę', async ({ page }) => {
  await openCalculator(page);
  // The shared age model accepts a month component from 0 to 11; 6y12m is
  // invalid evidence, not an alternative encoding of the seventh birthday.
  for (const [age, ageMonths] of [['', ''], ['0', ''], ['3', ''], ['6.999999', ''], ['6', '11'], ['6', '12']]) {
    await restore(page, { age, ageMonths });
    const result = await expectResult(page, { assessment: 'unassessed', tone: 'neutral' });
    expect(result.outOfRange).toBe(null);
    const points = await collect(page); expect(points[0].norm).toBe('');
    await expect(card(page)).not.toContainText('7–15');
    await expect(card(page)).not.toContainText(/Podwyższona luka|AG w przyjętej normie/);
  }
  for (const [age, months] of [['7', ''], ['7', '1'], ['17', ''], ['80', '']]) {
    await restore(page, { age, ageMonths: months });
    const result = await expectResult(page);
    expect(result.outOfRange).toBe(true);
    await expect(card(page)).toContainText('7–15');
  }
});

test('AG surowicy: albumina jest opcjonalna, jednostki i korekcja mają znak, błąd nie ukrywa podstawowego AG', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { S_Cl: '104', S_HCO3: '24' });
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal' });
  await page.locator('#agsAlbuminToggle').click();
  await expect(page.locator('#agsAlbuminToggle')).toHaveAttribute('aria-expanded', 'true');
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal' });
  await expect(page.locator('#agsRequiredCount')).toHaveText('3/3');
  for (const [unit, value, corrected] of [['g/L', '20', '17'], ['g/dL', '2', '17'], ['g/L', '50', '9,5']]) {
    await page.locator('#S_Albumin_unit').selectOption(unit); await page.locator('#S_Albumin').fill(value);
    await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal' });
    await expect(card(page).locator('.ags-correction-row')).toContainText(corrected);
    expect(await collect(page)).toHaveLength(1);
  }
  await page.locator('#S_Albumin').fill('20'); await page.locator('#S_Albumin_unit').selectOption('g/dL');
  await expect(page.locator('#S_Albumin')).toHaveValue('20');
  await expect(card(page).locator('.ags-correction-row')).toContainText(/[-−]28/);
  await page.locator('#S_Albumin').fill('-1');
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal', saveable: false });
  await page.locator('#agsAlbuminToggle').click();
  await expect(page.locator('#S_Albumin')).toHaveValue('-1');
  await expect(page.locator('#S_Albumin')).toBeHidden();
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal' });
  await expect(card(page).locator('.ags-correction-row')).toHaveCount(0);
  await page.locator('#agsAlbuminToggle').click();
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal', saveable: false });
  await page.locator('#S_Albumin').fill('');
  await expectResult(page, { raw: 12, assessment: 'normal', tone: 'normal' });
  await restore(page, { age: '3', AGS_albuminEnabled: true, S_Albumin: '20' });
  await expectResult(page, { assessment: 'unassessed', tone: 'neutral' });
  await expect(card(page).locator('.ags-correction-row')).toContainText('27');
  await expect(card(page)).not.toContainText('Norma powyżej');
});

test('AG surowicy: zapis zachowuje małą wartość, normę z dnia obliczenia i jedną serię z albuminą', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page, { select: false });
  await restore(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await restore(page, { S_Na: '139.96', S_Cl: '116', S_HCO3: '24', AGS_albuminEnabled: true, S_Albumin: '20' });
  const tiny = await expectResult(page, { raw: -.04, assessment: 'low', tone: 'warn', guest: false });
  const [note] = await saveVisible(page, '2026-11-01');
  expect(note.labResult.valueNum).toBe(-.04);
  expect(note.labResult.value).toBe(tiny.display.text);
  expect(note.body).toContain('albumin');
  await restore(page, { age: '3' });
  const child = await expectResult(page, { assessment: 'unassessed', tone: 'neutral', guest: false });
  const [childNote] = await saveVisible(page, '2026-11-02');
  await restore(page, { age: '80' });
  const projection = await page.evaluate(notes => {
    const engine = window.VildaClcrSerumAnionGap;
    window.VildaClcrSerumAnionGap = new Proxy({}, { get() { return () => { throw Error('Historia nie może przeliczać bieżącej normy'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes); }
    finally { window.VildaClcrSerumAnionGap = engine; }
  }, [note, childNote]);
  expect(projection.measurements).toHaveLength(2);
  expect(new Set(projection.measurements.map(row => row.parameterKey))).toEqual(new Set(['clcr:AGs']));
  expect(projection.measurements.find(row => row.noteId === note.id)).toMatchObject({ valueNum: -.04, outOfRange: true, serumAnionGapAssessment: tiny });
  expect(projection.measurements.find(row => row.noteId === childNote.id)).toMatchObject({ valueNum: 22, norm: '', outOfRange: null, serumAnionGapAssessment: child });
  await page.locator('#clcrOpenHistoryBtn').click();
  for (const saved of [note, childNote]) await expect(page.locator(`#clcrPatientCard tr[data-note-id="${saved.id}"]`)).toHaveCount(1);
  await page.locator('#cpcClose').click();
  // The just-saved shortcut hides when a new unsaved calculation is loaded.
  // The persistent patient-card action remains the actual user path here.
  await page.locator('#clcrOpenCardBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(2);
  expect(Number(await page.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`).getAttribute('data-value'))).toBe(-.04);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('AG surowicy: edytor odrzuca nieprawidłowe stężenia i albuminę bez utraty ID lub zamrożonego wieku', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { AGS_albuminEnabled: true, S_Albumin: '20' });
  await expectResult(page, { guest: false });
  const [original] = await saveVisible(page, '2026-11-03');
  await restore(page, { age: '3' });
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  for (const id of ELECTROLYTES) await expect(page.locator('#editField-' + id)).toHaveValue(base[id]);
  for (const invalid of ['-1', '0x10', '<1', '1e309']) {
    await page.locator('#editField-S_Na').fill(invalid);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editError')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-S_Na').fill('140');
  await page.locator('#editField-S_Albumin').fill('-1');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-S_Albumin').fill('');
  await page.locator('#editField-S_Cl').fill('122');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === original.id);
  expect(stored.notes).toHaveLength(1); expect(stored.updates).toHaveLength(1);
  expect(edited.labResult.valueNum).toBe(0);
  expect(edited.labResult.norm).toContain('7');
  expect(edited.labResult.norm).toContain('15');
  expect(stored.originalsLocked).toBe(true);
});

test('AG surowicy: odtworzenie nie pożycza brakujących pól, przełączanie zachowuje przecinek i przywraca typy', async ({ page }) => {
  await openCalculator(page); await restore(page, { S_Na: '140,04', S_Cl: '116', S_HCO3: '24', AGS_albuminEnabled: true, S_Albumin: '20' });
  await expectResult(page, { raw: .04, assessment: 'low', tone: 'warn' });
  await choose(page, 'ACR'); await choose(page, 'AGs');
  await expect(page.locator('#S_Na')).toHaveValue('140,04');
  await expectResult(page, { raw: .04, assessment: 'low', tone: 'warn' });
  await restore(page); await choose(page, 'ACR');
  for (const id of ELECTROLYTES) await expect(page.locator('#' + id)).toHaveAttribute('type', 'number');
  await choose(page, 'AGs');
  for (const id of ELECTROLYTES) await expect(page.locator('#' + id)).toHaveAttribute('type', 'text');
  await applySession(page, { version: 2, currentVersion: 'advanced', selectedFormula: 'AGs', inputs: { currentVersion: 'advanced', formulaPicker: 'AGs', S_Na: '140' } });
  await expect(page.locator('#S_Cl')).toHaveValue(''); await expect(page.locator('#S_HCO3')).toHaveValue('');
  await expect(page.locator('#AGS_albuminEnabled')).not.toBeChecked();
  await expectBlocked(page);
  await applySession(page, { version: 2, currentVersion: 'advanced', selectedFormula: 'AGs', preservedInputs: { ...base, S_Na: '140,1', S_Cl: '116', S_HCO3: '24,1' } });
  await expectResult(page, { raw: 0, assessment: 'low', tone: 'warn' });
});

test('AG surowicy: schowek i Word zachowują znak, normę oraz pomocniczą korekcję albuminy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { S_Na: '139.96', S_Cl: '116', S_HCO3: '24', AGS_albuminEnabled: true, S_Albumin: '20' });
  const result = await expectResult(page, { raw: -.04, assessment: 'low', tone: 'warn' });
  await page.evaluate(() => {
    window.__agsClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__agsClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  const copied = await page.evaluate(() => window.__agsClipboard);
  const pending = page.waitForEvent('download'); await kliknij(page.locator('#downloadDOCX'));
  const download = await pending, source = await fs.readFile(await download.path(), 'utf8');
  const word = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, source);
  for (const exported of [copied, word]) {
    expect(exported).toContain(result.display.text);
    expect(exported).toContain('7–15');
    expect(exported).toContain('albumin');
    expect(exported).toContain('mmol/L');
  }
});
