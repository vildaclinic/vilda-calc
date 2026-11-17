import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);

const IDS = ['palFactor', 'dietLevel', 'customGoalKg', 'reduceToggle', 'stabilizationToggle', 'growthEndedFlag',
  'nutritionNormsFlag', 'vitDSuppFlag', 'hydrationFlag', 'journeyFlag', 'peerMassFlag', 'alcoholFlag'];
const draft = (dialog, id) => dialog.locator(`[data-home-diet-field="${id}"]`);
const apply = dialog => dialog.getByRole('button', { name: 'Zastosuj założenia', exact: true });
const generate = dialog => dialog.getByRole('button', { name: 'Generuj i skopiuj zalecenia', exact: true });
const pdf = dialog => dialog.getByRole('button', { name: 'Raport PDF dla pacjenta', exact: true });

async function settled(frame) {
  await frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !VildaDataImportExport.isMainSessionRestorePending() && !VildaDobAge.restorePending());
}

async function setup(page, { shell = false, patient, ds = false } = {}) {
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__homeDietClipboard = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { window.__homeDietClipboard.push(String(text)); },
    } });
  });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  const payload = patient || fictionalPatient({ firstName: 'Dietetyczny', age: 13, sex: 'M', height: 155, weight: 75 });
  if (ds) payload.clinical = { downSyndrome: true };
  const id = await fixture.frame.evaluate(async data => (await VildaVault.savePatient(data, { dedup: false })).patientId, payload);
  await loadPatient(fixture.frame, id, 'restore');
  await settled(fixture.frame);
  if (ds) await fixture.frame.waitForFunction(() => VildaDsSource.getState().status === 'ready' && VildaDsSource.populacja() === 'DS');
  // Both native modules are lazy and ordered. Finish their real setup before
  // capturing the baseline; opening the new UI must not generate or copy.
  await fixture.frame.evaluate(async () => {
    await VildaPatientReportLoader.ensure();
    update();
    vildaPersistFlushNow({ force: true });
    VildaDataImportExport.saveMainSessionNow({ force: true });
  });
  await fixture.frame.waitForFunction(() => !!window.VildaHomeDiet && !!window.VildaDietRecommendations);
  await expect(fixture.frame.locator('#vhomeDietCard')).toBeVisible();
  await fixture.frame.evaluate(ids => {
    window.__homeDietClipboard = [];
    window.__homeDietNodes = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }, IDS);
  return { ...fixture, id, payload };
}

