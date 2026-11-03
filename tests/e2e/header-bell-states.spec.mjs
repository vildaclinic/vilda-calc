import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';
import { expectBell } from '../support/header-layout-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

for (const shell of [false, true]) test(`${shell ? 'shell' : 'standalone'}: neutral bell uses badges and accessible status without changing size`, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const created = await createFictionalVault(page, { shell });
  const bell = page.locator('#vildaRemindersBtn'), badge = page.locator('#vildaRemindersBadge');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(bell).toHaveAttribute('data-state', 'empty');
    await expect(bell).toHaveAttribute('aria-label', 'Brak przypomnień');
    await expect(badge).toBeHidden();
    const neutral = await expectBell(page);
    const position = () => bell.evaluate(node => {
      const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const baseline = await position();
    const notes = await created.frame.evaluate(async id => {
      const ids = [];
      for (let i = 0; i < 10; i++) ids.push((await window.VildaVault.savePatientNote({
        patientId: id, category: 'followup', title: `Fikcyjna kontrola nagłówka ${i + 1}`, dueDateISO: '2026-10-29',
      })).id);
      return ids;
    }, created.ids.a);
    await expect(bell).toHaveAttribute('data-state', 'today');
    await expect(bell).toHaveAttribute('data-count', '10');
    await expect(bell).toHaveAttribute('aria-label', '10 przypomnień do sprawdzenia');
    await expect(badge).toBeVisible(); await expect(badge).toHaveText('9+');
    expect(await expectBell(page)).toEqual(neutral);
    expect(await position()).toEqual(baseline);
    const overdue = await created.frame.evaluate(async id => (await window.VildaVault.savePatientNote({
      patientId: id, category: 'followup', title: 'Fikcyjna zaległa kontrola nagłówka', dueDateISO: '2026-10-28',
    })).id, created.ids.a);
    await expect(bell).toHaveAttribute('data-state', 'overdue');
    await expect(bell).toHaveAttribute('data-count', '11');
    expect(await expectBell(page)).toEqual(neutral);
    expect(await position()).toEqual(baseline);

    // Exercise the production loading event, not a hand-written data-state.
    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('vilda:cloud-only-sync-pulling'));
      window.VildaChrome.refreshRemindersBtn();
    });
    await expect(bell).toHaveAttribute('data-state', 'loading');
    await expect(bell).toHaveAttribute('aria-label', 'Wczytywanie przypomnień…');
    expect(await expectBell(page)).toEqual(neutral);
    expect(await position()).toEqual(baseline);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:cloud-only-sync-complete')));
    await expect(bell).toHaveAttribute('data-state', 'overdue');

    // A bounded read failure drives the real error renderer. The actual note
    // data and all writes remain in the synthetic encrypted vault.
    await page.evaluate(() => {
      window.__headerOriginalDueRead = window.VildaVault.listPatientNotesDueByDate;
      window.VildaVault.listPatientNotesDueByDate = () => Promise.reject(new Error('FIKCYJNY_BŁĄD_ODCZYTU_NAGŁÓWKA'));
      window.VildaChrome.refreshRemindersBtn();
    });
    await expect(bell).toHaveAttribute('data-state', 'error');
    await expect(bell).toHaveAttribute('aria-label', /Nie udało się wczytać przypomnień/);
    await expect(badge).toHaveText('?');
    expect(await expectBell(page)).toEqual(neutral);
    expect(await position()).toEqual(baseline);
    await page.evaluate(() => {
      window.VildaVault.listPatientNotesDueByDate = window.__headerOriginalDueRead;
      delete window.__headerOriginalDueRead;
      window.VildaChrome.refreshRemindersBtn();
    });
    await expect(bell).toHaveAttribute('data-state', 'overdue');
    await created.frame.evaluate(async ids => {
      for (const id of ids) await window.VildaVault.completePatientNote(id);
    }, [...notes, overdue]);
    await expect(bell).toHaveAttribute('data-state', 'empty');
    await expect(badge).toBeHidden();
    expect(await expectBell(page)).toEqual(neutral);
    expect(await position()).toEqual(baseline);
  }
});
