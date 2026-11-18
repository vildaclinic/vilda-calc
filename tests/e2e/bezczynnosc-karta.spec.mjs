import { expect, test } from '../support/test-czas.mjs';
import {
  TAB_TEST_OPTIONS, expectNoPatientAfterSignIn, expectTabEnded, openShellWithPatient, signIn, tabLocks,
  waitForTabLock, watchTabLocks,
} from '../support/bezczynnosc-karta.mjs';

// P-BEZCZYNNOSC-KARTA: jedna karta przeglądarki = jeden licznik bezczynności i jeden koniec sesji.
// Prawdziwa powłoka app.html, prawdziwy sejf, moduł konta i ramki; wyłącznie fikcyjne konto i fikcyjna
// pacjentka. Czas biegnie normalnym tempem, skrócony jest tylko limit bezczynności
// (jak w hormone-lifespan-activity.spec.mjs).
test.use(TAB_TEST_OPTIONS);
// Każdy test zakłada sejf i ładuje powłokę z trzema panelami; zapas na obciążony worker CI.
test.setTimeout(120_000);

// Limit musi być dłuższy niż kilka kroków Playwrighta na obciążonym CI (por. hormone-lifespan-activity).
const IDLE_MS = 8000;

test('R1: praca w jednej ramce podtrzymuje wszystkie dokumenty karty; dopiero bezczynność blokuje, i to całą kartę', async ({ page }) => {
  // Trzy limity pracy, potem do czterech limitów oczekiwania na blokadę.
  test.setTimeout(180_000);
  const { lab, patientId } = await openShellWithPatient(page);
  await watchTabLocks(page, { idleMs: IDLE_MS, patientId });
  // Chwila ostatniego wejścia mierzona w przeglądarce, zegarem dokumentu głównego — tym samym, którym
  // dziennik blokad mierzy chwilę blokady (zegar Node doliczałby rundy Playwrighta).
  await lab.evaluate(() => document.addEventListener('keydown',
    () => window.top.sessionStorage.setItem('__e2eLastInput', String(window.top.Date.now())), true));
  const started = Date.now();
  // Praca wyłącznie w „Jednostkach lab.” trzy razy dłużej niż limit; powłoki, Startu i Terminarza test nie dotyka.
  while (Date.now() - started < IDLE_MS * 3) {
    await lab.locator('#labValue').click();
    await lab.locator('#labValue').press('End');
    await lab.locator('#labValue').pressSequentially('1');
    await lab.locator('#labValue').press('Backspace');
    await page.waitForTimeout(700);
  }
  expect(Date.now() - started).toBeGreaterThan(IDLE_MS * 3);
  // Jeden odczyt: dziennik blokad i powrót do karty (kontrola przy wybudzeniu) w każdym dokumencie.
  // Kolejne rundy do przeglądarki zjadałyby limit bezczynności na obciążonym CI.
  const resumed = await page.evaluate(() => {
    const before = JSON.parse(sessionStorage.getItem('__e2eTabLocks') || '[]');
    const unlocked = [window, ...Array.from({ length: window.frames.length }, (_, index) => window.frames[index])].map(view => {
      view.document.dispatchEvent(new view.Event('visibilitychange'));
      view.dispatchEvent(new view.PageTransitionEvent('pageshow', { persisted: true }));
      return view.VildaVault.isUnlocked();
    });
    return { before, unlocked, after: JSON.parse(sessionStorage.getItem('__e2eTabLocks') || '[]') };
  });
  expect(resumed.before).toEqual([]);
  expect(resumed.unlocked.length).toBeGreaterThanOrEqual(4);
  expect(resumed.unlocked.every(Boolean)).toBe(true);
  expect(resumed.after).toEqual([]);
  // Od tej chwili test niczego nie dotyka: blokuje dopiero bezczynność.
  await waitForTabLock(page, IDLE_MS * 4);
  await expectTabEnded(page, patientId);
  const first = (await tabLocks(page))[0];
  expect(first.reason).toBe('idle');
  expect(first.unlockedLeft).toBe(0);
  const lastInput = Number(await page.evaluate(() => sessionStorage.getItem('__e2eLastInput')));
  // Blokada po pełnym limicie od ostatniego wejścia w ramce lab — nie od ostatniego dotknięcia innych dokumentów.
  expect(first.at - lastInput).toBeGreaterThanOrEqual(IDLE_MS - 50);
  expect(first.at - lastInput).toBeLessThan(IDLE_MS * 2);
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

// Limit skrócony tylko w ukrytej ramce Terminarz: blokada zaczyna się w dokumencie bez formularza wizyty.
async function idleLockFromHiddenFrame(page, visible) {
  const { patientId } = await openShellWithPatient(page);
  if (visible === 'start') await page.evaluate(() => window.VildaShell.navigate('start'));
  await watchTabLocks(page, { idleMs: IDLE_MS, onlyFrame: 'Terminarz', patientId });
  await waitForTabLock(page, IDLE_MS * 4);
  // W chwili pierwszej blokady: wszystkie dokumenty karty zablokowane, stan roboczy pacjentki pusty.
  const first = (await tabLocks(page))[0];
  expect({ unlockedLeft: first.unlockedLeft, patientKeys: first.patientKeys }).toEqual({ unlockedLeft: 0, patientKeys: [] });
  await expectTabEnded(page, patientId);
  expect(new Set((await tabLocks(page)).map(lock => lock.reason))).toEqual(new Set(['idle']));
  // Po blokadzie z bezczynności karta jest na samodzielnym ekranie logowania.
  await expect(page).toHaveURL(/\/index\.html$/u);
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
}

for (const visible of ['lab', 'start']) {
  test(`R2: blokada z ukrytej ramki (widoczny panel: ${visible}) blokuje i czyści całą kartę; po zalogowaniu nie ma pacjenta bez stadium`, async ({ page }) => {
    await idleLockFromHiddenFrame(page, visible);
  });
}

test('R2: „Wyloguj się” w powłoce czyści stan roboczy karty przed ekranem logowania', async ({ page }) => {
  const { patientId } = await openShellWithPatient(page);
  await watchTabLocks(page, { patientId }); // sam dziennik blokad, bez skracania limitu
  await page.locator('button.chrome-menu-logout:visible').first().click();
  await waitForTabLock(page, 20_000);
  const first = (await tabLocks(page))[0];
  expect({ reason: first.reason, patientKeys: first.patientKeys }).toEqual({ reason: 'manual', patientKeys: [] });
  await expectTabEnded(page, patientId);
  await expect(page).toHaveURL(/\/index\.html$/u);
  await signIn(page);
  await expectNoPatientAfterSignIn(page, patientId);
});

// Ten sam przebieg pięć razy: wynik nie może zależeć od kolejności ładowania skryptów i ramek.
for (const run of [1, 2, 3, 4, 5]) {
  test(`powtórzenie ${run}/5: blokada z licznika ukrytej ramki Terminarz przy widocznym lab → po ponownym zalogowaniu pacjentka wyczyszczona`, async ({ page }) => {
    await idleLockFromHiddenFrame(page, 'lab');
  });
}
