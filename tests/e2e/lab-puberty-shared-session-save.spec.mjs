import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

const badge = page => page.locator('aside.sidebar-v2 [data-menu-save-status]');
const save = page => page.locator('aside.sidebar-v2 #saveDataBtnSidebar');
const stage = (frame, editor, axis, value) => frame.locator(`${editor} .vpa-segments [data-puberty-axis="${axis}"][data-puberty-stage="${value}"]`);

async function openLab(page) {
  await page.locator('aside.sidebar-v2 a[href="przelicznik-jednostek.html"]').click();
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaLabPubertyRuntime && window.VildaAuthUI?.isBootReady());
  await lab.locator('#labSubstance').fill('LH');
  await lab.locator('#labSubstanceDropdown [data-id="lh"]').click();
  await lab.locator('#labValue').fill('2');
  await lab.locator('#labPubertyRefineStage').click();
  await expect(lab.locator('#labPubertyStageHint')).toContainText('Wspólna ocena tej wizyty');
  return lab;
}

async function savedRecord(frame, patientId) {
  return frame.evaluate(async id => {
    const record = await window.VildaVault.getPatient(id);
    return { count: record.snapshots.length, user: record.snapshots[0].payload.user };
  }, patientId);
}

for (const scenario of [{ pin: false, reload: false }, { pin: true, reload: true }, { firstTyped: true }]) {
  test(`shared Lab P2 remains an unsaved working edit until Start saves it (${JSON.stringify(scenario)})`, async ({ page, context, baseURL }) => {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === new URL(baseURL).origin || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
    });
    const { frame: originalMain, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
    await loadPatient(originalMain, ids.a, 'restore');
    await originalMain.waitForFunction(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready && !window.__vildaPersistRestoring);
    if (!scenario.firstTyped) {
      await originalMain.locator('#tannerToggleBtn').click();
      await stage(originalMain, '#pubertyAssessmentEditor', 'G', 3).click();
      await stage(originalMain, '#pubertyAssessmentEditor', 'P', 1).click();
      await save(page).click();
    }
    await expect(badge(page)).toHaveAttribute('data-save-state', 'saved');
    const before = await savedRecord(originalMain, ids.a);
    const reference = await originalMain.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint());
    const lab = await openLab(page);
    await expect(save(page)).toBeDisabled();
    await stage(lab, '#labPubertySharedEditor', 'P', 2).click();
    await expect.poll(() => lab.evaluate(() => window.VildaPersistence.readMainSession()?.user?.pubertyAssessment?.observations?.P?.stage)).toBe(2);
    await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
    await expect(badge(page)).toContainText('Niezapisane zmiany');
    expect(await originalMain.evaluate(() => window.VildaPanelPacjent.canWriteSession())).toBe(false);
    expect(await originalMain.evaluate(() => window.VildaSaveStatusIndicator.getReferenceFingerprint())).toBe(reference);
    expect(await savedRecord(originalMain, ids.a)).toEqual(before);
    if (scenario.pin) {
      await lab.locator('#labPinResultBtn').click();
      await lab.locator('#labPinComment').fill('Fikcyjny test zachowania wspólnej oceny P2');
      await lab.locator('#labPinSave').click();
      await expect(lab.locator('#labPinOverlay')).toHaveCount(0);
      await expect(lab.locator('#labPinResultBtn')).toHaveText('✓ Przypięto');
      expect(await lab.evaluate(async id => (await window.VildaVault.listPatientNotesForPatient(id)).filter(note => note.labResult?.testKey === 'lh').length, ids.a)).toBe(1);
      await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
      expect(await savedRecord(originalMain, ids.a)).toEqual(before);
    }
    if (scenario.reload) {
      await page.reload({ waitUntil: 'load' });
      await shellFrame(page, 'Jednostki laboratoryjne');
      await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
    }
    await page.locator('aside.sidebar-v2 a[href="index.html"]').click();
    const main = await shellFrame(page);
    await expect(main.locator('#height')).toBeVisible();
    await expect.poll(() => main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.P?.stage)).toBe(2);
    await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
    expect(await savedRecord(main, ids.a)).toEqual(before);
    await save(page).click();
    await expect(badge(page)).toHaveAttribute('data-save-state', 'saved');
    const after = await savedRecord(main, ids.a);
    expect(after.count).toBe(before.count + 1);
    expect(after.user.pubertyAssessment.observations.P.stage).toBe(2);
    expect(after.user.pubertyAssessment.observations.G?.stage ?? null).toBe(scenario.firstTyped ? null : 3);
  });
}

test('a shared Lab edit made while an earlier Start save receipt is pending keeps its own dirty state', async ({ page, context, baseURL }) => {
  await context.route('**/*', route => route.request().url().startsWith(baseURL + '/') ? route.continue() : route.abort());
  const { frame: main, ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await loadPatient(main, ids.a, 'restore');
  await main.locator('#tannerToggleBtn').click();
  await stage(main, '#pubertyAssessmentEditor', 'G', 3).click();
  await stage(main, '#pubertyAssessmentEditor', 'P', 1).click();
  await save(page).click();
  await expect(badge(page)).toHaveAttribute('data-save-state', 'saved');
  await main.locator('#weight').fill('47');
  await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
  await main.evaluate(() => {
    const vault = window.VildaVault, original = vault.savePatient;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.__pubertyPendingSave = { release, restore() { vault.savePatient = original; release(); } };
    vault.savePatient = async function (...args) {
      const receipt = await original.apply(this, args);
      window.__pubertyPendingSave.held = true;
      await gate;
      return receipt;
    };
  });
  try {
    await save(page).click();
    await main.waitForFunction(() => window.__pubertyPendingSave.held);
    await expect(badge(page)).toHaveAttribute('data-save-state', 'saving');
    const lab = await openLab(page);
    await stage(lab, '#labPubertySharedEditor', 'P', 2).click();
    await expect.poll(() => lab.evaluate(() => window.VildaPersistence.readMainSession()?.user?.pubertyAssessment?.observations?.P?.stage)).toBe(2);
    await main.evaluate(() => window.__pubertyPendingSave.release());
    await expect.poll(() => main.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
    await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
    expect((await savedRecord(main, ids.a)).user.pubertyAssessment.observations.P.stage).toBe(1);
    await page.locator('aside.sidebar-v2 a[href="index.html"]').click();
    await expect(main.locator('#weight')).toHaveValue('47');
    await expect.poll(() => main.evaluate(() => window.VildaPubertyAssessmentState.read().assessment?.observations?.P?.stage)).toBe(2);
    await expect(badge(page)).toHaveAttribute('data-save-state', 'dirty');
    await main.evaluate(() => window.__pubertyPendingSave.restore());
    await save(page).click();
    await expect(badge(page)).toHaveAttribute('data-save-state', 'saved');
    expect((await savedRecord(main, ids.a)).user.pubertyAssessment.observations.P.stage).toBe(2);
  } finally {
    await main.evaluate(() => window.__pubertyPendingSave.restore());
  }
});
