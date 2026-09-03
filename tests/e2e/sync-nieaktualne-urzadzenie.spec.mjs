import { expect, test } from '@playwright/test';

// PR 10 (2026-09-03) — ostrzeżenie o nieaktualnym urządzeniu na REALNEJ stronie ustawienia.html.
//
// Podział ról: cała logika (znacznik ostatniego scalenia, próg = okno życia tombstonów, werdykt
// dla urządzenia lokalnego i dla nadawcy payloadu) siedzi w sejfie i jest obłożona testami
// jednostkowymi w tests/unit/vault-terminarz-sync.test.mjs. vilda_sync.js tylko rozgłasza werdykt
// zdarzeniem `vilda:sync-stale-device`, a strona wyłącznie go renderuje. Ten spec pilnuje tej
// drugiej połowy — jedynego kawałka, którego testy jednostkowe nie widzą — więc werdykt jest tu
// wstrzykiwany zdarzeniem, dokładnie w kształcie, jaki zwraca sejf.

const HASLO = 'E2e#Sync!2026stale';

async function otworzUstawienia(page) {
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  await page.evaluate(() => {
    const a = document.getElementById('vilda-auth-ui-root');
    if (a) a.style.display = 'none';
  });
  await page.waitForSelector('#syncStaleWarning', { state: 'attached' });
  await page.waitForFunction(() => Boolean(document.getElementById('vildaSyncBtn')));
}

const werdykt = (nadpisz) => ({
  thresholdDays: 365,
  localLastMergeAtISO: null,
  localDays: null,
  localStale: false,
  remoteLastMergeAtISO: null,
  remoteDays: null,
  remoteStale: false,
  warn: false,
  ...nadpisz,
});

async function nadaj(page, detail) {
  await page.evaluate((d) => {
    document.dispatchEvent(new CustomEvent('vilda:sync-stale-device', { detail: d, bubbles: false }));
  }, detail);
  await page.waitForTimeout(60);
}

async function stanBanera(page) {
  return page.evaluate(() => {
    const el = document.getElementById('syncStaleWarning');
    const btn = document.getElementById('vildaSyncBtn');
    return {
      widoczny: !!el && !el.hidden,
      tekst: el ? el.textContent : null,
      stanPrzycisku: btn ? btn.getAttribute('data-sync-state') : null,
    };
  });
}

test('sejf wystawia getSyncStaleness na realnej stronie (kontrakt dla warstwy prezentacji)', async ({ page }) => {
  await otworzUstawienia(page);
  const w = await page.evaluate(async () => {
    if (typeof window.VildaVault.getSyncStaleness !== 'function') return null;
    return window.VildaVault.getSyncStaleness();
  });
  expect(w, 'getSyncStaleness jest w publicznym API sejfu').toBeTruthy();
  expect(w.thresholdDays, 'próg = okno życia tombstonów').toBe(365);
  expect(w.warn, 'świeże urządzenie nie ostrzega').toBe(false);
});

test('werdykt lokalny: baner nazywa lukę i próg, a przycisk w pasku sygnalizuje stan', async ({ page }) => {
  await otworzUstawienia(page);

  const przed = await stanBanera(page);
  expect(przed.widoczny, 'bez werdyktu baner jest schowany').toBe(false);
  expect(przed.stanPrzycisku, 'przycisk bez stanu ostrzegawczego').not.toBe('stale');

  await nadaj(page, werdykt({ localDays: 400, localStale: true, warn: true }));

  const po = await stanBanera(page);
  expect(po.widoczny, 'baner się pokazuje').toBe(true);
  expect(po.tekst).toContain('To urządzenie nie synchronizowało się od 400 dni');
  expect(po.tekst, 'baner mówi, dlaczego 400 dni to problem').toContain('365 dni');
  expect(po.tekst).toContain('nie wróciły wpisy skasowane na innym urządzeniu');
  expect(po.stanPrzycisku, 'pasek nagłówka też sygnalizuje').toBe('stale');
});

test('werdykt zdalny: odbiorca na bieżąco dowiaduje się o nieaktualnym nadawcy', async ({ page }) => {
  await otworzUstawienia(page);
  await nadaj(page, werdykt({ localDays: 0, remoteDays: 400, remoteStale: true, warn: true }));

  const po = await stanBanera(page);
  expect(po.widoczny).toBe(true);
  expect(po.tekst).toContain('Dane przyszły z urządzenia, które nie synchronizowało się od 400 dni');
  expect(po.stanPrzycisku).toBe('stale');
});

test('status „ok” po scaleniu nie zamiata ostrzeżenia, dopiero czysty werdykt je zdejmuje', async ({ page }) => {
  await otworzUstawienia(page);
  await nadaj(page, werdykt({ localDays: 400, localStale: true, warn: true }));
  expect((await stanBanera(page)).stanPrzycisku).toBe('stale');

  // vilda_sync rozgłasza werdykt PRZED zdarzeniem statusu, więc „ok” przychodzi zaraz po nim.
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', {
      detail: { state: 'ok', ts: Date.now() }, bubbles: false,
    }));
  });
  await page.waitForTimeout(60);
  const poOk = await stanBanera(page);
  expect(poOk.stanPrzycisku, 'udany sync nie kasuje ostrzeżenia o luce').toBe('stale');
  expect(poOk.widoczny, 'baner też zostaje').toBe(true);

  // Dopiero scalenie bez ostrzeżenia zdejmuje stan — ostrzeżenie nie zostaje na zawsze.
  await nadaj(page, werdykt({ localDays: 0 }));
  const poCzystym = await stanBanera(page);
  expect(poCzystym.widoczny, 'czysty werdykt chowa baner').toBe(false);
  expect(poCzystym.stanPrzycisku, 'i zdejmuje stan przycisku').not.toBe('stale');
});
