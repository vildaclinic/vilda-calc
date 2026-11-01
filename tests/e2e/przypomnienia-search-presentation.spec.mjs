import { expect, test } from '@playwright/test';
import { openGlobalSearch, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';
import { GH_DOSE, GH_RAW_DOSE, presentationFingerprint, searchPresentationFixture } from '../support/search-presentation-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

async function preview(search, id) {
  await queryGlobal(search, 'Fikcyjny audyt');
  const row = resultFor(search, 'note', id);
  await expect(row).toBeVisible();
  await row.click();
  const body = search.locator('.vgs-detail .vb22-body');
  await expect(body).toBeVisible();
  return body;
}

async function backIfMobile(search, width) {
  if (width <= 700) await search.getByRole('button', { name: '← Wyniki wyszukiwania', exact: true }).click();
}

async function expectClinicalEnginesUnloaded(page) {
  expect(await page.evaluate(() => [window.VildaClcrCaDzm, window.ClcrCaDzmReferenceData,
    window.VildaClcrAcr, window.VildaClcrAcrReferenceData].every(value => value === undefined))).toBe(true);
}

for (const width of [1440, 390]) {
  test.describe(`Search presentation ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } });

    test('shows one recorded rhGH dose and one ordinary lab value, retaining zero and inequality without changing saved data', async ({ page }) => {
      const created = await searchPresentationFixture(page);
      const before = await presentationFingerprint(page, created);
      expect(await page.evaluate(() => Boolean(window.ClcrNotesView))).toBe(false);
      await expectClinicalEnginesUnloaded(page);
      const search = await openGlobalSearch(page);
      const gh = await preview(search, created.presentationNotes.gh);
      await expect(gh).toContainText(GH_DOSE);
      const text = await gh.textContent();
      expect(text.match(/Dawka:/g)).toHaveLength(1);
      expect(text).not.toContain(String(GH_RAW_DOSE));
      expect(text).not.toContain('Leczenie:');
      expect(text).not.toContain('mg/kg/d dzień');
      await backIfMobile(search, width);

      const numericDose = await preview(search, created.presentationNotes.ghNumeric);
      const formattedDose = await numericDose.textContent();
      expect(formattedDose).toContain('0,028 mg/kg/d');
      expect(formattedDose.match(/0,028 mg\/kg\/d/g) || []).toHaveLength(1);
      expect(formattedDose).not.toContain(String(GH_RAW_DOSE));
      expect(formattedDose).not.toContain('mg/kg/d dzień');
      await backIfMobile(search, width);

      for (const [key, value, duplicate] of [['formatted', '1,20', '1.2'], ['zero', '0', '0 0'], ['inequality', '<0,1', '0.1']]) {
        const body = await preview(search, created.presentationNotes[key]);
        const actual = await body.textContent();
        expect(actual).toContain(value + ' mg/L');
        expect(actual.split(value).length - 1).toBe(1);
        expect(actual).not.toContain(duplicate);
        await backIfMobile(search, width);
      }

      const unavailable = await preview(search, created.presentationNotes.unavailableContext);
      await expect(unavailable).toContainText('<0,1 IU/L');
      const detail = search.locator('.vgs-detail');
      await expect(detail.locator('.vilda-saved-lab-assessment [data-assessment-status="unavailable"]')).toBeVisible();
      await expect(detail.getByRole('heading', { name: 'Ocena niedostępna', exact: true })).toBeVisible();
      await expect(detail.locator('.vilda-saved-hormone-reference [data-reference-status="unavailable"]')).toBeVisible();
      await expect(detail.locator('.vilda-hormone-reference-message')).toHaveText('Zapisane odniesienie jest niedostępne.');
      await backIfMobile(search, width);
      expect(await presentationFingerprint(page, created)).toEqual(before);
      await expectClinicalEnginesUnloaded(page);
      expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });

    test('presents real persisted Ca and ACR through the same frozen model as Notes, and keeps a corrupted assessment unavailable', async ({ page }) => {
      const created = await searchPresentationFixture(page);
      const before = await presentationFingerprint(page, created);
      expect(await page.evaluate(() => Boolean(window.ClcrNotesView))).toBe(false);
      await expectClinicalEnginesUnloaded(page);
      const search = await openGlobalSearch(page);

      for (const key of ['calcium', 'acr', 'corrupted']) {
        const noteId = created.presentationNotes[key];
        const body = await preview(search, noteId);
        await page.waitForFunction(() => typeof window.ClcrNotesView?.model === 'function');
        const saved = await page.evaluate(async ({ id, patientId }) => {
          const note = await window.VildaVault.getPatientNote(id);
          return { note, model: window.ClcrNotesView.model(note, { patientId }), validCapture: window.ClcrSavedCalculation.readSaved(note).valid };
        }, { id: noteId, patientId: created.ids.a });
        expect(saved.model).not.toBeNull();
        expect(saved.validCapture).toBe(key !== 'corrupted');
        if (key !== 'corrupted') expect(saved.note.body).toContain('[VILDA_CLCR_CALCULATION_V1]');
        const model = saved.model;
        const actual = await body.textContent();
        expect(actual).toContain(`Wynik: ${model.display} ${model.unit}`);
        for (const field of ['norm', 'status', 'interpretation', 'boundary', 'caution', 'comment']) {
          if (model[field]) expect(actual, field).toContain(model[field]);
        }
        for (const technical of ['Kalkulator klirensu', 'VILDA_CLCR', 'exactMain', 'engineVersion', 'numerator', 'caDzmSnapshot', 'acrSnapshot', '[tekst]', '[dane]']) expect(actual).not.toContain(technical);
        expect(actual.length).toBeLessThan(1600);
        if (key === 'calcium') expect(model).toMatchObject({ display: '2,77', unit: 'mg/kg/24 h', norm: '<4 mg/kg/24 h', status: 'W zakresie' });
        if (key === 'acr') expect(model).toMatchObject({ category: 'A2', outOfRange: true, norm: '<30 mg/g' });
        if (key === 'corrupted') {
          expect(model).toMatchObject({ norm: '', category: '', tone: 'neutral', outOfRange: null, status: 'Bez zapisanej oceny' });
          expect(actual).toContain('Zapisana ocena jest niedostępna.');
          expect(actual).not.toContain('<4 mg/kg/24 h');
        }
        await backIfMobile(search, width);
      }
      expect(await presentationFingerprint(page, created)).toEqual(before);
      await expectClinicalEnginesUnloaded(page);
      expect(await search.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    });
  });
}
