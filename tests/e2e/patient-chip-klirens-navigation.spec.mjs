import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { czekajNaOdtworzenieSesji } from '../support/sesja-czekanie.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

// Production load flow, a real encrypted fictional vault and native timers.
// Readiness checks observe restoration; they do not persist or recollect a form.
async function settled(owner) {
  await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady?.()
    && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  await czekajNaOdtworzenieSesji(owner);
  await owner.waitForFunction(() => !window.__vildaPersistRestoring
    && !window.VildaDobAge?.restorePending?.()
    && !window.VildaDataImportExport?.isMainSessionRestorePending?.()
    && Number(window.__vildaPersistPauseUntil || 0) <= Date.now());
  await owner.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function status(owner) {
  return owner.evaluate(() => {
    const api = window.VildaSaveStatusIndicator;
    const reference = api?.getReferenceFingerprint();
    return { state: api?.getState(), referenceReady: typeof reference === 'string' && reference.length > 0,
      sameData: api?._computeCanonicalFingerprint() === reference };
  });
}

async function expectStatus(page, owner, expected, label) {
  try {
    await expect.poll(() => status(owner), { message: label, timeout: 15_000 }).toEqual({
      state: expected, referenceReady: true, sameData: expected === 'saved',
    });
    await expect(page.locator('#vildaPatientChip'), `${label}: header chip`)
      .toHaveClass(new RegExp(`vilda-save-state--${expected}(?:\\s|$)`));
    await expect(page.locator('#vildaPatientChip')).toHaveAttribute('title',
      expected === 'saved' ? /Dane pacjenta zapisane/ : /Niezapisane zmiany/);
  } catch (error) {
    const data = await owner.evaluate(() => ({
      path: location.pathname, state: window.__vildaSaveStatusState,
      reference: window.VildaSaveStatusIndicator?.getReferenceFingerprint(),
      current: window.VildaSaveStatusIndicator?._computeCanonicalFingerprint(),
      main: window.VildaPersistence?.readMainSession(), clcr: window.VildaPersistence?.readClcrSession(),
      referenceRecord: sessionStorage.getItem('vilda-save-ref-v1'),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'), choice: sessionStorage.getItem('vildaLoadChoiceV1'),
      readOnly: window.__vildaSaveStatusReadOnly,
      applySequence: window.VildaDataImportExport?.getApplyLoadedDataSequence?.(),
      authReady: window.VildaAuthUI?.isBootReady?.(),
      pending: window.VildaDataImportExport?.isMainSessionRestorePending?.(), restoring: window.__vildaPersistRestoring,
    }));
    await test.info().attach(`chip-${label}`, { body: JSON.stringify(data, null, 2), contentType: 'application/json' });
    throw error;
  }
}

async function route(page, shell, target) {
  const renal = target === 'klirens';
  const title = renal ? 'Kalkulator klirensu' : 'Start';
  let owner = page;
  if (shell) {
    await page.evaluate(value => window.VildaShell.navigate(value), target);
    owner = await shellFrame(page, title);
    await expect(page.locator(`iframe.app-pane[title="${title}"]`)).toBeVisible();
  } else {
    await page.goto(renal ? '/kalkulator-klirens.html' : '/index.html', { waitUntil: 'load' });
  }
  await settled(owner);
  return owner;
}

async function reload(page, shell, target) {
  await page.reload({ waitUntil: 'load' });
  const owner = shell ? await shellFrame(page, target === 'klirens' ? 'Kalkulator klirensu' : 'Start') : page;
  await settled(owner);
  return owner;
}

for (const shell of [false, true]) {
  for (const choice of ['restore', 'new']) {
    test(`${shell ? 'shell' : 'standalone'} ${choice}: empty Klirens stays saved across navigation and F5; a real result input stays dirty`, async ({ page }) => {
      await page.setViewportSize(choice === 'new' ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      const fixture = await createFictionalVault(page, { shell });
      let owner = fixture.frame;
      await loadPatient(owner, fixture.ids.a, choice);
      await settled(owner);
      await expectStatus(page, owner, 'saved', 'load on Start');
      owner = await reload(page, shell, 'start');
      await expectStatus(page, owner, 'saved', 'Start F5');

      owner = await route(page, shell, 'klirens');
      await expectStatus(page, owner, 'saved', 'first Klirens visit');
      // These controls come from the actual serializer, including calculators
      // that are currently hidden. They remain present in the real session.
      await expect.poll(() => owner.evaluate(() => window.VildaPersistence.readClcrSession()?.inputs?.CA_collectionHours)).toBe('24');
      owner = await reload(page, shell, 'klirens');
      await expectStatus(page, owner, 'saved', 'Klirens F5');
      owner = await route(page, shell, 'start');
      await expectStatus(page, owner, 'saved', 'Start after Klirens');
      owner = await reload(page, shell, 'start');
      await expectStatus(page, owner, 'saved', 'Start F5 after Klirens');

      owner = await route(page, shell, 'klirens');
      await owner.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
      await expect(owner.locator('#Scr')).toBeVisible();
      await expectStatus(page, owner, 'saved', 'calculator selection alone');
      await owner.locator('#Scr').fill('0.8');
      await owner.locator('#Scr').blur();
      await expectStatus(page, owner, 'dirty', 'real creatinine input');
      await expect.poll(() => owner.evaluate(() => window.VildaPersistence.readClcrSession()?.inputs?.Scr)).toBe('0.8');
      owner = await reload(page, shell, 'klirens');
      await expect(owner.locator('#Scr')).toHaveValue('0.8');
      await expectStatus(page, owner, 'dirty', 'real creatinine after F5');
      owner = await route(page, shell, 'start');
      await expectStatus(page, owner, 'dirty', 'real creatinine on Start');

      owner = await route(page, shell, 'klirens');
      await owner.locator('#Scr').fill('');
      await owner.locator('#Scr').blur();
      await expectStatus(page, owner, 'saved', 'creatinine edit reverted');
      owner = await route(page, shell, 'start');
      await expectStatus(page, owner, 'saved', 'Start after reverting creatinine');
    });
  }
}
