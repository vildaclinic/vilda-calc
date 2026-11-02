import { expect, test } from '../support/test-czas.mjs';
import { openCarePlans } from '../support/care-plans-fixture.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { templateFixture } from '../support/care-templates-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120000);

async function setVisualViewport(page, height, offsetTop) {
  // Headless Chromium has no OS keyboard. Change only the measured visual
  // viewport; the layout viewport, production dialogs and renderers stay real.
  await page.evaluate(({ height, offsetTop }) => {
    const viewport = window.visualViewport;
    if (!window.__remindersDialogViewport) window.__remindersDialogViewport = {
      height: Object.getOwnPropertyDescriptor(viewport, 'height'),
      offsetTop: Object.getOwnPropertyDescriptor(viewport, 'offsetTop'),
    };
    Object.defineProperty(viewport, 'height', { configurable: true, value: height });
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: offsetTop });
    viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'));
  }, { height, offsetTop });
}

async function restoreVisualViewport(page) {
  await page.evaluate(() => {
    const saved = window.__remindersDialogViewport;
    if (!saved) return;
    for (const key of ['height', 'offsetTop']) {
      if (saved[key]) Object.defineProperty(visualViewport, key, saved[key]);
      else delete visualViewport[key];
    }
    delete window.__remindersDialogViewport;
    visualViewport.dispatchEvent(new Event('resize')); visualViewport.dispatchEvent(new Event('scroll'));
  });
}

async function frameBounds(dialog, bodySelector, footerSelector) {
  return dialog.evaluate((element, { bodySelector, footerSelector }) => {
    const bounds = node => {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    return { dialog: bounds(element), header: bounds(element.querySelector('.vcp-form-head')),
      body: bounds(element.querySelector(bodySelector)), footer: bounds(element.querySelector(footerSelector)),
      visualTop: visualViewport.offsetTop, visualBottom: visualViewport.offsetTop + visualViewport.height };
  }, { bodySelector, footerSelector });
}

async function expectUsableFrame(dialog, bodySelector, footerSelector) {
  await expect(dialog).toBeVisible();
  await expect.poll(async () => {
    const frame = await frameBounds(dialog, bodySelector, footerSelector);
    return frame.dialog.top >= frame.visualTop && frame.footer.bottom <= frame.visualBottom
      && frame.header.top >= frame.dialog.top && frame.header.bottom <= frame.body.top + 1
      && frame.body.height > 44 && frame.body.bottom <= frame.footer.top + 1;
  }).toBe(true);
  return frameBounds(dialog, bodySelector, footerSelector);
}

async function expectUsableField(field, bodySelector) {
  const position = await field.evaluate((element, selector) => {
    const rect = element.getBoundingClientRect(), body = element.closest(selector).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, bodyTop: body.top, bodyBottom: body.bottom,
      hit: element.ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element };
  }, bodySelector);
  expect(position.top).toBeGreaterThanOrEqual(position.bodyTop - 1);
  expect(position.bottom).toBeLessThanOrEqual(position.bodyBottom + 1);
  expect(position.hit).toBe(true);
}

test('Reminders plan and template dialogs follow the keyboard visual viewport and clean up after cancellation', async ({ page }) => {
  const created = await templateFixture(page), clinicalBefore = await rawCareStorage(created.frame);
  const panel = await openCarePlans(page), workspace = page.locator('dialog.vb22-modal');
  const initialLayoutHeight = await page.evaluate(() => innerHeight);
  try {
    await workspace.getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
    const planDialog = page.locator('dialog.vcp-reminders-dialog');
    const beforeChoice = await expectUsableFrame(planDialog, '.vcp-form-body', '.vcp-form-actions');
    await planDialog.locator(`[data-patient-id="${created.ids.a}"]`).click();
    const afterChoice = await expectUsableFrame(planDialog, '.vcp-form-body', '.vcp-form-actions');
    expect(afterChoice.header).toEqual(beforeChoice.header);
    expect(afterChoice.footer).toEqual(beforeChoice.footer);

    await setVisualViewport(page, 300, 40);
    expect(await page.evaluate(() => innerHeight)).toBe(initialLayoutHeight);
    const keyboardPlan = await expectUsableFrame(planDialog, '.vcp-form-body', '.vcp-form-actions');
    expect(keyboardPlan.dialog.height).toBeLessThan(beforeChoice.dialog.height);
    const title = planDialog.getByRole('textbox', { name: 'Nazwa planu', exact: true });
    await title.scrollIntoViewIfNeeded(); await title.fill('Fikcyjny niezapisany plan przy klawiaturze');
    await expectUsableField(title, '.vcp-form-body');
    await expect(title).toHaveValue('Fikcyjny niezapisany plan przy klawiaturze');
    expect((await frameBounds(planDialog, '.vcp-form-body', '.vcp-form-actions')).header).toEqual(keyboardPlan.header);
    expect((await frameBounds(planDialog, '.vcp-form-body', '.vcp-form-actions')).footer).toEqual(keyboardPlan.footer);
    await planDialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(planDialog).toHaveCount(0);

    await setVisualViewport(page, 340, 20);
    await expect(planDialog).toHaveCount(0);
    await restoreVisualViewport(page);
    await panel.getByRole('button', { name: 'Moje szablony', exact: true }).click();
    const library = page.locator('dialog.vct-dialog .vct'), templateDialog = page.locator('dialog.vct-dialog');
    await expect(library.getByRole('button', { name: 'Nowy szablon', exact: true })).toBeEnabled();
    const fullTemplate = await expectUsableFrame(templateDialog, '.vct-workspace', '.vct-footer');
    await setVisualViewport(page, 300, 40);
    expect(await page.evaluate(() => innerHeight)).toBe(initialLayoutHeight);
    const keyboardTemplate = await expectUsableFrame(templateDialog, '.vct-workspace', '.vct-footer');
    expect(keyboardTemplate.dialog.height).toBeLessThan(fullTemplate.dialog.height);
    const search = library.getByRole('searchbox', { name: 'Szukaj własnego szablonu', exact: true });
    await search.scrollIntoViewIfNeeded(); await search.fill('Fikcyjny szablon przy klawiaturze');
    await expectUsableField(search, '.vct-workspace');
    await expect(search).toHaveValue('Fikcyjny szablon przy klawiaturze');
    const afterSearch = await frameBounds(templateDialog, '.vct-workspace', '.vct-footer');
    expect(afterSearch.header).toEqual(keyboardTemplate.header);
    expect(afterSearch.footer).toEqual(keyboardTemplate.footer);
    await library.getByRole('button', { name: 'Zamknij bibliotekę szablonów', exact: true }).click();
    await expect(templateDialog).toHaveCount(0);
    await setVisualViewport(page, 320, 20);
    await expect(page.locator('dialog.vcp-reminders-dialog, dialog.vct-dialog')).toHaveCount(0);
    await restoreVisualViewport(page);
    // The background becomes usable again and a fresh dialog uses the restored
    // viewport rather than retaining either cancelled dialog's keyboard bounds.
    await workspace.getByRole('button', { name: 'Nowy plan opieki', exact: true }).click();
    const reopened = await expectUsableFrame(planDialog, '.vcp-form-body', '.vcp-form-actions');
    expect(reopened.dialog).toEqual(beforeChoice.dialog);
    await planDialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(planDialog).toHaveCount(0);
    expect(await rawCareStorage(created.frame)).toEqual(clinicalBefore);
  } finally { await restoreVisualViewport(page); }
});
