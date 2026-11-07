import { expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';
import { observeRealSave, lastCommit, reference } from '../support/save-commit-reference-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference' });
test.setTimeout(150_000);

async function installPaintProbe(page) {
  await page.addInitScript(() => {
    window.__sidebarNativeActions = [];
    const boundaries = ['vilda:guest-mode-changed', 'vilda:auth-loaded', 'vilda:auth-hidden',
      'vilda:auth-state-settled', 'vilda:auth-boot-settled', 'vilda:session-changed',
      'vilda:patient-loaded', 'vilda:json-imported', 'vilda:load-choice-applied',
      'vilda:main-session-restored', 'vilda:user-state-cleared'];
    for (const type of boundaries) document.addEventListener(type, event => {
      try { window.top.__sidebarPaintProbe?.recordBoundary(window, type, event.detail); } catch { /* closing frame */ }
    });
    window.addEventListener('storage', event => {
      if (['vilda:sharedLoadSeq', 'vildaCurrentPatientId'].includes(event.key)) {
        try { window.top.__sidebarPaintProbe?.recordBoundary(window, 'storage', { key: event.key, value: event.newValue }); } catch { /* closing frame */ }
      }
    });
    document.addEventListener('click', event => {
      const target = event.target?.closest?.('#saveDataBtnSidebar,#clearAllDataBtn,#clearBtn,#patientDocumentsBtnSidebar');
      if (target) window.__sidebarNativeActions.push({ type: 'click', target: target.id,
        trusted: event.isTrusted, at: performance.now() });
    }, true);
    for (const type of ['vilda:user-state-cleared', 'vilda:patient-loaded']) document.addEventListener(type, event => {
      window.__sidebarNativeActions.push({ type, source: event.detail?.source || null, at: performance.now() });
    });
    if (window !== window.top) return;
    const documents = new WeakMap(), vaults = new WeakMap(); let nextDocument = 1, nextVault = 1;
    const probe = window.__sidebarPaintProbe = { frames: [], mutations: [], events: [], running: false, frame: 0 };
    function scope(win) {
      try {
        const vault = win.VildaVault, unlocked = vault?.isUnlocked?.() ?? false;
        if (vault && !vaults.has(vault)) vaults.set(vault, { id: nextVault++, token: null });
        const witness = vault && vaults.get(vault);
        if (witness && !witness.token && unlocked && vault.captureSyncOperationSession) witness.token = vault.captureSyncOperationSession();
        let keyCurrent = null;
        if (witness?.token) {
          try { keyCurrent = vault.assertSyncOperationSession(witness.token) !== false; } catch { keyCurrent = false; }
        }
        return { vault: witness?.id ?? null, userId: vault?.getCurrentUser?.()?.userId ?? null,
          unlocked, keyCaptured: Boolean(witness?.token), keyCurrent,
          guest: win.VildaGuestMode === true, authReady: win.VildaAuthUI?.isBootReady?.() ?? false,
          patientId: win.sessionStorage.getItem('vildaCurrentPatientId'),
          sharedLoadSeq: win.localStorage.getItem('vilda:sharedLoadSeq') || win.sessionStorage.getItem('vilda:sharedLoadSeq'),
          applySequence: win.VildaDataImportExport?.getApplyLoadedDataSequence?.() ?? null };
      } catch { return null; }
    }
    probe.recordBoundary = (win, type, detail) => {
      if (!probe.running) return;
      const frames = [...document.querySelectorAll('iframe.app-pane')].map(frame => ({
        title: frame.title, active: !frame.hidden, scope: scope(frame.contentWindow),
      }));
      probe.events.push({ at: performance.now(), type, path: win.location.pathname,
        detail: Object.fromEntries(['source', 'patientId', 'guest', 'applySequence', 'key', 'value']
          .filter(key => detail && key in detail).map(key => [key, detail[key]])), host: scope(window), frames });
    };
    const bounds = node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    function control(node) {
      if (!node) return null;
      const style = getComputedStyle(node), rect = bounds(node);
      const root = node.closest('.chrome-menu-actions') || node.parentElement;
      const origin = bounds(root);
      let visible = rect.width > 0 && rect.height > 0 && rect.x + rect.width > 0
        && rect.y + rect.height > 0 && rect.x < innerWidth && rect.y < innerHeight;
      for (let parent = node; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (parent.hidden || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) visible = false;
      }
      return { visible, hidden: node.hidden, text: node.textContent.trim().replace(/\s+/g, ' '),
        state: node.getAttribute('data-save-state'), disabled: node.disabled === true || node.getAttribute('aria-disabled') === 'true',
        busy: node.getAttribute('aria-busy'), preparing: node.getAttribute('data-menu-preparing'),
        color: style.color, background: style.backgroundColor, image: style.backgroundImage,
        border: style.borderColor, opacity: style.opacity,
        iconColor: node.querySelector('svg') ? getComputedStyle(node.querySelector('svg')).color : null,
        box: { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height } };
    }
    function read() {
      const result = { frame: ++probe.frame, at: performance.now(), route: location.hash, controls: {}, owner: null, host: scope(window) };
      for (const [name, selector] of [['desktop', 'aside.sidebar-v2 .sidebar-inner'], ['drawer', '.chrome-drawer-body']]) {
        const menu = document.querySelector(selector);
        for (const [key, target] of [['save', '.chrome-menu-save'], ['documents', '.chrome-menu-documents'],
          ['clear', '[data-menu-clear]'], ['status', '[data-menu-save-status]']]) {
          result.controls[name + ':' + key] = control(menu?.querySelector(target));
        }
      }
      result.controls['header:status'] = control(document.querySelector('#vildaHeaderSaveStatus'));
      try {
        const frame = document.querySelector('iframe.app-pane:not([hidden])');
        const win = frame?.contentWindow, doc = frame?.contentDocument;
        if (win && doc) {
          if (!documents.has(doc)) documents.set(doc, nextDocument++);
          result.owner = { title: frame.title, document: documents.get(doc), href: win.location.href, scope: scope(win),
            readyState: doc.readyState, patientId: win.sessionStorage.getItem('vildaCurrentPatientId'),
            cachedStatus: win.VildaSaveStatusIndicator?.getState?.() ?? null,
            indicatorReady: win.VildaSaveStatusIndicator?.isReadyForSharedReference?.() ?? false,
            mainPending: win.VildaDataImportExport?.isMainSessionRestorePending?.() ?? true,
            restore: Boolean(win.__vildaPersistRestoring || win.__vildaLustroWpis || win.VildaDobAge?.restorePending?.()),
            saveReady: win.VildaDataImportExport?.getSaveReadiness?.().ready ?? false,
            documents: win.VildaPatientDocuments?.getState?.() ?? null };
        }
      } catch { /* The actual cold destination may not yet have a document. */ }
      return result;
    }
    probe.start = label => { probe.label = label; probe.frames = []; probe.mutations = []; probe.events = []; probe.running = true; return read(); };
    probe.stop = () => { probe.running = false; return { label: probe.label, frames: probe.frames, mutations: probe.mutations, events: probe.events }; };
    probe.current = read;
    function frame() { if (probe.running) probe.frames.push(read()); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver(records => {
        if (!probe.running) return;
        for (const mutation of records) {
          if (!mutation.target.closest?.('.chrome-menu-actions,#vildaHeaderSaveStatus')) continue;
          probe.mutations.push({ at: performance.now(), attribute: mutation.attributeName,
            node: mutation.target.id || mutation.target.className });
        }
      }).observe(document.documentElement, { subtree: true, attributes: true,
        attributeFilter: ['hidden', 'disabled', 'aria-disabled', 'aria-busy', 'data-save-state', 'class', 'style'] });
    }, { once: true });
  });
}

