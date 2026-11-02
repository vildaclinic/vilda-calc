import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { mutatePlan } from '../support/care-plans-fixture.mjs';
import { GLOBAL_QUERY, queryGlobal, resultFor } from '../support/global-search-fixture.mjs';

test.use({ chwila: '2026-10-29T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });

async function fictionalVault(page) {
  const created = await createFictionalVault(page);
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return created;
}

async function dragSelectText(page, locator) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  const text = (await locator.textContent()).trim();
  expect(text.length).toBeGreaterThan(1);
  const lines = await locator.evaluate(async node => {
    await node.ownerDocument.fonts.ready;
    const range = node.ownerDocument.createRange(); range.selectNodeContents(node);
    return [...range.getClientRects()].filter(rect => rect.width && rect.height)
      .map(rect => ({ left: rect.left, right: rect.right, top: rect.top, height: rect.height }));
  });
  expect(lines.length).toBeGreaterThan(0);
  const first = lines[0], last = lines.at(-1), box = await locator.boundingBox(), viewport = page.viewportSize();
  // Ellipsized spans can return an extra clipped text fragment. Use the
  // element's horizontal edges and the first/last line's vertical position.
  await page.mouse.move(box.x + 1, first.top + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.min(box.x + box.width + 15, viewport.width - 2), last.top + last.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => getSelection().toString().trim())).toBe(text);
}

async function expectKeyboardFocus(locator) {
  await expect(locator).toBeFocused(); await expect(locator).toHaveCSS('outline-style', 'solid');
  const ring = await locator.evaluate(node => ({ width: getComputedStyle(node).outlineWidth, color: getComputedStyle(node).outlineColor }));
  expect(parseFloat(ring.width)).toBeGreaterThan(0);
  expect(ring.color).not.toBe('transparent'); expect(ring.color).not.toMatch(/,\s*0(?:\.0+)?\)$/);
}

async function expectStaticChrome(locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS('user-select', 'none');
  expect(await locator.evaluate(node => node.isContentEditable)).toBe(false);
}

async function exerciseNativeQuery(query) {
  await expect(query).toBeVisible();
  await expect(query).toHaveCSS('user-select', 'text');
  const properties = await query.evaluate(node => ({
    tag: node.tagName, type: node.type, readOnly: node.readOnly, disabled: node.disabled,
    caretColor: getComputedStyle(node).caretColor,
  }));
  expect(properties).toMatchObject({ tag: 'INPUT', type: 'search', readOnly: false, disabled: false });
  expect(properties.caretColor).not.toBe('transparent');
  expect(properties.caretColor).not.toMatch(/,\s*0(?:\.0+)?\)$/);

  await query.fill('Fikcyjny test pisania');
  await query.press('ControlOrMeta+A');
  expect(await query.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([0, 21]);
  await query.press('ArrowRight'); await query.press('Shift+ArrowLeft');
  expect(await query.evaluate(node => node.selectionEnd - node.selectionStart)).toBe(1);
  await query.press('X');
  await expect(query).toHaveValue('Fikcyjny test pisaniX');
  await query.fill('');
}

test('menu chrome is noneditable while real account and patient names remain selectable and keyboard focus survives', async ({ page }) => {
  const created = await fictionalVault(page);
  await loadPatient(created.frame, created.ids.a, 'restore', { clear: true });
  await page.setViewportSize({ width: 390, height: 852 });
  const opener = page.locator('[data-vilda-chrome-menu-btn]'); await opener.click();
  const panel = page.locator('.chrome-drawer-panel'); await expect(panel).toBeVisible();
  await expectStaticChrome(panel.locator('.chrome-drawer-head'));
  await expectStaticChrome(panel.locator('.chrome-drawer-section-title').first());
  await expect(panel.locator('.chrome-drawer-title')).toHaveText('Menu');
  expect(await page.evaluate(() => document.designMode)).toBe('off');
  const controls = await panel.locator('.chrome-drawer-nav a,.chrome-drawer-nav button').evaluateAll(nodes =>
    nodes.map(node => ({ editable: node.isContentEditable, select: getComputedStyle(node).userSelect })));
  expect(controls.length).toBeGreaterThan(0);
  expect(controls.every(node => !node.editable && node.select === 'none')).toBe(true);

  const account = panel.locator('.chrome-drawer-account-value'), patient = panel.locator('.chrome-drawer-patient-value');
  await expect(patient).toContainText(created.patients.a.name);
  await dragSelectText(page, account); await dragSelectText(page, patient);
  await page.keyboard.press('Escape'); await expect(panel).toBeHidden(); await expect(opener).toBeFocused();

  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator('dialog.vb22-modal'); await expect(workspace).toBeVisible();
  for (const selector of ['.vb22-head', '.vb22-tabs', '.vb22-filters']) await expectStaticChrome(workspace.locator(selector));
  // The compact ToDo list deliberately has no local query. Its native filters
  // and tabs must stay usable through the keyboard after selection is disabled.
  await expect(workspace.locator('.vb22-list-tools .vb22-search')).toBeHidden();
  const overdue = workspace.locator('[data-filter="overdue"]'); await overdue.focus(); await page.keyboard.press('Enter');
  await expect(overdue).toHaveAttribute('aria-pressed', 'true'); await expectKeyboardFocus(overdue);
});

test('real Plans and Search inputs retain native selection and typing while the clinical preview remains copyable', async ({ page }) => {
  const created = await fictionalVault(page);
  const body = 'Fikcyjny zapis kliniczny do kopiowania.';
  const noteId = await created.frame.evaluate(async ({ patientId, body }) => (await window.VildaVault.savePatientNote({
    patientId, title: 'Fikcyjny wpis kopiowania', body, category: 'reminder-task', dueDateISO: '2026-10-28',
  })).id, { patientId: created.ids.a, body });
  const plan = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan testu selekcji', goal: 'Fikcyjny plan organizacyjny testu interfejsu.',
  });
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator('dialog.vb22-modal'); await expect(workspace).toBeVisible();
  await expectStaticChrome(workspace.locator('.vb22-head')); await expectStaticChrome(workspace.locator('.vb22-tabs'));
  await workspace.locator('[data-tab="plans"]').click();
  const care = workspace.locator('.vcp-reminders-layout'); await expect(care.locator(`[data-plan-id="${plan.planId}"]`)).toBeVisible();
  await exerciseNativeQuery(care.locator('.vcp-search'));
  await expect(care.locator(`[data-plan-id="${plan.planId}"]`)).toBeVisible();

  await workspace.locator('[data-tab="search"]').click();
  const search = workspace.locator('.vgs'), query = search.getByRole('searchbox', { name: GLOBAL_QUERY, exact: true });
  await exerciseNativeQuery(query);
  await queryGlobal(search, 'Fikcyjny wpis kopiowania');
  await resultFor(search, 'note', noteId).click();
  const preview = search.locator('.vgs-detail .vb22-body'); await expect(preview).toHaveText(body);
  await dragSelectText(page, preview);
  await workspace.locator('.vb22-exit').focus(); await page.keyboard.press('Tab');
  const todoTab = workspace.locator('[data-tab="active"]'); await expectKeyboardFocus(todoTab);
  await page.keyboard.press('Enter'); await expect(todoTab).toHaveAttribute('aria-pressed', 'true');
});
