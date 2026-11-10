import { expect } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient } from './centile-live-fixture.mjs';

export async function zemelPatient(page, { age = 12, source = 'OLAF', ds = true } = {}) {
  await createFictionalVault(page);
  const record = fictionalPatient({ firstName: 'ZemelKreator', age, height: 130, weight: 35 });
  delete record.user.dobISO;
  record.clinical = { downSyndrome: ds };
  record.zscore.dataSource = source;
  record.advanced.data.measurements = [{ ageMonths: 84, height: 110, weight: 20 },
    { ageMonths: 108, height: 123, weight: 27 }];
  const id = await page.evaluate(async value => (await window.VildaVault.savePatient(value, { dedup: false })).patientId, record);
  await loadPatient(page, id, 'restore');
  await expect(page.locator('#age')).toHaveValue(String(age));
  await expect.poll(() => page.evaluate(id => {
    const source = window.VildaDsSource.getState();
    return source.patientId === id && source.status === 'ready' && window.VildaDataImportExport.getSaveReadiness().ready;
  }, id)).toBe(true);
  return id;
}