async function show(frame, mode = 'energy') {
  await frame.locator(`[data-home-diet-open="${mode}"]`).click();
  const dialog = frame.getByRole('dialog', { name: 'Zalecenia dietetyczne', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function snapshot(frame, id) {
  return frame.evaluate(async ({ id, ids }) => {
    const payload = VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
    const session = VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
    return { payload, session,
      controls: Object.fromEntries(ids.map(id => { const el = document.getElementById(id); return [id, el ? { value: el.value, checked: el.checked, disabled: el.disabled } : null]; })),
      palTouched: window.__vildaPlanPalTouched === true, dietTouched: window.__vildaDietLevelTouched === true,
      strategyTouched: window.__vildaDietStrategyTouched === true, goalChoice: window.__vildaDietGoalChoice ?? null,
      journey: localStorage.getItem('vildaBmiJourneyState'),
      versions: (await VildaVault.getPatient(id)).snapshotCount,
    };
  }, { id, ids: IDS });
}

async function expectOriginalNodes(frame) {
  expect(await frame.evaluate(ids => ids.every(id => document.getElementById(id) === window.__homeDietNodes[id])
    && ids.every(id => document.querySelectorAll('[id="' + id + '"]').length === 1), IDS)).toBe(true);
}

test('home diet: isolated assumptions and movement drafts cancel without clinical, storage or clipboard writes', async ({ page }) => {
  const { frame, id } = await setup(page);
  const before = await snapshot(frame, id), cardBefore = await frame.locator('#vhomeDietCard').boundingBox();
  const dialog = await show(frame, 'road');
  await expect(dialog.locator('input[id], input[name], select[id], select[name]')).toHaveCount(0);
  await expectOriginalNodes(frame);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  expect(await snapshot(frame, id)).toEqual(before);
  await dialog.locator('[data-home-diet-journey="move"]').first().click();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(() => VildaHomeDiet.open('report'));
  await expect(draft(dialog, 'palFactor')).toHaveValue('1.8');
  await expect(generate(dialog)).toBeDisabled();
  await expect(pdf(dialog)).toBeDisabled();
  await expect(dialog.locator('.vhome-diet-native-energy')).toBeHidden();
  await expect(dialog.locator('.vhome-diet-native-road')).toBeHidden();
  expect(await snapshot(frame, id)).toEqual(before);
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expectOriginalNodes(frame);
  expect((await frame.locator('#vhomeDietCard').boundingBox()).height).toBe(cardBefore.height);
});

test('home diet: explicit Apply updates original PAL and diet once, preserves the patient, and survives shell F5', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = await snapshot(frame, id), dialog = await show(frame);
  await expect(draft(dialog, 'palFactor')).toBeVisible();
  await expect(draft(dialog, 'dietLevel')).toBeVisible();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await draft(dialog, 'dietLevel').selectOption('light');
  expect(await snapshot(frame, id)).toEqual(before);
  await apply(dialog).click();
  await expect(dialog).toBeVisible();
  await expect(frame.locator('#palFactor')).toHaveValue('1.8');
  await expect(frame.locator('#dietLevel')).toHaveValue('light');
  await expect.poll(() => frame.evaluate(() => {
    const p = VildaPersistence.readMainSession()?.plan;
    return p && { palFactor: p.palFactor, palWybrany: p.palWybrany, dietLevel: p.dietLevel, dietaWybrana: p.dietaWybrana };
  })).toEqual({ palFactor: 1.8, palWybrany: true, dietLevel: 'light', dietaWybrana: true });
  const after = await snapshot(frame, id);
  expect(after.payload.user).toEqual(before.payload.user);
  expect(after.payload.advanced).toEqual(before.payload.advanced);
  expect(after.versions).toBe(before.versions);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expectOriginalNodes(frame);
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await page.reload({ waitUntil: 'load' });
  const restored = await shellFrame(page); await readyForPatient(restored); await settled(restored);
  await restored.evaluate(() => VildaPatientReportLoader.ensure());
  await expect(restored.locator('#palFactor')).toHaveValue('1.8');
  await expect(restored.locator('#dietLevel')).toHaveValue('light');
  await show(restored);
  await expect(draft(restored.locator('#vhomeDietDialog'), 'palFactor')).toHaveValue('1.8');
  await expect(draft(restored.locator('#vhomeDietDialog'), 'dietLevel')).toHaveValue('light');
});

test('home diet: road uses native movement actions and complete clinical output, and generation copies only on explicit click', async ({ page }) => {
  const { frame } = await setup(page), dialog = await show(frame, 'road');
  const move = dialog.locator('[data-home-diet-journey="move"]').first(), key = await move.getAttribute('data-key');
  const before = await frame.evaluate(() => ({ state: VildaBmiJourney.getSnapshot().state, stored: localStorage.getItem('vildaBmiJourneyState') }));
  await move.click();
  expect(await frame.evaluate(() => ({ state: VildaBmiJourney.getSnapshot().state, stored: localStorage.getItem('vildaBmiJourneyState') }))).toEqual(before);
  await apply(dialog).click();
  await expect.poll(() => frame.evaluate(key => VildaBmiJourney.getSnapshot().state.moves[key], key)).toBe(!before.state.moves[key]);
  const clinicalParts = ['.bmi-journey-hero', '.bmi-journey-goalbox', '.bmi-journey-kcal', '.bmi-journey-growth', '.bmi-journey-kontrola', '.bmi-journey-warn', '.bmi-journey-table'];
  for (const selector of clinicalParts) {
    expect(await dialog.locator('.vhome-diet-native-road ' + selector).allTextContents()).toEqual(await frame.locator('#toNormInfo ' + selector).allTextContents());
  }
  await expect(dialog.locator('[data-journey], [data-diet-strategy-choice], [data-diet-goal-choice], [data-diet-copy-result], [data-diet-report-direct]')).toHaveCount(0);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expect(generate(dialog)).toBeEnabled(); await generate(dialog).click();
  await expect(dialog.locator('.vhome-diet-native-energy')).toBeVisible();
  expect(await dialog.locator('.vhome-diet-native-energy').textContent()).toBe(await frame.locator('#dietEnergyResult').textContent());
  const text = await frame.evaluate(() => VildaSchowek.dlaSystemuSzpitalnego(VildaDietRecommendations.getLastOutputs().energy.textOutput));
  await expect.poll(() => frame.evaluate(() => window.__homeDietClipboard)).toEqual([text]);
  await dialog.getByRole('button', { name: 'Kopiuj zalecenia', exact: true }).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietClipboard)).toEqual([text, text]);
  await expectOriginalNodes(frame);
});

