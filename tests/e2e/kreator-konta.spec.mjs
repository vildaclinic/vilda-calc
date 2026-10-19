import { expect, test } from '@playwright/test';
import { atrapaSynchronizacji, zaakceptujRegulamin } from '../support/atrapa-synchronizacji.mjs';

// Kreator „Załóż konto” i bramka regulaminu (polecenie właściciela 2026-10-19, przegląd ścieżki zakładania konta).
//
// P-REGULAMIN-BRAMKA. vilda_terms_gate.js dodaje okno „Zanim zaczniesz” od razu po starcie strony, ale reguła
// html.vilda-auth-locked (style.css, inline_index_00.css) chowała wszystko poza nakładką logowania — także to okno.
// Pokazywało się dopiero po odblokowaniu sejfu, czyli nad krokiem 3 kreatora: konto było już założone, a pierwsze
// żądania do serwera synchronizacji wysłane, zanim użytkownik zaakceptował regulamin. Tak samo po „Korzystaj bez
// logowania”. Zmierzone na kodzie sprzed zmiany (Chromium): na ekranie „Witamy” okno w DOM, visibility: hidden;
// w kroku 3 widoczne i przechwytuje kliknięcia.
//
// P-KREATOR-KLUCZ. Krok 1 losował klucz odzyskiwania przy każdym „Dalej”. „Wstecz” z kroku 2 i ponowne „Dalej”
// dawały więc inny klucz bez ostrzeżenia, a pobrany wcześniej plik TXT nie pasował do zakładanego konta.
//
// Serwer synchronizacji to atrapa; konto, hasło i imię są fikcyjne.

const HASLO = 'Kawa-Drzewo-7-las!';
const bramka = (page) => page.locator('#vilda-terms-gate');
const zalozKontoPrzycisk = (page) => page.getByRole('button', { name: 'Załóż konto', exact: true });
const kluczOdzyskiwania = async (page) => (await page.locator('.vilda-auth-recovery-key').textContent()).trim();

async function krok1(page) {
  await page.getByPlaceholder('Twoje imię (np. dr Kowalska)').fill('dr Testowa');
  await page.getByPlaceholder('Hasło (min. 12 znaków, 3 z 4 typów)').fill(HASLO);
  await page.getByPlaceholder('Powtórz hasło').fill(HASLO);
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(page.locator('.vilda-auth-step')).toHaveText('Krok 2 z 4');
  return kluczOdzyskiwania(page);
}

/** Czy element pod środkiem lokatora należy do okna regulaminu (czyli czy okno przechwyci kliknięcie). */
const zaslanianyPrzezBramke = (lokator) => lokator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  const wierzch = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return Boolean(wierzch && wierzch.closest('#vilda-terms-gate'));
});

for (const adres of ['/index.html', '/app.html#/start']) {
  test(`${adres}: regulamin przed ekranem logowania, kreator dopiero po akceptacji`, async ({ page, context }) => {
    await atrapaSynchronizacji(context, { slotNaSerwerze: false });
    await page.goto(adres, { waitUntil: 'domcontentloaded' });
    await expect(zalozKontoPrzycisk(page)).toBeAttached({ timeout: 15_000 });

    // Sejf zamknięty, a okno regulaminu widoczne nad ekranem „Witamy” i przechwytuje kliknięcia.
    await expect(page.locator('html')).toHaveClass(/vilda-auth-locked/);
    await expect(bramka(page)).toBeVisible();
    expect(await zaslanianyPrzezBramke(zalozKontoPrzycisk(page)), '„Załóż konto” pod oknem regulaminu').toBe(true);

    await bramka(page).locator('#vtg-chk').check();
    await bramka(page).locator('#vtg-go').click();
    await expect(bramka(page)).toHaveCount(0);
    const akceptacja = await page.evaluate(() => JSON.parse(localStorage.getItem('vilda-terms-accepted-v1')));
    expect(akceptacja.version).toBe(1);
    expect(await page.evaluate(() => window.VildaVault.isUnlocked()), 'akceptacja niczego nie odblokowuje').toBe(false);

    await zalozKontoPrzycisk(page).click();
    await expect(page.locator('.vilda-auth-step')).toHaveText('Krok 1 z 4');
  });
}

test('zaakceptowany regulamin nie wraca na ekranie „Witamy”', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context, { slotNaSerwerze: false });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(zalozKontoPrzycisk(page)).toBeVisible({ timeout: 15_000 });
  await expect(bramka(page)).toHaveCount(0);
  expect(await zaslanianyPrzezBramke(zalozKontoPrzycisk(page))).toBe(false);
});

test('„Wstecz” w kroku 2 zostawia klucz odzyskiwania, a ten klucz otwiera założone konto', async ({ page, context }) => {
  test.setTimeout(90_000); // createUser i odblokowanie kluczem odzyskiwania: domyślne 600 000 iteracji PBKDF2
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context, { slotNaSerwerze: false });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKontoPrzycisk(page).click();

  const pierwszy = await krok1(page);
  expect(pierwszy).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){5}$/);
  await page.getByRole('button', { name: 'Wstecz', exact: true }).click();
  await expect(page.locator('.vilda-auth-step')).toHaveText('Krok 1 z 4');
  const drugi = await krok1(page);
  expect(drugi, 'po „Wstecz” i „Dalej” ten sam klucz co za pierwszym razem').toBe(pierwszy);

  await page.locator('.vilda-auth-checkbox-row input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nie, tylko to urządzenie' })).toBeVisible({ timeout: 30_000 });

  // Klucz z pierwszego przejścia kroku 2 (ten, który użytkownik mógł już pobrać) odblokowuje konto.
  const otwarte = await page.evaluate(async (klucz) => {
    const sejf = window.VildaVault;
    const { userId } = sejf.getCurrentUser();
    sejf.lock('manual');
    const wynik = await sejf.unlockUserWithRecoveryKey(userId, klucz);
    return wynik.userId === userId && sejf.isUnlocked();
  }, pierwszy);
  expect(otwarte).toBe(true);
});

test('„Anuluj” zaczyna od nowa: następna próba dostaje nowy klucz', async ({ page, context }) => {
  await zaakceptujRegulamin(context);
  await atrapaSynchronizacji(context, { slotNaSerwerze: false });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await zalozKontoPrzycisk(page).click();

  const pierwszy = await krok1(page);
  await page.getByRole('button', { name: 'Wstecz', exact: true }).click();
  await page.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await zalozKontoPrzycisk(page).click();
  const nowy = await krok1(page);
  expect(nowy).not.toBe(pierwszy);
  expect(await page.evaluate(async () => (await window.VildaVault.listUsers()).length), 'bez kroku 2 konta nie ma').toBe(0);
});
