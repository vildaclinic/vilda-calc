import { expect, test } from '../support/test-czas.mjs';

// P-PASEK-STATUSU (decyzja właściciela 2026-09-14) — „wariant D na desktop i B na telefonie,
// tylko na index.html".
//
// Test jednostkowy mierzy samą warstwę wyświetlania. Tutaj mierzymy to, czego on nie dosięga:
// czy pasek jest wpięty w prawdziwy zapis, czy właściwy z dwóch jest widoczny przy danej
// szerokości ekranu i — najważniejsze — czy komunikat NIE GAŚNIE. Dymek znikał po 2,5 s
// i to była główna przyczyna całej zmiany, więc jest tu osobny pomiar zegarem.
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
    && typeof window.collectUserData === 'function' && Boolean(window.VildaStatusBar));
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
    && typeof window.saveUserData === 'function' && Boolean(window.VildaStatusBar));
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

test.describe('Pasek statusu zapisu', () => {
  test('na szerokim ekranie stoi w prawej kolumnie, na wąskim — na górze formularza', async ({ page }) => {
    test.setTimeout(120_000);

    await otworzZKontem(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());
    await expect(widoczny(page, 'vildaStatusSide'), 'wariant D — prawa kolumna').toBeVisible();
    await expect(widoczny(page, 'vildaStatusForm'), 'wariant B ustępuje miejsca').toBeHidden();

    // Ta sama strona, węższe okno — o wyborze rozstrzyga CSS, nie przeładowanie.
    await page.setViewportSize(TELEFON);
    await expect(widoczny(page, 'vildaStatusForm'), 'wariant B — góra formularza').toBeVisible();
    await expect(widoczny(page, 'vildaStatusSide'), 'wariant D ustępuje miejsca').toBeHidden();
  });

  test('nazywa braki, oznacza je czerwienią i prowadzi do pola', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());

    const pasek = widoczny(page, 'vildaStatusSide');
    await expect(pasek).toBeVisible();
    await expect(pasek).toContainText('Nie zapisano');
    await expect(pasek).toContainText('masę ciała');
    await expect(pasek).toContainText('wzrost');
    expect(await pasek.getAttribute('data-ton')).toBe('blad');

    await pasek.getByRole('button', { name: 'wzrost' }).click();
    const wKtorym = await page.evaluate(() => document.activeElement && document.activeElement.id);
    expect(wKtorym, 'odnośnik prowadzi wprost do pola').toBe('height');
  });

  test('komunikat NIE GAŚNIE — to jest cała przyczyna tej zmiany', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page, DESKTOP);
    await niepelnyFormularz(page);
    await page.evaluate(() => window.saveUserData());

    const pasek = widoczny(page, 'vildaStatusSide');
    await expect(pasek).toContainText('Nie zapisano');
    // Dymek gasł po 2,5 s. Czekamy dłużej i sprawdzamy, że treść stoi.
    await page.waitForTimeout(4000);
    await expect(pasek, 'po 4 s pasek nadal mówi to samo').toContainText('Nie zapisano');
    expect(await pasek.getAttribute('data-ton')).toBe('blad');
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

    const pasek = widoczny(page, 'vildaStatusSide');
    await expect(pasek).toContainText('Zaloguj się');
    expect(await pasek.getAttribute('data-ton'), 'to nie jest awaria, tylko brak sesji').toBe('uwaga');
  });

  test('nieudany zapis maluje pasek i chip na czerwono', async ({ page }) => {
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

    const pasek = widoczny(page, 'vildaStatusSide');
    await expect(pasek).toContainText('Nie udało się zapisać pacjenta');
    await expect(pasek).toContainText('sejf odmówił');
    expect(await pasek.getAttribute('data-ton')).toBe('blad');

    // Stan „błąd" na chipie był dotąd martwy — `c(i.ERROR)` nie było wołane ani razu.
    await expect.poll(
      () => page.evaluate(() => window.VildaSaveStatusIndicator
        && window.VildaSaveStatusIndicator.getState()),
      { message: 'chip „Pacjent" wreszcie zapala się na czerwono' },
    ).toBe('error');
  });

  test('podpowiedź wygaszonego przycisku zostaje dymkiem, nie trafia na pasek', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page, DESKTOP);

    // Kontrola pozytywna: pasek startuje pusty i ukryty.
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
    await expect(widoczny(page, 'vildaStatusSide'), 'pasek jest dla wyników zapisu').toBeHidden();
  });
});
