import { expect } from '@playwright/test';
import { otworzBadania, otworzSejf, sekcjaBadan, bezBaneraZgody } from './lab-historia-dane.mjs';
import { createKlirensSearchEnvironment } from './klirens-search-all-formulas.mjs';

export async function prepareM1(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await bezBaneraZgody(page);
  const patientId = await otworzSejf(page);
  const root = createKlirensSearchEnvironment();
  const parameter = root.ClcrSavedResults.getParam('AGu_spot');
  const result = root.VildaClcrUag.evaluate({ urineSodium: '40', urinePotassium: '30', urineChloride: '82' }, root.VildaClcrUagReferenceData.DEFAULT_POLICY);
  const point = { ...parameter, parameterKey: parameter.id, valueNum: result.rawValue };
  root.ClcrUagPersistence.augmentDatapoint({ getAttribute: key => key === 'data-clcr-uag-snapshot' ? JSON.stringify(result) : null }, point);
  const renal = root.ClcrSavedResults.buildPatientNotePayload(point, { patientId, clinicalDateISO: '2026-06-02' });
  const ids = await page.evaluate(async ({ patientId, renal }) => {
    const ids = {};
    for (const [key, test, value, norm, date] of [
      ['above', 'TSH', '5,60', '0,7–4,2 mIU/L', '2026-01-14'],
      ['below', 'TSH', '0,30', '0,7–4,2 mIU/L', '2026-02-25'],
      ['within', 'TSH', '2,30', '0,7–4,2 mIU/L', '2026-04-08'],
      ['zero', 'LH', '0', '', '2026-06-02'],
    ]) ids[key] = (await window.VildaVault.savePatientNote({ patientId, category: 'wynik-badania',
      title: 'Fikcyjny test M1 ' + key, body: '', clinicalDateISO: date,
      labResult: { test, testKey: test.toLowerCase(), value, valueNum: Number(value.replace(',', '.')), unit: test === 'LH' ? 'IU/L' : 'mIU/L', ...(norm ? { norm } : {}) } })).id;
    ids.renal = (await window.VildaVault.savePatientNote(renal)).id;
    return ids;
  }, { patientId, renal });
  const notes = () => page.evaluate(async id => JSON.stringify((await window.VildaVault.listPatientNotesForPatient(id)).sort((a,b)=>a.id.localeCompare(b.id))), patientId);
  const before = await notes();
  await otworzBadania(page, patientId);
  const section = sekcjaBadan(page);
  await showCharts(section);
  return { patientId, ids, notes, before, section };
}

// Every click on a view button runs setView → preserveViewport
// (vilda_lab_history_tab.js), which restores the ancestor scroll positions it
// saw at the click once more in the next animation frame. Under page.clock that
// frame is a fake timer and can arrive after the test's next command, undoing
// its scrollIntoViewIfNeeded. Wait for two page frames, as the view-switch
// contract test does (lab-results-presentation-controls.mjs), before the test
// scrolls or measures.
export async function showCharts(section, { tap = false } = {}) {
  const control = section.locator('[data-view="charts"]');
  if (tap) await control.tap();
  else await control.click();
  await control.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}

// A selection must not replace the plotted DOM, move an ancestor scroller or
// move the page. The same snapshot also verifies returning from explicit Details.
export async function pointViewport(control) {
  return control.evaluate(point => {
    const bounds = point.closest('.vilda-lab-hist-card').getBoundingClientRect();
    const scrolls = [];
    for (let parent = point; parent; parent = parent.parentElement) scrolls.push([parent.scrollTop, parent.scrollLeft]);
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      pageX: window.scrollX, pageY: window.scrollY, scrolls };
  });
}

export function expectSameViewport(before, after) {
  for (const coordinate of ['x', 'y', 'width', 'height']) expect(Math.abs(before[coordinate] - after[coordinate]), coordinate).toBeLessThanOrEqual(0.5);
  expect(after.pageX).toBe(before.pageX);
  expect(after.pageY).toBe(before.pageY);
  expect(after.scrolls).toEqual(before.scrolls);
}

