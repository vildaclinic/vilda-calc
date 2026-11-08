import { expect, test } from '@playwright/test';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import {
  installPatientLoadMenuProbe, capturePatientLoadState, waitForPatientLoadReady,
  openPatientLoadChoice, choosePatientLoadMode, createPatientLoadMenuFixture,
} from '../support/patient-load-menu-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });

function expectLoading(control, { visible = true } = {}) {
  expect(control).not.toBeNull();
  if (visible) expect(control.visible).toBe(true);
  expect(control.state).toBe('loading');
  expect(control.text).toBe('Wczytywanie…');
  expect(control.busy).toBe('true');
  expect(control.ariaDisabled).toBe('true');
}

function expectNeutralPending(control) {
  expect(control.loadPending).toBe('true');
  expect(control.opacity).toBe('1');
  expect(control.color).toBe('rgb(113, 136, 139)');
  expect(control.background).toBe('rgb(230, 238, 238)');
  expect(control.image).toBe('none');
  // Presentation must not replace the native disabled/guard contract.
}

async function waitForSavedPaint(page, width) {
  const selector = width < 992 ? '#vildaHeaderSaveStatus'
    : 'aside.sidebar-v2 .sidebar-inner [data-menu-save-status]';
  // Observe the real UI first: the test must not retire Loading by polling a
  // native presentation getter before the application has painted Saved.
  await page.waitForFunction(target => {
    const status = document.querySelector(target);
    return status && !status.hidden && status.getClientRects().length > 0
      && status.getAttribute('data-save-state') === 'saved';
  }, selector, { polling: 100 });
}

for (const width of [1440, 390]) {
  for (const choice of ['restore', 'new']) {
    test(`${width}px: native ${choice} patient selection keeps one truthful loading presentation`, async ({ page, context }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await installPatientLoadMenuProbe(page);
      // Mobile enters through DocPro. Its real database action returns to Start;
      // both entry routes then use the same native patient-card load owner.
      const fixture = await createPatientLoadMenuFixture(page, { entry: width < 992 ? 'docpro' : 'start' });
      const cdp = await context.newCDPSession(page);
      const statusKey = width < 992 ? 'header:status' : 'desktop:status';
      const prefix = width < 992 ? 'drawer:' : 'desktop:';
      let primaryError, samples, owner, after;
      try {
        owner = await openPatientLoadChoice(page, 'Fikcyjny Beata', { observe: true,
          beforeLoad: () => cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }) });
        await expect(page).toHaveURL(/#\/start$/u);
        // The first accepted load already changed the selected patient. Waiting
        // for the user's choice must not briefly advertise Saved or no data.
        expect(await owner.evaluate(() => window.VildaDataImportExport.getPatientLoadPresentation()))
          .toEqual({ state: 'loading' });
        const chooserPaint = await page.evaluate(() => window.__patientLoadMenuProbe.read());
        expectLoading(chooserPaint.controls[statusKey]);
        for (const key of ['save', 'documents', 'clear']) {
          expectNeutralPending(chooserPaint.controls[prefix + key]);
        }
        expect(chooserPaint.controls[prefix + 'save'].ariaDisabled).toBe('true');
        expect(chooserPaint.controls[prefix + 'clear'].nativeDisabled).toBe(true);
        await choosePatientLoadMode(owner, choice);
        await waitForSavedPaint(page, width);
        await waitForPatientLoadReady(owner, fixture.ids.b);
        const menu = await visibleChromeMenu(page);
        await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
        await expect(menu.locator('[data-menu-clear]')).toBeEnabled();
        await expect(menu.locator('.chrome-menu-documents')).not.toHaveAttribute('aria-disabled', 'true');
        if (choice === 'restore') await expect(menu.locator('.chrome-menu-save')).not.toHaveAttribute('aria-disabled', 'true');
        else await expect(menu.locator('.chrome-menu-save')).toHaveAttribute('aria-disabled', 'true');
        after = await capturePatientLoadState(owner);
        samples = await page.evaluate(() => window.__patientLoadMenuProbe.stop());
        expect(after.patientId).toBe(fixture.ids.b);
        expect(after.fields).toMatchObject({ lastName: 'Fikcyjny', firstName: 'Beata', sex: 'F',
          height: choice === 'restore' ? '150' : '', weight: choice === 'restore' ? '41' : '' });
        expect(after.decision).toMatchObject({ ready: true, state: 'saved' });
        expect(after.reference).toBeTruthy();
        expect(after.presentation).toBeNull();
        for (const key of ['save', 'documents', 'clear']) {
          expect(samples.final.controls[prefix + key].loadPending).toBeNull();
        }
        expect(await owner.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds))
          .toEqual(fixture.records);
        // A is already settled before observation. The first native lifecycle
        // event therefore marks the accepted B load; recording it reads no API.
        const begin = samples.events.find(event => event.type === 'vilda:patient-load-presentation');
        expect(begin, 'the real accepted-load boundary was observed').toBeTruthy();
        const click = samples.events.find(event => event.type === 'click'
          && event.target === (choice === 'new' ? 'vildaLcmNew' : 'vildaLcmRestore'));
        expect(click?.trusted).toBe(true);
        const frames = [...samples.frames, samples.final].filter(frame => frame.at >= begin.at);
        expect(frames.length).toBeGreaterThan(0);
        let reachedSaved = false, loadingFrames = 0;
        for (const frame of frames) {
          expect(frame.scrollWidth - frame.viewportWidth, 'the loading header must not overflow horizontally')
            .toBeLessThanOrEqual(1);
          const status = frame.controls[statusKey];
          expect(status.visible).toBe(true);
          if (status.state === 'saved') {
            expect(frame.at).toBeGreaterThanOrEqual(click.at);
            expect(frame.owner.patientId).toBe(fixture.ids.b);
            expect(frame.owner.indicatorReady).toBe(true);
            expect(frame.owner.cachedState).toBe('saved');
            reachedSaved = true;
          } else {
            expect(reachedSaved, 'loading must not restart after the final Saved paint').toBe(false);
            expectLoading(status);
            loadingFrames += 1;
            for (const key of ['save', 'documents', 'clear']) {
              const control = frame.controls[prefix + key];
              if (control.visible) expectNeutralPending(control);
            }
          }
        }
        expect(loadingFrames).toBeGreaterThan(0);
        expect(reachedSaved).toBe(true);
        const savedTransitions = samples.savedTransitions.filter(transition => transition.at >= begin.at);
        expect(savedTransitions).toHaveLength(1);
        expect(savedTransitions[0].at).toBeGreaterThanOrEqual(click.at);
        expect(savedTransitions[0].patientId).toBe(fixture.ids.b);
        expect(savedTransitions[0].decision).toMatchObject({ ready: true, state: 'saved' });
        expect(savedTransitions[0].presentation).toBeNull();
      } catch (error) {
        primaryError = error;
      } finally {
        try {
          if (!samples && !page.isClosed()) samples = await page.evaluate(() => window.__patientLoadMenuProbe.stop());
          await testInfo.attach('native-patient-load-paint', { contentType: 'application/json',
            body: JSON.stringify({ width, choice, entry: fixture.entry, after, ...samples }) });
        } catch (error) { primaryError ||= error; }
        try {
          if (!page.isClosed()) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); }
        } catch (error) { primaryError ||= error; }
      }
      if (primaryError) throw primaryError;
    });
  }
}

