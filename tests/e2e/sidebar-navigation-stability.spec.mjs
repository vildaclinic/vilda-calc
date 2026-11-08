import { expect, test } from '@playwright/test';
import { createFictionalVault, fixturePreferences, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
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
      let ancestorOpacity = 1;
      const ancestorPaint = [];
      for (let parent = node; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (parent !== node) {
          ancestorOpacity *= Number(css.opacity);
          ancestorPaint.push({ tag: parent.tagName, id: parent.id, classes: parent.className,
            opacity: css.opacity, filter: css.filter });
        }
        if (parent.hidden || css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) visible = false;
      }
      return { visible, hidden: node.hidden, text: node.textContent.trim().replace(/\s+/g, ' '),
        state: node.getAttribute('data-save-state'), disabled: node.disabled === true || node.getAttribute('aria-disabled') === 'true',
        busy: node.getAttribute('aria-busy'), preparing: node.getAttribute('data-menu-preparing'),
        color: style.color, background: style.backgroundColor, image: style.backgroundImage,
        border: style.borderColor, opacity: style.opacity, ancestorOpacity,
        effectiveOpacity: Number(style.opacity) * ancestorOpacity, ancestorPaint,
        filter: style.filter, boxShadow: style.boxShadow, textFill: style.webkitTextFillColor,
        transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration,
        transitionDelay: style.transitionDelay, transitionTimingFunction: style.transitionTimingFunction,
        pointerEvents: style.pointerEvents, nativeDisabled: node.disabled === true,
        hitTest: node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
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

async function waitForInitialMenuPaint(menu) {
  // The baseline must describe the opened menu, not a frame from its opening
  // animation or an earlier hover transition. Never settle animations during
  // the navigation being measured, or modify their playback.
  await menu.evaluate(async node => {
    const surface = node.closest('.chrome-drawer-panel, aside.sidebar-v2') || node;
    for (;;) {
      const animations = surface.getAnimations({ subtree: true }).filter(animation =>
        animation.effect?.getComputedTiming().iterations !== Infinity
        && (animation.pending || animation.playState === 'running'));
      if (!animations.length) return;
      await Promise.allSettled(animations.map(animation => animation.finished));
    }
  });
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

async function savedMenuFixture(page, { coldDestination = false } = {}) {
  const fixture = await createFictionalVault(page, { shell: true });
  // Acknowledge the real professional gate, then return through the native
  // Start hash route. This same-document navigation retains the shell; any
  // destination refresh is performed by the shell's ordinary lifecycle.
  await navigateMenu(page, 'docpro.html');
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  // Only the held-network cases require a fresh destination. A real full
  // reload removes the acknowledged DocPro frame before entering patient data.
  if (coldDestination) await page.reload({ waitUntil: 'load' });
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
  const palette = node => Object.fromEntries(['text', 'color', 'background', 'image', 'border', 'iconColor', 'opacity', 'filter', 'boxShadow',
      'textFill', 'transitionProperty', 'transitionDuration', 'transitionDelay', 'transitionTimingFunction',
      ...(!mobile ? ['ancestorOpacity', 'effectiveOpacity'] : [])]
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
  // Keep the repeated native form transitions together. Each tool roundtrip
  // owns a fresh fixture: on CI, combining both tools exhausted the unchanged
  // 150 s budget after completed steps, before the final return to Start.
  for (const journey of [
    { name: 'cold and warm forms', routes: [['docpro.html', 'DocPro'], ['index.html', 'Start'],
      ['docpro.html', 'DocPro'], ['index.html', 'Start']] },
    { name: 'clinical tool roundtrip', routes: [['kalkulator-klirens.html', 'Kalkulator klirensu'], ['index.html', 'Start']] },
    { name: 'passive tool roundtrip', routes: [['przelicznik-jednostek.html', 'Jednostki laboratoryjne'], ['index.html', 'Start']] },
  ]) {
  test(`${profile.name}, ${journey.name}: same-patient navigation preserves the painted sidebar presentation`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: profile.width, height: 1000 });
    await installPaintProbe(page);
    const fixture = await savedMenuFixture(page);
    const session = await context.newCDPSession(page);
    const transitions = [], failures = [];
    let primaryError, observationError, cleanupError, attachmentError;
    try {
      for (const [href, title] of journey.routes) {
        const initialMenu = await visibleChromeMenu(page);
        if (/#\/(start|docpro)$/.test(await page.evaluate(() => location.hash))) {
          for (const selector of ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]']) {
            await expect(initialMenu.locator(selector)).not.toHaveAttribute('aria-disabled', 'true');
          }
        }
        await waitForInitialMenuPaint(initialMenu);
        const label = (await page.evaluate(() => location.hash)) + ' → ' + title;
        // Throttle the complete measured transition, including real readiness
        // and every RAF sample. Prepare the next baseline and inspect stored
        // evidence at normal speed, outside the observation interval.
        await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        const before = await page.evaluate(label => window.__sidebarPaintProbe.start(label), label);
        await navigateMenu(page, href);
        const owner = await waitForActualOwner(page, title);
        const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
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
    } catch (error) {
      primaryError = error;
    } finally {
      if (!page.isClosed()) {
        try {
          const unfinished = await page.evaluate(() => window.__sidebarPaintProbe.running
            ? window.__sidebarPaintProbe.stop() : null);
          if (unfinished) transitions.push({ incomplete: true, ...unfinished });
        } catch (error) { observationError = error; }
      }
      // Completed samples are already in Node memory. Preserve them even when
      // a test timeout has closed the page before CDP cleanup can execute.
      try {
        await testInfo.attach('sidebar-painted-frames', { contentType: 'application/json',
          body: JSON.stringify({ profile, journey: journey.name, transitions, failures,
            observationError: observationError?.message }, null, 2) });
      } catch (error) {
        attachmentError = error;
        testInfo.annotations.push({ type: 'attachment-error', description: error.message });
      }
      if (!page.isClosed()) {
        try {
          await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
          await session.detach();
        } catch (error) {
          cleanupError = error;
          testInfo.annotations.push({ type: 'cleanup-error', description: error.message });
        }
      }
    }
    if (primaryError) throw primaryError;
    if (attachmentError) throw attachmentError;
    if (!page.isClosed()) {
      if (observationError) throw observationError;
      if (cleanupError) throw cleanupError;
    }
  });
  }
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
    const fixture = await savedMenuFixture(page, { coldDestination: true });
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
      await expect(page.locator('iframe.app-pane[title="DocPro"]')).toHaveCount(0);
      await navigateMenu(page, 'docpro.html');
      await expect.poll(() => held).toBe(true);
      const menu = await visibleChromeMenu(page);
      if (width < 992) await expect(page.locator('.chrome-drawer-panel')).toHaveCSS('transform', 'none');
      const controls = ['.chrome-menu-save', '.chrome-menu-documents', '[data-menu-clear]'];
      for (const selector of controls) await expect(menu.locator(selector)).toHaveAttribute('aria-disabled', 'true');
      await expect(menu.locator('[data-menu-clear]')).toBeDisabled();
      await expect(menu.locator('[data-menu-clear]')).toHaveCSS('opacity', '1');
      await page.evaluate(() => window.__sidebarPaintProbe.start('network-pending real pointer clicks'));
      for (const selector of controls) {
        const box = await menu.locator(selector).boundingBox();
        expect(box).not.toBeNull();
        expect(await menu.locator(selector).evaluate(node => {
          const rect = node.getBoundingClientRect();
          return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }), 'the real pointer reaches the intended pending control').toBe(true);
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
  // Exercise a genuinely retained same-patient destination. Its indicator can
  // become ready while the source is still awaiting the actual Save receipt.
  await navigateMenu(page, 'docpro.html');
  await waitForActualOwner(page, 'DocPro');
  const warmDocument = await page.evaluate(() => window.__sidebarPaintProbe.current().owner.document);
  await navigateMenu(page, 'index.html');
  await waitForActualOwner(page, 'Start');
  // Unmodified native two-click feasibility is recorded separately. For this
  // repeatable regression, hold only delivery of the original receipt AFTER
  // its real encrypted commit; never change readiness, Save results, or data.
  await start.evaluate(() => window.__committedReferenceProbe.restore());
  await observeRealSave(start, { holdAfterCommit: true });
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let samples, clickEvidence, primaryError;
  const secondaryErrors = [];
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
    const targetFrames = afterClick.frames.filter(frame => frame.owner?.title === 'DocPro');
    expect(targetFrames.length).toBeGreaterThan(0);
    expect(targetFrames.every(frame => frame.owner.document === warmDocument)).toBe(true);
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
  } catch (error) {
    primaryError = error;
  } finally {
    if (!page.isClosed()) {
      try { await start.evaluate(() => window.__committedReferenceProbe.release()); }
      catch (error) { secondaryErrors.push({ stage: 'release receipt', error }); }
      if (!samples) {
        try { samples = await page.evaluate(() => window.__sidebarPaintProbe.stop()); }
        catch (error) { secondaryErrors.push({ stage: 'read paint evidence', error }); }
      }
      if (!clickEvidence) {
        try { clickEvidence = await page.evaluate(() => window.__nativeSaveNavigation); }
        catch (error) { secondaryErrors.push({ stage: 'read click evidence', error }); }
      }
    }
    // Attach whatever was captured before CDP cleanup, which may encounter a
    // browser already closed by the original test timeout.
    try {
      await testInfo.attach('native-pending-save', { contentType: 'application/json', body: JSON.stringify({
        clickEvidence, samples, primaryError: primaryError?.message,
        secondaryErrors: secondaryErrors.map(({ stage, error }) => ({ stage, message: error.message })),
      }, null, 2) });
    } catch (error) { secondaryErrors.push({ stage: 'attach evidence', error }); }
    if (!page.isClosed()) {
      try {
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        await session.detach();
      } catch (error) { secondaryErrors.push({ stage: 'restore CDP', error }); }
    }
  }
  if (primaryError) throw primaryError;
  if (secondaryErrors.length) throw secondaryErrors[0].error;
});

