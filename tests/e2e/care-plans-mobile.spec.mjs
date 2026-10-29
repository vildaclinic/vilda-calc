import { expect, test } from '@playwright/test';
import { CARE_FORM, CARE_WORKSPACE, careFixture, mutatePlan, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care plans mobile: bell opens a list, detail and back retain context without an extra full-screen action', async ({ page }) => {
  const created = await careFixture(page);
  const panel = await openCarePlans(page);
  await expect(panel.locator('.vcp-list')).toBeVisible();
  await expect(panel.locator('.vcp-detail')).toBeHidden();
  await expect(panel.getByRole('button', { name: /Powiększ|Pełny widok/ })).toHaveCount(0);
  await panel.locator('.vcp-search').fill('biopsji');
  await selectPlan(panel, created.plans.biopsy);
  await expect(panel.locator('.vcp-list')).toBeHidden();
  await expect(panel.locator('.vcp-detail')).toContainText('Fikcyjny plan biopsji');
  const before = await readPlan(created.frame, created.plans.biopsy);
  await panel.getByRole('button', { name: /Dodaj krok$/ }).click();
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Co jest do zrobienia?', { exact: true }).fill('Fikcyjny anulowany szkic kroku');
  await form.getByRole('button', { name: 'Anuluj formularz planu', exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(await readPlan(created.frame, before.id)).toEqual(before);
  await panel.getByRole('button', { name: /Lista planów$/ }).click();
  await expect(panel.locator('.vcp-list')).toBeVisible();
  await expect(panel.locator('.vcp-search')).toHaveValue('biopsji');
  await expect(panel.locator('[data-plan-id]')).toHaveCount(1);
  await noHorizontalOverflow(page);
});

test('care plans mobile: result form remains usable in landscape and an unchecked calendar cannot block saving', async ({ page }) => {
  const created = await careFixture(page);
  const panel = await openCarePlans(page); await selectPlan(panel, created.plans.biopsy);
  await panel.locator(`[data-step-id="${created.steps.awaiting}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny wynik wprowadzony na telefonie.');
  await form.getByLabel('Dodaję kolejny krok', { exact: true }).check();
  await form.getByLabel('Kolejny krok', { exact: true }).fill('Fikcyjna kontrola po wyniku mobilnym');
  await form.getByLabel('Przypomnij w dniu', { exact: true }).fill('2027-04-29');
  const calendar = form.getByLabel('Mam ustalony termin — dodaj do Terminarza', { exact: true });
  await calendar.check();
  await form.getByLabel('Termin kolejnego wydarzenia', { exact: true }).fill('');
  await calendar.uncheck();
  await page.setViewportSize({ width: 852, height: 393 });
  const close = form.getByRole('button', { name: 'Anuluj formularz planu', exact: true });
  const save = form.getByRole('button', { name: 'Zapisz wynik', exact: true });
  for (const control of [close, save]) {
    const box = await control.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(394);
    const hit = await control.evaluate(node => {
      const r = node.getBoundingClientRect(), target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return target === node || node.contains(target);
    });
    expect(hit).toBe(true);
  }
  await save.click(); await expect(form).toHaveCount(0);
  const plan = await readPlan(created.frame, created.plans.biopsy);
  expect(plan.status).toBe('active');
  expect(plan.steps.find(step => step.title === 'Fikcyjna kontrola po wyniku mobilnym')).toMatchObject({
    state: 'pending', reminderDateISO: '2027-04-29', calendarNoteId: null,
  });
  await noHorizontalOverflow(page);
});

test('care plans mobile: returning from a due care step restores the original reminder filter, search and list position', async ({ page }) => {
  const created = await careFixture(page);
  for (let index = 0; index < 12; index += 1) await mutatePlan(created.frame, created.ids.a, created.plans.biopsy, 'addStep', {
    step: { title: 'Fikcyjne dodatkowe zadanie ' + index, kind: 'Kontakt', state: 'pending', reminderDateISO: '2026-10-26' },
  });
  const beforePlan = await readPlan(created.frame, created.plans.biopsy);
  const step = beforePlan.steps.find(s => s.id === created.steps.awaiting);
  const beforeNote = await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId);
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(CARE_WORKSPACE);
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await workspace.locator('[data-filter=overdue]').click();
  const search = workspace.getByRole('searchbox', { name: 'Szukaj pacjenta lub sprawy', exact: true });
  await search.fill('Antoni');
  const list = workspace.locator('.vb22-list'), row = list.locator(`[data-note-id="${step.reminderNoteId}"]`);
  await expect(list.locator('[data-note-id]')).toHaveCount(13);
  await row.scrollIntoViewIfNeeded();
  const beforeScroll = await list.evaluate(node => node.scrollTop);
  expect(beforeScroll, 'the selected reminder is beyond the first visible page').toBeGreaterThan(100);
  await row.click();
  await expect(workspace.locator('[data-tab=plans]')).toHaveAttribute('aria-pressed', 'true');
  const panel = workspace.locator('.vcp');
  await expect(panel.locator('.vcp-detail')).toBeVisible();
  await expect(panel.locator('.vcp-title')).toHaveText(beforePlan.title);
  await panel.locator('.vcp-back').click();
  await expect(workspace.locator('[data-tab=active]')).toHaveAttribute('aria-pressed', 'true');
  await expect(workspace.locator('[data-filter=overdue]')).toHaveAttribute('aria-pressed', 'true');
  await expect(search).toHaveValue('Antoni');
  await expect(list).toBeVisible();
  await expect(list.locator('[data-note-id]')).toHaveCount(13);
  expect(Math.abs(await list.evaluate(node => node.scrollTop) - beforeScroll)).toBeLessThan(1);
  await expect(row).toBeVisible();
  expect(await readPlan(created.frame, beforePlan.id)).toEqual(beforePlan);
  expect(await created.frame.evaluate(id => window.VildaVault.getPatientNote(id), step.reminderNoteId)).toEqual(beforeNote);
  await noHorizontalOverflow(page);
});
