import { expect, test } from '../support/test-czas.mjs';
import {
  STATE_KEYS, TAB_ENDED, TAB_TEST_OPTIONS, expectNoPatientAfterSignIn, openShellWithPatient, signIn, tabState,
} from '../support/bezczynnosc-karta.mjs';

// P-BEZCZYNNOSC-KARTA — pozostałe drogi blokady: ręczna zaczęta w ramce bez formularza wizyty i blokada
// z innego powodu niż bezczynność i wylogowanie. Prawdziwa powłoka, fikcyjne konto i fikcyjna pacjentka.
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

test('blokada z innego powodu w powłoce (lock("user")): po przeładowaniu ramek stan roboczy znika; po zalogowaniu nie ma pacjenta', async ({ page }) => {
  const { patientId } = await openShellWithPatient(page);
  await page.evaluate(() => { window.VildaVault.lock('user'); });
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  // Ten powód nie jest rozsyłany: ramki przeładowują się po powiadomieniu i startują zablokowane.
  await expect.poll(() => tabState(page, patientId), { timeout: 20_000 }).toEqual(TAB_ENDED);
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});