async function navigateMenu(page, href) {
  const menu = await visibleChromeMenu(page), link = menu.locator(`a[href="${href}"]`);
  if (!await link.isVisible()) await menu.locator('.chrome-menu-calculators-toggle').click();
  await link.click();
}

async function waitForActualOwner(page, title) {
  const frame = await shellFrame(page, title);
  await frame.waitForFunction(() => window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  if (['Start', 'DocPro'].includes(title)) {
    await frame.waitForFunction(() => window.VildaDataImportExport?.getSaveReadiness().ready
      && !window.VildaDataImportExport.isMainSessionRestorePending()
      && window.VildaSaveStatusIndicator?.isReadyForSharedReference());
  }
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
  return frame;
}

async function savedMenuFixture(page) {
  const fixture = await createFictionalVault(page, { shell: true });
  // Acknowledge the real professional gate before the measured cold shell
  // navigation. The subsequent full document load removes all warm iframes.
  await navigateMenu(page, 'docpro.html');
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const start = await shellFrame(page);
  await readyForPatient(start);
  for (const [id, value] of Object.entries({ lastName: 'Fikcyjny', firstName: 'Stabilny Panel',
    age: '13', ageMonths: '0', height: '158', weight: '46' })) await start.locator('#' + id).fill(value);
  await start.locator('#weight').blur();
  await observeRealSave(start);
  await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  expect(await start.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
  const committed = await lastCommit(start);
  await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
  const recordIds = [...Object.values(fixture.ids), committed.receipt.patientId];
  return { ...fixture, frame: start, patientId: committed.receipt.patientId, recordIds,
    savedRecords: await start.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), recordIds),
    savedReference: await reference(start) };
}

