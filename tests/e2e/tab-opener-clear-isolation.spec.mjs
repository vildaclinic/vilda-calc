import { expect, test } from '@playwright/test';
import { openCommittedPatient } from '../support/save-commit-reference-fixture.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(150_000);

async function ready(owner) {
  await owner.waitForLoadState('load');
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && (!window.VildaAuthUI?.isBootReady || window.VildaAuthUI.isBootReady())
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.()
    && !window.__vildaPersistRestoring && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.());
}

async function workingState(owner) {
  return owner.evaluate(() => ({
    height: document.getElementById('height')?.value,
    state: window.VildaSaveStatusIndicator.getState(),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision().state,
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    mainHeight: window.VildaPersistence.readMainSession()?.user?.height ?? null,
    reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
    tabId: window.VildaPersistence.getTabId(),
    clearSources: window.__openerClearObservation.clearSources.slice(),
  }));
}

test('a native opener copy gets its own tab identity and keeps its dirty draft when the opener clears', async ({ page, context }, info) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
    ? route.continue() : route.abort());
  // Observations run before application scripts in the real popup and frames.
  // They never create, replace or remove any application storage or identity.
  await context.addInitScript(() => {
    window.__openerClearObservation = {
      beforeBootstrap: {
        topLevel: window.top === window,
        hasOpener: Boolean(window.opener),
        copiedTabId: sessionStorage.getItem('vildaTabIdV1'),
      },
      clearSources: [],
      clearPings: [],
    };
    window.addEventListener('vilda:user-state-cleared', event => {
      window.__openerClearObservation.clearSources.push(event.detail?.source ?? null);
    });
    window.addEventListener('storage', event => {
      if (event.key !== 'vilda-shell-clear-ping-v1' || !event.newValue) return;
      try {
        window.__openerClearObservation.clearPings.push(JSON.parse(event.newValue).tabId);
      } catch { /* The observer must never affect application handlers. */ }
    });
  });

  // Only fictional encrypted records in this test's isolated browser context.
  const fixture = await openCommittedPatient(page, { shell: true });
  const firstStart = fixture.owner, patientId = fixture.ids.a;
  await ready(firstStart);
  await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
  const firstTabId = await page.evaluate(() => window.VildaPersistence.getTabId());
  expect(firstTabId).toBeTruthy();
  expect(await firstStart.evaluate(() => window.VildaPersistence.getTabId())).toBe(firstTabId);

  const [secondPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate(() => window.open('/app.html#/start', '_blank')),
  ]);
  try {
    await secondPage.waitForLoadState('load');
    let secondStart = await shellFrame(secondPage, 'Start');
    await ready(secondStart);
    const copied = await secondPage.evaluate(() => window.__openerClearObservation.beforeBootstrap);
    expect(copied).toEqual({ topLevel: true, hasOpener: true, copiedTabId: firstTabId });
    const secondTabId = await secondPage.evaluate(() => window.VildaPersistence.getTabId());
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);
    expect(await secondStart.evaluate(() => window.VildaPersistence.getTabId())).toBe(secondTabId);
    expect(await page.evaluate(() => window.VildaPersistence.getTabId())).toBe(firstTabId);
    await expect(secondStart.locator('#height')).toHaveValue('158');

    // A real, durable lab pin must survive either tab's working-form lifecycle.
    await page.evaluate(() => window.VildaShell.navigate('lab'));
    const firstLab = await shellFrame(page, 'Jednostki laboratoryjne');
    await ready(firstLab);
    expect(await firstLab.evaluate(() => window.VildaPersistence.getTabId())).toBe(firstTabId);
    await firstLab.locator('#labSubstance').fill('LH');
    await firstLab.locator('#labSubstanceDropdown [data-id="lh"]').click();
    await firstLab.locator('#labValue').fill('2');
    await expect(firstLab.locator('#labPinResultBtn')).toBeVisible();
    await firstLab.locator('#labPinResultBtn').click();
    await firstLab.locator('#labPinSave').click();
    await expect(firstLab.locator('#labPinOverlay')).toHaveCount(0);
    await expect.poll(() => firstLab.evaluate(async id =>
      (await window.VildaVault.listPatientNotesForPatient(id)).length, patientId)).toBe(1);
    const pinned = await firstLab.evaluate(async id => ({
      patient: await window.VildaVault.getPatient(id),
      notes: await window.VildaVault.listPatientNotesForPatient(id),
    }), patientId);
    expect(pinned.notes[0].labResult).toMatchObject({ testKey: 'lh', valueNum: 2 });
    await page.evaluate(() => window.VildaShell.navigate('start'));
    await ready(firstStart);

    await secondStart.locator('#height').fill('159');
    await secondStart.locator('#height').blur();
    await expect(secondPage.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
    await expect.poll(() => secondStart.evaluate(() => window.VildaPersistence.readMainSession()?.user?.height)).toBe(159);
    await secondPage.reload({ waitUntil: 'load' });
    secondStart = await shellFrame(secondPage, 'Start');
    await ready(secondStart);
    expect(await secondPage.evaluate(() => window.__openerClearObservation.beforeBootstrap.copiedTabId)).toBe(secondTabId);
    expect(await secondPage.evaluate(() => window.VildaPersistence.getTabId())).toBe(secondTabId);
    expect(await secondStart.evaluate(() => window.VildaPersistence.getTabId())).toBe(secondTabId);
    await expect(secondStart.locator('#height')).toHaveValue('159');
    await expect(secondPage.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
    const before = await workingState(secondStart);
    expect(before).toMatchObject({ height: '159', state: 'dirty', decision: 'dirty',
      patientId, mainHeight: 159, tabId: secondTabId });
    const hostClearsBefore = await secondPage.evaluate(() => window.__openerClearObservation.clearSources.slice());

    // From this checkpoint there is no input or confirmation in the second tab.
    await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
    await page.locator('aside.sidebar-v2 [data-menu-clear]').click();
    await expect(firstStart.locator('#height')).toHaveValue('');
    await expect.poll(() => firstLab.evaluate(() => document.getElementById('labValue').value)).toBe('');
    // Prove delivery of the foreign signal, not merely the absence of a race.
    await expect.poll(() => secondStart.evaluate(() => window.__openerClearObservation.clearPings)).toContain(firstTabId);
    await expect(secondStart.locator('#height')).toHaveValue('159');
    await expect(secondPage.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
    const after = await workingState(secondStart);
    expect(after).toEqual(before);
    expect(await secondPage.evaluate(() => window.__openerClearObservation.clearSources)).toEqual(hostClearsBefore);
    expect(await secondStart.evaluate(async id => ({
      patient: await window.VildaVault.getPatient(id),
      notes: await window.VildaVault.listPatientNotesForPatient(id),
    }), patientId)).toEqual(pinned);
    await info.attach('native-opener-clear-isolation', { contentType: 'application/json',
      body: JSON.stringify({ copiedBeforeBootstrap: copied, firstTabId, secondTabId, before, after }, null, 2) });
  } finally {
    await secondPage.close();
  }
});
