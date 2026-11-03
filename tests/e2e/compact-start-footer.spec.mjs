import { devices } from '@playwright/test';
import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient } from '../support/centile-live-fixture.mjs';

// Restored vertical Start and retained compact footer: real fields and chrome.
// No replacement markup, geometry styles or clinical calculations in the test.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

const MENU = 'aside.sidebar-v2 .sidebar-inner';
const FIELD_IDS = ['lastName', 'firstName', 'dobInput', 'age', 'ageMonths', 'sex', 'weight', 'height'];
const FOOTER_PAGES = [
  'index.html', 'docpro.html', 'homa-ir.html', 'kalkulator-klirens.html',
  'steroidy.html', 'przelicznik-jednostek.html', 'cukrzyca.html',
  'materialy-edukacyjne.html', 'ustawienia.html', 'instrukcja.html',
  'genotropin-instrukcja.html', 'ngenla-instrukcja.html', 'omnitrope-instrukcja.html',
  'przelicznik-doposilkowy-instrukcja.html', 'kontakt.html', 'o-aplikacji.html',
  'polityka-prywatnosci.html', 'regulamin.html', 'subskrypcja.html',
];

async function prepare(page, { shell = false, dock = false } = {}) {
  await page.addInitScript(enabled => {
    localStorage.setItem('showMobileDock', String(enabled));
  }, dock);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol)
      ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell });
  await settle(fixture.frame);
  return fixture;
}

async function settle(owner) {
  await owner.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
  });
}

async function layout(owner) {
  return owner.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector), r = node?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } : null;
    };
    return {
      width: innerWidth, height: innerHeight, total: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - innerWidth, scroll: scrollY,
      footer: rect('footer.site-footer'), menu: rect('aside.sidebar-v2 .sidebar-inner'),
    };
  });
}

async function footerAtBottom(owner) {
  await owner.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await settle(owner);
  await expect(owner.locator('footer.site-footer')).toBeInViewport();
}

async function expectFooterLinksAvailable(owner, host = null) {
  const footer = owner.locator('footer.site-footer');
  await expect(footer.locator('.site-footer__disclaimer')).toHaveCount(0);
  await expect(footer.locator('.site-footer__col a')).toHaveCount(4);
  for (const link of await footer.locator('.site-footer__col a').all()) await expect(link).toBeVisible();
  // The subscription page deliberately uses its existing Vilda PRO destination
  // instead of Kontakt; all four links must remain usable.
  for (const name of ['O aplikacji', 'Polityka prywatności', 'Regulamin']) {
    await expect(footer.getByRole('link', { name, exact: true })).toBeVisible();
  }
  const readHits = () => footer.locator('a[href]').evaluateAll(links => links.filter(link => {
    const r = link.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }).map(link => {
    const r = link.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { text: link.textContent.trim(), x, y, width: r.width, height: r.height,
      hit: Boolean(r.width && r.height && link.contains(document.elementFromPoint(x, y))) };
  }));
  await expect.poll(async () => (await readHits()).filter(link => !link.hit), {
    message: 'każdy rzeczywisty link stopki jest dostępny ponad menu i pływającą nawigacją',
  }).toEqual([]);
  if (host) {
    // A hit test inside an iframe cannot see the host's dock. Check both layers.
    const points = await readHits();
    const obscured = await host.evaluate(links => {
      const pane = document.querySelector('iframe.app-pane:not([hidden])'), r = pane.getBoundingClientRect();
      return links.filter(link => document.elementFromPoint(r.x + link.x, r.y + link.y) !== pane).map(link => link.text);
    }, points);
    expect(obscured, 'stopka ramki pozostaje dostępna także nad dockiem powłoki').toEqual([]);
  }
  await expectFooterTextAvailable(owner, host);
}

async function expectFooterTextAvailable(owner, host) {
  // The disclaimer was deliberately removed in the approved footer. Keep the
  // stronger hit check for every remaining visible character, including wrapped
  // copyright and attribution below the links and beside the floating controls.
  const readText = () => owner.locator('.site-footer').evaluate(footer => {
    const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT), points = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.textContent.length; i++) {
        const text = node.textContent[i];
        if (/\s/.test(text)) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        if (!r.width || !r.height) continue;
        points.push({ text, x, y, hit: footer.contains(document.elementFromPoint(x, y)) });
      }
    }
    return { points, remainingScroll: document.documentElement.scrollHeight - innerHeight - scrollY };
  });
  await expect.poll(async () => {
    const { points, remainingScroll } = await readText();
    const obscured = points.filter(point => !point.hit).map(point => point.text);
    if (host) obscured.push(...await host.evaluate(characters => {
      const pane = document.querySelector('iframe.app-pane:not([hidden])'), r = pane.getBoundingClientRect();
      return characters.filter(point => document.elementFromPoint(r.x + point.x, r.y + point.y) !== pane).map(point => point.text);
    }, points));
    return { remainingScroll: Math.round(remainingScroll), obscured };
  }, { message: 'cały widoczny tekst stopki przy końcu strony jest czytelny ponad lokalną i zewnętrzną nawigacją' })
    .toEqual({ remainingScroll: 0, obscured: [] });
}