function visibleEmptyFrames(samples, mobile) {
  return samples.frames.filter(frame => {
    const control = frame.controls[mobile ? 'header:status' : 'desktop:status'];
    return !control || !control.visible || control.state === 'hidden' || control.text === 'Brak danych';
  });
}

function presentationChanges(before, samples, mobile) {
  const changes = [];
  const prefix = mobile ? 'drawer:' : 'desktop:';
  const palette = node => Object.fromEntries(['text', 'color', 'background', 'image', 'border', 'iconColor']
    .map(key => [key, node[key]]));
  for (const key of ['save', 'documents', 'clear', 'status'].map(name => prefix + name)) {
    const initial = before.controls[key];
    if (!initial?.visible || initial.disabled) {
      changes.push({ key, kind: 'initial-control-not-ready', actual: initial });
      continue;
    }
    for (const frame of samples.frames) {
      const current = frame.controls[key];
      if (!current?.visible) {
        if (!mobile) changes.push({ key, frame: frame.frame, kind: 'visible-control-disappeared', actual: current });
        continue; // A mobile navigation intentionally closes the drawer.
      }
      if (JSON.stringify(palette(current)) !== JSON.stringify(palette(initial))) {
        changes.push({ key, frame: frame.frame, kind: 'palette', initial: palette(initial), actual: palette(current) });
      }
      if (Object.keys(initial.box).some(name => Math.abs(initial.box[name] - current.box[name]) > 0.5)) {
        changes.push({ key, frame: frame.frame, kind: 'geometry', initial: initial.box, actual: current.box });
      }
    }
  }
  return changes;
}

