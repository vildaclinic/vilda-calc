import { expect, test } from '../support/test-czas.mjs';
import { readFile } from 'node:fs/promises';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { CARE_PANEL, CARE_WORKSPACE, mutatePlan, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';
import { TEMPLATE_REVIEW, TEMPLATE_ROOT, beginTemplate, captureTemplateUI, createSecondTemplateAccount, ensureTemplates,
  fillTemplateFirstStep, getTemplate, listTemplates, openTemplate, openTemplates, previewTemplateDraft,
  rawTemplateStorage, saveSimpleTemplate, templateFixture, templateRevisions, templateRow } from '../support/care-templates-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care templates wizard loads on demand, requires explicit outcomes and nonblank offsets, and saves ordered parallel identities without patient writes', async ({ page }) => {
  const requested = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/vilda_care_templates.js') requested.push(request.url()); });
  const { frame, cloud } = await templateFixture(page);
  expect(requested).toHaveLength(0);
  const clinicalBefore = await rawCareStorage(frame);
  const library = await openTemplates(page);
  expect(requested).toHaveLength(1);
  await expect(library.locator('.vct-template-row')).toHaveCount(0);
  await beginTemplate(library, 'Fikcyjny schemat jawnych ustaleń');
  await library.getByLabel('Nazwa etapu', { exact: true }).fill('Fikcyjny wspólny etap');
  await library.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjna taka sama nazwa');
  await expect(library.getByLabel('Co kończy ten krok?', { exact: true })).toHaveValue('');
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(library.getByLabel('Co kończy ten krok?', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await listTemplates(frame)).toEqual([]);
  expect(cloud.templateRequests.filter(request => request.endpoint === 'template-library/events')).toHaveLength(0);
  await library.getByLabel('Co kończy ten krok?', { exact: true }).selectOption('resultReceipt');
  await library.getByLabel('Początek liczenia przypomnienia', { exact: true }).selectOption('stage-offset');
  await library.getByLabel('Liczba jednostek czasu', { exact: true }).fill('');
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(library.getByLabel('Liczba jednostek czasu', { exact: true })).toHaveValue('');
  await expect(library.getByLabel('Liczba jednostek czasu', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  expect(await listTemplates(frame)).toEqual([]);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  await library.getByLabel('Liczba jednostek czasu', { exact: true }).fill('0');
  await library.getByLabel('Jednostka czasu', { exact: true }).selectOption('month');
  const firstId = await library.locator('.vct-step-card').getAttribute('data-template-step-id');
  await library.getByRole('button', { name: 'Dodaj krok', exact: true }).click();
  await library.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjna taka sama nazwa');
  await library.getByLabel('Co kończy ten krok?', { exact: true }).selectOption('decision');
  const ids = await library.locator('.vct-step-card').evaluateAll(rows => rows.map(row => row.dataset.templateStepId));
  expect(new Set(ids).size).toBe(2);
  const secondId = ids.find(id => id !== firstId);
  await library.locator(`[data-template-step-id="${secondId}"]`).getByRole('button', { name: 'Przesuń krok w górę', exact: true }).click();
  expect(await library.locator('.vct-step-card').evaluateAll(rows => rows.map(row => row.dataset.templateStepId))).toEqual([secondId, firstId]);
  await previewTemplateDraft(library);
  await expect(library.locator('.vct-preview-step')).toHaveCount(2);
  await expect(library.getByText('Fikcyjna taka sama nazwa', { exact: true })).toHaveCount(2);
  await expect(library.locator('input[type="date"]')).toHaveCount(0);
  await captureTemplateUI(page, 'desktop-template-preview');
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const items = await listTemplates(frame); expect(items).toHaveLength(1);
  const saved = await getTemplate(frame, items[0].templateId);
  expect(saved.definition.stages[0].stepIds).toEqual([secondId, firstId]);
  expect(saved.definition.steps.find(step => step.id === firstId)).toMatchObject({ requiredOutcome: 'resultReceipt', reminderRule: { kind: 'stage-offset', amount: 0, unit: 'month' } });
  expect(saved.definition.steps.find(step => step.id === secondId)).toMatchObject({ requiredOutcome: 'decision', reminderRule: { kind: 'none' } });
  expect(await templateRevisions(frame, items[0].templateId)).toHaveLength(1);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  expect(await frame.evaluate(() => window.VildaVault.getCarePlanWriteCapability())).toMatchObject({ available: false });
});

test('care templates retain immutable revisions, canonically unchanged edits, independent duplicates, archive and explicit restore', async ({ page }) => {
  const { frame } = await templateFixture(page), clinicalBefore = await rawCareStorage(frame);
  const library = await openTemplates(page), item = await saveSimpleTemplate(library, frame);
  const initial = await getTemplate(frame, item.templateId), firstRevision = (await templateRevisions(frame, item.templateId))[0];
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Edytuj', exact: true }).click();
  await previewTemplateDraft(library);
  await library.getByRole('button', { name: 'Zapisz nową wersję', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  expect(await templateRevisions(frame, item.templateId)).toHaveLength(1);
  expect((await getTemplate(frame, item.templateId)).definition).toEqual(initial.definition);
  await expect(library.getByRole('status')).toContainText('Szablon pozostaje bez zmian.');
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Edytuj', exact: true }).click();
  await library.getByRole('navigation', { name: 'Kroki kreatora szablonu', exact: true }).getByRole('button', { name: 'Nazwa', exact: true }).click();
  await library.getByLabel('Cel i opis ogólny (opcjonalnie)', { exact: true }).fill('Fikcyjny zmieniony ogólny opis lekarza.');
  await previewTemplateDraft(library);
  await library.getByRole('button', { name: 'Zapisz nową wersję', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const revised = await getTemplate(frame, item.templateId), revisions = await templateRevisions(frame, item.templateId);
  expect(revisions).toHaveLength(2);
  expect(revisions.find(revision => revision.revisionId === firstRevision.revisionId)).toEqual(firstRevision);
  expect(revised.definition.purpose).toBe('Fikcyjny zmieniony ogólny opis lekarza.');
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Wersje', exact: true }).click();
  await library.getByRole('button', { name: 'Podgląd wersji 1', exact: true }).click();
  await expect(library.getByText(revised.definition.purpose, { exact: true })).toHaveCount(0);
  await library.getByRole('button', { name: 'Utwórz kopię', exact: true }).click();
  const copyName = 'Fikcyjna niezależna kopia pierwszej wersji';
  await library.getByLabel('Nazwa szablonu', { exact: true }).fill(copyName);
  await previewTemplateDraft(library);
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const copy = (await listTemplates(frame)).find(value => value.title === copyName);
  expect(copy.templateId).not.toBe(item.templateId);
  const copied = await getTemplate(frame, copy.templateId);
  const sourceIds = new Set([...initial.definition.stageOrder, ...initial.definition.steps.map(step => step.id)]);
  expect([...copied.definition.stageOrder, ...copied.definition.steps.map(step => step.id)].some(id => sourceIds.has(id))).toBe(false);
  expect(copied.definition.purpose).toBe(initial.definition.purpose);
  expect(await templateRevisions(frame, copy.templateId)).toHaveLength(1);
  expect((await getTemplate(frame, item.templateId)).definition).toEqual(revised.definition);
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Archiwizuj', exact: true }).click();
  await library.getByRole('button', { name: 'Potwierdź', exact: true }).click();
  await expect(templateRow(library, item.templateId)).toBeVisible();
  expect((await getTemplate(frame, item.templateId)).status).toBe('archived');
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Przywróć do biblioteki', exact: true }).click();
  await library.getByRole('button', { name: 'Potwierdź', exact: true }).click();
  await expect(templateRow(library, item.templateId)).toBeVisible();
  expect((await getTemplate(frame, item.templateId)).status).toBe('active');
  expect(await templateRevisions(frame, item.templateId)).toEqual(revisions);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
});

test('care templates patient structure stays only in RAM until a full visible-text review and never copies facts, notes or patient identity', async ({ page }) => {
  const { frame, ids } = await templateFixture(page);
  const created = await mutatePlan(frame, ids.a, null, 'create', {
    title: 'Fikcyjny prywatny plan Antoniego', goal: 'Fikcyjny prywatny cel wyłącznie pacjenta.',
  });
  const first = await mutatePlan(frame, ids.a, created.planId, 'addStep', {
    step: { title: 'Fikcyjny Antoni — prywatna nazwa kroku', kind: 'Badanie', state: 'waiting',
      reminderDateISO: '2026-10-31', eventDateISO: '2026-11-12', eventTime: '10:15',
      description: 'Fikcyjna prywatna instrukcja pacjenta, której nie wolno kopiować.' },
  });
  await mutatePlan(frame, ids.a, created.planId, 'addStep', {
    step: { title: 'Fikcyjna prywatna druga nazwa', kind: 'Kontrola', state: 'pending', reminderDateISO: '2026-11-20' },
  });
  await mutatePlan(frame, ids.a, created.planId, 'result', { stepId: first.stepId,
    text: 'Fikcyjny prywatny wynik należący wyłącznie do pacjenta.', dateISO: '2026-10-30', continuation: 'existing' });
  const source = await readPlan(frame, created.planId);
  await loadPatient(frame, ids.a, 'restore');
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  const clinicalBefore = await rawCareStorage(frame);
  let library = await openTemplates(page);
  await expect(library.getByRole('button', { name: 'Nowy szablon', exact: true })).toBeEnabled();
  const libraryBeforeDraft = await rawTemplateStorage(frame, { includeMeta: false });
  await library.getByRole('button', { name: 'Zamknij bibliotekę szablonów', exact: true }).click();
  const care = page.locator(CARE_PANEL); await selectPlan(care, created.planId);
  await care.getByLabel('Opcje planu', { exact: true }).click();
  await care.getByRole('button', { name: 'Zapisz układ jako szablon', exact: true }).click();
  library = page.locator(TEMPLATE_ROOT);
  await expect(library.getByLabel('Nazwa szablonu', { exact: true })).toHaveValue('');
  await expect(library.getByLabel('Cel i opis ogólny (opcjonalnie)', { exact: true })).toHaveValue('');
  await expect(library.getByLabel('Etykiety (opcjonalnie)', { exact: true })).toHaveValue('');
  await expect(library.getByLabel(TEMPLATE_REVIEW, { exact: true })).toHaveCount(0);
  await library.getByLabel('Nazwa szablonu', { exact: true }).fill('Fikcyjny sprawdzony ogólny schemat');
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await library.getByLabel('Nazwa etapu', { exact: true }).fill('Fikcyjny ogólny etap po przeglądzie');
  await expect(library.locator('.vct-step-card')).toHaveCount(source.steps.length);
  const copiedIds = await library.locator('.vct-step-card').evaluateAll(rows => rows.map(row => row.dataset.templateStepId));
  expect(copiedIds.some(id => source.steps.some(step => step.id === id))).toBe(false);
  for (const [index, id] of copiedIds.entries()) {
    const card = library.locator(`[data-template-step-id="${id}"]`);
    if (!await card.getByLabel('Co jest do zrobienia?', { exact: true }).count()) await card.locator('.vct-step-toggle').click();
    await expect(card.getByLabel('Co kończy ten krok?', { exact: true })).toHaveValue('');
    await expect(card.getByLabel('Początek liczenia przypomnienia', { exact: true })).toHaveValue('none');
    await expect(card.getByLabel('Ogólna instrukcja (opcjonalnie)', { exact: true })).toHaveValue('');
    await expect(card.getByLabel('Domyślnie dołączaj do planu', { exact: true })).toBeChecked();
    await card.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjny ogólny krok ' + (index + 1));
    await card.getByLabel('Co kończy ten krok?', { exact: true }).selectOption(index ? 'performance' : 'resultReceipt');
  }
  expect(await listTemplates(frame)).toEqual([]);
  expect(await rawTemplateStorage(frame, { includeMeta: false })).toEqual(libraryBeforeDraft);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  await previewTemplateDraft(library);
  const review = library.getByLabel(TEMPLATE_REVIEW, { exact: true });
  await expect(review).not.toBeChecked();
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.locator('.vct-errors')).toContainText('Sprawdź wszystkie nazwy');
  expect(await listTemplates(frame)).toEqual([]);
  expect(await rawTemplateStorage(frame, { includeMeta: false })).toEqual(libraryBeforeDraft);
  await review.check();
  await library.getByRole('navigation', { name: 'Kroki kreatora szablonu', exact: true }).getByRole('button', { name: 'Etapy i kroki', exact: true }).click();
  await library.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjny zmieniony ogólny krok po przeglądzie');
  await previewTemplateDraft(library);
  await expect(review).not.toBeChecked();
  await review.check();
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const saved = (await listTemplates(frame))[0], definition = (await getTemplate(frame, saved.templateId)).definition;
  const serialized = JSON.stringify(definition);
  for (const forbidden of [ids.a, created.planId, source.title, source.goal, 'Fikcyjny prywatny wynik', 'Fikcyjna prywatna instrukcja', '2026-11-12', '2026-10-30', ...source.steps.flatMap(step => [step.id, step.resultNoteId, step.calendarNoteId, step.reminderNoteId].filter(Boolean))]) {
    expect(serialized, 'library definition contains no patient fact/reference: ' + forbidden).not.toContain(forbidden);
  }
  expect(definition.steps.every(step => step.includedByDefault && step.instruction === '' && step.reminderRule.kind === 'none')).toBe(true);
  expect(await readPlan(frame, created.planId)).toEqual(source);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  expect(await frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  await expect(page.locator(CARE_WORKSPACE)).toBeVisible();
});

test('care templates discard unsaved RAM on F5 and ignore an old decoded result after lock and a different fictional account', async ({ page }) => {
  const { frame } = await templateFixture(page);
  let library = await openTemplates(page);
  const item = await saveSimpleTemplate(library, frame, 'Fikcyjny zapisany szablon pierwszego konta');
  await beginTemplate(library, 'Fikcyjny niezapisany szkic przed F5');
  await fillTemplateFirstStep(library);
  const acceptReload = dialog => dialog.accept(); page.on('dialog', acceptReload);
  try { await page.reload({ waitUntil: 'load' }); } finally { page.off('dialog', acceptReload); }
  await readyForPatient(page); await ensureTemplates(page);
  expect((await listTemplates(page)).map(value => value.templateId)).toEqual([item.templateId]);
  library = await openTemplates(page);
  await page.evaluate(() => {
    const original = window.VildaVault.getCarePlanTemplate;
    window.__fictionalTemplateReadWaiting = false; window.__fictionalTemplateReadFinished = false;
    window.VildaVault.getCarePlanTemplate = async function (...args) {
      const value = await original.apply(this, args);
      window.__fictionalTemplateReadWaiting = true;
      await new Promise(resolve => { window.__fictionalReleaseTemplateRead = resolve; });
      window.__fictionalTemplateReadFinished = true; return value;
    };
  });
  await templateRow(library, item.templateId).getByRole('button', { name: 'Podgląd', exact: true }).click();
  await page.waitForFunction(() => window.__fictionalTemplateReadWaiting);
  await page.evaluate(() => window.VildaVault.lock());
  await expect(page.locator('.vct-dialog')).toHaveCount(0);
  await createSecondTemplateAccount(page);
  await page.evaluate(() => window.__fictionalReleaseTemplateRead());
  await page.waitForFunction(() => window.__fictionalTemplateReadFinished);
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await expect(page.locator('.vct-dialog')).toHaveCount(0);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page); await ensureTemplates(page);
  expect(await listTemplates(page)).toEqual([]);
  const secondLibrary = await openTemplates(page);
  await expect(secondLibrary.locator('.vct-template-row')).toHaveCount(0);
  await expect(secondLibrary.getByText('Fikcyjny zapisany szablon pierwszego konta', { exact: true })).toHaveCount(0);
});

test('care templates encrypted file export and import preserve newer archive history and reject another account before writes', async ({ page }) => {
  const { frame, ids } = await templateFixture(page), clinicalBefore = await rawCareStorage(frame);
  const library = await openTemplates(page), item = await saveSimpleTemplate(library, frame, 'Fikcyjny szablon osobnej szyfrowanej kopii');
  const revisions = await templateRevisions(frame, item.templateId);
  await library.getByRole('button', { name: 'Eksportuj bibliotekę', exact: true }).click();
  await expect(library.locator('.vct-confirmation')).toContainText('tego samego konta i klucza szyfrowania');
  const [download] = await Promise.all([page.waitForEvent('download'), library.getByRole('button', { name: 'Potwierdź', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.vctlib$/);
  const buffer = await readFile(await download.path()), text = buffer.toString('utf8'), envelope = JSON.parse(text);
  expect(envelope).toMatchObject({ format: 'vilda-care-template-library/v1', namespace: 'care-template-library', version: 1 });
  expect(text).not.toContain(item.title); expect(text).not.toContain(ids.a); expect(text).not.toContain(ids.b);
  await openTemplate(library, item.templateId);
  await library.getByRole('button', { name: 'Archiwizuj', exact: true }).click();
  await library.getByRole('button', { name: 'Potwierdź', exact: true }).click();
  await expect(templateRow(library, item.templateId)).toBeVisible();
  await library.getByRole('button', { name: 'Importuj bibliotekę', exact: true }).click();
  await expect(library.locator('.vct-confirmation')).toContainText('tego samego konta i klucza szyfrowania');
  const [picker] = await Promise.all([page.waitForEvent('filechooser'), library.getByRole('button', { name: 'Potwierdź', exact: true }).click()]);
  await picker.setFiles({ name: 'fikcyjna-biblioteka.vctlib', mimeType: 'application/octet-stream', buffer });
  await expect(library.locator('.vct-feedback')).toContainText('Zaimportowano bibliotekę na tym urządzeniu.');
  expect((await getTemplate(frame, item.templateId)).status).toBe('archived');
  expect(await templateRevisions(frame, item.templateId)).toEqual(revisions);
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
  await library.getByRole('button', { name: 'Zamknij bibliotekę szablonów', exact: true }).click();
  await createSecondTemplateAccount(page);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page); await ensureTemplates(page);
  const second = await openTemplates(page), otherBefore = await rawTemplateStorage(page), otherClinical = await rawCareStorage(page);
  await second.getByRole('button', { name: 'Importuj bibliotekę', exact: true }).click();
  const [otherPicker] = await Promise.all([page.waitForEvent('filechooser'), second.getByRole('button', { name: 'Potwierdź', exact: true }).click()]);
  await otherPicker.setFiles({ name: 'fikcyjna-biblioteka-innego-konta.vctlib', mimeType: 'application/octet-stream', buffer });
  await expect(second.locator('.vct-errors')).toContainText('tego samego konta i klucza szyfrowania');
  await expect(second.getByRole('button', { name: 'Ponów import', exact: true })).toBeEnabled();
  expect(await listTemplates(page)).toEqual([]);
  expect(await rawTemplateStorage(page)).toEqual(otherBefore);
  expect(await rawCareStorage(page)).toEqual(otherClinical);
});
