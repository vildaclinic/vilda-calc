import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

// Badamy rzeczywiste klatki malowania, również przed DOMContentLoaded. Zegar
// i requestAnimationFrame pozostają natywne. W SPA próbnik
// działa w hoście i za każdym razem odnajduje aktywny dokument ramki, więc jej
// utworzenie/przeładowanie nie może po cichu zakończyć obserwacji.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

const CARD = '.vilda-centile-live-card';
const MOUNT = '#vildaCentileLiveMount';

function installPaintProbe() {
  if (window !== window.top) return;
  const result = { frames: [], errors: [] };
  window.__centileSlotPaint = result;
  function visible(element, owner) {
    if (!element || !element.getClientRects().length) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = owner.getComputedStyle(ancestor);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function sample(now) {
    try {
      const frames = [...document.querySelectorAll('iframe.app-pane')];
      const frame = frames.find(element => !element.hidden && visible(element, window));
      const owner = frames.length ? frame?.contentWindow : window;
      if (owner?.document && /(?:\/index\.html|\/docpro\.html|\/)$/u.test(owner.location.pathname)) {
        const doc = owner.document;
        const fallback = doc.getElementById('remindersInline');
        const card = doc.querySelector('.vilda-centile-live-card');
        const mount = doc.getElementById('vildaCentileLiveMount');
        const state = owner.VildaCentileLivePanel?.getState();
        const form = doc.getElementById('calcForm');
        const columns = form ? owner.getComputedStyle(form).gridTemplateColumns.trim().split(/\s+/u).length : 0;
        const patientId = owner.sessionStorage.getItem('vildaCurrentPatientId');
        const reminder = visible(fallback, owner);
        const box = fallback?.getBoundingClientRect();
        let hittable = false;
        if (reminder && box) {
          const x = Math.max(1, Math.min(owner.innerWidth - 1, box.x + box.width / 2));
          const y = Math.max(1, Math.min(owner.innerHeight - 1, box.y + Math.min(box.height / 2, 100)));
          hittable = fallback.contains(doc.elementFromPoint(x, y));
          if (hittable && frame) {
            const rect = frame.getBoundingClientRect();
            hittable = document.elementFromPoint(rect.x + x, rect.y + y) === frame;
          }
        }
        const image = visible(card, owner) && [...card.querySelectorAll('svg.vilda-centile-live-preview')]
          .some(canvas => visible(canvas, owner));
        if (result.frames.length < 10_000) result.frames.push({
          at: Math.round(now), path: owner.location.pathname, patientId,
          mode: owner.sessionStorage.getItem('vildaLoadChoiceV1'), columns,
          form: visible(form, owner),
          reminder, hittable, card: visible(card, owner), mount: visible(mount, owner), image,
          status: state?.status || 'uninitialized', slotStatus: state?.slotStatus || 'uninitialized',
          chartPatientId: state?.patientId || null,
          loading: visible(doc.getElementById('vildaCentileLiveLoading'), owner),
          classes: doc.documentElement?.className || '',
        });
      }
    } catch (error) { result.errors.push(String(error)); }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installPaintProbe);
});

async function ready(owner, patientId) {
  await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ status: 'ready', eligible: true, patientId });
}

async function resetProbe(page) {
  await page.evaluate(() => { window.__centileSlotPaint.frames = []; window.__centileSlotPaint.errors = []; });
}

