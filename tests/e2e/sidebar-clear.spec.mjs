import { expect, test } from '../support/test-czas.mjs';
import { devices } from '@playwright/test';
import { CLEAR_DIALOG, fillValidPatient, finishOwnReceipt, holdRealSaveReturn, loadPatient,
  openFictionalClearAccount, openPuberty, patientState, prepareDocProUserFlow, proveStaleDebounceWindow, readyClearPage, stage,
} from '../support/clear-current-state-fixture.mjs';
import { closeChromeMenu, visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';
import { emulatePhone, LANDSCAPE_SAFE_AREA } from '../support/telefon-poziomo.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

const clearFromMenu = async page => {
  const menu = await visibleChromeMenu(page);
  const clear = menu.getByRole('button', { name: 'Wyczyść', exact: true });
  await expect(clear).toBeEnabled();
  await clear.click();
};

async function storedRecordAndNote(owner) {
  return owner.evaluate(async () => {
    const vault = window.VildaVault;
    const patientId = (await vault.savePatient({ version: 1, name: 'Fikcyjna Alicja Menu',
      user: { firstName: 'Alicja Menu', lastName: 'Fikcyjna', sex: 'F', age: 12, ageMonths: 0, height: 150, weight: 40 },
      puberty: { menarcheAgeYears: 11.5, gnrhaStatus: 'brak', cdgpDeclared: 'nie' },
      intake: { history: [{ ageMonths: 120, height: 140, weight: 32 }] },
    }, { dedup: false })).patientId;
    const noteId = (await vault.savePatientNote({ patientId, title: 'Fikcyjna trwała notatka',
      category: 'observation', body: 'Fikcyjna notatka zachowana po wyczyszczeniu formularza.' })).id;
    return { patientId, noteId, record: await vault.getPatient(patientId), note: await vault.getPatientNote(noteId) };
  });
}

async function expectStoredIntact(owner, stored) {
  expect(await owner.evaluate(id => window.VildaVault.getPatient(id), stored.patientId)).toEqual(stored.record);
  expect(await owner.evaluate(id => window.VildaVault.getPatientNote(id), stored.noteId)).toEqual(stored.note);
}

async function loadSavedDocProForClear(page, owner, patientId) {
  // Use the same patient-card -> load-choice -> Restore action as the doctor.
  // A nested restore inside the pick publication runs before the accepted
  // operation completes and is deliberately refused by the production guard.
  const dialogs = [];
  const unexpectedDialog = async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  };
  page.on('dialog', unexpectedDialog);
  let witness, complete = false;
  try {
    witness = await owner.evaluateHandle(id => {
      const api = window.VildaDataImportExport, initial = api.getApplyLoadedDataSequence();
      if (!Number.isSafeInteger(initial)) throw Error('Missing initial patient-load sequence');
      let done;
      const dispose = () => document.removeEventListener('vilda:state-restored', restored);
      const promise = new Promise(resolve => { done = resolve; });
      function restored(event) {
        const detail = event.detail || {}, sequence = api.getApplyLoadedDataSequence();
        if (detail.source !== 'restoreLoadedState' || sessionStorage.getItem('vildaCurrentPatientId') !== id
          || !Number.isSafeInteger(sequence) || sequence <= initial
          || detail.patientId !== undefined && detail.patientId !== id
          || detail.applySequence !== undefined && detail.applySequence !== sequence) return;
        dispose(); done({ patientId: id, applySequence: sequence });
      }
      document.addEventListener('vilda:state-restored', restored);
      return { promise, dispose };
    }, patientId);
    await loadPatient(owner, patientId, 'restore');
    const restored = await witness.evaluate(value => value.promise);
    await expect.poll(() => owner.evaluate(() => {
      const api = window.VildaDataImportExport, decision = window.VildaSaveStatusIndicator.getCurrentDecision();
      return { patientId: sessionStorage.getItem('vildaCurrentPatientId'), applySequence: api.getApplyLoadedDataSequence(),
        ready: decision.ready, state: decision.state,
        model: Object.fromEntries(['height', 'weight', 'age', 'ageMonths', 'sex', 'name',
          'pubertyMenarcheAge', 'pubertyGnrhaStatus', 'pubertyCdgp'].map(id => [id, document.getElementById(id).value])) };
    })).toEqual({ ...restored, ready: true, state: 'saved',
      model: { height: '150', weight: '40', age: '12', ageMonths: '0', sex: 'F', name: 'Fikcyjna Alicja Menu',
        pubertyMenarcheAge: '11.5', pubertyGnrhaStatus: 'brak', pubertyCdgp: 'nie' } });
    // Choosing Restore in the native modal is the confirmation itself.
    expect(dialogs).toEqual([]);
    complete = true;
  } finally {
    page.off('dialog', unexpectedDialog);
    if (witness) {
      const cleanup = async () => { await witness.evaluate(value => value.dispose()); await witness.dispose(); };
      if (complete) await cleanup(); else await cleanup().catch(() => {});
    }
  }
}

