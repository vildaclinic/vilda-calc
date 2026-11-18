import { expect, test } from '../support/test-czas.mjs';
import { shellFrame } from '../support/centile-live-fixture.mjs';
import {
  HOMA_REF, STATE_KEYS, TAB_ENDED, TAB_TEST_OPTIONS, expectNoPatientAfterSignIn, expectTabEnded, openShellWithPatient, signIn,
  tabLocks, tabState, waitForTabLock, watchTabLocks,
} from '../support/bezczynnosc-karta.mjs';

// P-BEZCZYNNOSC-KARTA — pozostałe drogi blokady: ręczna zaczęta w ramce bez formularza wizyty, blokada
// z innego powodu niż bezczynność i wylogowanie, panel HOMA-IR otwarty w sesji oraz przewinięcie panelu
// między jego blokadą a przeładowaniem powłoki. Prawdziwa powłoka, fikcyjne konto i fikcyjna pacjentka.
test.use(TAB_TEST_OPTIONS);
test.setTimeout(120_000);

test('blokada ręczna zaczęta w ramce bez formularza: karta zostaje w powłoce z ekranem logowania, stan roboczy znika od razu', async ({ page }) => {
  const { calendar, patientId } = await openShellWithPatient(page);
  const navigated = page.waitForEvent('framenavigated', { predicate: current => current === page.mainFrame() });
  // Stan karty odczytany w tym samym zadaniu co blokada i zapisany w pamięci karty: dokument główny zaraz
  // się przeładuje, a odpowiedź z ramki mogłaby nie zdążyć przed jej wymianą.
  await calendar.evaluate(keys => {
    window.VildaVault.lock();
    const top = window.top;
    top.sessionStorage.setItem('__e2eAtLock', JSON.stringify({
      keys: keys.filter(key => top.sessionStorage.getItem(key) != null),
      unlockedFrames: Array.from({ length: top.frames.length }, (_, index) => top.frames[index])
        .filter(view => { try { return view.VildaVault?.isUnlocked(); } catch (_) { return false; } }).length,
    }));
  }, STATE_KEYS).catch(() => {});
  await navigated;
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  // W chwili blokady: pamięć karty bez stanu roboczego, żadna ramka nie zostaje odblokowana.
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('__e2eAtLock')))).toEqual({ keys: [], unlockedFrames: 0 });
  // Dokument główny zostaje w powłoce i pokazuje własny ekran logowania.
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  const state = await tabState(page, patientId);
  expect({ keys: state.keys, withPatient: state.withPatient }).toEqual({ keys: [], withPatient: [] });
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

test('blokada z innego powodu w powłoce (lock("user")): po przeładowaniu ramek stan roboczy znika, także gdy skrypt formularza dochodzi późno; po zalogowaniu nie ma pacjenta', async ({ page, context }) => {
  const { patientId } = await openShellWithPatient(page);
  // Skrypt formularza (z jego resetem) dochodzi do przeładowanej ramki długo po starcie modułu konta.
  // Trasa zostaje do końca testu, wyłączane jest samo opóźnienie: zdjęcie trasy w trakcie ładowania
  // dokumentów mogłoby zostawić ich żądania bez odpowiedzi.
  const delayed = [];
  let delay = 2500;
  await context.route('**/vilda_data_import_export.js*', async route => {
    delayed.push(route.request().url());
    if (delay) await new Promise(done => { setTimeout(done, delay); });
    await route.continue();
  });
  await page.evaluate(() => { window.VildaVault.lock('user'); });
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  // Ten powód nie jest rozsyłany: ramki przeładowują się po powiadomieniu i startują zablokowane.
  await expect.poll(() => delayed.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => tabState(page, patientId), { timeout: 20_000 }).toEqual(TAB_ENDED);
  delay = 0;
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

test('panel HOMA-IR otwarty w sesji: po „Wyloguj się” jego znacznik pacjenta jest pusty już w chwili blokady', async ({ page }) => {
  const { patientId } = await openShellWithPatient(page);
  await page.evaluate(() => window.VildaShell.navigate('homa'));
  const homa = await shellFrame(page, 'HOMA-IR');
  await homa.waitForFunction(() => window.VildaVault.isUnlocked() && document.getElementById('glucose'));
  // Punkt wyjścia: panel zapamiętał w pamięci karty, dla kogo są jego pola.
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), HOMA_REF)).toBeTruthy();
  await watchTabLocks(page, { patientId }); // sam dziennik blokad, bez skracania limitu
  await page.locator('button.chrome-menu-logout:visible').first().click();
  await waitForTabLock(page, 20_000);
  const first = (await tabLocks(page))[0];
  expect({ reason: first.reason, unlockedLeft: first.unlockedLeft, patientKeys: first.patientKeys })
    .toEqual({ reason: 'manual', unlockedLeft: 0, patientKeys: [] });
  await expectTabEnded(page, patientId);
  expect(await page.evaluate(key => sessionStorage.getItem(key), HOMA_REF)).toBe('');
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

// Między blokadą zaczętą w panelu a przeładowaniem powłoki mija chwila; przewinięcie tego panelu jej nie zmienia.
for (const reason of ['manual', 'user']) {
  test(`blokada (${reason}) zaczęta w panelu Start: przewinięcie tego panelu przed przeładowaniem powłoki nie przedłuża sesji karty`, async ({ page, context }) => {
    const { start, patientId } = await openShellWithPatient(page);
    await page.evaluate(() => window.VildaShell.navigate('start'));
    // Panel przewinięty w dół, jak przy pracy z dłuższym formularzem.
    await start.evaluate(() => window.scrollTo(0, 200));
    await expect.poll(() => start.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // Powłoka sama nie miała wejścia dłużej, niż sejf odświeża zapis sesji karty (60 s).
    await page.clock.fastForward(61_000);
    // Przeładowanie powłoki trwa: odpowiedź dochodzi z opóźnieniem. Trasa zostaje do końca testu
    // (zdjęcie jej w trakcie ładowania nowego dokumentu mogłoby zostawić jego żądania bez odpowiedzi).
    await context.route('**/app.html*', async route => {
      await new Promise(done => { setTimeout(done, 2500); });
      await route.continue();
    });
    const navigated = page.waitForEvent('framenavigated', { predicate: current => current === page.mainFrame(), timeout: 30_000 });
    // Blokada w panelu i powrót widoku na górę — jak po skróceniu wyczyszczonego formularza. Przeglądarka
    // wysyła wtedy zdarzenie przewinięcia w już zablokowanym panelu; znacznik w pamięci karty przeżywa
    // przeładowanie powłoki.
    await start.evaluate(why => {
      document.addEventListener('scroll', event => {
        if (event.isTrusted && !window.VildaVault.isUnlocked()) sessionStorage.setItem('__e2eScrollAfterLock', '1');
      }, true);
      window.VildaVault.lock(why);
      window.scrollTo(0, 0);
    }, reason);
    await navigated;
    await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
    expect(await page.evaluate(() => sessionStorage.getItem('__e2eScrollAfterLock'))).toBe('1');
    // Karta zostaje w powłoce z ekranem logowania: wszystkie dokumenty zablokowane, bez zapisu sesji.
    await expect.poll(() => tabState(page, patientId), { timeout: 20_000 }).toEqual(TAB_ENDED);
    expect(new URL(page.url()).pathname).toBe('/app.html');
    await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  });
}