async function paintedFrames(page, count = 8) {
  await page.evaluate(count => new Promise(resolve => {
    function tick() { if (--count <= 0) resolve(); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }), count);
}

async function assertNoReminderFlash(page, name, patientId, { path = '/index.html', pending = false, readyImage = true } = {}) {
  await paintedFrames(page);
  const result = await page.evaluate(() => window.__centileSlotPaint);
  await test.info().attach(name, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.errors, 'próbnik nie zgubił dokumentu ani dostępu do ramki').toEqual([]);
  const frames = result.frames.filter(frame => frame.path === path && frame.patientId === patientId
    && frame.mode === 'new' && frame.columns === 2);
  expect(frames.length, 'obserwacja obejmuje wiele malowanych klatek').toBeGreaterThan(5);
  expect(frames.filter(frame => frame.reminder), 'Przypomnienia nie wystąpiły w żadnej klatce').toEqual([]);
  expect(frames.filter(frame => frame.image && frame.chartPatientId !== patientId), 'brak rysunku poprzedniego pacjenta').toEqual([]);
  if (readyImage) expect(frames.some(frame => frame.image && frame.status === 'ready'), 'próbnik rozpoznaje rzeczywiście widoczny rysunek').toBe(true);
  if (pending) expect(frames.some(frame => frame.status !== 'ready'), 'próbnik działał już przed gotową siatką').toBe(true);
  return frames;
}

async function filledMeasurement(owner) {
  await owner.locator('#height').fill('159');
  await owner.locator('#weight').fill('47');
  await owner.locator('#weight').blur();
}

test('gość bez wybranego pacjenta nie dostaje miejsca siatki podczas startu, edycji ani odtwarzania DOB', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    const samples = [];
    window.__centileGuestSlotTransitions = samples;
    function sample(reason, oldValue = '') {
      samples.push({
        reason, oldValue, patientId: sessionStorage.getItem('vildaCurrentPatientId'),
        mode: sessionStorage.getItem('vildaLoadChoiceV1'),
        classes: document.documentElement?.className || '',
        slotStatus: document.getElementById('vildaCentileLiveMount')?.getAttribute('data-centile-live-state'),
        pendingDob: Boolean(window.VildaDobAge?.restorePending?.()),
      });
    }
    // Przejście może zmieścić się między dwiema klatkami. Zapis oldValue
    // wykrywa również chwilowe dodanie i cofnięcie rezerwacji w tym samym tasku.
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target === document.documentElement && record.attributeName === 'class'
          || record.target.id === 'vildaCentileLiveMount' && record.attributeName === 'data-centile-live-state') {
          sample(record.attributeName, record.oldValue);
        }
      }
    }).observe(document, { attributes: true, attributeOldValue: true, subtree: true, attributeFilter: ['class', 'data-centile-live-state'] });
    for (const name of ['vilda:state-restored', 'vilda:persist-restored']) {
      document.addEventListener(name, () => {
        // Po wszystkich produkcyjnych listenerach, przed setTimeout przyjęcia
        // DOB: obserwujemy prawdziwy stan przejściowy, nie ustawiamy jego flag.
        queueMicrotask(() => { sample(name); });
      });
    }
  });
  async function guest() {
    const button = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
    if (await button.isVisible()) await button.click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked')
      && typeof window.update === 'function');
  }
  async function fillGuestForm() {
    // Ta sama rzeczywista ścieżka pól i update co w regresji wyglądu aplikacji.
    await page.evaluate(() => {
      for (const [id, value] of Object.entries({ age: 10, ageMonths: 3, sex: 'F', weight: 32, height: 138 })) {
        const element = document.getElementById(id);
        element.value = String(value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.update();
    });
    await expect(page.locator('#bmiResult')).toContainText('BMI');
  }
  async function assertGuestSlotAbsent(label) {
    await paintedFrames(page, 20);
    const observed = await page.evaluate(() => ({ paint: window.__centileSlotPaint, transitions: window.__centileGuestSlotTransitions }));
    await test.info().attach(label, { body: JSON.stringify(observed, null, 2), contentType: 'application/json' });
    expect(observed.paint.errors).toEqual([]);
    expect(observed.paint.frames.filter(frame => frame.form).length, 'próbnik widział rzeczywiście wyświetlony formularz gościa').toBeGreaterThan(5);
    expect(observed.paint.frames.filter(frame => frame.patientId || frame.mode), 'gość ani przez chwilę nie wybierał zapisanego pacjenta').toEqual([]);
    expect(observed.paint.frames.filter(frame => frame.mount || frame.loading || frame.card
      || /vilda-centile-live-(?:reserved|booting)/u.test(frame.classes)), 'brak neutralnej karty gościa w każdej klatce').toEqual([]);
    expect(observed.transitions.some(sample => sample.pendingDob), 'wykonano prawdziwe odroczone przyjęcie DOB').toBe(true);
    expect(observed.transitions.filter(sample => sample.patientId || sample.mode
      || /vilda-centile-live-(?:reserved|booting)/u.test(`${sample.classes} ${sample.oldValue}`)
      || ['pending', 'ready', 'error'].includes(sample.slotStatus)
      || sample.reason === 'data-centile-live-state' && ['pending', 'ready', 'error'].includes(sample.oldValue)),
    'gość nie rezerwuje miejsca także pomiędzy klatkami').toEqual([]);
    await expect(page.locator(MOUNT)).toBeHidden();
  }
  await page.goto('/index.html', { waitUntil: 'load' });
  await guest();
  await fillGuestForm();
  await assertGuestSlotAbsent('gosc-pierwszy-start-edycja.json');
  await page.evaluate(() => {
    window.VildaPersistence.writePreferenceRaw('highContrastEnabled', 'true', { force: true });
    window.VildaPersistence.writePreferenceRaw('highContrastLevel', '2', { force: true });
  });
  await page.reload({ waitUntil: 'load' });
  await guest();
  await expect(page.locator('body')).toHaveClass(/high-contrast-level-2/u);
  await fillGuestForm();
  await assertGuestSlotAbsent('gosc-reload-odtworzenie-dob.json');
});

