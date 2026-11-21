import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';
import { openPatientDocuments } from '../support/patient-documents-ui.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const TOGGLE = '#vhomeOtherToolsToggle';
const GRID = '#vhomeOtherToolsGrid';
const RESPIRATION = '[data-home-tool="respiration"]';
const TOOL_DIALOG = '#vhomeToolDialog';
const DRAFT = 'iframe[data-home-tool-draft]';
const CHARTS = '#vhomeGrowthChartsDialog';
const PRESETS = ['olaf', 'pal-portrait', 'pal-landscape'];

async function setup(page) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore');
  await readyForPatient(fixture.frame);
  return fixture;
}

async function openRespiration(frame) {
  const toggle = frame.locator(TOGGLE);
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  const tile = frame.locator(RESPIRATION);
  await expect(tile).toBeEnabled();
  await tile.click();
  const dialog = frame.locator(TOOL_DIALOG);
  await expect(dialog).toBeVisible();
  const draft = dialog.frameLocator(DRAFT);
  const rate = draft.locator('[data-home-tool-field=rrRaw]');
  await expect(rate).toBeVisible();
  return { dialog, draft, rate, tile };
}

async function respiratoryState(frame) {
  return frame.evaluate(() => ({
    control: document.getElementById('respiratoryRateInput').value,
    result: document.getElementById('respiratoryResult').textContent,
    session: VildaPersistence.readMainSession()?.respiratory ?? null,
    payload: VildaDataImportExport.captureCurrentUserDataReadOnly().respiratory ?? null,
  }));
}

test('home tools: respiration stays in its own document until Apply and uses the native result', async ({ page }) => {
  const { frame, ids } = await setup(page);
  const before = await respiratoryState(frame);
  const snapshotCount = await frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshotCount), ids.a);
  const { dialog, draft, rate, tile } = await openRespiration(frame);
  const headline = draft.locator('p').filter({ hasText: 'Liczba oddechów:' });
  await rate.fill('20');
  await expect(headline).toContainText(/20\s*\/min/);
  const expectedHeadline = await headline.textContent();
  expect(await respiratoryState(frame)).toEqual(before);

  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(tile).toBeFocused();
  expect(await respiratoryState(frame)).toEqual(before);

  await openRespiration(frame);
  await expect(rate).toHaveValue(before.control);
  await rate.fill('20');
  await dialog.getByRole('button', { name: 'Zastosuj dane', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#respiratoryRateInput')).toHaveValue('20');
  await expect(frame.locator('#respiratoryResult p').first()).toHaveText(expectedHeadline);
  await expect.poll(async () => (await respiratoryState(frame)).session?.rate).toBe(20);
  expect(await frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshotCount), ids.a)).toBe(snapshotCount);
});

test('home tools: eight equal tiles, shared dialog, and an obsolete draft cannot be applied', async ({ page }) => {
  const { frame, ids } = await setup(page);
  const toggle = frame.locator(TOGGLE), grid = frame.locator(GRID);
  await expect(frame.locator('#currentSummaryCard')).toBeVisible();
  await expect(frame.locator('#vhomeGrowthCard')).toBeVisible();
  for (const id of ['bmiCard', 'growthCalculationsSection', 'downSyndromeSection']) {
    const original = frame.locator('#' + id);
    await expect(original).toBeAttached();
    await expect(original).toBeHidden();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(grid).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(grid.locator('[data-home-tool]')).toHaveCount(8);
  await expect(grid.locator('[data-home-tool]:enabled')).toHaveCount(8);
  for (const [width, height, columns] of [[1440, 1000, 2], [1920, 1080, 4], [834, 1112, 2], [390, 844, 1]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => grid.evaluate(node => {
      const dimensions = Array.from(node.querySelectorAll('[data-home-tool]'), tile => {
        const { width, height } = tile.getBoundingClientRect();
        return { width, height };
      });
      const first = dimensions[0];
      return {
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length,
        equal: first.width > 0 && dimensions.every(box => Math.abs(box.width - first.width) <= 1
          && Math.abs(box.height - first.height) <= 1),
        fits: node.scrollWidth <= node.clientWidth + 1,
      };
    })).toEqual({ columns, equal: true, fits: true });
  }

  await page.setViewportSize({ width: 1920, height: 1080 });
  const dimensions = await openRespiration(frame);
  await expect.poll(() => dimensions.dialog.evaluate(node => [node.offsetWidth, node.offsetHeight])).toEqual([1000, 820]);
  await dimensions.dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dimensions.dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });

  const { dialog, rate, tile } = await openRespiration(frame);
  await rate.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(tile).toBeFocused();

  await openRespiration(frame);
  await frame.evaluate(() => history.back());
  await expect(dialog).toBeHidden();
  await expect(tile).toBeFocused();

  await openRespiration(frame);
  const nativeBefore = await frame.locator('#respiratoryRateInput').inputValue();
  await rate.fill('21');
  // A new owner can arrive while the iframe still has focus. Click in the same
  // task to verify the apply guard itself, without waiting for dialog cleanup.
  await frame.evaluate(id => {
    sessionStorage.setItem('vildaCurrentPatientId', id);
    document.querySelector('#vhomeToolDialog .vhome-dialog-apply').click();
  }, ids.b);
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#respiratoryRateInput')).toHaveValue(nativeBefore);
  expect(await frame.evaluate(() => VildaPersistence.readMainSession()?.respiratory?.rate ?? null)).not.toBe(21);
  expect(await frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshots[0].payload.respiratory?.rate), ids.b)).not.toBe(21);
});

test('home documents: sidebar and summary open the same chart chooser and preserve the PDF package', async ({ page }) => {
  const { frame } = await setup(page);
  const charts = frame.locator(CHARTS);
  const expectPresets = async () => {
    await expect(charts).toBeVisible();
    for (const preset of PRESETS) await expect(charts.locator(`[data-chart-preset="${preset}"]`)).toBeVisible();
  };
  await frame.locator('#vhomeGenerateCharts').click();
  await expectPresets();
  await charts.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(charts).toBeHidden();

  const docs = await openPatientDocuments(page);
  await expect(docs).toHaveAttribute('data-patient-documents-home', '');
  for (const group of ['Siatki centylowe', 'Raporty i podsumowania', 'Zalecenia i opieka']) {
    await expect(docs.getByRole('heading', { name: group, exact: true })).toBeVisible();
  }
  const choices = docs.locator('input[name="patientReportPdfChoice"]');
  await expect(choices.first()).toBeHidden();
  await docs.locator('[data-patient-documents-package]').click();
  await expect(choices).toHaveCount(4);
  expect(await choices.evaluateAll(inputs => inputs.map(input => input.value))).toEqual(['visit', 'diet', 'centile', 'growth']);
  await expect(docs.locator('[data-patient-documents-generate]')).toBeVisible();
  for (const choice of await choices.all()) {
    if (await choice.isEnabled() && await choice.isChecked()) await choice.uncheck();
  }
  await expect(docs.locator('[data-patient-documents-generate]')).toBeDisabled();
  await docs.locator('input[name="patientReportPdfChoice"][value="visit"]').check();
  await expect(docs.locator('[data-patient-documents-generate]')).toBeEnabled();
  await docs.locator('[data-patient-documents-package-back]').click();
  await docs.locator('[data-patient-documents-charts]').click();
  await expect(docs).toBeHidden();
  await expectPresets();
});