test('home diet: restoring, changing the owner and locking invalidate stale assumptions before Apply can write', async ({ page }) => {
  const { frame, ids, id } = await setup(page), dialog = await show(frame);
  const pal = await frame.locator('#palFactor').inputValue();
  await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(() => VildaDataImportExport.applyLoadedData(VildaPersistence.readMainSession(), { isSessionRestore: true }));
  await expect(dialog).toBeHidden(); await settled(frame);
  await expect(frame.locator('#palFactor')).toHaveValue(pal);
  await show(frame); await draft(dialog, 'palFactor').selectOption('1.8');
  await frame.evaluate(next => {
    const oldApply = document.querySelector('#vhomeDietDialog .vhome-dialog-apply');
    sessionStorage.setItem('vildaCurrentPatientId', next);
    oldApply.click();
  }, ids.b);
  await expect(dialog).toBeHidden();
  await expect(frame.locator('#palFactor')).toHaveValue(pal);
  // Undo only the deliberate ID-only probe. The native patient panel and form
  // have remained A throughout; a redundant native load correctly has no
  // choice dialog. The real same-patient restore was tested independently.
  await frame.evaluate(original => {
    sessionStorage.setItem('vildaCurrentPatientId', original); VildaHomeDiet.refresh();
  }, id);
  await show(frame);
  const flag = draft(dialog, 'nutritionNormsFlag');
  await expect(flag).toBeVisible();
  await flag.setChecked(!await flag.isChecked());
  await frame.evaluate(() => {
    const oldApply = document.querySelector('#vhomeDietDialog .vhome-dialog-apply');
    VildaVault.lock(); oldApply.click();
  });
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => VildaVault.isUnlocked())).toBe(false);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
});

for (const { title, patient, ds } of [
  { title: 'normal adult', patient: fictionalPatient({ firstName: 'Norma', age: 35, sex: 'F', height: 165, weight: 60 }), ds: false },
  { title: 'DS patient at 19 years 3 months', patient: (() => {
    const p = fictionalPatient({ firstName: 'Daria', age: 19, sex: 'F', height: 150, weight: 68 });
    p.user.ageMonths = 3; p.user.measuredAtISO = '2026-09-17'; p.advanced.data.currentAgeMonths = 231;
    return p;
  })(), ds: true },
  { title: 'child stabilization', patient: (() => {
    const p = fictionalPatient({ firstName: 'Stabilizacja', age: 4, sex: 'M', height: 105, weight: 24 });
    p.advanced.data.measurements = []; return p;
  })(), ds: false },
  { title: 'adult underweight', patient: fictionalPatient({ firstName: 'Przyrost', age: 35, sex: 'F', height: 165, weight: 45 }), ds: false },
]) {
  test(`home diet: ${title} retains native availability and avoids a stale reduction journey`, async ({ page }) => {
    const { frame } = await setup(page, { patient, ds });
    const native = await frame.evaluate(() => ({
      available: document.getElementById('dietRecommendationsBtn').style.display !== 'none',
      road: document.getElementById('toNormInfo').textContent,
      hasJourney: !!document.getElementById('bmiJourneyMount') && getComputedStyle(document.getElementById('toNormCard')).display !== 'none',
      hasDietChoices: Array.from(document.querySelectorAll('#bmiJourneyMount [data-journey="diet"]')).some(button => !button.disabled),
      strategyHidden: getComputedStyle(document.querySelector('[data-diet-strategy-proxy]').closest('.diet-energy-control-card')).display === 'none',
    }));
    expect(native.available).toBe(true);
    const dialog = await show(frame);
    await expect(dialog.locator('.vhome-diet-road')).toHaveCount(native.hasJourney ? 1 : 0);
    expect(await draft(dialog, 'dietLevel').isVisible()).toBe(native.hasDietChoices);
    expect(await frame.locator('#toNormInfo').textContent()).toBe(native.road);
    if (native.hasJourney) await expect(dialog.locator('.vhome-diet-native-road')).toHaveText(native.road);
    await expect(dialog.locator('[data-home-diet-journey="move"]')).toHaveCount(0);
    if (native.strategyHidden) {
      expect(await draft(dialog, 'reduceToggle').isVisible()).toBe(false);
      expect(await draft(dialog, 'stabilizationToggle').isVisible()).toBe(false);
    }
    await expect(generate(dialog)).toBeEnabled(); await generate(dialog).click();
    expect(await dialog.locator('.vhome-diet-native-energy').textContent()).toBe(await frame.locator('#dietEnergyResult').textContent());
    await expect(dialog.locator('.vhome-diet-native-energy')).not.toContainText('Musisz zredukować');
  });
}