for (const item of [
  { name: 'desktop Start', path: '/index.html', width: 1440 },
  { name: 'phone shell DocPro', path: '/docpro.html', width: 390, shell: true },
  { name: 'desktop standalone DocPro', path: '/docpro.html', width: 1440 },
]) test(`${item.name}: the real menu clear resets the working form and retains the entire saved record and note`, async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context, item);
  const stored = await storedRecordAndNote(owner);
  if (item.shell && item.path === '/docpro.html') {
    await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
    await loadSavedDocProForClear(page, owner, stored.patientId);
    await expect(page).toHaveURL(/\/app\.html#\/docpro$/u);
  }
  else await loadPatient(owner, stored.patientId, 'restore');
  await expect(owner.locator('#height')).toHaveValue('150');
  await clearFromMenu(page);
  await expect(owner.getByRole('dialog', { name: CLEAR_DIALOG })).toHaveCount(0);
  await expect(owner.locator('#height')).toHaveValue('');
  await expect.poll(() => owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('hidden');
  await expectStoredIntact(owner, stored);
  if (item.shell) {
    await expect(page.locator('[data-vilda-chrome-drawer]')).toBeHidden();
    await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
    await expect.poll(() => owner.evaluate(() => {
      const decision = window.VildaSaveStatusIndicator.getCurrentDecision();
      return { ready: decision.ready, state: decision.state, reference: window.VildaSaveStatusIndicator.getReferenceFingerprint(),
        panelOwner: window.VildaPanelPacjent.wlasciciel(), stale: window.VildaPanelPacjent.nieaktualny() };
    })).toEqual({ ready: true, state: 'hidden', reference: null, panelOwner: null, stale: false });
  }
});

for (const shell of [false, true]) test(`${shell ? 'shell phone' : 'standalone phone'}: the menu uses current live input before autosave, preserving Cancel and explicitly discarding new data`, async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context, { width: 390, shell });
  await openPuberty(owner, 'M');
  await owner.evaluate(() => window.__clearDebounceProbe.arm());
  await stage(owner, 'G', 3).click();
  await proveStaleDebounceWindow(owner, 'puberty300', shell ? 'current-shell' : 'stale');
  const before = await patientState(owner);
  await clearFromMenu(page);
  const dialog = owner.getByRole('dialog', { name: CLEAR_DIALOG });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await patientState(owner)).toEqual(before);
  await clearFromMenu(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Odrzuć dane i wyczyść', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(stage(owner, 'G', 3)).not.toHaveAttribute('aria-pressed', 'true');
  await owner.evaluate(() => window.__clearDebounceProbe.release());
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('hidden');
});

