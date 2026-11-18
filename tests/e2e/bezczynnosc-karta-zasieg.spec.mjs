import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';
import { SESSION_RECORD, TAB_TEST_OPTIONS, shortenIdle, signIn, unlockedVaults } from '../support/bezczynnosc-karta.mjs';

// P-BEZCZYNNOSC-KARTA — zasięg: strona w ramce bez własnego modułu konta oraz dwie karty przeglądarki.
// Prawdziwa powłoka, fikcyjne konto; czas biegnie normalnym tempem, skrócony jest tylko limit bezczynności.
test.use(TAB_TEST_OPTIONS);
// Oba testy pracują kilka limitów bezczynności w czasie rzeczywistym; zapas na obciążony worker CI.
test.setTimeout(150_000);

const IDLE_MS = 6000;

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
  await page.waitForFunction(() => Array.from({ length: window.frames.length }, (_, index) => window.frames[index])
    .some(view => view.VildaVault?.isUnlocked()));
  expect(await shortenIdle(page, IDLE_MS)).toBeGreaterThanOrEqual(2);
  const started = Date.now();
  // Praca wyłącznie na tej stronie trzy razy dłużej niż limit.
  while (Date.now() - started < IDLE_MS * 3) {
    await homa.locator('#glucose').click();
    await homa.locator('#glucose').press('End');
    await homa.locator('#glucose').pressSequentially('1');
    await homa.locator('#glucose').press('Backspace');
    await page.waitForTimeout(700);
  }
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect((await unlockedVaults(page)).every(Boolean)).toBe(true);
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
  await second.waitForFunction(() => Array.from({ length: window.frames.length }, (_, index) => window.frames[index])
    .some(view => view.VildaVault?.isUnlocked()));
  expect(await shortenIdle(page, IDLE_MS)).toBeGreaterThanOrEqual(2);
  expect(await shortenIdle(second, IDLE_MS)).toBeGreaterThanOrEqual(2);
  const started = Date.now();
  // Praca wyłącznie w pierwszej karcie dwa i pół limitu.
  while (Date.now() - started < IDLE_MS * 2.5) {
    await lab.locator('#labValue').click();
    await lab.locator('#labValue').pressSequentially('1');
    await lab.locator('#labValue').press('Backspace');
    await page.waitForTimeout(700);
  }
  // Druga karta zablokowała się własnym licznikiem; pierwsza pracuje dalej.
  await expect(second).toHaveURL(/\/index\.html$/u);
  expect(await second.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect((await unlockedVaults(page)).every(Boolean)).toBe(true);
  expect(await page.evaluate(key => Boolean(sessionStorage.getItem(key)), SESSION_RECORD)).toBe(true);
});
