import { expect } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from './centile-live-fixture.mjs';

export const LAYOUT_ROUTES = [
  { route: 'start', file: 'index.html', title: 'Start' },
  { route: 'docpro', file: 'docpro.html', title: 'DocPro' },
  { route: 'klirens', file: 'kalkulator-klirens.html', title: 'Kalkulator klirensu' },
];

// Real production pages and one isolated, encrypted, fictional account. No
// replaced layout, measured CSS variables or copied layout calculations.
export async function prepareLayoutRoute(page, shell, route) {
  const created = await createFictionalVault(page, { shell });
  let owner = created.frame;
  if (route.route !== 'start') {
    if (shell) {
      await page.evaluate(target => window.VildaShell.navigate(target), route.route);
      owner = await shellFrame(page, route.title);
      await expect(page.locator(`iframe.app-pane[title="${route.title}"]`)).toBeVisible();
    } else {
      await page.goto('/' + route.file, { waitUntil: 'load' });
      owner = page;
    }
    if (route.route === 'docpro') await readyForPatient(owner);
    else await owner.waitForFunction(() => window.VildaVault?.isUnlocked()
      && window.VildaAuthUI?.isBootReady() && document.getElementById('clcrWorkspace'));
  }
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  await owner.evaluate(() => document.fonts.ready);
  return { ...created, owner };
}

export async function headerLayout(page) {
  return page.evaluate(() => {
    const iframe = document.querySelector('iframe.app-pane:not([hidden])');
    const doc = iframe ? iframe.contentDocument : document;
    const origin = iframe ? iframe.getBoundingClientRect() : { x: 0, y: 0 };
    const box = (node, embedded = false) => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), x = r.x + (embedded ? origin.x : 0), y = r.y + (embedded ? origin.y : 0);
      return { x, y, right: x + r.width, bottom: y + r.height, width: r.width, height: r.height };
    };
    const visible = node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && doc.defaultView.getComputedStyle(node).visibility !== 'hidden';
    };
    const renal = Boolean(doc.getElementById('clcrWorkspace'));
    const first = doc.querySelector(renal ? '#clcrActivePanel' : '#userSection fieldset.user-card');
    const second = renal ? doc.querySelector('#clcrResultReport') : [...doc.querySelectorAll(
      '#currentSummaryCard, #remindersInline .vild-rem-card, #professionalModule, #infoMessages, #vildaCentileLiveMount > article, #vildaCentileLiveMount > .vilda-centile-live-card',
    )].filter(visible).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
    // A populated Start ends in real report/section actions outside its cards.
    // Include those rendered rows, not empty wrappers with residual margins.
    const cards = [...doc.querySelectorAll('.main-content fieldset, .main-content .card, .main-content .plan-card, .main-content .vild-rem-card, #modulesWrapper > .module-btn-wrapper, #leftColumnWrap > *, #normWrapper > *, #clcrPatientContext, #clcrActivePanel, #clcrResultReport')].filter(visible);
    const last = cards.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
    return {
      viewport: { width: innerWidth, height: innerHeight }, embeddedWidth: doc.defaultView.innerWidth,
      contentScrollY: doc.defaultView.scrollY,
      // Only a child scroll moves the card independently of the host header.
      embeddedScrollY: iframe ? doc.defaultView.scrollY : 0,
      header: box(document.querySelector('body > header')), menu: box(document.querySelector('aside.sidebar-v2 .sidebar-inner')),
      search: box(document.getElementById('vildaHeaderSearch')), bell: box(document.getElementById('vildaRemindersBtn')),
      workspace: box(doc.querySelector(renal ? '#clcrWorkspace' : '#calcForm'), true),
      topCard: box(doc.querySelector(renal ? '#clcrWorkflow' : '#userSection fieldset.user-card'), true),
      first: box(first, true), second: box(second, true), last: box(last, true), lastId: last?.id || last?.className,
      secondTrack: box(doc.querySelector(renal ? '#clcrResultRail' : '#doctorSection'), true),
      decor: box(document.querySelector(iframe ? '#vildaShellDecor' : '.desktop-layout > .decor-sidebar')),
      footer: box(doc.querySelector('.site-footer'), true),
      hostOverflow: document.documentElement.scrollWidth - innerWidth,
      contentOverflow: doc.documentElement.scrollWidth - doc.defaultView.innerWidth,
    };
  });
}