for (const existing of [false, true]) test(`menu Save and Clear waits for its own durable save (${existing ? 'existing' : 'new'} patient)`, async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context);
  let stored;
  if (existing) {
    stored = await storedRecordAndNote(owner);
    await loadPatient(owner, stored.patientId, 'restore');
    await owner.locator('#height').fill('151');
  } else await fillValidPatient(owner, 'Alicja Menu Zapis');
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe(existing ? 'dirty' : 'new_patient');
  await holdRealSaveReturn(owner);
  await clearFromMenu(page);
  const dialog = owner.getByRole('dialog', { name: CLEAR_DIALOG });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: existing ? 'Zapisz i wyczyść' : 'Zapisz nowego i wyczyść', exact: true }).click();
  await owner.waitForFunction(() => window.__clearSaveProbe.pending);
  await expect(owner.locator('#height')).toHaveValue(existing ? '151' : '150');
  expect(await owner.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(0);
  const id = await owner.evaluate(() => window.__clearSaveProbe.savedId);
  const record = await owner.evaluate(id => window.VildaVault.getPatient(id), id);
  await finishOwnReceipt(owner);
  await expect(dialog).toHaveCount(0);
  await expect(owner.locator('#height')).toHaveValue('');
  expect(await owner.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(1);
  expect(await owner.evaluate(id => window.VildaVault.getPatient(id), id)).toEqual(record);
  if (stored) expect(await owner.evaluate(id => window.VildaVault.getPatientNote(id), stored.noteId)).toEqual(stored.note);
});

test('Baza, a patient preview and Notatnik never clear the retained Start form', async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context, { shell: true });
  const stored = await storedRecordAndNote(owner);
  await loadPatient(owner, stored.patientId, 'restore');
  let menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  await expect(owner.locator('.vilda-patient-database')).toBeVisible();
  await expect(menu.locator('[data-menu-clear]')).toBeDisabled();
  await expect(menu.locator('[data-menu-clear]')).toHaveAttribute('aria-disabled', 'true');
  await menu.locator('[data-menu-clear]').evaluate(button => button.click());
  await expect(owner.locator('#height')).toHaveValue('150');
  await owner.locator('.pt-home').click();
  await expect(menu.locator('[data-menu-clear]')).toBeEnabled();
  await owner.evaluate(id => window.VildaAuthUI.showPatientCard(id, null, null), stored.patientId);
  const card = owner.locator('.vilda-auth-patient-card');
  await expect(card).toBeVisible();
  await expect(menu.locator('[data-menu-clear]')).toBeDisabled();
  await menu.locator('[data-menu-clear]').evaluate(button => button.click());
  await expect(owner.locator('#height')).toHaveValue('150');
  await card.getByRole('button', { name: /Wróć do listy/u }).click();
  await owner.locator('.pt-home').click();
  await expect(menu.locator('[data-menu-clear]')).toBeEnabled();
  await menu.getByRole('link', { name: 'Notatnik', exact: true }).click();
  await expect(page).toHaveURL(/\/app\.html#\/notatki$/u);
  menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-clear]')).toBeDisabled();
  await menu.locator('[data-menu-clear]').evaluate(button => button.click());
  await expect(owner.locator('#height')).toHaveValue('150');
  await expectStoredIntact(owner, stored);
});

test('a delayed Save and Clear cannot clear a different active clinical pane', async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context, { shell: true });
  const stored = await storedRecordAndNote(owner);
  await loadPatient(owner, stored.patientId, 'restore');
  await owner.locator('#height').fill('151');
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('dirty');
  await holdRealSaveReturn(owner);
  await clearFromMenu(page);
  const dialog = owner.getByRole('dialog', { name: CLEAR_DIALOG });
  await dialog.getByRole('button', { name: 'Zapisz i wyczyść', exact: true }).click();
  await owner.waitForFunction(() => window.__clearSaveProbe.pending);
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await prepareDocProUserFlow(docpro);
  await docpro.locator('#height').fill('161');
  await finishOwnReceipt(owner);
  await expect(dialog).toHaveCount(0);
  expect(await owner.evaluate(() => window.__clearSaveProbe.actualClears)).toBe(0);
  await expect(docpro.locator('#height')).toHaveValue('161');
});