// A blank form has no patient status to retain, but Clear is still available.
// Prepare the synthetic account and acknowledge DocPro before observing warm
// transitions; a real PRO gate is allowed to disable its unavailable form.
async function emptyMenuFixture(page, context, { coldDestination = false } = {}) {
  await fixturePreferences(page);
  await context.route(/https?:\/\/[^/]+\.workers\.dev(?:\/|$)/u, route => route.fulfill({
    status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}',
  }));
  await context.routeWebSocket(/wss?:\/\/[^/]+\.workers\.dev(?:\/|$)/u, socket => socket.close());
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  let start = await shellFrame(page, 'Start');
  await start.waitForFunction(() => typeof window.VildaVault?.createUser === 'function');
  await start.evaluate(() => window.VildaVault.createUser('Fikcyjny#PustyPanel26!', {
    label: 'Fikcyjny lekarz', iterations: 10000,
  }));
  await page.reload({ waitUntil: 'load' });
  await waitForActualOwner(page, 'Start');
  await navigateMenu(page, 'docpro.html');
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(docpro.locator('#calcForm')).toBeVisible();
  await expect(docpro.locator('#professionalOverlay')).toBeHidden();
  await navigateMenu(page, 'index.html');
  await waitForActualOwner(page, 'Start');
  if (coldDestination) await page.reload({ waitUntil: 'load' });
  start = await waitForActualOwner(page, 'Start');
  await expectEmptyOwner(start);
  await expect(page.locator('aside.sidebar-v2 [data-menu-clear]')).toBeEnabled();
  return start;
}

