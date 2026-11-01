import { expect, test } from '../support/test-czas.mjs';
import { CLEAR_DIALOG, cancelThenDiscard, expectPubertyCleared, fillValidPatient,
  finishOwnReceipt, holdRealSaveReturn, loadPatient, openFictionalClearAccount,
  openPuberty, patientState, prepareDocProUserFlow, proveStaleDebounceWindow, readyClearPage, stage,
} from '../support/clear-current-state-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const diagnostic = await page.evaluate(() => {
    const iframe = [...document.querySelectorAll('iframe.app-pane')].find(el => !el.hidden);
    const owner = iframe?.contentWindow || window;
    const decision = owner.VildaSaveStatusIndicator?.getCurrentDecision?.();
    return { path: owner.location.pathname, parentPath: location.pathname,
      cached: owner.VildaSaveStatusIndicator?.getState?.(),
      decision: decision && { ready: decision.ready, state: decision.state },
      patientId: owner.sessionStorage.getItem('vildaCurrentPatientId'),
      account: owner.VildaVault?.getCurrentUser?.()?.userId,
      timers: owner.__clearDebounceProbe?.snapshot(), activity: owner.__clearInputActivity,
      clicks: owner.__clearTrustedClicks,
      main: owner.VildaPersistence?.readMainSession?.(), shared: owner.VildaPersistence?.readShared?.(),
      fields: Object.fromEntries(['name', 'firstName', 'lastName', 'age', 'height', 'weight', 'sex',
        'pubertyMenarcheAge', 'pubertyGnrhaStatus'].map(id => [id, owner.document.getElementById(id)?.value])),
      save: owner.__clearSaveProbe && { savedId: owner.__clearSaveProbe.savedId, returned: owner.__clearSaveProbe.returned,
        receiptFinished: owner.__clearSaveProbe.receiptFinished, clears: owner.__clearSaveProbe.clears,
        actualClears: owner.__clearSaveProbe.actualClears },
    };
  });
  await info.attach('clear-read-only-failure-state', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
});