test('Klirens menu reuses its native clear policy and retains saved documentation', async ({ page, context }) => {
  const { owner } = await openFictionalClearAccount(page, context);
  const stored = await storedRecordAndNote(owner);
  await loadPatient(owner, stored.patientId, 'restore');
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'load' });
  await readyClearPage(page);
  await expect(page.locator('#height')).toHaveValue('150');
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ckid_u25'));
  await expect(page.locator('#formulaPicker')).toHaveValue('ckid_u25');
  await page.locator('#clcrIdentityBar [data-ident-act="toggle"]').click();
  // An unsaved general field would trigger Start/DocPro's guard. Klirens'
  // existing native clear deliberately handles its specimen without that guard.
  await page.locator('#height').fill('151');
  await page.locator('#Scr').fill('0.6');
  await clearFromMenu(page);
  await expect(page.getByRole('dialog', { name: CLEAR_DIALOG })).toHaveCount(0);
  await expect(page.locator('#height')).toHaveValue('');
  await expect(page.locator('#Scr')).toHaveValue('');
  expect(await page.evaluate(() => window.__clearTrustedClicks)).toContainEqual({ id: 'clearBtn', trusted: false });
  await expectStoredIntact(page, stored);
});

test('the unified patient actions keep the two existing widths and a separate full-width Clear across desktop and drawer layouts', async ({ page, context }, info) => {
  const { owner } = await openFictionalClearAccount(page, context);
  const stored = await storedRecordAndNote(owner);
  await loadPatient(owner, stored.patientId, 'restore');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 1000 },
    { width: 320, height: 740 }, { width: 390, height: 852 }, { width: 860, height: 1000 },
    { width: 844, height: 390 }, { width: 760, height: 360 }]) await test.step(`${viewport.width}×${viewport.height}`, async () => {
    await closeChromeMenu(page);
    await page.setViewportSize(viewport);
    const menu = await visibleChromeMenu(page);
    const database = menu.getByRole('button', { name: 'Baza pacjentów', exact: true });
    await expect(database).toHaveCSS('box-shadow', 'none');
    await expect(database).toHaveCSS('backdrop-filter', 'none');
    const clearAction = menu.locator('[data-menu-clear]');
    await clearAction.scrollIntoViewIfNeeded();
    await expect(clearAction).toBeInViewport({ ratio: 1 });
    await expect(menu.locator('.chrome-menu-footer')).toBeInViewport({ ratio: 1 });
    await expect(menu.locator('[data-menu-patient-name]')).toHaveCSS('font-size', '16px');
    const labels = menu.locator('.chrome-menu-patient-copy small,.chrome-menu-save,.chrome-menu-documents,[data-menu-clear]');
    await expect(labels).toHaveCount(4);
    for (const label of await labels.all()) await expect(label).toHaveCSS('font-size', '14px');
    const nav = menu.getByRole('link', { name: 'Strona główna', exact: true });
    await expect(nav).toHaveCSS('font-size', '14px');
    const buttons = await menu.locator('.chrome-menu-save,.chrome-menu-documents,[data-menu-clear]').evaluateAll(nodes => nodes.map(node => {
      const r = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { x: r.x, y: r.y, width: r.width, height: r.height, radius: style.borderRadius,
        family: style.fontFamily, font: style.fontSize };
    }));
    expect(buttons).toHaveLength(3);
    const [save, documents, clear] = buttons;
    expect(save.width).toBeCloseTo(documents.width, 0);
    expect(save.y).toBeCloseTo(documents.y, 0);
    expect(clear.y).toBeGreaterThanOrEqual(save.y + save.height);
    expect(clear.x).toBeCloseTo(save.x, 0);
    expect(clear.x + clear.width).toBeCloseTo(documents.x + documents.width, 0);
    for (const button of buttons) {
      expect(button.height).toBe(44);
      expect(button.family).toBe(save.family);
      expect(button.radius).toBe(save.radius);
    }
    const clips = await menu.locator('.chrome-menu-save,.chrome-menu-documents,[data-menu-clear]').evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth));
    expect(clips, 'each actual action label fits inside its button').toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (viewport.width === 1440 || viewport.width === 390 || viewport.width === 760) {
      if (viewport.height < 500) {
        await menu.getByRole('link', { name: 'Wiedza', exact: true }).scrollIntoViewIfNeeded();
        await expect(menu.locator('.chrome-menu-footer')).toBeInViewport({ ratio: 1 });
      }
      const image = info.outputPath(`sidebar-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: image, animations: 'disabled' });
      await info.attach(`sidebar-${viewport.width}x${viewport.height}`, { path: image, contentType: 'image/png' });
    }
  });
});

test.describe('physical phone sidebar actions', () => {
  const phone = devices['iPhone 15 Pro'];
  test.use({ userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true, hasTouch: true, screen: { width: 390, height: 844 },
    viewport: { width: 390, height: 844 } });

  test('real orientation keeps a full-width Clear and pinned account reachable at 844×390 and 760×360', async ({ page, context }, info) => {
    await emulatePhone(page, { width: 390, height: 844 });
    const { owner } = await openFictionalClearAccount(page, context, { width: 390 });
    await emulatePhone(page, { width: 390, height: 844 });
    const stored = await storedRecordAndNote(owner);
    await loadPatient(owner, stored.patientId, 'restore');
    await expect(page.locator('html')).toHaveClass(/\bvilda-phone\b/);
    for (const size of [{ width: 844, height: 390 }, { width: 760, height: 360 }]) {
      await closeChromeMenu(page);
      await emulatePhone(page, size);
      await expect(page.locator('html')).toHaveClass(/\bvilda-phone\b/);
      await expect(page.locator('html')).toHaveClass(/\bvilda-phone-landscape\b/);
      const menu = await visibleChromeMenu(page);
      const panel = page.locator('[data-vilda-chrome-drawer] .chrome-drawer-panel');
      await expect(panel).toHaveCSS('transform', 'none');
      const availableWidth = size.width - LANDSCAPE_SAFE_AREA.left - LANDSCAPE_SAFE_AREA.right - 16;
      await expect.poll(async () => (await panel.boundingBox()).width).toBe(Math.min(620, availableWidth));
      const clear = menu.locator('[data-menu-clear]'), footer = menu.locator('.chrome-menu-footer');
      await expect(clear).toBeEnabled();
      await clear.scrollIntoViewIfNeeded();
      await expect(clear).toBeInViewport({ ratio: 1 });
      await expect(footer).toBeInViewport({ ratio: 1 });
      const [save, documents, reset] = await menu.locator('.chrome-menu-save,.chrome-menu-documents,[data-menu-clear]').evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
      }));
      expect(reset.height).toBeGreaterThanOrEqual(44);
      expect(reset.y).toBeGreaterThanOrEqual(save.y + save.height);
      expect(reset.x).toBeCloseTo(save.x, 0);
      expect(reset.x + reset.width).toBeCloseTo(documents.x + documents.width, 0);
      const pinned = await footer.boundingBox();
      const knowledge = menu.getByRole('link', { name: 'Wiedza', exact: true });
      await knowledge.scrollIntoViewIfNeeded();
      await expect(knowledge).toBeInViewport({ ratio: 1 });
      await expect(footer).toBeInViewport({ ratio: 1 });
      expect(await footer.boundingBox(), 'the account footer stays in place while destinations scroll').toEqual(pinned);
      const image = info.outputPath(`sidebar-phone-landscape-${size.width}x${size.height}.png`);
      await page.screenshot({ path: image, animations: 'disabled' });
      await info.attach(`sidebar-phone-landscape-${size.width}x${size.height}`, { path: image, contentType: 'image/png' });
    }
  });
});
