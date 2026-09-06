import { expect, test } from '../support/test-czas.mjs';

// U2b: zmiana hasła jest zdarzeniem bezpieczeństwa, a sygnalizowaliśmy ją etykietą tekstową
// w karcie Ustawień. Na urządzeniu zmieniającym łatwo ją przeoczyć, na urządzeniu odbierającym
// widać ją dopiero wtedy, gdy ktoś sam wejdzie w sekcję konta. Teraz obie strony dostają modal
// z wymaganym potwierdzeniem.
//
// Te testy jadą po prawdziwej stronie Ustawień, na prawdziwym sejfie i prawdziwym module
// logowania (vilda_auth_ui.js jest wspólny dla wszystkich ośmiu stron aplikacji).

// Service worker jest tu zablokowany celowo. Przy pierwszej wizycie instaluje się i wywołuje
// `location.reload()` na `controllerchange` (ios26-ui.js) — zmierzone: to przeładowanie
// przerywało nawigację testu w losowym momencie. Przeładowanie potrzebne temu testowi robimy
// sami, jawnie, w miejscu, w którym ma sens.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Modal!2026aa';
const NOWE = 'E2e#Modal!2026bb';
const MODAL = '.vilda-auth-overlay-password';
const ARKUSZ = '.vilda-auth-sheet-password';

async function otworzUstawienia(page) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  // Konto założone z konsoli nie przechodzi przez ekran logowania, więc nakładka zostaje na
  // wierzchu. Wchodzimy na stronę jeszcze raz — to normalny start aplikacji z zapamiętaną
  // sesją, czyli dokładnie ta ścieżka, na której modal ma się pokazać.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  // Nakładka logowania znika chwilę po zdjęciu klasy i do tego czasu przechwytuje kliknięcia.
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });
}

// Sygnał o cudzej zmianie zapisuje sejf przy scalaniu (mierzone w testach jednostkowych).
// Tu interesuje nas druga połowa drogi: czy warstwa logowania podniesie zaległy sygnał,
// kiedy zmiana przyszła przy zamkniętej aplikacji. Zamknięcie i otwarcie sejfu to ta sama
// ścieżka co start aplikacji, bez przeładowania strony.
async function podrzucSygnalIOtworzPonownie(page, znacznik) {
  await page.evaluate((iso) => {
    window.VildaPersistence.writePreferenceRaw('PASSWORD_CHANGED_REMOTELY_AT', iso, { force: true });
    // Powód inny niż „manual"/„idle" — te dwa przenoszą przeglądarkę na index.html.
    window.VildaVault.lock('sync');
  }, znacznik);
  await page.waitForFunction(() => !window.VildaVault.isUnlocked());
  await page.evaluate(async (pw) => {
    const uzytkownicy = await window.VildaVault.listUsers();
    await window.VildaVault.unlockUser(uzytkownicy[0].userId, pw);
  }, HASLO);
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
}

