import { expect, test } from '../support/test-czas.mjs';

// Rata porządkowa z audytu sekcji „Ustawienia": U4 (kłódka na sekcji logowania),
// U5 (brakująca pozycja w podnawigacji), U6 (deep-link po haszu wywracał całą obsługę linków).
//
// Service worker zablokowany z tego samego powodu co w haslo-modal-potwierdzenia.spec.mjs:
// przy pierwszej wizycie instaluje się i robi `location.reload()` na `controllerchange`,
// co przerywa nawigację testu w losowym momencie.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Nawigacja!2026aa';

// Bez konta cała `.desktop-layout` siedzi pod `html.vilda-auth-locked`. Tryb „bez logowania"
// to prawdziwa ścieżka użytkownika, który wszedł w Ustawienia nie mając konta na tym sprzęcie —
// i dokładnie ten stan opisuje U4.
async function otworzJakoGosc(page) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });
}

async function otworzZKontem(page) {
  await page.goto('/ustawienia.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  // Konto założone z konsoli nie przechodzi przez ekran logowania, więc nakładka zostaje
  // na wierzchu — wchodzimy jeszcze raz, jak przy normalnym starcie z zapamiętaną sesją.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
  await page.waitForFunction(() => {
    const root = document.getElementById('vilda-auth-ui-root');
    return !root || window.getComputedStyle(root).display === 'none';
  });
}

const zablokowana = (page, id) => page.locator(`#${id}.settings-accordion--locked`);

test.describe('U4 — kłódka na „Logowaniu na innych urządzeniach"', () => {
  test('bez konta sekcja jest zamknięta na kłódkę i nie otwiera się kliknięciem', async ({ page }) => {
    await otworzJakoGosc(page);

    await expect(zablokowana(page, 'settings-section-login'),
      'wszystkie trzy metody w tej sekcji wymagają odblokowanego sejfu').toHaveCount(1);

    const sekcja = page.locator('#settings-section-login');
    await expect(sekcja).not.toHaveAttribute('open', '');
    await sekcja.locator('summary').click();
    await expect(sekcja, 'kliknięcie w zamkniętą sekcję jej nie otwiera')
      .not.toHaveAttribute('open', '');
  });

  test('kłódka tłumaczy się użytkownikowi', async ({ page }) => {
    await otworzJakoGosc(page);
    await page.locator('#settings-section-login summary').click();
    await expect(page.locator('#settings-section-login .settings-lock-tip'))
      .toContainText('Zaloguj się');
  });

  test('sekcje działające bez konta zostają otwarte', async ({ page }) => {
    // Kontrola negatywna: kłódka nie może rozlać się na ustawienia lokalne.
    await otworzJakoGosc(page);
    for (const id of ['settings-section-appearance', 'settings-section-chart-visibility']) {
      await expect(zablokowana(page, id), `${id} nie wymaga konta`).toHaveCount(0);
    }
    const wyglad = page.locator('#settings-section-appearance');
    await wyglad.locator('summary').click();
    await expect(wyglad).toHaveAttribute('open', '');
  });

  test('po zalogowaniu kłódka znika i sekcja się otwiera', async ({ page }) => {
    await otworzZKontem(page);
    await expect(zablokowana(page, 'settings-section-login')).toHaveCount(0);
    const sekcja = page.locator('#settings-section-login');
    await sekcja.locator('summary').click();
    await expect(sekcja).toHaveAttribute('open', '');
  });
});

test.describe('U5 — pozycja „Elementy siatek" w podnawigacji', () => {
  test('link prowadzi do sekcji widoczności elementów siatek', async ({ page }) => {
    await otworzZKontem(page);
    const link = page.locator('.settings-subnav-link[data-target="settings-section-chart-visibility"]');
    await expect(link, 'sekcja bez pozycji w menu jest nie do znalezienia').toHaveCount(1);
    await expect(link).toContainText('Elementy siatek');

    await link.click();
    await expect(page.locator('#settings-section-chart-visibility')).toHaveAttribute('open', '');
  });

  test('menu wymienia wszystkie sekcje strony', async ({ page }) => {
    await otworzZKontem(page);
    const rozjazd = await page.evaluate(() => {
      const sekcje = [...document.querySelectorAll('details.settings-accordion[id^="settings-section-"]')]
        .map((d) => d.id);
      const menu = [...document.querySelectorAll('.settings-subnav-link[data-target]')]
        .map((a) => a.dataset.target);
      return sekcje.filter((id) => !menu.includes(id));
    });
    expect(rozjazd, 'sekcje bez pozycji w menu').toEqual([]);
  });
});

test.describe('U6 — deep-link po haszu', () => {
  // Hasz niebędący poprawnym selektorem CSS wywalał `querySelector(hash)`, a wyjątek leciał
  // z bloku DOMContentLoaded — razem z rejestracją nasłuchu `hashchange`. Efekt: jeden taki
  // adres wyłączał deep-linki na całą wizytę, nie tylko dla siebie.
  for (const zly of ['#3', '#!/start']) {
    test(`adres z haszem „${zly}" nie zabija linków do sekcji`, async ({ page }) => {
      const bledy = [];
      page.on('pageerror', (e) => bledy.push(String(e)));

      await page.goto(`/ustawienia.html${zly}`, { waitUntil: 'load' });
      await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
      await page.waitForFunction(
        () => !document.documentElement.classList.contains('vilda-auth-locked'),
      );

      // Właściwy pomiar: po złym haszu kolejny, poprawny deep-link ma dalej działać.
      await page.evaluate(() => { window.location.hash = 'settings-section-chart'; });
      await expect(page.locator('#settings-section-chart'),
        'nasłuch hashchange przeżył zły hasz').toHaveAttribute('open', '');

      expect(bledy.filter((b) => /openSectionFromHash|not a valid selector|SyntaxError/i.test(b)),
        'żaden wyjątek z obsługi hasza').toEqual([]);
    });
  }

  test('poprawny deep-link otwiera sekcję już przy wejściu', async ({ page }) => {
    // Kontrola dodatnia: to jest zachowanie, którego nie wolno zepsuć przy naprawie.
    await page.goto('/ustawienia.html#settings-section-chart-visibility', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
    await page.waitForFunction(
      () => !document.documentElement.classList.contains('vilda-auth-locked'),
    );
    await expect(page.locator('#settings-section-chart-visibility')).toHaveAttribute('open', '');
  });

  test('deep-link nie otwiera sekcji pod kłódką', async ({ page }) => {
    await page.goto('/ustawienia.html#settings-section-login', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Korzystaj bez logowania' }).click();
    await page.waitForFunction(
      () => !document.documentElement.classList.contains('vilda-auth-locked'),
    );
    await expect(zablokowana(page, 'settings-section-login')).toHaveCount(1);
    await expect(page.locator('#settings-section-login'),
      'link z zewnątrz nie omija bramki logowania').not.toHaveAttribute('open', '');
  });
});
