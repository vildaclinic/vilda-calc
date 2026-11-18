import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, shellFrame } from '../support/centile-live-fixture.mjs';
import {
  SESSION_RECORD, TAB_TEST_OPTIONS, expectNoPatientAfterSignIn, openShellWithPatient, signIn, startForm, tabState,
} from '../support/bezczynnosc-karta.mjs';

// P-BEZCZYNNOSC-KARTA — przepływy, których zmiana nie może naruszyć (odświeżenie przy odblokowanym sejfie,
// gość → logowanie), pojedyncze zdarzenie aktywności oraz start karty po terminie sesji.
// Prawdziwa powłoka app.html, fikcyjne konto i fikcyjna pacjentka; czas biegnie normalnym tempem.
test.use(TAB_TEST_OPTIONS);
test.setTimeout(120_000);

test('F5 przy odblokowanym sejfie zachowuje pacjentkę razem z oceną Th', async ({ page }) => {
  await openShellWithPatient(page);
  await page.reload({ waitUntil: 'load' });
  const start = await startForm(page);
  await expect(start.locator('#lastName')).toHaveValue('Zmyslona');
  await expect.poll(() => start.evaluate(() => {
    const carrier = window.VildaPubertyAssessmentState.capture();
    const user = window.collectUserData({ source: 'e2e' }).user || {};
    return { present: carrier.present, th: user.pubertyAssessment?.observations?.Th?.stage ?? null };
  })).toEqual({ present: true, th: 4 });
  // Ramki dociągane w tle odtwarzają sesję chwilę po dokumencie głównym.
  await expect.poll(() => page.evaluate(() => [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]
    .filter(view => view.VildaVault).every(view => view.VildaVault.isUnlocked()))).toBe(true);
});

test('jeden prawdziwy klawisz w ramce odświeża każdy dokument karty dokładnie raz; zdarzenie syntetyczne zostaje lokalne', async ({ page }) => {
  const { lab } = await openShellWithPatient(page);
  // Licznik wywołań resetIdleTimer w każdym dokumencie karty z odblokowanym sejfem.
  await page.evaluate(() => {
    window.__e2eResets = {};
    for (const view of [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])]) {
      const vault = view.VildaVault;
      if (!vault?.isUnlocked()) continue;
      const name = view.location.pathname;
      window.__e2eResets[name] = 0;
      const original = vault.resetIdleTimer;
      vault.resetIdleTimer = function (...args) { window.top.__e2eResets[name] += 1; return original.apply(this, args); };
    }
  });
  const zero = () => page.evaluate(() => { for (const key of Object.keys(window.__e2eResets)) window.__e2eResets[key] = 0; });
  await lab.locator('#labValue').focus();
  await zero();
  await page.keyboard.press('End');
  const real = await page.evaluate(() => ({ ...window.__e2eResets }));
  expect(Object.keys(real).length).toBeGreaterThanOrEqual(4);
  // Każdy dokument raz: zdarzenie dociera do wszystkich i nie wraca echem.
  expect(Object.values(real).every(count => count === 1)).toBe(true);
  await zero();
  await lab.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true })));
  const synthetic = await page.evaluate(() => ({ ...window.__e2eResets }));
  expect(synthetic['/przelicznik-jednostek.html']).toBe(1);
  expect(Object.entries(synthetic).filter(([name]) => name !== '/przelicznik-jednostek.html').every(([, count]) => count === 0)).toBe(true);
});

