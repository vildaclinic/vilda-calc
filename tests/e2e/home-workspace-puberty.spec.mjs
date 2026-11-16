import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

async function open(page, { shell = false, enabled = true } = {}) {
  await page.addInitScript(enabled => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = enabled; }, enabled);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  await loadPatient(fixture.frame, fixture.ids.a, 'restore');
  await fixture.frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending() && !window.VildaDobAge.restorePending());
  return fixture;
}
async function snapshot(frame) {
  return frame.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    delete payload.timestampISO;
    const session = window.VildaPersistence.readMainSession();
    // Existing background autosave may refresh its envelope time independently
    // of this window. Every clinical date, value and observation still counts.
    if (session) delete session.timestampISO;
    return { payload, session, activity: window.VildaPubertyAssessmentState.getActivityRevision() };
  });
}
const draftField = (dialog, id) => dialog.locator(`[data-puberty-draft-field="${id}"]`);
const apply = dialog => dialog.getByRole('button', { name: 'Zastosuj dane pokwitaniowe', exact: true });

test('homepage puberty: cancel is pure, both axes apply while the advanced volume and history survive F5', async ({ page }) => {
  const { frame, ids } = await open(page);
  await frame.evaluate(() => {
    window.__pubertyCanonical = document.getElementById('pubertyOnsetAge');
    const history = { pubertyOnsetAge: '11.2', pubertyGnrhaStatus: 'zakonczone', pubertyGnrhaStartAge: '8.5', pubertyGnrhaStopAge: '10.5', pubertyCdgp: 'tak', advTesticularVolume: 'gt6' };
    Object.entries(history).forEach(([id, value]) => { document.getElementById(id).value = value; });
    Object.keys(history).forEach(id => document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true })));
    window.vildaPersistFlushNow({ force: true });
    window.__draftEvents = 0;
    document.addEventListener('input', event => { if (event.target.closest('#vhomePubertyDialog')) window.__draftEvents++; }, true);
    document.addEventListener('change', event => { if (event.target.closest('#vhomePubertyDialog')) window.__draftEvents++; }, true);
  });
  // Let the native debounced calculation consume the seeded history before
  // comparing the complete clinical payload during an untouched draft.
  await frame.waitForFunction(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly()
    .advanced?.data?.calculationFingerprint?.includes('"gnrhaStatus":"zakonczone"'));
  await frame.evaluate(() => window.vildaPersistFlushNow({ force: true }));
  await frame.waitForFunction(() => {
    const saved = window.VildaPersistence.readMainSession();
    return saved?.puberty?.gnrhaStatus === 'zakonczone'
      && saved.advanced?.data?.calculationFingerprint?.includes('"gnrhaStatus":"zakonczone"');
  });
  const before = await snapshot(frame);
  const shortcut = frame.locator('#tannerToggleBtn');
  await expect(shortcut).toHaveClass(/vhome-input-shortcut/);
  await expect(shortcut).toHaveAttribute('aria-haspopup', 'dialog');
  await expect(shortcut.locator('.vhome-shortcut-title')).toHaveText('Danepokwitaniowe');
  await expect(shortcut.locator('svg')).toBeVisible();
  expect((await shortcut.boundingBox()).height).toBe(104);
  await frame.locator('#tannerToggleBtn').click();
  const dialog = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-puberty-select-axis]').first()).toBeFocused();
  await expect(dialog.getByLabel('Data oceny — data bieżącej wizyty', { exact: true })).toHaveAttribute('readonly');
  await expect(dialog.getByRole('tablist')).toHaveCount(0);
  await expect(dialog.getByText('Pomiary i początek dojrzewania', { exact: true })).toHaveCount(0);
  await expect(dialog.locator('[data-puberty-draft-field]')).toHaveCount(0);
  await expect(dialog.getByLabel('Objętość jąder · opcjonalnie', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('puberty-desktop.png') });
  await dialog.getByRole('button', { name: 'Ściąga: G — narządy płciowe', exact: true }).click();
  await dialog.locator('[data-puberty-guide-choice][data-puberty-axis="G"][data-puberty-stage="4"]').click();
  await expect(dialog.locator('[data-puberty-select-axis="G"]')).toHaveValue('4');
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await dialog.locator('[data-puberty-select-axis="P"]').selectOption('2');
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  expect(await snapshot(frame)).toEqual(before);
  expect(await frame.evaluate(() => window.__draftEvents)).toBe(0);
  page.once('dialog', confirmation => confirmation.dismiss());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeVisible();
  page.once('dialog', confirmation => confirmation.accept());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#tannerToggleBtn')).toBeFocused();
  await expect(shortcut.locator('.vhome-shortcut-status')).toBeVisible();
  expect(await snapshot(frame)).toEqual(before);
  await frame.evaluate(() => window.VildaPubertyAssessmentUI.open());
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await dialog.locator('[data-puberty-select-axis="P"]').selectOption('2');
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await expect(dialog.locator('[data-puberty-draft-field^=puberty]')).toHaveCount(0);
  await apply(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(shortcut.locator('.vhome-shortcut-status')).toHaveText('G3 · P2');
  // Native refreshes must preserve the tile instead of restoring the old + label.
  await frame.evaluate(() => window.updateTannerVisibility());
  await expect(shortcut).toHaveClass(/vhome-input-shortcut/);
  await expect(shortcut.locator('.vhome-shortcut-status')).toHaveText('G3 · P2');
  await expect.poll(() => frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly().assessment?.observations.G?.stage)).toBe(3);
  expect(await frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly().assessment.observations.P.stage)).toBe(2);
  expect(await frame.evaluate(() => document.getElementById('pubertyOnsetAge') === window.__pubertyCanonical
    && document.getElementById('pubertyOnsetAge').form === document.getElementById('calcForm'))).toBe(true);
  await expect(frame.locator('#pubertyOnsetAge')).toHaveValue('11.2');
  const saved = await frame.evaluate(() => { window.vildaPersistFlushNow({ force: true }); return window.VildaDataImportExport.captureCurrentUserDataReadOnly(); });
  expect(saved.puberty).toEqual(before.payload.puberty);
  expect(saved.advanced.testicularVolume).toBe('gt6');
  await page.reload({ waitUntil: 'load' });
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && !window.VildaDataImportExport?.isMainSessionRestorePending()
    && window.VildaPubertyAssessmentState?.readReadOnly().assessment?.observations.G?.stage === 3);
  await frame.locator('#tannerToggleBtn').click();
  await expect(dialog).toBeVisible();
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('gt6');
  await expect(frame.locator('#pubertyOnsetAge')).toHaveValue('11.2');
  await expect(frame.locator('#pubertyGnrhaStopAge')).toHaveValue('10.5');
  await expect(dialog.locator('[data-puberty-draft-field^=puberty]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await loadPatient(frame, ids.b, 'restore');
  await frame.evaluate(() => { document.getElementById('pubertyMenarcheAge').value = '11.5'; });
  await frame.locator('#tannerToggleBtn').click();
  await expect(dialog.locator('[data-puberty-select-axis="Th"]')).toBeVisible();
  await expect(dialog.locator('[data-puberty-select-axis="G"]')).toHaveCount(0);
  await expect(draftField(dialog, 'advTesticularVolume')).toHaveCount(0);
  await dialog.locator('[data-puberty-select-axis="Th"]').selectOption('2');
  await expect(dialog.locator('[data-puberty-draft-field]')).toHaveCount(0);
  await apply(dialog).click();
  expect(await frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly().assessment.observations.Th.stage)).toBe(2);
  await expect(frame.locator('#pubertyMenarcheAge')).toHaveValue('11.5');
});

