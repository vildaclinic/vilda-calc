import { devices, expect, test as base } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';
import { openMenuPatient } from '../support/chrome-menu-fixture.mjs';
import { G1 } from '../support/karta-leczenie.mjs';
import { czekajNaBadania, czekajNaHistorie } from '../support/karta-czekanie.mjs';

// Playwright hides native tracks by default. Keep all configured launch
// options, including an optional system Chromium path, and expose scrollbars
// so these geometry assertions also cover their actual layout reservation.
const test = base.extend({
  launchOptions: async ({ launchOptions }, use) => {
    const ignored = launchOptions.ignoreDefaultArgs;
    await use({ ...launchOptions, ignoreDefaultArgs: ignored === true ? true
      : [...new Set([...(ignored || []), '--hide-scrollbars'])] });
  },
});

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);

async function installGeometryProbe(owner) {
  await owner.evaluate(() => {
    function read() {
      const root = document.querySelector('.vilda-auth-root');
      const card = root.querySelector('.vilda-auth-patient-card');
      const tabs = card.querySelector('.vilda-patient-tabs');
      const panel = [...card.querySelectorAll(':scope > .vilda-patient-tab-content')]
        .find(node => !node.classList.contains('vilda-patient-tab-content--hidden'));
      const box = node => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { at: performance.now(), root: { ...box(root), clientWidth: root.clientWidth,
        clientHeight: root.clientHeight, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight,
        scrollTop: root.scrollTop, gutter: root.offsetWidth - root.clientWidth },
      card: box(card), tabs: box(tabs), tabInCard: tabs.getBoundingClientRect().top - card.getBoundingClientRect().top,
      active: card.querySelector('.vilda-patient-tab--active')?.dataset.tab,
      focus: document.activeElement?.dataset.tab || document.activeElement?.tagName,
      panel: panel ? { tab: panel.dataset.tab, height: panel.getBoundingClientRect().height,
        clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight } : null };
    }
    let generation = 0, frames = [];
    function tick(token) {
      if (token !== generation) return;
      frames.push(read()); requestAnimationFrame(() => tick(token));
    }
    window.__patientCardTabGeometry = {
      read,
      start() { frames = [read()]; const token = ++generation; requestAnimationFrame(() => tick(token)); },
      stop() { generation++; return frames.concat(read()); },
      frames: count => new Promise(resolve => {
        function next() { if (--count <= 0) resolve(); else requestAnimationFrame(next); }
        requestAnimationFrame(next);
      }),
    };
  });
}

async function readyTab(owner, tab) {
  const panel = owner.locator(`.vilda-patient-tab-content[data-tab="${tab}"]`);
  await expect(panel).toBeVisible();
  if (tab === 'timeline') await czekajNaHistorie(owner);
  if (tab === 'lab') await czekajNaBadania(owner);
  if (tab === 'notes') await expect(panel.locator('.vilda-patient-notes-scroll')).toBeVisible();
  if (tab === 'traj') await expect.poll(() => panel.locator('svg.vilda-patient-chart').count()).toBeGreaterThan(0);
  if (tab === 'leczenie') await expect(panel.locator('.vilda-kg-karta')).toBeVisible();
  if (tab === 'care') await expect(panel.locator('.vcp-list .vcp-empty')).toHaveText('Nie masz jeszcze planów opieki. Dodaj pierwszy plan dla pacjenta.');
}

async function fixture(page, context, baseURL, shell) {
  await context.route('**/*', route => route.request().url().startsWith(baseURL + '/')
    ? route.continue() : route.abort());
  const created = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  const owner = created.frame;
  const patientId = await owner.evaluate(async record => {
    const vault = window.VildaVault;
    const id = (await vault.savePatient(record, { dedup: false })).patientId;
    for (let index = 0; index < 12; index++) await vault.savePatientNote({ patientId: id,
      title: `Fikcyjna notatka geometrii ${index + 1}`, body: 'Fikcyjna obserwacja do testu przewijania karty.',
      category: 'observation', clinicalDateISO: '2026-11-10' });
    await vault.savePatientNote({ patientId: id, title: 'Fikcyjny TSH', body: 'Fikcyjny wynik.',
      category: 'wynik-badania', clinicalDateISO: '2026-11-10',
      labResult: { test: 'TSH', testKey: 'tsh', value: '2,1 mIU/L', valueNum: 2.1, unit: 'mIU/L' } });
    return id;
  }, G1);
  await loadPatient(owner, patientId, 'restore');
  await openMenuPatient(page);
  await expect(owner.locator('.vilda-auth-patient-card .vilda-patient-tabs')).toBeVisible();
  await expect(owner.locator('.vilda-patient-tabs > .vilda-patient-tab')).toHaveCount(7);
  await owner.evaluate(() => document.fonts.ready);
  await installGeometryProbe(owner);
  await owner.evaluate(() => window.__patientCardTabGeometry.frames(3));
  return owner;
}