test('karta odświeżona po terminie sesji: stan roboczy znika przed logowaniem, także gdy skrypt formularza dochodzi późno', async ({ page, context }) => {
  const { patientId } = await openShellWithPatient(page);
  expect((await tabState(page, patientId)).withPatient.length).toBeGreaterThan(0);
  // Termin zapisu sesji w karcie przesunięty w przeszłość: po odświeżeniu sesja nie zostanie odtworzona.
  await page.evaluate(key => {
    const record = JSON.parse(sessionStorage.getItem(key));
    record.expiresAtISO = new Date(Date.now() - 60_000).toISOString();
    sessionStorage.setItem(key, JSON.stringify(record));
  }, SESSION_RECORD);
  // Skrypt formularza (z jego resetem) dochodzi długo po starcie modułu konta.
  const delayed = [];
  await context.route('**/vilda_data_import_export.js*', async route => {
    delayed.push(route.request().url());
    await new Promise(done => { setTimeout(done, 2500); });
    await route.continue();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  // Powłoka dociąga formularz Start w tle; jego skrypt jest już w drodze, gdy sprawdzany jest stan karty.
  await expect.poll(() => delayed.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => {
    const state = await tabState(page, patientId);
    return { keys: state.keys, withPatient: state.withPatient };
  }, { timeout: 20_000 }).toEqual({ keys: [], withPatient: [] });
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  // Zdjęcie opóźnienia czeka na odpowiedzi będące w drodze: żadne wstrzymane żądanie nie zostaje bez odpowiedzi.
  await context.unrouteAll({ behavior: 'wait' });
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

test('gość w powłoce → „Zaloguj się” → logowanie: dane wpisane przez gościa zostają', async ({ page }) => {
  // Konto istnieje, ale karta pracuje bez logowania.
  await createFictionalVault(page, { shell: true });
  await page.evaluate(() => window.VildaVault.lock('manual'));
  await expect(page).toHaveURL(/\/index\.html$/u);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await expect(guest).toBeVisible();
  await guest.click();
  await page.waitForFunction(() => window.VildaGuestMode === true && !document.documentElement.classList.contains('vilda-auth-locked'));
  const start = await shellFrame(page);
  const guestInFrame = start.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await start.waitForFunction(() => window.VildaAuthUI?.isBootReady());
  if (await guestInFrame.isVisible()) await guestInFrame.click();
  await start.waitForFunction(() => window.VildaGuestMode === true && typeof window.collectUserData === 'function'
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  // Wejście w tryb gościa czyści formularz i na chwilę wstrzymuje autozapis; wpisujemy dopiero po tym oknie.
  await start.waitForFunction(() => !window.__vildaPersistRestoring && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused() && !window.VildaPersistence.isAutosaveSuppressed());
  await start.locator('#lastName').fill('Goscinny');
  await start.locator('#firstName').fill('Fikcyjny');
  await start.locator('#age').fill('31');
  await start.locator('#height').fill('171');
  await start.locator('#weight').fill('71');
  await start.locator('#weight').press('Tab');
  await expect.poll(() => page.evaluate(() => /Goscinny/.test(String(sessionStorage.getItem('vildaMainSessionV1')))), { timeout: 20_000 }).toBe(true);
  const cleared = [];
  await page.exposeFunction('__e2eGuestCleared', source => cleared.push(source));
  await start.evaluate(() => window.addEventListener('vilda:user-state-cleared', event => window.top.__e2eGuestCleared(event.detail?.source || '')));
  await page.locator('button.chrome-menu-logout:visible').first().click();
  await expect(page.locator('#vilda-auth-ui-root')).toBeVisible();
  await signIn(page);
  await startForm(page);
  // Okno na ewentualne czyszczenie po zalogowaniu: asercje niżej stwierdzają, że żadne nie zaszło.
  await page.waitForTimeout(3000);
  // Stan roboczy gościa zostaje w pamięci karty; żaden krok końca sesji go nie czyści.
  expect(await page.evaluate(() => {
    const raw = String(sessionStorage.getItem('vildaMainSessionV1'));
    return { name: /Goscinny/.test(raw), height: /171/.test(raw) };
  })).toEqual({ name: true, height: true });
  expect(cleared).toEqual([]);
  expect(await (await shellFrame(page)).evaluate(() => ({ lastName: document.getElementById('lastName').value,
    age: document.getElementById('age').value, height: document.getElementById('height').value })))
    .toEqual({ lastName: 'Goscinny', age: '31', height: '171' });
});