test('Escape ends the native choice, and a real edit still warns before Clear', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installPatientLoadMenuProbe(page);
  const fixture = await createPatientLoadMenuFixture(page);
  const owner = await openPatientLoadChoice(page, 'Fikcyjny Beata', { observe: true });
  expect(await owner.evaluate(() => window.VildaDataImportExport.getPatientLoadPresentation()))
    .toEqual({ state: 'loading' });
  // Escape closes the actual chooser. The already accepted patient remains
  // selected with the native default New measurement state.
  await owner.locator('#vildaLcmNew').press('Escape');
  await expect(owner.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await waitForSavedPaint(page, 1440);
  await waitForPatientLoadReady(owner, fixture.ids.b);
  const menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
  const dismissed = await capturePatientLoadState(owner);
  expect(dismissed.fields).toMatchObject({ firstName: 'Beata', lastName: 'Fikcyjny', height: '', weight: '' });
  expect(dismissed.decision).toMatchObject({ ready: true, state: 'saved' });
  expect(dismissed.presentation).toBeNull();
  await expect(menu.locator('.chrome-menu-save')).toHaveAttribute('aria-disabled', 'true');
  const samples = await page.evaluate(() => window.__patientLoadMenuProbe.stop());
  await testInfo.attach('native-dismiss-load-paint', { contentType: 'application/json', body: JSON.stringify(samples) });
  for (const key of ['save', 'documents', 'clear']) expect(samples.final.controls['desktop:' + key].loadPending).toBeNull();
  await owner.locator('#height').fill('151');
  await owner.locator('#weight').fill('42');
  await owner.locator('#weight').blur();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('dirty');
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
  expect(await owner.evaluate(() => window.VildaDataImportExport.getPatientLoadPresentation())).toBeNull();
  await menu.locator('[data-menu-clear]').click();
  const warning = owner.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u });
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'Anuluj', exact: true }).click();
  const after = await capturePatientLoadState(owner);
  expect(after.patientId).toBe(fixture.ids.b);
  expect(after.fields).toMatchObject({ firstName: 'Beata', lastName: 'Fikcyjny', height: '151', weight: '42' });
  expect(after.decision).toMatchObject({ ready: true, state: 'dirty' });
  expect(after.reference).toBe(dismissed.reference);
  expect(await owner.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds))
    .toEqual(fixture.records);
});
