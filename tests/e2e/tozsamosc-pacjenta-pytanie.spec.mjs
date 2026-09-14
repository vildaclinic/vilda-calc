import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC-PYTAJ (zlecenie właściciela 2026-09-14) — okno „Który to pacjent?".
//
// Test jednostkowy mierzy umowę sejfu z oknem. Tutaj mierzymy to, czego on nie dosięga:
// czy okno naprawdę się pokazuje na żywej stronie, czy da się je kliknąć i czy klik
// przekłada się na rekord w sejfie.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki. Nie dotyka
// żadnego prawdziwego sejfu ani prawdziwych danych. Wszystkie dane są jednoznacznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Tozsamosc!26aa';

const BEZ_DATY = {
  name: 'Testowa Zofia',
  user: { lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 9, ageMonths: 0, weight: 30, height: 130 },
};
const Z_DATA = {
  name: 'Testowa Zofia',
  user: {
    lastName: 'Testowa', firstName: 'Zofia', sex: 'F', age: 9, ageMonths: 0,
    weight: 31, height: 131, dobISO: '2017-03-04',
  },
};

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  // Okno rejestruje się w sejfie przy starcie VildaAuthUI — bez tego test mierzyłby ciszę.
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
}

const zapisz = (page, payload, opcje) => page.evaluate(
  async ([p, o]) => (await window.VildaVault.savePatient(p, o || undefined)).patientId,
  [payload, opcje || null],
);

/* Zapis, który ZATRZYMA się na oknie: startujemy go bez czekania, klikamy, dopiero potem
   odbieramy wynik. Inaczej `page.evaluate` wisiałby do końca testu. */
async function zapiszZOknem(page, payload) {
  await page.evaluate((p) => {
    window.__wynikZapisu = window.VildaVault.savePatient(p)
      .then((r) => ({ ok: true, patientId: r.patientId, isNew: r.isNew, collision: r.collision || null }))
      .catch((e) => ({ ok: false, blad: String((e && e.message) || e), przerwany: !!(e && e.vildaSaveAborted) }));
  }, payload);
  await expect(page.locator('.vilda-auth-sheet-title', { hasText: 'Który to pacjent?' })).toBeVisible();
}

const odbierz = (page) => page.evaluate(() => window.__wynikZapisu);
const iluPacjentow = (page) => page.evaluate(async () => (await window.VildaVault.listPatients()).length);
const wersji = (page, pid) => page.evaluate(
  async (id) => (await window.VildaVault.getPatient(id)).snapshotCount, pid,
);

test.describe('Okno „Który to pacjent?"', () => {
  test('pokazuje kandydata z powodem niejednoznaczności i dopisuje do jego karty', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const stary = await zapisz(page, BEZ_DATY, { dedup: false });

    await zapiszZOknem(page, Z_DATA);

    const kandydat = page.locator('.vilda-auth-kandydat').first();
    await expect(kandydat).toBeVisible();
    await expect(kandydat).toContainText('Testowa Zofia');
    await expect(kandydat, 'lekarz ma widzieć, DLACZEGO pytamy').toContainText('bez daty urodzenia');

    await kandydat.click();
    const wynik = await odbierz(page);
    expect(wynik.ok).toBe(true);
    expect(wynik.patientId, 'pomiar ląduje w istniejącej karcie').toBe(stary);
    expect(wynik.isNew).toBe(false);
    expect(await iluPacjentow(page), 'to samo dziecko — jedna karta').toBe(1);
    expect(await wersji(page, stary)).toBe(2);
  });

  test('„To inne dziecko" zakłada osobną kartę i nie strofuje za własną decyzję', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await zapisz(page, BEZ_DATY, { dedup: false });

    await zapiszZOknem(page, Z_DATA);
    await page.getByRole('button', { name: /To inne dziecko/ }).click();

    const wynik = await odbierz(page);
    expect(wynik.ok).toBe(true);
    expect(wynik.isNew).toBe(true);
    expect(wynik.collision.rozstrzygniete).toBe(true);
    expect(wynik.collision.decyzja).toBe('nowy');
    expect(await iluPacjentow(page)).toBe(2);
  });

  test('„Anuluj zapis" nie zapisuje niczego', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    const stary = await zapisz(page, BEZ_DATY, { dedup: false });

    await zapiszZOknem(page, Z_DATA);
    await page.getByRole('button', { name: 'Anuluj zapis' }).click();

    const wynik = await odbierz(page);
    expect(wynik.ok).toBe(false);
    expect(wynik.przerwany, 'kolektor rozpoznaje to po fladze, nie po treści').toBe(true);
    expect(await iluPacjentow(page), 'żadnej nowej karty').toBe(1);
    expect(await wersji(page, stary), 'żadnej nowej wersji').toBe(1);
  });

  test('nie pyta, gdy daty urodzenia rozstrzygają same', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await zapisz(page, Z_DATA, { dedup: false });

    // Ten sam pacjent, ta sama data — dopisanie ma przejść bez żadnego okna.
    await page.evaluate((p) => {
      window.__wynikZapisu = window.VildaVault.savePatient(p)
        .then((r) => ({ ok: true, isNew: r.isNew }))
        .catch((e) => ({ ok: false, blad: String((e && e.message) || e) }));
    }, { ...Z_DATA, user: { ...Z_DATA.user, weight: 32 } });

    const wynik = await odbierz(page);
    expect(wynik.ok).toBe(true);
    expect(wynik.isNew).toBe(false);
    await expect(page.locator('.vilda-auth-sheet-title', { hasText: 'Który to pacjent?' })).toHaveCount(0);
    expect(await iluPacjentow(page)).toBe(1);
  });
});