const phone = devices['iPhone 15 Pro'];
for (const profile of [
  { name: 'desktop shell', shell: true, use: { viewport: { width: 1440, height: 1000 } } },
  { name: 'desktop standalone', shell: false, use: { viewport: { width: 1440, height: 1000 } } },
  { name: 'phone shell', shell: true, use: { viewport: { width: 390, height: 844 },
    userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor, isMobile: true, hasTouch: true } },
]) test.describe(profile.name, () => {
  test.use(profile.use);
  test('patient tabs keep the visible card position through short and long content', async ({ page, context, baseURL, browser }, testInfo) => {
    const owner = await fixture(page, context, baseURL, profile.shell), transitions = [], problems = [];
    let release;
    if (profile.name.startsWith('desktop')) {
      expect(await owner.evaluate(() => window.__patientCardTabGeometry.read().root.gutter),
        'desktop geometry uses a real native scrollbar reservation').toBeGreaterThan(0);
    }
    async function transition(tab, activation = 'click') {
      const button = owner.locator(`.vilda-patient-tabs > .vilda-patient-tab[data-tab="${tab}"]`);
      const before = await owner.evaluate(() => window.__patientCardTabGeometry.read());
      await owner.evaluate(() => window.__patientCardTabGeometry.start());
      if (activation === 'click') await button.click();
      else {
        // Real keyboard activation without Playwright's click scrollIntoView.
        await button.evaluate(node => node.focus({ preventScroll: true }));
        await page.keyboard.press(activation);
      }
      await readyTab(owner, tab);
      await owner.evaluate(() => window.__patientCardTabGeometry.frames(12));
      const frames = await owner.evaluate(() => window.__patientCardTabGeometry.stop());
      const after = frames.at(-1);
      transitions.push({ from: before.active, to: tab, activation, before, after, frames });
      const changed = frames.filter(frame => Math.abs(frame.card.x - before.card.x) > 1
        || Math.abs(frame.card.y - before.card.y) > 1 || Math.abs(frame.tabs.x - before.tabs.x) > 1
        || Math.abs(frame.tabs.y - before.tabs.y) > 1 || Math.abs(frame.tabs.width - before.tabs.width) > 1
        || Math.abs(frame.tabInCard - before.tabInCard) > 1 || frame.root.clientWidth !== before.root.clientWidth);
      if (changed.length) problems.push({ from: before.active, to: tab, activation, before, firstShift: changed[0], after });
      expect(await button.evaluate(node => document.activeElement === node), `focus remains on ${tab}`).toBe(true);
    }
    try {
      for (const tab of ['traj', 'leczenie', 'notes', 'timeline', 'lab', 'care', 'antro', 'traj']) await transition(tab);
      const scrolled = await owner.evaluate(() => {
        const root = document.querySelector('.vilda-auth-root');
        const card = root.querySelector('.vilda-auth-patient-card');
        const panel = card.querySelector('.vilda-patient-tab-content[data-tab="traj"]');
        const candidates = [panel, ...panel.querySelectorAll('*'), root];
        const target = candidates.find(node => node.scrollHeight - node.clientHeight > 80
          && /auto|scroll/.test(getComputedStyle(node).overflowY));
        if (!target) return null;
        const tabs = card.querySelector('.vilda-patient-tabs').getBoundingClientRect();
        target.scrollTop = target === root ? Math.min(64, Math.max(0, tabs.top - root.getBoundingClientRect().top - 24)) : 64;
        return { className: target.className, amount: target.scrollTop };
      });
      expect(scrolled, 'the real long chart view offers a scroll owner').not.toBeNull();
      expect(scrolled.amount, 'partly scrolled geometry is measured').toBeGreaterThan(10);
      await owner.evaluate(() => window.__patientCardTabGeometry.frames(3));
      await transition('leczenie', 'Enter');
      await transition('care', 'Space');
      await transition('leczenie', 'Enter');
      const shortAtTop = transitions.find(value => value.to === 'leczenie').after;
      const beforeReturn = await owner.evaluate(() => window.__patientCardTabGeometry.read());
      if (profile.name.startsWith('desktop')) {
        expect(shortAtTop.root.scrollHeight, 'the unscrolled treatment overview genuinely fits the viewport').toBe(shortAtTop.root.clientHeight);
        expect(beforeReturn.root.scrollHeight, 'the measured height reserve keeps the old scroll position').toBeGreaterThan(shortAtTop.root.scrollHeight);
      }
      await page.keyboard.press('Control+Home');
      await expect.poll(() => owner.evaluate(() => document.querySelector('.vilda-auth-root').scrollTop)).toBe(0);
      await owner.evaluate(() => window.__patientCardTabGeometry.frames(12));
      const returned = await owner.evaluate(() => window.__patientCardTabGeometry.read());
      release = { before: beforeReturn, after: returned, naturalShortView: shortAtTop };
      // Retaining a partly scrolled view must not leave an empty height reserve
      // after the clinician deliberately scrolls back to the top.
      expect(returned.root.scrollHeight).toBe(shortAtTop.root.scrollHeight);
      expect(returned.tabs.y).toBeCloseTo(shortAtTop.tabs.y, 0);
      expect(problems.map(problem => ({ from: problem.from, to: problem.to, activation: problem.activation,
        cardShiftX: problem.firstShift.card.x - problem.before.card.x,
        cardShiftY: problem.firstShift.card.y - problem.before.card.y,
        tabShiftY: problem.firstShift.tabs.y - problem.before.tabs.y,
        widthBefore: problem.before.root.clientWidth, widthAfter: problem.firstShift.root.clientWidth,
      })), 'card and tabs stay in place, including while outer scrolling changes').toEqual([]);
    } finally {
      const path = testInfo.outputPath('patient-card-tab-geometry.json');
      await writeFile(path, JSON.stringify({ profile: profile.name, browserVersion: browser.version(), transitions, release, problems }, null, 2));
      await testInfo.attach('patient-card-tab-geometry.json', { contentType: 'application/json',
        path });
    }
  });
});
