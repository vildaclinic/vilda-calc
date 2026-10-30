import { expect, test } from '@playwright/test';
import { CARE_FORM, careFixture, noHorizontalOverflow, readPlan } from '../support/care-plans-fixture.mjs';
import { legacyClosedReview, openReviewReminder, reviewReminders } from '../support/care-plans-lineage-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care plans lineage mobile: preserved closed work requires explicit reopening and a separate review', async ({ page }, testInfo) => {
  const created = await careFixture(page, { seed: false }), plan = await legacyClosedReview(created);
  const panel = await openReviewReminder(page, plan);
  for (const step of plan.steps) await expect(panel.locator(`[data-step-id="${step.id}"]`)).toContainText(step.title);
  await noHorizontalOverflow(page);
  const versions = panel.locator('.vcp-sync-review .vcp-sync-versions');
  await expect(versions).toBeVisible();
  await versions.locator('summary').scrollIntoViewIfNeeded();
  await expect(versions.locator('summary')).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('retained-versions-mobile.png') });
  await panel.locator('.vcp-sync-review').getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form.getByLabel('Uzasadnienie zakończenia zachowanych kroków bez wykonania', { exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('closed-review-mobile.png') });
  await form.getByRole('button', { name: 'Wznów plan', exact: true }).click();
  await expect(form.getByRole('heading', { name: 'Wznów plan', exact: true })).toBeVisible();
  expect(await readPlan(created.frame, plan.id)).toEqual(plan);
  await form.getByLabel('Powód wznowienia (opcjonalnie)', { exact: true }).fill('Fikcyjna decyzja o kontynuacji zachowanych kroków.');
  await form.getByRole('button', { name: 'Wznów plan', exact: true }).click();
  await expect(form).toHaveCount(0);
  const reopened = await readPlan(created.frame, plan.id);
  expect(reopened).toMatchObject({ status: 'active', syncNeedsReview: true, syncLineageUnknown: true });
  expect(reopened.steps).toEqual(plan.steps);
  expect(await reviewReminders(created.frame, plan.id)).toHaveLength(1);
  await expect(panel.locator('.vcp-sync-review')).toBeVisible();
  await expect(panel.locator('.vcp-closed')).toHaveCount(0);
  await panel.locator('.vcp-sync-review').getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  await expect(form.getByRole('checkbox')).toHaveCount(0);
  await form.getByRole('button', { name: 'Potwierdzam przegląd planu', exact: true }).click();
  await expect(form).toHaveCount(0);
  const acknowledged = await readPlan(created.frame, plan.id);
  expect(acknowledged).toMatchObject({ status: 'active', syncNeedsReview: false, syncLineageUnknown: false });
  // Reconciliation stamps the steps with its own operation; their contents,
  // workflow states, dates and original-record links must remain unchanged.
  expect(acknowledged.steps.map(step => ({ ...step, updatedBy: null })))
    .toEqual(plan.steps.map(step => ({ ...step, updatedBy: null })));
  expect(await reviewReminders(created.frame, plan.id)).toEqual([]);
  await expect(panel.locator('.vcp-sync-review')).toHaveCount(0);
  await noHorizontalOverflow(page);
});