async function expectFieldsStacked(page) {
  const fields = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const node = document.getElementById(id), r = node.getBoundingClientRect(), css = getComputedStyle(node);
    return [id, { x: r.x, y: r.y, width: r.width, height: r.height, font: parseFloat(css.fontSize),
      padding: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(css[`padding${side}`])) }];
  })), FIELD_IDS);
  for (const [id, field] of Object.entries(fields)) {
    // Preserve original spacing without fixing native line-height/font metrics
    // to one runner: baseline inputs measured 42.78125px, select 43.78125px.
    for (const [side, expected] of [10.4, 13.6, 10.4, 13.6].entries()) {
      expect(field.padding[side], `${id}: oryginalny padding ${side}`).toBeCloseTo(expected, 1);
    }
    expect(field.font, `${id}: przywrócona czytelna typografia formularza`).toBeCloseTo(16.8, 1);
    expect(field.height, `${id}: tekst i padding mieszczą się w polu`).toBeGreaterThanOrEqual(field.font + field.padding[0] + field.padding[2]);
  }
  for (const [above, below] of [['lastName', 'firstName'], ['weight', 'height']]) {
    expect(fields[below].y, `${above}/${below}: osobne wiersze`).toBeGreaterThan(fields[above].y + fields[above].height);
    expect(Math.abs(fields[below].x - fields[above].x), `${above}/${below}: wspólna lewa krawędź`).toBeLessThanOrEqual(1);
    expect(Math.abs(fields[below].width - fields[above].width), `${above}/${below}: pełna jednakowa szerokość`).toBeLessThanOrEqual(1);
  }
}

test('pionowy formularz zachowuje duże pola, a niższa stopka pozostaje obok menu po przewinięciu', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepare(page);
  await expect(page.locator('#lastName')).toHaveValue('');
  await expect(page.locator('#weight')).toHaveValue('');
  const proof = [];
  for (const [width, height] of [[1280, 800], [1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height }); await settle(page);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expectFieldsStacked(page);
    if (width === 1280 || width === 1024) {
      const screenshot = testInfo.outputPath(`restored-start-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      await testInfo.attach(`restored-start-${width}.png`, { path: screenshot, contentType: 'image/png' });
    }
    await footerAtBottom(page);
    const g = await layout(page); proof.push(g);
    expect(g.footer.x, 'stopka zaczyna się za panelem').toBeGreaterThanOrEqual(g.menu.right);
    expect(g.footer.height, 'kompaktowa stopka na desktopie').toBeLessThanOrEqual(150);
    expect(Math.abs(g.footer.bottom - height), 'stopka dochodzi do dolnej krawędzi okna').toBeLessThanOrEqual(1);
    expect(Math.abs(g.menu.bottom - height), 'konto w menu nadal przy dolnej krawędzi').toBeLessThanOrEqual(1);
    expect(g.overflow).toBeLessThanOrEqual(1);
    await expectFooterLinksAvailable(page);
  }
  await testInfo.attach('restored-start-desktop.json', { body: JSON.stringify(proof), contentType: 'application/json' });
});

test('podsumowanie wczytanego pacjenta wykorzystuje wysokość przywróconego formularza', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const fixture = await prepare(page);
  await loadPatient(page, fixture.ids.a, 'restore', { clear: true });
  const summary = page.locator('#currentSummaryCard');
  await expect(summary).toBeVisible();
  await expect(summary.locator('.professional-summary-main [data-summary-key]')).toHaveCount(10);
  const before = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
  const readGeometry = () => page.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      form: rect('#userSection fieldset.user-card'), summary: rect('#currentSummaryCard'),
      content: rect('#currentSummaryContent'),
    };
  });
  const proof = [];
  for (const [width, height] of [[1280, 800], [1024, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height }); await settle(page);
    await expectFieldsStacked(page);
    await expect(summary).toHaveClass(/vilda-summary-height-matched/);
    await expect.poll(async () => {
      const g = await readGeometry();
      return Math.abs(g.form.bottom - g.summary.bottom);
    }, { message: 'podsumowanie dochodzi do dołu rzeczywistego formularza, także w niższym oknie' }).toBeLessThanOrEqual(1);
    const g = await readGeometry(); proof.push(g);
    expect(g.summary.x, 'podsumowanie pozostaje w prawej kolumnie').toBeGreaterThanOrEqual(g.form.right);
    // This real patient measured 714–747px / 533–606px in the pre-compact form.
    expect(g.summary.height, 'karta wyników zachowuje dawną przestronną wysokość').toBeGreaterThanOrEqual(700);
    expect(g.content.height, 'wyniki zachowują miejsce do czytania wewnątrz karty').toBeGreaterThanOrEqual(500);
    await expect(summary.locator('[data-summary-key="weight"]')).toHaveCSS('font-size', '15px');
  }
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a), 'zmiany wymiarów nie modyfikują dokumentacji').toEqual(before);
  await testInfo.attach('restored-summary-heights.json', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
});

test('niskie okno i rozwinięte pokwitanie przewijają treść bez utraty pól i zapisanej dokumentacji', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  const fixture = await prepare(page);
  await expect.poll(async () => (await layout(page)).total).toBeGreaterThan(650);
  await footerAtBottom(page); await expectFooterLinksAvailable(page);
  await loadPatient(page, fixture.ids.a, 'restore', { clear: true });
  await page.evaluate(ids => { window.__compactStartNodes = Object.fromEntries(ids.map(id => [id, document.getElementById(id)])); }, FIELD_IDS);
  const readValues = () => page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).value])), FIELD_IDS);
  const readRecord = () => page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
  const before = { values: await readValues(), record: await readRecord() };
  await page.locator('#tannerToggleBtn').click();
  await expect(page.locator('#tannerStageWrap')).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(async () => (await layout(page)).total).toBeGreaterThan(768);
  // A loaded patient's results replace the empty Start's inline reminders.
  // Use the real header shortcut, rather than expecting that empty-state widget.
  await page.locator('#vildaRemindersBtn').click();
  const reminders = page.locator('dialog.vb22-modal');
  await expect(reminders).toBeVisible();
  await reminders.locator('[data-tab="search"]').click();
  await reminders.locator('[data-tab="active"]').click();
  await reminders.locator('.vb22-exit').click();
  await expect(reminders).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 650 });
  await footerAtBottom(page); await expectFooterLinksAvailable(page);
  const after = await layout(page);
  expect(after.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(after.menu.bottom - 650)).toBeLessThanOrEqual(1);
  expect(await readValues(), 'przełączanie układu nie zmienia danych formularza').toEqual(before.values);
  expect(await readRecord(), 'zmiana układu nie dopisuje ani nie modyfikuje zapisów pacjenta').toEqual(before.record);
  expect(await page.evaluate(ids => ids.every(id => window.__compactStartNodes[id] === document.getElementById(id)), FIELD_IDS), 'te same węzły pól, bez utraty handlerów i stanu').toBe(true);
});

test('stopka na wszystkich 19 stronach jest obok menu, a jej linki prowadzą do prawdziwych stron', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepare(page);
  const proof = [];
  for (const path of FOOTER_PAGES) {
    await page.goto(`/${path}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaAuthUI?.isBootReady?.() && !document.documentElement.classList.contains('vilda-auth-locked'));
    const confirm = page.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
    await footerAtBottom(page);
    const g = await layout(page); proof.push({ path, ...g });
    expect(g.footer.x, `${path}: stopka poza panelem`).toBeGreaterThanOrEqual(g.menu.right);
    expect(g.overflow, `${path}: brak poziomego przewijania`).toBeLessThanOrEqual(1);
    await expectFooterLinksAvailable(page);
  }
  await page.locator('footer').getByRole('link', { name: 'Regulamin', exact: true }).click();
  await expect(page).toHaveURL(/\/regulamin\.html$/);
  await testInfo.attach('footer-all-pages.json', { body: JSON.stringify(proof), contentType: 'application/json' });
});