for (const profile of [{ name: 'desktop normal', width: 1440, cpu: 1 },
  { name: 'desktop slow CPU', width: 1440, cpu: 4 }, { name: 'mobile slow CPU', width: 390, cpu: 4 }]) {
  test(`${profile.name}: same-patient navigation preserves the painted sidebar presentation`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: profile.width, height: 1000 });
    await installPaintProbe(page);
    const fixture = await savedMenuFixture(page);
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
    const transitions = [], failures = [];
    try {
      for (const [href, title] of [['docpro.html', 'DocPro'], ['index.html', 'Start'],
        ['docpro.html', 'DocPro'], ['index.html', 'Start'], ['kalkulator-klirens.html', 'Kalkulator klirensu'],
        ['index.html', 'Start'], ['przelicznik-jednostek.html', 'Jednostki laboratoryjne'], ['index.html', 'Start']]) {
        const initialMenu = await visibleChromeMenu(page);
        if (/#\/(start|docpro)$/.test(await page.evaluate(() => location.hash))) {
          for (const selector of ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]']) {
            await expect(initialMenu.locator(selector)).not.toHaveAttribute('aria-disabled', 'true');
          }
        }
        const label = (await page.evaluate(() => location.hash)) + ' → ' + title;
        const before = await page.evaluate(label => window.__sidebarPaintProbe.start(label), label);
        await navigateMenu(page, href);
        const owner = await waitForActualOwner(page, title);
        const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
        const finalDecision = await owner.evaluate(() => window.VildaSaveStatusIndicator?.getCurrentDecision?.() || null);
        transitions.push({ before, ...samples, finalDecision });
        if (['Start', 'DocPro'].includes(title)) {
          expect(finalDecision?.ready).toBe(true);
          expect(finalDecision?.state).toBe('saved');
        }
        // The same unchanged patient stays Saved on clinical and passive
        // tool routes. Button availability legitimately differs on tools.
        const empty = visibleEmptyFrames(samples, profile.width < 992);
        if (empty.length) failures.push({ label, emptyFrames: empty.map(frame => frame.frame) });
        const statusKey = profile.width < 992 ? 'header:status' : 'desktop:status';
        const wrongState = samples.frames.filter(frame => frame.controls[statusKey]?.state !== 'saved');
        if (wrongState.length) failures.push({ label, wrongStateFrames: wrongState.map(frame => frame.frame) });
        if (['Start', 'DocPro'].includes(title) && /#\/(start|docpro)$/.test(before.route)) {
          const changes = presentationChanges(before, samples, profile.width < 992);
          if (changes.length) failures.push({ label, changes });
          if (profile.width < 992) {
            // The closed drawer has no visible action palette to inspect.
            // Reopen it normally and assert all four final controls instead.
            const finalMenu = await visibleChromeMenu(page);
            for (const selector of ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]']) {
              await expect(finalMenu.locator(selector)).not.toHaveAttribute('aria-disabled', 'true');
            }
            await expect(page.locator('.chrome-drawer-panel')).toHaveCSS('transform', 'none');
            const reopened = await page.evaluate(() => window.__sidebarPaintProbe.current());
            const finalChanges = presentationChanges(before, { frames: [reopened] }, true);
            if (finalChanges.length) failures.push({ label, reopenedChanges: finalChanges });
          }
        }
      }
      const start = await shellFrame(page);
      expect(await start.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds)).toEqual(fixture.savedRecords);
      expect(await reference(start)).toBe(fixture.savedReference);
      expect(failures, 'RAF-visible false Brak danych/hidden status during same-patient form navigation').toEqual([]);
    } finally {
      const unfinished = await page.evaluate(() => window.__sidebarPaintProbe.running
        ? window.__sidebarPaintProbe.stop() : null).catch(() => null);
      if (unfinished) transitions.push({ incomplete: true, ...unfinished });
      await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await session.detach();
      await testInfo.attach('sidebar-painted-frames', { contentType: 'application/json',
        body: JSON.stringify({ profile, transitions, failures }, null, 2) });
    }
  });
}

async function expectOriginalRecords(owner, fixture) {
  expect(await owner.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds))
    .toEqual(fixture.savedRecords);
  expect(await reference(owner)).toBe(fixture.savedReference);
}