export async function expectHeaderAlignment(page) {
  await expect.poll(async () => {
    const g = await headerLayout(page);
    if (!g.first || !g.workspace || !g.search || !g.bell) return { missingCard: true };
    return {
      searchWidth: Math.round(g.search.width),
      gap: Math.round(g.bell.x - g.search.right),
      bell: Math.round(Math.abs(g.bell.right - g.workspace.right)),
      sameRow: Math.round(Math.abs(g.search.y - g.bell.y)),
    };
  }, { message: 'the two 44px actions sit 8px apart and end at the actual workspace edge' })
    .toEqual({ searchWidth: 44, gap: 8, bell: 0, sameRow: 0 });
}

export async function expectBell(page) {
  const bell = page.locator('#vildaRemindersBtn');
  await page.mouse.move(0, 0);
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute('title', 'Otwórz przypomnienia');
  await expect(bell.locator('.chrome-reminders-label')).toHaveCount(0);
  await expect(bell.locator('svg')).toHaveCSS('width', '21px');
  await expect(bell.locator('svg')).toHaveCSS('height', '21px');
  await expect(bell).toHaveCSS('color', 'rgb(107, 130, 137)');
  await expect(bell).toHaveCSS('background-color', 'rgb(248, 250, 251)');
  await expect(bell).toHaveCSS('border-color', 'rgb(214, 226, 229)');
  await expect.poll(() => bell.evaluate(node => {
    const r = node.getBoundingClientRect(); return { width: r.width, height: r.height };
  })).toEqual({ width: 44, height: 44 });
  return bell.evaluate(node => {
    const css = getComputedStyle(node);
    return { color: css.color, background: css.backgroundColor, border: css.borderColor };
  });
}

export async function expectDesktopSearchControl(page) {
  const search = page.locator('#vildaHeaderSearch'), submit = search.getByRole('button', { name: 'Szukaj', exact: true });
  await expect(search).toHaveCSS('width', '44px');
  await expect(search).toHaveCSS('height', '44px');
  await expect(submit).toHaveCSS('width', '44px');
  await expect(submit).toHaveCSS('height', '44px');
  await expect(submit.locator('svg')).toHaveCSS('width', '20px');
  await expect(submit.locator('svg')).toHaveCSS('height', '20px');
  await expect(search.locator('input')).toHaveCount(0);
  for (const state of ['normal', 'hover', 'focus']) {
    if (state === 'hover') await submit.hover();
    if (state === 'focus') { await page.mouse.move(0, 0); await submit.focus(); }
    await expect.poll(() => submit.evaluate(node => {
      const button = node.getBoundingClientRect(), form = node.closest('#vildaHeaderSearch').getBoundingClientRect();
      const icon = node.querySelector('svg').getBoundingClientRect();
      return button.left >= form.left && button.right <= form.right && button.top >= form.top && button.bottom <= form.bottom
        && icon.left >= button.left && icon.right <= button.right && icon.top >= button.top && icon.bottom <= button.bottom;
    }), { message: `${state}: real painted button and icon stay inside Search` }).toBe(true);
  }
  await submit.blur();
}

export async function expectReachableFooter(page, owner) {
  await owner.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const footer = owner.locator('.site-footer');
  await expect(footer).toBeInViewport();
  await expect(footer.locator('.site-footer__col a')).toHaveCount(4);
  for (const link of await footer.locator('.site-footer__col a').all()) {
    await expect(link).toBeInViewport();
    await expect.poll(() => link.evaluate(node => {
      const r = node.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const local = node.contains(document.elementFromPoint(x, y));
      const pane = window.frameElement;
      if (!pane) return local;
      const host = pane.getBoundingClientRect();
      return local && parent.document.elementFromPoint(host.x + x, host.y + y) === pane;
    }), { message: 'footer link is hit-testable in content and host above floating controls' }).toBe(true);
  }
}
