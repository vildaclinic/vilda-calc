import { expect } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from './centile-live-fixture.mjs';
import { visibleChromeMenu } from './chrome-menu-fixture.mjs';

// Read-only paint observation. The load itself always goes through the real
// database, patient card and native New/Restore buttons.
export async function installPatientLoadMenuProbe(page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const probe = window.__patientLoadMenuProbe = { running: false, frames: [], events: [], savedTransitions: [] };
    function control(node, styleFor) {
      if (!node) return null;
      const rect = node.getBoundingClientRect(), css = styleFor(node);
      let visible = rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight;
      for (let parent = node; parent; parent = parent.parentElement) {
        const style = styleFor(parent);
        if (parent.hidden || style.display === 'none' || style.visibility === 'hidden'
          || Number(style.opacity) === 0) visible = false;
      }
      return {
        visible, text: node.textContent.trim().replace(/\s+/g, ' '),
        state: node.getAttribute('data-save-state'), hidden: node.hidden,
        busy: node.getAttribute('aria-busy'), ariaDisabled: node.getAttribute('aria-disabled'),
        nativeDisabled: node.disabled === true,
        loadPending: node.getAttribute('data-menu-load-pending'),
        color: css.color, background: css.backgroundColor, image: css.backgroundImage, opacity: css.opacity,
      };
    }
    probe.read = () => {
      const iframe = document.querySelector('iframe.app-pane:not([hidden])'), owner = iframe?.contentWindow;
      // Shared ancestors are read once within this paint sample, never cached
      // across frames. Every control keeps the same visibility/style checks.
      const styles = new Map();
      const styleFor = node => {
        if (!styles.has(node)) styles.set(node, getComputedStyle(node));
        return styles.get(node);
      };
      const controls = {};
      for (const [prefix, selector] of [['desktop', 'aside.sidebar-v2 .sidebar-inner'], ['drawer', '.chrome-drawer-body']]) {
        const menu = document.querySelector(selector);
        for (const [key, target] of [['save', '.chrome-menu-save'], ['documents', '.chrome-menu-documents'],
          ['clear', '[data-menu-clear]'], ['status', '[data-menu-save-status]']]) {
          controls[`${prefix}:${key}`] = control(menu?.querySelector(target), styleFor);
        }
      }
      controls['header:status'] = control(document.getElementById('vildaHeaderSaveStatus'), styleFor);
      return {
        at: performance.now(), route: location.hash, controls,
        viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        owner: owner ? {
          patientId: owner.sessionStorage.getItem('vildaCurrentPatientId'),
          cachedState: owner.VildaSaveStatusIndicator?.getState?.(),
          indicatorReady: owner.VildaSaveStatusIndicator?.isReadyForSharedReference?.(),
        } : null,
      };
    };
    let previousPaintState;
    const recordSavedTransition = sample => {
      const status = sample.controls[innerWidth < 992 ? 'header:status' : 'desktop:status'];
      if (status?.state === 'saved' && previousPaintState !== 'saved') {
        const owner = document.querySelector('iframe.app-pane:not([hidden])')?.contentWindow;
        // The actual UI must reach Saved first. A fresh decision verifies that
        // transition; the per-paint observer never drives presentation retirement.
        probe.savedTransitions.push({ at: sample.at, patientId: sample.owner?.patientId,
          decision: owner?.VildaSaveStatusIndicator?.getCurrentDecision?.(),
          presentation: owner?.VildaDataImportExport?.getPatientLoadPresentation?.() ?? null });
      }
      previousPaintState = status?.state;
    };
    probe.start = () => {
      probe.frames = []; probe.events = []; probe.savedTransitions = [];
      previousPaintState = undefined; probe.running = true;
      return probe.read();
    };
    probe.stop = () => {
      probe.running = false;
      const final = probe.read();
      recordSavedTransition(final);
      const result = { frames: probe.frames, events: probe.events, savedTransitions: probe.savedTransitions, final };
      probe.detach?.(); probe.detach = null;
      return result;
    };
    function frame() {
      if (probe.running) {
        const sample = probe.read();
        probe.frames.push(sample);
        recordSavedTransition(sample);
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

export async function capturePatientLoadState(owner) {
  return owner.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    fields: Object.fromEntries(['lastName', 'firstName', 'height', 'weight', 'age', 'ageMonths', 'sex']
      .map(id => [id, document.getElementById(id)?.value])),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision(),
    reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
    readiness: window.VildaDataImportExport.getSaveReadiness(),
    presentation: window.VildaDataImportExport.getPatientLoadPresentation(),
  }));
}