test('Start: pierwszy Nowy pomiar, przeładowanie i zmiana pacjenta bez klatki Przypomnień', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await expect(page.locator(MOUNT)).toBeHidden();
  await expect(page.locator('#remindersInline')).toBeVisible();
  await resetProbe(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await assertNoReminderFlash(page, 'pierwszy-nowy-pomiar.json', ids.a, { pending: true });
  await filledMeasurement(page);
  await ready(page, ids.a);

  await page.reload({ waitUntil: 'load' });
  await ready(page, ids.a);
  await assertNoReminderFlash(page, 'przeladowanie-start.json', ids.a, { pending: true });

  await resetProbe(page);
  await loadPatient(page, ids.b);
  await ready(page, ids.b);
  await assertNoReminderFlash(page, 'zmiana-pacjenta.json', ids.b, { pending: true });
});

test('SPA: próbnik od początku reloadu i powroty do Start oraz DocPro zachowują miejsce siatki', async ({ page }) => {
  const { frame, ids } = await createFictionalVault(page, { shell: true });
  await loadPatient(frame, ids.a);
  await ready(frame, ids.a);
  await filledMeasurement(frame);
  await page.reload({ waitUntil: 'load' });
  const start = await shellFrame(page);
  await ready(start, ids.a);
  await assertNoReminderFlash(page, 'spa-przeladowanie-start.json', ids.a, { pending: true });

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await ready(docpro, ids.a);

  // Szybki dysk może zakończyć odczyt pod animacją powłoki. Opóźniamy wyłącznie
  // rzeczywisty odczyt sejfu, aby także na szybkim CI było widoczne oczekiwanie
  // po powrocie do już odwiedzonej ramki (tak jak na wolniejszym komputerze).
  await start.evaluate(() => {
    const original = window.VildaVault.getPatient;
    window.__slotRealGetPatient = original;
    window.VildaVault.getPatient = async function (...args) {
      await new Promise(resolve => { setTimeout(resolve, 650); });
      return original.apply(this, args);
    };
  });
  await resetProbe(page);
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  await paintedFrames(page, 45);
  await ready(start, ids.a);
  await assertNoReminderFlash(page, 'spa-powrot-start.json', ids.a, { pending: true });
  await start.evaluate(() => { window.VildaVault.getPatient = window.__slotRealGetPatient; });
  await resetProbe(page);
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  await paintedFrames(page, 45);
  await ready(docpro, ids.a);
  const samples = await assertNoReminderFlash(page, 'spa-powrot-docpro.json', ids.a, { path: '/docpro.html' });
  expect(samples.filter(frame => frame.slotStatus === 'pending' && !frame.mount), 'ładowanie DocPro zachowuje miejsce').toEqual([]);
});

test('dwa nakładające się odczyty synchronizacji zachowują zweryfikowaną siatkę tej samej wizyty', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await paintedFrames(page);
  await page.evaluate(() => {
    window.__slotOriginalCard = document.querySelector('.vilda-centile-live-card');
    const original = window.VildaVault.getPatient;
    window.__slotReads = [];
    window.VildaVault.getPatient = async function (...args) {
      // Synchronizacja odświeża również odznaki i karty. Bramkujemy tylko
      // wywołania badanego adaptera, nie cudze równoległe odczyty tego sejfu.
      if (!String(new Error().stack).includes('/vilda_centile_live_data.js')) return original.apply(this, args);
      await new Promise(resolve => { window.__slotReads.push(resolve); });
      return original.apply(this, args);
    };
  });
  await resetProbe(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-status-changed')));
  await expect.poll(() => page.evaluate(() => window.__slotReads.length)).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('vilda:sync-status-changed')));
  await expect.poll(() => page.evaluate(() => window.__slotReads.length)).toBe(2);
  await page.evaluate(() => window.__slotReads[0]());
  await paintedFrames(page);
  expect(await page.evaluate(() => window.__slotOriginalCard.isConnected && !window.__slotOriginalCard.hidden)).toBe(true);
  await page.evaluate(() => window.__slotReads[1]());
  await ready(page, ids.a);
  await assertNoReminderFlash(page, 'nakladajace-odczyty.json', ids.a);
  expect(await page.evaluate(() => window.__slotOriginalCard === document.querySelector('.vilda-centile-live-card'))).toBe(true);
});

