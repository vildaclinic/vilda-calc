import { expect, test } from '@playwright/test';
import { createFictionalVault } from '../support/centile-live-fixture.mjs';
import { emulatePhone } from '../support/telefon-poziomo.mjs';

// P-MENU-RUCH: prawdziwe klatki CSS, bez wstrzykiwania stylów, zmiany handlerów
// ani screenshotów przeskakujących animację. Dane i konto są wyłącznie fikcyjne.
const MENU = '[data-vilda-chrome-drawer]';
const TRIGGER = '[data-vilda-chrome-menu-btn]';
const PANEL = `${MENU} .chrome-drawer-panel`;
const profiles = [
  { name: 'desktop jednokolumnowy 930', width: 930, height: 900, phone: false },
  { name: 'telefon pionowo 390', width: 390, height: 852, phone: true },
  { name: 'telefon poziomo 844', width: 844, height: 390, phone: true },
];

async function prepare(page, profile) {
  if (profile.phone) await emulatePhone(page, profile);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  await createFictionalVault(page, { shell: true });
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await expect(page.locator(TRIGGER)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const menu = document.querySelector('[data-vilda-chrome-drawer]');
    const panel = menu.querySelector('.chrome-drawer-panel');
    const backdrop = menu.querySelector('.chrome-drawer-backdrop');
    const trace = window.__menuMotionTrace = { runs: [], holdNextEntry: false };
    const channel = new MessageChannel();
    const tasks = [];
    channel.port1.onmessage = () => tasks.shift()?.();
    // Odczyt po callbackach klatki, nie pomiędzy hidden=false a klasą open.
    const afterFrame = callback => requestAnimationFrame(() => {
      tasks.push(callback);
      channel.port2.postMessage(null);
    });
    const animationInfo = animation => ({
      type: animation.constructor.name,
      name: animation.animationName,
      duration: animation.effect.getTiming().duration,
    });
    // Kontrolujemy zegar prawdziwej animacji, nie jej CSS ani handler. Pierwszy
    // proof zaczyna od zera, próba Escape trzyma niedokończone wejście w połowie.
    // Roundtrip runnera CI nie może skończyć animacji przed wysłaniem Escape.
    menu.addEventListener('animationstart', event => {
      const run = trace.runs.at(-1);
      if (!(run?.controlled || run?.heldForClose) || ![panel, backdrop].includes(event.target)) return;
      for (const animation of event.target.getAnimations()) {
        if (animation.animationName !== event.animationName) continue;
        animation.pause();
        animation.currentTime = run.heldForClose ? animation.effect.getTiming().duration / 2 : 0;
      }
    });
    let wasOpen = false;
    new MutationObserver(() => {
      const open = document.body.classList.contains('chrome-drawer-open');
      if (open && !wasOpen) {
        const run = { frames: [], ready: false, done: false, cancelled: false,
          controlled: trace.runs.length === 0, heldForClose: trace.holdNextEntry, stage: 'start' };
        trace.holdNextEntry = false;
        trace.runs.push(run);
        afterFrame(() => {
          const panelAnimations = panel.getAnimations();
          const backdropAnimations = backdrop.getAnimations();
          run.panelAnimations = panelAnimations.map(animationInfo);
          run.backdropAnimations = backdropAnimations.map(animationInfo);
          let settled = false;
          Promise.allSettled([...panelAnimations, ...backdropAnimations].map(a => a.finished))
            .then(results => {
              run.cancelled = results.some(result => result.status === 'rejected');
              settled = true;
            });
          const sample = () => {
            const rect = panel.getBoundingClientRect();
            const geometry = selector => {
              const box = document.querySelector(selector)?.getBoundingClientRect();
              return box ? { x: box.x + scrollX, y: box.y + scrollY,
                width: box.width, height: box.height } : null;
            };
            run.frames.push({ x: rect.x, right: rect.right, width: rect.width,
              opacity: Number(getComputedStyle(panel).opacity),
              backdrop: Number(getComputedStyle(backdrop).opacity),
              transform: getComputedStyle(panel).transform,
              activeAnimations: panel.getAnimations().length + backdrop.getAnimations().length,
              stage: run.stage,
              focusInside: panel.contains(document.activeElement), hidden: menu.hidden,
              overflow: document.documentElement.scrollWidth - innerWidth,
              background: [geometry('body > header'), geometry('.app-shell-main')],
            });
            run.ready = true;
            if (settled) run.done = true;
            else afterFrame(sample);
          };
          sample();
        });
      }
      wasOpen = open;
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
}

async function open(page) {
  await page.locator(TRIGGER).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'false');
}

async function completed(page) {
  await page.waitForFunction(() => window.__menuMotionTrace.runs.at(-1)?.done);
  return page.evaluate(() => window.__menuMotionTrace.runs.at(-1));
}

async function closed(page) {
  await expect(page.locator(MENU)).toHaveAttribute('hidden', '');
  await expect(page.locator(MENU)).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator(TRIGGER)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator(TRIGGER)).toBeFocused();
}

function expectEntry(run) {
  expect(run.panelAnimations).toHaveLength(1);
  expect(run.backdropAnimations).toHaveLength(1);
  expect(run.panelAnimations[0]).toMatchObject({ type: 'CSSAnimation', duration: 560 });
  expect(run.backdropAnimations[0]).toMatchObject({ type: 'CSSAnimation', duration: 440 });
  const first = run.frames[0], last = run.frames.at(-1);
  expect(run.cancelled).toBe(false);
  if (run.controlled) {
    expect(first.right, 'początek rzeczywistych keyframes mieści cały panel poza ekranem').toBeLessThanOrEqual(1);
    expect(first.backdrop).toBe(0);
    const middle = run.frames.find(frame => frame.stage === 'midpoint');
    expect(middle, 'przeglądarka rzeczywiście interpoluje połowę animacji').toBeTruthy();
    expect(middle.x).toBeGreaterThan(first.x + 1);
    expect(middle.x).toBeLessThan(last.x - 1);
    expect(middle.backdrop).toBeGreaterThan(0);
    expect(middle.backdrop).toBeLessThan(1);
  }
  expect(last.transform).toBe('none');
  expect(last.activeAnimations).toBe(0);
  expect(last.backdrop).toBe(1);
  for (const frame of run.frames) {
    expect(frame.opacity, 'panel pozostaje nieprzezroczysty').toBe(1);
    expect(frame.focusInside).toBe(true);
    expect(frame.hidden).toBe(false);
    expect(frame.overflow).toBeLessThanOrEqual(1);
    for (const [index, box] of frame.background.entries()) {
      expect(box).not.toBeNull();
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Math.abs(box[key] - first.background[index][key]), `nieruchoma geometria tła: ${index}/${key}`)
          .toBeLessThanOrEqual(1);
      }
    }
  }
}

