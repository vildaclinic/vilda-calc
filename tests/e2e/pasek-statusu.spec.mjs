import { expect, test } from '../support/test-czas.mjs';

// P-ZAPIS-SIATKA: zatwierdzony wariant C/C1 przenosi wynik zapisu poza układ
// formularza. Poprzedni kontrakt P-PASEK-STATUSU zachowujemy dla błędów:
// pełny powód nie gaśnie, odnośniki prowadzą do brakujących pól, chip pokazuje błąd.
// Sukces ma teraz osobny, zatwierdzony kontrakt: 5 s i trwały stan przy pacjencie.
//
// Wszystkie dane są jednoznacznie fikcyjne; test nie dotyka żadnego prawdziwego sejfu.
test.use({ serviceWorkers: 'block' });

const DESKTOP = { width: 1280, height: 900 };
const TELEFON = { width: 390, height: 780 };
const HASLO = 'E2e#PasekStatusu!26a';

async function otworz(page, rozmiar) {
  await page.setViewportSize(rozmiar);
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.collectUserData === 'function' && Boolean(window.VildaSaveFeedback));
}

/* Ta sama strona, ale za odblokowaną bramą logowania.
   BEZ TEGO pomiar widoczności nie ma sensu: dopóki nikt nie jest zalogowany, cała treść
   `index.html` stoi pod `visibility:hidden` i Playwright uznaje KAŻDY element za niewidoczny —
   także ten, który działa poprawnie. Konto jest własne, fikcyjne i żyje tylko w efemerycznym
   profilu przeglądarki; test nie dotyka żadnego prawdziwego sejfu. */
async function otworzZKontem(page, rozmiar) {
  await otworz(page, rozmiar);
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.saveUserData === 'function' && Boolean(window.VildaSaveFeedback));
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('vilda-auth-locked'),
  );
}