test('homepage puberty: stale draft closes without edits and the native non-preview panel remains available', async ({ page }) => {
  const { frame } = await open(page);
  // Merely opening an editor must not normalize a restored older combination.
  await frame.evaluate(() => {
    document.getElementById('pubertyGnrhaStartAge').value = '8';
    document.getElementById('pubertyGnrhaStopAge').value = '10';
  });
  await frame.locator('#tannerToggleBtn').click();
  await frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true }).getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(frame.locator('#pubertyGnrhaStartAge')).toHaveValue('8');
  await expect(frame.locator('#pubertyGnrhaStopAge')).toHaveValue('10');
  await frame.evaluate(() => {
    document.getElementById('pubertyGnrhaStartAge').value = '';
    document.getElementById('pubertyGnrhaStopAge').value = '';
  });
  await frame.locator('#tannerToggleBtn').click();
  const dialog = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await frame.evaluate(() => { document.getElementById('height').value = '159'; document.getElementById('height').dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('');
  await frame.locator('#tannerToggleBtn').click();
  await dialog.locator('[data-puberty-select-axis="P"]').selectOption('2');
  await frame.evaluate(() => window.VildaVault.lock());
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly().assessment)).toBeNull();
  // A fresh document without the opt-in retains its original inline interaction.
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = false; });
  await page.goto('/index.html');
  await expect(page.locator('#vhomePubertyDialog')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/vilda-home-workspace/);
});

