import { expect, test } from '@playwright/test';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';

// P-BEZCZYNNOSC-KARTA — zasięg: strona w ramce bez własnego modułu konta oraz dwie karty przeglądarki.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);

const IDLE_MS = 6000;
const PASSWORD = 'E2e#SiatkaNowyPomiar!2026';
const shorten = (page, ms) => page.evaluate(timeout => {
  let count = 0;
  for (const view of [window, ...Array.from({ length: frames.length }, (_, i) => frames[i])]) {
    const vault = view.VildaVault;
    if (!vault?.isUnlocked()) continue;
    vault.DEFAULT_IDLE_LOCK_MS = timeout; vault.startIdleTimer(timeout); count += 1;
  }
  return count;
}, ms);
const unlocked = page => page.evaluate(() => [window, ...Array.from({ length: frames.length }, (_, i) => frames[i])]
  .filter(view => { try { return view.VildaVault; } catch (_) { return false; } }).map(view => view.VildaVault.isUnlocked()));
async function signIn(page) {
  const login = page.locator('#vilda-auth-ui-root');
  await login.getByRole('button', { name: /Fikcyjny sejf testu panelu siatek/ }).click();
  await login.locator('input[type=password]').fill(PASSWORD);
  await login.getByRole('button', { name: 'Zaloguj się', exact: true }).click();
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}

test('strona w ramce bez własnego modułu konta (otwarta przed zalogowaniem) podtrzymuje sesję karty; bezczynność blokuje', async ({ page }) => {
  await createFictionalVault(page, { shell: true });
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(page).toHaveURL(/\/index\.html$/u);
  await page.goto('/app.html#/homa', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  await signIn(page);
  const homa = page.frame({ url: /\/homa-ir\.html/u });
  await homa.waitForSelector('#glucose');
  // Punkt wyjścia: strona otwarta przed zalogowaniem nie ma własnego modułu konta ani sejfu.
  expect(await homa.evaluate(() => ({ auth: Boolean(window.VildaAuthUI), vault: Boolean(window.VildaVault) }))).toEqual({ auth: false, vault: false });
  await page.waitForFunction(() => Array.from({ length: frames.length }, (_, i) => frames[i]).some(view => view.VildaVault?.isUnlocked()));
  expect(await shorten(page, IDLE_MS)).toBeGreaterThanOrEqual(2);
  const started = Date.now();
  while (Date.now() - started < IDLE_MS * 3) {
    await homa.locator('#glucose').click();
    await homa.locator('#glucose').press('End');
    await homa.locator('#glucose').type('1');
    await homa.locator('#glucose').press('Backspace');
    await page.waitForTimeout(700);
  }
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect((await unlocked(page)).every(Boolean)).toBe(true);
  // Prawdziwa bezczynność blokuje całą kartę.
  await expect(page).toHaveURL(/\/index\.html$/u, { timeout: IDLE_MS * 4 });
  await page.waitForFunction(() => window.VildaVault && !window.VildaVault.isUnlocked());
});

test('dwie karty: praca w jednej nie podtrzymuje drugiej, a blokada drugiej nie blokuje pierwszej', async ({ page, context }) => {
  await createFictionalVault(page, { shell: true });
  await page.evaluate(() => window.VildaShell.navigate('lab'));
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI && document.getElementById('labValue'));
  const second = await context.newPage();
  await second.goto('/app.html#/start', { waitUntil: 'load' });
  await second.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  await signIn(second);
  await shellFrame(second);
  await second.waitForFunction(() => Array.from({ length: frames.length }, (_, i) => frames[i]).some(view => view.VildaVault?.isUnlocked()));
  expect(await shorten(page, IDLE_MS)).toBeGreaterThanOrEqual(2);
  expect(await shorten(second, IDLE_MS)).toBeGreaterThanOrEqual(2);
  const started = Date.now();
  while (Date.now() - started < IDLE_MS * 2.5) {
    await lab.locator('#labValue').click();
    await lab.locator('#labValue').type('1');
    await lab.locator('#labValue').press('Backspace');
    await page.waitForTimeout(700);
  }
  // Druga karta zablokowała się własnym licznikiem; pierwsza pracuje dalej.
  await expect(second).toHaveURL(/\/index\.html$/u);
  expect(await second.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect((await unlocked(page)).every(Boolean)).toBe(true);
  expect(await page.evaluate(() => Boolean(sessionStorage.getItem('vilda-vault-session-v2')))).toBe(true);
});