test('home diet: an eligible custom goal remains a draft until Apply and then uses the native target and recommendations', async ({ page }) => {
  const patient = fictionalPatient({ firstName: 'CelWlasny', age: 35, sex: 'F', height: 164, weight: 66 });
  const { frame, id } = await setup(page, { patient }), before = await snapshot(frame, id), dialog = await show(frame);
  await expect(draft(dialog, 'goal')).toBeVisible();
  await draft(dialog, 'goal').selectOption('custom');
  await draft(dialog, 'customGoalKg').fill('62');
  expect(await snapshot(frame, id)).toEqual(before);
  await expect(generate(dialog)).toBeDisabled(); await expect(pdf(dialog)).toBeDisabled();
  await apply(dialog).click();
  await expect(dialog).toBeVisible();
  await expect(frame.locator('#customGoalKg')).toHaveValue('62');
  await expect.poll(() => frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly().plan.customGoalKg)).toBe(62);
  await expect(frame.locator('#toNormInfo')).toContainText('Cel własny');
  expect(await dialog.locator('.vhome-diet-native-road .bmi-journey-goalbox').allTextContents()).toEqual(await frame.locator('#toNormInfo .bmi-journey-goalbox').allTextContents());
  expect((await snapshot(frame, id)).versions).toBe(before.versions);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await expect(generate(dialog)).toBeEnabled(); await generate(dialog).click();
  expect(await dialog.locator('.vhome-diet-native-energy').textContent()).toBe(await frame.locator('#dietEnergyResult').textContent());
  await expectOriginalNodes(frame);
});