async function expectEmptyOwner(frame) {
  const state = await frame.evaluate(async () => ({
    fields: Object.fromEntries(['lastName', 'firstName', 'age', 'ageMonths', 'height', 'weight']
      .map(id => [id, document.getElementById(id)?.value])),
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    decision: window.VildaSaveStatusIndicator.getCurrentDecision(),
    patients: await window.VildaVault.listPatients(),
  }));
  expect(state.fields).toEqual({ lastName: '', firstName: '', age: '', ageMonths: '', height: '', weight: '' });
  expect(state.patientId).toBeNull();
  expect(state.decision).toMatchObject({ ready: true, state: 'hidden' });
  expect(state.patients).toEqual([]);
  await expect(frame.locator('#sex')).toBeEnabled();
}

function emptyClearPalette(control) {
  return Object.fromEntries(['text', 'color', 'background', 'image', 'border', 'iconColor', 'opacity', 'filter',
    'boxShadow', 'textFill'].map(key => [key, control[key]]));
}

for (const width of [1440, 390]) {
  test(`${width}px: empty form keeps Clear paint through warm Start–DocPro navigation at CPU4`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await installPaintProbe(page);
    await emptyMenuFixture(page, context);
    const key = width < 992 ? 'drawer:clear' : 'desktop:clear', transitions = [];
    for (const [title, href] of [['DocPro', 'docpro.html'], ['Start', 'index.html'],
      ['DocPro', 'docpro.html'], ['Start', 'index.html']]) {
      const menu = await visibleChromeMenu(page);
      await expect(menu.locator('[data-menu-clear]')).toBeEnabled();
      await page.mouse.move(width - 4, 4);
      await waitForInitialMenuPaint(menu);
      const before = await page.evaluate(label => window.__sidebarPaintProbe.start(label), `empty → ${title}`);
      await menu.locator(`a[href="${href}"]`).click();
      const owner = await waitForActualOwner(page, title);
      await expect(owner.locator('#calcForm')).toBeVisible();
      await expect(owner.locator('#proGateBanner')).toBeHidden();
      await expect(owner.locator('#professionalOverlay')).toBeHidden();
      await expect(page.locator('aside.sidebar-v2 [data-menu-clear]')).toBeEnabled();
      await expect(page.locator('aside.sidebar-v2 [data-menu-clear]')).toHaveCSS('opacity', '1');
      await expect(page.locator('aside.sidebar-v2 [data-menu-clear]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expectEmptyOwner(owner);
      const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
      const readyMenu = await visibleChromeMenu(page);
      await expect(readyMenu.locator('[data-menu-clear]')).toBeEnabled();
      await page.mouse.move(width - 4, 4);
      const final = await page.evaluate(() => window.__sidebarPaintProbe.current());
      transitions.push({ title, before, ...samples, final });
    }
    await testInfo.attach('empty-clear-painted-frames', { contentType: 'application/json', body: JSON.stringify(transitions) });
    for (const transition of transitions) {
      const before = transition.before.controls[key];
      expect(before.visible).toBe(true);
      expect(before.disabled).toBe(false);
      const visible = transition.frames.filter(frame => frame.controls[key]?.visible);
      expect(visible.length).toBeGreaterThan(0);
      if (width >= 992) expect(visible.length).toBe(transition.frames.length);
      for (const frame of visible) expect(emptyClearPalette(frame.controls[key]), `${transition.title}, frame ${frame.frame}`)
        .toEqual(emptyClearPalette(before));
      expect(emptyClearPalette(transition.final.controls[key])).toEqual(emptyClearPalette(before));
      expect(transition.final.controls[key].disabled).toBe(false);
    }
  });

  test(`${width}px: empty Clear keeps its paint but rejects a real click during a cold request`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await installPaintProbe(page);
    const start = await emptyMenuFixture(page, context, { coldDestination: true });
    const menuBefore = await visibleChromeMenu(page);
    await expect(menuBefore.locator('[data-menu-clear]')).toBeEnabled();
    await page.mouse.move(width - 4, 4);
    await waitForInitialMenuPaint(menuBefore);
    const before = await page.evaluate(() => window.__sidebarPaintProbe.current());
    const originalActions = await start.evaluate(() => [...window.__sidebarNativeActions]);
    let release, held = false;
    const gate = new Promise(resolve => { release = resolve; });
    const pattern = /\/docpro\.html(?:\?|$)/u;
    await page.route(pattern, async route => {
      const response = await route.fetch();
      held = true;
      await gate;
      await route.fulfill({ response });
    });
    try {
      await expect(page.locator('iframe.app-pane[title="DocPro"]')).toHaveCount(0);
      await navigateMenu(page, 'docpro.html');
      await expect.poll(() => held).toBe(true);
      const menu = await visibleChromeMenu(page), clear = menu.locator('[data-menu-clear]');
      if (width < 992) await expect(page.locator('.chrome-drawer-panel')).toHaveCSS('transform', 'none');
      await expect(clear).toBeDisabled();
      await expect(clear).toHaveAttribute('aria-disabled', 'true');
      await expect(clear).toHaveAttribute('data-menu-preparing', 'true');
      await expect(clear).toHaveCSS('opacity', '1');
      await expect(menu.locator('.chrome-menu-save')).toHaveAttribute('aria-disabled', 'true');
      await expect(menu.locator('.chrome-menu-documents')).toHaveAttribute('aria-disabled', 'true');
      await page.evaluate(() => window.__sidebarPaintProbe.start('empty cold pending click'));
      const box = await clear.boundingBox();
      expect(box).not.toBeNull();
      expect(await clear.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.move(width - 4, 4);
      expect(await start.evaluate(() => window.__sidebarNativeActions)).toEqual(originalActions);
      await expectEmptyOwner(start);
      const samples = await page.evaluate(() => window.__sidebarPaintProbe.stop());
      await testInfo.attach('empty-cold-click', { contentType: 'application/json', body: JSON.stringify({ before, ...samples }) });
      const key = width < 992 ? 'drawer:clear' : 'desktop:clear';
      expect(samples.frames.length).toBeGreaterThan(0);
      for (const frame of samples.frames) {
        expect(frame.controls[key].visible).toBe(true);
        expect(frame.controls[key].nativeDisabled).toBe(true);
        expect(emptyClearPalette(frame.controls[key])).toEqual(emptyClearPalette(before.controls[key]));
      }
      // Once the cold document arrives its real PRO gate may disable Clear.
      // Only the actual pending interval above promises retained presentation.
      release();
      await waitForActualOwner(page, 'DocPro');
    } finally {
      release();
      await page.unroute(pattern);
    }
  });
}
