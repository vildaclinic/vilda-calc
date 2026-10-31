import { expect, test } from '../support/test-czas.mjs';
import { loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { noHorizontalOverflow } from '../support/care-plans-fixture.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { beginTemplate, captureTemplateUI, ensureTemplates, fillTemplateFirstStep, getTemplate, listTemplates, openTemplate,
  openTemplates, previewTemplateDraft, rawTemplateStorage, syncTemplates, templateFixture } from '../support/care-templates-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care templates mobile shell keeps a two-stage wizard usable, preserves focus and identities, and reloads without changing the loaded patient', async ({ page }) => {
  const created = await templateFixture(page, { shell: true, syncEnabled: true });
  let frame = created.frame;
  await ensureTemplates(frame); await loadPatient(frame, created.ids.a, 'restore');
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  const clinicalBefore = await rawCareStorage(frame);
  const library = await openTemplates(page), name = 'Fikcyjny mobilny schemat dwóch etapów';
  await beginTemplate(library, name);
  const longTitle = 'Fikcyjny ogólny krok z długą nazwą, która ma pozostać czytelna i zawijać się w wąskim widoku telefonu';
  await fillTemplateFirstStep(library, { stage: 'Fikcyjny etap pierwszy', title: longTitle, outcome: 'resultReceipt' });
  const title = library.getByLabel('Co jest do zrobienia?', { exact: true });
  await title.press('End'); await title.pressSequentially(' ABC');
  await expect(title).toHaveValue(longTitle + ' ABC');
  expect(await title.evaluate(element => element.ownerDocument.activeElement === element)).toBe(true);
  const firstId = await library.locator('.vct-step-card').getAttribute('data-template-step-id');
  await expect(library.getByLabel('Wybierz etap', { exact: true })).toBeVisible();
  await library.getByRole('button', { name: 'Dodaj etap', exact: true }).click();
  await fillTemplateFirstStep(library, { stage: 'Fikcyjny etap drugi', title: 'Fikcyjny drugi niezależny krok', kind: 'documentation', outcome: 'decision' });
  const secondId = await library.locator('.vct-step-card').getAttribute('data-template-step-id');
  expect(secondId).not.toBe(firstId);
  await library.getByRole('button', { name: 'Przesuń etap w górę', exact: true }).click();
  await library.getByLabel('Początek liczenia przypomnienia', { exact: true }).selectOption('stage-offset');
  await library.getByLabel('Liczba jednostek czasu', { exact: true }).fill('2');
  await library.getByLabel('Jednostka czasu', { exact: true }).selectOption('week');
  await noHorizontalOverflow(page);
  await captureTemplateUI(page, 'mobile-template-editor');
  const initialViewport = page.viewportSize();
  await page.setViewportSize({ width: 844, height: 390 });
  await previewTemplateDraft(library);
  await expect(library.locator('.vct-preview-step')).toHaveCount(2);
  await library.locator('.vct-preview-step').first().scrollIntoViewIfNeeded();
  await expect(library.locator('.vct-preview-step').first()).toBeInViewport({ ratio: 1 });
  await captureTemplateUI(page, 'mobile-template-preview');
  await library.locator('.vct-preview-step').last().scrollIntoViewIfNeeded();
  await library.locator('.vct-preview-step').last().locator('.vcp-help')
    .evaluate(element => { element.scrollIntoView({ block: 'center', inline: 'nearest' }); });
  await captureTemplateUI(page, 'mobile-template-content-detail');
  await expect(library.locator('.vct-preview-step').last().locator('h4')).toBeInViewport({ ratio: 1 });
  await expect(library.locator('.vct-preview-step').last().locator('.vcp-help')).toBeInViewport({ ratio: 1 });
  await noHorizontalOverflow(page);
  const save = library.getByRole('button', { name: 'Zapisz szablon', exact: true });
  await save.scrollIntoViewIfNeeded(); await expect(save).toBeInViewport();
  await save.click(); await expect(library.locator('.vct-library-list')).toBeVisible();
  await syncTemplates(page);
  const item = (await listTemplates(frame)).find(value => value.title === name);
  const stored = await getTemplate(frame, item.templateId);
  expect(stored.definition.stages.find(stage => stage.id === stored.definition.stageOrder[0]).stepIds).toEqual([secondId]);
  expect(stored.definition.steps.find(step => step.id === firstId).title).toBe(longTitle + ' ABC');
  expect(stored.definition.steps.find(step => step.id === secondId).reminderRule).toEqual({ kind: 'stage-offset', amount: 2, unit: 'week' });
  const libraryBeforeReload = await rawTemplateStorage(frame, { includeMeta: false });
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  await page.setViewportSize(initialViewport);
  await page.reload({ waitUntil: 'load' }); frame = await shellFrame(page);
  expect(await page.evaluate(() => localStorage.getItem('vilda-sync-enabled-v1'))).toBe('true');
  await readyForPatient(frame); await ensureTemplates(frame);
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  expect((await getTemplate(frame, item.templateId)).definition).toEqual(stored.definition);
  expect(await rawTemplateStorage(frame, { includeMeta: false })).toEqual(libraryBeforeReload);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  const reopened = await openTemplates(page); await openTemplate(reopened, item.templateId);
  await expect(reopened.getByText(longTitle + ' ABC', { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  expect(await frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
});
