import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test('szybkie odejście z Terminarza anuluje stare odświeżenia, powrót i rzeczywisty merge nadal pokazują nowe wpisy', async ({ page }) => {
  test.setTimeout(120_000);
  const fixture = await createFictionalVault(page, { shell: true });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore', { clear: true });
  await page.evaluate(() => window.VildaShell.navigate('terminarz'));
  const calendar = await shellFrame(page, 'Terminarz');
  await calendar.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && window.VildaTerminarz && typeof window.__vildaSyncRefresh === 'function');
  await expect(calendar.locator('#terminarzRoot')).toBeVisible();
  await calendar.evaluate(() => {
    const original = window.__vildaSyncRefresh;
    window.__fictionalShellRefreshCount = 0;
    window.__vildaSyncRefresh = function (...args) {
      window.__fictionalShellRefreshCount += 1;
      return original.apply(this, args);
    };
  });
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.evaluate(() => window.VildaShell.navigate('terminarz'));
  expect(await calendar.evaluate(() => window.__fictionalShellRefreshCount)).toBe(1);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  const first = 'Fikcyjna kontrola po powrocie';
  await fixture.frame.evaluate(async ({ patientId, title }) => {
    const today = new Date();
    const dueDateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await window.VildaVault.savePatientNote({ patientId, title, body: 'Fikcyjny wpis testowy', category: 'followup', dueDateISO });
  }, { patientId: fixture.ids.a, title: first });
  await calendar.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-merged')));
  // Both former fallback times pass while this is an intentionally hidden pane.
  await page.waitForTimeout(3300);
  expect(await calendar.evaluate(() => window.__fictionalShellRefreshCount)).toBe(1);
  await page.evaluate(() => window.VildaShell.navigate('terminarz'));
  await expect(calendar.getByText(first, { exact: true }).first()).toBeVisible();
  expect(await calendar.evaluate(() => window.__fictionalShellRefreshCount)).toBe(2);

  const second = 'Fikcyjny wpis z aktywnej synchronizacji';
  await calendar.evaluate(async ({ patientId, title }) => {
    const today = new Date();
    const dueDateISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await window.VildaVault.savePatientNote({ patientId, title, body: 'Drugi fikcyjny wpis', category: 'followup', dueDateISO });
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
  }, { patientId: fixture.ids.a, title: second });
  await expect(calendar.getByText(second, { exact: true }).first()).toBeVisible();
  expect(await calendar.evaluate(() => window.__fictionalShellRefreshCount)).toBe(2);
});