for (const width of [1440, 390]) {
  test(`${width}px: an immediate real edit stays Dirty through navigation and Clear still warns`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await installPaintProbe(page);
    const fixture = await savedMenuFixture(page);
    // The cold route has its own paint case. This case exercises the short
    // input-to-navigation interval without a new document/network dependency.
    await navigateMenu(page, 'docpro.html');
    await waitForActualOwner(page, 'DocPro');
    await navigateMenu(page, 'index.html');
    const start = await waitForActualOwner(page, 'Start');
    let destination;
    if (width > 992) destination = await (await visibleChromeMenu(page)).locator('a[href="docpro.html"]').boundingBox();
    await page.evaluate(() => window.__sidebarPaintProbe.start('actual edit immediately before navigation'));
    await start.locator('#height').fill('159');
    if (destination) await page.mouse.click(destination.x + destination.width / 2, destination.y + destination.height / 2);
    else await navigateMenu(page, 'docpro.html');
    const docpro = await waitForActualOwner(page, 'DocPro');
    const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
    await testInfo.attach('immediate-edit-frames', { contentType: 'application/json', body: JSON.stringify(samples, null, 2) });
    await expect(docpro.locator('#height')).toHaveValue('159');
    expect(await docpro.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('dirty');
    const status = width < 992 ? 'header:status' : 'desktop:status';
    const targetFrames = samples.frames.filter(frame => frame.route === '#/docpro');
    expect(targetFrames.length).toBeGreaterThan(0);
    expect(targetFrames.map(frame => frame.controls[status].state)).toEqual(targetFrames.map(() => 'dirty'));
    await expectOriginalRecords(docpro, fixture);
    const menu = await visibleChromeMenu(page);
    await menu.locator('[data-menu-clear]').click();
    const warning = docpro.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u });
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(docpro.locator('#height')).toHaveValue('159');
    expect(await docpro.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('dirty');
    await expectOriginalRecords(docpro, fixture);
  });

  test(`${width}px: real pointer clicks during a cold network wait never invoke the old form`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await installPaintProbe(page);
    const fixture = await savedMenuFixture(page);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let held = false;
    const pattern = /\/docpro\.html(?:\?|$)/u;
    await page.route(pattern, async route => {
      const response = await route.fetch();
      held = true;
      await gate;
      await route.fulfill({ response });
    });
    try {
      const start = fixture.frame;
      const beforeActions = await start.evaluate(() => [...window.__sidebarNativeActions]);
      await navigateMenu(page, 'docpro.html');
      await expect.poll(() => held).toBe(true);
      const menu = await visibleChromeMenu(page);
      if (width < 992) await expect(page.locator('.chrome-drawer-panel')).toHaveCSS('transform', 'none');
      const controls = ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]'];
      for (const selector of controls) await expect(menu.locator(selector)).toHaveAttribute('aria-disabled', 'true');
      await page.evaluate(() => window.__sidebarPaintProbe.start('network-pending real pointer clicks'));
      for (const selector of controls) {
        const box = await menu.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        // locator.click would auto-wait for enabled and would not exercise the
        // pending handler. A real pointer clicks the currently painted target.
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      }
      expect(await start.evaluate(() => window.__sidebarNativeActions)).toEqual(beforeActions);
      await expect(start.locator('#height')).toHaveValue('158');
      await expect(start.locator('#patientDocumentsDialog')).toHaveCount(0);
      await expect(page.locator('#patientDocumentsDialog')).toHaveCount(0);
      await expectOriginalRecords(start, fixture);
      const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
      await testInfo.attach('pending-clicks', { contentType: 'application/json', body: JSON.stringify(samples, null, 2) });
      release();
      const docpro = await waitForActualOwner(page, 'DocPro');
      await expect(docpro.locator('#height')).toHaveValue('158');
      await expectOriginalRecords(docpro, fixture);
      const readyMenu = await visibleChromeMenu(page);
      await expect(readyMenu.locator('.chrome-menu-documents')).not.toHaveAttribute('aria-disabled', 'true');
      await readyMenu.locator('.chrome-menu-documents').click();
      await expect(page.locator('#patientDocumentsDialog')).toBeVisible();
      await expect(start.locator('#patientDocumentsDialog')).toHaveCount(0);
    } finally {
      release();
      await page.unroute(pattern);
    }
  });
}