for (const profile of profiles) {
  test.describe(profile.name, () => {
    test.use({ serviceWorkers: 'block', reducedMotion: 'no-preference',
      viewport: { width: profile.width, height: profile.height },
      isMobile: profile.phone, hasTouch: profile.phone,
      userAgent: profile.phone
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    });

    test('animacja wejścia, przerwanie/reopen, reduced motion i przekazanie fokusu trasie', async ({ page }, testInfo) => {
      await prepare(page, profile);
      await open(page);
      await page.waitForFunction(() => window.__menuMotionTrace.runs.at(-1)?.ready);
      const started = await page.evaluate(() => window.__menuMotionTrace.runs.at(-1));
      expect(started.panelAnimations).toHaveLength(1);
      expect(started.backdropAnimations).toHaveLength(1);
      await page.evaluate(() => {
        const run = window.__menuMotionTrace.runs.at(-1);
        run.stage = 'midpoint';
        for (const el of document.querySelectorAll('.chrome-drawer-panel,.chrome-drawer-backdrop')) {
          for (const animation of el.getAnimations()) {
            animation.currentTime = animation.effect.getTiming().duration / 2;
          }
        }
      });
      await page.waitForFunction(() => window.__menuMotionTrace.runs.at(-1).frames.some(frame => frame.stage === 'midpoint'));
      await page.evaluate(() => {
        window.__menuMotionTrace.runs.at(-1).stage = 'playing';
        for (const el of document.querySelectorAll('.chrome-drawer-panel,.chrome-drawer-backdrop')) {
          for (const animation of el.getAnimations()) animation.play();
        }
      });
      const first = await completed(page);
      await testInfo.attach('entry-frames.json', { body: JSON.stringify(first), contentType: 'application/json' });
      expectEntry(first);
      await page.keyboard.press('Tab');
      await expect.poll(() => page.locator(PANEL).evaluate(el => el.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');
      await closed(page);

      // Rzeczywiste Escape anuluje wejście zatrzymane w połowie. Następne otwarcie
      // biegnie naturalnie do końca, bez pozostałości wcześniejszego zamknięcia.
      await page.evaluate(() => { window.__menuMotionTrace.holdNextEntry = true; });
      await open(page);
      await page.waitForFunction(() => {
        const run = window.__menuMotionTrace.runs.at(-1);
        return run?.frames.length && !run.done;
      });
      const interrupted = await page.evaluate(() => ({
        index: window.__menuMotionTrace.runs.length - 1,
        held: window.__menuMotionTrace.runs.at(-1).heldForClose,
        animations: [...document.querySelectorAll('.chrome-drawer-panel,.chrome-drawer-backdrop')]
          .flatMap(el => el.getAnimations()).map(animation => ({
            state: animation.playState, time: animation.currentTime,
            duration: animation.effect.getTiming().duration,
          })),
      }));
      expect(interrupted.held).toBe(true);
      expect(interrupted.animations).toHaveLength(2);
      for (const animation of interrupted.animations) {
        expect(animation.state).toBe('paused');
        expect(animation.time).toBe(animation.duration / 2);
      }
      await page.keyboard.press('Escape');
      await closed(page);
      await open(page);
      const reopened = await completed(page);
      const interruptedRun = await page.evaluate(index => window.__menuMotionTrace.runs[index], interrupted.index);
      await testInfo.attach('interrupted-reopen-frames.json', {
        body: JSON.stringify({ interrupted, interruptedRun, reopened }), contentType: 'application/json',
      });
      expectEntry(reopened);
      expect(reopened.heldForClose).toBe(false);
      expect(interruptedRun.cancelled).toBe(true);
      await page.keyboard.press('Escape');
      await closed(page);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      const reduced = await completed(page);
      expect(reduced.panelAnimations).toEqual([]);
      expect(reduced.backdropAnimations).toEqual([]);
      expect(reduced.frames.every(frame => frame.transform === 'none' && frame.backdrop === 1
        && frame.focusInside && frame.overflow <= 1)).toBe(true);
      await page.keyboard.press('Escape');
      await closed(page);

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await open(page);
      await page.locator(`${MENU} a[href="homa-ir.html"]`).focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/homa$/);
      await expect(page.locator(MENU)).toHaveAttribute('hidden', '');
      await expect.poll(() => page.evaluate(() => {
        const frame = document.querySelector('iframe.app-pane:not([hidden])');
        return frame?.title === 'HOMA-IR' && document.activeElement === frame;
      })).toBe(true);
    });
  });
}