test('homepage puberty: mobile shell keeps uniform geometry, hides dock and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { frame } = await open(page, { shell: true });
  await frame.locator('#tannerToggleBtn').click();
  const dialog = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/vilda-pane-modal-open/);
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  const geometry = await dialog.evaluate(node => {
    const r = node.getBoundingClientRect(), footer = node.querySelector('.vhome-dialog-footer').getBoundingClientRect();
    const apply = node.querySelector('.vhome-dialog-apply'), a = apply.getBoundingClientRect();
    return { width: r.width, height: r.height, expectedWidth: document.documentElement.clientWidth - 20, expectedHeight: innerHeight - 24,
      centerGap: Math.abs((r.left + r.right) / 2 - innerWidth / 2),
      overflow: document.documentElement.scrollWidth > innerWidth,
      hit: document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2) === apply,
      footerInside: footer.bottom <= r.bottom, animation: getComputedStyle(node).animationName, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      debug: { viewport: innerWidth, client: document.documentElement.clientWidth, body: document.body.clientWidth, css: getComputedStyle(node).width, min: getComputedStyle(node).minWidth, max: getComputedStyle(node).maxWidth, zoom: getComputedStyle(node).zoom, rect: r.toJSON() } };
  });
  expect(Math.abs(geometry.width - geometry.expectedWidth), JSON.stringify(geometry)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.height - geometry.expectedHeight)).toBeLessThanOrEqual(1);
  expect(geometry.centerGap).toBeLessThanOrEqual(1);
  expect(geometry.overflow).toBe(false);
  expect(geometry.hit).toBe(true);
  expect(geometry.footerInside).toBe(true);
  expect(geometry.reduced).toBe(true);
  expect(geometry.animation).toBe('none');
  await page.screenshot({ path: test.info().outputPath('puberty-mobile.png') });
  // The shell can temporarily retain the previous iframe height during resize.
  // Its footer must stay in the actually visible parent viewport throughout.
  for (const viewport of [{ width: 820, height: 700 }, { width: 390, height: 450 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const pane = document.querySelector('iframe.app-pane[title="Start"]');
      const footer = pane.contentDocument.querySelector('#vhomePubertyDialog .vhome-dialog-footer').getBoundingClientRect();
      return pane.getBoundingClientRect().top + footer.bottom <= innerHeight + 1;
    })).toBe(true);
    await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  }
  await dialog.getByRole('button', { name: 'Zamknij dane pokwitaniowe' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
  await expect(frame.locator('#tannerToggleBtn')).toBeFocused();
  await frame.locator('#tannerToggleBtn').click();
  await expect(dialog).toBeVisible();
  await frame.evaluate(() => history.back());
  await expect(dialog).toBeHidden();
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
  const beforeFacts = await frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly());
  await frame.locator('#tannerToggleBtn').click();
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await apply(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('');
  const afterFacts = await frame.evaluate(() => window.VildaPubertyAssessmentState.readReadOnly());
  expect(afterFacts.activityRevision).toBeGreaterThan(beforeFacts.activityRevision);
  expect(afterFacts.assessment.observations.G.stage).toBe(3);
  expect(beforeFacts.assessment).toBeNull();
  expect(afterFacts.visit.reference).toEqual(beforeFacts.visitContext);
  expect(afterFacts.visit.currentAxes).toEqual(['G']);
  expect(afterFacts.visit.ownerPatientId).toBe(afterFacts.patientId);
});

test('homepage puberty: a synchronous owner change during Apply cannot write optional facts into the next patient', async ({ page }) => {
  const { frame, ids } = await open(page);
  await frame.locator('#tannerToggleBtn').click();
  const dialog = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await dialog.locator('[data-puberty-select-axis="G"]').selectOption('3');
  await frame.evaluate(nextPatientId => {
    const unsubscribe = window.VildaPubertyAssessmentState.subscribe(reason => {
      if (reason !== 'edit') return;
      unsubscribe(); sessionStorage.setItem('vildaCurrentPatientId', nextPatientId);
    });
  }, ids.b);
  await apply(dialog).click();
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('');
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.b);
});
