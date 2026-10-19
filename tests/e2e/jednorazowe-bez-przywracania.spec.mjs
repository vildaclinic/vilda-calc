import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

// P-JEDNORAZOWE-BEZ-PRZYWRACANIA (polecenie właściciela 2026-10-19). „Zaloguj jednorazowo” obiecuje: „Po zakończeniu
// pracy nic nie zostanie”. Zmierzone na kodzie sprzed zmiany (Chromium, profil trwały, --restore-last-session): po
// zamknięciu przeglądarki bez wylogowania i ponownym uruchomieniu przywrócona karta miała klucz sesji, kopię sejfu
// (veph:vault:adapter-v1) i stan formularzy (veph:*), a sejf był odblokowany bez hasła.
//
// Logowanie jednorazowe odtwarzamy tak, jak robi to sejf przed Ut() w unlockWithPasskeyEphemeral i
// completeQRLoginEphemeral: setEphemeralMode(true), potem konto (tu fikcyjne, createUser na magazynie w pamięci).
// Serwer synchronizacji nie jest potrzebny; żądania poza serwerem testowym są odrzucane.

const HASLO = 'Haslo-Testowe-123';

const stan = (page) => page.evaluate(() => ({
  odblokowany: Boolean(window.VildaVault && window.VildaVault.isUnlocked()),
  klucz: Boolean(sessionStorage.getItem('vilda-vault-session-v2')),
  jednorazowa: sessionStorage.getItem('vilda-ephemeral-session-v1'),
  veph: Object.keys(sessionStorage).filter((k) => k.startsWith('veph:')),
  blokada: document.documentElement.classList.contains('vilda-auth-locked'),
}));

async function zalogujJednorazowo(page) {
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI && window.VildaPersistence);
  await page.evaluate(async (haslo) => {
    window.VildaVault.setEphemeralMode(true);
    await window.VildaVault.createUser(haslo, { iterations: 1, label: 'Fikcyjna Lekarka' });
  }, HASLO);
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

const czekajNaStart = (page) => page.waitForFunction(
  () => window.VildaAuthUI && typeof window.VildaAuthUI.isBootReady === 'function' && window.VildaAuthUI.isBootReady(),
  null, { timeout: 20_000 },
);

test('zamknięcie przeglądarki bez wylogowania: po przywróceniu kart sesja jednorazowa nie wraca; F5, przejścia i „Wstecz” — jak dotąd', async ({ playwright, browserName, launchOptions, baseURL }) => {
  test.setTimeout(120_000);
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-jednorazowe-'));
  // Pełny Chromium (nie headless shell), żeby profil zapisał i przywrócił sesję przeglądarki.
  const lo = launchOptions || {};
  const opcje = (dodatkowe = []) => ({
    ...lo,
    channel: lo.executablePath ? undefined : 'chromium',
    args: [...(lo.args || []), ...dodatkowe],
    locale: 'pl-PL', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block',
  });
  const przygotuj = async (ctx) => {
    await ctx.route('**/*', (r) => (r.request().url().startsWith(baseURL) ? r.continue() : r.abort()));
    await ctx.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
  };
  let ctx = null;
  try {
    ctx = await playwright[browserName].launchPersistentContext(profil, opcje());
    await przygotuj(ctx);
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(`${baseURL}/index.html`, { waitUntil: 'load' });
    await zalogujJednorazowo(page);

    // Bez fałszywego wylogowania w tej samej karcie.
    await page.reload({ waitUntil: 'load' });
    await czekajNaStart(page);
    expect(await stan(page), 'F5').toMatchObject({ odblokowany: true, jednorazowa: '1' });
    await page.goto(`${baseURL}/ustawienia.html`, { waitUntil: 'load' });
    await czekajNaStart(page);
    expect(await stan(page), 'przejście na inną stronę').toMatchObject({ odblokowany: true, jednorazowa: '1' });
    await page.goBack({ waitUntil: 'load' });
    await czekajNaStart(page);
    const przed = await stan(page);
    expect(przed, '„Wstecz”').toMatchObject({ odblokowany: true, jednorazowa: '1' });
    expect(przed.veph.length, 'w trakcie pracy kopia sejfu jest w karcie').toBeGreaterThan(0);

    await page.waitForTimeout(1500); // przeglądarka zapisuje sesję na dysk
    await ctx.close();
    ctx = null;

    ctx = await playwright[browserName].launchPersistentContext(profil, opcje(['--restore-last-session']));
    await przygotuj(ctx);
    await expect.poll(() => ctx.pages().some((p) => p.url().startsWith(`${baseURL}/index.html`)), {
      message: 'przeglądarka przywróciła kartę aplikacji', timeout: 15_000,
    }).toBe(true);
    const przywrocona = ctx.pages().find((p) => p.url().startsWith(`${baseURL}/index.html`));
    await czekajNaStart(przywrocona);
    expect(await stan(przywrocona), 'po przywróceniu karty').toEqual({
      odblokowany: false, klucz: false, jednorazowa: null, veph: [], blokada: true,
    });
    await expect(przywrocona.getByRole('button', { name: 'Załóż konto', exact: true }), 'ekran startowy, bez listy kont z sesji jednorazowej').toBeVisible();
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    fs.rmSync(profil, { recursive: true, force: true });
  }
});

test('powłoka app.html: otwarcie panelu w ramce nie kończy sesji jednorazowej', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
  });
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  await zalogujJednorazowo(page);
  await page.evaluate(() => { location.hash = '#/ustawienia'; });
  const ramka = page.frameLocator('iframe[src*="ustawienia.html"]');
  await expect(ramka.locator('body')).toBeAttached({ timeout: 20_000 });
  const ramkaStan = await page.waitForFunction(() => {
    const f = [...document.querySelectorAll('iframe')].find((x) => (x.getAttribute('src') || '').includes('ustawienia.html'));
    const w = f && f.contentWindow;
    return w && w.VildaAuthUI && w.VildaAuthUI.isBootReady && w.VildaAuthUI.isBootReady()
      ? { odblokowany: w.VildaVault.isUnlocked(), wygasla: Boolean(w.__vildaEphemeralExpired) } : null;
  }, null, { timeout: 20_000 }).then((h) => h.jsonValue());
  expect(ramkaStan).toEqual({ odblokowany: true, wygasla: false });
  expect(await stan(page)).toMatchObject({ odblokowany: true, jednorazowa: '1' });
});
