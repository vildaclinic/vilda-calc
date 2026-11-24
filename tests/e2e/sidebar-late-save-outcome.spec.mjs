import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

for (const outcome of ['success', 'failure']) {
  test(`late ${outcome} follows the original Save after Start leaves for Lab`, async ({ page, context, baseURL }) => {
    // Only the synthetic vault's original receipt is held. Production DIX and
    // SSI still decide whether this exact save committed or was rejected.
    await context.route('**/*', route => route.request().url().startsWith(baseURL + '/')
      ? route.continue() : route.abort());
    let releaseLab;
    const labRequest = new Promise(resolve => { releaseLab = resolve; });
    await context.route(/\/przelicznik-jednostek\.html(?:\?.*)?$/, async route => {
      await labRequest;
      await route.continue();
    });
    const { frame: start, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
    const badge = page.locator('aside.sidebar-v2 [data-menu-save-status]');
    const navigate = href => page.locator(`aside.sidebar-v2 a[href="${href}"]`).click();
    await loadPatient(start, ids.a, 'restore');
    await expect(badge).toHaveAttribute('data-save-state', 'saved');
    const before = await start.evaluate(id => window.VildaVault.getPatient(id), ids.a);

    // Cover an already booted passive destination and one whose document is
    // still unavailable when the source publishes its final outcome.
    if (outcome === 'failure') {
      releaseLab();
      await navigate('przelicznik-jednostek.html');
      const lab = await shellFrame(page, 'Jednostki laboratoryjne');
      await lab.waitForFunction(() => window.VildaAuthUI?.isBootReady());
      await navigate('index.html');
      await expect(badge).toHaveAttribute('data-save-state', 'saved');
    }
    await start.locator('#weight').fill('47');
    await expect(badge).toHaveAttribute('data-save-state', 'dirty');
    await start.evaluate(result => {
      const vault = window.VildaVault, original = vault.savePatient;
      const probe = window.__lateSidebarSave = { calls: 0 };
      let resolve, reject;
      const gate = new Promise((yes, no) => { resolve = yes; reject = no; });
      probe.release = () => result === 'success' ? resolve() : reject(new Error('Fikcyjna odmowa zapisu'));
      probe.restore = () => { vault.savePatient = original; resolve(); };
      vault.savePatient = async function (...args) {
        probe.calls++;
        const receipt = result === 'success' ? await original.apply(this, args) : null;
        probe.held = true;
        await gate;
        return receipt;
      };
    }, outcome);
    try {
      await page.locator('aside.sidebar-v2 #saveDataBtnSidebar').click();
      await start.waitForFunction(() => window.__lateSidebarSave.held);
      await expect(badge).toHaveAttribute('data-save-state', 'saving');
      await navigate('przelicznik-jednostek.html');
      await expect(page).toHaveURL(/#\/lab$/);
      await expect(badge).toHaveAttribute('data-save-state', 'saving');

      await start.evaluate(() => window.__lateSidebarSave.release());
      await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
      const expected = outcome === 'success' ? 'saved' : 'dirty';
      await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe(expected);
      await expect(badge).toHaveAttribute('data-save-state', expected);
      await expect(badge).toHaveText(outcome === 'success' ? 'Zapisano' : 'Niezapisane zmiany');
      releaseLab();
      const lab = await shellFrame(page, 'Jednostki laboratoryjne');
      await lab.waitForFunction(() => window.VildaAuthUI?.isBootReady());
      await expect(badge).toHaveAttribute('data-save-state', expected);
      expect(await start.evaluate(() => window.__lateSidebarSave.calls)).toBe(1);
      const after = await start.evaluate(id => window.VildaVault.getPatient(id), ids.a);
      if (outcome === 'failure') expect(after.snapshots).toEqual(before.snapshots);
      else {
        const added = after.snapshots.filter(snapshot => !before.snapshots.some(old => old.snapshotId === snapshot.snapshotId));
        expect(added).toHaveLength(1);
        expect(added[0].payload.user.weight).toBe(47);
      }
      await navigate('index.html');
      await expect(start.locator('#weight')).toHaveValue('47');
      await expect(badge).toHaveAttribute('data-save-state', expected);
    } finally {
      releaseLab();
      await start.evaluate(() => window.__lateSidebarSave.restore());
    }
  });
}