test('explicit same-patient New and native Clear invalidate the previous Saved presentation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installPaintProbe(page);
  const fixture = await savedMenuFixture(page);
  await navigateMenu(page, 'docpro.html');
  await waitForActualOwner(page, 'DocPro');
  await navigateMenu(page, 'index.html');
  const start = await waitForActualOwner(page, 'Start');
  await start.evaluate(id => window.VildaAuthUI.showPatientCard(id,
    record => record && window.applyLoadedData(record)), fixture.patientId);
  await start.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  const same = start.getByRole('dialog', { name: 'Ten pacjent jest już wczytany' });
  await expect(same).toBeVisible();
  await same.getByRole('button', { name: 'Wczytaj ponownie', exact: true }).click();
  await expect(start.locator('#vildaLoadChoiceModal')).toBeVisible();
  await start.locator('#vildaLcmNew').click();
  await expect(start.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await expect(start.locator('#height')).toHaveValue('');
  await expect(start.locator('#weight')).toHaveValue('');
  await expect.poll(() => start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  const newState = await start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state);
  const menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', newState);
  await expect(menu.locator('.chrome-menu-save')).toHaveAttribute('aria-disabled', 'true');
  expect(await page.evaluate(() => window.VildaShell.getSidebarPresentation())).toBeNull();
  expect(await start.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds))
    .toEqual(fixture.savedRecords);
  await menu.locator('[data-menu-clear]').click();
  const warning = start.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wyczyszczeniem\?$/u });
  if (await warning.isVisible()) await warning.getByRole('button', { name: 'Odrzuć dane i wyczyść', exact: true }).click();
  await expect.poll(() => start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'hidden');
  await navigateMenu(page, 'docpro.html');
  const docpro = await waitForActualOwner(page, 'DocPro');
  await expect(docpro.locator('#height')).toHaveValue('');
  await expect(docpro.locator('#weight')).toHaveValue('');
  expect(await page.evaluate(() => window.VildaShell.getSidebarPresentation())).toBeNull();
  await expect((await visibleChromeMenu(page)).locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'hidden');
  expect(await docpro.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds))
    .toEqual(fixture.savedRecords);
});

test('a real account lock on a passive route removes the retained patient presentation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installPaintProbe(page);
  const fixture = await savedMenuFixture(page);
  await navigateMenu(page, 'przelicznik-jednostek.html');
  await waitForActualOwner(page, 'Jednostki laboratoryjne');
  const menu = await visibleChromeMenu(page);
  await expect(menu.locator('[data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
  await expectOriginalRecords(fixture.frame, fixture);
  // The real public lock runs the normal account/key invalidation lifecycle;
  // no identity, readiness, or indicator flag is assigned by this fixture.
  await page.evaluate(() => window.VildaVault.lock('manual'));
  // Lock intentionally leaves the shell for the normal account chooser. Wait
  // for that actual document lifecycle instead of querying a destroyed Vault.
  await expect(page).toHaveURL(/\/index\.html$/u);
  await expect(page.getByRole('heading', { name: 'Kto się loguje?', exact: true })).toBeVisible();
  await page.waitForFunction(() => window.VildaVault && !window.VildaVault.isUnlocked());
  await expect(page.locator('iframe.app-pane')).toHaveCount(0);
  await expect(page.locator('[data-menu-save-status][data-save-state="saved"]:visible')).toHaveCount(0);
  for (const selector of ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]']) {
    await expect(page.locator(selector + ':visible')).toHaveCount(0);
  }
});

