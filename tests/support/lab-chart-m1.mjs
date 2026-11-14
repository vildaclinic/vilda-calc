import { expect } from '@playwright/test';
import { otworzBadania, otworzSejf, sekcjaBadan, bezBaneraZgody } from './lab-historia-dane.mjs';
import { createKlirensSearchEnvironment } from './klirens-search-all-formulas.mjs';

export async function verifyM1(page, width) {
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
  await section.locator('[data-view="charts"]').click();
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
    await above.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 50, clientY: 50 });
    await page.waitForTimeout(450);
    await above.dispatchEvent('pointerup', { pointerType: 'touch' });
    await above.dispatchEvent('click');
    await expect(bubble).toBeVisible();
    await expect(section.locator('.vilda-lab-hist-result-details')).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await above.click();
  await expect(section.locator(`.vilda-lab-hist-result-details[data-note-id="${ids.above}"]`)).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await section.getByRole('button', { name: 'Zamknij szczegóły wyniku', exact: true }).click();
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
