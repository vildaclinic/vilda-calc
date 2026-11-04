import { showClcrResults, showBadaniaView } from '../support/badania-klirens.mjs';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, openShellCalculator, saveVisible, selectPatient } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, DEFAULT_RESULT, details, displayedNumber, expectBlocked, expectResult, openCalculator, REMOVED_RESULT_SENTENCE, restore } from './urate-creatinine.helpers.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY }; };
    const textBoxes = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom })); };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#urateCreatinineInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      units: [...document.querySelectorAll('.urate-creatinine-result-unit,.urate-creatinine-reference-unit')].map(node => node.getBoundingClientRect().top),
      controls: [...document.querySelectorAll('#urateCreatinineInputCard input,#urateCreatinineInputCard select,#urateCreatinineInputCard button')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), type: node.tagName, font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
      numbers: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .urate-creatinine-reference-value')].filter(node => node.classList.contains('clcr-result-value') || JSON.parse(node.closest('[data-clcr-urate-creatinine-snapshot]').getAttribute('data-clcr-urate-creatinine-snapshot')).referenceAvailable).map(node => {
        const rect = node.getBoundingClientRect(), container = node.closest('.clcr-result-patient,.clcr-result-reference').getBoundingClientRect();
        return { text: node.textContent, lines: textBoxes(node), left: rect.left, right: rect.right, boxLeft: container.left, boxRight: container.right };
      }),
      axis: document.querySelector('.urate-creatinine-norm-axis') ? {
        text: document.querySelector('.urate-creatinine-norm-axis').textContent,
        boundaries: document.querySelectorAll('.urate-creatinine-norm-boundary').length,
      } : null,
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(result.form.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(result.clear.top - result.input.bottom).toBeGreaterThanOrEqual(15);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.active.top - result.report.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.active.width - result.report.width)).toBeLessThanOrEqual(1);
  }
  for (const control of result.controls) {
    if (control.type !== 'BUTTON') expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  for (const number of result.numbers) {
    expect(number.left, number.text).toBeGreaterThanOrEqual(number.boxLeft - 1);
    expect(number.right, number.text).toBeLessThanOrEqual(number.boxRight + 1);
    expect(number.lines).toHaveLength(1);
    for (const line of number.lines) {
      expect(line.left, number.text).toBeGreaterThanOrEqual(number.boxLeft - 1);
      expect(line.right, number.text).toBeLessThanOrEqual(number.boxRight + 1);
    }
  }
  if (result.units.length === 2) expect(Math.abs(result.units[0] - result.units[1])).toBeLessThanOrEqual(1);
  if (result.axis) expect(result.axis.boundaries).toBe(2);
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`KM/Cr: dwa stężenia, jeden wynik i stała geometria ${width}px`, async ({ page }, testInfo) => {
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { if (new URL(request.url()).origin === new URL(page.url()).origin) failures.push(request.url()); });
    await openCalculator(page, width);
    await restore(page, { URCR_uricAcid: '', URCR_creatinine: '' }); await expectBlocked(page);
    await expect(page.locator('#urateCreatinineInputCard input:visible')).toHaveCount(2);
    await expect(page.locator('#urateCreatinineInputCard select:visible')).toHaveCount(2);
    for (const id of ['age', 'sex', 'weight', 'height', 'collectionStartAt', 'collectionEndAt', 'U_UA', 'Ucr', 'V24', 'URCR_outputUnit']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#URCR_uricAcid').fill('100'); await page.locator('#URCR_creatinine').fill('100');
    const high = await expectResult(page); expect(high.presentation.referenceValue).toBe('0,11–0,53');
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('Norma dla wieku');
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('Newcastle');
    await expect(page.locator('#clcrInfo')).toBeEmpty(); sameWidths(initial, await geometry(page, width));
    const image = testInfo.outputPath(`urate-creatinine-default-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: image }); await testInfo.attach(`urate-creatinine-default-${width}`, { path: image, contentType: 'image/png' });
    await page.locator('[data-urate-creatinine-mode="reported"]').click();
    await expect(page.locator('#urateCreatinineInputCard input:visible')).toHaveCount(1);
    await expect(page.locator('#urateCreatinineInputCard select:visible')).toHaveCount(1);
    for (const [URCR_reportedValue, expected] of [
      ['0.3', { raw: 0.3, status: 'within', tone: 'normal' }],
      ['0.1', { raw: 0.1, status: 'low', tone: 'warning' }],
      ['0', { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true }],
      ['1e-300', { raw: 1e-300, status: 'low', tone: 'warning' }],
      ['1.7976931348623157e308', { raw: 1.7976931348623157e308 }],
    ]) {
      await page.locator('#URCR_reportedValue').fill(URCR_reportedValue); const model = await expectResult(page, expected);
      if (URCR_reportedValue === '1e-300') expect(model.rawValue).toBe(1e-300);
      sameWidths(initial, await geometry(page, width));
    }
    await restore(page, { age: '', URCR_inputMode: 'reported', URCR_reportedValue: '0.3' });
    await expectResult(page, { raw: 0.3, status: 'unassessed', tone: 'neutral', reference: false }); sameWidths(initial, await geometry(page, width));
    await restore(page, { URCR_specimen: 'timed' }); await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false }); sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click(); await expect(details(page)).toContainText('Newcastle'); sameWidths(initial, await geometry(page, width));
    await restore(page);
    await page.locator('[aria-controls="urateCreatinineSpecimenEditor"]').click(); await expect(page.locator('#URCR_specimen')).toBeVisible();
    await page.locator('#URCR_specimen').selectOption('timed'); await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    sameWidths(initial, await geometry(page, width));
    for (const family of ['Arial, sans-serif', '"DejaVu Sans", sans-serif', '"Liberation Sans", sans-serif', 'cursive']) {
      await page.addStyleTag({ content: `.urate-creatinine-proposal-card :is(.clcr-result-value,.urate-creatinine-reference-value) { font-family: ${family} !important; }` });
      await restore(page, { URCR_inputMode: 'reported', URCR_reportedValue: '0.53000000000000000001' });
      const exact = await expectResult(page, { raw: 0.53 }); expect(exact.presentation.valueText).toMatch(/^≈/);
      for (const value of ['0.53', '1000', '99999', '1e-300', '1.7976931348623157e308']) {
        await page.locator('#URCR_reportedValue').fill(value);
        await expectResult(page, { raw: Number(value), ...(value === '0.53' ? { status: 'within', tone: 'normal' } : value === '1e-300' ? { status: 'low', tone: 'warning' } : {}) });
        sameWidths(initial, await geometry(page, width));
      }
    }
    await page.locator('#URCR_reportedValue').fill('-1'); await expectBlocked(page); sameWidths(initial, await geometry(page, width));
    await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page); await expectBlocked(page); sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]); expect(failures).toEqual([]);
  });
}

test('KM/Cr: znany wiek dobiera jeden profil Newcastle, brak wieku nie blokuje liczby', async ({ page }) => {
  await openCalculator(page);
  for (const [age, ageMonths, reference, status] of [
    ['0', '', '0,42–1,53', 'within'], ['1', '11', '0,42–1,53', 'within'],
    ['2', '', '0,57–1,35', 'within'], ['5', '11', '0,57–1,35', 'within'],
    ['6', '', '0,39–0,85', 'within'], ['9', '11', '0,39–0,85', 'within'],
    ['10', '', '0,15–0,67', 'within'], ['17', '11', '0,15–0,67', 'within'],
    ['18', '', '0,11–0,53', 'high'], ['90', '', '0,11–0,53', 'high'],
    ['', '', null, 'unassessed'], ['1', '12', null, 'unassessed'], ['2.5', '', null, 'unassessed'],
  ]) {
    await restore(page, { age, ageMonths, URCR_inputMode: 'reported', URCR_reportedValue: '0.67' });
    const model = await expectResult(page, { raw: 0.67, status, tone: status === 'within' ? 'normal' : status === 'high' ? 'warning' : 'neutral', reference: !!reference });
    if (reference) expect(model.presentation.referenceValue).toBe(reference);
    for (const id of ['age', 'sex', 'weight', 'height']) await expect(page.locator('#' + id)).toBeHidden();
  }
  for (const [age, low, high] of [['1','0.42','1.53'],['2','0.57','1.35'],['6','0.39','0.85'],['10','0.15','0.67'],['18','0.11','0.53']]) {
    for (const value of [low, high]) { await restore(page, { age, URCR_inputMode: 'reported', URCR_reportedValue: value }); await expectResult(page, { raw: Number(value), status: 'within', tone: 'normal' }); }
  }
});

test('KM/Cr: jednostki opisują wpisane stężenia, a zero, małe liczby i niepoprawne dane zachowują znaczenie', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page); await expectResult(page, { guest: false });
  await page.locator('#URCR_uricAcidUnit').selectOption('mg/L');
  await expect(page.locator('#URCR_uricAcid')).toHaveValue('100'); await expectResult(page, { raw: 0.06728927487954316, status: 'low', tone: 'warning', guest: false });
  await page.locator('#URCR_creatinineUnit').selectOption('mg/L'); await expectResult(page, { guest: false });
  await restore(page, { URCR_uricAcid: '1', URCR_uricAcidUnit: 'mmol/L', URCR_creatinine: '1000', URCR_creatinineUnit: 'µmol/L' }); await expectResult(page, { raw: 1, guest: false });
  for (const [value, unit] of [['1','mg/mg'],['1000','mg/g']]) { await restore(page, { URCR_inputMode: 'reported', URCR_reportedValue: value, URCR_reportedUnit: unit }); await expectResult(page, { guest: false }); }
  await restore(page, { URCR_uricAcid: '201' }); await expectResult(page, { raw: Number('1.3525144250788174'), guest: false });
  await restore(page, { URCR_uricAcid: '0' }); const zero = await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', guest: false, reference: false, available: true });
  expect(zero.outOfRange).toBeNull(); const [savedZero] = await saveVisible(page, '2026-11-01'); expect(savedZero.labResult.valueNum).toBe(0);
  await restore(page, { URCR_uricAcid: '0.04' }); const tiny = await expectResult(page, { raw: 0.0002691570995181726, status: 'low', tone: 'warning', guest: false });
  expect(displayedNumber(tiny.presentation.valueText)).toBeGreaterThan(0); const [savedTiny] = await saveVisible(page, '2026-11-02');
  expect(savedTiny.labResult.valueNum).toBeGreaterThan(0); expect(savedTiny.labResult.value).toBe(tiny.presentation.valueText);
  for (const fields of [{ URCR_uricAcid: '-1' }, { URCR_creatinine: '-1' }, { URCR_uricAcid: '-1', URCR_creatinine: '-1' }, { URCR_creatinine: '0' }, { URCR_uricAcid: '<0.1' }, { URCR_uricAcid: 'Infinity' }, { URCR_uricAcid: '1e-300', URCR_creatinine: '1e100' }]) { await restore(page, fields); await expectBlocked(page); }
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('KM/Cr: zapis wymaga wybranej zapisanej karty pacjenta', async ({ page }) => {
  await openCalculator(page); await restore(page); await expectResult(page);
  await installMemoryVault(page, { select: false }); await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled(); expect((await memory(page)).notes).toEqual([]);
  await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
  await selectPatient(page); await restore(page); await expectResult(page, { guest: false });
  const [note] = await saveVisible(page, '2026-11-02'); expect(note.patientId).toBeTruthy(); expect((await memory(page)).notes).toHaveLength(1);
});

test('KM/Cr: typ próbki i jednostki zachowują się po odtworzeniu sesji bez nowej ankiety', async ({ page }) => {
  await openCalculator(page); await restore(page, { URCR_specimen: 'timed', URCR_uricAcidUnit: 'mg/L', URCR_creatinineUnit: 'mg/L' });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await page.locator('#URCR_uricAcid').fill('101');
  await expect.poll(() => page.evaluate(() => window.VildaPersistence?.readClcrSession?.()?.inputs.URCR_uricAcid)).toBe('101');
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#URCR_specimen')).toHaveValue('timed'); await expect(page.locator('#URCR_uricAcidUnit')).toHaveValue('mg/L');
  await expectResult(page, { raw: 0.6796216762833859, status: 'unassessed', tone: 'neutral', reference: false });
  await applySession(page, { version: 2, currentVersion: 'advanced', selectedFormula: 'KM_Cr', inputs: { age: '8', U_UA: '100', Ucr: '100' } });
  await expect(page.locator('#URCR_specimen')).toHaveValue('unknown'); await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
});

test('KM/Cr: Badania i Notatki odczytują ten sam zamrożony wynik bez bieżącego silnika', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page); const high = await expectResult(page, { guest: false });
  const [assessed] = await saveVisible(page, '2026-11-01'); expect(assessed.labResult.value).toBe(high.presentation.valueText);
  await restore(page, { age: '', URCR_specimen: 'unknown' }); await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-11-02');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrUrateCreatinine;
    window.VildaClcrUrateCreatinine = new Proxy({}, { get() { return () => { throw Error('Historical KM/Cr must not recalculate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; } finally { window.VildaClcrUrateCreatinine = engine; }
  }, [assessed, unassessed]);
  expect(projected[0]).toMatchObject({ valueNum: high.rawValue, displayValue: high.presentation.valueText, unit: 'mmol/mmol', norm: high.presentation.referenceText, outOfRange: true });
  expect(projected[1]).toMatchObject({ norm: '', outOfRange: null }); expect(new Set(projected.map(point => point.parameterKey))).toEqual(new Set(['clcr:KM_Cr']));
  await page.evaluate(notes => { window.__urateSyntheticNotes = notes; }, [assessed, unassessed]);
  const history = await readVisibleSavedHistory(page, '__urateSyntheticNotes'); expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds); expect(history.points).toHaveLength(2);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts'); await expect(page.locator('.vilda-lab-hist .vilda-lab-hist-card[data-source="clcr"] .vilda-lab-result-chart-point')).toHaveCount(2);
  await page.locator('button[data-tab="notes"]').click(); const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const hidden of ['VILDA_CLCR','engineVersion','exactMain','[tekst]',REMOVED_RESULT_SENTENCE]) await expect(notes.first()).not.toContainText(hidden);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('KM/Cr: edycja odrzuca każdy ujemny operand i zachowuje ID przy poprawie lub usunięciu', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page); await expectResult(page, { guest: false });
  const [first] = await saveVisible(page, '2026-11-01');
  await restore(page, { URCR_inputMode: 'reported', URCR_reportedValue: '0.3' }); await expectResult(page, { raw: 0.3, status: 'within', tone: 'normal', guest: false }); const [sibling] = await saveVisible(page, '2026-11-02');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first); await page.locator('#editMeasurement').click();
  for (const [ua, cr] of [['-1','100'],['100','-1'],['-1','-1'],['100','0']]) { await page.locator('#editField-URCR_uricAcid').fill(ua); await page.locator('#editField-URCR_creatinine').fill(cr); await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible(); expect((await memory(page)).updates).toHaveLength(0); }
  await page.locator('#editField-URCR_uricAcid').fill('60'); await page.locator('#editField-URCR_creatinine').fill('100'); await page.locator('#editDate').fill('2026-10-31');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored=await memory(page); const edited=stored.notes.find(note=>note.id===first.id); expect(edited.id).toBe(first.id); expect(edited.labResult.valueNum).toBeCloseTo(Number('0.40373564927725894'),14); expect(edited.clinicalDateISO).toBe('2026-10-31'); expect(stored.notes.find(note=>note.id===sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click(); await expect(page.locator('#detailsDialog')).toBeHidden(); stored=await memory(page); expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('KM/Cr: dawny zapis pozostaje w mg/mg, a jego edycja nie wymyśla typu próbki', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  const old = await page.evaluate(() => {
    const api=window.ClcrSavedCalculation, values={U_UA:'20',Ucr:'100',age:'10',sex:'F'};
    const point={id:'KM_Cr',sourceFormulaId:'KM_Cr',label:'Kwas moczowy/kreatynina (DZM)',rawValue:0.2,valueNum:0.2,displayValue:'0.200',unit:'mg/mg',norm:'',tone:'neutral',outOfRange:null};
    const snapshot=api.createSnapshot(point,{capture:{formulaId:'KM_Cr',ageYears:10,values,fields:Object.keys(values).map(id=>({id,label:id,type:'text'}))},clinicalDateISO:'2025-10-21'});
    const note={id:'fictional-kmcr-legacy',patientId:window.ClcrVisitSave.resolveCurrentPatientId(),category:'wynik-klirens',rev:1,title:point.label,clinicalDateISO:'2025-10-21',body:'Kalkulator klirensu · clcr:KM_Cr',labResult:{test:point.label,value:'0.200',valueNum:0.2,unit:'mg/mg',norm:''}};
    note.body+='\n\n'+api.serializeSnapshot(snapshot,note);if(!api.readSaved(note).valid)throw Error('Legacy KM/Cr must round trip');window.__clcrRecordFixture.seed([note]);return note;
  });
  const before=await page.evaluate(note=>window.ClcrSavedResults.projectPatientNotes([note]).measurements[0],old);expect(before).toMatchObject({valueNum:0.2,displayValue:'0.200',unit:'mg/mg',norm:''});expect((await memory(page)).notes).toEqual([old]);
  await page.evaluate(note=>window.ClcrResultDetails.open({patientId:note.patientId,noteId:note.id}),old);await page.locator('#editMeasurement').click();await expect(page.locator('#editField-URCR_specimen')).toHaveValue('unknown');
  await page.locator('#editField-URCR_uricAcid').fill('40');await page.locator('#saveEditedMeasurement').click();await expect(page.locator('#editDialog')).toBeHidden();
  const edited=(await memory(page)).notes.find(note=>note.id===old.id);expect(edited.id).toBe(old.id);const result=await page.evaluate(note=>window.ClcrSavedResults.projectPatientNotes([note]).measurements[0],edited);expect(result).toMatchObject({unit:'mmol/mmol',norm:'',outOfRange:null});expect(result.valueNum).toBeCloseTo(0.2691570995181726,14);
});

test('KM/Cr: karta Start leniwie odczytuje i edytuje pojedynczy pomiar', async ({ page }) => {
  const {calculator,start}=await openShellCalculator(page);await restore(calculator);await expectResult(calculator,{guest:false});const [note]=await saveVisible(calculator,'2026-11-02');
  await calculator.locator('#clcrOpenCardBtn').click();
  await showClcrResults(start, 'table');await expect(page).toHaveURL(/app\.html#\/start/);
  const history=start.locator('.vilda-lab-hist');await expect(history.locator(`.vilda-lab-hist-result-row[data-source="clcr"][data-note-id="${note.id}"]`)).toHaveCount(1);
  await showBadaniaView(start, 'table');
  await history.locator(`.vilda-lab-hist-result-row[data-source="clcr"][data-note-id="${note.id}"] .vilda-lab-hist-result-value`).click();await start.locator('#editMeasurement').click();await start.locator('#editField-URCR_uricAcid').fill('60');await start.locator('#saveEditedMeasurement').click();await expect(start.locator('#editDialog')).toBeHidden();
  await start.locator('#detailsDialog').getByRole('button',{name:'Zamknij',exact:true}).click();
  await showBadaniaView(start, 'charts');
  await expect.poll(async()=>Number(await history.locator(`.vilda-lab-hist-card[data-source="clcr"] .vilda-lab-result-chart-point[data-note-id="${note.id}"]`).getAttribute('data-value'))).toBeCloseTo(Number('0.40373564927725894'),14);
  expect((await memory(start)).notes).toHaveLength(1);expect((await memory(start)).originalsLocked).toBe(true);
});

test('KM/Cr: raporty AI i Word zachowują jeden wynik i normę bez usuniętego komentarza', async ({ page }) => {
  await openCalculator(page);await page.evaluate(()=>{window.__urateClipboard='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__urateClipboard=value;}}});window.alert=()=>{};});
  await restore(page);const model=await expectResult(page);const expected=[model.presentation.valueText,model.presentation.unitText,model.presentation.referenceText,model.interpretation];
  await page.locator('#askAI').click();await expect.poll(()=>page.evaluate(()=>window.__urateClipboard)).toContain(model.presentation.valueText);const copied=await page.evaluate(()=>window.__urateClipboard);expect(copied).not.toContain(REMOVED_RESULT_SENTENCE);
  for(const value of expected)expect(copied.replace(/\s/g,'')).toContain(value.replace(/\s/g,''));
  const pending=page.waitForEvent('download');await page.locator('#downloadDOCX').click();const download=await pending,html=await fs.readFile(await download.path(),'utf8');const text=await page.evaluate(value=>new DOMParser().parseFromString(value,'text/html').body.textContent,html);expect(text).not.toContain(REMOVED_RESULT_SENTENCE);for(const value of expected)expect(text.replace(/\s/g,'')).toContain(value.replace(/\s/g,''));
});

test('KM/Cr: dokładny wynik tuż poza normą pozostaje oznaczony w Notatkach i Szczegółach', async ({ page }) => {
  await openCalculator(page);await installMemoryVault(page);await restore(page,{URCR_inputMode:'reported',URCR_reportedValue:'0.5300000000000000000001'});
  const model=await expectResult(page,{raw:0.53,guest:false});expect(model.presentation.valueText).toMatch(/^≈/);expect(model.presentation.fullValueText.replace(',','.')).toBe('0.5300000000000000000001');
  const [note]=await saveVisible(page,'2026-11-02');expect(note.labResult.valueNum).toBe(0.53);await page.locator('#clcrOpenBadaniaBtn').click();await page.locator('button[data-tab="notes"]').click();
  const compact=page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');await expect(compact).toHaveCount(1);await expect(compact).not.toContainText(REMOVED_RESULT_SENTENCE);await expect(compact.locator('.clcr-note-boundary')).toContainText('0,5300000000000000000001');
  await compact.getByRole('button',{name:'Szczegóły obliczenia →',exact:true}).click();await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id',note.id);await expect(page.locator('#calculationDetails')).toContainText(model.presentation.fullValueText);expect((await memory(page)).originalsLocked).toBe(true);
});