test('błąd odczytu zostaje w miejscu siatki, a przycisk ponowienia wykonuje prawdziwy odczyt', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await resetProbe(page);
  await page.evaluate(() => {
    window.__slotRealGetPatient = window.VildaVault.getPatient;
    window.VildaVault.getPatient = async function (...args) {
      // Fail this adapter's read only. A simultaneous comparison/vault failure
      // legitimately changes the whole presentation to the standalone summary.
      if (String(new Error().stack).includes('/vilda_centile_live_data.js')) {
        throw new Error('Fikcyjny błąd odczytu E2E');
      }
      return window.__slotRealGetPatient.apply(this, args);
    };
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
  });
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel.getState().slotStatus)).toBe('error');
  await expect(page.locator(MOUNT)).toBeVisible();
  const retry = page.getByRole('button', { name: 'Spróbuj ponownie', exact: true });
  await expect(retry).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('blad-odczytu-siatki.png') });
  await assertNoReminderFlash(page, 'blad-odczytu.json', ids.a, { readyImage: false });
  await page.evaluate(() => {
    window.__slotRetryAction = { clicks: 0, completedAdapterReads: 0 };
    // Keep the simulated failure active until the user's actual click. Restoring
    // the getter earlier lets a background refresh remove the retry button while
    // Playwright scrolls/waits. Delegation also survives error-card rerenders.
    function recoverOnRetry(event) {
      if (!event.target?.closest?.('#vildaCentileLiveRetry')) return;
      document.removeEventListener('click', recoverOnRetry, true);
      window.__slotRetryAction.clicks += 1;
      window.VildaVault.getPatient = async function (...args) {
        const adapterRead = String(new Error().stack).includes('/vilda_centile_live_data.js');
        const record = await window.__slotRealGetPatient.apply(this, args);
        if (adapterRead) window.__slotRetryAction.completedAdapterReads += 1;
        return record;
      };
    }
    document.addEventListener('click', recoverOnRetry, true);
  });
  await retry.click();
  await ready(page, ids.a);
  await expect.poll(() => page.evaluate(() => window.__slotRetryAction.completedAdapterReads)).toBeGreaterThan(0);
  const retryAction = await page.evaluate(() => ({ ...window.__slotRetryAction,
    retryEvents: window.__siatkaE2eLifecycle.filter(event => event.reason === 'retry').length,
  }));
  expect(retryAction.clicks).toBe(1);
  expect(retryAction.retryEvents).toBe(1);
  await test.info().attach('rzeczywisty-odczyt-po-kliknieciu.json', { body: JSON.stringify(retryAction), contentType: 'application/json' });
  await assertNoReminderFlash(page, 'ponowienie-odczytu.json', ids.a);
});

test('zmiana liczby kolumn nie miga, a Odtwórz i pełnoletność przywracają zwykłe Przypomnienia', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(MOUNT)).toBeHidden();
  await expect(page.locator(CARD)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.classList.contains('vilda-centile-live-reserved'))).toBe(false);
  await resetProbe(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await ready(page, ids.a);
  await assertNoReminderFlash(page, 'powrot-dwoch-kolumn.json', ids.a);

  await loadPatient(page, ids.a, 'restore', { clear: true });
  await expect(page.locator(MOUNT)).toBeHidden();
  expect(await page.evaluate(() => window.VildaCentileLivePanel.getState().slotStatus)).toBe('ineligible');
  // Wynik BMI ma własne zasady widoczności prawej kolumny. Nowy pusty pomiar
  // pełnoletniego pacjenta pozwala sprawdzić prawdziwą kartę Przypomnień.
  const adult = await page.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId,
    fictionalPatient({ firstName: 'Pelnoletni', age: 18, height: 179, weight: 70 }));
  await loadPatient(page, adult, 'new', { clear: true });
  await expect(page.locator(MOUNT)).toBeHidden();
  await expect(page.locator('#remindersInline')).toBeVisible();
  expect(await page.evaluate(() => window.VildaCentileLivePanel.getState().slotStatus)).toBe('ineligible');
});

test('wyczyszczenie pacjenta lub blokada usuwa rysunek i fullscreen przed spóźnionym odczytem', async ({ page }) => {
  const { ids } = await createFictionalVault(page);
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('.vilda-centile-live-expand').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
  await page.evaluate(() => {
    const original = window.VildaVault.getPatient;
    window.__slotRealGetPatient = original;
    window.VildaVault.getPatient = async function (...args) {
      await new Promise(resolve => { window.__slotReleaseLateRead = resolve; });
      return original.apply(this, args);
    };
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
  });
  await expect.poll(() => page.evaluate(() => typeof window.__slotReleaseLateRead)).toBe('function');
  await page.evaluate(() => window.clearAllData());
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator('.vilda-centile-live-dialog')).toHaveCount(0);
  await page.evaluate(() => window.__slotReleaseLateRead());
  await paintedFrames(page);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator(MOUNT)).toBeHidden();
  await page.evaluate(() => { window.VildaVault.getPatient = window.__slotRealGetPatient; });
  await loadPatient(page, ids.a);
  await ready(page, ids.a);
  await page.locator('.vilda-centile-live-expand').click();
  await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
  await page.evaluate(() => window.VildaVault.lock());
  await paintedFrames(page);
  await expect(page.locator(CARD)).toHaveCount(0);
  await expect(page.locator('.vilda-centile-live-dialog')).toHaveCount(0);
});