test('a real in-flight Save retains its status through native navigation and reaches the committed Saved state', async ({ page, context }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installPaintProbe(page);
  const fixture = await savedMenuFixture(page), start = fixture.frame;
  // Unmodified native two-click feasibility is recorded separately. For this
  // repeatable regression, hold only delivery of the original receipt AFTER
  // its real encrypted commit; never change readiness, Save results, or data.
  await start.evaluate(() => window.__committedReferenceProbe.restore());
  await observeRealSave(start, { holdAfterCommit: true });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let samples, clickEvidence;
  try {
    await start.locator('#weight').fill('47');
    await start.locator('#weight').blur();
    await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
    const menu = await visibleChromeMenu(page);
    const save = await menu.locator('.chrome-menu-save').boundingBox();
    const destination = await menu.locator('a[href="docpro.html"]').boundingBox();
    await page.evaluate(() => {
      window.__nativeSaveNavigation = [];
      document.addEventListener('click', event => {
        if (!event.target.closest?.('a[href="docpro.html"]')) return;
        const win = document.querySelector('iframe.app-pane[title="Start"]')?.contentWindow;
        window.__nativeSaveNavigation.push({ trusted: event.isTrusted, at: performance.now(),
          pending: win?.VildaDataImportExport?.isSaveUserDataPending(),
          state: win?.VildaSaveStatusIndicator?.getState() });
      }, { capture: true });
    });
    await page.evaluate(() => window.__sidebarPaintProbe.start('real Save then native DocPro click'));
    await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2);
    await start.waitForFunction(() => window.__committedReferenceProbe.held);
    await page.mouse.click(destination.x + destination.width / 2, destination.y + destination.height / 2);
    await page.waitForFunction(() => window.__sidebarPaintProbe.frames.some(frame =>
      frame.route === '#/docpro' && frame.owner?.title === 'DocPro'));
    await start.evaluate(() => window.__committedReferenceProbe.release());
    const docpro = await waitForActualOwner(page, 'DocPro');
    await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
    await expect.poll(() => docpro.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
    samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
    clickEvidence = await page.evaluate(() => window.__nativeSaveNavigation);
    expect(clickEvidence).toHaveLength(1);
    expect(clickEvidence[0]).toMatchObject({ trusted: true, pending: true, state: 'saving' });
    const afterClick = { frames: samples.frames.filter(frame => frame.at >= clickEvidence[0].at) };
    expect(afterClick.frames.length).toBeGreaterThan(0);
    expect(visibleEmptyFrames(afterClick, false)).toEqual([]);
    expect(afterClick.frames.every(frame => ['saving', 'saved'].includes(frame.controls['desktop:status'].state))).toBe(true);
    await expect(docpro.locator('#weight')).toHaveValue('47');
    const records = await docpro.evaluate(ids => Promise.all(ids.map(id => window.VildaVault.getPatient(id))), fixture.recordIds);
    expect(records.slice(0, -1)).toEqual(fixture.savedRecords.slice(0, -1));
    const old = fixture.savedRecords.at(-1), committed = records.at(-1);
    expect(committed.snapshots).toHaveLength(old.snapshots.length + 1);
    expect(committed.snapshots.filter(snapshot => old.snapshots.some(prior => prior.snapshotId === snapshot.snapshotId))).toEqual(old.snapshots);
    const added = committed.snapshots.filter(snapshot => !old.snapshots.some(prior => prior.snapshotId === snapshot.snapshotId));
    expect(added).toHaveLength(1);
    expect(added[0].payload.user).toMatchObject({ weight: 47, height: 158, age: 13, ageMonths: 0 });
    expect(await start.evaluate(id => window.VildaVault.getPatient(id), fixture.patientId)).toEqual(committed);
    const committedReference = await reference(start);
    expect(committedReference).not.toBe(fixture.savedReference);
    expect(await reference(docpro)).toBe(committedReference);
    expect(await start.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  } finally {
    await start.evaluate(() => window.__committedReferenceProbe.release()).catch(() => {});
    if (!samples) samples = await page.evaluate(() => window.__sidebarPaintProbe.stop()).catch(() => null);
    if (!clickEvidence) clickEvidence = await page.evaluate(() => window.__nativeSaveNavigation).catch(() => null);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await session.detach();
    await testInfo.attach('native-pending-save', { contentType: 'application/json', body: JSON.stringify({ clickEvidence, samples }, null, 2) });
  }
});
