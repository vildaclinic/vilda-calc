import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

async function state(frame) {
  return frame.evaluate(() => ({
    controls: ['bpSystolic', 'bpDiastolic', 'heartRate', 'hrTemperature', 'hrPopulation']
      .map(id => document.getElementById(id).value),
    source: document.getElementById('bpDataToggle').checked,
    manual: document.getElementById('bpDataToggle').dataset.manual ?? null,
    result: document.getElementById('bpResult').textContent,
    centiles: [window.percSbp ?? null, window.percDbp ?? null],
    session: VildaPersistence.readMainSession()?.bp ?? null,
    payload: VildaDataImportExport.captureCurrentUserDataReadOnly().bp ?? null
  }));
}

test('home tools: pressure and pulse tabs use an isolated draft and commit both together', async ({ page }) => {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  const { frame, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await loadPatient(frame, ids.a, 'restore');
  await readyForPatient(frame);
  const recordCount = await frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshotCount), ids.a);
  const before = await state(frame);
  await frame.locator('#vhomeOtherToolsToggle').click();
  await frame.locator('[data-home-tool="pressure"]').click();
  const dialog = frame.locator('#vhomeToolDialog');
  const child = dialog.frameLocator('iframe[data-home-tool-draft]');
  const pressure = child.getByRole('tab', { name: 'Ciśnienie', exact: true });
  const pulse = child.getByRole('tab', { name: 'Tętno', exact: true });
  const field = name => child.locator('[data-home-tool-field="' + name + '"]');
  const apply = dialog.getByRole('button', { name: 'Zastosuj dane', exact: true });
  await expect(pressure).toHaveAttribute('aria-selected', 'true');
  await pulse.click();
  await expect(apply).toBeDisabled();
  await pressure.click();
  await field('sbpRaw').fill('116');
  await field('dbpRaw').fill('72');
  await field('reference').selectOption('NHBPEP');
  const pressureResult = child.locator('.vhome-tool-result p').filter({ hasText: 'Ciśnienie skurczowe:' });
  await expect(pressureResult).toContainText('116');
  const pressureHeadline = await pressureResult.textContent();

  await pulse.click();
  await expect(pulse).toHaveAttribute('aria-selected', 'true');
  await field('pulseRaw').fill('98');
  await field('temperatureRaw').fill('38.5');
  await field('population').selectOption('hospital');
  const pulseResult = child.locator('.vhome-tool-result p').filter({ hasText: 'Tętno:' });
  await expect(pulseResult).toContainText('98');
  const pulseHeadline = await pulseResult.textContent();
  expect(await state(frame)).toEqual(before);

  await pressure.click();
  await expect(field('sbpRaw')).toHaveValue('116');
  await expect(field('dbpRaw')).toHaveValue('72');
  await expect(field('reference')).toHaveValue('NHBPEP');
  await apply.click();
  await expect(dialog).toBeHidden();
  const native = frame.locator('#bpResult p');
  await expect(native.filter({ hasText: 'Ciśnienie skurczowe:' })).toHaveText(pressureHeadline);
  await expect(native.filter({ hasText: 'Tętno:' })).toHaveText(pulseHeadline);
  await expect.poll(() => state(frame)).toMatchObject({
    controls: ['116', '72', '98', '38.5', 'hospital'],
    source: true,
    manual: '1',
    session: { systolic: 116, diastolic: 72, heartRate: 98, temperature: 38.5, population: 'hospital' }
  });
  expect(await frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshotCount), ids.a)).toBe(recordCount);
});
