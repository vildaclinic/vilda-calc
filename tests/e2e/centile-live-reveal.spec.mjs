import { expect, test } from '@playwright/test';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'no-preference' } });
test.setTimeout(120_000);

function installProbe() {
  if (window !== window.top) return;
  const result = { frames: [], animations: [], documents: 0, errors: [], expandedDuringFade: false, revealCancelledOnExpand: false };
  window.__revealPaint = result;
  function visible(el, owner) {
    if (!el?.getClientRects().length) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = owner.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function box(el) {
    if (!el?.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  function fadeAnimations(el) {
    return el?.getAnimations().filter(animation => animation.playState === 'running'
      && animation.effect?.getKeyframes().some(frame => frame.opacity !== undefined)
      && animation.effect?.getKeyframes().every(frame => frame.transform === undefined)) || [];
  }
  const fades = el => fadeAnimations(el).length;
  function sample() {
    try {
      const panes = [...document.querySelectorAll('iframe.app-pane')];
      const wanted = location.hash.includes('docpro') ? 'DocPro' : 'Start';
      // Także dokument przygotowywany jeszcze pod osłoną powłoki: jego własny
      // tekst nie może błysnąć po odsłonięciu. Nie zatrzymujemy starego window.
      const pane = panes.find(frame => frame.title === wanted);
      const owner = panes.length ? pane?.contentWindow : window;
      if (owner?.document && /\/(?:index|docpro)\.html$/u.test(owner.location.pathname)) {
        const doc = owner.document;
        const mount = doc.getElementById('vildaCentileLiveMount');
        const card = mount?.querySelector('.vilda-centile-live-card');
        const full = document.querySelector('.vilda-centile-live-card--fullscreen')
          || doc.querySelector('.vilda-centile-live-card--fullscreen');
        const state = owner.VildaCentileLivePanel?.getState();
        const opacity = card ? Number(owner.getComputedStyle(card).opacity) : null;
        const since = owner.__vildaCentileLivePendingSince;
        const fieldset = doc.querySelector('#userSection fieldset.user-card');
        const message = doc.getElementById('vildaCentileLiveLoadingMessage');
        const title = doc.getElementById('vildaCentileLiveLoadingTitle');
        const available = el => Boolean(el && !el.hidden && el.textContent.trim()
          && owner.getComputedStyle(el).display !== 'none');
        result.frames.push({
          at: Date.now(), path: owner.location.pathname, animationDocument: owner.__revealAnimationDocument,
          patientId: owner.sessionStorage.getItem('vildaCurrentPatientId'),
          mode: owner.sessionStorage.getItem('vildaLoadChoiceV1'),
          controller: Boolean(owner.VildaCentileLivePanel),
          pendingElapsed: typeof since === 'number' && since > 0 ? Date.now() - since : null,
          controlledPendingElapsed: window.__revealViewportChangeAt ? Date.now() - window.__revealViewportChangeAt : null,
          mount: box(mount), mountVisible: visible(mount, owner), fieldset: box(fieldset), card: box(card), opacity, fades: fades(card),
          native: owner.__readRevealAnimation?.(card) || null,
          message: visible(message, owner), title: visible(title, owner),
          messageAvailable: available(message), titleAvailable: available(title),
          messageText: message?.textContent || '',
          status: state?.status || 'uninitialized', slotStatus: state?.slotStatus || 'uninitialized',
          image: Boolean(card?.querySelector('canvas.vilda-centile-live-image')),
          fullscreen: Boolean(full), fullOpacity: full ? Number(full.ownerDocument.defaultView.getComputedStyle(full).opacity) : null,
          fullFades: fades(full),
          restored: Boolean(owner.VildaAuthUI?.isBootReady?.() && owner.VildaVault?.isUnlocked()
            && !owner.__vildaPersistRestoring && !owner.VildaDobAge?.restorePending?.()
            && !owner.VildaDataImportExport?.isMainSessionRestorePending?.()),
        });
        if (result.frames.length > 10_000) result.frames.shift();
        const reveal = fadeAnimations(card)[0];
        if (window.__revealExpandDuringFade && !result.expandedDuringFade && reveal
          && reveal.currentTime !== null && reveal.currentTime < reveal.effect.getTiming().duration) {
          result.expandedDuringFade = true;
          // Klikamy podczas rzeczywiście trwającego efektu, także przy jego
          // początku. Nie czekamy na RAF, który trafi w pośrednią opacity.
          card.querySelector('.vilda-centile-live-expand').click();
          result.revealCancelledOnExpand = reveal.playState === 'idle';
        }
      }
    } catch (error) { result.errors.push(String(error)); }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}

function observeNativeAnimations() {
  if (window.__revealAnimationDocument) return;
  const result = window.top.__revealPaint;
  const documentId = ++result.documents;
  window.__revealAnimationDocument = documentId;
  const tracked = new WeakMap();
  function sampleNative(element, id, animation) {
    return {
      id, documentId, currentTime: animation.currentTime, playState: animation.playState,
      progress: animation.effect.getComputedTiming().progress,
      targetMatches: animation.effect.target === element,
    };
  }
  window.__readRevealAnimation = element => {
    const entry = element && tracked.get(element);
    return entry ? sampleNative(element, entry.id, entry.animation) : null;
  };
  const original = window.Element.prototype.animate;
  window.Element.prototype.animate = function (...args) {
    const animation = original.apply(this, args);
    const keyframes = animation.effect?.getKeyframes() || [];
    if (this.classList.contains('vilda-centile-live-card')
      && keyframes.some(frame => frame.opacity !== undefined)
      && keyframes.every(frame => frame.transform === undefined)) {
      const id = result.animations.length + 1;
      tracked.set(this, { id, animation });
      const event = type => {
        const rect = this.getBoundingClientRect();
        return {
          ...sampleNative(this, id, animation), type, at: Date.now(),
          opacity: Number(getComputedStyle(this).opacity),
          card: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          attached: this.isConnected && this.ownerDocument === document,
          selectedCard: this === document.querySelector('#vildaCentileLiveMount .vilda-centile-live-card'),
          image: Boolean(this.querySelector('canvas.vilda-centile-live-image')),
        };
      };
      const record = {
        id, documentId, path: location.pathname, timing: animation.effect.getTiming(),
        keyframes: keyframes.map(frame => ({ opacity: frame.opacity, offset: frame.computedOffset })),
        playbackRate: animation.playbackRate, events: [event('start')],
      };
      result.animations.push(record);
      // Pasywne obserwowanie prawdziwej animacji: nie zmieniamy zegara, czasu
      // ani produkcyjnych onfinish/oncancel, także wewnątrz dokumentu SPA.
      animation.addEventListener('finish', () => record.events.push(event('finish')), { once: true });
      animation.addEventListener('cancel', () => record.events.push(event('cancel')), { once: true });
    }
    return animation;
  };
}

async function painted(page, count = 8) {
  await page.evaluate(count => new Promise(resolve => {
    function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
    requestAnimationFrame(next);
  }), count);
}

async function capture(page, name) {
  await painted(page);
  const value = await page.evaluate(() => window.__revealPaint);
  await test.info().attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' });
  expect(value.errors).toEqual([]);
  return value;
}

async function fixture(page, { shell = false, route = 'start', narrow = false, measurement = true } = {}) {
  await page.addInitScript(installProbe);
  // Prefiks rzeczywiście ładowanego modułu obejmuje też zastępowane dokumenty
  // iframe, których wczesny init script nie zawsze przeżywa cykl powłoki.
  await page.route(/\/vilda_centile_live_panel\.js(?:\?|$)/u, async request => {
    const response = await request.fetch();
    await request.fulfill({ response, body: `;(${observeNativeAnimations.toString()})();\n${await response.text()}` });
  });
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
  if (narrow) await page.setViewportSize({ width: 390, height: 844 });
  const data = await createFictionalVault(page, { shell });
  let owner = data.frame;
  if (route === 'docpro') {
    if (shell) {
      await page.evaluate(() => window.VildaShell.navigate('docpro'));
      owner = await shellFrame(page, 'DocPro');
    } else { await page.goto('/docpro.html', { waitUntil: 'load' }); owner = page; }
    await readyForPatient(owner);
    const confirm = owner.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
  }
  await loadPatient(owner, data.ids.a);
  if (measurement) {
    await owner.locator('#height').fill('159');
    await owner.locator('#weight').fill('47');
    await owner.locator('#weight').blur();
  }
  if (narrow) await expect(owner.locator('#vildaCentileLiveMount')).toBeHidden();
  else await ready(owner, data.ids.a);
  await expect.poll(() => owner.evaluate(() => window.vildaSession.saveNow({ force: true }))).toBe(true);
  await owner.evaluate(() => window.vildaPersistFlushNow({ force: true }));
  return { owner, id: data.ids.a };
}

async function ready(owner, id) {
  await expect.poll(() => owner.evaluate(() => window.VildaCentileLivePanel?.getState()), { timeout: 30_000 })
    .toMatchObject({ status: 'ready', eligible: true, patientId: id });
}

// Kontrolujemy tylko zakończenie rzeczywistego odczytu adaptera siatki.
// Odtworzenie formularza i pozostałe odczyty sejfu działają bez zmian.
function installReadGate() {
  if (sessionStorage.getItem('__revealGatePath') !== location.pathname) return;
  const original = window.VildaVault.getPatient;
  const releases = [];
  window.__revealReleaseRead = () => {
    sessionStorage.removeItem('__revealGatePath');
    releases.splice(0).forEach(release => release());
  };
  window.VildaVault.getPatient = function (...args) {
    const value = original.apply(this, args);
    if (sessionStorage.getItem('__revealGatePath') !== location.pathname
      || !String(new Error().stack).includes('/vilda_centile_live_data.js')) return value;
    return Promise.resolve(value).then(record => new Promise(resolve => {
      window.__revealReadWaiting = true;
      releases.push(() => resolve(record));
    }));
  };
}

async function gateOnReload(page) {
  await page.route(/\/vilda_vault\.js(?:\?|$)/u, async request => {
    const response = await request.fetch();
    await request.fulfill({ response, body: `${await response.text()}\n;(${installReadGate.toString()})();` });
  });
}

function assertSilentInterval(frames, { controlled = false } = {}) {
  const neutral = frames.filter(frame => {
    const elapsed = controlled ? frame.controlledPendingElapsed : frame.pendingElapsed;
    return elapsed !== null && elapsed < 1200 && frame.mount;
  });
  // Zimny start całej aplikacji może przekroczyć 1200 ms jeszcze przed pierwszą
  // klatką DOM. Wymagane klatki neutralne sprawdzamy osobno na gotowym formularzu.
  if (controlled) expect(neutral.length, 'obserwacja obejmuje początkowy neutralny slot').toBeGreaterThan(2);
  expect(neutral.filter(frame => frame.messageAvailable || frame.titleAvailable), 'przed 1200 ms nie przygotowujemy widocznego tekstu ładowania').toEqual([]);
}

function assertFade(observed, path, documentId) {
  expect(documentId, 'obserwujemy dokument faktycznie gotowego formularza').toBeGreaterThan(0);
  const frames = observed.frames.filter(frame => frame.path === path && frame.animationDocument === documentId && frame.card && frame.image);
  const animations = observed.animations.filter(animation => animation.path === path && animation.documentId === documentId);
  expect(animations, 'jeden rzeczywisty start pierwszego pojawienia').toHaveLength(1);
  const animation = animations[0];
  expect(animation.timing).toMatchObject({ duration: 300, delay: 0, iterations: 1, easing: 'ease-out' });
  expect(animation.keyframes).toEqual([{ opacity: '0', offset: 0 }, { opacity: '1', offset: 1 }]);
  expect(animation.playbackRate).toBe(1);
  expect(animation.events.map(event => event.type), 'animacja kończy się naturalnie, bez anulowania').toEqual(['start', 'finish']);
  const [start, finish] = animation.events;
  expect(start, 'rzeczywisty element ma opacity 0 od początku efektu').toMatchObject({ currentTime: 0, progress: 0, opacity: 0, playState: 'running' });
  expect(finish, 'naturalny koniec odsłania rzeczywisty element').toMatchObject({ currentTime: 300, opacity: 1, playState: 'finished' });
  for (const event of animation.events) {
    expect(event).toMatchObject({ id: animation.id, documentId, targetMatches: true, attached: true, selectedCard: true, image: true });
    expect(event.card).toEqual(start.card);
  }
  expect(start.card.width).toBeGreaterThan(0);
  expect(start.card.height).toBeGreaterThan(0);
  expect(frames.length, 'obserwujemy także faktycznie wyświetlany obraz').toBeGreaterThan(0);
  expect(frames.at(-1)).toMatchObject({ opacity: 1, fades: 0, mountVisible: true });
  // RAF może nie otrzymać żadnej próbki wnętrza 300 ms. To nie dowodzi braku
  // animacji i nie pomija testu: start, finish i cały native lifecycle powyżej
  // pozostają obowiązkowe. Każdą dostępną próbkę sprawdzamy względem postępu
  // TEGO efektu (progress zawiera ease-out), bez wymagania minimalnego FPS.
  for (const frame of frames) {
    expect(frame.native).toMatchObject({ id: animation.id, documentId, targetMatches: true });
    if (frame.native.progress !== null) {
      expect(frame.opacity, 'widoczna opacity odpowiada natywnemu postępowi efektu').toBeCloseTo(frame.native.progress, 5);
    } else {
      expect(frame.native.currentTime).toBe(300);
      expect(frame.opacity).toBe(1);
    }
    expect(frame.card).toEqual(start.card);
    expect(frame.status).toBe('ready');
  }
  expect(frames.slice(1).every((frame, index) => frame.opacity >= frames[index].opacity),
    'opacity rośnie bez ponownego zanikania').toBe(true);
}

for (const shell of [false, true]) for (const route of ['start', 'docpro']) {
  test(`${shell ? 'SPA' : 'samodzielnie'} ${route}: neutralny boot przechodzi w komunikat i jeden płynny rysunek`, async ({ page }) => {
    const { owner: initial, id } = await fixture(page, { shell, route });
    await gateOnReload(page);
    await initial.evaluate(() => sessionStorage.setItem('__revealGatePath', location.pathname));
    let releaseScript;
    const scriptGate = new Promise(resolve => { releaseScript = resolve; });
    await page.route(/\/vilda_centile_live_panel\.js(?:\?|$)/u, async request => {
      await scriptGate;
      await request.fallback();
    });
    await page.reload({ waitUntil: 'commit' });
    const path = route === 'docpro' ? '/docpro.html' : '/index.html';
    // Przed kontrolerem działa prawdziwy timer HTML. Celowo przekraczamy jego
    // granicę, żeby przejęcie oczekiwania nie rozpoczynało następnych 1200 ms.
    await page.waitForFunction(path => window.__revealPaint?.frames.some(frame => frame.path === path
      && !frame.controller && frame.pendingElapsed >= 1200 && frame.messageAvailable), path);
    const before = await capture(page, 'boot-before-controller.json');
    assertSilentInterval(before.frames.filter(frame => frame.path === path));
    releaseScript();
    await page.waitForLoadState('load');
    const owner = shell ? await shellFrame(page, route === 'docpro' ? 'DocPro' : 'Start') : page;
    await owner.waitForFunction(() => window.__revealReadWaiting && window.VildaAuthUI?.isBootReady?.()
      && !window.__vildaPersistRestoring && !window.VildaDobAge?.restorePending?.());
    await expect(owner.locator('#vildaCentileLiveLoadingMessage')).toBeVisible();
    await painted(page);
    await owner.evaluate(() => window.__revealReleaseRead());
    await ready(owner, id);
    await owner.waitForFunction(() => !document.querySelector('.vilda-centile-live-card')?.getAnimations().length);
    const first = await capture(page, 'first-reveal.json');
    assertFade(first, path, await owner.evaluate(() => window.__revealAnimationDocument));
    expect(first.frames.filter(frame => frame.path === path && frame.controller && frame.status !== 'ready'
      && frame.pendingElapsed >= 1200 && frame.mountVisible && !frame.message), 'przejęcie przez kontroler nie gasi należnego komunikatu').toEqual([]);
    if (!shell && route === 'start') {
      await page.evaluate(() => {
        window.__revealPaint.frames = [];
        window.__revealImageBeforeEdit = document.querySelector('canvas.vilda-centile-live-image');
      });
      await owner.locator('#height').fill('160');
      await owner.locator('#height').blur();
      await expect.poll(() => owner.evaluate(() => window.advancedGrowthData.currentHeight)).toBe(160);
      await ready(owner, id);
      await owner.waitForFunction(() => {
        const image = document.querySelector('canvas.vilda-centile-live-image');
        return image && image !== window.__revealImageBeforeEdit;
      });
      const edit = await capture(page, 'ordinary-edit.json');
      expect(edit.frames.filter(frame => frame.card && (frame.opacity !== 1 || frame.fades))).toEqual([]);
      expect(edit.animations, 'edycja nie uruchamia nowego efektu nawet między próbkami RAF').toEqual(first.animations);
    }
  });
}

test('pierwsze szybkie pokazanie nie wyświetla komunikatu, a fullscreen podczas fade nie przebłyskuje', async ({ page }) => {
  const { id } = await fixture(page, { narrow: true });
  await page.evaluate(() => {
    sessionStorage.setItem('__revealGatePath', location.pathname);
    window.__revealPaint.frames = [];
    window.__revealExpandDuringFade = true;
    window.__revealViewportChangeAt = Date.now();
  });
  await page.evaluate(installReadGate);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => window.__revealReadWaiting);
  await painted(page, 3);
  await page.evaluate(() => window.__revealReleaseRead());
  await ready(page, id);
  await expect(page.locator('.vilda-centile-live-dialog')).toBeVisible();
  const observed = await capture(page, 'fast-reveal-fullscreen.json');
  expect(observed.expandedDuringFade, 'przycisk aktywowano podczas rzeczywistej animacji').toBe(true);
  expect(observed.revealCancelledOnExpand, 'otwarcie natychmiast anuluje animację pierwszego pojawienia').toBe(true);
  assertSilentInterval(observed.frames, { controlled: true });
  expect(observed.frames.filter(frame => frame.message || frame.title), 'szybkie przejście nie pokazuje ładowania').toEqual([]);
  const full = observed.frames.filter(frame => frame.fullscreen);
  expect(full.length).toBeGreaterThan(2);
  // Host ma własną istniejącą animację opacity+transform (230 ms). Nie może
  // dziedziczyć nowego fade opacity-only ani nagle ponownie zniknąć podczas otwarcia.
  expect(full.filter(frame => frame.fullFades)).toEqual([]);
  expect(full.slice(1).every((frame, index) => frame.fullOpacity >= full[index].fullOpacity)).toBe(true);
  await page.waitForFunction(() => {
    const card = document.querySelector('.vilda-centile-live-card--fullscreen');
    return card && getComputedStyle(card).opacity === '1' && card.getAnimations().length === 0;
  });
});

test('reduced motion: edycja i błąd pokazują informację od razu, a ponowienie rysuje bez fade', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { id } = await fixture(page, { narrow: true, measurement: false });
  await page.evaluate(() => {
    window.__revealPaint.frames = [];
    window.__revealViewportChangeAt = Date.now();
    const original = window.VildaVault.getPatient;
    window.__revealRestoreRead = () => { window.VildaVault.getPatient = original; };
    window.VildaVault.getPatient = function (...args) {
      if (String(new Error().stack).includes('/vilda_centile_live_data.js')) return Promise.reject(new Error('Fikcyjny błąd odczytu siatki'));
      return original.apply(this, args);
    };
  });
  await page.locator('#height').fill('16');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('#vildaCentileLiveLoadingMessage')).toHaveText('Siatka pojawi się po zakończeniu edycji pola.');
  await expect(page.locator('#vildaCentileLiveLoadingMessage')).toBeVisible();
  await painted(page, 3);
  await page.locator('#height').fill('159');
  await page.locator('#weight').fill('47');
  await page.locator('#weight').blur();
  await expect.poll(() => page.evaluate(() => window.VildaCentileLivePanel.getState().slotStatus)).toBe('error');
  await expect(page.locator('#vildaCentileLiveLoadingMessage')).toBeVisible();
  await expect(page.locator('#vildaCentileLiveRetry')).toBeVisible();
  await page.evaluate(() => window.__revealRestoreRead());
  await page.locator('#vildaCentileLiveRetry').click();
  await ready(page, id);
  const observed = await capture(page, 'reduced-motion-error-retry.json');
  expect(observed.frames.some(frame => frame.message && frame.messageText.includes('zakończeniu edycji')),
    'oczekiwanie na koniec edycji ma własny natychmiastowy komunikat').toBe(true);
  expect(observed.frames.some(frame => frame.slotStatus === 'error' && frame.message)).toBe(true);
  expect(observed.frames.filter(frame => frame.card && (frame.opacity !== 1 || frame.fades))).toEqual([]);
  expect(observed.frames.some(frame => frame.card && frame.image && frame.opacity === 1)).toBe(true);
  expect(observed.animations, 'reduced motion nie tworzy animacji pierwszego pojawienia').toEqual([]);
});
