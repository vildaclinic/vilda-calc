import { expect } from '@playwright/test';
import { noHorizontalOverflow } from './care-plans-fixture.mjs';
import { TEMPLATE_ROOT, ensureTemplates, fillTemplateFirstStep, getTemplate, listTemplates,
  templateFixture, templateRow } from './care-templates-fixture.mjs';

export async function saveTemplateThroughPatientCard(page) {
  const { frame, ids } = await templateFixture(page, { shell: true });
  await ensureTemplates(frame);
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null), ids.a);
  const patient = frame.locator('.vilda-auth-patient-card');
  await expect(patient).toBeVisible();
  await patient.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  const plansBefore = await frame.evaluate(() => window.VildaVault.listCarePlans());
  await patient.getByRole('button', { name: 'Nowy plan', exact: true }).click();
  const form = frame.locator('dialog.vcp-dialog');
  await form.getByLabel('Nazwa planu', { exact: true }).fill('Fikcyjny plan do anulowania');
  const formFooter = form.locator('.vcp-form-actions');
  for (const name of ['Utwórz plan', 'Anuluj']) {
    const button = formFooter.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
  }
  await expect(frame.locator('body > footer.site-footer')).toHaveCSS('visibility', 'hidden');
  await noHorizontalOverflow(page);
  await noHorizontalOverflow(frame);
  await formFooter.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await frame.evaluate(() => window.VildaVault.listCarePlans())).toEqual(plansBefore);
  await patient.getByRole('button', { name: 'Moje szablony', exact: true }).click();
  const library = frame.locator(TEMPLATE_ROOT), footer = library.locator('.vct-footer');
  const backgroundFooter = frame.locator('body > footer.site-footer');
  await expect(library).toBeVisible();
  await expect(frame.locator('html')).toHaveClass(/\bvilda-embedded\b/);
  await expect(frame.locator('body')).toHaveClass(/\bvilda-auth-embedded-open\b/);

  async function footerButton(name) {
    // The patient card hides its background. That rule must not hide a nested
    // semantic footer containing the template wizard's only save button.
    await expect(backgroundFooter).toHaveCSS('visibility', 'hidden');
    await expect(footer).toBeVisible();
    const button = footer.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeInViewport();
    await noHorizontalOverflow(page);
    await noHorizontalOverflow(frame);
    return button;
  }

  const name = 'Fikcyjny schemat zapisany z Karty pacjenta';
  await library.getByRole('button', { name: 'Nowy szablon', exact: true }).click();
  await library.getByLabel('Nazwa szablonu', { exact: true }).fill(name);
  await (await footerButton('Dalej')).click();
  await fillTemplateFirstStep(library, {
    stage: 'Fikcyjny etap pierwszy', title: 'Fikcyjny pierwszy krok', outcome: 'resultReceipt',
  });
  await library.getByRole('button', { name: 'Dodaj etap', exact: true }).click();
  await fillTemplateFirstStep(library, {
    stage: 'Fikcyjny etap drugi', title: 'Fikcyjny drugi krok', kind: 'documentation', outcome: 'decision',
  });

  await (await footerButton('Wstecz')).click();
  await expect(library.getByLabel('Nazwa szablonu', { exact: true })).toHaveValue(name);
  await (await footerButton('Dalej')).click();
  await expect(library.getByLabel('Nazwa etapu', { exact: true })).toHaveValue('Fikcyjny etap drugi');
  await (await footerButton('Dalej')).click();
  await expect(library.locator('.vct-preview-step')).toHaveCount(2);
  await footerButton('Zapisz szablon');
  await (await footerButton('Wstecz')).click();
  await expect(library.getByLabel('Co jest do zrobienia?', { exact: true })).toHaveValue('Fikcyjny drugi krok');
  await (await footerButton('Dalej')).click();
  await (await footerButton('Zapisz szablon')).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();

  const items = await listTemplates(frame);
  expect(items).toHaveLength(1);
  expect(items[0].title).toBe(name);
  await expect(templateRow(library, items[0].templateId)).toBeVisible();
  const { definition } = await getTemplate(frame, items[0].templateId);
  expect(definition.name).toBe(name);
  expect(definition.stageOrder).toHaveLength(2);
  const stages = definition.stageOrder.map(id => definition.stages.find(stage => stage.id === id));
  expect(stages.map(stage => stage.title)).toEqual(['Fikcyjny etap pierwszy', 'Fikcyjny etap drugi']);
  expect(stages.map(stage => stage.stepIds.length)).toEqual([1, 1]);
  expect(stages.map(stage => definition.steps.find(step => step.id === stage.stepIds[0]))).toMatchObject([
    { stageId: stages[0].id, title: 'Fikcyjny pierwszy krok', taskKind: 'examination', requiredOutcome: 'resultReceipt' },
    { stageId: stages[1].id, title: 'Fikcyjny drugi krok', taskKind: 'documentation', requiredOutcome: 'decision' },
  ]);
  await expect(backgroundFooter).toHaveCSS('visibility', 'hidden');
  await noHorizontalOverflow(page);
  await noHorizontalOverflow(frame);
}