test('home diet: resize keeps original controls stable, compact cards and reachable mobile actions without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await setup(page, { shell: true }), dialog = await show(frame);
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  for (const width of [320, 1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await frame.evaluate(() => { update(); syncResponsiveCardPlacements(); });
    await expect(dialog).toBeVisible();
    await expectOriginalNodes(frame);
    await expect(draft(dialog, 'palFactor')).toHaveCSS('font-size', '16px');
    const geometry = await dialog.evaluate(node => {
      const box = node.getBoundingClientRect(), footer = node.querySelector('.vhome-dialog-footer').getBoundingClientRect();
      const button = node.querySelector('.vhome-dialog-cancel'), r = button.getBoundingClientRect();
      const body = node.querySelector('.vhome-dialog-body'), b = body.getBoundingClientRect();
      return { bodyFits: body.scrollWidth <= body.clientWidth + 1, bodyWidth: body.clientWidth, scrollWidth: body.scrollWidth,
        overflowing: Array.from(body.querySelectorAll('*')).filter(child => {
          const r = child.getBoundingClientRect(); return r.width && r.right > b.right + 1;
        }).slice(0, 12).map(child => ({ tag: child.tagName, cls: child.className, right: child.getBoundingClientRect().right })),
        intrinsicOverflow: Array.from(body.querySelectorAll('*')).filter(child => child.getBoundingClientRect().width
          && child.scrollWidth > child.clientWidth + 1).slice(-20).map(child => ({ tag: child.tagName, cls: child.className,
          client: child.clientWidth, scroll: child.scrollWidth, overflow: getComputedStyle(child).overflowX, text: child.textContent.slice(0, 70) })),
        footerInside: footer.bottom <= box.bottom + 1,
        cancelReachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button') === button };
    });
    expect(geometry.bodyFits, JSON.stringify({ width, ...geometry })).toBe(true);
    expect(geometry.footerInside).toBe(true); expect(geometry.cancelReachable).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
  const card = frame.locator('#vhomeDietCard');
  const geometry = await card.evaluate(node => {
    const css = getComputedStyle(node), height = node.getBoundingClientRect().height;
    const content = Array.from(node.children).reduce((sum, child) => {
      const c = getComputedStyle(child); return sum + child.getBoundingClientRect().height + parseFloat(c.marginTop) + parseFloat(c.marginBottom);
    }, 0) + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
    return { height, content };
  });
  expect(Math.abs(geometry.height - geometry.content)).toBeLessThan(2);
});

test('home diet: the PDF actor receives a guard bound to this editor and invalidates it on close, reopen and changed intake', async ({ page }) => {
  const { frame, id } = await setup(page), before = await snapshot(frame, id), dialog = await show(frame);
  await expect(generate(dialog)).toBeEnabled(); await generate(dialog).click();
  await expect(pdf(dialog)).toBeEnabled();
  // The native PDF actor's asynchronous cancellation points have their own
  // production tests. Stub only that existing boundary here to inspect the
  // exact callback supplied by the real UI click, without rendering a PDF.
  await frame.evaluate(() => {
    window.__homeDietPdfTasks = [];
    window.__homeDietOriginalPdf = VildaDietRecommendations.generatePdfReport;
    VildaDietRecommendations.generatePdfReport = async (button, mode, options) => {
      window.__homeDietPdfTasks.push({ button, mode, options });
    };
  });
  await pdf(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietPdfTasks.length)).toBe(1);
  expect(await frame.evaluate(() => ({ mode: window.__homeDietPdfTasks[0].mode,
    ownButton: window.__homeDietPdfTasks[0].button === document.querySelector('#vhomeDietDialog [data-home-diet-action="pdf"]'),
    guarded: typeof window.__homeDietPdfTasks[0].options?.isCurrent === 'function',
    current: window.__homeDietPdfTasks[0].options?.isCurrent?.() }))).toEqual({ mode: 'classic', ownButton: true, guarded: true, current: true });
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[0].options.isCurrent())).toBe(false);
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('diet-'));
  await show(frame);
  // The patient and inputs are identical, but this is a new editor instance.
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[0].options.isCurrent())).toBe(false);
  await expect(generate(dialog)).toBeEnabled(); await generate(dialog).click();
  await expect(pdf(dialog)).toBeEnabled(); await pdf(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.__homeDietPdfTasks.length)).toBe(2);
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[1].options.isCurrent())).toBe(true);
  await frame.evaluate(() => {
    window.__homeDietPreviousIntake = window.intakeEstimatedKcalPerDay;
    window.intakeEstimatedKcalPerDay = Number.isFinite(window.intakeEstimatedKcalPerDay) ? window.intakeEstimatedKcalPerDay + 1 : 1234;
  });
  // Refusal must precede the periodic UI close: a pending export cannot
  // continue against a changed clinical basis during that short interval.
  expect(await frame.evaluate(() => window.__homeDietPdfTasks[1].options.isCurrent())).toBe(false);
  await expect(dialog).toBeHidden();
  await frame.evaluate(() => {
    window.intakeEstimatedKcalPerDay = window.__homeDietPreviousIntake;
    VildaDietRecommendations.generatePdfReport = window.__homeDietOriginalPdf;
  });
  const after = await snapshot(frame, id);
  expect(after.payload).toEqual(before.payload); expect(after.versions).toBe(before.versions);
});

test('home diet: the existing card visibility preference closes and hides the editor without changing patient data', async ({ page }) => {
  const { frame, id } = await setup(page), before = await snapshot(frame, id), dialog = await show(frame);
  const preferences = await frame.evaluate(() => VildaPersistence.readPreferenceJSON('CARD_VISIBILITY', {}));
  await frame.evaluate(previous => {
    VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', { ...previous, dietRecommendationsBtn: false });
    updateDietRecommendationsVisibility(); VildaHomeDiet.refresh();
  }, preferences);
  await expect(frame.locator('#vhomeDietCard')).toBeHidden();
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => VildaHomeDiet.open('energy'))).toBe(false);
  expect(await snapshot(frame, id)).toEqual(before);
  expect(await frame.evaluate(() => window.__homeDietClipboard)).toEqual([]);
  await frame.evaluate(previous => {
    VildaPersistence.writePreferenceJSON('CARD_VISIBILITY', previous);
    updateDietRecommendationsVisibility(); VildaHomeDiet.refresh();
  }, preferences);
  await expect(frame.locator('#vhomeDietCard')).toBeVisible();
  expect(await snapshot(frame, id)).toEqual(before);
});
