import { expect, test } from '@playwright/test';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';
import { createPatientLoadMenuFixture } from '../support/patient-load-menu-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { installPatientRefreshProbe, captureRefreshPatient } from '../support/patient-refresh-status-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference',
  // Full DOM snapshots would perturb the CPU4 reload. Retain trace actions,
  // screenshots and sources; per-paint JSON and failed requests are separate.
  trace: { mode: 'retain-on-failure', snapshots: false, screenshots: true, sources: true } });

for (const width of [1440, 390]) {
  for (const state of ['saved', 'dirty', 'empty']) {
    test(`${width}px: F5 restores ${state} without a false no-data status`, async ({ page, context }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await installPatientRefreshProbe(page);
      const networkProblems = [], pageErrors = [];
      page.on('requestfailed', request => networkProblems.push({ url: request.url(),
        method: request.method(), failure: request.failure()?.errorText }));
      page.on('response', response => {
        if (response.status() >= 400) networkProblems.push({ url: response.url(), status: response.status() });
      });
      page.on('pageerror', error => pageErrors.push(error.message));
      const fixture = state === 'empty'
        ? await createFictionalVault(page, { shell: true }) : await createPatientLoadMenuFixture(page);
      let owner = await shellFrame(page, 'Start');
      if (state === 'dirty') {
        await owner.locator('#height').fill('159');
        await owner.locator('#height').blur();
        await owner.waitForFunction(() => window.VildaSaveStatusIndicator.getState() === 'dirty');
      }
      const ids = Object.values(fixture.ids);
      const records = await owner.evaluate(values => Promise.all(values.map(id => window.VildaVault.getPatient(id))), ids);
      const before = await captureRefreshPatient(owner);
      expect(before.decision).toMatchObject({ ready: true, state: state === 'empty' ? 'hidden' : state });
      await page.evaluate(() => sessionStorage.setItem('e2e-patient-refresh-probe', '1'));
      const cdp = await context.newCDPSession(page);
      let samples, after, primaryError;
      try {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.reload({ waitUntil: 'load' });
        owner = await shellFrame(page, 'Start');
        if (state === 'empty') {
          const result = await owner.evaluate(() => window.VildaDataImportExport.whenInitialMainSessionRestoreSettled());
          expect(result.ready).toBe(true);
          await owner.waitForFunction(() => window.VildaSaveStatusIndicator.isReadyForSharedReference());
        } else {
          // Let the application itself retire Loading. Poll only the actual
          // rendered state; a getter must not finish restoration for the test.
          await page.waitForFunction(({ width, state }) => {
            const status = document.querySelector(width < 992 ? '#vildaHeaderSaveStatus'
              : 'aside.sidebar-v2 .sidebar-inner [data-menu-save-status]');
            return status && !status.hidden && status.getAttribute('data-save-state') === state;
          }, { width, state }, { polling: 100 });
        }
        await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
        samples = await page.evaluate(() => window.__patientRefreshProbe.stop());
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        after = await captureRefreshPatient(owner);
        expect(after.patientId).toBe(before.patientId);
        expect(after.reference).toBe(before.reference);
        expect(after.user).toEqual(before.user);
        expect(after.fields).toEqual(before.fields);
        expect(after.readiness.ready).toBe(true);
        expect(after.decision).toMatchObject({ ready: true, state: state === 'empty' ? 'hidden' : state });
        expect(after.explicitLoad).toBeNull();
        expect(await owner.evaluate(values => Promise.all(values.map(id => window.VildaVault.getPatient(id))), ids))
          .toEqual(records);
        expect(pageErrors).toEqual([]);
        const frames = [...samples.frames, samples.final];
        expect(frames.length).toBeGreaterThan(0);
        let loading = 0, reachedFinal = false;
        for (const frame of frames) {
          expect(frame.scrollWidth - frame.viewportWidth).toBeLessThanOrEqual(1);
          const status = frame.controls[width < 992 ? 'header:status' : 'desktop:status'];
          if (!status) continue; // The control has not been created yet.
          if (state === 'empty') {
            expect(status.state).toBe('hidden');
            if (width < 992) expect(status.visible).toBe(false);
          } else {
            expect(status.visible, 'selected-patient status stays present from its first paint').toBe(true);
            if (status.state === state) {
              expect(frame.owner.patientId).toBe(fixture.ids.a);
              expect(frame.owner.cached).toBe(state);
              expect(frame.owner.ready).toBe(true);
              reachedFinal = true;
            } else {
              expect(reachedFinal, 'the terminal real status must not revert to Loading').toBe(false);
              expect(status.state).toBe('loading');
              expect(status.text).toBe('Wczytywanie…');
              expect(status.busy).toBe('true');
              expect(status.ariaDisabled).toBe('true');
              loading += 1;
            }
          }
        }
        if (state === 'empty') {
          expect(after.patientId).toBeNull();
          expect(after.fields.age).toBe('');
          expect(after.fields.ageMonths).toBe('');
          expect(after.sexDisabled).toBe(false);
          expect(samples.terminalTransitions).toEqual([]);
        } else {
          expect(loading).toBeGreaterThan(0);
          expect(reachedFinal).toBe(true);
          expect(samples.terminalTransitions).toHaveLength(1);
          expect(samples.terminalTransitions[0]).toMatchObject({ state, patientId: fixture.ids.a,
            decision: { ready: true, state } });
        }
        if (state === 'dirty') {
          // The presentation must leave the real unsaved-data guard intact.
          const menu = await visibleChromeMenu(page);
          await menu.locator('[data-menu-clear]').click();
          const warning = owner.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u });
          await expect(warning).toBeVisible();
          await warning.getByRole('button', { name: 'Anuluj', exact: true }).click();
          expect((await captureRefreshPatient(owner)).fields).toEqual(after.fields);
        }
      } catch (error) {
        primaryError = error;
      } finally {
        try {
          if (!samples && !page.isClosed()) samples = await page.evaluate(() => window.__patientRefreshProbe?.stop());
          await testInfo.attach('patient-refresh-paint', { contentType: 'application/json',
            body: JSON.stringify({ width, state, before, after, samples, networkProblems, pageErrors }) });
        } catch (error) { primaryError ||= error; }
        try {
          if (!page.isClosed()) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); }
        } catch (error) { primaryError ||= error; }
      }
      if (primaryError) throw primaryError;
    });
  }
}
