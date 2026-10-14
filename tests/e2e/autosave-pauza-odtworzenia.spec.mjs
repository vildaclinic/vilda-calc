import { expect, test } from '../support/test-czas.mjs';

// Rzeczywiste zdarzenie użytkownika (fill), runtime i adapter produkcyjny. Minimalny
// formularz izoluje pauzę autosave od niezależnego zapisu sesji głównej aplikacji.
// Dane wyłącznie fikcyjne; bez sejfu i bez mechanizmów logowania.
test.use({ serviceWorkers: 'block' });

async function prepare(page) {
  await page.route('**/autosave-regression.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html><body><input id="age" type="number"><input id="ageMonths" type="number">
    <input id="height" type="number"><input id="weight" type="number">
    <script>window.vildaAppOnReady = function() {};</script>
    <script src="/vilda_persistence_adapter.js"></script><script src="/vilda_persist_runtime.js"></script>
    <script>window.VildaPersistRuntime.init();</script></body></html>` }));
  await page.goto('/autosave-regression.html');
  await page.evaluate(() => {
    sessionStorage.setItem('vildaCurrentPatientId', 'fictional-infant-a');
    window.VildaPersistence.writeShared({ age: '0', ageMonths: '4', height: '62', weight: '6',
      _vildaPersist: { byId: { age: '0', ageMonths: '4', height: '62', weight: '6' } } }, { force: true });
    window.vildaPersistRestoreAll();
  });
  await expect(page.locator('#ageMonths')).toHaveValue('4');
}

async function savedAge(page) {
  return page.evaluate(() => {
    const root = window.VildaPersistence.readShared();
    return [root.ageMonths, root._vildaPersist.byId.ageMonths];
  });
}

for (const force of [false, true]) {
  test(`wiek 4→3 w pauzie po restore: ${force ? 'wymuszony zapis przed końcem pauzy' : 'autosave po końcu pauzy'}`, async ({ page }) => {
    await prepare(page);
    await page.evaluate(force => window.VildaPersistence.pauseAutosave(force ? 30_000 : 1500), force);
    await page.locator('#ageMonths').fill('3');
    expect(await page.evaluate(() => window.VildaPersistence.isAutosaveSuppressed())).toBe(true);
    if (force) {
      await page.evaluate(() => window.vildaPersistFlushNow({ force: true }));
      expect(await savedAge(page)).toEqual(['3', '3']);
    } else {
      expect(await savedAge(page)).toEqual(['4', '4']);
      await expect.poll(() => savedAge(page)).toEqual(['3', '3']);
    }
    await page.evaluate(() => window.vildaPersistRestoreAll());
    await expect(page.locator('#ageMonths')).toHaveValue('3');
  });
}

test('oczekująca edycja pacjenta A nie trafia do stanu pacjenta B', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => window.VildaPersistence.pauseAutosave(30_000));
  await page.locator('#ageMonths').fill('3');
  await page.evaluate(() => {
    sessionStorage.setItem('vildaCurrentPatientId', 'fictional-infant-b');
    window.VildaPersistence.writeShared({ age: '0', ageMonths: '8', height: '70', weight: '8',
      _vildaPersist: { byId: { age: '0', ageMonths: '8', height: '70', weight: '8' } } }, { force: true });
    window.vildaPersistFlushNow({ force: true });
    window.vildaPersistRestoreAll();
  });
  await expect(page.locator('#ageMonths')).toHaveValue('8');
  expect(await savedAge(page)).toEqual(['8', '8']);
});

for (const width of [1440, 390]) {
  test(`formularz Start ${width}px: wymuszony zapis edycji w pauzie przetrwa przeładowanie`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    });
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort());
    await page.goto('/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaPersistRuntime?.getSnapshot().initialized && !window.__vildaPersistRestoring);
    await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).click();
    await expect(page.locator('#ageMonths')).toBeVisible();
    const consent = page.locator('#consent-decline');
    if (await consent.isVisible()) await consent.click();
    await page.waitForFunction(() => {
      const state = window.vildaGetPersistAutosaveCoalescingSnapshot();
      return !window.VildaPersistence.isClearInProgress() && !state.hasPendingSaveTimer && !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
    });
    await page.evaluate(() => {
      window.VildaPersistence.writeShared({ age: '0', ageMonths: '4', height: '62', weight: '6',
        _vildaPersist: { byId: { age: '0', ageMonths: '4', height: '62', weight: '6' } } }, { force: true });
      window.vildaPersistRestoreAll();
      window.VildaPersistence.pauseAutosave(30_000);
    });
    await expect(page.locator('#ageMonths')).toHaveValue('4');
    await page.locator('#ageMonths').fill('3');
    expect(await page.evaluate(() => window.VildaPersistence.isAutosaveSuppressed())).toBe(true);
    await page.evaluate(() => window.vildaPersistFlushNow({ force: true }));
    expect(await savedAge(page)).toEqual(['3', '3']);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.VildaPersistRuntime?.getSnapshot().initialized && !window.__vildaPersistRestoring);
    await expect(page.locator('#ageMonths')).toHaveValue('3');
    expect(await savedAge(page)).toEqual(['3', '3']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
