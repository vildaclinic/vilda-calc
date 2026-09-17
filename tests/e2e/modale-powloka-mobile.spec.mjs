import { expect, test } from '@playwright/test';

// P-MODALE (2026-09-17) na PRAWDZIWEJ powłoce app.html i PRAWDZIWYM widoku telefonu (mobile-chromium).
//
// Zgłoszenie właściciela: modale (m.in. epikryza, „Jak chronimy dane?") w trybie mobilnym wchodziły
// w konflikt z dockiem i strzałką. Pomiar pokazał, że dotyczy to TYLKO powłoki: modal otwarty
// wewnątrz iframe'a nie może zasłonić docka rodzica, więc stopka epikryzy („Anuluj / Dalej")
// lądowała pod dockiem. Na stronach bezpośrednich nakładki mają z-index ponad dockiem.
//
// Test MIERZY: (1) po otwarciu modala w iframie powłoka chowa dock i to ona jest pod palcem tam,
// gdzie leży stopka modala — a nie dock; (2) po zamknięciu dock wraca; (3) KONTROLA NEGATYWNA —
// arkusz terminarza, który sam kończy się na krawędzi docka, NIE chowa docka (to jego projekt).
// Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Modale!26p';

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  return (await page.$(`iframe.app-pane[title="${tytul}"]`)).contentFrame();
}

async function otworzPowloke(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.update === 'function');
  // baner zgody analitycznej podnosi dock o swoją wysokość — bez jego zamknięcia geometria nie jest tą z życia
  const baner = page.locator('#consent-decline');
  if (await baner.count() && await baner.isVisible()) await baner.click();
  await expect(page.locator('#mobileBottomDock')).toBeVisible({ timeout: 15000 });
  return start;
}

const dockStan = (page) => page.evaluate(() => {
  const d = document.getElementById('mobileBottomDock');
  const r = d.getBoundingClientRect();
  const cs = getComputedStyle(d);
  return { top: r.top, h: r.height, visibility: cs.visibility, klasa: document.documentElement.classList.contains('vilda-pane-modal-open') };
});

const naWierzchu = (page, x, y) => page.evaluate(([px, py]) => {
  const e = document.elementFromPoint(px, py);
  return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.closest('#mobileBottomDock') ? ' [w docku]' : '') : null;
}, [x, y]);

test('epikryza w iframie: powłoka chowa dock, stopka modala jest pod palcem; po zamknięciu dock wraca', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  const przed = await dockStan(page);
  expect(przed.h, 'kontrola: dock ma wysokość').toBeGreaterThan(30);
  expect(przed.visibility).toBe('visible');
  expect(przed.klasa, 'kontrola: bez modala nie ma klasy').toBe(false);

  await start.evaluate(() => window.VildaEpicrisisUI.show());
  await page.waitForFunction(() => document.documentElement.classList.contains('vilda-pane-modal-open'), null, { timeout: 5000 });
  const po = await dockStan(page);
  expect(po.visibility, 'dock schowany na czas modala').toBe('hidden');
  expect(po.h, 'pudełko docka zostaje (pomiary --vilda-shell-dock-h bez zmian)').toBe(przed.h);

  // stopka epikryzy leży w strefie docka — pod palcem ma być iframe (modal), nie dock
  const ramkaRect = await page.evaluate(() => document.querySelector('iframe.app-pane[title="Start"]').getBoundingClientRect().top);
  const stopka = await start.evaluate(() => {
    const ov = document.getElementById('vilda-epicrisis-overlay');
    const box = ov && [...ov.querySelectorAll('*')].find((d) => { const r = d.getBoundingClientRect(); return r.height > 80 && r.width > 150; });
    const r = box.getBoundingClientRect();
    return { bottom: r.bottom, cx: (r.left + r.right) / 2 };
  });
  expect(stopka.bottom + ramkaRect, 'kontrola: modal naprawdę sięga pod górną krawędź docka').toBeGreaterThan(przed.top + 1);
  const y = Math.min(stopka.bottom + ramkaRect - 12, przed.top + przed.h / 2);
  expect(await naWierzchu(page, stopka.cx, y), 'w strefie docka pod palcem jest iframe z modalem').toBe('iframe');

  await start.evaluate(() => window.VildaEpicrisisUI.close());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-pane-modal-open'), null, { timeout: 5000 });
  const koniec = await dockStan(page);
  expect(koniec.visibility, 'po zamknięciu dock wraca').toBe('visible');
  expect(await naWierzchu(page, 196, przed.top + przed.h / 2)).toContain('[w docku]');
});

test('„Jak chronimy dane?" w iframie — to samo, inny moduł', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page);
  await start.evaluate(() => window.VildaDataSafety.open());
  await page.waitForFunction(() => document.documentElement.classList.contains('vilda-pane-modal-open'), null, { timeout: 5000 });
  expect((await dockStan(page)).visibility).toBe('hidden');
  await start.evaluate(() => { document.querySelector('.vds-overlay').remove(); });
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-pane-modal-open'), null, { timeout: 5000 });
  expect((await dockStan(page)).visibility).toBe('visible');
});

test('kontrola negatywna: arkusz terminarza kończy się na krawędzi docka i dock ZOSTAJE', async ({ page }) => {
  test.setTimeout(150_000);
  await otworzPowloke(page);
  await page.evaluate(() => { location.hash = '#/terminarz'; });
  const tz = await ramka(page, 'Terminarz');
  await tz.waitForFunction(() => window.VildaVault.isUnlocked() && Boolean(window.VildaTerminarz) && Boolean(document.getElementById('terminarzRoot')));
  await tz.evaluate(() => { const a = document.getElementById('vilda-auth-ui-root'); if (a) a.style.display = 'none'; });
  await page.waitForTimeout(800);
  const przed = await dockStan(page);
  await tz.locator('#tzAddBtn').click();
  await tz.locator('#tzNewTermOverlay').waitFor({ state: 'attached' });
  await page.waitForTimeout(800);
  const ramkaTop = await page.evaluate(() => document.querySelector('iframe.app-pane[title="Terminarz"]').getBoundingClientRect().top);
  const arkusz = await tz.evaluate(() => document.querySelector('#tzNewTermOverlay').getBoundingClientRect().bottom);
  expect(Math.abs(arkusz + ramkaTop - przed.top), 'arkusz kończy się na górnej krawędzi docka').toBeLessThanOrEqual(2);
  const po = await dockStan(page);
  expect(po.klasa, 'terminarz nie uruchamia chowania docka').toBe(false);
  expect(po.visibility).toBe('visible');
});
