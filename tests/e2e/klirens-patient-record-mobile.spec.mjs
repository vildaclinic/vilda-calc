import { expect, test } from '../support/test-czas.mjs';
import { openCalculator, applyAcr, applyU25, saveVisible, memory, selectPatient } from '../support/klirens-patient-record.mjs';

test.use({ chwila: '2026-10-25T12:00:00Z' });

async function expectGeometry(page, { editor = false } = {}) {
  const measured = await page.evaluate(withEditor => ({
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panels: [...document.querySelectorAll('#clcrPatientCard .cpc-inner, .vilda-auth-card, #detailsDialog, #editDialog, #deleteDialog')]
      .filter(element => element.checkVisibility()).map(element => ({ id: element.id || element.className,
        overflow: element.scrollWidth - element.clientWidth, width: element.getBoundingClientRect().width })),
    fields: withEditor ? [...document.querySelectorAll('#editDialog input, #editDialog select')]
      .filter(element => element.checkVisibility()).map(element => ({ id: element.id,
        height: element.getBoundingClientRect().height, font: parseFloat(getComputedStyle(element).fontSize) })) : [],
  }), editor);
  expect(measured.pageOverflow, 'no whole-page horizontal scrolling').toBeLessThanOrEqual(1);
  for (const panel of measured.panels) expect(panel.overflow, `${panel.id}: no horizontal overflow`).toBeLessThanOrEqual(1);
  for (const field of measured.fields) {
    expect(field.height, `${field.id}: touch target`).toBeGreaterThanOrEqual(48);
    expect(field.font, `${field.id}: prevent typical mobile auto-zoom`).toBeGreaterThanOrEqual(16);
  }
  return measured;
}

for (const width of [390, 320]) {
  test(`${width}px: all same-day points, native editor fields and exact delete stay readable and usable`, async ({ page }) => {
    await openCalculator(page, { width });
    const notes = [];
    for (const value of ['13.6', '45', '255.9']) {
      await applyAcr(page, value); notes.push((await saveVisible(page))[0]);
    }
    await page.locator('#clcrOpenBadaniaBtn').click();
    const history = page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
    await expect(history.locator('tr[data-note-id]')).toHaveCount(3);
    await expect(history.locator('.vilda-clcr-point')).toHaveCount(3);
    const chartScroll = await history.locator('.vilda-clcr-chart-scroll').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(chartScroll, 'three accepted demo points fit the phone without chart panning').toBeLessThanOrEqual(1);
    await expectGeometry(page);
    const middle = notes[1].id;
    await history.locator(`.vilda-clcr-point[data-note-id="${middle}"]`).tap();
    await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', middle);
    await page.locator('#editMeasurement').tap();
    await expectGeometry(page, { editor: true });
    await page.locator('#changeHistoricalContext').tap();
    await expectGeometry(page, { editor: true });
    await page.locator('[data-clcr-edit-field="U_Alb"]').fill('13.6');
    await page.locator('#saveEditedMeasurement').tap();
    await expect(page.locator('#editDialog')).toBeHidden();
    await expect(page.locator('#calculationDetails')).toContainText('13,6');
    expect((await memory(page)).notes.map(note => note.id)).toEqual(notes.map(note => note.id));
    await page.locator('#deleteMeasurement').tap();
    await expectGeometry(page);
    await page.locator('#deleteDialog').getByRole('button', { name: 'Anuluj', exact: true }).tap();
    expect((await memory(page)).notes).toHaveLength(3);
    await page.locator('#deleteMeasurement').tap();
    await page.locator('#confirmDeleteMeasurement').tap();
    await expect(history.locator(`tr[data-note-id="${middle}"]`)).toHaveCount(0);
    await expect(history.locator(`tr[data-note-id="${notes[2].id}"]`)).toHaveCount(1);
    await expectGeometry(page);
    await page.evaluate(() => window.VildaAuthUI.hide());
    await page.locator('#clcrOpenHistoryBtn').tap();
    await expect(page.locator('#clcrPatientCard tr[data-note-id]')).toHaveCount(2);
    await expectGeometry(page);
    await page.locator('#cpcNew').tap();
    await expect(page.locator('#U_Alb')).toHaveValue('');
    await expect(page.locator('#U_Alb')).toBeFocused();
    expect((await memory(page)).notes).toHaveLength(2);
    expect((await memory(page)).originalsLocked).toBe(true);
  });
}

test('390px: U25 serum fields and historical age/sex keep16px/48px dimensions', async ({ page }) => {
  await openCalculator(page, { width: 390 });
  await applyU25(page);
  const [note] = await saveVisible(page);
  await page.locator('#clcrOpenBadaniaBtn').tap();
  await page.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`).tap();
  await page.locator('#editMeasurement').tap();
  await page.locator('#changeHistoricalContext').tap();
  const geometry = await expectGeometry(page, { editor: true });
  expect(geometry.fields.some(field => field.id === 'editAge')).toBe(true);
  expect(geometry.fields.some(field => field.id === 'editSex')).toBe(true);
  await page.locator('#editDialog').getByRole('button', { name: 'Anuluj', exact: true }).first().tap();
  expect((await memory(page)).notes).toEqual([note]);
});

for (const width of [390, 320]) {
  test(`${width}px: patient prerequisite is visible before fields and stable across anonymous/selected states`, async ({ page }) => {
    await openCalculator(page, { width, select: false });
    await applyAcr(page, '45');
    await expect(page.locator('#clcrPatientContext')).toBeVisible();
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    const before = await page.locator('#clcrPatientContext').evaluate(element => {
      const panel = document.getElementById('clcrActivePanel');
      return { width: element.getBoundingClientRect().width,
        beforeFields: Boolean(element.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    expect(before.beforeFields).toBe(true);
    for (const id of ['clcrChoosePatientBtn']) {
      const measured = await page.locator(`#${id}`).evaluate(element => ({
        height: element.getBoundingClientRect().height, font: parseFloat(getComputedStyle(element).fontSize),
      }));
      expect(measured.height, `${id}: touch target`).toBeGreaterThanOrEqual(48);
      expect(measured.font, `${id}: legible mobile control`).toBeGreaterThanOrEqual(16);
    }
    await expectGeometry(page);
    await selectPatient(page);
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    await page.locator('#clcrStartPatientMeasurementBtn').tap();
    await applyAcr(page, '13.6');
    await expect(page.locator('#clcrVisitSaveBtn')).toBeEnabled();
    const afterWidth = await page.locator('#clcrPatientContext').evaluate(element => element.getBoundingClientRect().width);
    expect(afterWidth).toBeCloseTo(before.width, 1);
    await expectGeometry(page);
    expect((await memory(page)).saves).toHaveLength(0);
  });
}