test('Start w ramce powłoki nie otrzymuje drugiego odsunięcia stopki o szerokość menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { frame } = await prepare(page, { shell: true });
  await footerAtBottom(frame);
  const inner = await layout(frame);
  expect(inner.footer.x, 'stopka korzysta z pełnej szerokości swojej ramki').toBeLessThanOrEqual(1);
  expect(inner.footer.width).toBeGreaterThan(inner.width - 30);
  expect(inner.overflow).toBeLessThanOrEqual(1);
  await expectFooterLinksAvailable(frame, page);
  const menu = await page.locator(MENU).boundingBox();
  expect(Math.abs(menu.y + menu.height - 900)).toBeLessThanOrEqual(1);
});

for (const profile of [{ name: 'pionowo', width: 390, height: 844 }, { name: 'poziomo', width: 844, height: 390 },
  { name: 'poziomo powyżej progu desktopu', width: 1080, height: 390 }]) {
  test.describe(`telefon ${profile.name}`, () => {
    const phone = devices['iPhone 15 Pro'];
    test.use({ viewport: { width: profile.width, height: profile.height },
      screen: { width: profile.width, height: profile.height },
      userAgent: phone.userAgent, deviceScaleFactor: phone.deviceScaleFactor,
      isMobile: phone.isMobile, hasTouch: phone.hasTouch });
    test('pełna szerokość stopki i dostępność linków ponad dockiem powłoki', async ({ page }, testInfo) => {
      const { frame } = await prepare(page, { shell: true, dock: true });
      await expect(page.locator('#mobileBottomDock')).toBeVisible();
      await expect(page.locator('#mobileBottomDock')).toBeInViewport();
      await footerAtBottom(frame);
      const g = await layout(frame);
      expect(g.footer.x).toBeLessThanOrEqual(1);
      expect(g.footer.width).toBeGreaterThan(g.width - 30);
      expect(g.overflow).toBeLessThanOrEqual(1);
      await expectFooterLinksAvailable(frame, page);
      const screenshot = testInfo.outputPath(`footer-phone-${profile.width}.png`);
      await page.screenshot({ path: screenshot });
      await testInfo.attach(`footer-phone-${profile.width}.png`, { path: screenshot, contentType: 'image/png' });
    });
  });
}
