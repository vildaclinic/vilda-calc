import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

test.afterEach(async ({ page }) => {
  if (test.info().status === test.info().expectedStatus) return;
  const frames = [];
  for (const frame of page.frames()) {
    try {
      frames.push(await frame.evaluate(() => ({
        path: location.pathname,
        comparison: window.VildaSummaryComparison?.getState(),
        chart: window.VildaCentileLivePanel?.getState(),
        tabs: window.VildaSummaryTabs?.getState(),
        eligibility: window.VildaCentileLiveData?.getEligibility(),
        lifecycle: window.__siatkaE2eLifecycle,
        choice: sessionStorage.getItem('vildaLoadChoiceV1'),
        anchor: sessionStorage.getItem('vildaPrevSummaryPid'),
        previous: document.getElementById('prevSummaryWrap')?.textContent?.trim().slice(0, 300),
      })));
    } catch (_) { /* A navigation failure can destroy its previous document. */ }
  }
  await test.info().attach('comparison-state-on-failure.json', {
    body: JSON.stringify(frames, null, 2), contentType: 'application/json',
  });
});

// Natywne klatki od początku dokumentu. W SPA obserwator hosta odnajduje
// aktualny dokument aktywnej ramki; nie zachowuje starego contentWindow.
function installSummaryProbe() {
  if (window !== window.top) return;
  const result = { frames: [], errors: [] };
  window.__centileSummaryPaint = result;
  function visible(element, owner) {
    if (!element?.getClientRects().length) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = owner.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
        || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function bounds(element) {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
  }
  function sample(at) {
    try {
      const frames = [...document.querySelectorAll('iframe.app-pane')];
      const frame = frames.find(element => !element.hidden && visible(element, window));
      const owner = frames.length ? frame?.contentWindow : window;
      if (owner?.document && /\/(?:docpro|index)\.html$/u.test(owner.location.pathname)) {
        const doc = owner.document;
        const form = doc.getElementById('calcForm');
        const doctor = doc.getElementById('doctorSection');
        const fieldset = doc.querySelector('#userSection fieldset.user-card');
        const mount = doc.getElementById('vildaCentileLiveMount');
        const card = doc.querySelector('.vilda-centile-live-card');
        const state = owner.VildaCentileLivePanel?.getState();
        const area = bounds(doctor);
        const input = bounds(fieldset);
        const summaries = [...doc.querySelectorAll('#currentSummaryWrap .current-summary-card')].map(element => {
          const box = bounds(element);
          const shown = visible(element, owner);
          const inSlot = shown && area && input && box.left < area.right && box.right > area.left
            && box.top < area.top + input.height && box.bottom > area.top;
          let hittable = false;
          if (shown) {
            const x = Math.max(1, Math.min(owner.innerWidth - 1, box.left + box.width / 2));
            for (const y of [box.top + 16, box.top + 48, box.top + 100]) {
              if (y < 1 || y >= owner.innerHeight || y > box.bottom) continue;
              let hit = element.contains(doc.elementFromPoint(x, y));
              if (hit && frame) {
                const outer = frame.getBoundingClientRect();
                hit = document.elementFromPoint(outer.left + x, outer.top + y) === frame;
              }
              hittable ||= hit;
            }
          }
          return { id: element.id, shown, inSlot: Boolean(inSlot), hittable, box,
            text: element.textContent.trim().slice(0, 160) };
        });
        if (result.frames.length < 10_000) result.frames.push({
          at: Math.round(at), patientId: owner.sessionStorage.getItem('vildaCurrentPatientId'),
          mode: owner.sessionStorage.getItem('vildaLoadChoiceV1'),
          columns: form ? owner.getComputedStyle(form).gridTemplateColumns.trim().split(/\s+/u).length : 0,
          form: visible(form, owner), summaries, area, input, mount: bounds(mount),
          summaryResults: visible(doc.getElementById('currentSummaryContent'), owner),
          presentation: owner.VildaSummaryTabs?.getState()?.mode || null,
          selectedTab: owner.VildaSummaryTabs?.getState()?.selected || null,
          chartCount: doc.querySelectorAll('.vilda-centile-live-card').length,
          mountShown: visible(mount, owner), mountState: mount?.getAttribute('data-centile-live-state') || null,
          image: visible(card, owner)
            && [...card.querySelectorAll('svg.vilda-centile-live-preview')].some(el => visible(el, owner)),
          status: state?.status || 'uninitialized', slotStatus: state?.slotStatus || 'uninitialized',
          chartPatientId: state?.patientId || null, classes: doc.documentElement?.className || '',
          bootSettled: Boolean(owner.VildaAuthUI?.isBootReady?.() && owner.VildaVault?.isUnlocked()
            && !owner.__vildaPersistRestoring && !owner.VildaDobAge?.restorePending?.()
            && !owner.VildaDataImportExport?.isMainSessionRestorePending?.()),
          comparison: visible(doc.getElementById('prevSummaryWrap'), owner),
          comparisonLoaded: doc.getElementById('prevSummaryWrap')?.dataset.loaded || null,
          children: [...(doctor?.children || [])].map(el => el.id),
        });
      }
    } catch (error) { result.errors.push(String(error)); }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

async function painted(page, count = 20) {
  await page.evaluate(count => new Promise(resolve => {
    function tick() { if (--count <= 0) resolve(); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }), count);
}

async function prepareDocPro(page, shell, { choice = 'new', route = 'docpro' } = {}) {
  await page.addInitScript(installSummaryProbe);
  // Publiczny hook wyłącznie fikcyjnego konta. Uprawnienie powstaje w rzeczywistym
  // dokumencie przed odtworzeniem; po reloadzie nie naprawiamy PRO ani wyników.
  await page.route(/\/vilda_pro_access\.js(?:\?|$)/u, async request => {
    const response = await request.fetch();
    await request.fulfill({ response, body: `${await response.text()}\n;(${function () {
      const grant = () => {
        window.VildaProAccess.__setTokenModeForTest(false);
        window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
      };
      document.addEventListener('vilda:session-changed', grant);
      grant();
    }.toString()})();` });
  });
  const fixture = await createFictionalVault(page, { shell });
  let owner;
  if (route === 'start') {
    owner = fixture.frame;
  } else if (shell) {
    await page.evaluate(() => window.VildaShell.navigate('docpro'));
    owner = await shellFrame(page, 'DocPro');
  } else {
    await page.goto('/docpro.html', { waitUntil: 'load' });
    owner = page;
  }
  await readyForPatient(owner);
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(owner, fixture.ids.a, choice);
  await owner.locator('#height').fill('159');
  await owner.locator('#weight').fill('47');
  await owner.locator('#weight').blur();
  if (choice === 'new') {
    await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()))
      .toMatchObject({ status: 'ready', eligible: true, patientId: fixture.ids.a });
  } else {
    await expect(owner.locator('#vildaCentileLiveMount')).toBeHidden();
    await expect(owner.locator('#currentSummaryCard')).toBeVisible();
  }
  await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
  await owner.evaluate(() => window.vildaPersistFlushNow({ force: true }));
  return { owner, id: fixture.ids.a };
}

async function observations(page) {
  await painted(page);
  const result = await page.evaluate(() => window.__centileSummaryPaint);
  await test.info().attach('docpro-summary-paint.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.errors).toEqual([]);
  return result.frames;
}

function expectSlotFree(frames, id) {
  const relevant = frames.filter(frame => frame.patientId === id && frame.mode === 'new' && frame.columns === 2);
  expect(relevant.length, 'próbnik zobaczył rzeczywiste klatki DocPro').toBeGreaterThan(5);
  expect(relevant.some(frame => frame.status !== 'ready'), 'obserwacja zaczyna się przed gotową siatką').toBe(true);
  expect(relevant.some(frame => frame.status === 'ready' && frame.image), 'obserwacja obejmuje gotowy rysunek').toBe(true);
  expect(relevant.filter(frame => frame.summaries.some(summary => summary.inSlot)).map(frame => ({
    at: frame.at, status: frame.status, slotStatus: frame.slotStatus, mount: frame.mount,
    summaries: frame.summaries, comparison: frame.comparison, children: frame.children,
  })), 'Podsumowanie nigdy nie zajmuje miejsca przeznaczonego dla siatki').toEqual([]);
}

for (const shell of [false, true]) {
  test(`DocPro ${shell ? 'SPA' : 'samodzielne'}: reload nie pokazuje Podsumowania w miejscu siatki`, async ({ page }) => {
    const { id } = await prepareDocPro(page, shell);
    await page.reload({ waitUntil: 'load' });
    const owner = shell ? await shellFrame(page, 'DocPro') : page;
    // Od tej chwili tylko odczyty: żadnego readyForPatient, update ani zmiany pól.
    await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
      .toMatchObject({ status: 'ready', eligible: true, patientId: id });
    expectSlotFree(await observations(page), id);
  });
}

async function holdComparisonOnReload(page) {
  await page.route(/\/vilda_vault\.js(?:\?|$)/u, async request => {
    const response = await request.fetch();
    await request.fulfill({ response, body: `${await response.text()}\n;(${function () {
      if (sessionStorage.getItem('__e2eHoldComparison') !== 'true') return;
      const original = window.VildaVault.getPatient;
      const releases = [];
      window.__e2eReleaseComparison = () => {
        sessionStorage.removeItem('__e2eHoldComparison');
        releases.splice(0).forEach(release => release());
      };
      window.VildaVault.getPatient = function (...args) {
        const result = original.apply(this, args);
        // Wstrzymujemy zakończenie prawdziwego odczytu wyłącznie dla modułu
        // porównania. Siatka i odtworzenie nadal używają natywnego odczytu.
        if (sessionStorage.getItem('__e2eHoldComparison') === 'true'
          && new Error().stack.includes('vilda_summary_cards.js')) {
          window.__e2eComparisonWaiting = true;
          return new Promise(resolve => { releases.push(() => resolve(result)); });
        }
        return result;
      };
    }.toString()})();` });
  });
}

for (const route of ['start', 'docpro']) {
  for (const shell of [false, true]) {
    test(`${route} ${shell ? 'SPA' : 'samodzielne'}: opóźnione porównanie nie odsłania Podsumowania ani nie opóźnia siatki`, async ({ page }) => {
      await holdComparisonOnReload(page);
      const { id } = await prepareDocPro(page, shell, { route });
      await page.evaluate(() => sessionStorage.setItem('__e2eHoldComparison', 'true'));
      await page.reload({ waitUntil: 'load' });
      const owner = shell ? await shellFrame(page, route === 'start' ? 'Start' : 'DocPro') : page;
      await owner.waitForFunction(() => window.__e2eComparisonWaiting);
      await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
        .toMatchObject({ status: 'ready', eligible: true, patientId: id, presentation: 'dedicated' });
      await expect(owner.locator('#prevSummaryWrap')).toBeHidden();
      await expect(owner.locator('#currentSummaryWrap')).toBeHidden();
      await expect(owner.locator('.vilda-centile-live-card')).toHaveCount(1);
      const before = await observations(page);
      expectSlotFree(before, id);
      expect(before.filter(frame => frame.patientId === id && frame.summaryResults),
        'brak choćby jednej klatki wyników przed zakończeniem rzeczywistego odczytu porównania').toEqual([]);
      await owner.evaluate(() => { window.__e2eReservedChart = document.querySelector('.vilda-centile-live-card'); });
      await owner.evaluate(() => window.__e2eReleaseComparison());
      await expect(owner.locator('#prevSummaryWrap')).toBeVisible();
      await expect(owner.locator('#currentSummaryWrap')).toBeHidden();
      await expect.poll(() => owner.evaluate(() => window.VildaSummaryComparison.getState().status)).toBe('ready');
      const after = await observations(page);
      expectSlotFree(after, id);
      expect(after.filter(frame => frame.patientId === id && frame.summaryResults)).toEqual([]);
      expect(after.filter(frame => frame.chartCount > 1)).toEqual([]);
      expect(await owner.evaluate(() => window.__e2eReservedChart === document.querySelector('.vilda-centile-live-card')),
        'gotowa siatka nie jest niszczona przy zakończeniu odczytu porównania').toBe(true);
      const final = after.at(-1);
      expect(final.image && final.comparison).toBe(true);
      expect(Math.abs(final.mount.top - final.input.top)).toBeLessThan(1);
      expect(Math.abs(final.mount.bottom - final.input.bottom)).toBeLessThan(1);
    });
  }
}

test('DocPro: dopiero potwierdzony brak poprzedniego pomiaru udostępnia zakładki, także po reloadzie bez kotwicy', async ({ page }) => {
  await holdComparisonOnReload(page);
  await prepareDocPro(page, false);
  const payload = fictionalPatient({ firstName: 'BezPomiaru', height: null, weight: null });
  payload.advanced.data.measurements = [];
  const id = await page.evaluate(async record => (await window.VildaVault.savePatient(record, { dedup: false })).patientId, payload);
  await loadPatient(page, id, 'new', { clear: true });
  await page.locator('#height').fill('159');
  await page.locator('#weight').fill('47');
  await page.locator('#weight').blur();
  await expect.poll(() => page.evaluate(() => window.VildaSummaryComparison.getState().status)).toBe('absent');
  await expect(page.getByRole('tab', { name: 'Podsumowanie', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => sessionStorage.getItem('vildaPrevSummaryPid'))).toBeNull();
  await expect.poll(() => page.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
  await page.evaluate(() => {
    window.vildaPersistFlushNow({ force: true });
    sessionStorage.setItem('__e2eHoldComparison', 'true');
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2eComparisonWaiting);
  await expect(page.locator('#currentSummaryWrap')).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Podsumowanie', exact: true })).toBeHidden();
  const pending = (await observations(page)).filter(frame => frame.patientId === id);
  expect(pending.length).toBeGreaterThan(5);
  expect(pending.filter(frame => frame.summaryResults)).toEqual([]);
  await page.evaluate(() => window.__e2eReleaseComparison());
  await expect.poll(() => page.evaluate(() => window.VildaSummaryComparison.getState().status)).toBe('absent');
  await expect(page.getByRole('tab', { name: 'Podsumowanie', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#currentSummaryContent')).toContainText('159 cm');
  await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
  await expect(page.locator('.vilda-centile-live-card')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(page.locator('#vildaSummaryChartPanel svg.vilda-centile-live-preview')).toBeVisible();
});

test('DocPro: brak skryptu siatki nie odsłania wyników przed rozstrzygnięciem porównania, a ponowienie przywraca siatkę', async ({ page }) => {
  await holdComparisonOnReload(page);
  const { id } = await prepareDocPro(page, false);
  let blockPanel = true;
  await page.route(/\/vilda_centile_live_panel\.js(?:\?|$)/u,
    request => blockPanel ? request.abort('failed') : request.continue());
  await page.evaluate(() => sessionStorage.setItem('__e2eHoldComparison', 'true'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__e2eComparisonWaiting);
  expect(await page.evaluate(() => Boolean(window.VildaCentileLivePanel))).toBe(false);
  await expect(page.locator('#currentSummaryWrap')).toBeHidden();
  // Keep the native dedicated-slot watchdog: no fabricated timer or UI state.
  await expect(page.locator('#vildaCentileLiveMount')).toHaveAttribute('data-centile-live-state', 'error', { timeout: 25_000 });
  await expect(page.locator('#vildaCentileLiveLoadingMessage')).toContainText('Nie udało się uruchomić siatki');
  await expect(page.locator('#vildaCentileLiveRetry')).toBeVisible();
  await expect(page.locator('#vildaCentileLiveRetry')).toHaveText('Odśwież stronę');
  await expect(page.locator('#currentSummaryWrap')).toBeHidden();
  const failed = (await observations(page)).filter(frame => frame.patientId === id);
  expect(failed.length).toBeGreaterThan(5);
  expect(failed.filter(frame => frame.summaryResults)).toEqual([]);
  blockPanel = false;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('#vildaCentileLiveRetry').click(),
  ]);
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ status: 'ready', eligible: true, patientId: id, presentation: 'dedicated' });
  await expect(page.locator('#height')).toHaveValue('159');
  await expect(page.locator('#weight')).toHaveValue('47');
  expectSlotFree(await observations(page), id);
  await page.evaluate(() => window.__e2eReleaseComparison());
  await expect(page.locator('#prevSummaryWrap')).toBeVisible();
  await expect(page.locator('#currentSummaryWrap')).toBeHidden();
});

test('DocPro Odtwórz: brak modułu siatki ma dostępne ponowienie także bez watchdogu ścieżki Nowy pomiar', async ({ page }) => {
  await prepareDocPro(page, false, { choice: 'restore' });
  await page.route(/\/vilda_centile_live_panel\.js(?:\?|$)/u, request => request.abort('failed'));
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#currentSummaryContent')).toContainText('159 cm');
  await expect(page.getByRole('tab', { name: 'Podsumowanie', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.__vildaCentileLiveBootTimer)).toBeUndefined();
  await page.getByRole('tab', { name: 'Siatka centylowa', exact: true }).click();
  await expect(page.locator('#vildaCentileLiveLoadingMessage')).toBeVisible();
  await expect(page.locator('#vildaCentileLiveRetry')).toHaveText('Odśwież stronę');
  await expect(page.locator('#vildaCentileLiveRetry')).toBeVisible();
  await page.getByRole('tab', { name: 'Podsumowanie', exact: true }).click();
  await expect(page.locator('#currentSummaryContent')).toBeVisible();
  await expect(page.locator('#vildaCentileLiveRetry')).toBeHidden();
});

for (const mobile of [false, true]) {
  test(`DocPro ${mobile ? 'mobile' : 'desktop'}: Odtwórz zachowuje legalne Podsumowanie bez siatki`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const { id } = await prepareDocPro(page, false, { choice: 'restore' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaAuthUI?.isBootReady?.()
      && window.VildaVault?.isUnlocked() && !window.__vildaPersistRestoring
      && !window.VildaDataImportExport?.isMainSessionRestorePending?.());
    await expect(page.locator('#currentSummaryCard')).toBeVisible();
    await expect(page.locator('#currentSummaryContent')).toContainText('159 cm');
    await expect(page.locator('#vildaCentileLiveMount')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel?.getState()))
      .toMatchObject({ status: 'hidden', slotStatus: 'ineligible', eligible: false });
    const frames = (await observations(page)).filter(frame => frame.patientId === id && frame.mode === 'restore');
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.some(frame => frame.form && frame.summaries.some(summary => summary.shown))).toBe(true);
    // Także baza 6d73f6e1 rezerwuje pending przed rozstrzygnięciem trybu
    // Odtwórz. Ta poprawka prezentacji nie zmienia kolejności getEligibility.
    // Wymagamy pełnego legalnego summary od ustalenia niekwalifikującej ścieżki.
    const firstSettled = frames.findIndex(frame => frame.bootSettled && frame.slotStatus === 'ineligible');
    expect(firstSettled).toBeGreaterThanOrEqual(0);
    const settled = frames.slice(firstSettled);
    expect(settled.length).toBeGreaterThan(5);
    expect(settled.every(frame => frame.summaries.some(summary => summary.shown))).toBe(true);
    expect(settled.filter(frame => frame.mountShown || frame.image
      || /vilda-centile-live-(?:booting|reserved)/u.test(frame.classes))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