for (const item of [
  { axis: 'G', sex: 'M', path: '/index.html', width: 1440 },
  { axis: 'Th', sex: 'F', path: '/docpro.html', width: 390, shell: true },
  { axis: 'P', sex: 'M', path: '/index.html', width: 1440, catchUpDebounce: true },
]) {
  test(`Clear protects live ${item.axis}-only input before autosave/status and honors Cancel then Discard (${item.path}, ${item.width}px)`, async ({ page, context }) => {
    const { owner } = await openFictionalClearAccount(page, context, item);
    await openPuberty(owner, item.sex);
    await owner.evaluate(() => window.__clearDebounceProbe.arm());
    await stage(owner, item.axis, 3).click();
    await expect(stage(owner, item.axis, 3)).toHaveAttribute('aria-pressed', 'true');
    await proveStaleDebounceWindow(owner, 'puberty300');
    if (item.shell) {
      await expect(page).toHaveURL(/\/app\.html#\/docpro$/u);
      expect(await page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('hidden');
    }
    await cancelThenDiscard(owner, item);
    if (item.axis === 'G') {
      await page.reload({ waitUntil: 'load' }); await readyClearPage(page);
      await expectPubertyCleared(page);
    }
  });
}

for (const item of [
  { label: 'menarche only', field: 'pubertyMenarcheAge', value: '12.5', sex: 'F', invalidSave: true },
  { label: 'explicit negative GnRHa only', field: 'pubertyGnrhaStatus', value: 'brak', sex: 'M' },
]) {
  test(`Clear protects legacy ${item.label} without anthropometry or detailed assessment`, async ({ page, context }) => {
    await openFictionalClearAccount(page, context);
    await openPuberty(page, item.sex, true);
    await page.evaluate(() => window.__clearDebounceProbe.arm());
    if (item.field === 'pubertyGnrhaStatus') {
      const select = page.locator('#' + item.field);
      // selectOption dispatches synthetic events. Exercise the visible native
      // selector with real keys, as the doctor's trusted input/change does.
      await select.click();
      await select.press('Home');
      await select.press('ArrowDown');
      await select.press('Enter');
      const events = await page.evaluate(() => window.__clearInputActivity);
      expect(events.some(event => event.field === 'pubertyGnrhaStatus' && event.trusted && event.value === 'brak')).toBe(true);
    } else {
      await page.locator('#' + item.field).fill(item.value);
      // Commit the real number input before draining the independent shared
      // autosave. Main/status debounce remains held and raw equality stays exact.
      await page.locator('#' + item.field).press('Tab');
    }
    await expect(page.locator('#' + item.field)).toHaveValue(item.value);
    expect(await page.evaluate(() => window.VildaPubertyAssessmentState.capture().present)).toBe(false);
    await proveStaleDebounceWindow(page, 'main300');
    await cancelThenDiscard(page, item);
  });
}

test('Clear does not invent changes for a loaded legacy patient or defaults on Start, DocPro and Klirens', async ({ page, context }) => {
  await openFictionalClearAccount(page, context);
  const patientId = await page.evaluate(async () => (await window.VildaVault.savePatient({
    version: 1, name: 'Fikcyjna Legacy Nie Zmieniona', user: { firstName: 'Legacy Nie Zmieniona', lastName: 'Fikcyjna',
      sex: 'F', age: 12, ageMonths: 0, height: 150, weight: 40, tannerStage: '3' },
    puberty: { menarcheAgeYears: 11.5, gnrhaStatus: 'brak', cdgpDeclared: 'nie' },
    plan: { palFactor: 1.4, palWybrany: false, dietLevel: 'moderate', dietaWybrana: false },
    bp: { heartRate: 82, population: 'healthy' }, respiratory: { state: 'awake', population: 'healthy' },
    intake: { history: [{ ageMonths: 120, height: 140, weight: 32 }], pal: '1.4' },
  }, { dedup: false })).patientId);
  const original = await page.evaluate(id => window.VildaVault.getPatient(id), patientId);
  for (const path of ['/index.html', '/docpro.html', '/kalkulator-klirens.html']) {
    if (!page.url().endsWith('/index.html')) { await page.goto('/index.html', { waitUntil: 'load' }); await readyClearPage(page); }
    await readyClearPage(page);
    await loadPatient(page, patientId, 'restore');
    await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
    if (path !== '/index.html') {
      await page.goto(path, { waitUntil: 'load' }); await readyClearPage(page);
      if (path === '/docpro.html') await prepareDocProUserFlow(page);
    }
    await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
    let decision;
    await expect.poll(async () => {
      decision = await page.evaluate(() => {
        const current = window.VildaSaveStatusIndicator.getCurrentDecision();
        return { ready: current.ready, state: current.state };
      });
      return decision.ready;
    }).toBe(true);
    expect(decision.state).toBe('saved');
    await page.locator(path.includes('klirens') ? '#clearBtn' : '#clearAllDataBtn').click();
    await expect(page.getByRole('dialog', { name: CLEAR_DIALOG })).toHaveCount(0);
    await expect(page.locator('#height')).toHaveValue('');
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(original);
  }
});

test('restoring the loaded record preserves a saved default PAL through Klirens and Clear', async ({ page, context }) => {
  await openFictionalClearAccount(page, context);
  const patientId = await page.evaluate(async () => (await window.VildaVault.savePatient({
    version: 1, name: 'Fikcyjna PAL Odtworzenie',
    user: { firstName: 'PAL Odtworzenie', lastName: 'Fikcyjna', sex: 'F', age: 12, height: 150, weight: 40 },
    plan: { palFactor: 1.4, palWybrany: false, dietLevel: 'moderate', dietaWybrana: false },
  }, { dedup: false })).patientId);
  await loadPatient(page, patientId, 'new');
  await readyClearPage(page);
  const original = await page.evaluate(id => window.VildaVault.getPatient(id), patientId);
  const before = await page.evaluate(() => ({ chosen: window.__vildaPlanPalTouched === true,
    offset: window.__clearInputActivity.length }));
  // Run the public operation used by the saved-record button. Its own PAL
  // input/change events must not change the meaning of the saved choice.
  page.once('dialog', dialog => dialog.accept());
  await page.evaluate(data => window.VildaDataImportExport.restoreLoadedState({ data }), original.snapshots[0].payload);
  const restored = await page.evaluate(offset => {
    const select = document.getElementById('palFactor');
    return { value: select.value, chosen: window.__vildaPlanPalTouched === true,
      events: window.__clearInputActivity.slice(offset).filter(event => event.field === 'palFactor') };
  }, before.offset);
  expect(before.chosen).toBe(false);
  expect(restored.events.map(event => ({ type: event.type, trusted: event.trusted })))
    .toEqual([{ type: 'input', trusted: false }, { type: 'change', trusted: false }]);
  expect(restored.chosen).toBe(false);
  await readyClearPage(page);
  await expect(page.locator('#palFactor')).not.toHaveValue('');
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
  await readyClearPage(page);
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  await page.locator('#clearBtn').click();
  await expect(page.getByRole('dialog', { name: CLEAR_DIALOG })).toHaveCount(0);
  await expect(page.locator('#height')).toHaveValue('');
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(original);
});

for (const existing of [false, true]) {
  test(`Save and Clear awaits its own real durable return and preserves puberty (${existing ? 'existing patient' : 'new patient'})`, async ({ page, context }) => {
    await openFictionalClearAccount(page, context);
    if (existing) {
      const id = await page.evaluate(async () => (await window.VildaVault.savePatient({ name: 'Fikcyjna Alicja Wyczyść',
        user: { lastName: 'Fikcyjna', firstName: 'Alicja Wyczyść', sex: 'F', age: 12, height: 150, weight: 40 },
      }, { dedup: false })).patientId);
      await loadPatient(page, id, 'restore');
    } else await fillValidPatient(page);
    await openPuberty(page, 'F', true);
    await stage(page, 'Th', 3).click();
    await page.locator('#pubertyMenarcheAge').fill('11.5');
    await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe(existing ? 'dirty' : 'new_patient');
    await holdRealSaveReturn(page);
    const before = await patientState(page);
    await page.locator('#clearAllDataBtn').click();
    const dialog = page.getByRole('dialog', { name: CLEAR_DIALOG });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: existing ? 'Zapisz i wyczyść' : 'Zapisz nowego i wyczyść', exact: true }).click();
    await page.waitForFunction(() => window.__clearSaveProbe.pending);
    await expect(dialog).toBeVisible();
    await expect(stage(page, 'Th', 3)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__clearSaveProbe.clears)).toBe(0);
    expect(await page.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(0);
    const savedId = await page.evaluate(() => window.__clearSaveProbe.savedId);
    const saved = await page.evaluate(id => window.VildaVault.getPatient(id), savedId);
    expect(saved.snapshots[0].payload.user.pubertyAssessment).toEqual(before.puberty.raw);
    expect(saved.snapshots[0].payload.puberty.menarcheAgeYears).toBe(11.5);
    await page.evaluate(async () => window.VildaVault.savePatient({ name: 'Fikcyjny Niezależny Zapis',
      user: { firstName: 'Niezależny', lastName: 'Fikcyjny', age: 9, height: 130, weight: 25, sex: 'M' },
    }, { dedup: false }));
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__clearSaveProbe.clears)).toBe(0);
    expect(await page.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(0);
    await finishOwnReceipt(page);
    await expect(dialog).toHaveCount(0);
    await expectPubertyCleared(page);
    expect(await page.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(1);
    expect(await page.evaluate(() => window.__clearSaveProbe.clears)).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), savedId)).toEqual(saved);
  });
}