/* Wpisanie danych bez masy i wzrostu — zapis ma się nie udać z NAZWANEGO powodu. */
async function niepelnyFormularz(page) {
  await page.evaluate(() => {
    const ustaw = (id, v) => {
      const e = document.getElementById(id);
      if (!e) return;
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('lastName', 'Testowa');
    ustaw('firstName', 'Zofia');
    ustaw('age', '9');
    ustaw('weight', '');
    ustaw('height', '');
  });
}

const widoczny = (page, id) => page.locator('#' + id);

test.describe('Powiadomienie o wyniku zapisu', () => {
  test('na obu szerokościach wynik jest nakładką, a formularzowe paski pozostają ukryte', async ({ page }) => {
    test.setTimeout(120_000);

    await otworzZKontem(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());
    await expect(widoczny(page, 'vildaSaveFeedback'), 'wynik poza przepływem formularza').toBeVisible();
    await expect(widoczny(page, 'vildaSaveFeedback')).toHaveCSS('position', 'fixed');
    await expect(widoczny(page, 'vildaStatusSide'), 'prawa kolumna nie traci miejsca').toBeHidden();
    await expect(widoczny(page, 'vildaStatusForm'), 'formularz nie dostaje dodatkowego wiersza').toBeHidden();

    // Ta sama strona, węższe okno — zmienia się położenie nakładki, nie układ formularza.
    await page.setViewportSize(TELEFON);
    await expect(widoczny(page, 'vildaSaveFeedback')).toBeVisible();
    await expect(widoczny(page, 'vildaSaveFeedback')).toHaveClass(/is-mobile/);
    await expect(widoczny(page, 'vildaStatusForm')).toBeHidden();
    await expect(widoczny(page, 'vildaStatusSide')).toBeHidden();
  });

  test('nazywa braki, oznacza je czerwienią i prowadzi do pola', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());

    const pasek = widoczny(page, 'vildaSaveFeedback');
    await expect(pasek).toBeVisible();
    await expect(pasek).toContainText('Nie zapisano');
    await expect(pasek).toContainText('masę ciała');
    await expect(pasek).toContainText('wzrost');
    expect(await pasek.getAttribute('data-tone')).toBe('blad');

    await pasek.getByRole('button', { name: 'wzrost' }).click();
    const wKtorym = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(wKtorym, 'odnośnik prowadzi wprost do pola').toBe('height');
  });

  test('błąd NIE GAŚNIE — przyczyna odmowy pozostaje do przeczytania', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());

    const pasek = widoczny(page, 'vildaSaveFeedback');
    await expect(pasek).toContainText('Nie zapisano');
    // Dymek gasł po 2,5 s. Czekamy dłużej i sprawdzamy, że treść stoi.
    await page.waitForTimeout(4000);
    await expect(pasek, 'po 4 s pasek nadal mówi to samo').toContainText('Nie zapisano');
    expect(await pasek.getAttribute('data-tone')).toBe('blad');
  });

  test('brak zalogowania to ostrzeżenie, a nie błąd', async ({ page }) => {
    test.setTimeout(120_000);
    // Ten jeden test MUSI stać przed bramą logowania, bo tylko tam ta ścieżka istnieje.
    // Cała strona jest wtedy pod `visibility:hidden`, więc mierzymy treść i ton, nie widoczność.
    await otworz(page, DESKTOP);
    await page.evaluate(() => {
      const ustaw = (id, v) => {
        const e = document.getElementById(id);
        if (!e) return;
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      ustaw('lastName', 'Testowa'); ustaw('firstName', 'Zofia');
      ustaw('age', '9'); ustaw('weight', '30'); ustaw('height', '130');
    });
    await page.evaluate(() => window.saveUserData());

    const pasek = widoczny(page, 'vildaSaveFeedback');
    await expect(pasek).toContainText('Zaloguj się');
    expect(await pasek.getAttribute('data-tone'), 'to nie jest awaria, tylko brak sesji').toBe('uwaga');
  });

  test('nieudany zapis oznacza komunikat i chip jako błąd', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page, DESKTOP);

    // Podstawiamy sejf, który odmawia — mierzymy ścieżkę awarii w kolektorze, nie sejf.
    await page.evaluate(() => {
      window.VildaVault = {
        isUnlocked: () => true,
        savePatient: async () => { throw new Error('sejf odmówił'); },
      };
      const ustaw = (id, v) => {
        const e = document.getElementById(id);
        if (!e) return;
        e.value = v;
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      ustaw('lastName', 'Testowa'); ustaw('firstName', 'Zofia');
      ustaw('age', '9'); ustaw('weight', '30'); ustaw('height', '130');
    });
    await page.evaluate(async () => { await window.saveUserData(); });

    const pasek = widoczny(page, 'vildaSaveFeedback');
    await expect(pasek).toContainText('Nie udało się zapisać pacjenta');
    await expect(pasek).toContainText('sejf odmówił');
    expect(await pasek.getAttribute('data-tone')).toBe('blad');

    // Stan „błąd" na chipie był dotąd martwy — `c(i.ERROR)` nie było wołane ani razu.
    await expect.poll(
      () => page.evaluate(() => window.VildaSaveStatusIndicator
        && window.VildaSaveStatusIndicator.getState()),
      { message: 'chip „Pacjent" wreszcie zapala się na czerwono' },
    ).toBe('error');
  });

  test('podpowiedź wygaszonego przycisku zostaje dymkiem, nie staje się wynikiem zapisu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page, DESKTOP);

    // Kontrola pozytywna: bez próby zapisu nie ma komunikatu ani paska w formularzu.
    await expect(widoczny(page, 'vildaSaveFeedback')).toHaveCount(0);
    await expect(widoczny(page, 'vildaStatusSide')).toBeHidden();

    const pokazano = await page.evaluate(() => {
      const b = document.getElementById('saveDataBtnSidebar');
      if (!b) return 'brak przycisku';
      b.setAttribute('disabled', 'disabled');
      b.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      return document.querySelector('.menu-tooltip') ? 'dymek' : 'nic';
    });

    // Niezależnie od tego, czy dymek się pokazał, pasek ma zostać pusty: to podpowiedź
    // przy przycisku, a nie wynik zapisu.
    expect(['dymek', 'nic', 'brak przycisku']).toContain(pokazano);
    await expect(widoczny(page, 'vildaSaveFeedback'), 'tooltip nie tworzy wyniku zapisu').toHaveCount(0);
    await expect(widoczny(page, 'vildaStatusSide')).toBeHidden();
  });
});