export async function waitForPatientLoadReady(owner, patientId) {
  await owner.waitForFunction(id => sessionStorage.getItem('vildaCurrentPatientId') === id
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && window.VildaSaveStatusIndicator.getCurrentDecision().ready
    && window.VildaDataImportExport.getPatientLoadPresentation() === null, patientId, { polling: 100 });
}

export async function openPatientLoadChoice(page, name, { observe = false, beforeLoad } = {}) {
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  const owner = await shellFrame(page, 'Start');
  await expect(owner.locator('.vilda-patient-database')).toBeVisible();
  await owner.locator('.pt-row', { hasText: name }).locator('.pt-row-open').click();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  // CPU throttling belongs to the measured native Load/chooser operation, not
  // to unrelated database/card preparation that precedes the observation.
  await beforeLoad?.();
  if (observe) {
    await owner.evaluate(() => {
      const probe = window.top.__patientLoadMenuProbe;
      probe.detach?.();
      const record = event => {
        if (!probe.running) return;
        const mode = event.type === 'click' ? event.target?.closest?.('#vildaLcmNew,#vildaLcmRestore') : null;
        if (event.type === 'click' && !mode) return;
        probe.events.push({
          at: window.top.performance.now(), type: event.type, trusted: event.isTrusted,
          target: mode?.id || null,
          patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        });
      };
      document.addEventListener('vilda:patient-load-presentation', record);
      document.addEventListener('click', record, true);
      probe.detach = () => {
        document.removeEventListener('vilda:patient-load-presentation', record);
        document.removeEventListener('click', record, true);
      };
    });
    await page.evaluate(() => window.__patientLoadMenuProbe.start());
  }
  await owner.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  const choices = owner.locator('#vildaLoadChoiceModal');
  const guard = owner.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/u });
  await expect(choices.or(guard)).toBeVisible();
  if (await guard.isVisible()) {
    await guard.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/u }).click();
  }
  await expect(choices).toBeVisible();
  return owner;
}

export async function choosePatientLoadMode(owner, choice) {
  await owner.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(owner.locator('#vildaLoadChoiceModal')).toHaveCount(0);
}

export async function createPatientLoadMenuFixture(page, { entry = 'start' } = {}) {
  const fixture = await createFictionalVault(page, { shell: true });
  const recordIds = Object.values(fixture.ids);
  const records = await fixture.frame.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), recordIds);
  const owner = await openPatientLoadChoice(page, 'Fikcyjny Antoni');
  await choosePatientLoadMode(owner, 'restore');
  await waitForPatientLoadReady(owner, fixture.ids.a);
  expect((await capturePatientLoadState(owner)).decision.state).toBe('saved');
  if (entry === 'docpro') {
    const menu = await visibleChromeMenu(page);
    await menu.locator('a[href="docpro.html"]').click();
    const docpro = await shellFrame(page, 'DocPro');
    await readyForPatient(docpro);
    const confirmation = docpro.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
    await expect(docpro.locator('#calcForm')).toBeVisible();
    await waitForPatientLoadReady(docpro, fixture.ids.a);
    expect((await capturePatientLoadState(docpro)).decision.state).toBe('saved');
    await expect(page).toHaveURL(/#\/docpro$/u);
  }
  return { ...fixture, recordIds, records, entry };
}
