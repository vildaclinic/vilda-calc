import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

test('błąd przypomnień daje dostępne ponowienie na telefonie w pionie i poziomie', async ({ page }) => {
  await page.addInitScript(() => {
    const day = new Date().toLocaleDateString('sv');
    localStorage.setItem('vilda-reminders-shown-v1', day + '|' + Date.now());
    localStorage.setItem('vilda-reminders-closed-v1', day + '|' + Date.now());
  });
  const { ids, frame } = await createFictionalVault(page, { shell: true });
  await frame.evaluate(async id => {
    await window.VildaVault.savePatientNote({ patientId: id, title: 'Fikcyjna kontrola mobilna',
      category: 'followup', dueDateISO: new Date().toLocaleDateString('sv') });
  }, ids.a);
  await expect(page.locator('#vildaRemindersBtn')).toHaveAttribute('data-count', '1');
  await page.evaluate(() => {
    const native = window.VildaVault.listPatientNotesDueByDate;
    window.__fictionalReminderFault = true;
    window.VildaVault.listPatientNotesDueByDate = function (...args) {
      if (window.__fictionalReminderFault) return Promise.reject(Error('FIKCYJNY_BŁĄD_MOBILE'));
      return native.apply(this, args);
    };
  });
  await page.locator('#vildaRemindersBtn').click();
  const error = page.getByRole('dialog', { name: 'Błąd wczytywania przypomnień', exact: true });
  await expect(error).toBeVisible();
  for (const viewport of [{ width: 393, height: 852 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    const button = error.getByRole('button', { name: 'Spróbuj ponownie', exact: true });
    await expect(button).toBeVisible();
    const hit = await button.evaluate(node => {
      const rect = node.getBoundingClientRect(), target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { inside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
        exposed: target === node || node.contains(target), noOverflow: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    expect(hit).toEqual({ inside: true, exposed: true, noOverflow: true });
  }
  await page.screenshot({ path: test.info().outputPath('reminders-error-phone-landscape.png') });
  await page.evaluate(() => { window.__fictionalReminderFault = false; });
  await error.getByRole('button', { name: 'Spróbuj ponownie', exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(page.locator('.vilda-reminders-row')).toHaveCount(1);
});