test.describe('Modal po zmianie hasła — urządzenie zmieniające', () => {
  test('po zmianie hasła wyskakuje modal, którego nie da się przeoczyć', async ({ page }) => {
    await otworzUstawienia(page);
    await page.evaluate(
      async ([stare, nowe]) => window.VildaVault.changePassword(stare, nowe),
      [HASLO, NOWE],
    );

    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator(`${ARKUSZ} .vilda-auth-sheet-title`))
      .toHaveText('Hasło zmienione dla całego konta');
    await expect(page.locator(`${ARKUSZ} .vilda-auth-password-warning`),
      'modal mówi, czego zmiana hasła NIE robi')
      .toContainText('logowaniem biometrycznym');
  });

  test('kliknięcie w tło nie zamyka modala — potwierdzenie jest wymagane', async ({ page }) => {
    await otworzUstawienia(page);
    await page.evaluate(
      async ([stare, nowe]) => window.VildaVault.changePassword(stare, nowe),
      [HASLO, NOWE],
    );
    await expect(page.locator(MODAL)).toBeVisible();

    // Punkt w lewym górnym rogu nakładki jest poza arkuszem w obu układach (dolny arkusz
    // na wąskim ekranie, wyśrodkowany na szerokim).
    await page.locator(MODAL).click({ position: { x: 5, y: 5 } });
    await expect(page.locator(MODAL), 'nakładka nie jest przyciskiem „zamknij"').toBeVisible();

    await page.getByRole('button', { name: 'Rozumiem' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });
});

test.describe('Modal po zmianie hasła — urządzenie odbierające', () => {
  test('sygnał z chmury podnosi modal przy otwarciu sejfu', async ({ page }) => {
    await otworzUstawienia(page);
    await podrzucSygnalIOtworzPonownie(page, '2026-09-05T20:15:00.000Z');

    await expect(page.locator(MODAL)).toBeVisible();
    await expect(page.locator(`${ARKUSZ} .vilda-auth-sheet-title`))
      .toHaveText('Hasło do konta zostało zmienione');
    await expect(page.locator(`${ARKUSZ} .vilda-auth-sheet-body`), 'modal podaje datę zmiany')
      .toContainText('2026');
    await expect(page.locator(`${ARKUSZ} .vilda-auth-password-warning`),
      'to jest sygnał bezpieczeństwa, nie informacja porządkowa')
      .toContainText('Jeśli to nie była Twoja zmiana');
  });

  test('potwierdzenie gasi sygnał, więc modal nie wraca przy kolejnym otwarciu', async ({ page }) => {
    await otworzUstawienia(page);
    await podrzucSygnalIOtworzPonownie(page, '2026-09-05T20:15:00.000Z');
    await expect(page.locator(MODAL)).toBeVisible();

    await page.getByRole('button', { name: 'Rozumiem' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect(
      await page.evaluate(() => window.VildaPersistence.readPreferenceRaw('PASSWORD_CHANGED_REMOTELY_AT', null)),
      'ślad wygaszony',
    ).toBeFalsy();

    // Kolejne otwarcie sejfu — bez nowego sygnału modal ma się już nie pokazać.
    await page.evaluate(() => { window.VildaVault.lock('sync'); });
    await page.waitForFunction(() => !window.VildaVault.isUnlocked());
    await page.evaluate(async (pw) => {
      const uzytkownicy = await window.VildaVault.listUsers();
      await window.VildaVault.unlockUser(uzytkownicy[0].userId, pw);
    }, HASLO);
    await page.waitForFunction(() => window.VildaVault.isUnlocked());
    await expect(page.locator(MODAL), 'potwierdzone raz — nie wraca').toHaveCount(0);
  });

  test('„Wyloguj wszystkie urządzenia" prowadzi wprost do procedury w sekcji konta', async ({ page }) => {
    await otworzUstawienia(page);
    await podrzucSygnalIOtworzPonownie(page, '2026-09-05T20:15:00.000Z');
    await expect(page.locator(MODAL)).toBeVisible();

    await page.getByRole('button', { name: 'Wyloguj wszystkie urządzenia' }).click();

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('#settings-section-account'), 'sekcja konta rozwinięta')
      .toHaveAttribute('open', '');
    await expect(page.locator('#revokeDevicesPwInput'), 'kursor od razu w polu potwierdzenia')
      .toBeFocused();
  });
});

test.describe('Modal na wąskim ekranie nie bije się z nawigacją', () => {
  // Właściciel wprost o to prosił: na telefonie na dole ekranu siedzi dock, a nad nim
  // strzałka „do góry" — dokładnie tam, gdzie modal stawia swoje przyciski.
  test('dock i strzałka nawigacyjna znikają na czas modala i wracają po nim', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzUstawienia(page);

    const widoczny = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const st = window.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
    }, sel);

    await expect.poll(() => widoczny('#mobileBottomDock'),
      { message: 'kontrola dodatnia: bez modala dock jest na ekranie', timeout: 15000 }).toBe(true);

    await page.evaluate(
      async ([stare, nowe]) => window.VildaVault.changePassword(stare, nowe),
      [HASLO, NOWE],
    );
    await expect(page.locator(MODAL)).toBeVisible();

    expect(await widoczny('#mobileBottomDock'), 'dock schowany na czas modala').toBe(false);
    expect(await widoczny('#scrollTopBtn'), 'strzałka nawigacyjna schowana na czas modala').toBe(false);

    await page.getByRole('button', { name: 'Rozumiem' }).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect.poll(() => widoczny('#mobileBottomDock'),
      { message: 'dock wraca po zamknięciu modala', timeout: 15000 }).toBe(true);
  });

  test('oba przyciski mieszczą się w ekranie telefonu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await otworzUstawienia(page);
    await page.evaluate(
      async ([stare, nowe]) => window.VildaVault.changePassword(stare, nowe),
      [HASLO, NOWE],
    );
    await expect(page.locator(MODAL)).toBeVisible();

    for (const nazwa of ['Rozumiem', 'Wyloguj wszystkie urządzenia']) {
      const przycisk = page.getByRole('button', { name: nazwa });
      await expect(przycisk).toBeVisible();
      const p = await przycisk.boundingBox();
      expect(p, `przycisk „${nazwa}" ma pudełko`).not.toBeNull();
      expect(p.y + p.height, `przycisk „${nazwa}" nie wychodzi poza dolną krawędź ekranu`)
        .toBeLessThanOrEqual(844);
      expect(p.y, `przycisk „${nazwa}" nie wychodzi ponad górną krawędź`).toBeGreaterThanOrEqual(0);
    }
  });
});