export async function verifyM1(page, width) {
  const { ids, notes, before, section } = await prepareM1(page, width);
  const bubble = page.locator('.vilda-lab-point-preview-bubble');
  for (const [key, value, color] of [
    ['above', '5,6', 'rgb(207, 34, 46)'], ['below', '0,3', 'rgb(207, 34, 46)'],
    ['within', '2,3', 'rgb(8, 127, 91)'], ['zero', '0', 'rgb(38, 63, 73)'],
  ]) {
    const control = section.locator(`[data-note-id="${ids[key]}"].vilda-lab-result-chart-point`);
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('strong')).toHaveText(value);
    await expect(bubble.locator('strong')).toHaveCSS('color', color);
    await expect(bubble.locator('.vilda-lab-point-preview-unit')).toHaveText(key === 'zero' ? 'IU/L' : 'mIU/L');
    await expect(bubble.locator('button,time')).toHaveCount(0);
    expect(await control.getAttribute('title')).toBeNull();
    const box = await bubble.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(width - 11);
    expect(box.height).toBeLessThan(70);
    await page.keyboard.press('Escape');
    await expect(bubble).toHaveCount(0);
  }
  const above = section.locator(`[data-note-id="${ids.above}"].vilda-lab-result-chart-point`);
  await above.scrollIntoViewIfNeeded();
  if (width > 600) {
    await above.hover();
    await expect(bubble).toBeVisible();
    const below = section.locator(`[data-note-id="${ids.below}"].vilda-lab-result-chart-point`);
    await below.hover();
    await page.waitForTimeout(220);
    await expect(bubble.locator('strong')).toHaveText('0,3');
    await bubble.hover();
    await page.waitForTimeout(220);
    await expect(bubble).toBeVisible();
    await page.keyboard.press('Escape');
  } else {
    const position = await pointViewport(above);
    await above.tap();
    await expect(bubble).toBeVisible();
    await expect(above).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('dialog.vilda-result-details-dialog[open]')).toHaveCount(0);
    await expect(page.locator('.vilda-lab-result-chart-chooser:not([hidden])')).toHaveCount(0);
    expectSameViewport(position, await pointViewport(above));
    // Keep the deliberate hold path too: native short tap and the previous
    // long-hold contract both provide the same saved-value-only M1.
    await above.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50 });
    await page.waitForTimeout(450);
    await above.dispatchEvent('pointerup', { pointerType: 'touch' });
    await above.dispatchEvent('click');
    await expect(bubble).toBeVisible();
    await expect(page.locator('dialog.vilda-result-details-dialog[open]')).toHaveCount(0);
    expectSameViewport(position, await pointViewport(above));
    await page.keyboard.press('Escape');
  }
  const position = await pointViewport(above);
  if (width > 600) await above.click();
  else await section.locator('.vilda-lab-hist-card[data-series="tsh"] .vilda-lab-hist-chart-details').tap();
  const details = page.locator('#labResultDetailsDialog');
  await expect(details).toHaveClass(/vilda-result-details-dialog/);
  await expect(details.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.above}"]`)).toBeVisible();
  expectSameViewport(position, await pointViewport(above));
  if (width <= 600) {
    const bounds = await details.boundingBox();
    expect(Math.abs(bounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.width - width)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - 1000)).toBeLessThanOrEqual(1);
  }
  await expect(bubble).toHaveCount(0);
  await details.getByRole('button', { name: 'Zamknij szczegóły wyniku', exact: true }).click();
  await expect(details).toBeHidden();
  expectSameViewport(position, await pointViewport(above));
  const zero = section.locator(`[data-note-id="${ids.zero}"].vilda-lab-result-chart-point`);
  await zero.scrollIntoViewIfNeeded(); await zero.focus();
  await expect(bubble).toBeVisible();
  await page.evaluate(() => document.querySelector('.vilda-lab-hist').setAttribute('aria-hidden','true'));
  await expect(bubble).toHaveCount(0);
  await page.evaluate(() => document.querySelector('.vilda-lab-hist').removeAttribute('aria-hidden'));
  await above.scrollIntoViewIfNeeded(); await above.focus();
  await expect(bubble).toBeVisible();
  await section.locator('[data-view="table"]').click();
  await expect(bubble).toHaveCount(0);
  await section.locator('[data-view="charts"]').click();
  const renalControl = section.locator(`[data-note-id="${ids.renal}"].vilda-lab-result-chart-point`);
  await renalControl.scrollIntoViewIfNeeded(); await renalControl.focus();
  await expect(bubble).toBeVisible();
  await expect(bubble.locator('strong')).toHaveText(/[-−]12/);
  await expect(bubble.locator('.vilda-lab-point-preview-unit')).toHaveText('mmol/L');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:session-changed')));
  await expect(bubble).toHaveCount(0);
  expect(await notes()).toBe(before);
}