test('a delayed real save return cannot replay Clear after a lock and a different fictional account', async ({ page, context }) => {
  await openFictionalClearAccount(page, context);
  await fillValidPatient(page);
  await openPuberty(page, 'F'); await stage(page, 'Th', 3).click();
  await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('new_patient');
  await holdRealSaveReturn(page);
  await page.locator('#clearAllDataBtn').click();
  const dialog = page.getByRole('dialog', { name: CLEAR_DIALOG });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Zapisz nowego i wyczyść', exact: true }).click();
  await page.waitForFunction(() => window.__clearSaveProbe.pending);
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__clearSaveProbe.clears)).toBe(0);
  expect(await page.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(0);
  await page.evaluate(async () => {
    window.VildaVault.lock();
    await window.VildaVault.createUser('Fikcyjny#DrugiOwnerClear2026!aA', { label: 'Drugi fikcyjny właściciel', iterations: 10000 });
  });
  await readyClearPage(page);
  await page.locator('#firstName').fill('Nowy właściciel — zachowaj');
  const before = await patientState(page), clears = await page.evaluate(() => window.__clearSaveProbe.clears);
  const actualClears = await page.evaluate(() => window.__clearSaveProbe.actualClears);
  await finishOwnReceipt(page);
  await expect(page.locator('#firstName')).toHaveValue('Nowy właściciel — zachowaj');
  expect(await page.evaluate(() => window.__clearSaveProbe.clears)).toBe(clears);
  expect(await page.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(actualClears);
  expect((await patientState(page)).patientId).toBe(before.patientId);
});
